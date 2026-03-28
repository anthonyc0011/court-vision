function getApiBase() {
  const configuredBase =
    typeof window !== "undefined" && typeof window.COURT_VISION_API_BASE === "string"
      ? window.COURT_VISION_API_BASE.trim()
      : "";

  if (configuredBase) {
    return configuredBase.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location) {
    const { hostname, origin } = window.location;
    if (hostname === "127.0.0.1" || hostname === "localhost") {
      return "http://127.0.0.1:8000/api";
    }
    return `${origin}/api`;
  }

  return "http://127.0.0.1:8000/api";
}

const API_BASE = getApiBase();
const API_ORIGIN = API_BASE.replace(/\/api$/, "");
const STORAGE_KEY = "courtvision-web-settings";
const PROGRESS_KEY = "courtvision-web-progress";

const state = {
  questions: [],
  currentIndex: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  results: [],
  startedAt: null,
  timerId: null,
  submitted: false,
  daily: false,
  twoPlayer: false,
  mode: "Practice",
  answerMode: "typed",
  hintLimit: 0,
  hintsUsed: 0,
  hintStage: 0,
  missedQuestions: [],
  currentQuestionAttempts: 0,
  currentPlayerIndex: 0,
  playerNames: ["Player 1", "Player 2"],
  playerScores: { "Player 1": 0, "Player 2": 0 },
  online: {
    enabled: false,
    action: "create",
    roomCode: "",
    socket: null,
    waiting: false,
    currentQuestion: null,
    opponentName: "",
    scores: {},
    playerName: "",
  },
  profile: {
    username: "Guest",
    theme: "Arena Blue",
    xp: 0,
    rank: "Rookie",
    achievements: [],
    gamesPlayed: 0,
    bestScore: 0,
    dailyWins: 0,
  },
};

const screens = {
  home: document.getElementById("homeScreen"),
  quiz: document.getElementById("quizScreen"),
  end: document.getElementById("endScreen"),
};

const els = {
  username: document.getElementById("username"),
  theme: document.getElementById("theme"),
  gameMode: document.getElementById("gameMode"),
  questionCount: document.getElementById("questionCount"),
  conferenceFilter: document.getElementById("conferenceFilter"),
  answerMode: document.getElementById("answerMode"),
  showHeadshots: document.getElementById("showHeadshots"),
  twoPlayerMode: document.getElementById("twoPlayerMode"),
  twoPlayerFields: document.getElementById("twoPlayerFields"),
  playerOneName: document.getElementById("playerOneName"),
  playerTwoName: document.getElementById("playerTwoName"),
  onlineMode: document.getElementById("onlineMode"),
  onlineFields: document.getElementById("onlineFields"),
  onlineAction: document.getElementById("onlineAction"),
  onlineCode: document.getElementById("onlineCode"),
  onlineStatus: document.getElementById("onlineStatus"),
  dailyMode: document.getElementById("dailyMode"),
  profileSummary: document.getElementById("profileSummary"),
  dailyOutput: document.getElementById("dailyOutput"),
  leaderboardOutput: document.getElementById("leaderboardOutput"),
  modeChip: document.getElementById("modeChip"),
  scoreChip: document.getElementById("scoreChip"),
  timerLabel: document.getElementById("timerLabel"),
  progressText: document.getElementById("progressText"),
  streakText: document.getElementById("streakText"),
  twoPlayerBanner: document.getElementById("twoPlayerBanner"),
  turnText: document.getElementById("turnText"),
  matchupText: document.getElementById("matchupText"),
  achievementText: document.getElementById("achievementText"),
  rankText: document.getElementById("rankText"),
  progressBar: document.getElementById("progressBar"),
  headshotImage: document.getElementById("headshotImage"),
  headshotFallback: document.getElementById("headshotFallback"),
  logoCard: document.querySelector(".logo-card"),
  logoImage: document.getElementById("logoImage"),
  logoFallback: document.getElementById("logoFallback"),
  questionText: document.getElementById("questionText"),
  feedbackText: document.getElementById("feedbackText"),
  typedAnswer: document.getElementById("typedAnswer"),
  multipleChoiceGrid: document.getElementById("multipleChoiceGrid"),
  showHint: document.getElementById("showHint"),
  toastPopup: document.getElementById("toastPopup"),
  endTitle: document.getElementById("endTitle"),
  endSummary: document.getElementById("endSummary"),
  rewardSummary: document.getElementById("rewardSummary"),
  missedSummary: document.getElementById("missedSummary"),
};

function getDefaultSettings() {
  return {
    username: "Guest",
    theme: "Arena Blue",
    gameMode: "Practice",
    questionCount: "25",
    conferenceFilter: "All",
    answerMode: "typed",
    showHeadshots: true,
    twoPlayerMode: false,
    onlineMode: false,
    onlineAction: "create",
    playerOneName: "Player 1",
    playerTwoName: "Player 2",
    onlineCode: "",
    dailyMode: false,
  };
}

