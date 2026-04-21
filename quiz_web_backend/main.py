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
PLAYER_ROLES_FILE = BASE_DIR / "quiz_web_backend" / "player_roles.json"
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
FRIEND_CHALLENGES: dict[str, dict] = {}
FRIEND_CHALLENGE_TTL_SECONDS = 60 * 60
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
PLAYER_ROLE_MAP: dict[str, dict] = {}
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


def load_player_role_map() -> dict[str, dict]:
    if not PLAYER_ROLES_FILE.exists():
        return {}
    try:
        payload = json.loads(PLAYER_ROLES_FILE.read_text(encoding="utf-8"))
        entries = payload.get("entries", [])
        role_map = {}
        for entry in entries:
            raw_key = str(entry.get("player_key", "")).strip()
            player_name = str(entry.get("player_name", "")).strip()
            normalized_key = normalize_name(raw_key or player_name)
            if normalized_key:
                role_map[normalized_key] = entry
        return role_map
    except Exception:  # pragma: no cover
        return {}


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


def filter_dataframe_by_player_pool(df: pd.DataFrame, player_pool: str | None) -> pd.DataFrame:
    pool = str(player_pool or "all").strip().lower()
    if pool not in {"rotation", "starter", "bench"}:
        return df

    if not PLAYER_ROLE_MAP:
        return df

    def matches_pool(player_name: str) -> bool:
        entry = PLAYER_ROLE_MAP.get(normalize_name(player_name))
        if not entry:
            return False
        if pool == "rotation":
            return bool(entry.get("rotation"))
        return entry.get("role") == pool

    filtered = df[df["Player Name"].apply(matches_pool)].copy()
    return filtered if not filtered.empty else df


def get_player_pool_counts(df: pd.DataFrame) -> dict[str, int]:
    return {
        "all": len(df),
        "rotation": len(filter_dataframe_by_player_pool(df, "rotation")),
        "starter": len(filter_dataframe_by_player_pool(df, "starter")),
        "bench": len(filter_dataframe_by_player_pool(df, "bench")),
    }


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
    colleges = sorted({
        str(item).strip()
        for item in df["College / Last School"].dropna().tolist()
        if str(item).strip() and str(item).strip().lower() != "none"
    })
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
    headshot_url = str(row.get("Headshot URL", "")).strip() if row.get("Headshot URL") else ""
    if headshot_url:
        headshot = headshot_url
    elif headshot_file and (HEADSHOT_DIR / headshot_file).exists():
        headshot = f"/assets/headshots/{headshot_file}"
    else:
        headshot = None
    return {
        "question_id": register_question_data(row),
        "player_name": row["Player Name"],
        "conference": row["Conference"],
        "headshot": headshot,
        "logo": f"/assets/school_logos/{logo_name}" if (LOGO_DIR / logo_name).exists() else None,
        "choices": build_choices(df, school),
    }


def build_match_question_payload(row, df: pd.DataFrame) -> dict:
    payload = build_question_payload(row, df)
    payload["college"] = str(row["College / Last School"]).strip()
    payload["accepted_answers"] = get_answer_variants(row)
    return payload


