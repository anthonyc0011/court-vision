import json
import os
import random
import re
import sys
import time
import unicodedata

import pandas as pd
import tkinter as tk
from tkinter import font as tkfont
from PIL import Image, ImageTk


# ===== Load Excel data =====
if getattr(sys, "frozen", False):
    base_dir = sys._MEIPASS
else:
    base_dir = os.path.dirname(os.path.abspath(__file__))

headshot_file_path = os.path.join(base_dir, "ALL_NBA_PLAYERS_with_headshots.xlsx")
default_file_path = os.path.join(base_dir, "ALL_NBA_PLAYERS.xlsx")
file_path = headshot_file_path if os.path.exists(headshot_file_path) else default_file_path
high_score_file = os.path.join(base_dir, "quiz_high_scores.json")
stats_file = os.path.join(base_dir, "quiz_stats.json")
settings_file = os.path.join(base_dir, "quiz_settings.json")
leaderboard_file = os.path.join(base_dir, "quiz_leaderboard.json")
profiles_file = os.path.join(base_dir, "quiz_profiles.json")
headshot_dir = os.path.join(base_dir, "headshots")
school_logo_dir = os.path.join(base_dir, "school_logos")

try:
    df = pd.read_excel(file_path)
except Exception as e:
    raise Exception(f"Could not read Excel file: {e}")

required_columns = ["Player Name", "College / Last School", "Conference"]
for col in required_columns:
    if col not in df.columns:
        raise Exception(f"Excel file must have the column '{col}'. Your columns: {list(df.columns)}")

df["College / Last School"] = df["College / Last School"].fillna("None")
df = df[df["College / Last School"].str.lower() != "none"].copy()


# ===== Data helpers =====
SCHOOL_ALIASES = {
    "connecticut": ["uconn"],
    "southern california": ["usc"],
    "california los angeles": ["ucla", "u c l a"],
    "brigham young": ["byu"],
    "texas christian": ["tcu"],
    "southern methodist": ["smu"],
    "louisiana state": ["lsu"],
    "massachusetts": ["umass"],
    "virginia commonwealth": ["vcu"],
    "nevada las vegas": ["unlv"],
    "southern illinois": ["siu"],
    "central florida": ["ucf"],
    "south florida": ["usf"],
    "texas el paso": ["utep"],
    "texas san antonio": ["utsa"],
    "texas arlington": ["uta"],
    "mississippi": ["ole miss"],
    "saint josephs": ["st josephs", "saint joseph's", "st joseph's"],
    "saint johns": ["st johns", "saint john's", "st john's"],
    "saint marys": ["st marys", "saint mary's", "st mary's"],
    "north carolina state": ["nc state", "n c state"],
    "nevada reno": ["nevada"],
}

OPTIONAL_ALIAS_COLUMNS = ["Accepted Answers", "Aliases", "Alternate Names"]