function getRequestedQuestionCount() {
  const selectedValue = els.questionCount.value;
  if (selectedValue === "all") {
    return null;
  }

  const parsed = Number(selectedValue || 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function getHintLimitForSelection() {
  const selectedValue = els.questionCount.value;
  if (selectedValue === "10") return 2;
  if (selectedValue === "25") return 5;
  if (selectedValue === "50") return 10;
  if (selectedValue === "all") return 20;
  return 2;
}

function getDefaultProgress() {
  return {
    xp: 0,
    rank: "Rookie",
    achievements: [],
    gamesPlayed: 0,
    bestScore: 0,
    dailyWins: 0,
  };
}

function getRankFromXp(xp) {
  if (xp >= 1200) return "Legend";
  if (xp >= 700) return "All-American";
  if (xp >= 350) return "All-Conference";
  if (xp >= 150) return "Starter";
  return "Rookie";
}

function loadLocalState() {
  const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || getDefaultSettings();
  const savedProgress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null") || getDefaultProgress();
  state.profile = {
    username: savedSettings.username || "Guest",
    theme: savedSettings.theme || "Arena Blue",
    xp: savedProgress.xp || 0,
    rank: savedProgress.rank || getRankFromXp(savedProgress.xp || 0),
    achievements: savedProgress.achievements || [],
    gamesPlayed: savedProgress.gamesPlayed || 0,
    bestScore: savedProgress.bestScore || 0,
    dailyWins: savedProgress.dailyWins || 0,
  };

  els.username.value = savedSettings.username || "Guest";
  els.theme.value = savedSettings.theme || "Arena Blue";
  els.gameMode.value = savedSettings.gameMode || "Practice";
  els.questionCount.value = savedSettings.questionCount || "25";
  els.answerMode.value = savedSettings.answerMode || "typed";
  els.showHeadshots.checked = savedSettings.showHeadshots !== false;
  els.twoPlayerMode.checked = Boolean(savedSettings.twoPlayerMode);
  els.onlineMode.checked = Boolean(savedSettings.onlineMode);
  els.onlineAction.value = savedSettings.onlineAction || "create";
  els.onlineCode.value = savedSettings.onlineCode || "";
  els.playerOneName.value = savedSettings.playerOneName || "Player 1";
  els.playerTwoName.value = savedSettings.playerTwoName || "Player 2";
  els.dailyMode.checked = Boolean(savedSettings.dailyMode);
  syncModeFields();
}

function saveLocalSettings() {
  const payload = {
    username: els.username.value.trim() || "Guest",
    theme: els.theme.value,
    gameMode: els.gameMode.value,
    questionCount: els.questionCount.value,
    conferenceFilter: els.conferenceFilter.value,
    answerMode: els.answerMode.value,
    showHeadshots: els.showHeadshots.checked,
    twoPlayerMode: els.twoPlayerMode.checked,
    onlineMode: els.onlineMode.checked,
    onlineAction: els.onlineAction.value,
    playerOneName: els.playerOneName.value.trim() || "Player 1",
    playerTwoName: els.playerTwoName.value.trim() || "Player 2",
    onlineCode: els.onlineCode.value.trim().toUpperCase(),
    dailyMode: els.dailyMode.checked,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function saveLocalProgress() {
  localStorage.setItem(
    PROGRESS_KEY,
    JSON.stringify({
      xp: state.profile.xp,
      rank: state.profile.rank,
      achievements: state.profile.achievements,
      gamesPlayed: state.profile.gamesPlayed,
      bestScore: state.profile.bestScore,
      dailyWins: state.profile.dailyWins,
    })
  );
}

function normalizeAnswer(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.,'"()/-]/g, " ")
    .replace(/\bsaint\b/g, "st")
    .replace(/\buniversity\b/g, "")
    .replace(/\bthe\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    let errorMessage = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.detail) {
        errorMessage = payload.detail;
      }
    } catch (_error) {
      // Keep the default message when the response is not JSON.
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

function switchScreen(target) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  target.classList.add("active");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function applyTheme(themeName) {
  document.body.setAttribute("data-theme", themeName);
  state.profile.theme = themeName;
  updateProfileSummary();
}

function updateProfileSummary() {
  els.profileSummary.textContent =
    `Username: ${state.profile.username}\n` +
    `XP: ${state.profile.xp}\n` +
    `Rank: ${state.profile.rank}\n` +
    `Games Played: ${state.profile.gamesPlayed}\n` +
    `Best Score: ${state.profile.bestScore}\n` +
    `Daily Wins: ${state.profile.dailyWins}\n` +
    `Achievements: ${state.profile.achievements.length ? state.profile.achievements.join(", ") : "None yet"}`;
  if (state.online.enabled) {
    els.rankText.textContent = `Room ${state.online.roomCode || "----"} | Online 1v1`;
    els.achievementText.textContent = "Hints disabled in online mode";
  } else if (state.twoPlayer) {
    els.rankText.textContent = "2-Player Local Match";
    els.achievementText.textContent = "Hints disabled in versus mode";
  } else {
    els.rankText.textContent = `XP ${state.profile.xp} | Rank ${state.profile.rank}`;
    els.achievementText.textContent = `Achievements: ${state.profile.achievements.length ? state.profile.achievements.slice(-2).join(" • ") : "none yet"}`;
  }
}

function toggleTwoPlayerFields() {
  els.twoPlayerFields.classList.toggle("hidden", !els.twoPlayerMode.checked);
}

function toggleOnlineFields() {
  els.onlineFields.classList.toggle("hidden", !els.onlineMode.checked);
  const joining = els.onlineAction.value === "join";
  els.onlineCode.disabled = false;
  els.onlineCode.placeholder = joining ? "Enter code to join" : "Set your own match code or leave blank";
  els.onlineStatus.textContent = joining
    ? "Enter a match code from another player to join their game."
    : "Create a room with your own code or leave it blank for a random one.";
}

function syncModeFields() {
  if (els.onlineMode.checked) {
    els.twoPlayerMode.checked = false;
  }
  if (els.twoPlayerMode.checked) {
    els.onlineMode.checked = false;
  }
  toggleTwoPlayerFields();
  toggleOnlineFields();
}

function getActivePlayerName() {
  if (state.online.enabled) {
    return state.online.playerName || state.profile.username;
  }
  return state.playerNames[state.currentPlayerIndex % 2];
}

function advancePlayerTurn() {
  if (state.twoPlayer) {
    state.currentPlayerIndex += 1;
  }
}

function updateTwoPlayerHud() {
  if (state.online.enabled) {
    els.twoPlayerBanner.classList.remove("hidden");
    const myScore = state.online.scores[state.online.playerName] ?? 0;
    const opponentScore = state.online.scores[state.online.opponentName] ?? 0;
    els.turnText.textContent = state.online.waiting
      ? `Room ${state.online.roomCode} • Waiting for opponent`
      : `${state.online.playerName} vs ${state.online.opponentName || "Opponent"}`;
    els.matchupText.textContent = state.online.waiting
      ? "Share the code and wait for both players to connect."
      : `${myScore} - ${opponentScore} • Code ${state.online.roomCode}`;
    return;
  }
  if (!state.twoPlayer) {
    els.twoPlayerBanner.classList.add("hidden");
    return;
  }
  els.twoPlayerBanner.classList.remove("hidden");
  els.turnText.textContent = `${getActivePlayerName()}'s Turn`;
  els.matchupText.textContent = `${state.playerNames[0]} ${state.playerScores[state.playerNames[0]]} - ${state.playerScores[state.playerNames[1]]} ${state.playerNames[1]}`;
}

function showToast(message) {
  if (!els.toastPopup) return;
  window.clearTimeout(state.toastTimerId);
  els.toastPopup.textContent = message;
  els.toastPopup.classList.add("visible");
  state.toastTimerId = window.setTimeout(() => {
    els.toastPopup.classList.remove("visible");
  }, 1800);
}

function unlockAchievements(summary) {
  const earned = [];
  const existing = new Set(state.profile.achievements);
  const rules = [
    ["First Win", summary.correct > 0],
    ["Perfect Game", summary.correct === summary.total && summary.total > 0],
    ["On Fire", summary.bestStreak >= 5],
    ["No Skips", summary.skipped === 0 && summary.total > 0],
    ["Daily Winner", summary.daily && summary.accuracy >= 70],
    ["Hardcore Hero", summary.mode === "Hard" && summary.accuracy >= 80],
  ];
  rules.forEach(([name, ok]) => {
    if (ok && !existing.has(name)) {
      state.profile.achievements.push(name);
      earned.push(name);
    }
  });
  return earned;
}

function grantRewards(summary) {
  let xpGain = summary.correct * 10 + summary.bestStreak * 5;
  if (summary.daily) xpGain += 25;
  if (summary.daily && summary.accuracy >= 70) {
    xpGain += 25;
    state.profile.dailyWins += 1;
  }
  if (summary.correct === summary.total && summary.total > 0) xpGain += 50;
  state.profile.xp += xpGain;
  state.profile.rank = getRankFromXp(state.profile.xp);
  state.profile.gamesPlayed += 1;
  state.profile.bestScore = Math.max(state.profile.bestScore, summary.correct);
  const earned = unlockAchievements(summary);
  saveLocalProgress();
  updateProfileSummary();
  return { xpGain, earned };
}

function renderProgress() {
  els.progressBar.innerHTML = "";
  els.progressBar.style.setProperty("--question-count", state.questions.length || 10);
  state.questions.forEach((_, index) => {
    const segment = document.createElement("div");
    segment.className = "progress-segment";
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    if (state.results[index] === "correct") fill.classList.add("correct");
    if (state.results[index] === "wrong") fill.classList.add("wrong");
    if (state.results[index] === "skipped") fill.classList.add("skipped");
    segment.appendChild(fill);
    els.progressBar.appendChild(segment);
  });
}

function renderMedia(question) {
  if (question.headshot && els.showHeadshots.checked) {
    els.headshotImage.src = `${API_ORIGIN}${question.headshot}`;
    els.headshotImage.classList.remove("hidden");
    els.headshotFallback.classList.add("hidden");
  } else {
    els.headshotImage.classList.add("hidden");
    els.headshotFallback.classList.remove("hidden");
    els.headshotFallback.textContent = els.showHeadshots.checked ? "No Headshot" : "Headshots Off";
  }

  if (question.logo) {
    els.logoCard.classList.remove("hidden");
    els.logoImage.src = `${API_ORIGIN}${question.logo}`;
    els.logoImage.classList.remove("hidden");
    els.logoFallback.classList.add("hidden");
  } else {
    els.logoCard.classList.add("hidden");
    els.logoImage.classList.add("hidden");
    els.logoFallback.classList.add("hidden");
  }
}

function renderChoices(question) {
  els.multipleChoiceGrid.innerHTML = "";
  if (state.answerMode !== "multiple-choice") {
    els.multipleChoiceGrid.classList.add("hidden");
    els.typedAnswer.classList.remove("hidden");
    return;
  }

  els.multipleChoiceGrid.classList.remove("hidden");
  els.typedAnswer.classList.add("hidden");
  question.choices.forEach((choice) => {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.textContent = choice;
    button.addEventListener("click", () => submitAnswer(choice, button));
    els.multipleChoiceGrid.appendChild(button);
  });
}

function getCurrentQuestion() {
  if (state.online.enabled) {
    return state.online.currentQuestion;
  }
  return state.questions[state.currentIndex];
}

function updateHintAvailability() {
  const multipleChoiceLocked = state.answerMode === "multiple-choice";
  const noHintsMode = state.mode === "Hard" || state.twoPlayer || state.online.enabled;
  const outOfHints = state.hintsUsed >= state.hintLimit;
  const disabled = state.submitted || noHintsMode || outOfHints;

  els.showHint.disabled = disabled;
  els.showHint.classList.toggle("hidden", state.twoPlayer || state.online.enabled);
  els.showHint.classList.toggle("hint-locked", multipleChoiceLocked || outOfHints);
  const remaining = Math.max(state.hintLimit - state.hintsUsed, 0);
  els.showHint.textContent = `Hint (${remaining})`;
}

function setFeedback(text, color = "var(--muted)") {
  els.feedbackText.textContent = text;
  els.feedbackText.style.color = color;
}

function renderQuestion() {
  const question = getCurrentQuestion();
  if (!question) {
    if (state.online.enabled && state.online.waiting) {
      els.questionText.textContent = "Waiting for opponent to join your match...";
      els.progressText.textContent = "Online match lobby";
      els.streakText.textContent = "Online versus mode";
      els.scoreChip.textContent = "Score 0";
      els.typedAnswer.value = "";
      els.multipleChoiceGrid.innerHTML = "";
      els.multipleChoiceGrid.classList.add("hidden");
      els.typedAnswer.classList.remove("hidden");
      els.headshotImage.classList.add("hidden");
      els.headshotFallback.classList.remove("hidden");
      els.headshotFallback.textContent = "Waiting";
      els.logoCard.classList.add("hidden");
      setFeedback(`Room Code: ${state.online.roomCode}`, "var(--gold)");
      renderProgress();
      updateTwoPlayerHud();
      updateHintAvailability();
      return;
    }
    finishQuiz();
    return;
  }

  state.submitted = false;
  state.hintStage = 0;
  state.currentQuestionAttempts = 0;
  setFeedback("");
  els.typedAnswer.value = "";
  els.questionText.textContent = `Which college did ${question.player_name} attend?`;
  els.progressText.textContent = `Question ${state.currentIndex + 1} of ${state.questions.length}`;
  els.streakText.textContent = state.online.enabled
    ? "Online versus mode"
    : state.twoPlayer
      ? "Local versus mode"
      : `Current Streak: ${state.streak}`;
  if (state.online.enabled) {
    const myScore = state.online.scores[state.online.playerName] ?? 0;
    els.scoreChip.textContent = `Score ${myScore}`;
  } else {
    els.scoreChip.textContent = state.twoPlayer ? `${state.playerScores[state.playerNames[0]]}-${state.playerScores[state.playerNames[1]]}` : `Score ${state.score}`;
  }
  renderMedia(question);
  renderChoices(question);
  renderProgress();
  updateTwoPlayerHud();
  updateHintAvailability();
}

function updateTimer() {
  if (!state.startedAt) return;
  const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  els.timerLabel.textContent = `${minutes}:${seconds}`;
}

function startTimer() {
  clearInterval(state.timerId);
  state.startedAt = Date.now();
  updateTimer();
  state.timerId = setInterval(updateTimer, 500);
}

function stopTimer() {
  clearInterval(state.timerId);
  state.timerId = null;
}

function markMissed(question) {
  if (!state.missedQuestions.find((item) => item.player_name === question.player_name)) {
    state.missedQuestions.push(question);
  }
}

async function checkAnswer(rawAnswer) {
  const question = getCurrentQuestion();
  return fetchJson("/check-answer", {
    method: "POST",
    body: JSON.stringify({
      answer: rawAnswer,
      accepted_answers: question.accepted_answers,
    }),
  });
}

async function submitAnswer(valueFromChoice = null, clickedButton = null) {
  if (state.submitted) return;
  const question = getCurrentQuestion();
  if (!question) return;

  const rawAnswer = valueFromChoice ?? els.typedAnswer.value.trim();
  if (!rawAnswer) {
    setFeedback("Type an answer or use Skip.");
    return;
  }

  if (state.online.enabled) {
    state.submitted = true;
    updateHintAvailability();
    setFeedback("Answer locked in. Waiting for opponent...", "var(--gold)");
    state.online.socket?.send(JSON.stringify({ type: "submit_answer", answer: rawAnswer }));
    return;
  }

  state.currentQuestionAttempts += 1;
  const result = await checkAnswer(rawAnswer);

  if (state.mode === "Learning" && !result.correct) {
    if (state.currentQuestionAttempts === 1) {
      const firstLetters = question.college.split(" ").map((word) => word[0]).join(" ");
      setFeedback(`Wrong. Hint: first letters ${firstLetters}`, "var(--gold)");
      return;
    }
    if (state.currentQuestionAttempts === 2) {
      const lengths = question.college.split(" ").map((word) => word.length).join(" - ");
      setFeedback(`Wrong again. Hint: word lengths ${lengths}`, "var(--gold)");
      return;
    }
  }

  state.submitted = true;
  updateHintAvailability();

  if (result.correct) {
    state.score += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    if (state.twoPlayer) {
      state.playerScores[getActivePlayerName()] += 1;
    }
    state.results[state.currentIndex] = "correct";
    setFeedback("Correct!", "var(--green)");
    if (clickedButton) clickedButton.classList.add("correct-choice");
  } else {
    state.streak = 0;
    state.results[state.currentIndex] = "wrong";
    setFeedback(`Wrong. Correct answer: ${question.college}`, "var(--red)");
    if (clickedButton) clickedButton.classList.add("wrong-choice");
    markMissed(question);
  }

  els.scoreChip.textContent = state.twoPlayer ? `${state.playerScores[state.playerNames[0]]}-${state.playerScores[state.playerNames[1]]}` : `Score ${state.score}`;
  els.streakText.textContent = state.twoPlayer ? "Local versus mode" : `Current Streak: ${state.streak}`;
  renderProgress();
  advancePlayerTurn();
  updateTwoPlayerHud();
  window.setTimeout(nextQuestion, state.mode === "Learning" && result.correct ? 500 : 700);
}

function skipQuestion() {
  if (state.submitted) return;
  const question = getCurrentQuestion();
  if (state.online.enabled) {
    state.submitted = true;
    setFeedback("Skip locked in. Waiting for opponent...", "var(--muted)");
    updateHintAvailability();
    state.online.socket?.send(JSON.stringify({ type: "skip_question" }));
    return;
  }
  state.streak = 0;
  state.results[state.currentIndex] = "skipped";
  markMissed(question);
  setFeedback(`Skipped. Correct answer: ${question.college}`, "var(--muted)");
  updateHintAvailability();
  renderProgress();
  advancePlayerTurn();
  updateTwoPlayerHud();
  window.setTimeout(nextQuestion, 500);
}

function showHint() {
  if (state.answerMode === "multiple-choice") {
    showToast("No hints during multiple choice mode.");
    return;
  }
  if (state.twoPlayer) {
    showToast("No hints during 2-player mode.");
    return;
  }
  if (state.online.enabled) {
    showToast("No hints during online mode.");
    return;
  }
  if (state.mode === "Hard") {
    showToast("No hints during Hard mode.");
    return;
  }
  if (state.submitted) return;
  if (state.hintsUsed >= state.hintLimit) {
    showToast("You have used all your hints for this quiz.");
    updateHintAvailability();
    return;
  }
  if (state.hintStage >= 3) {
    showToast("No more hints are available for this question.");
    return;
  }
  const question = getCurrentQuestion();
  if (!question) return;
  const answer = question.college;
  const words = answer.split(" ");

  state.hintsUsed += 1;

  if (state.hintStage === 0) {
    setFeedback(`Hint: first letters ${words.map((word) => word[0]).join(" ")}`, "var(--gold)");
    state.hintStage = 1;
    updateHintAvailability();
    return;
  }
  if (state.hintStage === 1) {
    setFeedback(`Hint: word lengths ${words.map((word) => word.length).join(" - ")}`, "var(--gold)");
    state.hintStage = 2;
    updateHintAvailability();
    return;
  }
  setFeedback(`Final hint: conference ${question.conference}`, "var(--gold)");
  state.hintStage = 3;
  updateHintAvailability();
}

function nextQuestion() {
  state.currentIndex += 1;
  renderQuestion();
}

function buildSummary() {
  const total = state.questions.length;
  const correct = state.results.filter((item) => item === "correct").length;
  const wrong = state.results.filter((item) => item === "wrong").length;
  const skipped = state.results.filter((item) => item === "skipped").length;
  const accuracy = total ? Number(((correct / total) * 100).toFixed(1)) : 0;
  return {
    total,
    correct,
    wrong,
    skipped,
    accuracy,
    bestStreak: state.bestStreak,
    daily: state.daily,
    mode: state.mode,
  };
}

function finishQuiz() {
  stopTimer();
  switchScreen(screens.end);
  const summary = buildSummary();
  let reward = { xpGain: 0, earned: [] };
  if (!state.twoPlayer && !state.online.enabled) {
    reward = grantRewards(summary);
  }
  if (state.online.enabled) {
    const players = Object.keys(state.online.scores);
    const myScore = state.online.scores[state.online.playerName] ?? 0;
    const opponentScore = state.online.scores[state.online.opponentName] ?? 0;
    const winner =
      myScore === opponentScore
        ? `Tie game: ${myScore}-${opponentScore}`
        : `Winner: ${myScore > opponentScore ? state.online.playerName : state.online.opponentName} (${Math.max(myScore, opponentScore)}-${Math.min(myScore, opponentScore)})`;
    els.endSummary.textContent = `${winner} | Total questions ${summary.total}`;
    els.rewardSummary.textContent = `${state.online.playerName}: ${myScore}\n${state.online.opponentName || "Opponent"}: ${opponentScore}\nOnline matches do not change XP or achievements yet.`;
  } else if (state.twoPlayer) {
    const [p1, p2] = state.playerNames;
    const s1 = state.playerScores[p1];
    const s2 = state.playerScores[p2];
    const winner = s1 === s2 ? `Tie game: ${s1}-${s2}` : `Winner: ${s1 > s2 ? p1 : p2} (${Math.max(s1, s2)}-${Math.min(s1, s2)})`;
    els.endSummary.textContent = `${winner} | Total questions ${summary.total}`;
    els.rewardSummary.textContent = `${p1}: ${s1}\n${p2}: ${s2}\n2-player local mode does not change XP or achievements.`;
  } else {
    els.endSummary.textContent = `${summary.correct}/${summary.total} correct | Accuracy ${summary.accuracy}% | Wrong ${summary.wrong} | Skipped ${summary.skipped}`;
    els.rewardSummary.textContent =
      `XP Gained: ${reward.xpGain}\n` +
      `Current Rank: ${state.profile.rank}\n` +
      `New Achievements: ${reward.earned.length ? reward.earned.join(", ") : "None this run"}`;
  }
  const missed = state.missedQuestions.map((question) => `${question.player_name} — ${question.college}`).join("\n");
  els.missedSummary.textContent = missed || "Perfect run. No missed questions.";
  document.getElementById("submitLeaderboard").classList.toggle("hidden", state.twoPlayer || state.online.enabled);
}

async function fetchQuizData(customQuestions = null) {
  if (customQuestions) {
    state.questions = customQuestions;
    state.results = Array(state.questions.length).fill(null);
    renderProgress();
    renderQuestion();
    startTimer();
    return;
  }

  const data = await fetchJson("/quiz", {
    method: "POST",
    body: JSON.stringify({
      count: getRequestedQuestionCount(),
      daily: els.dailyMode.checked,
      mode: els.gameMode.value,
      conference: els.conferenceFilter.value,
    }),
  });
  state.questions = data.questions;
  state.results = Array(state.questions.length).fill(null);
  renderProgress();
  renderQuestion();
  startTimer();
  const username = els.username.value.trim() || "Guest";
  els.dailyOutput.textContent = state.daily && data.date
    ? `Date: ${data.date}\nLoaded ${state.questions.length} daily questions for ${username}.`
    : `Loaded ${state.questions.length} questions for ${username}.`;
}

async function startQuiz(customQuestions = null) {
  const username = els.username.value.trim() || "Guest";
  state.profile.username = username;
  applyTheme(els.theme.value);
  saveLocalSettings();
  if (els.onlineMode.checked) {
    await startOnlineMatch();
    return;
  }
  state.daily = els.dailyMode.checked;
  state.online.enabled = false;
  state.twoPlayer = els.twoPlayerMode.checked;
  state.mode = els.gameMode.value;
  state.answerMode = els.answerMode.value;
  state.playerNames = [
    els.playerOneName.value.trim() || "Player 1",
    els.playerTwoName.value.trim() || "Player 2",
  ];
  state.playerScores = { [state.playerNames[0]]: 0, [state.playerNames[1]]: 0 };
  state.currentPlayerIndex = 0;
  state.currentIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.results = [];
  state.missedQuestions = [];
  state.submitted = false;
  state.hintLimit = getHintLimitForSelection();
  state.hintsUsed = 0;
  state.hintStage = 0;
  els.modeChip.textContent = state.twoPlayer ? "2-Player Local" : (state.daily ? `${state.mode} • Daily` : state.mode);
  els.endTitle.textContent = state.daily ? "Daily Challenge Recap" : "Final Scoreboard";
  updateProfileSummary();
  switchScreen(screens.quiz);
  await fetchQuizData(customQuestions);
}

function getWebSocketBase() {
  const url = new URL(API_ORIGIN);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "";
  return url.toString().replace(/\/$/, "");
}

function resetOnlineState() {
  if (state.online.socket && state.online.socket.readyState < 2) {
    state.online.socket.close();
  }
  state.online = {
    enabled: false,
    action: "create",
    roomCode: "",
    socket: null,
    waiting: false,
    currentQuestion: null,
    opponentName: "",
    scores: {},
    playerName: "",
  };
  updateProfileSummary();
}

function prepareOnlineQuizState(totalQuestions, payload) {
  state.online.enabled = true;
  state.twoPlayer = false;
  state.daily = false;
  state.mode = "Online 1v1";
  state.answerMode = payload.answer_mode || els.answerMode.value;
  state.currentIndex = payload.current_index ?? 0;
  state.questions = Array(totalQuestions).fill(null);
  state.results = Array(totalQuestions).fill(null);
  state.missedQuestions = [];
  state.submitted = false;
  state.hintLimit = 0;
  state.hintsUsed = 0;
  state.hintStage = 0;
  state.online.currentQuestion = payload.question || null;
  state.online.scores = payload.scores || {};
  state.online.waiting = false;
  state.online.opponentName = (payload.players || []).find((name) => name !== state.online.playerName) || state.online.opponentName;
  els.modeChip.textContent = "Online 1v1";
  els.endTitle.textContent = "Online Match Recap";
}

function renderOnlineWaiting() {
  state.online.waiting = true;
  state.questions = Array(getRequestedQuestionCount() ?? 10).fill(null);
  state.results = Array(state.questions.length).fill(null);
  els.modeChip.textContent = "Online 1v1";
  els.endTitle.textContent = "Online Match Recap";
  updateTwoPlayerHud();
  renderQuestion();
}

function handleOnlineRoundComplete(payload) {
  const myResult = payload.round_results?.[state.online.playerName];
  if (myResult?.correct) {
    state.results[state.currentIndex] = "correct";
    setFeedback("Correct!", "var(--green)");
  } else if (myResult?.skipped) {
    state.results[state.currentIndex] = "skipped";
    setFeedback(`Skipped. Correct answer: ${payload.correct_answer}`, "var(--muted)");
    if (getCurrentQuestion()) {
      markMissed(getCurrentQuestion());
    }
  } else {
    state.results[state.currentIndex] = "wrong";
    setFeedback(`Wrong. Correct answer: ${payload.correct_answer}`, "var(--red)");
    if (getCurrentQuestion()) {
      markMissed(getCurrentQuestion());
    }
  }

  state.online.scores = payload.scores || state.online.scores;
  renderProgress();
  updateTwoPlayerHud();

  window.setTimeout(() => {
    if (payload.finished) {
      state.online.currentQuestion = null;
      state.currentIndex = state.questions.length;
      finishQuiz();
      return;
    }
    prepareOnlineQuizState(payload.total_questions, payload);
    renderQuestion();
  }, 1000);
}

function attachOnlineSocket(roomCode, username) {
  const socketUrl = `${getWebSocketBase()}/ws/matches/${roomCode}?username=${encodeURIComponent(username)}`;
  const socket = new WebSocket(socketUrl);
  state.online.socket = socket;

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "room_joined") {
      state.online.roomCode = payload.room_code;
      state.online.playerName = payload.player_name;
      state.online.opponentName = payload.opponent_name || "";
      state.online.scores = payload.scores || {};
      renderOnlineWaiting();
      if (payload.waiting) {
        els.onlineStatus.textContent = `Match code ${payload.room_code} created. Share it with a friend.`;
      }
      return;
    }

    if (payload.type === "match_started") {
      prepareOnlineQuizState(payload.total_questions, payload);
      switchScreen(screens.quiz);
      startTimer();
      renderQuestion();
      return;
    }

    if (payload.type === "waiting_for_opponent") {
      setFeedback("Answer locked in. Waiting for opponent...", "var(--gold)");
      return;
    }

    if (payload.type === "round_complete") {
      handleOnlineRoundComplete(payload);
      return;
    }

    if (payload.type === "opponent_left") {
      showToast(payload.message || "Opponent left the match.");
      state.online.currentQuestion = null;
      finishQuiz();
    }
  });

  socket.addEventListener("close", () => {
    if (state.online.enabled && screens.quiz.classList.contains("active") && !screens.end.classList.contains("active")) {
      showToast("Online match connection closed.");
    }
  });
}

async function startOnlineMatch() {
  const username = els.username.value.trim() || "Guest";
  const action = els.onlineAction.value;
  const roomCode = els.onlineCode.value.trim().toUpperCase();
  saveLocalSettings();
  resetOnlineState();
  state.online.enabled = true;
  state.online.action = action;
  state.online.playerName = username;
  state.twoPlayer = false;
  state.daily = false;
  state.mode = "Online 1v1";
  state.answerMode = els.answerMode.value;

  let roomPayload;
  try {
    if (action === "create") {
      roomPayload = await fetchJson("/online-match/create", {
        method: "POST",
        body: JSON.stringify({
          username,
          room_code: roomCode || null,
          count: getRequestedQuestionCount(),
          conference: els.conferenceFilter.value,
          answer_mode: els.answerMode.value,
          show_headshots: els.showHeadshots.checked,
        }),
      });
    } else {
      if (!roomCode) {
        showToast("Enter a match code to join.");
        resetOnlineState();
        return;
      }
      roomPayload = await fetchJson("/online-match/join", {
        method: "POST",
        body: JSON.stringify({
          room_code: roomCode,
          username,
        }),
      });
    }
  } catch (error) {
    resetOnlineState();
    switchScreen(screens.home);
    showToast(error?.message || (action === "join" ? "Could not join that match code." : "Could not create an online match."));
    return;
  }

  state.online.roomCode = roomPayload.room_code;
  state.online.playerName = roomPayload.player_name || username;
  switchScreen(screens.quiz);
  renderOnlineWaiting();
  startTimer();
  attachOnlineSocket(roomPayload.room_code, state.online.playerName);
}

async function saveProfile() {
  const username = els.username.value.trim() || "Guest";
  state.profile.username = username;
  saveLocalSettings();
  saveLocalProgress();
  await fetchJson("/profiles", {
    method: "POST",
    body: JSON.stringify({
      username,
      theme: els.theme.value,
      settings: {
        mode: els.gameMode.value,
        questionCount: els.questionCount.value,
        conferenceFilter: els.conferenceFilter.value,
        answerMode: els.answerMode.value,
        showHeadshots: els.showHeadshots.checked,
        twoPlayerMode: els.twoPlayerMode.checked,
        playerOneName: els.playerOneName.value.trim() || "Player 1",
        playerTwoName: els.playerTwoName.value.trim() || "Player 2",
        dailyMode: els.dailyMode.checked,
      },
    }),
  });
  updateProfileSummary();
  alert(`Saved profile for ${username}`);
}

async function loadLeaderboard() {
  const data = await fetchJson("/leaderboard?limit=5");
  const lines = data.entries.map((entry, index) =>
    `${index + 1}. ${entry.username} | Score ${entry.score} | Accuracy ${entry.accuracy}% | ${entry.mode} | ${entry.run_date}${entry.daily ? " | Daily" : ""}`
  );
  els.leaderboardOutput.textContent = lines.length ? lines.join("\n") : "No leaderboard entries yet.";
}

async function submitLeaderboard() {
  const summary = buildSummary();
  await fetchJson("/leaderboard", {
    method: "POST",
    body: JSON.stringify({
      username: els.username.value.trim() || "Guest",
      score: summary.correct,
      accuracy: summary.accuracy,
      mode: `${state.mode} | ${state.answerMode}`,
      daily: state.daily,
    }),
  });
  await loadLeaderboard();
  alert("Leaderboard entry submitted.");
}

function playMissedOnly() {
  if (!state.missedQuestions.length) return;
  startQuiz(state.missedQuestions);
}

function returnHome() {
  stopTimer();
  resetOnlineState();
  saveLocalSettings();
  updateProfileSummary();
  switchScreen(screens.home);
}

async function populateMeta() {
  const data = await fetchJson("/meta");
  els.conferenceFilter.innerHTML = "";
  data.conferences.forEach((conference) => {
    const option = document.createElement("option");
    option.value = conference;
    option.textContent = conference;
    els.conferenceFilter.appendChild(option);
  });
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (saved?.conferenceFilter) {
    els.conferenceFilter.value = saved.conferenceFilter;
  }
}

document.getElementById("startQuiz").addEventListener("click", () => startQuiz());
document.getElementById("saveProfile").addEventListener("click", saveProfile);
document.getElementById("loadLeaderboard").addEventListener("click", loadLeaderboard);
document.getElementById("submitAnswer").addEventListener("click", () => submitAnswer());
document.getElementById("showHint").addEventListener("click", showHint);
document.getElementById("skipQuestion").addEventListener("click", skipQuestion);
document.getElementById("quitToHome").addEventListener("click", returnHome);
document.getElementById("playAgain").addEventListener("click", () => startQuiz());
document.getElementById("playMissedOnly").addEventListener("click", playMissedOnly);
document.getElementById("submitLeaderboard").addEventListener("click", submitLeaderboard);
document.getElementById("returnHome").addEventListener("click", returnHome);
els.theme.addEventListener("change", (event) => {
  applyTheme(event.target.value);
  saveLocalSettings();
});
els.typedAnswer.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitAnswer();
});
[els.gameMode, els.questionCount, els.answerMode, els.dailyMode, els.showHeadshots].forEach((element) => {
  element.addEventListener("change", saveLocalSettings);
});
els.twoPlayerMode.addEventListener("change", () => {
  syncModeFields();
  saveLocalSettings();
});
els.onlineMode.addEventListener("change", () => {
  syncModeFields();
  saveLocalSettings();
});
els.onlineAction.addEventListener("change", () => {
  toggleOnlineFields();
  saveLocalSettings();
});
els.playerOneName.addEventListener("change", saveLocalSettings);
els.playerTwoName.addEventListener("change", saveLocalSettings);
els.onlineCode.addEventListener("input", (event) => {
  event.target.value = event.target.value.toUpperCase();
  saveLocalSettings();
});
els.username.addEventListener("change", saveLocalSettings);
els.conferenceFilter.addEventListener("change", saveLocalSettings);

loadLocalState();
applyTheme(els.theme.value);
updateProfileSummary();
syncModeFields();
populateMeta().catch(() => {});
loadLeaderboard().catch(() => {
  els.leaderboardOutput.textContent = "Start the backend to load the leaderboard.";
});
