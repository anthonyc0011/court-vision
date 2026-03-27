import json
import re
import sqlite3
import time
from pathlib import Path

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_FILE = BASE_DIR / "ALL_NBA_PLAYERS_with_headshots.xlsx"
DB_PATH = BASE_DIR / "quiz_web_backend" / "quiz_web.db"
HEADSHOT_DIR = BASE_DIR / "headshots"
LOGO_DIR = BASE_DIR / "school_logos"

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
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
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
    count: int = 10
    daily: bool = False
    date: str | None = None
    mode: str = "Practice"
    conference: str = "All"


class AnswerCheckRequest(BaseModel):
    answer: str
    accepted_answers: list[str]


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/players")
def players(count: int = 10):
    df = load_dataframe()
    sample = df.sample(n=min(count, len(df))).to_dict("records")
    return {"players": [build_question_payload(row, df) for row in sample]}


@app.get("/api/meta")
def meta():
    df = load_dataframe()
    conferences = sorted({str(item).strip() for item in df["Conference"].dropna().tolist()})
    return {"conferences": ["All"] + conferences}


@app.get("/api/daily-challenge")
def daily_challenge(count: int = 10, date: str | None = None):
    df = load_dataframe()
    if date is None:
        date = time.strftime("%Y-%m-%d")
    seed = int(date.replace("-", ""))
    sample = df.sample(n=min(count, len(df)), random_state=seed).to_dict("records")
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
    count = min(payload.count, len(df))
    if payload.daily:
        date = payload.date or time.strftime("%Y-%m-%d")
        seed = int(date.replace("-", ""))
        sample = df.sample(n=count, random_state=seed).to_dict("records")
        return {"date": date, "questions": [build_question_payload(row, df) for row in sample]}
    sample = df.sample(n=count).to_dict("records")
    return {"questions": [build_question_payload(row, df) for row in sample]}


@app.post("/api/check-answer")
def check_answer(payload: AnswerCheckRequest):
    normalized = normalize_answer(payload.answer)
    accepted = {normalize_answer(item) for item in payload.accepted_answers}
    return {"correct": normalized in accepted}


@app.get("/api/leaderboard")
def leaderboard(limit: int = 20):
    with get_conn() as conn:
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
                1 if entry.daily else 0,
            ),
        )
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
        conn.execute(
            """
            INSERT INTO profiles (username, payload) VALUES (?, ?)
            ON CONFLICT(username) DO UPDATE SET payload=excluded.payload
            """,
            (profile.username.strip() or "Guest", json.dumps(payload)),
        )
    return {"saved": True}


app.mount("/assets/headshots", StaticFiles(directory=str(HEADSHOT_DIR)), name="headshots")
app.mount("/assets/school_logos", StaticFiles(directory=str(LOGO_DIR)), name="school_logos")