def build_directory_payload(row) -> dict:
    school = str(row["College / Last School"]).strip()
    headshot_file = str(row.get("Headshot File", "")).strip() if row.get("Headshot File") else ""
    headshot_url = str(row.get("Headshot URL", "")).strip() if row.get("Headshot URL") else ""
    if headshot_url:
        headshot = headshot_url
    elif headshot_file and (HEADSHOT_DIR / headshot_file).exists():
        headshot = f"/assets/headshots/{headshot_file}"
    else:
        headshot = None
    return {
        "player_name": row["Player Name"],
        "college": school,
        "conference": row["Conference"],
        "headshot": headshot,
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


def google_account_payload(row: dict) -> dict:
    return json.loads(row["payload"] or "{}")


def google_account_username_locked(row: dict) -> bool:
    payload = google_account_payload(row)
    if "username_locked" in payload:
        return bool(payload.get("username_locked"))
    return bool(str(payload.get("username") or "").strip())


def google_account_username_change_available(row: dict) -> bool:
    payload = google_account_payload(row)
    return google_account_username_locked(row) and not bool(payload.get("username_change_used"))


def google_account_username(row: dict) -> str:
    payload = google_account_payload(row)
    if google_account_username_locked(row):
        return str(payload.get("username") or "").strip()
    return ""


def google_account_public_username(row: dict) -> str:
    payload = json.loads(row["payload"] or "{}")
    locked_username = str(payload.get("username") or "").strip()
    if locked_username:
        return locked_username
    return str(row.get("display_name") or row.get("email") or "").strip()


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
        payload = google_account_payload(row)
        if not google_account_username_locked(row):
            continue
        result.append(
            {
                "username": google_account_public_username(row) or "Player",
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

    username_deduped: dict[str, dict] = {}
    for item in deduped.values():
        visible_username = normalized_profile_username(item.get("username"))
        if not visible_username:
            continue
        existing = username_deduped.get(visible_username)
        if existing is None or sort_strength(item) > sort_strength(existing):
            username_deduped[visible_username] = item

    return list(username_deduped.values())


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


def get_google_account_row_by_sub(google_sub: str) -> dict | None:
    if not google_sub:
        return None
    with get_conn() as conn:
        if USING_POSTGRES:
            row = conn.execute(
                "SELECT google_sub, email, display_name, picture, payload FROM google_accounts WHERE google_sub = %s",
                (google_sub,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT google_sub, email, display_name, picture, payload FROM google_accounts WHERE google_sub = ?",
                (google_sub,),
            ).fetchone()
    return dict(row) if row else None


def get_google_account_row_by_username(username: str) -> dict | None:
    wanted = normalized_profile_username(username)
    if not wanted:
        return None
    _, google_rows = collect_profile_rows()
    for row in google_rows:
        if normalized_profile_username(google_account_username(row)) == wanted:
            return dict(row)
    return None


def get_google_account_friend_code(row: dict | None) -> str:
    if not row:
        return ""
    try:
        payload = json.loads((row.get("payload") or "{}"))
    except Exception:
        payload = {}
    code = str(payload.get("friend_code") or "").strip().upper()
    return re.sub(r"[^A-Z0-9]", "", code)[:10]


def generate_unique_friend_code() -> str:
    _, google_rows = collect_profile_rows()
    existing_codes = {get_google_account_friend_code(row) for row in google_rows if get_google_account_friend_code(row)}
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    chooser = random.SystemRandom()
    while True:
        code = "".join(chooser.choice(alphabet) for _ in range(8))
        if code not in existing_codes:
            return code


def ensure_google_account_friend_code(google_sub: str) -> str:
    row = get_google_account_row_by_sub(google_sub)
    if not row:
        return ""
    existing_code = get_google_account_friend_code(row)
    if existing_code:
        return existing_code
    payload = json.loads((row.get("payload") or "{}") or "{}")
    payload["friend_code"] = generate_unique_friend_code()
    with get_conn() as conn:
        if USING_POSTGRES:
            conn.execute(
                "UPDATE google_accounts SET payload = %s WHERE google_sub = %s",
                (json.dumps(payload), google_sub),
            )
        else:
            conn.execute(
                "UPDATE google_accounts SET payload = ? WHERE google_sub = ?",
                (json.dumps(payload), google_sub),
            )
        conn.commit()
    return str(payload["friend_code"])


def get_google_account_payload(row: dict | None) -> dict:
    if not row:
        return {}
    try:
        return json.loads((row.get("payload") or "{}") or "{}")
    except Exception:
        return {}


def build_authenticated_user_payload(user: dict, row: dict | None = None) -> dict:
    google_sub = str(user.get("sub", "")).strip()
    row = row or get_google_account_row_by_sub(google_sub)
    payload = get_google_account_payload(row)
    username = str(payload.get("username") or "").strip()
    username_locked = bool(payload.get("username_locked")) or bool(username)
    username_change_available = username_locked and not bool(payload.get("username_change_used"))
    google_name = (row or {}).get("display_name") or user.get("name")
    return {
        "sub": user.get("sub"),
        "email": user.get("email"),
        "name": username or google_name,
        "google_name": google_name,
        "picture": user.get("picture") or (row or {}).get("picture"),
        "username": username,
        "username_locked": username_locked,
        "username_change_available": username_change_available,
        "friend_code": ensure_google_account_friend_code(google_sub) if google_sub else "",
    }


def build_authenticated_profile_payload(row: dict | None, google_sub: str) -> dict:
    payload = get_google_account_payload(row)
    username = str(payload.get("username") or "").strip()
    username_locked = bool(payload.get("username_locked")) or bool(username)
    username_change_available = username_locked and not bool(payload.get("username_change_used"))
    return {
        "has_saved_profile": bool(payload),
        "username": username,
        "username_locked": username_locked,
        "username_change_available": username_change_available,
        "friend_code": ensure_google_account_friend_code(google_sub),
        "google_name": (row or {}).get("display_name") or (row or {}).get("email") or "Player",
        "theme": payload.get("theme", "Arena Blue"),
        "settings": payload.get("settings", {}),
        "progress": payload.get("progress", {}),
        "picture": (row or {}).get("picture"),
        "auth_provider": "google",
        "auth_id": f"google:{google_sub}",
    }


def get_google_account_row_by_friend_code(friend_code: str) -> dict | None:
    wanted = re.sub(r"[^A-Z0-9]", "", str(friend_code or "").upper())[:10]
    if not wanted:
        return None
    _, google_rows = collect_profile_rows()
    for row in google_rows:
        if get_google_account_friend_code(row) == wanted:
            return dict(row)
    return None


def get_authenticated_google_identity(authorization: str | None, fallback_username: str = "Player") -> dict | None:
    try:
        user = require_authenticated_user(authorization)
    except HTTPException:
        return None
    google_sub = str(user.get("sub", "")).strip()
    if not google_sub:
        return None
    row = get_google_account_row_by_sub(google_sub)
    if not row:
        return None
    payload = json.loads(row["payload"] or "{}")
    locked_username = str(payload.get("username") or "").strip()
    username = locked_username or fallback_username.strip() or row.get("display_name") or "Player"
    return {
        "google_sub": google_sub,
        "auth_id": f"google:{google_sub}",
        "username": username,
        "username_locked": bool(locked_username),
        "picture": row.get("picture"),
        "email": row.get("email"),
        "friend_code": ensure_google_account_friend_code(google_sub),
    }


def require_locked_google_identity(authorization: str | None, fallback_username: str = "Player") -> dict:
    identity = get_authenticated_google_identity(authorization, fallback_username=fallback_username)
    if not identity:
        raise HTTPException(status_code=401, detail="Sign in with Google first.")
    if not identity.get("username_locked"):
        raise HTTPException(status_code=409, detail="Choose and save your Court Vision username first.")
    return identity


def normalize_friend_pair(sub_a: str, sub_b: str) -> tuple[str, str]:
    first = str(sub_a or "").strip()
    second = str(sub_b or "").strip()
    return (first, second) if first <= second else (second, first)


def cleanup_friend_challenges():
    now = time.time()
    expired = [key for key, value in FRIEND_CHALLENGES.items() if now - value.get("created_at", now) > FRIEND_CHALLENGE_TTL_SECONDS]
    for key in expired:
        FRIEND_CHALLENGES.pop(key, None)


def get_active_google_presence() -> tuple[set[str], set[str]]:
    active_subs: set[str] = set()
    active_usernames: set[str] = set()
    cleanup_friend_challenges()

    for room in ONLINE_MATCHES.values():
        for meta in (room.get("player_meta") or {}).values():
            auth_id = str(meta.get("auth_id") or "")
            username = str(meta.get("username") or "")
            if auth_id.startswith("google:"):
                active_subs.add(auth_id.split(":", 1)[1])
            if username:
                active_usernames.add(normalized_profile_username(username))

    for entry in RANKED_QUEUE:
        player_id = str(entry.get("player_id") or "")
        if player_id.startswith("google:"):
            active_subs.add(player_id.split(":", 1)[1])
        username = str(entry.get("username") or "")
        if username:
            active_usernames.add(normalized_profile_username(username))

    for match in RANKED_MATCHES.values():
        for player_id, username in (match.get("player_names") or {}).items():
            if str(player_id).startswith("google:"):
                active_subs.add(str(player_id).split(":", 1)[1])
            if username:
                active_usernames.add(normalized_profile_username(username))

    now = int(time.time())
    last_5m = now - 300
    with get_conn() as conn:
        if USING_POSTGRES:
            rows = conn.execute(
                """
                SELECT DISTINCT LOWER(username) AS username
                FROM analytics_events
                WHERE username IS NOT NULL AND created_at >= %s
                """,
                (last_5m,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT DISTINCT LOWER(username) AS username
                FROM analytics_events
                WHERE username IS NOT NULL AND created_at >= ?
                """,
                (last_5m,),
            ).fetchall()
    for row in rows:
        username = str(row["username"] or "").strip()
        if username:
            active_usernames.add(username)
    return active_subs, active_usernames


def get_profile_payload_by_username(username: str) -> dict:
    target = normalized_profile_username(username)
    for item in build_profile_collection(include_hidden=True):
        if normalized_profile_username(item.get("username")) == target:
            return item
    return {}


def get_ranked_profile_by_username(username: str) -> dict:
    target = normalized_profile_username(username)
    with get_conn() as conn:
        if USING_POSTGRES:
            row = conn.execute(
                """
                SELECT player_id, username, elo, wins, losses, win_streak, best_win_streak
                FROM ranked_players
                WHERE LOWER(username) = %s
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (target,),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT player_id, username, elo, wins, losses, win_streak, best_win_streak
                FROM ranked_players
                WHERE LOWER(username) = ?
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (target,),
            ).fetchone()
    if not row:
        return {}
    return get_ranked_profile(row["player_id"], row["username"])


def merge_progress_payload(base_progress: dict | None, incoming_progress: dict | None) -> dict:
    base = dict(base_progress or {})
    incoming = dict(incoming_progress or {})

    merged = dict(base)
    numeric_max_fields = ("xp", "gamesPlayed", "bestScore", "onlineWins", "highestRankIndex")
    for key in numeric_max_fields:
        merged[key] = max(int(base.get(key) or 0), int(incoming.get(key) or 0))

    achievements = []
    for source in (base.get("achievements") or [], incoming.get("achievements") or []):
        if source not in achievements:
            achievements.append(source)
    merged["achievements"] = achievements

    rank_history = []
    seen = set()
    for item in (incoming.get("rankHistory") or []) + (base.get("rankHistory") or []):
        key = json.dumps(item, sort_keys=True) if isinstance(item, dict) else str(item)
        if key in seen:
            continue
        seen.add(key)
        rank_history.append(item)
    merged["rankHistory"] = rank_history[:25]

    for field in ("rank", "seasonTag"):
        merged[field] = incoming.get(field) or base.get(field) or ""

    return merged


def merge_google_profile_payload(existing_payload: dict, incoming_payload: dict, locked_username: str) -> dict:
    existing_settings = existing_payload.get("settings") or {}
    incoming_settings = incoming_payload.get("settings") or {}
    return {
        "username": locked_username,
        "username_locked": True,
        "username_change_used": bool(existing_payload.get("username_change_used")),
        "theme": incoming_payload.get("theme") or existing_payload.get("theme") or "Arena Blue",
        "settings": {**existing_settings, **incoming_settings},
        "progress": merge_progress_payload(existing_payload.get("progress"), incoming_payload.get("progress")),
    }


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
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS friend_requests (
                    id BIGSERIAL PRIMARY KEY,
                    requester_sub TEXT NOT NULL,
                    target_sub TEXT NOT NULL,
                    requester_username TEXT NOT NULL,
                    target_username TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at BIGINT NOT NULL,
                    responded_at BIGINT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS friendships (
                    id BIGSERIAL PRIMARY KEY,
                    user_a_sub TEXT NOT NULL,
                    user_b_sub TEXT NOT NULL,
                    user_a_username TEXT NOT NULL,
                    user_b_username TEXT NOT NULL,
                    created_at BIGINT NOT NULL,
                    UNIQUE (user_a_sub, user_b_sub)
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
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS friend_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    requester_sub TEXT NOT NULL,
                    target_sub TEXT NOT NULL,
                    requester_username TEXT NOT NULL,
                    target_username TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    responded_at INTEGER
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS friendships (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_a_sub TEXT NOT NULL,
                    user_b_sub TEXT NOT NULL,
                    user_a_username TEXT NOT NULL,
                    user_b_username TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    UNIQUE (user_a_sub, user_b_sub)
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
    player_pool: str = "all"


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
    player_pool: str = "all"
    answer_mode: str = "typed"
    show_headshots: bool = True


class OnlineMatchJoinRequest(BaseModel):
    room_code: str
    username: str


class RankedQueueRequest(BaseModel):
    pass


class FriendRequestPayload(BaseModel):
    target_username: str


class FriendCodeRequestPayload(BaseModel):
    friend_code: str


class FriendResponsePayload(BaseModel):
    request_id: int
    action: str


class FriendChallengePayload(BaseModel):
    target_username: str
    room_code: str


@app.on_event("startup")
def startup():
    global PLAYER_ROLE_MAP
    PLAYER_ROLE_MAP = load_player_role_map()
    init_db()


def build_online_match_questions(count: int | None, conference: str, player_pool: str = "all") -> list[dict]:
    df = load_dataframe()
    if conference and conference != "All":
        df = df[df["Conference"] == conference].copy()
    df = filter_dataframe_by_player_pool(df, player_pool)
    if df.empty:
        df = load_dataframe()
    sample = choose_random_records(df, count)
    return [build_match_question_payload(row, df) for row in sample]


def build_ranked_questions() -> list[dict]:
    df = load_dataframe()
    sample = choose_random_records(df, RANKED_QUESTION_COUNT)
    return [build_match_question_payload(row, df) for row in sample]


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
    identity = require_locked_google_identity(authorization)
    return {
        "player_id": identity["auth_id"],
        "google_sub": identity["google_sub"],
        "username": identity["username"],
        "email": identity["email"],
        "picture": identity["picture"],
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
    question = dict(match["questions"][match["current_index"]])
    question.pop("accepted_answers", None)
    question.pop("college", None)
    return question


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


def build_chat_message_payload(sender: str, text: str, message_id: str | None = None) -> dict:
    return {
        "id": message_id or secrets.token_urlsafe(8),
        "sender": sender,
        "text": text,
        "created_at": int(time.time()),
    }


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
    base_payload = {
        "type": "match_started",
        "room_code": room["room_code"],
        "players": players,
        "scores": summarize_online_scores(room),
        "current_index": 0,
        "total_questions": len(room["questions"]),
        "question": serialize_online_question(room),
        "answer_mode": room["answer_mode"],
        "player_pool": room.get("player_pool", "all"),
    }
    for player in players:
        ws = room["connections"].get(player)
        if not ws:
            continue
        opponent = next((item for item in players if item != player), None)
        opponent_meta = (room.get("player_meta") or {}).get(opponent, {}) if opponent else {}
        await send_ws(
            ws,
            {
                **base_payload,
                "opponent_auth_id": opponent_meta.get("auth_id", ""),
                "opponent_picture": opponent_meta.get("picture", ""),
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
    accepted = {normalize_answer(item) for item in current_question["accepted_answers"]}
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


async def handle_online_chat_message(room: dict, username: str, text: str, message_id: str | None = None):
    cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
    if not cleaned:
        return
    normalized_message_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(message_id or "").strip())[:48] or None
    message = build_chat_message_payload(username, cleaned[:280], normalized_message_id)
    existing_ids = {item.get("id") for item in room.get("chat_messages", []) if isinstance(item, dict)}
    if message["id"] in existing_ids:
        return
    room.setdefault("chat_messages", []).append(message)
    room["chat_messages"] = room["chat_messages"][-100:]
    await broadcast_room(
        room,
        {
            "type": "chat_message",
            "message": message,
        },
    )


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
    google_name = str(token_info.get("name") or email.split("@")[0] or "Player").strip()
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
                (google_sub, email, google_name, picture, google_sub),
            )
            row = conn.execute(
                "SELECT payload FROM google_accounts WHERE google_sub = %s",
                (google_sub,),
            ).fetchone()
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
                (google_sub, email, google_name, picture, google_sub),
            )
            row = conn.execute(
                "SELECT payload FROM google_accounts WHERE google_sub = ?",
                (google_sub,),
            ).fetchone()
        conn.commit()

    stored_payload = json.loads((row["payload"] if row else "{}") or "{}")
    locked_username = str(stored_payload.get("username") or "").strip()
    username_locked = bool(stored_payload.get("username_locked")) or bool(locked_username)
    username_change_available = username_locked and not bool(stored_payload.get("username_change_used"))
    auth_token = sign_session_payload(
        {
            "sub": google_sub,
            "email": email,
            "name": google_name,
            "picture": picture,
            "exp": int(time.time()) + (60 * 60 * 24 * 30),
        }
    )

    return {
        "token": auth_token,
        "user": {
            "sub": google_sub,
            "email": email,
            "name": locked_username or google_name,
            "google_name": google_name,
            "picture": picture,
            "username": locked_username,
            "username_locked": username_locked,
            "username_change_available": username_change_available,
            "friend_code": ensure_google_account_friend_code(google_sub),
        },
    }


@app.get("/api/auth/me")
def auth_me(authorization: str | None = Header(default=None)):
    user = require_authenticated_user(authorization)
    google_sub = str(user.get("sub", "")).strip()
    row = get_google_account_row_by_sub(google_sub) if google_sub else None
    return {"user": build_authenticated_user_payload(user, row)}


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

    return {"profile": build_authenticated_profile_payload(dict(row), google_sub)}


@app.get("/api/auth/bootstrap")
def auth_bootstrap(authorization: str | None = Header(default=None)):
    user = require_authenticated_user(authorization)
    google_sub = str(user.get("sub", "")).strip()
    if not google_sub:
        raise HTTPException(status_code=401, detail="Invalid authenticated user.")

    row = get_google_account_row_by_sub(google_sub)
    if not row:
        raise HTTPException(status_code=404, detail="Authenticated profile not found.")

    user_payload = build_authenticated_user_payload(user, row)
    profile_payload = build_authenticated_profile_payload(row, google_sub)
    ranked_profile = (
        get_ranked_profile(f"google:{google_sub}", user_payload["username"])
        if user_payload.get("username_locked") and user_payload.get("username")
        else None
    )

    return {
        "user": user_payload,
        "profile": profile_payload,
        "ranked_profile": ranked_profile,
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


def build_friend_user_summary(username: str, google_sub: str, picture: str | None = None) -> dict:
    profile = get_profile_payload_by_username(username)
    progress = (profile.get("progress") or {}) if profile else {}
    ranked = get_ranked_profile_by_username(username)
    active_subs, active_usernames = get_active_google_presence()
    return {
        "username": username,
        "auth_id": f"google:{google_sub}",
        "picture": picture,
        "online": google_sub in active_subs or normalized_profile_username(username) in active_usernames,
        "xp": int(progress.get("xp") or 0),
        "rank": str(progress.get("rank") or ""),
        "best_score": int(progress.get("bestScore") or 0),
        "games_played": int(progress.get("gamesPlayed") or 0),
        "online_wins": int(progress.get("onlineWins") or 0),
        "ranked": ranked or {
            "elo": 0,
            "division": "Unranked",
            "wins": 0,
            "losses": 0,
            "win_streak": 0,
        },
    }


@app.get("/api/friends")
def friends_summary(authorization: str | None = Header(default=None)):
    identity = require_locked_google_identity(authorization)

    google_sub = identity["google_sub"]
    with get_conn() as conn:
        if USING_POSTGRES:
            friendships = conn.execute(
                """
                SELECT user_a_sub, user_b_sub, user_a_username, user_b_username, created_at
                FROM friendships
                WHERE user_a_sub = %s OR user_b_sub = %s
                ORDER BY created_at DESC
                """,
                (google_sub, google_sub),
            ).fetchall()
            incoming = conn.execute(
                """
                SELECT id, requester_sub, requester_username, created_at
                FROM friend_requests
                WHERE target_sub = %s AND status = %s
                ORDER BY created_at DESC
                """,
                (google_sub, "pending"),
            ).fetchall()
            outgoing = conn.execute(
                """
                SELECT id, target_sub, target_username, created_at
                FROM friend_requests
                WHERE requester_sub = %s AND status = %s
                ORDER BY created_at DESC
                """,
                (google_sub, "pending"),
            ).fetchall()
        else:
            friendships = conn.execute(
                """
                SELECT user_a_sub, user_b_sub, user_a_username, user_b_username, created_at
                FROM friendships
                WHERE user_a_sub = ? OR user_b_sub = ?
                ORDER BY created_at DESC
                """,
                (google_sub, google_sub),
            ).fetchall()
            incoming = conn.execute(
                """
                SELECT id, requester_sub, requester_username, created_at
                FROM friend_requests
                WHERE target_sub = ? AND status = ?
                ORDER BY created_at DESC
                """,
                (google_sub, "pending"),
            ).fetchall()
            outgoing = conn.execute(
                """
                SELECT id, target_sub, target_username, created_at
                FROM friend_requests
                WHERE requester_sub = ? AND status = ?
                ORDER BY created_at DESC
                """,
                (google_sub, "pending"),
            ).fetchall()

    cleanup_friend_challenges()
    friend_entries = []
    for row in friendships:
        if row["user_a_sub"] == google_sub:
            friend_sub = row["user_b_sub"]
            friend_username = row["user_b_username"]
        else:
            friend_sub = row["user_a_sub"]
            friend_username = row["user_a_username"]
        friend_row = get_google_account_row_by_sub(friend_sub)
        picture = friend_row.get("picture") if friend_row else None
        summary = build_friend_user_summary(friend_username, friend_sub, picture)
        summary["friends_since"] = int(row["created_at"] or 0)
        incoming_challenge = next(
            (
                {
                    "challenge_id": challenge["id"],
                    "from_username": challenge["from_username"],
                    "room_code": challenge["room_code"],
                    "created_at": int(challenge["created_at"]),
                }
                for challenge in FRIEND_CHALLENGES.values()
                if challenge.get("target_sub") == google_sub and challenge.get("from_sub") == friend_sub
            ),
            None,
        )
        summary["incoming_challenge"] = incoming_challenge
        friend_entries.append(summary)

    return {
        "friend_code": identity.get("friend_code", ""),
        "friends": friend_entries,
        "incoming_requests": [
            {
                "id": int(row["id"]),
                "username": row["requester_username"],
                "created_at": int(row["created_at"] or 0),
            }
            for row in incoming
        ],
        "outgoing_requests": [
            {
                "id": int(row["id"]),
                "username": row["target_username"],
                "created_at": int(row["created_at"] or 0),
            }
            for row in outgoing
        ],
    }


@app.post("/api/friends/request")
def create_friend_request(payload: FriendRequestPayload, authorization: str | None = Header(default=None)):
    identity = require_locked_google_identity(authorization)
    target_row = get_google_account_row_by_username(payload.target_username)
    if not target_row:
        raise HTTPException(status_code=404, detail="That player does not have a Google-backed account.")
    target_sub = str(target_row["google_sub"])
    if target_sub == identity["google_sub"]:
        raise HTTPException(status_code=400, detail="You cannot add yourself.")
    user_a_sub, user_b_sub = normalize_friend_pair(identity["google_sub"], target_sub)
    with get_conn() as conn:
        if USING_POSTGRES:
            existing_friend = conn.execute(
                "SELECT id FROM friendships WHERE user_a_sub = %s AND user_b_sub = %s",
                (user_a_sub, user_b_sub),
            ).fetchone()
            existing_request = conn.execute(
                """
                SELECT id, requester_sub, target_sub
                FROM friend_requests
                WHERE ((requester_sub = %s AND target_sub = %s) OR (requester_sub = %s AND target_sub = %s))
                  AND status = %s
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (identity["google_sub"], target_sub, target_sub, identity["google_sub"], "pending"),
            ).fetchone()
        else:
            existing_friend = conn.execute(
                "SELECT id FROM friendships WHERE user_a_sub = ? AND user_b_sub = ?",
                (user_a_sub, user_b_sub),
            ).fetchone()
            existing_request = conn.execute(
                """
                SELECT id, requester_sub, target_sub
                FROM friend_requests
                WHERE ((requester_sub = ? AND target_sub = ?) OR (requester_sub = ? AND target_sub = ?))
                  AND status = ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (identity["google_sub"], target_sub, target_sub, identity["google_sub"], "pending"),
            ).fetchone()
        if existing_friend:
            return {"saved": True, "status": "already_friends"}
        if existing_request:
            if existing_request["requester_sub"] == target_sub:
                raise HTTPException(status_code=409, detail="That player already sent you a friend request.")
            return {"saved": True, "status": "already_sent"}
        now = int(time.time())
        if USING_POSTGRES:
            conn.execute(
                """
                INSERT INTO friend_requests (requester_sub, target_sub, requester_username, target_username, status, created_at, responded_at)
                VALUES (%s, %s, %s, %s, %s, %s, NULL)
                """,
                (identity["google_sub"], target_sub, identity["username"], google_account_username(target_row), "pending", now),
            )
        else:
            conn.execute(
                """
                INSERT INTO friend_requests (requester_sub, target_sub, requester_username, target_username, status, created_at, responded_at)
                VALUES (?, ?, ?, ?, ?, ?, NULL)
                """,
                (identity["google_sub"], target_sub, identity["username"], google_account_username(target_row), "pending", now),
            )
        conn.commit()
    return {"saved": True, "status": "sent"}


@app.post("/api/friends/request-by-code")
def create_friend_request_by_code(payload: FriendCodeRequestPayload, authorization: str | None = Header(default=None)):
    target_row = get_google_account_row_by_friend_code(payload.friend_code)
    if not target_row:
        raise HTTPException(status_code=404, detail="That friend code was not found.")
    target_username = google_account_username(target_row)
    return create_friend_request(FriendRequestPayload(target_username=target_username), authorization)


@app.post("/api/friends/respond")
def respond_friend_request(payload: FriendResponsePayload, authorization: str | None = Header(default=None)):
    identity = require_locked_google_identity(authorization)
    action = str(payload.action or "").strip().lower()
    if action not in {"accept", "decline"}:
        raise HTTPException(status_code=400, detail="Invalid friend request action.")
    with get_conn() as conn:
        if USING_POSTGRES:
            row = conn.execute(
                "SELECT id, requester_sub, requester_username, target_sub, target_username, status FROM friend_requests WHERE id = %s",
                (payload.request_id,),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT id, requester_sub, requester_username, target_sub, target_username, status FROM friend_requests WHERE id = ?",
                (payload.request_id,),
            ).fetchone()
        if not row or row["target_sub"] != identity["google_sub"] or row["status"] != "pending":
            raise HTTPException(status_code=404, detail="Friend request not found.")
        now = int(time.time())
        if USING_POSTGRES:
            conn.execute(
                "UPDATE friend_requests SET status = %s, responded_at = %s WHERE id = %s",
                (action, now, payload.request_id),
            )
        else:
            conn.execute(
                "UPDATE friend_requests SET status = ?, responded_at = ? WHERE id = ?",
                (action, now, payload.request_id),
            )
        if action == "accept":
            user_a_sub, user_b_sub = normalize_friend_pair(row["requester_sub"], row["target_sub"])
            user_a_username = row["requester_username"] if user_a_sub == row["requester_sub"] else row["target_username"]
            user_b_username = row["target_username"] if user_b_sub == row["target_sub"] else row["requester_username"]
            if USING_POSTGRES:
                conn.execute(
                    """
                    INSERT INTO friendships (user_a_sub, user_b_sub, user_a_username, user_b_username, created_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (user_a_sub, user_b_sub) DO NOTHING
                    """,
                    (user_a_sub, user_b_sub, user_a_username, user_b_username, now),
                )
            else:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO friendships (user_a_sub, user_b_sub, user_a_username, user_b_username, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (user_a_sub, user_b_sub, user_a_username, user_b_username, now),
                )
        conn.commit()
    return {"saved": True, "status": action}


@app.post("/api/friends/challenge")
def create_friend_challenge(payload: FriendChallengePayload, authorization: str | None = Header(default=None)):
    identity = require_locked_google_identity(authorization)
    target_row = get_google_account_row_by_username(payload.target_username)
    if not target_row:
        raise HTTPException(status_code=404, detail="Friend not found.")
    target_sub = str(target_row["google_sub"])
    if target_sub == identity["google_sub"]:
        raise HTTPException(status_code=400, detail="You cannot challenge yourself.")
    user_a_sub, user_b_sub = normalize_friend_pair(identity["google_sub"], target_sub)
    with get_conn() as conn:
        if USING_POSTGRES:
            friendship = conn.execute(
                "SELECT id FROM friendships WHERE user_a_sub = %s AND user_b_sub = %s",
                (user_a_sub, user_b_sub),
            ).fetchone()
        else:
            friendship = conn.execute(
                "SELECT id FROM friendships WHERE user_a_sub = ? AND user_b_sub = ?",
                (user_a_sub, user_b_sub),
            ).fetchone()
    if not friendship:
        raise HTTPException(status_code=403, detail="You can only challenge confirmed friends.")
    room = get_online_room(payload.room_code)
    challenge_id = secrets.token_urlsafe(10)
    FRIEND_CHALLENGES[challenge_id] = {
        "id": challenge_id,
        "from_sub": identity["google_sub"],
        "from_username": identity["username"],
        "target_sub": target_sub,
        "target_username": google_account_username(target_row),
        "room_code": room["room_code"],
        "created_at": time.time(),
    }
    return {"saved": True, "challenge_id": challenge_id}


@app.post("/api/online-match/create")
def create_online_match(payload: OnlineMatchCreateRequest, authorization: str | None = Header(default=None)):
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
    identity = get_authenticated_google_identity(authorization, fallback_username=username)
    picture = identity.get("picture") if identity else None
    auth_id = identity.get("auth_id") if identity else ""
    ONLINE_MATCHES[room_code] = {
        "room_code": room_code,
        "players": [username, None],
        "player_meta": {
            username: {
                "username": username,
                "auth_id": auth_id,
                "picture": picture,
            }
        },
        "connections": {},
        "question_count": payload.count,
        "questions": build_online_match_questions(payload.count, payload.conference, payload.player_pool),
        "scores": {username: 0},
        "current_index": 0,
        "round_submissions": {},
        "rematch_requests": set(),
        "started": False,
        "answer_mode": payload.answer_mode,
        "show_headshots": payload.show_headshots,
        "conference": payload.conference,
        "player_pool": payload.player_pool,
        "created_at": time.time(),
        "chat_messages": [],
    }
    return {
        "room_code": room_code,
        "player_name": username,
        "player_auth_id": auth_id,
        "answer_mode": payload.answer_mode,
        "show_headshots": payload.show_headshots,
        "question_count": payload.count,
        "conference": payload.conference,
        "player_pool": payload.player_pool,
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
def join_online_match(payload: OnlineMatchJoinRequest, authorization: str | None = Header(default=None)):
    room = get_online_room(payload.room_code)
    username = payload.username.strip() or "Guest"
    players = room["players"]

    if players[1] and players[1] != username:
        raise HTTPException(status_code=409, detail="This match is already full.")
    if username == players[0]:
        raise HTTPException(status_code=409, detail="Use a different username from the host.")
    identity = get_authenticated_google_identity(authorization, fallback_username=username)
    picture = identity.get("picture") if identity else None
    auth_id = identity.get("auth_id") if identity else ""
    room["players"][1] = username
    room["scores"].setdefault(username, 0)
    room.setdefault("player_meta", {})[username] = {
        "username": username,
        "auth_id": auth_id,
        "picture": picture,
    }
    return {
        "room_code": room["room_code"],
        "player_name": username,
        "player_auth_id": auth_id,
        "host": players[0],
        "answer_mode": room["answer_mode"],
        "show_headshots": room["show_headshots"],
        "question_count": room["question_count"],
        "conference": room["conference"],
        "player_pool": room.get("player_pool", "all"),
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
        room["questions"] = build_online_match_questions(
            room.get("question_count"),
            room["conference"],
            room.get("player_pool", "all"),
        )
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
                "player_pool": room.get("player_pool", "all"),
            },
        )


@app.get("/api/players")
def players(count: int | None = 10):
    df = load_dataframe()
    sample = choose_random_records(df, count)
    return {"players": [build_question_payload(row, df) for row in sample]}


@app.get("/api/player-directory")
def player_directory(q: str = "", limit: int = 8):
    df = load_dataframe()
    query = str(q or "").strip()
    if not query:
        return {"players": [], "query": ""}

    normalized_query = normalize_answer(query)
    search_series = df["Player Name"].astype(str)

    starts_with_mask = search_series.apply(lambda value: normalize_answer(value).startswith(normalized_query))
    contains_mask = search_series.apply(lambda value: normalized_query in normalize_answer(value))

    starts_with = df[starts_with_mask].copy()
    contains = df[contains_mask & ~starts_with_mask].copy()
    results_df = pd.concat([starts_with, contains], ignore_index=True).head(max(1, min(limit, 20)))

    return {
        "query": query,
        "players": [build_directory_payload(row) for _, row in results_df.iterrows()],
    }


@app.get("/api/meta")
def meta():
    df = load_dataframe()
    conferences = sorted({normalize_conference_name(item) for item in df["Conference"].tolist() if normalize_conference_name(item) != "None"})
    return {
        "conferences": ["All"] + conferences,
        "player_pools": get_player_pool_counts(df),
    }


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
    df = filter_dataframe_by_player_pool(df, payload.player_pool)
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
    limit = max(1, min(int(limit or 20), 100))
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
def post_leaderboard(entry: LeaderboardEntry, authorization: str | None = Header(default=None)):
    identity = require_locked_google_identity(authorization)
    username = str(entry.username or "").strip()
    if normalized_profile_username(username) != normalized_profile_username(identity["username"]):
        raise HTTPException(status_code=403, detail="Leaderboard submissions must use your signed-in username.")
    if entry.score < 0 or entry.score > len(load_dataframe()):
        raise HTTPException(status_code=400, detail="Invalid leaderboard score.")
    if entry.accuracy < 0 or entry.accuracy > 100:
        raise HTTPException(status_code=400, detail="Invalid leaderboard accuracy.")
    with get_conn() as conn:
        if USING_POSTGRES:
            conn.execute(
                """
                INSERT INTO leaderboard_entries (username, score, accuracy, mode, run_date, daily)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    identity["username"],
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
                    identity["username"],
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
    if normalized_username in HIDDEN_LEADERBOARD_USERNAMES:
        raise HTTPException(status_code=400, detail="Choose a different username.")
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
    requested_username = profile.username.strip()
    incoming_payload = {
        "username": requested_username,
        "theme": profile.theme,
        "settings": profile.settings or {},
        "progress": profile.progress or {},
    }

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

        existing_payload = json.loads((row["payload"] if row else "{}") or "{}")
        existing_username = str(existing_payload.get("username") or "").strip()
        username_locked = bool(existing_payload.get("username_locked")) or bool(existing_username)
        username_change_available = username_locked and not bool(existing_payload.get("username_change_used"))
        normalized_existing_username = normalized_profile_username(existing_username)
        normalized_requested_username = normalized_profile_username(requested_username)
        if normalized_requested_username in HIDDEN_LEADERBOARD_USERNAMES:
            raise HTTPException(status_code=400, detail="Choose a different username.")
        is_rename = bool(
            username_locked
            and requested_username
            and normalized_requested_username
            and normalized_requested_username != normalized_existing_username
        )

        if username_locked and not is_rename:
            locked_username = existing_username
        elif username_locked and is_rename:
            if not username_change_available:
                raise HTTPException(status_code=409, detail="This Google account already used its one username change.")
            locked_username = requested_username
            if google_username_taken(normalized_requested_username, ignore_google_sub=google_sub):
                raise HTTPException(status_code=409, detail="That username is already in use.")
        else:
            locked_username = requested_username
            if not locked_username:
                raise HTTPException(status_code=400, detail="Choose a username first.")
            if google_username_taken(normalized_requested_username, ignore_google_sub=google_sub):
                raise HTTPException(status_code=409, detail="That username is already in use.")

        guest_payload = {}
        should_merge_guest_profile = bool(locked_username and ((not username_locked) or is_rename))
        if should_merge_guest_profile:
            if USING_POSTGRES:
                guest_row = conn.execute(
                    "SELECT payload FROM profiles WHERE username = %s",
                    (locked_username,),
                ).fetchone()
            else:
                guest_row = conn.execute(
                    "SELECT payload FROM profiles WHERE username = ?",
                    (locked_username,),
                ).fetchone()
            if guest_row:
                guest_payload = json.loads(guest_row["payload"] or "{}")

        payload = merge_google_profile_payload(
            existing_payload,
            {
                **incoming_payload,
                "theme": incoming_payload["theme"] or guest_payload.get("theme") or existing_payload.get("theme") or "Arena Blue",
                "settings": {**(guest_payload.get("settings") or {}), **incoming_payload.get("settings", {})},
                "progress": merge_progress_payload(guest_payload.get("progress"), incoming_payload.get("progress")),
            },
            locked_username,
        )
        if is_rename:
            payload["username_change_used"] = True

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
            if should_merge_guest_profile and guest_payload:
                conn.execute("DELETE FROM profiles WHERE username = %s", (locked_username,))
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
            if should_merge_guest_profile and guest_payload:
                conn.execute("DELETE FROM profiles WHERE username = ?", (locked_username,))
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


@app.get("/api/admin/live")
def admin_live_summary(x_analytics_key: str | None = Header(default=None)):
    require_analytics_access(x_analytics_key)
    cleanup_friend_challenges()
    online_matches = []
    for room in ONLINE_MATCHES.values():
        players = [player for player in room.get("players", []) if player]
        online_matches.append(
            {
                "room_code": room.get("room_code"),
                "started": bool(room.get("started")),
                "players": players,
                "connected_players": sorted(list((room.get("connections") or {}).keys())),
                "scores": summarize_online_scores(room),
                "current_index": int(room.get("current_index") or 0),
                "total_questions": len(room.get("questions") or []),
                "created_at": int(room.get("created_at") or 0),
            }
        )
    ranked_matches = []
    for match in RANKED_MATCHES.values():
        ranked_matches.append(
            {
                "match_id": match.get("match_id"),
                "players": [match.get("player_names", {}).get(player_id, "Player") for player_id in match.get("players", [])],
                "scores": summarize_ranked_scores(match),
                "current_index": int(match.get("current_index") or 0),
                "total_questions": len(match.get("questions") or []),
                "started": bool(match.get("started")),
            }
        )
    queue = [
        {
            "username": entry.get("username") or "Player",
            "player_id": entry.get("player_id") or "",
            "joined_at": int(entry.get("joined_at") or 0),
        }
        for entry in RANKED_QUEUE
    ]
    return {
        "online_matches": online_matches,
        "ranked_matches": ranked_matches,
        "ranked_queue": queue,
        "friend_challenges": list(FRIEND_CHALLENGES.values()),
    }


@app.get("/api/admin/users")
def admin_user_lookup(q: str = "", x_analytics_key: str | None = Header(default=None), limit: int = 20):
    require_analytics_access(x_analytics_key)
    query = normalized_profile_username(q)
    profiles = build_profile_collection(include_hidden=True)
    filtered = []
    for profile in profiles:
        username = str(profile.get("username") or "").strip()
        normalized = normalized_profile_username(username)
        if query and query not in normalized:
            continue
        ranked = get_ranked_profile_by_username(username)
        filtered.append(
            {
                "username": username,
                "auth_provider": profile.get("auth_provider") or "guest",
                "auth_id": profile.get("auth_id") or "",
                "picture": profile.get("picture") or "",
                "progress": profile.get("progress") or {},
                "ranked": ranked or {},
            }
        )
    filtered.sort(
        key=lambda item: (
            -int((item.get("ranked") or {}).get("elo") or 0),
            -int((item.get("progress") or {}).get("xp") or 0),
            item.get("username", "").lower(),
        )
    )
    return {"users": filtered[: max(1, min(limit, 100))]}


@app.post("/api/admin/ranked/reset/{username}")
def admin_reset_ranked_user(username: str, x_analytics_key: str | None = Header(default=None)):
    require_analytics_access(x_analytics_key)
    target = normalized_profile_username(username)
    if not target:
        raise HTTPException(status_code=400, detail="Missing username.")
    with get_conn() as conn:
        if USING_POSTGRES:
            result = conn.execute(
                """
                UPDATE ranked_players
                SET elo = 0, wins = 0, losses = 0, win_streak = 0, best_win_streak = 0, updated_at = %s
                WHERE LOWER(username) = %s
                """,
                (int(time.time()), target),
            )
        else:
            result = conn.execute(
                """
                UPDATE ranked_players
                SET elo = 0, wins = 0, losses = 0, win_streak = 0, best_win_streak = 0, updated_at = ?
                WHERE LOWER(username) = ?
                """,
                (int(time.time()), target),
            )
        conn.commit()
    return {"saved": True, "count": int(getattr(result, "rowcount", 0) or 0)}


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
    if not room:
        await websocket.close(code=4404)
        return

    room.setdefault("player_meta", {})
    host_username = room["players"][0]
    guest_username = room["players"][1]
    if normalized_username not in room["players"]:
        if normalized_username == host_username:
            await websocket.close(code=4404)
            return
        if guest_username is None:
            room["players"][1] = normalized_username
            room["scores"].setdefault(normalized_username, 0)
        elif guest_username not in room["connections"]:
            room["scores"].pop(guest_username, None)
            room["player_meta"].pop(guest_username, None)
            room["players"][1] = normalized_username
            room["scores"].setdefault(normalized_username, 0)
        else:
            await websocket.close(code=4404)
            return

    await websocket.accept()
    room["connections"][normalized_username] = websocket

    opponent = next((player for player in room["players"] if player and player != normalized_username), None)
    player_meta = room.get("player_meta", {}).get(normalized_username, {})
    opponent_meta = room.get("player_meta", {}).get(opponent, {}) if opponent else {}
    await send_ws(
        websocket,
        {
            "type": "room_joined",
            "room_code": room["room_code"],
            "player_name": normalized_username,
            "player_auth_id": player_meta.get("auth_id", ""),
            "opponent_name": opponent,
            "opponent_auth_id": opponent_meta.get("auth_id", ""),
            "opponent_picture": opponent_meta.get("picture", ""),
            "waiting": not room["started"],
            "scores": summarize_online_scores(room),
            "answer_mode": room["answer_mode"],
            "show_headshots": room["show_headshots"],
            "question_count": room["question_count"],
            "conference": room["conference"],
            "player_pool": room.get("player_pool", "all"),
            "chat_history": room.get("chat_messages", []),
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
            elif event_type == "chat_message":
                await handle_online_chat_message(
                    room,
                    normalized_username,
                    payload.get("text", ""),
                    payload.get("client_message_id"),
                )
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
