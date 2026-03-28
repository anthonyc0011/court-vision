import json
import os
import random
import re
import sqlite3
import time
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - local sqlite mode works without psycopg
    psycopg = None
    dict_row = None


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_FILE = BASE_DIR / "ALL_NBA_PLAYERS_with_headshots.xlsx"
DB_PATH = BASE_DIR / "quiz_web_backend" / "quiz_web.db"
HEADSHOT_DIR = BASE_DIR / "headshots"
LOGO_DIR = BASE_DIR / "school_logos"
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
USING_POSTGRES = DATABASE_URL.startswith("postgres")

if not USING_POSTGRES:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
HEADSHOT_DIR.mkdir(parents=True, exist_ok=True)
LOGO_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="NBA Quiz Web API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ONLINE_MATCHES: dict[str, dict] = {}


def normalize_name(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(text).strip().lower()).strip("_")


def normalize_answer(text: str) -> str:
    text = str(text).strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[.,'\"()/-]", " ", text)
    text = re.sub(r"\bsaint\b", "st", text)
    text = re.sub(r"\buniversity\b", "", text)
    text = re.sub(r"\bthe\b", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def load_dataframe():
    df = pd.read_excel(DATA_FILE)
    df["College / Last School"] = df["College / Last School"].fillna("None")
    df = df[df["College / Last School"].str.lower() != "none"].copy()
    return df


def choose_random_records(df: pd.DataFrame, count: int | None = None) -> list[dict]:
    records = df.to_dict("records")
    randomizer = random.SystemRandom()
    randomizer.shuffle(records)
    if count is None:
        return records
    return records[: min(count, len(records))]


def generate_room_code(length: int = 6) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    chooser = random.SystemRandom()
    while True:
        code = "".join(chooser.choice(alphabet) for _ in range(length))
        if code not in ONLINE_MATCHES:
            return code


def build_choices(df: pd.DataFrame, correct_college: str) -> list[str]:
    colleges = sorted({str(item).strip() for item in df["College / Last School"].dropna().tolist()})
    wrong = [college for college in colleges if normalize_answer(college) != normalize_answer(correct_college)]
    sample = wrong[:]
    import random
    picked = random.sample(sample, min(3, len(sample)))
    choices = picked + [correct_college]
    random.shuffle(choices)
    return choices


def get_answer_variants(row) -> list[str]:
    variants = {normalize_answer(row["College / Last School"])}
    for column in ("Accepted Answers", "Aliases", "Alternate Names"):
        if column in row and pd.notna(row[column]):
            raw = str(row[column])
            for part in re.split(r"[;,|]", raw):
                if part.strip():
                    variants.add(normalize_answer(part.strip()))
    alias_map = {
        "uconn": "connecticut",
        "ucla": "california los angeles",
        "usc": "southern california",
        "lsu": "louisiana state",
        "tcu": "texas christian",
        "byu": "brigham young",
    }
    normalized = normalize_answer(row["College / Last School"])
    if normalized in alias_map:
        variants.add(alias_map[normalized])
    return sorted(variants)


def build_question_payload(row, df: pd.DataFrame):
    school = str(row["College / Last School"]).strip()
    logo_name = f"{normalize_name(school)}.png"
    headshot_file = str(row.get("Headshot File", "")).strip() if row.get("Headshot File") else ""
    return {
        "player_name": row["Player Name"],
        "college": school,
        "conference": row["Conference"],
        "headshot": f"/assets/headshots/{headshot_file}" if headshot_file else None,
        "logo": f"/assets/school_logos/{logo_name}" if (LOGO_DIR / logo_name).exists() else None,
        "choices": build_choices(df, school),
        "accepted_answers": get_answer_variants(row),
    }


def get_conn():
    if USING_POSTGRES:
        if psycopg is None:
            raise RuntimeError("DATABASE_URL is set, but psycopg is not installed.")
        return psycopg.connect(DATABASE_URL, row_factory=dict_row)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def as_bool(value: bool):
    return value if USING_POSTGRES else (1 if value else 0)


def init_db():
    with get_conn() as conn:
        if USING_POSTGRES:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS leaderboard_entries (
                    id BIGSERIAL PRIMARY KEY,
                    username TEXT NOT NULL,
                    score INTEGER NOT NULL,
                    accuracy DOUBLE PRECISION NOT NULL,
                    mode TEXT NOT NULL,
                    run_date TEXT NOT NULL,
                    daily BOOLEAN NOT NULL DEFAULT FALSE
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS profiles (
                    username TEXT PRIMARY KEY,
                    payload TEXT NOT NULL
                )
                """
            )
        else:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS leaderboard_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    score INTEGER NOT NULL,
                    accuracy REAL NOT NULL,
                    mode TEXT NOT NULL,
                    run_date TEXT NOT NULL,
                    daily INTEGER NOT NULL DEFAULT 0
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS profiles (
                    username TEXT PRIMARY KEY,
                    payload TEXT NOT NULL
                )
                """
            )
        conn.commit()


class LeaderboardEntry(BaseModel):
    username: str
    score: int
    accuracy: float
    mode: str
    daily: bool = False


class ProfilePayload(BaseModel):
    username: str
    theme: str = "Arena Blue"
    settings: dict | None = None


class QuizRequest(BaseModel):
    count: int | None = 10
    daily: bool = False
    date: str | None = None
    mode: str = "Practice"
    conference: str = "All"


class AnswerCheckRequest(BaseModel):
    answer: str
    accepted_answers: list[str]


class OnlineMatchCreateRequest(BaseModel):
    username: str
    count: int | None = 10
    conference: str = "All"
    answer_mode: str = "typed"
    show_headshots: bool = True


class OnlineMatchJoinRequest(BaseModel):
    room_code: str
    username: str


@app.on_event("startup")
def startup():
    init_db()


def build_online_match_questions(count: int | None, conference: str) -> list[dict]:
    df = load_dataframe()
    if conference and conference != "All":
        df = df[df["Conference"] == conference].copy()
    if df.empty:
        df = load_dataframe()
    sample = choose_random_records(df, count)
    return [build_question_payload(row, df) for row in sample]


def get_online_room(room_code: str) -> dict:
    room = ONLINE_MATCHES.get(room_code.upper())
    if not room:
        raise HTTPException(status_code=404, detail="Match not found.")
    return room


async def send_ws(websocket: WebSocket, payload: dict):
    await websocket.send_json(payload)


async def broadcast_room(room: dict, payload: dict):
    disconnected = []
    for username, websocket in room["connections"].items():
        try:
            await websocket.send_json(payload)
        except Exception:
            disconnected.append(username)
    for username in disconnected:
        room["connections"].pop(username, None)


def summarize_online_scores(room: dict) -> dict:
    return {player: room["scores"].get(player, 0) for player in room["players"] if player}


def serialize_online_question(room: dict) -> dict | None:
    if room["current_index"] >= len(room["questions"]):
        return None
    question = dict(room["questions"][room["current_index"]])
    question.pop("accepted_answers", None)
    return question


async def start_online_match_if_ready(room: dict):
    players = [player for player in room["players"] if player]
    if room["started"] or len(players) < 2:
        return
    if not all(player in room["connections"] for player in players):
        return

    room["started"] = True
    room["current_index"] = 0
    room["round_submissions"] = {}
    await broadcast_room(
        room,
        {
            "type": "match_started",
            "room_code": room["room_code"],
            "players": players,
            "scores": summarize_online_scores(room),
            "current_index": 0,
            "total_questions": len(room["questions"]),
            "question": serialize_online_question(room),
            "answer_mode": room["answer_mode"],
        },
    )


async def finalize_online_round(room: dict):
    current_question = room["questions"][room["current_index"]]
    results = room["round_submissions"]
    next_index = room["current_index"] + 1
    finished = next_index >= len(room["questions"])
    room["current_index"] = next_index
    room["round_submissions"] = {}

    payload = {
        "type": "round_complete",
        "room_code": room["room_code"],
        "players": [player for player in room["players"] if player],
        "scores": summarize_online_scores(room),
        "current_index": next_index,
        "total_questions": len(room["questions"]),
        "correct_answer": current_question["college"],
        "round_results": results,
        "finished": finished,
        "question": None if finished else serialize_online_question(room),
    }

    if finished:
        players = payload["players"]
        if len(players) == 2:
            first_score = room["scores"].get(players[0], 0)
            second_score = room["scores"].get(players[1], 0)
            if first_score == second_score:
                payload["winner"] = None
            else:
                payload["winner"] = players[0] if first_score > second_score else players[1]

    await broadcast_room(room, payload)


async def handle_online_submission(room: dict, username: str, answer: str, skipped: bool):
    if not room["started"] or room["current_index"] >= len(room["questions"]):
        return
    if username in room["round_submissions"]:
        return

    current_question = room["questions"][room["current_index"]]
    accepted = {normalize_answer(item) for item in current_question["accepted_answers"]}
    normalized_answer = normalize_answer(answer)
    correct = False if skipped else normalized_answer in accepted

    room["round_submissions"][username] = {
        "answer": answer,
        "correct": correct,
        "skipped": skipped,
    }
    if correct:
        room["scores"][username] = room["scores"].get(username, 0) + 1

    if len(room["round_submissions"]) < 2:
        websocket = room["connections"].get(username)
        if websocket:
            await send_ws(websocket, {"type": "waiting_for_opponent"})
        return

    await finalize_online_round(room)


@app.get("/api/health")
def health():
    return {"ok": True, "online_rooms": len(ONLINE_MATCHES)}


@app.post("/api/online-match/create")
def create_online_match(payload: OnlineMatchCreateRequest):
    room_code = generate_room_code()
    username = payload.username.strip() or "Host"
    ONLINE_MATCHES[room_code] = {
        "room_code": room_code,
        "players": [username, None],
        "connections": {},
        "questions": build_online_match_questions(payload.count, payload.conference),
        "scores": {username: 0},
        "current_index": 0,
        "round_submissions": {},
        "started": False,
        "answer_mode": payload.answer_mode,
        "show_headshots": payload.show_headshots,
        "conference": payload.conference,
        "created_at": time.time(),
    }
    return {"room_code": room_code, "player_name": username}


@app.post("/api/online-match/join")
def join_online_match(payload: OnlineMatchJoinRequest):
    room = get_online_room(payload.room_code)
    username = payload.username.strip() or "Guest"
    players = room["players"]

    if players[1] and players[1] != username:
        raise HTTPException(status_code=409, detail="This match is already full.")
    if username == players[0]:
        raise HTTPException(status_code=409, detail="Use a different username from the host.")

    room["players"][1] = username
    room["scores"].setdefault(username, 0)
    return {"room_code": room["room_code"], "player_name": username, "host": players[0]}


@app.get("/api/players")
def players(count: int | None = 10):
    df = load_dataframe()
    sample = choose_random_records(df, count)
    return {"players": [build_question_payload(row, df) for row in sample]}


@app.get("/api/meta")
def meta():
    df = load_dataframe()
    conferences = sorted({str(item).strip() for item in df["Conference"].dropna().tolist()})
    return {"conferences": ["All"] + conferences}


@app.get("/api/daily-challenge")
def daily_challenge(count: int | None = 10, date: str | None = None):
    df = load_dataframe()
    if date is None:
        date = time.strftime("%Y-%m-%d")
    seed = int(date.replace("-", ""))
    effective_count = len(df) if count is None else min(count, len(df))
    sample = df.sample(n=effective_count, random_state=seed).to_dict("records")
    return {
        "date": date,
        "players": [build_question_payload(row, df) for row in sample],
    }


@app.post("/api/quiz")
def quiz(payload: QuizRequest):
    df = load_dataframe()
    if payload.conference and payload.conference != "All":
        df = df[df["Conference"] == payload.conference].copy()
    if df.empty:
        df = load_dataframe()
    count = len(df) if payload.count is None else min(payload.count, len(df))
    if payload.daily:
        date = payload.date or time.strftime("%Y-%m-%d")
        seed = int(date.replace("-", ""))
        sample = df.sample(n=count, random_state=seed).to_dict("records")
        return {"date": date, "questions": [build_question_payload(row, df) for row in sample]}
    sample = choose_random_records(df, count)
    return {"questions": [build_question_payload(row, df) for row in sample]}


@app.post("/api/check-answer")
def check_answer(payload: AnswerCheckRequest):
    normalized = normalize_answer(payload.answer)
    accepted = {normalize_answer(item) for item in payload.accepted_answers}
    return {"correct": normalized in accepted}


@app.get("/api/leaderboard")
def leaderboard(limit: int = 20):
    with get_conn() as conn:
        if USING_POSTGRES:
            rows = conn.execute(
                """
                SELECT username, score, accuracy, mode, run_date, daily
                FROM leaderboard_entries
                ORDER BY score DESC, accuracy DESC, id ASC
                LIMIT %s
                """,
                (limit,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT username, score, accuracy, mode, run_date, daily
                FROM leaderboard_entries
                ORDER BY score DESC, accuracy DESC, id ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
    return {"entries": [dict(row) for row in rows]}


@app.post("/api/leaderboard")
def post_leaderboard(entry: LeaderboardEntry):
    with get_conn() as conn:
        if USING_POSTGRES:
            conn.execute(
                """
                INSERT INTO leaderboard_entries (username, score, accuracy, mode, run_date, daily)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    entry.username.strip() or "Guest",
                    entry.score,
                    entry.accuracy,
                    entry.mode,
                    time.strftime("%Y-%m-%d"),
                    as_bool(entry.daily),
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO leaderboard_entries (username, score, accuracy, mode, run_date, daily)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    entry.username.strip() or "Guest",
                    entry.score,
                    entry.accuracy,
                    entry.mode,
                    time.strftime("%Y-%m-%d"),
                    as_bool(entry.daily),
                ),
            )
        conn.commit()
    return {"saved": True}


@app.get("/api/profiles")
def profiles():
    with get_conn() as conn:
        rows = conn.execute("SELECT username, payload FROM profiles ORDER BY username ASC").fetchall()
    result = []
    for row in rows:
        payload = json.loads(row["payload"])
        result.append({"username": row["username"], **payload})
    return {"profiles": result}


@app.post("/api/profiles")
def post_profile(profile: ProfilePayload):
    payload = {"theme": profile.theme, "settings": profile.settings or {}}
    with get_conn() as conn:
        if USING_POSTGRES:
            conn.execute(
                """
                INSERT INTO profiles (username, payload) VALUES (%s, %s)
                ON CONFLICT(username) DO UPDATE SET payload=excluded.payload
                """,
                (profile.username.strip() or "Guest", json.dumps(payload)),
            )
        else:
            conn.execute(
                """
                INSERT INTO profiles (username, payload) VALUES (?, ?)
                ON CONFLICT(username) DO UPDATE SET payload=excluded.payload
                """,
                (profile.username.strip() or "Guest", json.dumps(payload)),
            )
        conn.commit()
    return {"saved": True}


@app.websocket("/ws/matches/{room_code}")
async def online_match_socket(websocket: WebSocket, room_code: str, username: str):
    room = ONLINE_MATCHES.get(room_code.upper())
    normalized_username = username.strip() or "Guest"
    if not room or normalized_username not in room["players"]:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    room["connections"][normalized_username] = websocket

    opponent = next((player for player in room["players"] if player and player != normalized_username), None)
    await send_ws(
        websocket,
        {
            "type": "room_joined",
            "room_code": room["room_code"],
            "player_name": normalized_username,
            "opponent_name": opponent,
            "waiting": not room["started"],
            "scores": summarize_online_scores(room),
        },
    )

    if opponent and opponent in room["connections"]:
        await start_online_match_if_ready(room)

    try:
        while True:
            payload = await websocket.receive_json()
            event_type = payload.get("type")
            if event_type == "submit_answer":
                await handle_online_submission(room, normalized_username, str(payload.get("answer", "")), skipped=False)
            elif event_type == "skip_question":
                await handle_online_submission(room, normalized_username, "", skipped=True)
    except WebSocketDisconnect:
        room["connections"].pop(normalized_username, None)
        remaining = [player for player in room["players"] if player and player in room["connections"]]
        if remaining:
            await broadcast_room(room, {"type": "opponent_left", "message": f"{normalized_username} left the match."})
        else:
            ONLINE_MATCHES.pop(room["room_code"], None)


app.mount("/assets/headshots", StaticFiles(directory=str(HEADSHOT_DIR)), name="headshots")
app.mount("/assets/school_logos", StaticFiles(directory=str(LOGO_DIR)), name="school_logos")
