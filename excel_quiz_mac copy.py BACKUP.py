import json
import os
import random
import re
import sys
import time

import pandas as pd
import tkinter as tk
from tkinter import font as tkfont


# ===== Load Excel data =====
if getattr(sys, "frozen", False):
    base_dir = sys._MEIPASS
else:
    base_dir = os.path.dirname(os.path.abspath(__file__))

file_path = os.path.join(base_dir, "ALL_NBA_PLAYERS.xlsx")
high_score_file = os.path.join(base_dir, "quiz_high_scores.json")

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
        learning_mode = quiz_mode.get() == "Learning"
        hard_mode = quiz_mode.get() == "Hard"
        conf_label.config(fg="white" if learning_mode else "#777777")
        conf_dropdown.config(state="normal" if learning_mode else "disabled")
        hard_options_frame.pack(pady=8) if hard_mode else hard_options_frame.pack_forget()


def build_multiple_choice_options(correct_answer):
    colleges = list(dict.fromkeys(str(college).strip() for college in active_df["College / Last School"].dropna().tolist()))
    wrong_choices = [college for college in colleges if normalize_answer(college) != normalize_answer(correct_answer)]
    sampled = random.sample(wrong_choices, min(3, len(wrong_choices)))
    options = sampled + [correct_answer]
    random.shuffle(options)
    return options


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

# Timer variables
timer_running = False
start_time = None
elapsed_time = 0

high_scores = load_high_scores()


# ===== GUI setup =====
root = tk.Tk()
root.title("🏀 NBA Players Quiz 🏀")
root.geometry("1050x760")
root.configure(bg="#111111")
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

# Fonts
title_font = tkfont.Font(family="Helvetica", size=28, weight="bold")
subtitle_font = tkfont.Font(family="Helvetica", size=16)
label_font = tkfont.Font(family="Helvetica", size=14, weight="bold")
question_font = tkfont.Font(family="Helvetica", size=16, weight="bold")
feedback_font = tkfont.Font(family="Helvetica", size=12, weight="bold")
timer_font = tkfont.Font(family="Helvetica", size=12, weight="bold")

all_conferences = sorted(str(conf) for conf in df["Conference"].dropna().unique())


# ===== Functions =====
def reset_quiz_vars():
    global current_index, score, user_answers, results, hint_count, attempt_count
    global question_scored, current_streak, best_streak, mistake_rows
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


def update_mode_ui(*args):
    learning_mode = quiz_mode.get() == "Learning"
    hard_mode = quiz_mode.get() == "Hard"

    conf_label.config(fg="white" if learning_mode else "#777777")
    conf_dropdown.config(state="normal" if learning_mode else "disabled")
    hard_options_frame.pack(pady=8) if hard_mode else hard_options_frame.pack_forget()
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
    main_frame.pack_forget()
    end_frame.pack_forget()
    start_frame.pack(fill="both", expand=True)

    timer_running = False
    elapsed_time = 0
    reset_quiz_vars()

    quiz_mode.set("Practice")
    category_var.set("All")
    quiz_length_var.set("25")
    answer_style_var.set("Typed")
    conference_search_var.set("")
    update_mode_ui()
    filter_conference_options()
    start_frame.update_idletasks()


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

    end_frame.pack_forget()

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

    reset_quiz_vars()
    user_answers[:] = [""] * len(questions)
    results[:] = [None] * len(questions)
    attempt_count[:] = [0] * len(questions)
    question_scored[:] = [False] * len(questions)

    answer_entry.config(state="normal")
    answer_entry.delete(0, tk.END)
    feedback_icon.config(text="")
    feedback_label.config(text="", fg="yellow")
    progress_canvas.delete("all")
    timer_label.config(text="00:00")
    question_timer_label.config(text="")
    streak_label.config(text="Current Streak: 0 | Best Streak: 0")

    submit_button.config(state="normal")
    next_button.config(state="normal")
    back_button.config(state="disabled")
    hint_button.config(state="disabled" if quiz_mode.get() == "Hard" and hard_no_hints_var.get() else "normal")

    main_frame.pack(fill="both", expand=True)

    if quiz_mode.get() == "Timed":
        start_timer()

    update_gui()
    start_question_timer()