def normalize_answer(text):
    text = str(text).strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[.,'\"()/-]", " ", text)
    text = re.sub(r"\bsaint\b", "st", text)
    text = re.sub(r"\buniversity\b", "", text)
    text = re.sub(r"\bthe\b", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def get_aliases_from_row(row):
    aliases = []
    for col in OPTIONAL_ALIAS_COLUMNS:
        if col in row and pd.notna(row[col]):
            parts = re.split(r"[;,|]", str(row[col]))
            aliases.extend([part.strip() for part in parts if part.strip()])
    return aliases


def get_answer_variants(row):
    correct = str(row["College / Last School"]).strip()
    variants = {normalize_answer(correct)}

    for alias in get_aliases_from_row(row):
        variants.add(normalize_answer(alias))

    normalized_correct = normalize_answer(correct)
    for canonical, aliases in SCHOOL_ALIASES.items():
        normalized_canonical = normalize_answer(canonical)
        normalized_aliases = {normalize_answer(alias) for alias in aliases}
        if normalized_correct == normalized_canonical or normalized_correct in normalized_aliases:
            variants.add(normalized_canonical)
            variants.update(normalized_aliases)

    return variants


def is_correct_answer(user_answer, row):
    return normalize_answer(user_answer) in get_answer_variants(row)


def format_time(seconds_total):
    minutes = int(seconds_total // 60)
    seconds = int(seconds_total % 60)
    return f"{minutes:02d}:{seconds:02d}"


def load_high_scores():
    if not os.path.exists(high_score_file):
        return {}
    try:
        with open(high_score_file, "r", encoding="utf-8") as file:
            data = json.load(file)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_high_scores():
    with open(high_score_file, "w", encoding="utf-8") as file:
        json.dump(high_scores, file, indent=2)
    persist_current_profile()


def load_stats():
    default_stats = {
        "games_played": 0,
        "questions_answered": 0,
        "correct_answers": 0,
        "wrong_answers": 0,
        "skipped_answers": 0,
        "hints_used": 0,
        "best_streak_ever": 0,
        "perfect_games": 0,
        "timed_perfect_games": 0,
        "hard_mode_wins": 0,
        "achievements": [],
        "xp": 0,
        "rank": "Rookie",
        "conference_stats": {},
        "reward_points": 0,
        "daily_challenge_wins": 0,
        "daily_reward_claims": []
    }
    if not os.path.exists(stats_file):
        return default_stats
    try:
        with open(stats_file, "r", encoding="utf-8") as file:
            data = json.load(file)
            if isinstance(data, dict):
                default_stats.update(data)
            return default_stats
    except Exception:
        return default_stats


def default_stats_dict():
    return {
        "games_played": 0,
        "questions_answered": 0,
        "correct_answers": 0,
        "wrong_answers": 0,
        "skipped_answers": 0,
        "hints_used": 0,
        "best_streak_ever": 0,
        "perfect_games": 0,
        "timed_perfect_games": 0,
        "hard_mode_wins": 0,
        "achievements": [],
        "xp": 0,
        "rank": "Rookie",
        "conference_stats": {},
        "reward_points": 0,
        "daily_challenge_wins": 0,
        "daily_reward_claims": []
    }


def save_stats():
    with open(stats_file, "w", encoding="utf-8") as file:
        json.dump(lifetime_stats, file, indent=2)
    persist_current_profile()


def default_settings_dict():
    return {
        "theme": "Arena Blue",
        "show_headshots": True,
        "text_scale": "Normal",
        "window_size": "1050x760",
        "autosave_settings": True,
        "default_quiz_length": "25",
        "default_quiz_mode": "Practice",
        "default_answer_style": "Typed",
        "sound_enabled": True,
        "player_one_name": "Player 1",
        "player_two_name": "Player 2",
    }


def load_settings():
    settings = default_settings_dict()
    if not os.path.exists(settings_file):
        return settings
    try:
        with open(settings_file, "r", encoding="utf-8") as file:
            data = json.load(file)
            if isinstance(data, dict):
                settings.update(data)
    except Exception:
        pass
    return settings


def save_settings():
    if not user_settings.get("autosave_settings", True):
        return
    with open(settings_file, "w", encoding="utf-8") as file:
        json.dump(user_settings, file, indent=2)
    persist_current_profile()


def load_leaderboard():
    if not os.path.exists(leaderboard_file):
        return {"entries": []}
    try:
        with open(leaderboard_file, "r", encoding="utf-8") as file:
            data = json.load(file)
            if isinstance(data, dict) and "entries" in data:
                return data
    except Exception:
        pass
    return {"entries": []}


def save_leaderboard():
    with open(leaderboard_file, "w", encoding="utf-8") as file:
        json.dump(leaderboard_data, file, indent=2)


def default_profile_bundle(name):
    settings = default_settings_dict()
    settings["profile_name"] = name
    return {
        "settings": settings,
        "stats": default_stats_dict(),
        "high_scores": {},
    }


def load_profiles_store(seed_settings, seed_stats, seed_scores):
    default_name = seed_settings.get("profile_name", "Guest")
    default_bundle = {
        "settings": dict(seed_settings),
        "stats": dict(seed_stats),
        "high_scores": dict(seed_scores),
    }
    if not os.path.exists(profiles_file):
        return {"current_profile": default_name, "profiles": {default_name: default_bundle}}
    try:
        with open(profiles_file, "r", encoding="utf-8") as file:
            data = json.load(file)
            if isinstance(data, dict) and isinstance(data.get("profiles"), dict):
                if not data["profiles"]:
                    data["profiles"][default_name] = default_bundle
                current = data.get("current_profile") or next(iter(data["profiles"]))
                if current not in data["profiles"]:
                    current = next(iter(data["profiles"]))
                data["current_profile"] = current
                return data
    except Exception:
        pass
    return {"current_profile": default_name, "profiles": {default_name: default_bundle}}


def save_profiles_store():
    with open(profiles_file, "w", encoding="utf-8") as file:
        json.dump(profiles_store, file, indent=2)


def reset_all_progress():
    global lifetime_stats, high_scores
    lifetime_stats = default_stats_dict()
    high_scores = {}
    save_stats()
    save_high_scores()
    update_high_score_preview()


def reset_stats_category(category):
    if category == "scores":
        high_scores.clear()
        save_high_scores()
    elif category == "stats":
        defaults = default_stats_dict()
        for key, value in defaults.items():
            lifetime_stats[key] = value
        save_stats()
    elif category == "xp":
        lifetime_stats["xp"] = 0
        lifetime_stats["rank"] = "Rookie"
        save_stats()


def persist_current_profile():
    if "profiles_store" not in globals():
        return
    profile_name = current_profile_var.get().strip() if "current_profile_var" in globals() else profiles_store.get("current_profile", "Guest")
    if not profile_name:
        profile_name = "Guest"
    profiles_store.setdefault("profiles", {})
    profiles_store["current_profile"] = profile_name
    bundle = profiles_store["profiles"].setdefault(profile_name, default_profile_bundle(profile_name))
    bundle["settings"] = dict(user_settings)
    bundle["settings"]["profile_name"] = profile_name
    bundle["stats"] = dict(lifetime_stats)
    bundle["high_scores"] = dict(high_scores)
    save_profiles_store()


def write_active_files():
    with open(high_score_file, "w", encoding="utf-8") as file:
        json.dump(high_scores, file, indent=2)
    with open(stats_file, "w", encoding="utf-8") as file:
        json.dump(lifetime_stats, file, indent=2)
    if user_settings.get("autosave_settings", True):
        with open(settings_file, "w", encoding="utf-8") as file:
            json.dump(user_settings, file, indent=2)


def set_active_profile(profile_name):
    global user_settings, lifetime_stats, high_scores
    profile_name = profile_name.strip() or "Guest"
    profiles_store.setdefault("profiles", {})
    bundle = profiles_store["profiles"].setdefault(profile_name, default_profile_bundle(profile_name))
    profiles_store["current_profile"] = profile_name
    user_settings = {**default_settings_dict(), **bundle.get("settings", {})}
    user_settings["profile_name"] = profile_name
    lifetime_stats = {**default_stats_dict(), **bundle.get("stats", {})}
    high_scores = dict(bundle.get("high_scores", {}))
    write_active_files()
    save_profiles_store()


def refresh_profile_menu():
    if "profile_menu" not in globals():
        return
    menu = profile_menu["menu"]
    menu.delete(0, "end")
    names = sorted(profiles_store.get("profiles", {}).keys())
    for name in names:
        menu.add_command(label=name, command=tk._setit(current_profile_var, name))
    if current_profile_var.get() not in names and names:
        current_profile_var.set(names[0])


def switch_profile(*args):
    profile_name = current_profile_var.get().strip()
    if not profile_name:
        return
    set_active_profile(profile_name)
    if "theme_var" in globals():
        theme_var.set(user_settings.get("theme", "Arena Blue"))
        text_scale_var.set(user_settings.get("text_scale", "Normal"))
        window_size_var.set(user_settings.get("window_size", "1050x760"))
        autosave_var.set(user_settings.get("autosave_settings", True))
        show_headshots_var.set(user_settings.get("show_headshots", True))
        sound_enabled_var.set(user_settings.get("sound_enabled", True))
        player_one_name_var.set(user_settings.get("player_one_name", "Player 1"))
        player_two_name_var.set(user_settings.get("player_two_name", "Player 2"))
        quiz_length_var.set(user_settings.get("default_quiz_length", "25"))
        quiz_mode.set(user_settings.get("default_quiz_mode", "Practice"))
        answer_style_var.set(user_settings.get("default_answer_style", "Typed"))
        rank_label.config(text=f"XP: {lifetime_stats.get('xp', 0)} | Rank: {get_rank_from_xp(lifetime_stats.get('xp', 0))}")
        update_high_score_preview()
        apply_settings_from_vars()
        show_home()


def create_profile():
    profile_name = new_profile_var.get().strip() if "new_profile_var" in globals() else ""
    if not profile_name:
        return
    profiles_store.setdefault("profiles", {})
    if profile_name not in profiles_store["profiles"]:
        bundle = default_profile_bundle(profile_name)
        bundle["settings"]["theme"] = theme_var.get() if "theme_var" in globals() else bundle["settings"]["theme"]
        profiles_store["profiles"][profile_name] = bundle
    save_profiles_store()
    refresh_profile_menu()
    current_profile_var.set(profile_name)
    new_profile_var.set("")


def submit_leaderboard_entry(correct_total, percent):
    mode_label = f"{quiz_mode.get()} | {answer_style_var.get()}"
    entry = {
        "username": current_profile_var.get() if "current_profile_var" in globals() else active_profile_name,
        "score": correct_total,
        "accuracy": percent,
        "mode": mode_label,
        "date": time.strftime("%Y-%m-%d"),
        "daily": bool(is_v2() and daily_challenge_var.get()),
    }
    leaderboard_data.setdefault("entries", []).append(entry)
    leaderboard_data["entries"] = sorted(
        leaderboard_data["entries"],
        key=lambda item: (item.get("score", 0), item.get("accuracy", 0)),
        reverse=True
    )[:100]
    save_leaderboard()


def get_rank_from_xp(xp):
    tiers = [
        (0, "Rookie"),
        (150, "Starter"),
        (350, "All-Conference"),
        (700, "All-American"),
        (1200, "Legend"),
    ]
    rank = "Rookie"
    for threshold, name in tiers:
        if xp >= threshold:
            rank = name
    return rank


def play_sound(kind="click"):
    if app_version_var.get() != "v2" or not sound_enabled_var.get():
        return
    try:
        if kind == "correct":
            root.bell()
        elif kind == "wrong":
            root.bell()
            root.after(80, root.bell)
        else:
            root.bell()
    except Exception:
        pass


def apply_window_size():
    root.geometry(window_size_var.get())


def flush_gui():
    try:
        root.update_idletasks()
    except Exception:
        pass


def apply_settings_from_vars():
    user_settings["theme"] = theme_var.get()
    user_settings["show_headshots"] = show_headshots_var.get()
    user_settings["text_scale"] = text_scale_var.get()
    user_settings["window_size"] = window_size_var.get()
    user_settings["autosave_settings"] = autosave_var.get()
    user_settings["default_quiz_length"] = quiz_length_var.get()
    user_settings["default_quiz_mode"] = quiz_mode.get()
    user_settings["default_answer_style"] = answer_style_var.get()
    user_settings["sound_enabled"] = sound_enabled_var.get()
    user_settings["player_one_name"] = player_one_name_var.get()
    user_settings["player_two_name"] = player_two_name_var.get()
    save_settings()
    scale_map = {"Small": 0.9, "Normal": 1.0, "Large": 1.15}
    scale = scale_map.get(text_scale_var.get(), 1.0)
    title_font.configure(size=int(30 * scale))
    subtitle_font.configure(size=int(15 * scale))
    label_font.configure(size=int(14 * scale))
    question_font.configure(size=int(20 * scale))
    feedback_font.configure(size=int(12 * scale))
    timer_font.configure(size=int(13 * scale))
    action_font.configure(size=int(16 * scale))
    apply_window_size()
    apply_theme(theme_var.get())
    flush_gui()


def is_v2():
    return app_version_var.get() == "v2"


def get_score_key():
    mode = quiz_mode.get()
    style = answer_style_var.get()
    length = quiz_length_var.get()
    conference = category_var.get()
    return f"{mode}|{style}|{length}|{conference}"


def update_high_scores_if_needed():
    key = get_score_key()
    record = high_scores.get(key, {})
    accuracy = round((score / len(questions)) * 100, 1) if questions else 0

    updated = False
    if score > record.get("best_score", -1):
        record["best_score"] = score
        record["best_accuracy"] = accuracy
        updated = True
    elif score == record.get("best_score", -1) and accuracy > record.get("best_accuracy", -1):
        record["best_accuracy"] = accuracy
        updated = True

    if quiz_mode.get() == "Timed" and score == len(questions) and questions:
        previous_best = record.get("best_time_seconds")
        if previous_best is None or elapsed_time < previous_best:
            record["best_time_seconds"] = round(elapsed_time, 2)
            updated = True

    high_scores[key] = record
    if updated:
        save_high_scores()
    return updated


def get_high_score_summary():
    key = get_score_key()
    record = high_scores.get(key)
    if not record:
        return "No high score yet for these settings."

    parts = []
    if "best_score" in record:
        parts.append(f"Best score: {record['best_score']}")
    if "best_accuracy" in record:
        parts.append(f"Best accuracy: {record['best_accuracy']}%")
    if "best_time_seconds" in record:
        parts.append(f"Best perfect time: {format_time(record['best_time_seconds'])}")
    return " | ".join(parts)


def filter_conference_options(*args):
    search_text = conference_search_var.get().strip().lower()
    if search_text:
        filtered = [conf for conf in all_conferences if search_text in conf.lower()]
    else:
        filtered = all_conferences[:]

    menu = conf_dropdown["menu"]
    menu.delete(0, "end")

    values = ["All"] + filtered
    for conf in values:
        menu.add_command(label=conf, command=tk._setit(category_var, conf, update_high_score_preview))

    if category_var.get() not in values:
        category_var.set("All")


def update_high_score_preview(*args):
    if "high_score_label" in globals():
        high_score_label.config(text=get_high_score_summary())
    if "conf_dropdown" in globals():
        hard_mode = quiz_mode.get() == "Hard"
        conf_label.config(fg=TEXT_PRIMARY)
        conf_dropdown.config(state="normal")
        if hard_mode:
            hard_options_frame.pack(anchor="w", padx=18, pady=(0, 18))
        else:
            hard_options_frame.pack_forget()


def build_multiple_choice_options(correct_answer):
    colleges = list(dict.fromkeys(str(college).strip() for college in active_df["College / Last School"].dropna().tolist()))
    wrong_choices = [college for college in colleges if normalize_answer(college) != normalize_answer(correct_answer)]
    sampled = random.sample(wrong_choices, min(3, len(wrong_choices)))
    options = sampled + [correct_answer]
    random.shuffle(options)
    return options


def resolve_headshot_path(row):
    headshot_file = str(row.get("Headshot File", "")).strip() if "Headshot File" in row else ""
    if headshot_file and headshot_file.lower() != "nan":
        candidate = os.path.join(headshot_dir, headshot_file)
        if os.path.exists(candidate):
            return candidate

    headshot_url = str(row.get("Headshot URL", "")).strip() if "Headshot URL" in row else ""
    if headshot_url and headshot_url.lower() != "nan":
        filename = os.path.basename(headshot_url)
        candidate = os.path.join(headshot_dir, filename)
        if os.path.exists(candidate):
            return candidate

    normalized_name = re.sub(
        r"[^A-Za-z0-9]+",
        "_",
        unicodedata.normalize("NFKD", str(row.get("Player Name", ""))).encode("ascii", "ignore").decode("ascii")
    ).strip("_").lower()
    if normalized_name:
        candidate = os.path.join(headshot_dir, f"{normalized_name}.png")
        if os.path.exists(candidate):
            return candidate

    return None


def resolve_school_logo_path(row):
    school_name = str(row.get("College / Last School", "")).strip()
    if not school_name:
        return None
    candidates = []
    normalized = re.sub(r"[^a-z0-9]+", "_", normalize_answer(school_name)).strip("_")
    for ext in ("png", "jpg", "jpeg"):
        candidates.append(os.path.join(school_logo_dir, f"{normalized}.{ext}"))
    alias_map = {
        "uconn": "connecticut",
        "ucla": "california_los_angeles",
        "usc": "southern_california",
        "lsu": "louisiana_state",
        "tcu": "texas_christian",
        "byu": "brigham_young",
    }
    if normalized in alias_map:
        alias_name = alias_map[normalized]
        for ext in ("png", "jpg", "jpeg"):
            candidates.append(os.path.join(school_logo_dir, f"{alias_name}.{ext}"))
    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate
    return None


def update_headshot(row):
    global current_headshot_image
    if not show_headshots_var.get():
        current_headshot_image = None
        headshot_label.config(image="", text="Headshots Off", fg=TEXT_MUTED)
        return

    if is_v2() and headshot_reveal_var.get() and not headshot_revealed:
        current_headshot_image = None
        headshot_label.config(image="", text="Headshot Hidden\nUse Reveal or answer first", fg=TEXT_MUTED)
        return

    image_path = resolve_headshot_path(row)

    if image_path and os.path.exists(image_path):
        try:
            image = Image.open(image_path)
            image = image.resize((150, 150), Image.Resampling.LANCZOS)
            current_headshot_image = ImageTk.PhotoImage(image)
            headshot_label.config(image=current_headshot_image, text="")
            return
        except Exception:
            pass

    current_headshot_image = None
    headshot_label.config(image="", text="No Headshot Available", fg=TEXT_MUTED)


def update_school_logo(row):
    global current_logo_image
    school_name = str(row.get("College / Last School", "")).strip()
    if not (is_v2() and show_logos_var.get() and school_name):
        current_logo_image = None
        school_logo_label.config(text="", image="", bg=SURFACE_COLOR)
        return

    image_path = resolve_school_logo_path(row)
    if image_path and os.path.exists(image_path):
        try:
            image = Image.open(image_path)
            image = image.resize((64, 64), Image.Resampling.LANCZOS)
            current_logo_image = ImageTk.PhotoImage(image)
            school_logo_label.config(image=current_logo_image, text="", bg=SURFACE_COLOR)
            return
        except Exception:
            current_logo_image = None

    initials = "".join(word[0] for word in school_name.split()[:3]).upper()
    school_logo_label.config(
        text=initials,
        image="",
        bg=ACCENT_GOLD,
        fg=BG_COLOR,
        padx=12,
        pady=8
    )


def show_feedback_panel():
    if not feedback_strip.winfo_manager():
        feedback_strip.pack(fill="x", pady=(0, 14), before=control_card)


def hide_feedback_panel():
    if feedback_strip.winfo_manager():
        feedback_strip.pack_forget()


def set_feedback(text="", color=None, icon_text="", icon_color=None):
    if color is None:
        color = "gold"
    if text:
        show_feedback_panel()
        feedback_label.config(text=text, fg=color)
        feedback_icon.config(text=icon_text, fg=icon_color or color)
    else:
        feedback_label.config(text="", fg=ACCENT_GOLD)
        feedback_icon.config(text="", fg=TEXT_PRIMARY)
        hide_feedback_panel()


def add_hover_effect(widget, normal_bg, hover_bg, normal_fg, hover_fg=None):
    hover_fg = hover_fg if hover_fg is not None else normal_fg

    def on_enter(event):
        widget.config(bg=hover_bg, fg=hover_fg)

    def on_leave(event):
        widget.config(bg=normal_bg, fg=normal_fg)

    widget.bind("<Enter>", on_enter)
    widget.bind("<Leave>", on_leave)


def get_active_player_name():
    names = [player_one_name_var.get().strip() or "Player 1", player_two_name_var.get().strip() or "Player 2"]
    return names[current_player_index % 2]


def fresh_powerup_inventory():
    return {"reveal_letter": 1, "fifty_fifty": 1, "free_skip": 1}


def get_active_powerups():
    if is_v2() and two_player_var.get():
        return powerups.setdefault(get_active_player_name(), fresh_powerup_inventory())
    return powerups


def format_powerup_summary():
    if not is_v2():
        return ""
    if two_player_var.get():
        active_player = get_active_player_name()
        active = powerups.get(active_player, fresh_powerup_inventory())
        return f"Power-Ups: Reveal {active['reveal_letter']} | 50/50 {active['fifty_fifty']} | Skip {active['free_skip']}"
    active = get_active_powerups()
    return f"Power-Ups: Reveal {active['reveal_letter']} | 50/50 {active['fifty_fifty']} | Skip {active['free_skip']}"


def advance_two_player_turn():
    global current_player_index
    if is_v2() and two_player_var.get():
        current_player_index += 1


def compute_medal(percent, skipped_total):
    if percent == 100:
        return "Champion Gold Medal"
    if percent >= 85:
        return "Silver Medal"
    if percent >= 70:
        return "Bronze Medal"
    if skipped_total == 0:
        return "Iron Competitor"
    return "Rookie Badge"


def update_lifetime_stats(correct_total, wrong_total, skipped_total):
    lifetime_stats["games_played"] += 1
    lifetime_stats["questions_answered"] += len(questions)
    lifetime_stats["correct_answers"] += correct_total
    lifetime_stats["wrong_answers"] += wrong_total
    lifetime_stats["skipped_answers"] += skipped_total
    lifetime_stats["hints_used"] += hint_count
    lifetime_stats["best_streak_ever"] = max(lifetime_stats.get("best_streak_ever", 0), best_streak)

    if correct_total == len(questions) and questions:
        lifetime_stats["perfect_games"] += 1
        if quiz_mode.get() == "Timed":
            lifetime_stats["timed_perfect_games"] += 1

    if quiz_mode.get() == "Hard" and correct_total == len(questions) and questions:
        lifetime_stats["hard_mode_wins"] += 1

    earned_xp = correct_total * 10 + best_streak * 5
    lifetime_stats["xp"] = lifetime_stats.get("xp", 0) + earned_xp
    lifetime_stats["rank"] = get_rank_from_xp(lifetime_stats["xp"])

    conference_bucket = lifetime_stats.setdefault("conference_stats", {})
    for row, result in zip(questions, results):
        conf = str(row.get("Conference", "Unknown"))
        bucket = conference_bucket.setdefault(conf, {"asked": 0, "correct": 0})
        bucket["asked"] += 1
        if result == "Correct!":
            bucket["correct"] += 1

    save_stats()


def unlock_achievements(correct_total, wrong_total, skipped_total, percent):
    unlocked = []

    achievement_rules = [
        ("First Win", correct_total > 0, "Scored your first correct answer."),
        ("Perfect Game", correct_total == len(questions) and len(questions) > 0, "Finished a run without missing."),
        ("No Help Needed", hint_count == 0 and correct_total == len(questions) and len(questions) > 0, "Completed a perfect game without hints."),
        ("On Fire", best_streak >= 5, "Reached a 5-answer streak."),
        ("Unstoppable", best_streak >= 10, "Reached a 10-answer streak."),
        ("Speed Scholar", quiz_mode.get() == "Timed" and correct_total == len(questions) and len(questions) > 0, "Got a timed perfect game."),
        ("Hardcore Hero", quiz_mode.get() == "Hard" and percent >= 80, "Crushed Hard mode with 80%+ accuracy."),
        ("No Skips", skipped_total == 0 and len(questions) > 0, "Finished a game without skipping."),
    ]

    existing = set(lifetime_stats.get("achievements", []))
    for name, condition, _description in achievement_rules:
        if condition:
            unlocked.append(name)
            if name not in existing:
                lifetime_stats.setdefault("achievements", []).append(name)

    save_stats()
    return unlocked


def claim_daily_reward(correct_total, percent):
    if not (is_v2() and daily_challenge_var.get()):
        return None
    today = time.strftime("%Y-%m-%d")
    claimed = lifetime_stats.setdefault("daily_reward_claims", [])
    if today in claimed:
        return None
    reward_xp = 25
    reward_points = 1
    title = "Daily Challenge Complete"
    if percent >= 70:
        reward_xp += 25
        reward_points += 1
        title = "Daily Challenge Win"
        lifetime_stats["daily_challenge_wins"] = lifetime_stats.get("daily_challenge_wins", 0) + 1
    if correct_total == len(questions) and len(questions) > 0:
        reward_xp += 50
        reward_points += 2
        title = "Perfect Daily Challenge"
    lifetime_stats["xp"] = lifetime_stats.get("xp", 0) + reward_xp
    lifetime_stats["rank"] = get_rank_from_xp(lifetime_stats["xp"])
    lifetime_stats["reward_points"] = lifetime_stats.get("reward_points", 0) + reward_points
    claimed.append(today)
    save_stats()
    return {"title": title, "xp": reward_xp, "points": reward_points}


def show_stats_window():
    stats_window = tk.Toplevel(root)
    stats_window.title("Player Stats")
    stats_window.geometry("780x560")
    stats_window.configure(bg=BG_COLOR)

    container = tk.Frame(stats_window, bg=SURFACE_COLOR, highlightbackground=OUTLINE_COLOR, highlightthickness=2)
    container.pack(fill="both", expand=True, padx=24, pady=24)

    title = tk.Label(container, text="Career Stats", font=title_font, bg=SURFACE_COLOR, fg=TEXT_PRIMARY)
    title.pack(pady=(22, 12))

    total_questions = lifetime_stats.get("questions_answered", 0)
    correct_answers = lifetime_stats.get("correct_answers", 0)
    accuracy = round((correct_answers / total_questions) * 100, 1) if total_questions else 0

    lines = [
        f"XP: {lifetime_stats.get('xp', 0)}",
        f"Rank: {lifetime_stats.get('rank', get_rank_from_xp(lifetime_stats.get('xp', 0)))}",
        f"Games Played: {lifetime_stats.get('games_played', 0)}",
        f"Questions Answered: {total_questions}",
        f"Lifetime Accuracy: {accuracy}%",
        f"Correct Answers: {correct_answers}",
        f"Wrong Answers: {lifetime_stats.get('wrong_answers', 0)}",
        f"Skipped Answers: {lifetime_stats.get('skipped_answers', 0)}",
        f"Hints Used: {lifetime_stats.get('hints_used', 0)}",
        f"Best Streak Ever: {lifetime_stats.get('best_streak_ever', 0)}",
        f"Perfect Games: {lifetime_stats.get('perfect_games', 0)}",
        f"Timed Perfect Games: {lifetime_stats.get('timed_perfect_games', 0)}",
        f"Hard Mode Wins: {lifetime_stats.get('hard_mode_wins', 0)}",
        f"Reward Points: {lifetime_stats.get('reward_points', 0)}",
        f"Daily Challenge Wins: {lifetime_stats.get('daily_challenge_wins', 0)}",
    ]

    stats_label = tk.Label(container, text="\n".join(lines), font=label_font, bg=SURFACE_COLOR, fg=TEXT_PRIMARY, justify="left")
    stats_label.pack(pady=10)

    achievements_title = tk.Label(container, text="Achievements Unlocked", font=label_font, bg=SURFACE_COLOR, fg=ACCENT_GOLD)
    achievements_title.pack(pady=(12, 6))

    achievements = lifetime_stats.get("achievements", [])
    achievements_text = "\n".join(f"- {name}" for name in achievements) if achievements else "No achievements yet."
    achievements_label = tk.Label(container, text=achievements_text, font=feedback_font, bg=SURFACE_COLOR, fg=TEXT_MUTED, justify="left")
    achievements_label.pack(pady=(0, 18))

    reset_stats_button = tk.Button(container, text="Reset Stats And High Scores", command=reset_all_progress, width=26)
    style_button(reset_stats_button, ACCENT_RED, BUTTON_TEXT)
    add_hover_effect(reset_stats_button, ACCENT_RED, "#ff7f90", BUTTON_TEXT)
    reset_stats_button.pack(pady=(8, 20))

    reset_row = tk.Frame(container, bg=SURFACE_COLOR)
    reset_row.pack(pady=(0, 12))

    reset_stats_only = tk.Button(reset_row, text="Reset Stats", command=lambda: reset_stats_category("stats"), width=16)
    style_button(reset_stats_only, ACCENT_ORANGE, BUTTON_TEXT)
    add_hover_effect(reset_stats_only, ACCENT_ORANGE, "#ffb86a", BUTTON_TEXT)
    reset_stats_only.pack(side=tk.LEFT, padx=6)

    reset_scores_only = tk.Button(reset_row, text="Reset Scores", command=lambda: reset_stats_category("scores"), width=16)
    style_button(reset_scores_only, ACCENT_BLUE, BUTTON_TEXT)
    add_hover_effect(reset_scores_only, ACCENT_BLUE, "#67d7ff", BUTTON_TEXT)
    reset_scores_only.pack(side=tk.LEFT, padx=6)

    reset_xp_only = tk.Button(reset_row, text="Reset XP", command=lambda: reset_stats_category("xp"), width=16)
    style_button(reset_xp_only, BUTTON_DARK, BUTTON_TEXT)
    add_hover_effect(reset_xp_only, BUTTON_DARK, ACCENT_BLUE, BUTTON_TEXT)
    reset_xp_only.pack(side=tk.LEFT, padx=6)


def show_leaderboard_window():
    leaderboard_window = tk.Toplevel(root)
    leaderboard_window.title("Online Leaderboard")
    leaderboard_window.geometry("760x560")
    leaderboard_window.configure(bg=BG_COLOR)

    container = tk.Frame(leaderboard_window, bg=SURFACE_COLOR, highlightbackground=OUTLINE_COLOR, highlightthickness=2)
    container.pack(fill="both", expand=True, padx=24, pady=24)

    tk.Label(container, text="Online Leaderboard", font=title_font, bg=SURFACE_COLOR, fg=TEXT_PRIMARY).pack(pady=(18, 10))

    entries = leaderboard_data.get("entries", [])[:20]
    if not entries:
        tk.Label(container, text="No leaderboard entries yet.", font=label_font, bg=SURFACE_COLOR, fg=TEXT_MUTED).pack(pady=20)
        return

    text_box = tk.Text(container, wrap="word", bg=SURFACE_ALT, fg=TEXT_PRIMARY, font=("Helvetica", 12), relief="flat", padx=16, pady=16)
    text_box.pack(fill="both", expand=True, padx=18, pady=(8, 18))
    for idx, entry in enumerate(entries, start=1):
        daily_tag = " | Daily" if entry.get("daily") else ""
        text_box.insert(
            "end",
            f"{idx}. {entry.get('username','Guest')} | Score {entry.get('score',0)} | Accuracy {entry.get('accuracy',0)}% | "
            f"{entry.get('mode','Practice')} | {entry.get('date','')}{daily_tag}\n"
        )
    text_box.config(state="disabled")


def show_settings_window():
    settings_window = tk.Toplevel(root)
    settings_window.title("V2 Settings")
    settings_window.geometry("860x720")
    settings_window.configure(bg=BG_COLOR)

    container = tk.Frame(settings_window, bg=SURFACE_COLOR, highlightbackground=OUTLINE_COLOR, highlightthickness=2)
    container.pack(fill="both", expand=True, padx=22, pady=22)

    tk.Label(container, text="V2 Settings", font=title_font, bg=SURFACE_COLOR, fg=TEXT_PRIMARY).pack(pady=(18, 12))

    form = tk.Frame(container, bg=SURFACE_COLOR)
    form.pack(pady=10)

    fields = [
        ("Theme", theme_var),
        ("Text Size", text_scale_var),
        ("Window Size", window_size_var),
        ("Default Length", quiz_length_var),
        ("Default Mode", quiz_mode),
        ("Default Style", answer_style_var),
        ("Player 1 Name", player_one_name_var),
        ("Player 2 Name", player_two_name_var),
    ]

    for idx, (label_text, var) in enumerate(fields):
        tk.Label(form, text=label_text, font=feedback_font, bg=SURFACE_COLOR, fg=TEXT_PRIMARY).grid(row=idx, column=0, sticky="w", padx=8, pady=6)
        if isinstance(var, tk.StringVar) and label_text in {"Theme", "Text Size", "Window Size", "Default Length", "Default Mode", "Default Style"}:
            options = {
                "Theme": ["Arena Blue", "Classic Gold", "Emerald Court", "Midnight Heat"],
                "Text Size": ["Small", "Normal", "Large"],
                "Window Size": ["1050x760", "1200x820", "1360x900"],
                "Default Length": ["10", "25", "50", "All"],
                "Default Mode": ["Practice", "Timed", "Hard", "Learning"],
                "Default Style": ["Typed", "Multiple Choice"],
            }[label_text]
            menu = tk.OptionMenu(form, var, *options)
            style_option_menu(menu)
            menu.grid(row=idx, column=1, sticky="ew", padx=8, pady=6)
        else:
            entry = tk.Entry(form, textvariable=var, font=feedback_font, bg=ENTRY_BG, fg=TEXT_PRIMARY, insertbackground=TEXT_PRIMARY, relief="flat")
            entry.grid(row=idx, column=1, sticky="ew", padx=8, pady=6, ipady=6)

    toggles = tk.Frame(container, bg=SURFACE_COLOR)
    toggles.pack(pady=12)
    for text, var in [
        ("Autosave Settings", autosave_var),
        ("Headshots On", show_headshots_var),
        ("Sound On", sound_enabled_var),
    ]:
        cb = tk.Checkbutton(toggles, text=text, variable=var, font=feedback_font, bg=SURFACE_COLOR, fg=TEXT_PRIMARY, selectcolor=SURFACE_COLOR, activebackground=SURFACE_COLOR)
        cb.pack(anchor="w", pady=4)

    help_text = (
        "Keyboard Help:\n"
        "- Enter submits typed answers\n"
        "- Next skips to the next question\n"
        "- V2 options live on the home screen\n"
        "- Daily challenge uses the same set for the current date"
    )
    tk.Label(container, text=help_text, font=feedback_font, bg=SURFACE_COLOR, fg=TEXT_MUTED, justify="left").pack(pady=12)

    save_button = tk.Button(container, text="Save Settings", command=lambda: (apply_settings_from_vars(), settings_window.destroy()), width=18)
    style_button(save_button, ACCENT_BLUE, BUTTON_TEXT)
    add_hover_effect(save_button, ACCENT_BLUE, "#67d7ff", BUTTON_TEXT)
    save_button.pack(pady=(8, 18))


# ===== Global Variables =====
current_index = 0
score = 0
hint_count = 0
user_answers = []
results = []
questions = []
attempt_count = []
question_scored = []
mistake_rows = []
active_df = df.copy()
current_streak = 0
best_streak = 0
question_timer_after_id = None
question_time_left = 0
progress_animation_after_id = None
displayed_progress_values = []
current_headshot_image = None
run_achievements = []
current_logo_image = None
player_scores = {"Player 1": 0, "Player 2": 0}
current_player_index = 0
powerups = {"reveal_letter": 1, "fifty_fifty": 1, "free_skip": 1}
headshot_revealed = False

# Timer variables
timer_running = False
start_time = None
elapsed_time = 0

high_scores = load_high_scores()
lifetime_stats = load_stats()
user_settings = load_settings()
leaderboard_data = load_leaderboard()
profiles_store = load_profiles_store(user_settings, lifetime_stats, high_scores)
active_profile_name = profiles_store.get("current_profile", "Guest")
active_profile_bundle = profiles_store.get("profiles", {}).get(active_profile_name, default_profile_bundle(active_profile_name))
user_settings = {**default_settings_dict(), **active_profile_bundle.get("settings", {})}
lifetime_stats = {**default_stats_dict(), **active_profile_bundle.get("stats", {})}
high_scores = dict(active_profile_bundle.get("high_scores", {}))


# ===== GUI setup =====
root = tk.Tk()
root.title("🏀 NBA Players Quiz 🏀")
root.geometry("1050x760")
root.configure(bg="#08131f")
root.resizable(True, True)

quiz_mode = tk.StringVar(value="Practice")
category_var = tk.StringVar(value="All")
quiz_length_var = tk.StringVar(value="25")
answer_style_var = tk.StringVar(value="Typed")
conference_search_var = tk.StringVar(value="")
hard_no_hints_var = tk.BooleanVar(value=True)
hard_no_back_var = tk.BooleanVar(value=True)
hard_no_skip_var = tk.BooleanVar(value=True)
hard_timer_var = tk.BooleanVar(value=False)
app_version_var = tk.StringVar(value="v1")
daily_challenge_var = tk.BooleanVar(value=False)
two_player_var = tk.BooleanVar(value=False)
headshot_reveal_var = tk.BooleanVar(value=False)
show_logos_var = tk.BooleanVar(value=False)
show_headshots_var = tk.BooleanVar(value=user_settings.get("show_headshots", True))
sound_enabled_var = tk.BooleanVar(value=user_settings.get("sound_enabled", True))
theme_var = tk.StringVar(value=user_settings.get("theme", "Arena Blue"))
text_scale_var = tk.StringVar(value=user_settings.get("text_scale", "Normal"))
window_size_var = tk.StringVar(value=user_settings.get("window_size", "1050x760"))
autosave_var = tk.BooleanVar(value=user_settings.get("autosave_settings", True))
player_one_name_var = tk.StringVar(value=user_settings.get("player_one_name", "Player 1"))
player_two_name_var = tk.StringVar(value=user_settings.get("player_two_name", "Player 2"))
current_profile_var = tk.StringVar(value=active_profile_name)
new_profile_var = tk.StringVar(value="")

# Theme
BG_COLOR = "#08131f"
SURFACE_COLOR = "#102132"
SURFACE_ALT = "#15293d"
PANEL_COLOR = "#0c1b2b"
ACCENT_BLUE = "#2ec4ff"
ACCENT_GOLD = "#ffc857"
ACCENT_GREEN = "#44d17a"
ACCENT_RED = "#ff5d73"
ACCENT_ORANGE = "#ff9f43"
TEXT_PRIMARY = "#f4f7fb"
TEXT_MUTED = "#94abc2"
OUTLINE_COLOR = "#26445f"
ENTRY_BG = "#0f2438"
BUTTON_DARK = "#17324a"
PROGRESS_NEUTRAL = "#27425e"
SKIP_COLOR = "#8ca3bf"

THEMES = {
    "Arena Blue": {
        "BG_COLOR": "#08131f",
        "SURFACE_COLOR": "#102132",
        "SURFACE_ALT": "#15293d",
        "PANEL_COLOR": "#0c1b2b",
        "ACCENT_BLUE": "#2ec4ff",
        "ACCENT_GOLD": "#ffc857",
        "ACCENT_GREEN": "#44d17a",
        "ACCENT_RED": "#ff5d73",
        "ACCENT_ORANGE": "#ff9f43",
        "TEXT_PRIMARY": "#f4f7fb",
        "TEXT_MUTED": "#94abc2",
        "OUTLINE_COLOR": "#26445f",
        "ENTRY_BG": "#0f2438",
        "BUTTON_DARK": "#17324a",
        "PROGRESS_NEUTRAL": "#27425e",
        "SKIP_COLOR": "#8ca3bf",
    },
    "Classic Gold": {
        "BG_COLOR": "#17120a",
        "SURFACE_COLOR": "#241c11",
        "SURFACE_ALT": "#302515",
        "PANEL_COLOR": "#1e170f",
        "ACCENT_BLUE": "#80cfff",
        "ACCENT_GOLD": "#f4c95d",
        "ACCENT_GREEN": "#6edb8f",
        "ACCENT_RED": "#ff7b6b",
        "ACCENT_ORANGE": "#ffb347",
        "TEXT_PRIMARY": "#fff7e8",
        "TEXT_MUTED": "#cfbf9f",
        "OUTLINE_COLOR": "#6a5330",
        "ENTRY_BG": "#2b2115",
        "BUTTON_DARK": "#4a3823",
        "PROGRESS_NEUTRAL": "#5b4b33",
        "SKIP_COLOR": "#ad9b7c",
    },
    "Emerald Court": {
        "BG_COLOR": "#071813",
        "SURFACE_COLOR": "#102821",
        "SURFACE_ALT": "#15382f",
        "PANEL_COLOR": "#0d211b",
        "ACCENT_BLUE": "#78d7c4",
        "ACCENT_GOLD": "#f2c14e",
        "ACCENT_GREEN": "#48d597",
        "ACCENT_RED": "#ff6f61",
        "ACCENT_ORANGE": "#ff9f43",
        "TEXT_PRIMARY": "#f3fff8",
        "TEXT_MUTED": "#99c9ba",
        "OUTLINE_COLOR": "#2c6654",
        "ENTRY_BG": "#12342c",
        "BUTTON_DARK": "#1d4f43",
        "PROGRESS_NEUTRAL": "#2c5f53",
        "SKIP_COLOR": "#86a89f",
    },
    "Midnight Heat": {
        "BG_COLOR": "#190b14",
        "SURFACE_COLOR": "#2a1421",
        "SURFACE_ALT": "#371b2b",
        "PANEL_COLOR": "#220f1a",
        "ACCENT_BLUE": "#ff8c69",
        "ACCENT_GOLD": "#ffd166",
        "ACCENT_GREEN": "#7bd389",
        "ACCENT_RED": "#ff5a5f",
        "ACCENT_ORANGE": "#ff9f1c",
        "TEXT_PRIMARY": "#fff5f7",
        "TEXT_MUTED": "#d6aab7",
        "OUTLINE_COLOR": "#6f3c4f",
        "ENTRY_BG": "#311725",
        "BUTTON_DARK": "#59304a",
        "PROGRESS_NEUTRAL": "#5d3d52",
        "SKIP_COLOR": "#a98897",
    },
}

# Fonts
title_font = tkfont.Font(family="Avenir Next", size=30, weight="bold")
subtitle_font = tkfont.Font(family="Avenir Next", size=15)
label_font = tkfont.Font(family="Avenir Next", size=14, weight="bold")
question_font = tkfont.Font(family="Avenir Next", size=20, weight="bold")
feedback_font = tkfont.Font(family="Avenir Next", size=12, weight="bold")
timer_font = tkfont.Font(family="Avenir Next", size=13, weight="bold")
chip_font = tkfont.Font(family="Avenir Next", size=11, weight="bold")
action_font = tkfont.Font(family="Avenir Next", size=16, weight="bold")
BUTTON_TEXT = "#111111"

all_conferences = sorted(str(conf) for conf in df["Conference"].dropna().unique())


# ===== Functions =====
def reset_quiz_vars():
    global current_index, score, user_answers, results, hint_count, attempt_count
    global question_scored, current_streak, best_streak, mistake_rows, displayed_progress_values, run_achievements
    current_index = 0
    score = 0
    hint_count = 0
    user_answers = []
    results = []
    attempt_count = []
    question_scored = []
    current_streak = 0
    best_streak = 0
    mistake_rows = []
    displayed_progress_values = []
    run_achievements = []


def cancel_progress_animation():
    global progress_animation_after_id
    if progress_animation_after_id is not None:
        root.after_cancel(progress_animation_after_id)
        progress_animation_after_id = None


def update_mode_ui(*args):
    hard_mode = quiz_mode.get() == "Hard"
    v2_mode = is_v2()

    conf_label.config(fg=TEXT_PRIMARY)
    conf_dropdown.config(state="normal")
    if hard_mode:
        hard_options_frame.pack(anchor="w", padx=18, pady=(0, 18))
    else:
        hard_options_frame.pack_forget()
    if v2_mode:
        v2_options_frame.pack(anchor="w", padx=18, pady=(4, 12))
    else:
        v2_options_frame.pack_forget()
    version_label.config(text=f"Version Selected: {'V2' if v2_mode else 'V1'}")
    if v2_mode and two_player_var.get():
        v2_names_label.config(text=f"V2 Matchup: {player_one_name_var.get()} vs {player_two_name_var.get()}")
    else:
        v2_names_label.config(text="")
    update_high_score_preview()


def cancel_question_timer():
    global question_timer_after_id, question_time_left
    if question_timer_after_id is not None:
        root.after_cancel(question_timer_after_id)
        question_timer_after_id = None
    question_time_left = 0
    question_timer_label.config(text="")


def start_question_timer():
    global question_time_left
    cancel_question_timer()
    if quiz_mode.get() == "Hard" and hard_timer_var.get():
        question_time_left = 15
        tick_question_timer()


def tick_question_timer():
    global question_timer_after_id, question_time_left
    question_timer_label.config(text=f"Question Timer: {question_time_left}s")
    if question_time_left <= 0:
        process_answer("", timed_out=True)
        return
    question_time_left -= 1
    question_timer_after_id = root.after(1000, tick_question_timer)


def show_home():
    global timer_running, elapsed_time
    cancel_question_timer()
    cancel_progress_animation()
    main_frame.pack_forget()
    end_frame.pack_forget()
    start_frame.pack(fill="both", expand=True)

    timer_running = False
    elapsed_time = 0
    reset_quiz_vars()
    player_scores[player_one_name_var.get()] = 0
    player_scores[player_two_name_var.get()] = 0

    quiz_mode.set(user_settings.get("default_quiz_mode", "Practice"))
    category_var.set("All")
    quiz_length_var.set(user_settings.get("default_quiz_length", "25"))
    answer_style_var.set(user_settings.get("default_answer_style", "Typed"))
    conference_search_var.set("")
    update_mode_ui()
    filter_conference_options()
    version_label.config(text=f"Version Selected: {app_version_var.get().upper()}")
    rank_label.config(text=f"XP: {lifetime_stats.get('xp', 0)} | Rank: {get_rank_from_xp(lifetime_stats.get('xp', 0))}")
    v2_names_label.config(
        text=f"V2 Matchup Ready: {player_one_name_var.get()} vs {player_two_name_var.get()}" if is_v2() and two_player_var.get() else ""
    )
    start_frame.lift()
    start_canvas.lift()
    start_shell.lift()
    start_card.lift()
    start_canvas.update_idletasks()
    update_start_scroll_region()
    start_canvas.yview_moveto(0)
    flush_gui()
    root.after(15, flush_gui)


def start_quiz():
    start_frame.pack_forget()
    initialize_quiz()


def get_selected_length(total_available):
    selected = quiz_length_var.get()
    if selected == "All":
        return total_available
    try:
        return min(int(selected), total_available)
    except ValueError:
        return min(25, total_available)


def initialize_quiz(reset=False):
    global current_index, score, hint_count, questions, timer_running, elapsed_time
    global start_time, active_df, user_answers, results, attempt_count, question_scored
    global displayed_progress_values, current_player_index, player_scores, powerups, headshot_revealed

    end_frame.pack_forget()
    cancel_progress_animation()

    selected_conf = category_var.get()
    if quiz_mode.get() == "Learning" and selected_conf != "All":
        filtered_df = df[df["Conference"] == selected_conf].copy()
    else:
        filtered_df = df.copy()

    if filtered_df.empty:
        selected_conf = "All"
        category_var.set("All")
        filtered_df = df.copy()

    active_df = filtered_df
    question_count = get_selected_length(len(filtered_df))
    if is_v2() and daily_challenge_var.get():
        challenge_seed = int(time.strftime("%Y%m%d"))
        questions_data = filtered_df.sample(n=question_count, random_state=challenge_seed).reset_index(drop=True)
    else:
        questions_data = filtered_df.sample(n=question_count).reset_index(drop=True)
    questions[:] = questions_data.to_dict("records")

    current_index = 0
    score = 0
    hint_count = 0
    timer_running = False
    elapsed_time = 0
    start_time = None

    user_answers[:] = [""] * len(questions)
    results[:] = [None] * len(questions)
    attempt_count[:] = [0] * len(questions)
    question_scored[:] = [False] * len(questions)
    displayed_progress_values[:] = [0.0] * len(questions)
    current_player_index = 0
    player_scores = {player_one_name_var.get(): 0, player_two_name_var.get(): 0}
    if is_v2() and two_player_var.get():
        powerups = {
            player_one_name_var.get(): fresh_powerup_inventory(),
            player_two_name_var.get(): fresh_powerup_inventory(),
        }
    else:
        powerups = fresh_powerup_inventory()
    headshot_revealed = False

    reset_quiz_vars()
    user_answers[:] = [""] * len(questions)
    results[:] = [None] * len(questions)
    attempt_count[:] = [0] * len(questions)
    question_scored[:] = [False] * len(questions)
    displayed_progress_values[:] = [0.0] * len(questions)

    answer_entry.config(state="normal")
    answer_entry.delete(0, tk.END)
    set_feedback()
    progress_canvas.delete("all")
    timer_label.config(text="00:00")
    question_timer_label.config(text="")
    streak_label.config(text="" if is_v2() and two_player_var.get() else "Current Streak: 0 | Best Streak: 0")
    powerup_label.config(text=format_powerup_summary())
    player_turn_label.config(
        text="" if not (is_v2() and two_player_var.get())
        else f"{player_one_name_var.get()}'s Turn"
    )
    waiting_player_label.config(text="" if not (is_v2() and two_player_var.get()) else f"Waiting\n{player_two_name_var.get()}\nScore 0")

    submit_button.config(state="normal")
    next_button.config(state="normal")
    back_button.config(state="disabled")
    if is_v2() and two_player_var.get():
        hint_button.grid_remove()
    else:
        hint_button.grid()
        hint_button.config(state="disabled" if quiz_mode.get() == "Hard" and hard_no_hints_var.get() else "normal")

    main_frame.pack(fill="both", expand=True)

    if quiz_mode.get() == "Timed":
        start_timer()

    update_gui()
    flush_gui()
    start_question_timer()


def get_progress_target_values():
    targets = []
    for result in results:
        if result == "Correct!":
            targets.append(1.0)
        elif result and result.startswith("Wrong"):
            targets.append(1.0)
        elif result == "Skipped":
            targets.append(1.0)
        else:
            targets.append(0.18)
    return targets


def draw_progress_bar(progress_values):
    progress_canvas.delete("all")
    total = len(questions)
    if total == 0:
        return

    width = progress_canvas.winfo_width()
    if width <= 1:
        width = 900
    height = 22
    gap = 4

    for i in range(total):
        x0 = (i * width) / total + gap / 2
        x1 = ((i + 1) * width) / total - gap / 2

        progress_canvas.create_rectangle(
            x0,
            0,
            x1,
            height,
            fill=SURFACE_ALT,
            outline=""
        )

        fill_width = max(0, (x1 - x0) * progress_values[i])
        color = PROGRESS_NEUTRAL
        if results[i] == "Correct!":
            color = ACCENT_GREEN
        elif results[i] and results[i].startswith("Wrong"):
            color = ACCENT_RED
        elif results[i] == "Skipped":
            color = SKIP_COLOR

        progress_canvas.create_rectangle(
            x0,
            0,
            x0 + fill_width,
            height,
            fill=color,
            outline=""
        )


def update_progress_bar(animated=True):
    global progress_animation_after_id
    total = len(questions)
    if total == 0:
        progress_canvas.delete("all")
        return

    if len(displayed_progress_values) != total:
        displayed_progress_values[:] = [0.0] * total

    targets = get_progress_target_values()

    if progress_animation_after_id is not None:
        root.after_cancel(progress_animation_after_id)
        progress_animation_after_id = None

    if not animated:
        displayed_progress_values[:] = targets
        draw_progress_bar(displayed_progress_values)
        return

    def step_animation():
        global progress_animation_after_id
        done = True
        for i, target in enumerate(targets):
            current = displayed_progress_values[i]
            if abs(target - current) > 0.02:
                displayed_progress_values[i] += (target - current) * 0.35
                done = False
            else:
                displayed_progress_values[i] = target

        draw_progress_bar(displayed_progress_values)

        if not done:
            progress_animation_after_id = root.after(25, step_animation)
        else:
            progress_animation_after_id = None

    step_animation()


def flash_feedback(color):
    original_color = question_label.cget("fg")

    def fade(step=0):
        if step > 5:
            question_label.config(fg=original_color)
            return
        question_label.config(fg=color)
        root.after(50, lambda: fade(step + 1))

    fade()


def populate_multiple_choice_buttons(expected_index=None):
    if expected_index is not None and expected_index != current_index:
        return
    if not (0 <= current_index < len(questions)):
        return

    row = questions[current_index]
    options = build_multiple_choice_options(str(row["College / Last School"]).strip())

    for index, button in enumerate(mc_buttons):
        if index < len(options):
            option = options[index]
            button.config(
                text=option,
                state="normal",
                command=lambda choice=option: select_multiple_choice(choice)
            )
            button.pack(fill="x", pady=5)
        else:
            button.pack_forget()

    mc_frame.update_idletasks()


def select_multiple_choice(choice):
    answer_entry.delete(0, tk.END)
    answer_entry.insert(0, choice)
    process_answer(choice)


def handle_return_key(event=None):
    if answer_style_var.get() == "Multiple Choice":
        return "break"
    submit_answer(event)


def update_gui():
    if not (0 <= current_index < len(questions)):
        show_end_screen()
        return

    row = questions[current_index]
    player = row["Player Name"]
    update_headshot(row)
    update_school_logo(row)
    question_label.config(text=f"Which college did {player} attend?")
    progress_label.config(text=f"Question {current_index + 1} of {len(questions)}")
    streak_label.config(text="" if is_v2() and two_player_var.get() else f"Current Streak: {current_streak} | Best Streak: {best_streak}")
    score_chip_label.config(text=f"Score {score}")
    mode_chip_label.config(text=f"{quiz_mode.get()} Mode")
    if is_v2() and two_player_var.get():
        active_player = get_active_player_name()
        waiting_player = player_two_name_var.get() if active_player == player_one_name_var.get() else player_one_name_var.get()
        player_turn_label.config(text=f"{active_player}'s Turn")
        powerup_label.config(
            text=(
                f"Score: {player_scores.get(active_player, 0)}\n"
                f"{format_powerup_summary()}"
            )
        )
        waiting_player_label.config(
            text=(
                f"Waiting\n{waiting_player}\n"
                f"Score {player_scores.get(waiting_player, 0)}"
            )
        )
        waiting_player_label.pack(side=tk.RIGHT, padx=(12, 14), pady=10, anchor="e")
    else:
        player_turn_label.config(text="")
        if is_v2():
            powerup_label.config(text=format_powerup_summary())
        else:
            powerup_label.config(text="")
        waiting_player_label.config(text="")
        waiting_player_label.pack_forget()
    update_progress_bar(animated=True)

    hard_back_disabled = quiz_mode.get() == "Hard" and hard_no_back_var.get()
    hard_hints_disabled = quiz_mode.get() == "Hard" and hard_no_hints_var.get()
    back_button.config(state="normal" if current_index > 0 and not hard_back_disabled else "disabled")
    if is_v2() and two_player_var.get():
        hint_button.grid_remove()
    else:
        hint_button.grid()
        hint_button.config(state="disabled" if hard_hints_disabled else "normal")

    if answer_style_var.get() == "Typed":
        answer_entry.pack(pady=10)
        mc_frame.pack_forget()
    else:
        answer_entry.pack_forget()
        mc_frame.pack(pady=10, fill="x")
        root.after(10, lambda idx=current_index: populate_multiple_choice_buttons(idx))

    if is_v2():
        powerup_frame.pack(pady=(0, 8))
        v2_names_label.config(text=f"V2 Players: {player_one_name_var.get()} | {player_two_name_var.get()}")
    else:
        powerup_frame.pack_forget()
        v2_names_label.config(text="")

    if not results[current_index]:
        set_feedback()

    answer_entry.delete(0, tk.END)
    if answer_style_var.get() == "Typed" and user_answers[current_index]:
        stored_answer = user_answers[current_index]
        answer_entry.insert(0, stored_answer)

    if results[current_index]:
        text = results[current_index]
        if text == "Correct!":
            color = "lime"
            icon = "✔"
        elif text == "Skipped":
            color = "orange"
            icon = "➜"
        else:
            color = "red"
            icon = "✖"
        set_feedback(text, color, icon, color)
    flush_gui()


def show_floating_icon(icon, color):
    feedback_icon.config(text=icon, fg=color)
    root.after(700, lambda: feedback_icon.config(text=""))


def update_score_for_current_question(is_correct):
    global score
    if is_correct and not question_scored[current_index]:
        score += 1
        question_scored[current_index] = True
    elif not is_correct and question_scored[current_index]:
        score -= 1
        question_scored[current_index] = False


def update_streak(is_correct):
    global current_streak, best_streak
    if is_correct:
        current_streak += 1
        if current_streak > best_streak:
            best_streak = current_streak
    else:
        current_streak = 0
    streak_label.config(text=f"Current Streak: {current_streak} | Best Streak: {best_streak}")


def remember_mistake(user_answer, correct_answer):
    row = questions[current_index]
    existing = [item for item in mistake_rows if item["index"] != current_index]
    existing.append({
        "index": current_index,
        "player": row["Player Name"],
        "your_answer": user_answer if user_answer else "(blank)",
        "correct_answer": correct_answer
    })
    mistake_rows[:] = sorted(existing, key=lambda item: item["index"])


def clear_mistake_if_fixed():
    mistake_rows[:] = [item for item in mistake_rows if item["index"] != current_index]


def process_answer(user_answer=None, timed_out=False):
    global current_player_index, headshot_revealed
    row = questions[current_index]
    correct_answer = str(row["College / Last School"]).strip()
    active_player = get_active_player_name()

    if user_answer is None:
        user_answer = answer_entry.get().strip()

    if timed_out:
        user_answer = ""

    user_answers[current_index] = user_answer

    if not user_answer and not timed_out:
        set_feedback("Please enter an answer or press Next to skip.", "orange")
        show_floating_icon("!", "orange")
        return

    cancel_question_timer()
    is_correct = is_correct_answer(user_answer, row)
    if is_v2() and headshot_reveal_var.get():
        headshot_revealed = True
        update_headshot(row)

    if quiz_mode.get() == "Learning":
        attempt_count[current_index] += 1
        if is_correct:
            results[current_index] = "Correct!"
            update_score_for_current_question(True)
            update_streak(True)
            clear_mistake_if_fixed()
            if is_v2() and two_player_var.get():
                player_scores[active_player] = player_scores.get(active_player, 0) + 1
            set_feedback(f"Correct! {correct_answer}", "lime")
            play_sound("correct")
            show_floating_icon("✔", "lime")
            flash_feedback("lime")
            root.after(700, go_next_safe)
            return

        update_score_for_current_question(False)
        update_streak(False)
        remember_mistake(user_answer, correct_answer)
        play_sound("wrong")

        if attempt_count[current_index] == 1:
            hint_count += 1
            hint = "Hint: First letters - " + " ".join(word[0] for word in correct_answer.split())
            results[current_index] = f"Wrong! {hint}"
            set_feedback(results[current_index], "orange")
            show_floating_icon("✖", "orange")
            start_question_timer()
            return
        if attempt_count[current_index] == 2:
            hint_count += 1
            words = correct_answer.split()
            hint = "Hint: Word lengths - " + " ".join(str(len(word)) for word in words)
            results[current_index] = f"Wrong again! {hint}"
            set_feedback(results[current_index], "orange")
            show_floating_icon("✖", "orange")
            start_question_timer()
            return

        results[current_index] = f"Wrong! Correct: {correct_answer}"
        set_feedback(results[current_index], "red")
        show_floating_icon("✖", "red")
        root.after(1000, go_next_safe)
        return

    if is_correct:
        results[current_index] = "Correct!"
        update_score_for_current_question(True)
        update_streak(True)
        clear_mistake_if_fixed()
        if is_v2() and two_player_var.get():
            player_scores[active_player] = player_scores.get(active_player, 0) + 1
        set_feedback("Correct!", "lime")
        play_sound("correct")
        show_floating_icon("✔", "lime")
        flash_feedback("lime")
    else:
        update_score_for_current_question(False)
        update_streak(False)
        remember_mistake(user_answer, correct_answer)
        if timed_out:
            results[current_index] = f"Wrong! Time ran out. Correct: {correct_answer}"
            set_feedback(results[current_index], "red")
        elif quiz_mode.get() == "Hard":
            results[current_index] = "Wrong!"
            set_feedback("Wrong! Hard mode only gives one shot.", "red")
        else:
            results[current_index] = f"Wrong! Correct: {correct_answer}"
            set_feedback(results[current_index], "red")
        play_sound("wrong")
        show_floating_icon("✖", "red")
        flash_feedback("red")

    advance_two_player_turn()

    root.after(700, go_next_safe)


def submit_answer(event=None):
    if not (0 <= current_index < len(questions)):
        return
    process_answer()
    clear_current_input()


def go_next_safe():
    root.after(100, go_next)


def go_next():
    global current_index, headshot_revealed
    cancel_question_timer()
    if current_index < len(questions) - 1:
        headshot_revealed = False
        current_index += 1
        update_gui()
        start_question_timer()
    else:
        show_end_screen()


def clear_current_input():
    answer_entry.delete(0, tk.END)


def next_question():
    if not (0 <= current_index < len(questions)):
        return

    hard_skip_disabled = quiz_mode.get() == "Hard" and hard_no_skip_var.get()
    if hard_skip_disabled and not results[current_index]:
        set_feedback("Skipping is disabled in Hard mode.", "red")
        show_floating_icon("✖", "red")
        return

    if not results[current_index]:
        user_answers[current_index] = answer_entry.get().strip()
        results[current_index] = "Skipped"
        update_streak(False)
        remember_mistake(user_answers[current_index], str(questions[current_index]["College / Last School"]).strip())
        set_feedback("Question skipped.", "orange")
        show_floating_icon("➜", "orange")
        advance_two_player_turn()

    clear_current_input()
    go_next()


def use_reveal_letter():
    global headshot_revealed
    active_powerups = get_active_powerups()
    if not is_v2() or active_powerups["reveal_letter"] <= 0 or not (0 <= current_index < len(questions)):
        return
    active_powerups["reveal_letter"] -= 1
    correct_answer = str(questions[current_index]["College / Last School"]).strip()
    extra = ""
    if headshot_reveal_var.get():
        headshot_revealed = True
        update_headshot(questions[current_index])
        extra = " Headshot revealed."
    set_feedback(f"Power-Up: Answer starts with '{correct_answer[0]}'.{extra}", ACCENT_ORANGE)
    powerup_label.config(text=format_powerup_summary())


def use_fifty_fifty():
    active_powerups = get_active_powerups()
    if not is_v2() or active_powerups["fifty_fifty"] <= 0:
        return
    if answer_style_var.get() != "Multiple Choice":
        set_feedback("50/50 only works in Multiple Choice mode.", ACCENT_ORANGE)
        return
    active_powerups["fifty_fifty"] -= 1
    disabled = 0
    correct = str(questions[current_index]["College / Last School"]).strip()
    for button in mc_buttons:
        if button.cget("text") != correct and disabled < 2 and button.winfo_manager():
            button.config(state="disabled")
            disabled += 1
    set_feedback("Power-Up: removed two wrong choices.", ACCENT_ORANGE)
    powerup_label.config(text=format_powerup_summary())


def use_free_skip():
    active_powerups = get_active_powerups()
    if not is_v2() or active_powerups["free_skip"] <= 0 or not (0 <= current_index < len(questions)):
        return
    active_powerups["free_skip"] -= 1
    user_answers[current_index] = ""
    results[current_index] = "Skipped"
    set_feedback("Power-Up: free skip used.", ACCENT_ORANGE)
    powerup_label.config(text=format_powerup_summary())
    advance_two_player_turn()
    go_next()


def previous_question():
    global current_index
    hard_back_disabled = quiz_mode.get() == "Hard" and hard_no_back_var.get()
    if hard_back_disabled:
        return
    if current_index > 0:
        cancel_question_timer()
        current_index -= 1
        update_gui()
        start_question_timer()


def start_timer(event=None):
    global timer_running, start_time
    if not timer_running and quiz_mode.get() == "Timed":
        start_time = time.time()
        timer_running = True
        update_timer()


def update_timer():
    global elapsed_time
    if timer_running:
        elapsed_time = time.time() - start_time
        timer_label.config(text=format_time(elapsed_time))
        root.after(500, update_timer)


def stop_timer():
    global timer_running, elapsed_time
    if timer_running:
        elapsed_time = time.time() - start_time
        timer_running = False


def show_review_window():
    if not mistake_rows:
        set_feedback("No mistakes to review. Nice work.", "lime")
        return

    review_window = tk.Toplevel(root)
    review_window.title("Missed Questions Review")
    review_window.geometry("900x500")
    review_window.configure(bg="#111111")

    review_title = tk.Label(
        review_window,
        text="Review Missed And Skipped Questions",
        font=question_font,
        bg="#111111",
        fg="#00FFFF"
    )
    review_title.pack(pady=15)

    text_box = tk.Text(
        review_window,
        wrap="word",
        bg="#1b1b1b",
        fg="white",
        font=("Helvetica", 12),
        padx=15,
        pady=15
    )
    text_box.pack(fill="both", expand=True, padx=20, pady=10)

    for item in mistake_rows:
        text_box.insert("end", f"Player: {item['player']}\n")
        text_box.insert("end", f"Your answer: {item['your_answer']}\n")
        text_box.insert("end", f"Correct answer: {item['correct_answer']}\n")
        text_box.insert("end", "-" * 65 + "\n")

    text_box.config(state="disabled")


def play_missed_only():
    global questions, current_index, score, hint_count, timer_running, elapsed_time, start_time
    if not mistake_rows:
        return
    end_frame.pack_forget()
    selected_players = {item["player"] for item in mistake_rows}
    replay_df = active_df[active_df["Player Name"].isin(selected_players)].copy()
    if replay_df.empty:
        return
    questions[:] = replay_df.to_dict("records")
    current_index = 0
    score = 0
    hint_count = 0
    timer_running = False
    elapsed_time = 0
    start_time = None
    user_answers[:] = [""] * len(questions)
    results[:] = [None] * len(questions)
    attempt_count[:] = [0] * len(questions)
    question_scored[:] = [False] * len(questions)
    displayed_progress_values[:] = [0.0] * len(questions)
    answer_entry.config(state="normal")
    submit_button.config(state="normal")
    next_button.config(state="normal")
    back_button.config(state="disabled")
    hint_button.config(state="normal")
    main_frame.pack(fill="both", expand=True)
    update_gui()
    flush_gui()


def show_end_screen():
    global run_achievements
    cancel_question_timer()
    cancel_progress_animation()
    stop_timer()
    main_frame.pack_forget()
    answer_entry.config(state="disabled")
    submit_button.config(state="disabled")
    next_button.config(state="disabled")
    back_button.config(state="disabled")
    hint_button.config(state="disabled")

    total_questions = len(questions)
    correct_total = sum(1 for result in results if result == "Correct!")
    skipped_total = sum(1 for result in results if result == "Skipped")
    wrong_total = total_questions - correct_total - skipped_total
    percent = round((correct_total / total_questions) * 100, 1) if total_questions else 0
    new_record = update_high_scores_if_needed()
    update_lifetime_stats(correct_total, wrong_total, skipped_total)
    run_achievements = unlock_achievements(correct_total, wrong_total, skipped_total, percent)
    daily_reward = claim_daily_reward(correct_total, percent)
    submit_leaderboard_entry(correct_total, percent)
    medal = compute_medal(percent, skipped_total)

    medal_map = {
        "Champion Gold Medal": ("GOLD MEDAL", ACCENT_GOLD, "#4b3a12"),
        "Silver Medal": ("SILVER MEDAL", "#d9e2ec", "#33404e"),
        "Bronze Medal": ("BRONZE MEDAL", "#cd7f32", "#4b2c12"),
        "Iron Competitor": ("IRON COMPETITOR", TEXT_PRIMARY, SURFACE_ALT),
        "Rookie Badge": ("ROOKIE BADGE", ACCENT_BLUE, SURFACE_ALT),
    }
    medal_text, medal_color, medal_bg = medal_map.get(medal, ("MEDAL", ACCENT_GOLD, SURFACE_ALT))
    medal_label.config(text=medal_text, fg=medal_color, bg=medal_bg)

    end_lines = [
        f"You got {correct_total} out of {total_questions} correct!",
        f"Accuracy: {percent}%",
        f"Wrong: {wrong_total}",
        f"Skipped: {skipped_total}",
        f"Hints used: {hint_count}",
        f"Best streak: {best_streak}",
        get_high_score_summary()
    ]

    if quiz_mode.get() == "Timed":
        end_lines.append(f"Time: {format_time(elapsed_time)}")

    if quiz_mode.get() == "Hard":
        rules = []
        if hard_no_hints_var.get():
            rules.append("no hints")
        if hard_no_back_var.get():
            rules.append("no back")
        if hard_no_skip_var.get():
            rules.append("no skip")
        if hard_timer_var.get():
            rules.append("15-second question timer")
        if rules:
            end_lines.append("Hard Mode Rules: " + ", ".join(rules))

    if new_record:
        end_lines.append("New high score set for these settings.")

    if daily_reward:
        end_lines.append(
            f"Daily Reward: {daily_reward['title']} | +{daily_reward['xp']} XP | +{daily_reward['points']} reward points"
        )

    if is_v2() and two_player_var.get():
        p1 = player_one_name_var.get()
        p2 = player_two_name_var.get()
        s1 = player_scores.get(p1, 0)
        s2 = player_scores.get(p2, 0)
        if s1 > s2:
            winner_line = f"Winner: {p1} ({s1}-{s2})"
        elif s2 > s1:
            winner_line = f"Winner: {p2} ({s2}-{s1})"
        else:
            winner_line = f"Matchup Result: Tie game ({s1}-{s2})"
        end_lines.insert(1, winner_line)

    if run_achievements:
        end_lines.append("")
        end_lines.append("Achievements This Run:")
        end_lines.extend([f"- {name}" for name in run_achievements])

    end_label.config(text="\n".join(end_lines))
    if is_v2() and mistake_rows:
        play_missed_button.grid()
    else:
        play_missed_button.grid_remove()
    end_frame.pack(fill="both", expand=True)
    flush_gui()


def show_hint():
    global hint_count
    if is_v2() and two_player_var.get():
        return
    hard_hints_disabled = quiz_mode.get() == "Hard" and hard_no_hints_var.get()
    if hard_hints_disabled:
        set_feedback("Hints are disabled in Hard mode.", "red")
        show_floating_icon("✖", "red")
        return

    hint_count += 1
    correct_answer = str(questions[current_index]["College / Last School"]).strip()
    words = correct_answer.split()
    if len(words) == 1:
        hint = f"Hint: Starts with '{correct_answer[0]}'"
    else:
        hint = f"Hint: {len(words)} words, first letters: {' '.join(word[0] for word in words)}"
    set_feedback(hint, "orange")
    show_floating_icon("💡", "orange")


# ===== GUI FRAMES =====
def style_option_menu(widget):
    widget.config(
        bg=ACCENT_BLUE,
        fg=BG_COLOR,
        activebackground=ACCENT_GOLD,
        activeforeground=BG_COLOR,
        font=feedback_font,
        width=12,
        bd=0,
        highlightthickness=0
    )
    widget["menu"].config(
        bg=SURFACE_ALT,
        fg=TEXT_PRIMARY,
        activebackground=ACCENT_BLUE,
        activeforeground=BG_COLOR,
        font=feedback_font
    )


def style_button(widget, bg_color, fg_color, active_bg=ACCENT_GOLD, active_fg=BG_COLOR):
    current_theme = theme_var.get() if "theme_var" in globals() else "Arena Blue"
    relief_map = {
        "Arena Blue": ("raised", 2),
        "Classic Gold": ("groove", 3),
        "Emerald Court": ("ridge", 2),
        "Midnight Heat": ("raised", 3),
    }
    relief_style, border = relief_map.get(current_theme, ("raised", 2))
    widget.config(
        font=action_font,
        bg=bg_color,
        fg=fg_color,
        activebackground=active_bg,
        activeforeground=active_fg,
        relief=relief_style,
        bd=border,
        highlightthickness=0,
        cursor="hand2",
        anchor="center",
        justify="center",
        height=1,
        padx=14,
        pady=10
    )


def get_theme_style(theme_name):
    styles = {
        "Arena Blue": {
            "banner_top": ACCENT_GOLD,
            "banner_bottom": ACCENT_BLUE,
            "mode_chip_bg": ACCENT_BLUE,
            "score_chip_bg": ACCENT_GOLD,
            "title_fg": TEXT_PRIMARY,
            "medal_bg": SURFACE_ALT,
            "medal_border": OUTLINE_COLOR,
            "question_outline": OUTLINE_COLOR,
            "control_outline": OUTLINE_COLOR,
        },
        "Classic Gold": {
            "banner_top": ACCENT_GOLD,
            "banner_bottom": "#fff1c1",
            "mode_chip_bg": "#d8b04f",
            "score_chip_bg": "#fff1c1",
            "title_fg": "#fff7e8",
            "medal_bg": "#3a2d18",
            "medal_border": "#9d7c3f",
            "question_outline": "#8d6f40",
            "control_outline": "#8d6f40",
        },
        "Emerald Court": {
            "banner_top": ACCENT_GREEN,
            "banner_bottom": ACCENT_BLUE,
            "mode_chip_bg": ACCENT_GREEN,
            "score_chip_bg": ACCENT_GOLD,
            "title_fg": "#effff7",
            "medal_bg": "#17382f",
            "medal_border": "#3b8c73",
            "question_outline": "#347260",
            "control_outline": "#347260",
        },
        "Midnight Heat": {
            "banner_top": ACCENT_RED,
            "banner_bottom": ACCENT_ORANGE,
            "mode_chip_bg": ACCENT_RED,
            "score_chip_bg": ACCENT_ORANGE,
            "title_fg": "#fff5f7",
            "medal_bg": "#442032",
            "medal_border": "#b4596a",
            "question_outline": "#7d415a",
            "control_outline": "#7d415a",
        },
    }
    return styles.get(theme_name, styles["Arena Blue"])


def apply_theme(theme_name):
    global BG_COLOR, SURFACE_COLOR, SURFACE_ALT, PANEL_COLOR, ACCENT_BLUE, ACCENT_GOLD
    global ACCENT_GREEN, ACCENT_RED, ACCENT_ORANGE, TEXT_PRIMARY, TEXT_MUTED
    global OUTLINE_COLOR, ENTRY_BG, BUTTON_DARK, PROGRESS_NEUTRAL, SKIP_COLOR

    palette = THEMES.get(theme_name, THEMES["Arena Blue"])
    theme_style = get_theme_style(theme_name)
    for key, value in palette.items():
        globals()[key] = value

    if "root" not in globals():
        return

    frame_colors = {
        root: BG_COLOR,
        start_frame: BG_COLOR,
        start_canvas: BG_COLOR,
        start_shell: BG_COLOR,
        start_card: SURFACE_COLOR,
        start_header: SURFACE_COLOR,
        config_panel: SURFACE_COLOR,
        left_panel: PANEL_COLOR,
        right_panel: PANEL_COLOR,
        profile_button_row: PANEL_COLOR,
        hard_options_frame: PANEL_COLOR,
        v2_options_frame: PANEL_COLOR,
        start_actions: SURFACE_COLOR,
        main_frame: BG_COLOR,
        main_shell: BG_COLOR,
        hud_card: SURFACE_COLOR,
        hud_top: SURFACE_COLOR,
        matchup_banner: SURFACE_ALT,
        matchup_center: SURFACE_ALT,
        question_card: SURFACE_COLOR,
        headshot_card: PANEL_COLOR,
        headshot_inner: SURFACE_ALT,
        answer_card: SURFACE_ALT,
        mc_frame: SURFACE_ALT,
        powerup_frame: SURFACE_ALT,
        feedback_strip: SURFACE_COLOR,
        control_card: SURFACE_COLOR,
        button_frame: SURFACE_COLOR,
        end_frame: BG_COLOR,
        end_shell: BG_COLOR,
        end_card: SURFACE_COLOR,
        end_actions: SURFACE_COLOR,
    }
    for widget, color in frame_colors.items():
        widget.config(bg=color)

    for frame in (start_card, left_panel, right_panel, hud_card, matchup_banner, answer_card, feedback_strip, end_card, headshot_inner):
        frame.config(highlightbackground=OUTLINE_COLOR)
    question_card.config(highlightbackground=theme_style["question_outline"], highlightthickness=2)
    control_card.config(highlightbackground=theme_style["control_outline"], highlightthickness=2)
    headshot_card.config(highlightbackground=ACCENT_BLUE)
    hero_banner.config(bg=theme_style["banner_top"])
    end_banner.config(bg=theme_style["banner_bottom"])

    label_configs = [
        (title_label, SURFACE_COLOR, theme_style["title_fg"]),
        (subtitle_label, SURFACE_COLOR, TEXT_MUTED),
        (version_label, SURFACE_COLOR, ACCENT_GOLD),
        (rank_label, SURFACE_COLOR, TEXT_MUTED),
        (v2_names_label, SURFACE_COLOR, TEXT_MUTED),
        (mode_label, PANEL_COLOR, TEXT_PRIMARY),
        (version_mode_label, PANEL_COLOR, ACCENT_GOLD),
        (style_label, PANEL_COLOR, TEXT_PRIMARY),
        (length_label, PANEL_COLOR, TEXT_PRIMARY),
        (conf_label, PANEL_COLOR, TEXT_PRIMARY),
        (high_score_label, PANEL_COLOR, ACCENT_GOLD),
        (profile_title, PANEL_COLOR, ACCENT_GOLD),
        (v2_options_title, PANEL_COLOR, ACCENT_GOLD),
        (hard_options_title, PANEL_COLOR, TEXT_PRIMARY),
        (progress_label, SURFACE_COLOR, TEXT_MUTED),
        (streak_label, SURFACE_COLOR, ACCENT_GOLD),
        (player_turn_label, SURFACE_ALT, ACCENT_GOLD),
        (powerup_label, SURFACE_ALT, TEXT_PRIMARY),
        (waiting_player_label, SURFACE_ALT, TEXT_MUTED),
        (question_label, SURFACE_COLOR, TEXT_PRIMARY),
        (answer_prompt, SURFACE_ALT, ACCENT_BLUE),
        (feedback_icon, SURFACE_COLOR, TEXT_PRIMARY),
        (feedback_label, SURFACE_COLOR, ACCENT_GOLD),
        (end_title, SURFACE_COLOR, theme_style["title_fg"]),
        (medal_label, theme_style["medal_bg"], ACCENT_GOLD),
        (end_label, SURFACE_COLOR, ACCENT_GREEN),
        (headshot_label, SURFACE_ALT, TEXT_MUTED),
        (school_logo_label, SURFACE_COLOR, BG_COLOR),
        (timer_label, SURFACE_COLOR, TEXT_PRIMARY),
        (question_timer_label, SURFACE_COLOR, ACCENT_ORANGE),
    ]
    for label, bg, fg in label_configs:
        label.config(bg=bg, fg=fg)

    mode_chip_label.config(bg=theme_style["mode_chip_bg"], fg=BUTTON_TEXT)
    score_chip_label.config(bg=theme_style["score_chip_bg"], fg=BUTTON_TEXT)
    medal_label.config(bg=theme_style["medal_bg"], highlightbackground=theme_style["medal_border"], highlightthickness=2, relief="ridge", bd=2)
    headshot_card.config(highlightbackground=theme_style["banner_bottom"])

    if "hero_chip_widgets" in globals():
        chip_palettes = {
            "Arena Blue": [ACCENT_BLUE, ACCENT_GOLD, ACCENT_RED],
            "Classic Gold": ["#d8b04f", "#fff1c1", "#c9835a"],
            "Emerald Court": [ACCENT_GREEN, ACCENT_GOLD, ACCENT_BLUE],
            "Midnight Heat": [ACCENT_RED, ACCENT_ORANGE, ACCENT_GOLD],
        }
        chip_colors = chip_palettes.get(theme_name, chip_palettes["Arena Blue"])
        for chip, chip_bg in zip(hero_chip_widgets, chip_colors):
            chip.config(bg=chip_bg, fg=BUTTON_TEXT)

    answer_entry.config(bg=ENTRY_BG, fg=TEXT_PRIMARY, insertbackground=TEXT_PRIMARY)
    conference_search_entry.config(bg=ENTRY_BG, fg=TEXT_PRIMARY, insertbackground=TEXT_PRIMARY)
    new_profile_entry.config(bg=ENTRY_BG, fg=TEXT_PRIMARY, insertbackground=TEXT_PRIMARY)

    for menu in (length_dropdown, conf_dropdown, profile_menu):
        style_option_menu(menu)

    for button, bg, hover in [
        (start_button, ACCENT_BLUE, "#67d7ff"),
        (exit_button, ACCENT_RED, "#ff7f90"),
        (start_stats_button, ACCENT_GOLD, "#ffd978"),
        (settings_button, BUTTON_DARK, ACCENT_BLUE),
        (create_profile_button, ACCENT_GREEN, "#6ce39a"),
        (leaderboard_button, ACCENT_GOLD, "#ffd978"),
        (reveal_button, ACCENT_ORANGE, "#ffb86a"),
        (fifty_button, ACCENT_BLUE, "#67d7ff"),
        (skip_power_button, BUTTON_DARK, ACCENT_BLUE),
        (back_button, BUTTON_DARK, ACCENT_BLUE),
        (submit_button, ACCENT_GREEN, "#6ce39a"),
        (next_button, ACCENT_BLUE, "#67d7ff"),
        (hint_button, ACCENT_ORANGE, "#ffb86a"),
        (home_button, BUTTON_DARK, ACCENT_BLUE),
        (quit_button, ACCENT_RED, "#ff7f90"),
        (restart_button, ACCENT_BLUE, "#67d7ff"),
        (review_button, ACCENT_ORANGE, "#ffb86a"),
        (stats_button, ACCENT_GOLD, "#ffd978"),
        (home_end_button, BUTTON_DARK, ACCENT_BLUE),
        (play_missed_button, ACCENT_GREEN, "#6ce39a"),
    ]:
        style_button(button, bg, BUTTON_TEXT)
        add_hover_effect(button, bg, hover, BUTTON_TEXT, BUTTON_TEXT)

    for compact_button in (reveal_button, fifty_button, skip_power_button, back_button, submit_button, next_button, hint_button, home_button, quit_button):
        compact_button.config(font=feedback_font, padx=8, pady=6)

    for button in mc_buttons:
        button.config(bg=BUTTON_DARK, fg=BUTTON_TEXT, activebackground=ACCENT_BLUE, activeforeground=BUTTON_TEXT)
        add_hover_effect(button, BUTTON_DARK, ACCENT_BLUE, BUTTON_TEXT, BUTTON_TEXT)

    for radio in version_frame.winfo_children() + modes_frame.winfo_children() + style_frame.winfo_children():
        radio.config(bg=PANEL_COLOR, fg=TEXT_PRIMARY, selectcolor=SURFACE_ALT, activebackground=PANEL_COLOR, activeforeground=TEXT_PRIMARY)
    for parent in (hard_options_frame, v2_options_frame):
        for child in parent.winfo_children():
            if isinstance(child, tk.Checkbutton):
                child.config(bg=PANEL_COLOR, fg=TEXT_PRIMARY, selectcolor=SURFACE_ALT, activebackground=PANEL_COLOR, activeforeground=TEXT_PRIMARY)

    if "settings_button" in globals():
        draw_progress_bar(displayed_progress_values if displayed_progress_values else [0.0] * len(questions))
        if questions and 0 <= current_index < len(questions):
            update_headshot(questions[current_index])
            update_school_logo(questions[current_index])
        flush_gui()

start_frame = tk.Frame(root, bg=BG_COLOR)
start_frame.pack(fill="both", expand=True)

start_canvas = tk.Canvas(start_frame, bg=BG_COLOR, highlightthickness=0)
start_scrollbar = tk.Scrollbar(start_frame, orient="vertical", command=start_canvas.yview)
start_canvas.configure(yscrollcommand=start_scrollbar.set)

start_scrollbar.pack(side=tk.RIGHT, fill="y")
start_canvas.pack(side=tk.LEFT, fill="both", expand=True)

start_shell = tk.Frame(start_canvas, bg=BG_COLOR)
start_canvas_window = start_canvas.create_window((0, 0), window=start_shell, anchor="nw")


def update_start_scroll_region(event=None):
    start_canvas.configure(scrollregion=start_canvas.bbox("all"))


def resize_start_canvas_window(event):
    start_canvas.itemconfigure(start_canvas_window, width=event.width)


def on_start_mousewheel(event):
    start_canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")


start_shell.bind("<Configure>", update_start_scroll_region)
start_canvas.bind("<Configure>", resize_start_canvas_window)
start_canvas.bind_all("<MouseWheel>", on_start_mousewheel)

hero_banner = tk.Frame(start_shell, bg=ACCENT_GOLD, height=10)
hero_banner.pack(fill="x")

start_card = tk.Frame(start_shell, bg=SURFACE_COLOR, highlightbackground=OUTLINE_COLOR, highlightthickness=2)
start_card.pack(fill="both", expand=True, pady=(14, 0))

start_header = tk.Frame(start_card, bg=SURFACE_COLOR)
start_header.pack(fill="x", padx=30, pady=(24, 10))

title_label = tk.Label(start_header, text="COURT VISION", font=title_font, bg=SURFACE_COLOR, fg=TEXT_PRIMARY)
title_label.pack()

subtitle_label = tk.Label(
    start_header,
    text="A fast, arcade-style college guessing game built around your player data.",
    font=subtitle_font,
    bg=SURFACE_COLOR,
    fg=TEXT_MUTED
)
subtitle_label.pack(pady=(6, 0))

version_label = tk.Label(start_header, text="Version Selected: V1", font=feedback_font, bg=SURFACE_COLOR, fg=ACCENT_GOLD)
version_label.pack(pady=(8, 0))

rank_label = tk.Label(start_header, text=f"XP: {lifetime_stats.get('xp', 0)} | Rank: {get_rank_from_xp(lifetime_stats.get('xp', 0))}", font=feedback_font, bg=SURFACE_COLOR, fg=TEXT_MUTED)
rank_label.pack(pady=(4, 0))

v2_names_label = tk.Label(start_header, text="", font=feedback_font, bg=SURFACE_COLOR, fg=TEXT_MUTED)
v2_names_label.pack(pady=(4, 0))

hero_chip_row = tk.Frame(start_header, bg=SURFACE_COLOR)
hero_chip_row.pack(pady=(14, 0))

hero_chip_widgets = []
for chip_text, chip_bg, chip_fg in [
    ("Typed + Multiple Choice", ACCENT_BLUE, BG_COLOR),
    ("Streak Tracking", ACCENT_GOLD, BG_COLOR),
    ("Hardcore Modes", ACCENT_RED, TEXT_PRIMARY),
]:
    chip = tk.Label(
        hero_chip_row,
        text=chip_text,
        font=chip_font,
        bg=chip_bg,
        fg=chip_fg,
        padx=12,
        pady=6
    )
    chip.pack(side=tk.LEFT, padx=6)
    hero_chip_widgets.append(chip)

config_panel = tk.Frame(start_card, bg=SURFACE_COLOR)
config_panel.pack(fill="both", expand=True, padx=24, pady=20)

left_panel = tk.Frame(config_panel, bg=PANEL_COLOR, highlightbackground=OUTLINE_COLOR, highlightthickness=1)
left_panel.pack(side=tk.LEFT, fill="both", expand=True, padx=(0, 10), pady=4)

right_panel = tk.Frame(config_panel, bg=PANEL_COLOR, highlightbackground=OUTLINE_COLOR, highlightthickness=1)
right_panel.pack(side=tk.LEFT, fill="both", expand=True, padx=(10, 0), pady=4)

mode_label = tk.Label(left_panel, text="Game Mode", font=label_font, bg=PANEL_COLOR, fg=TEXT_PRIMARY)
mode_label.pack(anchor="w", padx=18, pady=(18, 8))

version_mode_label = tk.Label(left_panel, text="Choose Version", font=label_font, bg=PANEL_COLOR, fg=ACCENT_GOLD)
version_mode_label.pack(anchor="w", padx=18, pady=(4, 8))

version_frame = tk.Frame(left_panel, bg=PANEL_COLOR)
version_frame.pack(anchor="w", padx=14)
for text, value in [("V1", "v1"), ("V2", "v2")]:
    rb = tk.Radiobutton(
        version_frame,
        text=text,
        variable=app_version_var,
        value=value,
        font=feedback_font,
        width=10,
        padx=8,
        pady=6,
        bg=PANEL_COLOR,
        fg=TEXT_PRIMARY,
        selectcolor=SURFACE_ALT,
        activebackground=PANEL_COLOR,
        activeforeground=TEXT_PRIMARY,
        anchor="w",
        highlightthickness=0,
        bd=0
    )
    rb.pack(anchor="w", pady=3)

modes_frame = tk.Frame(left_panel, bg=PANEL_COLOR)
modes_frame.pack(anchor="w", padx=14)
modes = [("Practice", "Practice"), ("Timed", "Timed"), ("Hard", "Hard"), ("Learning", "Learning")]
for text, mode in modes:
    rb = tk.Radiobutton(
        modes_frame,
        text=text,
        variable=quiz_mode,
        value=mode,
        font=feedback_font,
        width=12,
        padx=8,
        pady=6,
        bg=PANEL_COLOR,
        fg=TEXT_PRIMARY,
        selectcolor=SURFACE_ALT,
        activebackground=PANEL_COLOR,
        activeforeground=TEXT_PRIMARY,
        anchor="w",
        highlightthickness=0,
        bd=0
    )
    rb.pack(anchor="w", pady=5)

style_label = tk.Label(left_panel, text="Answer Style", font=label_font, bg=PANEL_COLOR, fg=TEXT_PRIMARY)
style_label.pack(anchor="w", padx=18, pady=(18, 8))

style_frame = tk.Frame(left_panel, bg=PANEL_COLOR)
style_frame.pack(anchor="w", padx=14)
for text, value in [("Typed", "Typed"), ("Multiple Choice", "Multiple Choice")]:
    rb = tk.Radiobutton(
        style_frame,
        text=text,
        variable=answer_style_var,
        value=value,
        font=feedback_font,
        width=16,
        padx=8,
        pady=6,
        bg=PANEL_COLOR,
        fg=TEXT_PRIMARY,
        selectcolor=SURFACE_ALT,
        activebackground=PANEL_COLOR,
        activeforeground=TEXT_PRIMARY,
        anchor="w",
        highlightthickness=0,
        bd=0
    )
    rb.pack(anchor="w", pady=5)

length_label = tk.Label(left_panel, text="Quiz Length", font=label_font, bg=PANEL_COLOR, fg=TEXT_PRIMARY)
length_label.pack(anchor="w", padx=18, pady=(18, 8))

length_dropdown = tk.OptionMenu(left_panel, quiz_length_var, "10", "25", "50", "All")
style_option_menu(length_dropdown)
length_dropdown.pack(anchor="w", padx=18, pady=(0, 12))

conf_label = tk.Label(right_panel, text="Conference Filter (Learning Mode)", font=label_font, bg=PANEL_COLOR, fg=TEXT_PRIMARY)
conf_label.pack(anchor="w", padx=18, pady=(18, 8))

conference_search_entry = tk.Entry(
    right_panel,
    textvariable=conference_search_var,
    font=feedback_font,
    width=28,
    bg=ENTRY_BG,
    fg=TEXT_PRIMARY,
    insertbackground=TEXT_PRIMARY,
    relief="flat",
    bd=0
)
conference_search_entry.pack(anchor="w", padx=18, pady=(0, 10), ipady=10)

conf_dropdown = tk.OptionMenu(right_panel, category_var, "All", *all_conferences)
style_option_menu(conf_dropdown)
conf_dropdown.pack(anchor="w", padx=18, pady=(0, 18))

hard_options_frame = tk.Frame(right_panel, bg=PANEL_COLOR)

hard_options_title = tk.Label(hard_options_frame, text="Hard Mode Toggles", font=label_font, bg=PANEL_COLOR, fg=TEXT_PRIMARY)
hard_options_title.pack(anchor="w", pady=(4, 8))

for text, var in [
    ("No hints", hard_no_hints_var),
    ("No back button", hard_no_back_var),
    ("No skipping", hard_no_skip_var),
    ("15-second question timer", hard_timer_var),
]:
    cb = tk.Checkbutton(
        hard_options_frame,
        text=text,
        variable=var,
        font=feedback_font,
        bg=PANEL_COLOR,
        fg=ACCENT_GOLD,
        selectcolor=SURFACE_ALT,
        activebackground=PANEL_COLOR,
        activeforeground=ACCENT_GOLD,
        highlightthickness=0,
        bd=0
    )
    cb.pack(anchor="w", pady=2)

hard_options_frame.pack(anchor="w", padx=18, pady=(0, 18))

high_score_label = tk.Label(
    right_panel,
    text="",
    font=feedback_font,
    bg=PANEL_COLOR,
    fg=ACCENT_GOLD,
    wraplength=380,
    justify="left"
)
high_score_label.pack(anchor="w", padx=18, pady=(8, 12))

profile_title = tk.Label(right_panel, text="Profiles", font=label_font, bg=PANEL_COLOR, fg=ACCENT_GOLD)
profile_title.pack(anchor="w", padx=18, pady=(4, 6))

profile_menu = tk.OptionMenu(right_panel, current_profile_var, current_profile_var.get())
style_option_menu(profile_menu)
profile_menu.pack(anchor="w", padx=18, pady=(0, 8))

new_profile_entry = tk.Entry(
    right_panel,
    textvariable=new_profile_var,
    font=feedback_font,
    width=22,
    bg=ENTRY_BG,
    fg=TEXT_PRIMARY,
    insertbackground=TEXT_PRIMARY,
    relief="flat",
    bd=0
)
new_profile_entry.pack(anchor="w", padx=18, pady=(0, 8), ipady=8)

profile_button_row = tk.Frame(right_panel, bg=PANEL_COLOR)
profile_button_row.pack(anchor="w", padx=18, pady=(0, 14))

create_profile_button = tk.Button(profile_button_row, text="Create", command=create_profile, width=10)
style_button(create_profile_button, ACCENT_GREEN, BUTTON_TEXT)
add_hover_effect(create_profile_button, ACCENT_GREEN, "#6ce39a", BUTTON_TEXT)
create_profile_button.pack(side=tk.LEFT, padx=(0, 6))

leaderboard_button = tk.Button(profile_button_row, text="Leaderboard", command=show_leaderboard_window, width=12)
style_button(leaderboard_button, ACCENT_GOLD, BUTTON_TEXT)
add_hover_effect(leaderboard_button, ACCENT_GOLD, "#ffd978", BUTTON_TEXT)
leaderboard_button.pack(side=tk.LEFT, padx=(0, 6))

v2_options_frame = tk.Frame(right_panel, bg=PANEL_COLOR)
v2_options_frame.pack(anchor="w", padx=18, pady=(4, 12))

v2_options_title = tk.Label(v2_options_frame, text="V2 Extras", font=label_font, bg=PANEL_COLOR, fg=ACCENT_GOLD)
v2_options_title.pack(anchor="w", pady=(0, 6))

for text, var in [
    ("Daily Challenge", daily_challenge_var),
    ("2-Player Local", two_player_var),
    ("Guess From Headshot Reveal", headshot_reveal_var),
    ("School Logos", show_logos_var),
]:
    cb = tk.Checkbutton(v2_options_frame, text=text, variable=var, font=feedback_font, bg=PANEL_COLOR, fg=TEXT_PRIMARY, selectcolor=SURFACE_ALT, activebackground=PANEL_COLOR)
    cb.pack(anchor="w", pady=2)

start_actions = tk.Frame(start_card, bg=SURFACE_COLOR)
start_actions.pack(pady=(0, 28))

start_button = tk.Button(
    start_actions,
    text="Start Game",
    command=start_quiz,
    font=label_font,
    width=16,
)
style_button(start_button, ACCENT_BLUE, BUTTON_TEXT)
add_hover_effect(start_button, ACCENT_BLUE, "#67d7ff", BUTTON_TEXT)
start_button.pack(side=tk.LEFT, padx=8)

exit_button = tk.Button(
    start_actions,
    text="Quit",
    command=root.destroy,
    font=label_font,
    width=12,
)
style_button(exit_button, ACCENT_RED, BUTTON_TEXT)
add_hover_effect(exit_button, ACCENT_RED, "#ff7f90", BUTTON_TEXT)
exit_button.pack(side=tk.LEFT, padx=8)

start_stats_button = tk.Button(
    start_actions,
    text="Stats",
    command=show_stats_window,
    font=label_font,
    width=12,
)
style_button(start_stats_button, ACCENT_GOLD, BUTTON_TEXT, ACCENT_BLUE, BUTTON_TEXT)
add_hover_effect(start_stats_button, ACCENT_GOLD, "#ffd978", BUTTON_TEXT)
start_stats_button.pack(side=tk.LEFT, padx=8)

settings_button = tk.Button(
    start_actions,
    text="Settings",
    command=show_settings_window,
    font=label_font,
    width=12,
)
style_button(settings_button, BUTTON_DARK, BUTTON_TEXT)
add_hover_effect(settings_button, BUTTON_DARK, ACCENT_BLUE, BUTTON_TEXT, BUTTON_TEXT)
settings_button.pack(side=tk.LEFT, padx=8)

# Main Frame
main_frame = tk.Frame(root, bg=BG_COLOR)

main_shell = tk.Frame(main_frame, bg=BG_COLOR)
main_shell.pack(fill="both", expand=True, padx=18, pady=12)

hud_card = tk.Frame(main_shell, bg=SURFACE_COLOR, highlightbackground=OUTLINE_COLOR, highlightthickness=2)
hud_card.pack(fill="x", pady=(0, 8))

hud_top = tk.Frame(hud_card, bg=SURFACE_COLOR)
hud_top.pack(fill="x", padx=16, pady=(12, 8))

mode_chip_label = tk.Label(hud_top, text="Practice Mode", font=chip_font, bg=ACCENT_BLUE, fg=BG_COLOR, padx=12, pady=6)
mode_chip_label.pack(side=tk.LEFT, padx=(0, 8))

score_chip_label = tk.Label(hud_top, text="Score 0", font=chip_font, bg=ACCENT_GOLD, fg=BG_COLOR, padx=12, pady=6)
score_chip_label.pack(side=tk.LEFT)

timer_label = tk.Label(hud_top, text="00:00", font=timer_font, bg=SURFACE_COLOR, fg=TEXT_PRIMARY)
timer_label.pack(side=tk.RIGHT, padx=(10, 0))

question_timer_label = tk.Label(hud_top, text="", font=timer_font, bg=SURFACE_COLOR, fg=ACCENT_ORANGE)
question_timer_label.pack(side=tk.RIGHT)

progress_label = tk.Label(hud_card, text="", font=feedback_font, bg=SURFACE_COLOR, fg=TEXT_MUTED)
progress_label.pack(anchor="w", padx=20)

streak_label = tk.Label(hud_card, text="Current Streak: 0 | Best Streak: 0", font=feedback_font, bg=SURFACE_COLOR, fg=ACCENT_GOLD)
streak_label.pack(anchor="w", padx=20, pady=(4, 6))

matchup_banner = tk.Frame(hud_card, bg=SURFACE_ALT, highlightbackground=OUTLINE_COLOR, highlightthickness=1)
matchup_banner.pack(fill="x", padx=20, pady=(2, 8))

matchup_center = tk.Frame(matchup_banner, bg=SURFACE_ALT)
matchup_center.pack(expand=True, pady=6)

player_turn_label = tk.Label(matchup_center, text="", font=label_font, bg=SURFACE_ALT, fg=ACCENT_GOLD, justify="center", anchor="center")
player_turn_label.pack(pady=(2, 1))

powerup_label = tk.Label(matchup_center, text="", font=feedback_font, bg=SURFACE_ALT, fg=ACCENT_BLUE, justify="center", anchor="center")
powerup_label.pack(pady=(0, 2))

waiting_player_label = tk.Label(matchup_banner, text="", font=feedback_font, bg=SURFACE_ALT, fg=TEXT_MUTED, justify="right", anchor="e")

progress_canvas = tk.Canvas(main_shell, width=900, height=24, bg=BG_COLOR, highlightthickness=0)
progress_canvas.pack(fill="x", pady=(0, 10))

question_card = tk.Frame(main_shell, bg=SURFACE_COLOR, highlightbackground=OUTLINE_COLOR, highlightthickness=2)
question_card.pack(fill="x", pady=(0, 8))

headshot_card = tk.Frame(question_card, bg=PANEL_COLOR, highlightbackground=ACCENT_BLUE, highlightthickness=1, bd=0)
headshot_card.pack(pady=(12, 4))

headshot_inner = tk.Frame(headshot_card, bg=SURFACE_ALT, highlightbackground=OUTLINE_COLOR, highlightthickness=1, width=160, height=160)
headshot_inner.pack(padx=8, pady=8)
headshot_inner.pack_propagate(False)

headshot_label = tk.Label(
    headshot_inner,
    text="",
    font=feedback_font,
    bg=SURFACE_ALT,
    fg=TEXT_MUTED,
    wraplength=160,
    justify="center"
)
headshot_label.pack()

school_logo_label = tk.Label(
    question_card,
    text="",
    font=feedback_font,
    bg=SURFACE_COLOR,
    fg=BG_COLOR
)
school_logo_label.pack(pady=(0, 8))

question_label = tk.Label(
    question_card,
    text="",
    font=question_font,
    wraplength=860,
    justify="center",
    bg=SURFACE_COLOR,
    fg=TEXT_PRIMARY,
    padx=20,
    pady=16
)
question_label.pack()

answer_card = tk.Frame(main_shell, bg=SURFACE_ALT, highlightbackground=OUTLINE_COLOR, highlightthickness=1)
answer_card.pack(fill="x", pady=(0, 8))

answer_prompt = tk.Label(answer_card, text="Make your pick", font=label_font, bg=SURFACE_ALT, fg=ACCENT_BLUE)
answer_prompt.pack(pady=(12, 6))

answer_entry = tk.Entry(
    answer_card,
    font=label_font,
    width=42,
    bg=ENTRY_BG,
    fg=TEXT_PRIMARY,
    insertbackground=TEXT_PRIMARY,
    relief="flat",
    bd=0,
    justify="center"
)
answer_entry.pack(pady=(0, 14), ipady=12)
answer_entry.focus()
answer_entry.bind("<Key>", start_timer)

mc_frame = tk.Frame(answer_card, bg=SURFACE_ALT)
mc_buttons = []
for _ in range(4):
    button = tk.Button(
        mc_frame,
        font=feedback_font,
        bg=BUTTON_DARK,
        fg=TEXT_PRIMARY,
        activebackground=ACCENT_BLUE,
        activeforeground=BG_COLOR,
        wraplength=700,
        relief="flat",
        bd=0,
        padx=12,
        pady=12
    )
    add_hover_effect(button, BUTTON_DARK, ACCENT_BLUE, BUTTON_TEXT, BUTTON_TEXT)
    mc_buttons.append(button)

powerup_frame = tk.Frame(answer_card, bg=SURFACE_ALT)
powerup_frame.pack(pady=(0, 8))

reveal_button = tk.Button(powerup_frame, text="Reveal", command=use_reveal_letter, width=10)
style_button(reveal_button, ACCENT_ORANGE, BUTTON_TEXT)
reveal_button.config(font=feedback_font, padx=10, pady=6)
add_hover_effect(reveal_button, ACCENT_ORANGE, "#ffb86a", BUTTON_TEXT)
reveal_button.pack(side=tk.LEFT, padx=6)

fifty_button = tk.Button(powerup_frame, text="50/50", command=use_fifty_fifty, width=10)
style_button(fifty_button, ACCENT_BLUE, BUTTON_TEXT)
fifty_button.config(font=feedback_font, padx=10, pady=6)
add_hover_effect(fifty_button, ACCENT_BLUE, "#67d7ff", BUTTON_TEXT)
fifty_button.pack(side=tk.LEFT, padx=6)

skip_power_button = tk.Button(powerup_frame, text="Free Skip", command=use_free_skip, width=10)
style_button(skip_power_button, BUTTON_DARK, BUTTON_TEXT)
skip_power_button.config(font=feedback_font, padx=10, pady=6)
add_hover_effect(skip_power_button, BUTTON_DARK, ACCENT_BLUE, BUTTON_TEXT, BUTTON_TEXT)
skip_power_button.pack(side=tk.LEFT, padx=6)

feedback_strip = tk.Frame(main_shell, bg=SURFACE_COLOR, highlightbackground=OUTLINE_COLOR, highlightthickness=1)

feedback_icon = tk.Label(feedback_strip, text="", font=label_font, bg=SURFACE_COLOR, fg=TEXT_PRIMARY)
feedback_icon.pack(side=tk.LEFT, padx=(18, 10), pady=14)

feedback_label = tk.Label(
    feedback_strip,
    text="",
    font=feedback_font,
    bg=SURFACE_COLOR,
    fg=ACCENT_GOLD,
    wraplength=820,
    justify="left"
)
feedback_label.pack(side=tk.LEFT, pady=14)

control_card = tk.Frame(main_shell, bg=SURFACE_COLOR, highlightbackground=OUTLINE_COLOR, highlightthickness=2)
control_card.pack(fill="x", pady=(6, 4))

button_frame = tk.Frame(control_card, bg=SURFACE_COLOR)
button_frame.pack(fill="x", padx=10, pady=8)
for col in range(6):
    button_frame.grid_columnconfigure(col, weight=1, uniform="game_buttons")

back_button = tk.Button(button_frame, text="Back", command=previous_question, width=10, bg=BUTTON_DARK, fg=BUTTON_TEXT, activebackground=ACCENT_GOLD, activeforeground=BUTTON_TEXT, relief="flat", bd=0, padx=10, pady=10)
style_button(back_button, BUTTON_DARK, BUTTON_TEXT)
back_button.config(font=feedback_font, padx=8, pady=6)
add_hover_effect(back_button, BUTTON_DARK, ACCENT_BLUE, BUTTON_TEXT, BUTTON_TEXT)
back_button.grid(row=0, column=0, padx=6, pady=4, sticky="ew")

submit_button = tk.Button(button_frame, text="Submit", command=submit_answer, width=10, bg=ACCENT_GREEN, fg=BG_COLOR, activebackground=ACCENT_GOLD, activeforeground=BG_COLOR, relief="flat", bd=0, padx=10, pady=10)
style_button(submit_button, ACCENT_GREEN, BUTTON_TEXT)
submit_button.config(font=feedback_font, padx=8, pady=6)
add_hover_effect(submit_button, ACCENT_GREEN, "#6ce39a", BUTTON_TEXT)
submit_button.grid(row=0, column=1, padx=6, pady=4, sticky="ew")

next_button = tk.Button(button_frame, text="Next", command=next_question, width=10, bg=ACCENT_BLUE, fg=BG_COLOR, activebackground=ACCENT_GOLD, activeforeground=BG_COLOR, relief="flat", bd=0, padx=10, pady=10)
style_button(next_button, ACCENT_BLUE, BUTTON_TEXT)
next_button.config(font=feedback_font, padx=8, pady=6)
add_hover_effect(next_button, ACCENT_BLUE, "#67d7ff", BUTTON_TEXT)
next_button.grid(row=0, column=2, padx=6, pady=4, sticky="ew")

hint_button = tk.Button(button_frame, text="Hint", command=show_hint, width=10, bg=ACCENT_ORANGE, fg=BG_COLOR, activebackground=ACCENT_GOLD, activeforeground=BG_COLOR, relief="flat", bd=0, padx=10, pady=10)
style_button(hint_button, ACCENT_ORANGE, BUTTON_TEXT)
hint_button.config(font=feedback_font, padx=8, pady=6)
add_hover_effect(hint_button, ACCENT_ORANGE, "#ffb86a", BUTTON_TEXT)
hint_button.grid(row=0, column=3, padx=6, pady=4, sticky="ew")

home_button = tk.Button(button_frame, text="Home", command=show_home, width=10, bg=BUTTON_DARK, fg=BUTTON_TEXT, activebackground=ACCENT_GOLD, activeforeground=BUTTON_TEXT, relief="flat", bd=0, padx=10, pady=10)
style_button(home_button, BUTTON_DARK, BUTTON_TEXT)
home_button.config(font=feedback_font, padx=8, pady=6)
add_hover_effect(home_button, BUTTON_DARK, ACCENT_BLUE, BUTTON_TEXT, BUTTON_TEXT)
home_button.grid(row=0, column=4, padx=6, pady=4, sticky="ew")

quit_button = tk.Button(button_frame, text="Quit", command=root.destroy, width=10, bg=ACCENT_RED, fg=BUTTON_TEXT, activebackground=ACCENT_GOLD, activeforeground=BUTTON_TEXT, relief="flat", bd=0, padx=10, pady=10)
style_button(quit_button, ACCENT_RED, BUTTON_TEXT)
quit_button.config(font=feedback_font, padx=8, pady=6)
add_hover_effect(quit_button, ACCENT_RED, "#ff7f90", BUTTON_TEXT)
quit_button.grid(row=0, column=5, padx=6, pady=4, sticky="ew")

root.bind("<Return>", handle_return_key)

# End Frame
end_frame = tk.Frame(root, bg=BG_COLOR)

end_shell = tk.Frame(end_frame, bg=BG_COLOR)
end_shell.pack(fill="both", expand=True, padx=28, pady=28)

end_banner = tk.Frame(end_shell, bg=ACCENT_BLUE, height=10)
end_banner.pack(fill="x")

end_card = tk.Frame(end_shell, bg=SURFACE_COLOR, highlightbackground=OUTLINE_COLOR, highlightthickness=2)
end_card.pack(fill="both", expand=True, pady=(14, 0))

end_title = tk.Label(end_card, text="Final Scoreboard", font=title_font, bg=SURFACE_COLOR, fg=TEXT_PRIMARY)
end_title.pack(pady=(26, 10))

medal_label = tk.Label(end_card, text="", font=label_font, bg=SURFACE_COLOR, fg=ACCENT_GOLD, padx=18, pady=10)
medal_label.pack(pady=(4, 4))

end_label = tk.Label(end_card, text="", font=question_font, bg=SURFACE_COLOR, fg=ACCENT_GREEN, justify="center", wraplength=900)
end_label.pack(pady=20, padx=24)

end_actions = tk.Frame(end_card, bg=SURFACE_COLOR)
end_actions.pack(pady=(0, 28))
for col in range(2):
    end_actions.grid_columnconfigure(col, weight=1, uniform="end_actions")

restart_button = tk.Button(end_actions, text="Play Again", command=lambda: initialize_quiz(reset=True), width=18, bg=ACCENT_BLUE, fg=BG_COLOR, activebackground=ACCENT_GOLD, activeforeground=BG_COLOR, relief="flat", bd=0, padx=12, pady=10)
style_button(restart_button, ACCENT_BLUE, BUTTON_TEXT)
add_hover_effect(restart_button, ACCENT_BLUE, "#67d7ff", BUTTON_TEXT)
restart_button.grid(row=0, column=0, padx=8, pady=8, sticky="ew")

review_button = tk.Button(end_actions, text="Review Misses", command=show_review_window, width=18, bg=ACCENT_ORANGE, fg=BG_COLOR, activebackground=ACCENT_GOLD, activeforeground=BG_COLOR, relief="flat", bd=0, padx=12, pady=10)
style_button(review_button, ACCENT_ORANGE, BUTTON_TEXT)
add_hover_effect(review_button, ACCENT_ORANGE, "#ffb86a", BUTTON_TEXT)
review_button.grid(row=0, column=1, padx=8, pady=8, sticky="ew")

stats_button = tk.Button(end_actions, text="Stats Page", command=show_stats_window, width=18, bg=ACCENT_GOLD, fg=BG_COLOR, activebackground=ACCENT_BLUE, activeforeground=BG_COLOR, relief="flat", bd=0, padx=12, pady=10)
style_button(stats_button, ACCENT_GOLD, BUTTON_TEXT, ACCENT_BLUE, BUTTON_TEXT)
add_hover_effect(stats_button, ACCENT_GOLD, "#ffd978", BUTTON_TEXT)
stats_button.grid(row=1, column=0, padx=8, pady=8, sticky="ew")

home_end_button = tk.Button(end_actions, text="Home", command=show_home, width=18, bg=BUTTON_DARK, fg=BUTTON_TEXT, activebackground=ACCENT_GOLD, activeforeground=BUTTON_TEXT, relief="flat", bd=0, padx=12, pady=10)
style_button(home_end_button, BUTTON_DARK, BUTTON_TEXT)
add_hover_effect(home_end_button, BUTTON_DARK, ACCENT_BLUE, BUTTON_TEXT, BUTTON_TEXT)
home_end_button.grid(row=1, column=1, padx=8, pady=8, sticky="ew")

play_missed_button = tk.Button(end_actions, text="Play Missed Only", command=play_missed_only, width=18)
style_button(play_missed_button, ACCENT_GREEN, BUTTON_TEXT)
add_hover_effect(play_missed_button, ACCENT_GREEN, "#6ce39a", BUTTON_TEXT)
play_missed_button.grid(row=2, column=0, columnspan=2, padx=8, pady=8, sticky="ew")

quiz_mode.trace_add("write", update_mode_ui)
app_version_var.trace_add("write", update_mode_ui)
two_player_var.trace_add("write", update_mode_ui)
player_one_name_var.trace_add("write", update_mode_ui)
player_two_name_var.trace_add("write", update_mode_ui)
current_profile_var.trace_add("write", switch_profile)
answer_style_var.trace_add("write", update_high_score_preview)
quiz_length_var.trace_add("write", update_high_score_preview)
category_var.trace_add("write", update_high_score_preview)
conference_search_var.trace_add("write", filter_conference_options)

apply_window_size()
refresh_profile_menu()
filter_conference_options()
update_mode_ui()
update_high_score_preview()
apply_theme(theme_var.get())
flush_gui()
root.mainloop()
