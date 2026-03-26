import streamlit as st
import pandas as pd
import time

# ===== Load Google Sheet data =====
SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSjq6CWM3HE1TDP5yBQsvaTJTh8RPHEjDAjxc7ZoqFK1RQrxs62M5_brUrgRnvv3usM8sd6kyi5jkLW/pub?output=csv"

@st.cache_data
def load_questions():
    df = pd.read_csv(SHEET_URL)
    df = df[df['College / Last School'].notna()]
    df = df[df['College / Last School'].str.lower() != "none"]
    return df

df = load_questions()
questions = df.to_dict('records')
total_questions = len(questions)

# ===== Initialize session state =====
for key, default in {
    "index": 0,
    "score": 0,
    "hint_used": 0,
    "submitted": False,
    "feedback": "",
    "user_input": ""
}.items():
    if key not in st.session_state:
        st.session_state[key] = default

# ===== Quiz UI =====
st.title("🏀 NBA Players Quiz 🏀")
mode = st.radio("Select Mode:", ["Practice", "Learning"])
show_hint = mode == "Learning"

# ===== Functions =====
def submit_answer():
    if st.session_state.submitted:
        return

    current_q = questions[st.session_state.index]
    correct_answer = str(current_q['College / Last School']).strip()
    user_ans = st.session_state.user_input.strip()

    if user_ans.lower() == correct_answer.lower():
        st.session_state.feedback = f"✔ Correct! {correct_answer}"
        st.session_state.score += 1
    else:
        st.session_state.feedback = f"✖ Wrong! Correct: {correct_answer}"

    st.session_state.submitted = True
    st.experimental_rerun()  # triggers rerun and updates the display

def next_question():
    st.session_state.index += 1
    st.session_state.submitted = False
    st.session_state.feedback = ""
    st.session_state.user_input = ""

# ===== Main quiz logic =====
if st.session_state.index < total_questions:
    q = questions[st.session_state.index]
    st.subheader(f"Question {st.session_state.index + 1} of {total_questions}")
    st.text(f"Score: {st.session_state.score}")

    # Answer input
    st.text_input(
        f"🏀 Which college did {q['Player Name']} attend?",
        key="user_input",
        on_change=submit_answer
    )

    # Hint button for Learning mode
    if show_hint and st.button("Hint"):
        st.session_state.hint_used += 1
        words = str(q['College / Last School']).split()
        hint = f"First letters: {' '.join([w[0] for w in words])}"
        st.session_state.feedback = f"💡 Hint: {hint}"

    # Feedback
    if st.session_state.feedback:
        st.write(st.session_state.feedback)
        # Automatically move to next question after 1 second
        time.sleep(1)
        next_question()

    # Progress bar
    progress = (st.session_state.index + 1) / total_questions
    st.progress(min(progress, 1.0))

else:
    # ===== End screen =====
    st.success(f"You got {st.session_state.score} out of {total_questions} correct!")
    st.info(f"Hint used: {st.session_state.hint_used} times")
    if st.button("Restart Quiz"):
        for key in ["index", "score", "hint_used", "submitted", "feedback", "user_input"]:
            st.session_state[key] = 0 if key in ["index", "score", "hint_used"] else ""
        st.experimental_rerun()