def update_progress_bar():
    progress_canvas.delete("all")
    total = len(questions)
    if total == 0:
        return

    width = progress_canvas.winfo_width()
    if width <= 1:
        width = 900
    height = 20

    for i in range(total):
        x0 = (i * width) / total
        x1 = ((i + 1) * width) / total
        color = "#555555"
        if results[i] == "Correct!":
            color = "#00FF00"
        elif results[i] and results[i].startswith("Wrong"):
            color = "#FF3333"
        elif results[i] == "Skipped":
            color = "#AAAAAA"
        progress_canvas.create_rectangle(x0, 0, x1, height, fill=color, width=0)


def flash_feedback(color):
    original_color = question_label.cget("fg")

    def fade(step=0):
        if step > 5:
            question_label.config(fg=original_color)
            return
        question_label.config(fg=color)
        root.after(50, lambda: fade(step + 1))

    fade()


def populate_multiple_choice_buttons():
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


def select_multiple_choice(choice):
    answer_entry.delete(0, tk.END)
    answer_entry.insert(0, choice)
    process_answer(choice)


def update_gui():
    if not (0 <= current_index < len(questions)):
        show_end_screen()
        return

    row = questions[current_index]
    player = row["Player Name"]
    question_label.config(text=f"🏀 Which college did {player} attend? 🏀")
    progress_label.config(text=f"Question {current_index + 1} of {len(questions)} | Score: {score}")
    streak_label.config(text=f"Current Streak: {current_streak} | Best Streak: {best_streak}")
    update_progress_bar()

    hard_back_disabled = quiz_mode.get() == "Hard" and hard_no_back_var.get()
    hard_hints_disabled = quiz_mode.get() == "Hard" and hard_no_hints_var.get()
    back_button.config(state="normal" if current_index > 0 and not hard_back_disabled else "disabled")
    hint_button.config(state="disabled" if hard_hints_disabled else "normal")

    if answer_style_var.get() == "Typed":
        answer_entry.pack(pady=10)
        mc_frame.pack_forget()
    else:
        answer_entry.pack_forget()
        mc_frame.pack(pady=10, fill="x")
        populate_multiple_choice_buttons()

    if not results[current_index]:
        feedback_label.config(text="")
        feedback_icon.config(text="")

    stored_answer = user_answers[current_index]
    answer_entry.delete(0, tk.END)
    if stored_answer:
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
        feedback_label.config(text=text, fg=color)
        feedback_icon.config(text=icon, fg=color)


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
    row = questions[current_index]
    correct_answer = str(row["College / Last School"]).strip()

    if user_answer is None:
        user_answer = answer_entry.get().strip()

    if timed_out:
        user_answer = ""

    user_answers[current_index] = user_answer

    if not user_answer and not timed_out:
        feedback_label.config(text="Please enter an answer or press Next to skip.", fg="orange")
        show_floating_icon("!", "orange")
        return

    cancel_question_timer()
    is_correct = is_correct_answer(user_answer, row)

    if quiz_mode.get() == "Learning":
        attempt_count[current_index] += 1
        if is_correct:
            results[current_index] = "Correct!"
            update_score_for_current_question(True)
            update_streak(True)
            clear_mistake_if_fixed()
            feedback_label.config(text=f"Correct! {correct_answer}", fg="lime")
            show_floating_icon("✔", "lime")
            flash_feedback("lime")
            root.after(700, go_next_safe)
            return

        update_score_for_current_question(False)
        update_streak(False)
        remember_mistake(user_answer, correct_answer)

        if attempt_count[current_index] == 1:
            hint_count += 1
            hint = "Hint: First letters - " + " ".join(word[0] for word in correct_answer.split())
            results[current_index] = f"Wrong! {hint}"
            feedback_label.config(text=results[current_index], fg="orange")
            show_floating_icon("✖", "orange")
            start_question_timer()
            return
        if attempt_count[current_index] == 2:
            hint_count += 1
            words = correct_answer.split()
            hint = "Hint: Word lengths - " + " ".join(str(len(word)) for word in words)
            results[current_index] = f"Wrong again! {hint}"
            feedback_label.config(text=results[current_index], fg="orange")
            show_floating_icon("✖", "orange")
            start_question_timer()
            return

        results[current_index] = f"Wrong! Correct: {correct_answer}"
        feedback_label.config(text=results[current_index], fg="red")
        show_floating_icon("✖", "red")
        root.after(1000, go_next_safe)
        return

    if is_correct:
        results[current_index] = "Correct!"
        update_score_for_current_question(True)
        update_streak(True)
        clear_mistake_if_fixed()
        feedback_label.config(text="Correct!", fg="lime")
        show_floating_icon("✔", "lime")
        flash_feedback("lime")
    else:
        update_score_for_current_question(False)
        update_streak(False)
        remember_mistake(user_answer, correct_answer)
        if timed_out:
            results[current_index] = f"Wrong! Time ran out. Correct: {correct_answer}"
            feedback_label.config(text=results[current_index], fg="red")
        elif quiz_mode.get() == "Hard":
            results[current_index] = "Wrong!"
            feedback_label.config(text="Wrong! Hard mode only gives one shot.", fg="red")
        else:
            results[current_index] = f"Wrong! Correct: {correct_answer}"
            feedback_label.config(text=results[current_index], fg="red")
        show_floating_icon("✖", "red")
        flash_feedback("red")

    root.after(700, go_next_safe)


