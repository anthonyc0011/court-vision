import json
import os
import random
import re
import sqlite3
import time
import base64
import hashlib
import hmac
import secrets
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

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
ANALYTICS_ADMIN_KEY = os.getenv("ANALYTICS_ADMIN_KEY", "").strip()
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
SESSION_SECRET = os.getenv("SESSION_SECRET", "").strip()
USING_POSTGRES = DATABASE_URL.startswith("postgres")

if not USING_POSTGRES:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
HEADSHOT_DIR.mkdir(parents=True, exist_ok=True)
LOGO_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="NBA Quiz Web API")
ALLOWED_ORIGINS = [
    "https://courtvision.cc",
    "https://www.courtvision.cc",
    "https://api.courtvision.cc",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

ONLINE_MATCHES: dict[str, dict] = {}
QUESTION_STORE: dict[str, dict] = {}
QUESTION_TTL_SECONDS = 60 * 60 * 6
HIDDEN_LEADERBOARD_USERNAMES = {"ant", "test", "guest"}
RANKED_QUEUE: list[dict] = []
RANKED_PENDING_MATCHES: dict[str, str] = {}
RANKED_MATCHES: dict[str, dict] = {}
RANKED_DIVISIONS = [
    ("Blacktop", 0),
    ("Gym", 200),
    ("Varsity", 500),
    ("Conference", 900),
    ("Bracket", 1400),
    ("Final Four", 2000),
    ("Champion", 2800),
    ("Dynasty", 3800),
]
RANKED_QUESTION_COUNT = 25
RANKED_WIN_ELO = 30
RANKED_LOSS_ELO = 10
CONFERENCE_ALIASES = {
    "AAC": "American Athletic Conference",
    "The American": "American Athletic Conference",
    "C-USA": "Conference USA",
    "MVC": "Missouri Valley Conference",
    "WCC": "West Coast Conference",
}


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


def normalize_conference_name(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return "None"
    return CONFERENCE_ALIASES.get(text, text)


def load_dataframe():
    df = pd.read_excel(DATA_FILE, keep_default_na=False)
    for column in ("Player Name", "College / Last School", "Conference", "Headshot File"):
        if column in df.columns:
            df[column] = df[column].astype(str).str.strip()
    df["College / Last School"] = df["College / Last School"].replace({"": "None"})
    df["Conference"] = df["Conference"].apply(normalize_conference_name)
    df.loc[df["College / Last School"].str.lower() == "none", "Conference"] = "None"
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


def sanitize_room_code(raw_code: str | None) -> str:
    if not raw_code:
        return ""
    cleaned = re.sub(r"[^A-Z0-9]", "", str(raw_code).upper())
    return cleaned[:12]


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
        "question_id": register_question_data(row),
        "player_name": row["Player Name"],
        "conference": row["Conference"],
        "headshot": f"/assets/headshots/{headshot_file}" if headshot_file else None,
        "logo": f"/assets/school_logos/{logo_name}" if (LOGO_DIR / logo_name).exists() else None,
        "choices": build_choices(df, school),
    }


def cleanup_question_store():
    now = time.time()
    expired = [key for key, value in QUESTION_STORE.items() if now - value.get("created_at", now) > QUESTION_TTL_SECONDS]
    for key in expired:
        QUESTION_STORE.pop(key, None)


def register_question_data(row) -> str:
    cleanup_question_store()
    question_id = secrets.token_urlsafe(16)
    QUESTION_STORE[question_id] = {
        "created_at": time.time(),
        "player_name": row["Player Name"],
        "college": str(row["College / Last School"]).strip(),
        "conference": str(row["Conference"]).strip(),
        "accepted_answers": get_answer_variants(row),
    }
    return question_id


def get_registered_question(question_id: str) -> dict:
    cleanup_question_store()
    question = QUESTION_STORE.get(question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Question expired. Please start a new quiz.")
    return question


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


def b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def sign_session_payload(payload: dict) -> str:
    if not SESSION_SECRET:
        raise HTTPException(status_code=503, detail="Session secret is not configured.")
    payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    payload_part = b64url_encode(payload_json)
    signature = hmac.new(SESSION_SECRET.encode(), payload_part.encode(), hashlib.sha256).digest()
    return f"{payload_part}.{b64url_encode(signature)}"


def verify_session_token(token: str | None) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Missing auth token.")
    if not SESSION_SECRET:
        raise HTTPException(status_code=503, detail="Session secret is not configured.")
    try:
        payload_part, signature_part = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid auth token.") from exc

    expected_sig = hmac.new(SESSION_SECRET.encode(), payload_part.encode(), hashlib.sha256).digest()
    actual_sig = b64url_decode(signature_part)
    if not hmac.compare_digest(expected_sig, actual_sig):
        raise HTTPException(status_code=401, detail="Invalid auth token.")

    payload = json.loads(b64url_decode(payload_part).decode())
    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="Session expired.")
    return payload


def get_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    prefix = "Bearer "
    if authorization.startswith(prefix):
        return authorization[len(prefix):].strip()
    return None


def require_authenticated_user(authorization: str | None) -> dict:
    return verify_session_token(get_bearer_token(authorization))


def normalized_profile_username(value: str | None) -> str:
    return str(value or "").strip().lower()


def google_account_username(row: dict) -> str:
    payload = json.loads(row["payload"] or "{}")
    return str(payload.get("username") or row.get("display_name") or row.get("email") or "").strip()


def collect_profile_rows() -> tuple[list[dict], list[dict]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT username, payload FROM profiles ORDER BY username ASC").fetchall()
        google_rows = conn.execute(
            "SELECT google_sub, email, display_name, picture, payload FROM google_accounts ORDER BY display_name ASC"
        ).fetchall()
    return rows, google_rows


def build_profile_collection(include_hidden: bool = False) -> list[dict]:
    rows, google_rows = collect_profile_rows()
    result = []
    for row in rows:
        payload = json.loads(row["payload"])
        result.append({"username": row["username"], **payload})
    for row in google_rows:
        payload = json.loads(row["payload"] or "{}")
        result.append(
            {
                "username": payload.get("username") or row["display_name"] or row["email"] or "Player",
                "auth_provider": "google",
                "auth_id": f"google:{row['google_sub']}",
                "picture": row["picture"],
                **payload,
            }
        )

    def sort_strength(item: dict) -> tuple:
        progress = item.get("progress") or {}
        xp = int(progress.get("xp") or 0)
        best_score = int(progress.get("bestScore") or 0)
        is_google = 1 if item.get("auth_provider") == "google" else 0
        return (is_google, xp, best_score)

    deduped: dict[str, dict] = {}
    for item in result:
        visible_username = normalized_profile_username(item.get("username"))
        if not include_hidden and visible_username in HIDDEN_LEADERBOARD_USERNAMES:
            continue
        key = str(item.get("auth_id") or item.get("username") or "").strip().lower()
        if not key:
            continue
        existing = deduped.get(key)
        if existing is None or sort_strength(item) > sort_strength(existing):
            deduped[key] = item

    return list(deduped.values())


def google_username_taken(username: str, ignore_google_sub: str | None = None) -> bool:
    _, google_rows = collect_profile_rows()
    wanted = normalized_profile_username(username)
    if not wanted:
        return False
    for row in google_rows:
        if ignore_google_sub and str(row["google_sub"]) == ignore_google_sub:
            continue
        if normalized_profile_username(google_account_username(row)) == wanted:
            return True
    return False


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
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS analytics_events (
                    id BIGSERIAL PRIMARY KEY,
                    visitor_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    path TEXT NOT NULL,
                    username TEXT,
                    referrer TEXT,
                    created_at BIGINT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS google_accounts (
                    google_sub TEXT PRIMARY KEY,
                    email TEXT,
                    display_name TEXT,
                    picture TEXT,
                    payload TEXT NOT NULL DEFAULT '{}'
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ranked_players (
                    player_id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    elo INTEGER NOT NULL DEFAULT 0,
                    wins INTEGER NOT NULL DEFAULT 0,
                    losses INTEGER NOT NULL DEFAULT 0,
                    win_streak INTEGER NOT NULL DEFAULT 0,
                    best_win_streak INTEGER NOT NULL DEFAULT 0,
                    updated_at BIGINT NOT NULL
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
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS analytics_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    visitor_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    path TEXT NOT NULL,
                    username TEXT,
                    referrer TEXT,
                    created_at INTEGER NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS google_accounts (
                    google_sub TEXT PRIMARY KEY,
                    email TEXT,
                    display_name TEXT,
                    picture TEXT,
                    payload TEXT NOT NULL DEFAULT '{}'
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS ranked_players (
                    player_id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    elo INTEGER NOT NULL DEFAULT 0,
                    wins INTEGER NOT NULL DEFAULT 0,
                    losses INTEGER NOT NULL DEFAULT 0,
                    win_streak INTEGER NOT NULL DEFAULT 0,
                    best_win_streak INTEGER NOT NULL DEFAULT 0,
                    updated_at INTEGER NOT NULL
                )
                """
            )
        conn.commit()


def get_analytics_summary() -> dict:
    now = int(time.time())
    last_5m = now - 300
    last_24h = now - 86400
    last_7d = now - (86400 * 7)

    with get_conn() as conn:
        if USING_POSTGRES:
            total_pageviews = conn.execute(
                "SELECT COUNT(*) AS value FROM analytics_events WHERE event_type = %s",
                ("page_view",),
            ).fetchone()["value"]
            pageviews_24h = conn.execute(
                "SELECT COUNT(*) AS value FROM analytics_events WHERE event_type = %s AND created_at >= %s",
                ("page_view", last_24h),
            ).fetchone()["value"]
            pageviews_7d = conn.execute(
                "SELECT COUNT(*) AS value FROM analytics_events WHERE event_type = %s AND created_at >= %s",
                ("page_view", last_7d),
            ).fetchone()["value"]
            unique_visitors_24h = conn.execute(
                "SELECT COUNT(DISTINCT visitor_id) AS value FROM analytics_events WHERE created_at >= %s",
                (last_24h,),
            ).fetchone()["value"]
            live_visitors = conn.execute(
                "SELECT COUNT(DISTINCT visitor_id) AS value FROM analytics_events WHERE created_at >= %s",
                (last_5m,),
            ).fetchone()["value"]
            quiz_starts_24h = conn.execute(
                "SELECT COUNT(*) AS value FROM analytics_events WHERE event_type = %s AND created_at >= %s",
                ("quiz_start", last_24h),
            ).fetchone()["value"]
        else:
            total_pageviews = conn.execute(
                "SELECT COUNT(*) AS value FROM analytics_events WHERE event_type = ?",
                ("page_view",),
            ).fetchone()["value"]
            pageviews_24h = conn.execute(
                "SELECT COUNT(*) AS value FROM analytics_events WHERE event_type = ? AND created_at >= ?",
                ("page_view", last_24h),
            ).fetchone()["value"]
            pageviews_7d = conn.execute(
                "SELECT COUNT(*) AS value FROM analytics_events WHERE event_type = ? AND created_at >= ?",
                ("page_view", last_7d),
            ).fetchone()["value"]
            unique_visitors_24h = conn.execute(
                "SELECT COUNT(DISTINCT visitor_id) AS value FROM analytics_events WHERE created_at >= ?",
                (last_24h,),
            ).fetchone()["value"]
            live_visitors = conn.execute(
                "SELECT COUNT(DISTINCT visitor_id) AS value FROM analytics_events WHERE created_at >= ?",
                (last_5m,),
            ).fetchone()["value"]
            quiz_starts_24h = conn.execute(
                "SELECT COUNT(*) AS value FROM analytics_events WHERE event_type = ? AND created_at >= ?",
                ("quiz_start", last_24h),
            ).fetchone()["value"]

    waiting_rooms = 0
    live_matches = 0
    connected_players = 0
    for room in ONLINE_MATCHES.values():
        connected_players += len(room.get("connections", {}))
        if room.get("started"):
            live_matches += 1
        else:
            waiting_rooms += 1
    connected_players += len({entry["player_id"] for entry in RANKED_QUEUE})
    for match in RANKED_MATCHES.values():
        connected_players += len(match.get("connections", {}))
        if match.get("started"):
            live_matches += 1
        else:
            waiting_rooms += 1

    return {
        "live_visitors": int(live_visitors or 0),
        "unique_visitors_24h": int(unique_visitors_24h or 0),
        "pageviews_24h": int(pageviews_24h or 0),
        "pageviews_7d": int(pageviews_7d or 0),
        "total_pageviews": int(total_pageviews or 0),
        "quiz_starts_24h": int(quiz_starts_24h or 0),
        "live_matches": int(live_matches),
        "waiting_rooms": int(waiting_rooms),
        "online_players": int(connected_players),
        "generated_at": now,
    }


def require_analytics_access(analytics_key: str | None) -> None:
    if not ANALYTICS_ADMIN_KEY:
        raise HTTPException(status_code=503, detail="Analytics access key is not configured.")
    if (analytics_key or "").strip() != ANALYTICS_ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Analytics access denied.")


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
    progress: dict | None = None


class GoogleLoginPayload(BaseModel):
    credential: str


class AnalyticsEventPayload(BaseModel):
    visitor_id: str
    event_type: str = "page_view"
    path: str = "/"
    username: str | None = None
    referrer: str | None = None


class QuizRequest(BaseModel):
    count: int | None = 10
    daily: bool = False
    date: str | None = None
    mode: str = "Practice"
    conference: str = "All"


class AnswerCheckRequest(BaseModel):
    question_id: str
    answer: str = ""
    skipped: bool = False
    reveal_answer: bool = True


class QuestionHintRequest(BaseModel):
    question_id: str
    stage: int = 0


class OnlineMatchCreateRequest(BaseModel):
    username: str
    room_code: str | None = None
    count: int | None = 10
    conference: str = "All"
    answer_mode: str = "typed"
    show_headshots: bool = True


class OnlineMatchJoinRequest(BaseModel):
    room_code: str
    username: str


class RankedQueueRequest(BaseModel):
    pass


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


def build_ranked_questions() -> list[dict]:
    df = load_dataframe()
    sample = choose_random_records(df, RANKED_QUESTION_COUNT)
    return [build_question_payload(row, df) for row in sample]


def get_online_room(room_code: str) -> dict:
    room = ONLINE_MATCHES.get(room_code.upper())
    if not room:
        raise HTTPException(status_code=404, detail="Match not found.")
    return room


def get_ranked_division(elo: int) -> str:
    division = RANKED_DIVISIONS[0][0]
    for label, threshold in RANKED_DIVISIONS:
        if elo >= threshold:
            division = label
        else:
            break
    return division


def get_ranked_identity(authorization: str | None) -> dict:
    user = require_authenticated_user(authorization)
    google_sub = str(user.get("sub", "")).strip()
    if not google_sub:
        raise HTTPException(status_code=401, detail="Google sign-in is required for ranked online.")

    with get_conn() as conn:
        if USING_POSTGRES:
            row = conn.execute(
                """
                SELECT email, display_name, picture, payload
                FROM google_accounts
                WHERE google_sub = %s
                """,
                (google_sub,),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT email, display_name, picture, payload
                FROM google_accounts
                WHERE google_sub = ?
                """,
                (google_sub,),
            ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Signed-in ranked profile not found.")

    payload = json.loads(row["payload"] or "{}")
    username = payload.get("username") or row["display_name"] or row["email"] or "Player"
    return {
        "player_id": f"google:{google_sub}",
        "google_sub": google_sub,
        "username": username,
        "email": row["email"],
        "picture": row["picture"],
    }


def ensure_ranked_player(player_id: str, username: str) -> dict:
    with get_conn() as conn:
        if USING_POSTGRES:
            conn.execute(
                """
                INSERT INTO ranked_players (player_id, username, elo, wins, losses, win_streak, best_win_streak, updated_at)
                VALUES (%s, %s, 0, 0, 0, 0, 0, %s)
                ON CONFLICT(player_id) DO UPDATE
                SET username = excluded.username,
                    updated_at = excluded.updated_at
                """,
                (player_id, username, int(time.time())),
            )
            row = conn.execute(
                """
                SELECT player_id, username, elo, wins, losses, win_streak, best_win_streak
                FROM ranked_players
                WHERE player_id = %s
                """,
                (player_id,),
            ).fetchone()
        else:
            conn.execute(
                """
                INSERT INTO ranked_players (player_id, username, elo, wins, losses, win_streak, best_win_streak, updated_at)
                VALUES (?, ?, 0, 0, 0, 0, 0, ?)
                ON CONFLICT(player_id) DO UPDATE SET
                    username = excluded.username,
                    updated_at = excluded.updated_at
                """,
                (player_id, username, int(time.time())),
            )
            row = conn.execute(
                """
                SELECT player_id, username, elo, wins, losses, win_streak, best_win_streak
                FROM ranked_players
                WHERE player_id = ?
                """,
                (player_id,),
            ).fetchone()
        conn.commit()
    return dict(row)


def get_ranked_profile(player_id: str, username: str) -> dict:
    row = ensure_ranked_player(player_id, username)
    elo = int(row["elo"] or 0)
    wins = int(row["wins"] or 0)
    losses = int(row["losses"] or 0)
    streak = int(row["win_streak"] or 0)
    best_streak = int(row["best_win_streak"] or 0)
    return {
        "player_id": row["player_id"],
        "username": row["username"],
        "elo": elo,
        "division": get_ranked_division(elo),
        "wins": wins,
        "losses": losses,
        "games": wins + losses,
        "win_streak": streak,
        "best_win_streak": best_streak,
    }


def cleanup_ranked_queue():
    active_ids = {entry["player_id"] for entry in RANKED_QUEUE}
    for player_id in list(RANKED_PENDING_MATCHES.keys()):
        if player_id in active_ids:
            continue
        match_id = RANKED_PENDING_MATCHES[player_id]
        if match_id not in RANKED_MATCHES:
            RANKED_PENDING_MATCHES.pop(player_id, None)


def create_ranked_match(player_one: dict, player_two: dict) -> dict:
    match_id = secrets.token_urlsafe(10)
    player_one_profile = get_ranked_profile(player_one["player_id"], player_one["username"])
    player_two_profile = get_ranked_profile(player_two["player_id"], player_two["username"])
    match = {
        "match_id": match_id,
        "players": [player_one["player_id"], player_two["player_id"]],
        "player_names": {
            player_one["player_id"]: player_one_profile["username"],
            player_two["player_id"]: player_two_profile["username"],
        },
        "connections": {},
        "question_count": RANKED_QUESTION_COUNT,
        "questions": build_ranked_questions(),
        "scores": {player_one["player_id"]: 0, player_two["player_id"]: 0},
        "current_index": 0,
        "round_submissions": {},
        "started": False,
        "answer_mode": "multiple-choice",
        "created_at": time.time(),
        "ranked": True,
        "ranked_profiles": {
            player_one["player_id"]: player_one_profile,
            player_two["player_id"]: player_two_profile,
        },
    }
    RANKED_MATCHES[match_id] = match
    RANKED_PENDING_MATCHES[player_one["player_id"]] = match_id
    RANKED_PENDING_MATCHES[player_two["player_id"]] = match_id
    return match


def summarize_ranked_scores(match: dict) -> dict:
    return {player_id: match["scores"].get(player_id, 0) for player_id in match["players"]}


def serialize_ranked_question(match: dict) -> dict | None:
    if match["current_index"] >= len(match["questions"]):
        return None
    return dict(match["questions"][match["current_index"]])


def compute_ranked_gain_from_streak(next_streak: int) -> int:
    if next_streak >= 10:
        return RANKED_WIN_ELO + 20
    if next_streak >= 5:
        return RANKED_WIN_ELO + 10
    return RANKED_WIN_ELO


def apply_ranked_match_result(match: dict) -> dict:
    player_a, player_b = match["players"]
    score_a = int(match["scores"].get(player_a, 0))
    score_b = int(match["scores"].get(player_b, 0))
    profiles = {
        player_a: get_ranked_profile(player_a, match["player_names"][player_a]),
        player_b: get_ranked_profile(player_b, match["player_names"][player_b]),
    }
    updates: dict[str, dict] = {}

    if score_a == score_b:
        for player_id in (player_a, player_b):
            profile = profiles[player_id]
            updates[player_id] = {
                "old_elo": profile["elo"],
                "new_elo": profile["elo"],
                "elo_change": 0,
                "division": get_ranked_division(profile["elo"]),
                "wins": profile["wins"],
                "losses": profile["losses"],
                "win_streak": 0,
                "best_win_streak": profile["best_win_streak"],
                "result": "tie",
            }
        with get_conn() as conn:
            if USING_POSTGRES:
                for player_id, profile in profiles.items():
                    conn.execute(
                        """
                        UPDATE ranked_players
                        SET win_streak = 0, username = %s, updated_at = %s
                        WHERE player_id = %s
                        """,
                        (match["player_names"][player_id], int(time.time()), player_id),
                    )
            else:
                for player_id, profile in profiles.items():
                    conn.execute(
                        """
                        UPDATE ranked_players
                        SET win_streak = 0, username = ?, updated_at = ?
                        WHERE player_id = ?
                        """,
                        (match["player_names"][player_id], int(time.time()), player_id),
                    )
            conn.commit()
        return updates

    winner = player_a if score_a > score_b else player_b
    loser = player_b if winner == player_a else player_a
    winner_profile = profiles[winner]
    loser_profile = profiles[loser]
    winner_next_streak = int(winner_profile["win_streak"] or 0) + 1
    loser_next_elo = max(int(loser_profile["elo"] or 0) - RANKED_LOSS_ELO, 0)
    winner_gain = compute_ranked_gain_from_streak(winner_next_streak)
    winner_next_elo = int(winner_profile["elo"] or 0) + winner_gain

    updates[winner] = {
        "old_elo": winner_profile["elo"],
        "new_elo": winner_next_elo,
        "elo_change": winner_gain,
        "division": get_ranked_division(winner_next_elo),
        "wins": winner_profile["wins"] + 1,
        "losses": winner_profile["losses"],
        "win_streak": winner_next_streak,
        "best_win_streak": max(winner_profile["best_win_streak"], winner_next_streak),
        "result": "win",
    }
    updates[loser] = {
        "old_elo": loser_profile["elo"],
        "new_elo": loser_next_elo,
        "elo_change": loser_next_elo - int(loser_profile["elo"] or 0),
        "division": get_ranked_division(loser_next_elo),
        "wins": loser_profile["wins"],
        "losses": loser_profile["losses"] + 1,
        "win_streak": 0,
        "best_win_streak": loser_profile["best_win_streak"],
        "result": "loss",
    }

    with get_conn() as conn:
        if USING_POSTGRES:
            for player_id, update in updates.items():
                conn.execute(
                    """
                    UPDATE ranked_players
                    SET username = %s,
                        elo = %s,
                        wins = %s,
                        losses = %s,
                        win_streak = %s,
                        best_win_streak = %s,
                        updated_at = %s
                    WHERE player_id = %s
                    """,
                    (
                        match["player_names"][player_id],
                        update["new_elo"],
                        update["wins"],
                        update["losses"],
                        update["win_streak"],
                        update["best_win_streak"],
                        int(time.time()),
                        player_id,
                    ),
                )
        else:
            for player_id, update in updates.items():
                conn.execute(
                    """
                    UPDATE ranked_players
                    SET username = ?,
                        elo = ?,
                        wins = ?,
                        losses = ?,
                        win_streak = ?,
                        best_win_streak = ?,
                        updated_at = ?
                    WHERE player_id = ?
                    """,
                    (
                        match["player_names"][player_id],
                        update["new_elo"],
                        update["wins"],
                        update["losses"],
                        update["win_streak"],
                        update["best_win_streak"],
                        int(time.time()),
                        player_id,
                    ),
                )
        conn.commit()

    return updates


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
    question.pop("college", None)
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


async def send_ranked_match_started(match: dict):
    match["started"] = True
    payload = {
        "type": "match_started",
        "ranked": True,
        "match_id": match["match_id"],
        "players": match["players"],
        "player_names": match["player_names"],
        "scores": summarize_ranked_scores(match),
        "current_index": 0,
        "total_questions": len(match["questions"]),
        "question": serialize_ranked_question(match),
        "answer_mode": match["answer_mode"],
        "question_count": match["question_count"],
    }
    for player_id in match["players"]:
        ws = match["connections"].get(player_id)
        if ws:
            opponent_id = next((item for item in match["players"] if item != player_id), None)
            await ws.send_json(
                {
                    **payload,
                    "ranked_profile": match["ranked_profiles"].get(player_id),
                    "opponent_profile": match["ranked_profiles"].get(opponent_id) if opponent_id else None,
                }
            )


async def finalize_ranked_round(match: dict):
    current_question = match["questions"][match["current_index"]]
    results = match["round_submissions"]
    next_index = match["current_index"] + 1
    finished = next_index >= len(match["questions"])
    match["current_index"] = next_index
    match["round_submissions"] = {}

    payload = {
        "type": "round_complete",
        "ranked": True,
        "match_id": match["match_id"],
        "players": match["players"],
        "player_names": match["player_names"],
        "scores": summarize_ranked_scores(match),
        "current_index": next_index,
        "total_questions": len(match["questions"]),
        "correct_answer": current_question["college"],
        "round_results": results,
        "finished": finished,
        "question": None if finished else serialize_ranked_question(match),
        "rating_updates": None,
        "winner": None,
    }

    if finished:
        score_a = match["scores"].get(match["players"][0], 0)
        score_b = match["scores"].get(match["players"][1], 0)
        if score_a != score_b:
            payload["winner"] = match["players"][0] if score_a > score_b else match["players"][1]
        payload["rating_updates"] = apply_ranked_match_result(match)

    for player_id in match["players"]:
        ws = match["connections"].get(player_id)
        if ws:
            player_payload = dict(payload)
            if payload["rating_updates"]:
                player_payload["ranked_profile"] = payload["rating_updates"].get(player_id)
            await ws.send_json(player_payload)


async def handle_ranked_submission(match: dict, player_id: str, answer: str, skipped: bool):
    if not match["started"] or match["current_index"] >= len(match["questions"]):
        return
    if player_id in match["round_submissions"]:
        return

    current_question = match["questions"][match["current_index"]]
    accepted = {normalize_answer(item) for item in get_registered_question(current_question["question_id"])["accepted_answers"]}
    normalized_answer = normalize_answer(answer)
    correct = False if skipped else normalized_answer in accepted

    match["round_submissions"][player_id] = {
        "answer": answer,
        "correct": correct,
        "skipped": skipped,
    }
    if correct:
        match["scores"][player_id] = match["scores"].get(player_id, 0) + 1

    if len(match["round_submissions"]) < 2:
        websocket = match["connections"].get(player_id)
        if websocket:
            await send_ws(websocket, {"type": "waiting_for_opponent", "ranked": True})
        return

    await finalize_ranked_round(match)


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


@app.post("/api/auth/google")
def auth_google(payload: GoogleLoginPayload):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google client ID is not configured.")

    try:
        token_info = google_id_token.verify_oauth2_token(
            payload.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Google sign-in failed.") from exc

    google_sub = str(token_info.get("sub", "")).strip()
    if not google_sub:
        raise HTTPException(status_code=401, detail="Google sign-in failed.")

    email = str(token_info.get("email", "")).strip()
    display_name = str(token_info.get("name") or email.split("@")[0] or "Player").strip()
    picture = str(token_info.get("picture", "")).strip()

    with get_conn() as conn:
        if USING_POSTGRES:
            conn.execute(
                """
                INSERT INTO google_accounts (google_sub, email, display_name, picture, payload)
                VALUES (%s, %s, %s, %s, COALESCE((SELECT payload FROM google_accounts WHERE google_sub = %s), '{}'))
                ON CONFLICT(google_sub) DO UPDATE
                SET email = excluded.email,
                    display_name = excluded.display_name,
                    picture = excluded.picture
                """,
                (google_sub, email, display_name, picture, google_sub),
            )
        else:
            conn.execute(
                """
                INSERT INTO google_accounts (google_sub, email, display_name, picture, payload)
                VALUES (?, ?, ?, ?, COALESCE((SELECT payload FROM google_accounts WHERE google_sub = ?), '{}'))
                ON CONFLICT(google_sub) DO UPDATE SET
                    email = excluded.email,
                    display_name = excluded.display_name,
                    picture = excluded.picture
                """,
                (google_sub, email, display_name, picture, google_sub),
            )
        conn.commit()

    auth_token = sign_session_payload(
        {
            "sub": google_sub,
            "email": email,
            "name": display_name,
            "picture": picture,
            "exp": int(time.time()) + (60 * 60 * 24 * 30),
        }
    )

    return {
        "token": auth_token,
        "user": {
            "sub": google_sub,
            "email": email,
            "name": display_name,
            "picture": picture,
        },
    }


@app.get("/api/auth/me")
def auth_me(authorization: str | None = Header(default=None)):
    user = require_authenticated_user(authorization)
    google_sub = str(user.get("sub", "")).strip()
    display_name = user.get("name")
    if google_sub:
        with get_conn() as conn:
            if USING_POSTGRES:
                row = conn.execute(
                    "SELECT payload FROM google_accounts WHERE google_sub = %s",
                    (google_sub,),
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT payload FROM google_accounts WHERE google_sub = ?",
                    (google_sub,),
                ).fetchone()
        if row:
            payload = json.loads(row["payload"] or "{}")
            display_name = payload.get("username") or display_name
    return {
        "user": {
            "sub": user.get("sub"),
            "email": user.get("email"),
            "name": display_name,
            "picture": user.get("picture"),
        }
    }


@app.get("/api/auth/profile")
def auth_profile(authorization: str | None = Header(default=None)):
    user = require_authenticated_user(authorization)
    google_sub = str(user.get("sub", "")).strip()
    if not google_sub:
        raise HTTPException(status_code=401, detail="Invalid authenticated user.")

    with get_conn() as conn:
        if USING_POSTGRES:
            row = conn.execute(
                """
                SELECT email, display_name, picture, payload
                FROM google_accounts
                WHERE google_sub = %s
                """,
                (google_sub,),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT email, display_name, picture, payload
                FROM google_accounts
                WHERE google_sub = ?
                """,
                (google_sub,),
            ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Authenticated profile not found.")

    payload = json.loads(row["payload"] or "{}")
    username = payload.get("username") or row["display_name"] or row["email"] or "Player"
    return {
        "profile": {
            "username": username,
            "theme": payload.get("theme", "Arena Blue"),
            "settings": payload.get("settings", {}),
            "progress": payload.get("progress", {}),
            "picture": row["picture"],
            "auth_provider": "google",
            "auth_id": f"google:{google_sub}",
        }
    }


@app.post("/api/analytics")
def post_analytics_event(payload: AnalyticsEventPayload):
    visitor_id = re.sub(r"[^a-zA-Z0-9_-]", "", payload.visitor_id.strip())[:64]
    if not visitor_id:
        raise HTTPException(status_code=400, detail="Missing visitor ID.")

    event_type = payload.event_type.strip().lower() or "page_view"
    if event_type not in {"page_view", "quiz_start"}:
        event_type = "page_view"

    path = str(payload.path or "/").strip()[:255] or "/"
    username = (payload.username or "").strip()[:80] or None
    referrer = (payload.referrer or "").strip()[:500] or None
    created_at = int(time.time())

    with get_conn() as conn:
        if USING_POSTGRES:
            conn.execute(
                """
                INSERT INTO analytics_events (visitor_id, event_type, path, username, referrer, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (visitor_id, event_type, path, username, referrer, created_at),
            )
        else:
            conn.execute(
                """
                INSERT INTO analytics_events (visitor_id, event_type, path, username, referrer, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (visitor_id, event_type, path, username, referrer, created_at),
            )
        conn.commit()
    return {"saved": True}


@app.get("/api/analytics/summary")
def analytics_summary(x_analytics_key: str | None = Header(default=None)):
    require_analytics_access(x_analytics_key)
    return get_analytics_summary()


@app.post("/api/online-match/create")
def create_online_match(payload: OnlineMatchCreateRequest):
    requested_code = sanitize_room_code(payload.room_code)
    if requested_code:
        if len(requested_code) < 4:
            raise HTTPException(status_code=400, detail="Match code must be at least 4 characters.")
        if requested_code in ONLINE_MATCHES:
            raise HTTPException(status_code=409, detail="That match code is already in use.")
        room_code = requested_code
    else:
        room_code = generate_room_code()
    username = payload.username.strip() or "Host"
    ONLINE_MATCHES[room_code] = {
        "room_code": room_code,
        "players": [username, None],
        "connections": {},
        "question_count": payload.count,
        "questions": build_online_match_questions(payload.count, payload.conference),
        "scores": {username: 0},
        "current_index": 0,
        "round_submissions": {},
        "rematch_requests": set(),
        "started": False,
        "answer_mode": payload.answer_mode,
        "show_headshots": payload.show_headshots,
        "conference": payload.conference,
        "created_at": time.time(),
    }
    return {
        "room_code": room_code,
        "player_name": username,
        "answer_mode": payload.answer_mode,
        "show_headshots": payload.show_headshots,
        "question_count": payload.count,
        "conference": payload.conference,
    }


@app.get("/api/ranked/profile")
def ranked_profile(authorization: str | None = Header(default=None)):
    identity = get_ranked_identity(authorization)
    return {"profile": get_ranked_profile(identity["player_id"], identity["username"])}


@app.get("/api/ranked/leaderboard")
def ranked_leaderboard(limit: int = 5):
    with get_conn() as conn:
        if USING_POSTGRES:
            rows = conn.execute(
                """
                SELECT player_id, username, elo, wins, losses, win_streak, best_win_streak
                FROM ranked_players
                ORDER BY elo DESC, wins DESC, best_win_streak DESC, updated_at ASC
                LIMIT %s
                """,
                (limit,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT player_id, username, elo, wins, losses, win_streak, best_win_streak
                FROM ranked_players
                ORDER BY elo DESC, wins DESC, best_win_streak DESC, updated_at ASC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
    entries = []
    for row in rows:
        username = str(row["username"] or "").strip()
        if normalized_profile_username(username) in HIDDEN_LEADERBOARD_USERNAMES:
            continue
        elo = int(row["elo"] or 0)
        wins = int(row["wins"] or 0)
        losses = int(row["losses"] or 0)
        entries.append(
            {
                "player_id": row["player_id"],
                "username": username,
                "elo": elo,
                "division": get_ranked_division(elo),
                "wins": wins,
                "losses": losses,
                "games": wins + losses,
                "win_streak": int(row["win_streak"] or 0),
                "best_win_streak": int(row["best_win_streak"] or 0),
            }
        )
    return {"entries": entries[: max(1, min(limit, 100))]}


@app.post("/api/ranked/queue/join")
def ranked_queue_join(payload: RankedQueueRequest, authorization: str | None = Header(default=None)):
    identity = get_ranked_identity(authorization)
    ensure_ranked_player(identity["player_id"], identity["username"])

    global RANKED_QUEUE
    cleanup_ranked_queue()
    RANKED_QUEUE = [entry for entry in RANKED_QUEUE if entry["player_id"] != identity["player_id"]]

    pending_match_id = RANKED_PENDING_MATCHES.get(identity["player_id"])
    if pending_match_id and pending_match_id in RANKED_MATCHES:
        return {"status": "matched", "match_id": pending_match_id, "player_name": identity["username"], "question_count": RANKED_QUESTION_COUNT}

    opponent = next((entry for entry in RANKED_QUEUE if entry["player_id"] != identity["player_id"]), None)
    if opponent:
        RANKED_QUEUE = [entry for entry in RANKED_QUEUE if entry["player_id"] != opponent["player_id"]]
        match = create_ranked_match(opponent, identity)
        return {"status": "matched", "match_id": match["match_id"], "player_name": identity["username"], "question_count": RANKED_QUESTION_COUNT}

    RANKED_QUEUE.append({"player_id": identity["player_id"], "username": identity["username"], "joined_at": time.time()})
    return {"status": "waiting", "player_name": identity["username"], "question_count": RANKED_QUESTION_COUNT}


@app.get("/api/ranked/queue/status")
def ranked_queue_status(authorization: str | None = Header(default=None)):
    identity = get_ranked_identity(authorization)
    cleanup_ranked_queue()
    pending_match_id = RANKED_PENDING_MATCHES.get(identity["player_id"])
    if pending_match_id and pending_match_id in RANKED_MATCHES:
        match = RANKED_MATCHES[pending_match_id]
        opponent_id = next(player_id for player_id in match["players"] if player_id != identity["player_id"])
        return {
            "status": "matched",
            "match_id": pending_match_id,
            "player_name": identity["username"],
            "opponent_name": match["player_names"].get(opponent_id, "Opponent"),
            "question_count": RANKED_QUESTION_COUNT,
        }

    waiting = any(entry["player_id"] == identity["player_id"] for entry in RANKED_QUEUE)
    return {"status": "waiting" if waiting else "idle", "question_count": RANKED_QUESTION_COUNT}


@app.delete("/api/ranked/queue/leave")
def ranked_queue_leave(authorization: str | None = Header(default=None)):
    identity = get_ranked_identity(authorization)
    global RANKED_QUEUE
    before = len(RANKED_QUEUE)
    RANKED_QUEUE = [entry for entry in RANKED_QUEUE if entry["player_id"] != identity["player_id"]]
    removed = len(RANKED_QUEUE) != before
    if identity["player_id"] in RANKED_PENDING_MATCHES:
        RANKED_PENDING_MATCHES.pop(identity["player_id"], None)
        removed = True
    return {"removed": removed}


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
    return {
        "room_code": room["room_code"],
        "player_name": username,
        "host": players[0],
        "answer_mode": room["answer_mode"],
        "show_headshots": room["show_headshots"],
        "question_count": room["question_count"],
        "conference": room["conference"],
    }


async def handle_rematch_request(room: dict, username: str):
    room["rematch_requests"].add(username)
    players = [player for player in room["players"] if player]

    await broadcast_room(
        room,
        {
            "type": "rematch_status",
            "requested_by": username,
            "requests": list(room["rematch_requests"]),
            "players": players,
        },
    )

    if len(players) == 2 and all(player in room["rematch_requests"] for player in players):
        room["scores"] = {player: 0 for player in players}
        room["current_index"] = 0
        room["round_submissions"] = {}
        room["questions"] = build_online_match_questions(room.get("question_count"), room["conference"])
        room["started"] = True
        room["rematch_requests"] = set()

        await broadcast_room(
            room,
            {
                "type": "rematch_started",
                "room_code": room["room_code"],
                "players": players,
                "scores": summarize_online_scores(room),
                "current_index": 0,
                "total_questions": len(room["questions"]),
                "question": serialize_online_question(room),
                "answer_mode": room["answer_mode"],
            },
        )


@app.get("/api/players")
def players(count: int | None = 10):
    df = load_dataframe()
    sample = choose_random_records(df, count)
    return {"players": [build_question_payload(row, df) for row in sample]}


@app.get("/api/meta")
def meta():
    df = load_dataframe()
    conferences = sorted({normalize_conference_name(item) for item in df["Conference"].tolist() if normalize_conference_name(item) != "None"})
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
    question = get_registered_question(payload.question_id)
    normalized = normalize_answer(payload.answer)
    accepted = {normalize_answer(item) for item in question["accepted_answers"]}
    correct = False if payload.skipped else normalized in accepted
    response = {"correct": correct}
    if not correct and payload.reveal_answer:
        response["correct_answer"] = question["college"]
    return response


@app.post("/api/question-hint")
def question_hint(payload: QuestionHintRequest):
    question = get_registered_question(payload.question_id)
    answer = question["college"]
    words = answer.split()
    stage = max(0, min(int(payload.stage or 0), 2))

    if stage == 0:
        hint = f"Hint: first letters {' '.join(word[0] for word in words)}"
    elif stage == 1:
        hint = f"Hint: word lengths {' - '.join(str(len(word)) for word in words)}"
    else:
        hint = f"Final hint: conference {question['conference']}"

    return {"hint": hint, "stage": stage}


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
    return {"profiles": build_profile_collection(include_hidden=False)}


@app.post("/api/profiles")
def post_profile(profile: ProfilePayload):
    normalized_username = (profile.username.strip() or "Guest").lower()
    if google_username_taken(normalized_username):
        raise HTTPException(status_code=409, detail="That username is reserved by a signed-in account.")

    payload = {
        "theme": profile.theme,
        "settings": profile.settings or {},
        "progress": profile.progress or {},
    }
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


@app.post("/api/auth/profile")
def post_authenticated_profile(profile: ProfilePayload, authorization: str | None = Header(default=None)):
    user = require_authenticated_user(authorization)
    google_sub = str(user.get("sub", "")).strip()
    if not google_sub:
        raise HTTPException(status_code=401, detail="Invalid authenticated user.")
    normalized_username = normalized_profile_username(profile.username.strip() or user.get("name") or "Player")
    if google_username_taken(normalized_username, ignore_google_sub=google_sub):
        raise HTTPException(status_code=409, detail="That display name is already in use.")

    payload = {
        "username": profile.username.strip() or user.get("name") or "Player",
        "theme": profile.theme,
        "settings": profile.settings or {},
        "progress": profile.progress or {},
    }

    with get_conn() as conn:
        if USING_POSTGRES:
            conn.execute(
                """
                UPDATE google_accounts
                SET payload = %s
                WHERE google_sub = %s
                """,
                (json.dumps(payload), google_sub),
            )
            conn.execute(
                """
                UPDATE ranked_players
                SET username = %s, updated_at = %s
                WHERE player_id = %s
                """,
                (payload["username"], int(time.time()), f"google:{google_sub}"),
            )
        else:
            conn.execute(
                """
                UPDATE google_accounts
                SET payload = ?
                WHERE google_sub = ?
                """,
                (json.dumps(payload), google_sub),
            )
            conn.execute(
                """
                UPDATE ranked_players
                SET username = ?, updated_at = ?
                WHERE player_id = ?
                """,
                (payload["username"], int(time.time()), f"google:{google_sub}"),
            )
        conn.commit()
    return {"saved": True}


@app.get("/api/admin/profiles")
def admin_profiles(x_analytics_key: str | None = Header(default=None), limit: int = 25):
    require_analytics_access(x_analytics_key)
    profiles = build_profile_collection(include_hidden=True)
    serialized = []
    for item in profiles:
        progress = item.get("progress") or {}
        serialized.append(
            {
                "username": item.get("username") or "Player",
                "auth_provider": item.get("auth_provider") or "guest",
                "auth_id": item.get("auth_id") or "",
                "xp": int(progress.get("xp") or 0),
                "best_score": int(progress.get("bestScore") or 0),
            }
        )
    serialized.sort(key=lambda item: (-item["xp"], -item["best_score"], item["username"].lower()))
    return {"profiles": serialized[: max(1, min(limit, 100))]}


@app.delete("/api/admin/profiles/{username}")
def admin_delete_profile(username: str, x_analytics_key: str | None = Header(default=None)):
    require_analytics_access(x_analytics_key)
    target = normalized_profile_username(username)
    if not target:
        raise HTTPException(status_code=400, detail="Missing username.")

    deleted = 0
    with get_conn() as conn:
        if USING_POSTGRES:
            result = conn.execute("DELETE FROM profiles WHERE LOWER(username) = %s", (target,))
            deleted += int(getattr(result, "rowcount", 0) or 0)
            rows = conn.execute(
                "SELECT google_sub, email, display_name, payload FROM google_accounts"
            ).fetchall()
            for row in rows:
                if normalized_profile_username(google_account_username(row)) == target:
                    conn.execute("DELETE FROM google_accounts WHERE google_sub = %s", (row["google_sub"],))
                    deleted += 1
        else:
            result = conn.execute("DELETE FROM profiles WHERE LOWER(username) = ?", (target,))
            deleted += int(getattr(result, "rowcount", 0) or 0)
            rows = conn.execute(
                "SELECT google_sub, email, display_name, payload FROM google_accounts"
            ).fetchall()
            for row in rows:
                if normalized_profile_username(google_account_username(row)) == target:
                    conn.execute("DELETE FROM google_accounts WHERE google_sub = ?", (row["google_sub"],))
                    deleted += 1
        conn.commit()

    return {"deleted": deleted > 0, "count": deleted}


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
            "answer_mode": room["answer_mode"],
            "show_headshots": room["show_headshots"],
            "question_count": room["question_count"],
            "conference": room["conference"],
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
            elif event_type == "request_rematch":
                await handle_rematch_request(room, normalized_username)
    except WebSocketDisconnect:
        room["connections"].pop(normalized_username, None)
        remaining = [player for player in room["players"] if player and player in room["connections"]]
        if remaining:
            await broadcast_room(room, {"type": "opponent_left", "message": f"{normalized_username} left the match."})
        else:
            ONLINE_MATCHES.pop(room["room_code"], None)


@app.websocket("/ws/ranked/{match_id}")
async def ranked_match_socket(websocket: WebSocket, match_id: str, token: str):
    try:
        user = verify_session_token(token)
    except HTTPException:
        await websocket.close(code=4401)
        return

    player_id = f"google:{str(user.get('sub', '')).strip()}"
    match = RANKED_MATCHES.get(match_id)
    if not match or player_id not in match["players"]:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    match["connections"][player_id] = websocket
    RANKED_PENDING_MATCHES.pop(player_id, None)

    opponent_id = next((item for item in match["players"] if item != player_id), None)
    await send_ws(
        websocket,
        {
            "type": "room_joined",
            "ranked": True,
            "match_id": match["match_id"],
            "player_id": player_id,
            "player_name": match["player_names"].get(player_id, user.get("name") or "Player"),
            "opponent_name": match["player_names"].get(opponent_id, "Opponent") if opponent_id else "Opponent",
            "waiting": not match["started"],
            "scores": summarize_ranked_scores(match),
            "answer_mode": match["answer_mode"],
            "question_count": match["question_count"],
            "ranked_profile": match["ranked_profiles"].get(player_id),
            "opponent_profile": match["ranked_profiles"].get(opponent_id) if opponent_id else None,
        },
    )

    if len(match["connections"]) == 2 and not match["started"]:
        await send_ranked_match_started(match)

    try:
        while True:
            payload = await websocket.receive_json()
            event_type = payload.get("type")
            if event_type == "submit_answer":
                await handle_ranked_submission(match, player_id, str(payload.get("answer", "")), skipped=False)
            elif event_type == "skip_question":
                await handle_ranked_submission(match, player_id, "", skipped=True)
        # no rematches in ranked mode
    except WebSocketDisconnect:
        match["connections"].pop(player_id, None)
        remaining = [item for item in match["players"] if item in match["connections"]]
        if remaining and match["current_index"] < len(match["questions"]):
            for remaining_player_id in remaining:
                ws = match["connections"].get(remaining_player_id)
                if ws:
                    await ws.send_json({"type": "opponent_left", "ranked": True, "message": f"{match['player_names'].get(player_id, 'Opponent')} left the ranked match."})
        else:
            RANKED_MATCHES.pop(match["match_id"], None)


app.mount("/assets/headshots", StaticFiles(directory=str(HEADSHOT_DIR)), name="headshots")
app.mount("/assets/school_logos", StaticFiles(directory=str(LOGO_DIR)), name="school_logos")