def submit_answer(event=None):
    if not (0 <= current_index < len(questions)):
        return
    process_answer()


def go_next_safe():
    root.after(100, go_next)


def go_next():
    global current_index
    cancel_question_timer()
    if current_index < len(questions) - 1:
        current_index += 1
        update_gui()
        start_question_timer()
    else:
        show_end_screen()


def next_question():
    if not (0 <= current_index < len(questions)):
        return

    hard_skip_disabled = quiz_mode.get() == "Hard" and hard_no_skip_var.get()
    if hard_skip_disabled and not results[current_index]:
        feedback_label.config(text="Skipping is disabled in Hard mode.", fg="red")
        show_floating_icon("✖", "red")
        return

    if not results[current_index]:
        user_answers[current_index] = answer_entry.get().strip()
        results[current_index] = "Skipped"
        update_streak(False)
        remember_mistake(user_answers[current_index], str(questions[current_index]["College / Last School"]).strip())
        feedback_label.config(text="Question skipped.", fg="orange")
        show_floating_icon("➜", "orange")

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
        feedback_label.config(text="No mistakes to review. Nice work.", fg="lime")
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


def show_end_screen():
    cancel_question_timer()
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

    end_label.config(text="\n".join(end_lines))
    end_frame.pack(fill="both", expand=True)


def show_hint():
    global hint_count
    hard_hints_disabled = quiz_mode.get() == "Hard" and hard_no_hints_var.get()
    if hard_hints_disabled:
        feedback_label.config(text="Hints are disabled in Hard mode.", fg="red")
        show_floating_icon("✖", "red")
        return

    hint_count += 1
    correct_answer = str(questions[current_index]["College / Last School"]).strip()
    words = correct_answer.split()
    if len(words) == 1:
        hint = f"Hint: Starts with '{correct_answer[0]}'"
    else:
        hint = f"Hint: {len(words)} words, first letters: {' '.join(word[0] for word in words)}"
    feedback_label.config(text=hint, fg="orange")
    show_floating_icon("💡", "orange")


# ===== GUI FRAMES =====
start_frame = tk.Frame(root, bg="#111111")
start_frame.pack(fill="both", expand=True)

title_label = tk.Label(start_frame, text="🏀 NBA Players Quiz 🏀", font=title_font, bg="#111111", fg="#00FFFF")
title_label.pack(pady=24)

subtitle_label = tk.Label(
    start_frame,
    text="Test your knowledge and see how much you know!",
    font=subtitle_font,
    bg="#111111",
    fg="white"
)
subtitle_label.pack(pady=8)

mode_label = tk.Label(start_frame, text="Select Mode:", font=label_font, bg="#111111", fg="white")
mode_label.pack(pady=8)

modes = [("Practice", "Practice"), ("Timed", "Timed"), ("Hard", "Hard"), ("Learning", "Learning")]
for text, mode in modes:
    rb = tk.Radiobutton(
        start_frame,
        text=text,
        variable=quiz_mode,
        value=mode,
        font=label_font,
        bg="#111111",
        fg="lime",
        selectcolor="#111111",
        activebackground="#111111"
    )
    rb.pack(pady=3)

style_label = tk.Label(start_frame, text="Answer Style:", font=label_font, bg="#111111", fg="white")
style_label.pack(pady=8)

style_frame = tk.Frame(start_frame, bg="#111111")
style_frame.pack()
for text, value in [("Typed", "Typed"), ("Multiple Choice", "Multiple Choice")]:
    rb = tk.Radiobutton(
        style_frame,
        text=text,
        variable=answer_style_var,
        value=value,
        font=label_font,
        bg="#111111",
        fg="#00CCFF",
        selectcolor="#111111",
        activebackground="#111111"
    )
    rb.pack(side=tk.LEFT, padx=10)

length_label = tk.Label(start_frame, text="Quiz Length:", font=label_font, bg="#111111", fg="white")
length_label.pack(pady=8)

length_dropdown = tk.OptionMenu(start_frame, quiz_length_var, "10", "25", "50", "All")
length_dropdown.config(bg="#00CCFF", fg="black", font=label_font, width=10)
length_dropdown.pack(pady=4)

conf_label = tk.Label(start_frame, text="Select Conference (Learning Mode):", font=label_font, bg="#111111", fg="white")
conf_label.pack(pady=8)

conference_search_entry = tk.Entry(
    start_frame,
    textvariable=conference_search_var,
    font=label_font,
    width=24,
    bg="#111111",
    fg="white",
    insertbackground="white"
)
conference_search_entry.pack(pady=4)
conference_search_entry.insert(0, "")

conf_dropdown = tk.OptionMenu(start_frame, category_var, "All", *all_conferences)
conf_dropdown.config(bg="#00CCFF", fg="black", font=label_font)
conf_dropdown.pack(pady=4)

hard_options_frame = tk.Frame(start_frame, bg="#111111")

hard_options_title = tk.Label(hard_options_frame, text="Hard Mode Options:", font=label_font, bg="#111111", fg="white")
hard_options_title.pack()

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
        bg="#111111",
        fg="#FFA500",
        selectcolor="#111111",
        activebackground="#111111"
    )
    cb.pack(anchor="w")

high_score_label = tk.Label(start_frame, text="", font=feedback_font, bg="#111111", fg="#FFFF66", wraplength=900)
high_score_label.pack(pady=10)

start_button = tk.Button(
    start_frame,
    text="Start Quiz",
    command=start_quiz,
    font=label_font,
    bg="#00CCFF",
    fg="black",
    width=15
)
start_button.pack(pady=16)

exit_button = tk.Button(start_frame, text="Quit", command=root.destroy, font=label_font, bg="#FF3333", fg="black", width=10)
exit_button.pack(pady=8)

# Main Frame
main_frame = tk.Frame(root, bg="#111111")

progress_canvas = tk.Canvas(main_frame, width=900, height=20, bg="#111111", highlightthickness=0)
progress_canvas.pack(pady=10, fill="x")

question_label = tk.Label(main_frame, text="", font=question_font, wraplength=900, justify="center", bg="#111111", fg="#00FFFF")
question_label.pack(pady=15)

progress_label = tk.Label(main_frame, text="", font=label_font, bg="#111111", fg="white")
progress_label.pack(pady=5)

streak_label = tk.Label(main_frame, text="Current Streak: 0 | Best Streak: 0", font=feedback_font, bg="#111111", fg="#FFFF66")
streak_label.pack(pady=4)

timer_label = tk.Label(main_frame, text="00:00", font=timer_font, bg="#111111", fg="white")
timer_label.pack(pady=4)

question_timer_label = tk.Label(main_frame, text="", font=timer_font, bg="#111111", fg="#FFA500")
question_timer_label.pack(pady=4)

answer_entry = tk.Entry(main_frame, font=label_font, width=50, bd=2, relief="groove", bg="#111111", fg="white", insertbackground="white")
answer_entry.pack(pady=10)
answer_entry.focus()
answer_entry.bind("<Key>", start_timer)

mc_frame = tk.Frame(main_frame, bg="#111111")
mc_buttons = []
for _ in range(4):
    button = tk.Button(mc_frame, font=label_font, bg="#1f5f8b", fg="white", wraplength=700)
    mc_buttons.append(button)

feedback_label = tk.Label(main_frame, text="", font=feedback_font, bg="#111111", fg="yellow", wraplength=900, justify="center")
feedback_label.pack(pady=5)

feedback_icon = tk.Label(main_frame, text="", font=feedback_font, bg="#111111")
feedback_icon.pack(pady=5)

button_frame = tk.Frame(main_frame, bg="#111111")
button_frame.pack(pady=15)

back_button = tk.Button(button_frame, text="← Back", command=previous_question, width=12, bg="#FFFF00", fg="black")
back_button.pack(side=tk.LEFT, padx=5)

submit_button = tk.Button(button_frame, text="Submit", command=submit_answer, width=12, bg="#00FF00", fg="black")
submit_button.pack(side=tk.LEFT, padx=5)

next_button = tk.Button(button_frame, text="Next →", command=next_question, width=12, bg="#00CCFF", fg="black")
next_button.pack(side=tk.LEFT, padx=5)

hint_button = tk.Button(button_frame, text="Hint", command=show_hint, width=12, bg="#FFA500", fg="black")
hint_button.pack(side=tk.LEFT, padx=5)

home_button = tk.Button(button_frame, text="Home", command=show_home, width=12, bg="#FF66FF", fg="black")
home_button.pack(side=tk.LEFT, padx=5)

quit_button = tk.Button(button_frame, text="Quit", command=root.destroy, width=12, bg="#FF3333", fg="black")
quit_button.pack(side=tk.LEFT, padx=5)

root.bind("<Return>", submit_answer)

# End Frame
end_frame = tk.Frame(root, bg="#111111")
end_label = tk.Label(end_frame, text="", font=question_font, bg="#111111", fg="lime", justify="center", wraplength=900)
end_label.pack(pady=30)

restart_button = tk.Button(end_frame, text="Restart Quiz", command=lambda: initialize_quiz(reset=True), width=18, bg="#00CCFF", fg="black")
restart_button.pack(pady=8)

review_button = tk.Button(end_frame, text="Review Misses", command=show_review_window, width=18, bg="#FFA500", fg="black")
review_button.pack(pady=8)

home_end_button = tk.Button(end_frame, text="Home", command=show_home, width=18, bg="#FF66FF", fg="black")
home_end_button.pack(pady=8)

quiz_mode.trace_add("write", update_mode_ui)
answer_style_var.trace_add("write", update_high_score_preview)
quiz_length_var.trace_add("write", update_high_score_preview)
category_var.trace_add("write", update_high_score_preview)
conference_search_var.trace_add("write", filter_conference_options)

filter_conference_options()
update_mode_ui()
update_high_score_preview()
root.mainloop()
