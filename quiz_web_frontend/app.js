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
const VISITOR_KEY = "courtvision-web-visitor-id";
const ANALYTICS_KEY_STORAGE = "courtvision-web-analytics-key";
const BASE_RANKS = [
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "Captain",
  "Conference Star",
  "Tournament Hero",
  "All-American",
  "Blue Blood",
];
const RANK_SUBTIERS = ["III", "II", "I"];
const BASE_RANK_THRESHOLDS = [0, 5000, 11000, 19000, 29000, 41000, 55500, 72500, 92500, 116000];

const state = {
  questions: [],
  currentIndex: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  results: [],
  startedAt: null,
  timerId: null,
  questionTimerId: null,
  questionTimeLeft: 0,
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
    rematchRequested: false,
    showHeadshots: true,
  },
  profile: {
    username: "Guest",
    theme: "Arena Blue",
    xp: 0,
    rank: "Freshman III",
    achievements: [],
    gamesPlayed: 0,
    bestScore: 0,
    onlineWins: 0,
    rankHistory: [],
    highestRankIndex: 0,
    seasonTag: "",
  },
  admin: {
    titleTapCount: 0,
    lastTitleTapAt: 0,
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
  loginButton: document.getElementById("loginButton"),
  shareButton: document.getElementById("shareButton"),
  siteTitle: document.getElementById("siteTitle"),
  modeChip: document.getElementById("modeChip"),
  scoreChip: document.getElementById("scoreChip"),
  timerLabel: document.getElementById("timerLabel"),
  turnTimerText: document.getElementById("turnTimerText"),
  progressText: document.getElementById("progressText"),
  streakText: document.getElementById("streakText"),
  twoPlayerBanner: document.getElementById("twoPlayerBanner"),
  standardMatchLayout: document.getElementById("standardMatchLayout"),
  onlineMatchLayout: document.getElementById("onlineMatchLayout"),
  turnText: document.getElementById("turnText"),
  matchupText: document.getElementById("matchupText"),
  onlineYouName: document.getElementById("onlineYouName"),
  onlineYouScore: document.getElementById("onlineYouScore"),
  onlineOpponentName: document.getElementById("onlineOpponentName"),
  onlineOpponentScore: document.getElementById("onlineOpponentScore"),
  onlineMatchState: document.getElementById("onlineMatchState"),
  onlineMatchCode: document.getElementById("onlineMatchCode"),
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
  roundOverlay: document.getElementById("roundOverlay"),
  endTitle: document.getElementById("endTitle"),
  endSummary: document.getElementById("endSummary"),
  rewardSummary: document.getElementById("rewardSummary"),
  missedSummary: document.getElementById("missedSummary"),
  requestRematch: document.getElementById("requestRematch"),
  rematchStatus: document.getElementById("rematchStatus"),
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
    rank: "Freshman III",
    achievements: [],
    gamesPlayed: 0,
    bestScore: 0,
    onlineWins: 0,
    rankHistory: [],
    highestRankIndex: 0,
    seasonTag: "",
  };
}

function getVisitorId() {
  let visitorId = localStorage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = `cv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(VISITOR_KEY, visitorId);
  }
  return visitorId;
}

function getAnalyticsAdminKey() {
  return sessionStorage.getItem(ANALYTICS_KEY_STORAGE) || "";
}

function setAnalyticsAdminKey(value) {
  if (value) {
    sessionStorage.setItem(ANALYTICS_KEY_STORAGE, value);
  } else {
    sessionStorage.removeItem(ANALYTICS_KEY_STORAGE);
  }
}

function ensureAnalyticsCard() {
  let card = document.getElementById("analyticsOutput");
  if (card) return card;

  card = document.createElement("div");
  card.id = "analyticsOutput";
  card.className = "dashboard-card analytics-card";
  els.leaderboardOutput.insertAdjacentElement("beforebegin", card);
  return card;
}

function removeAnalyticsCard() {
  const card = document.getElementById("analyticsOutput");
  if (card) {
    card.remove();
  }
}

function getCurrentSeasonTag() {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month <= 2) return `Winter ${year}`;
  if (month <= 5) return `Spring ${year}`;
  if (month <= 8) return `Summer ${year}`;
  return `Fall ${year}`;
}

function getRankInfoFromXp(xp) {
  let baseIndex = 0;
  for (let i = 0; i < BASE_RANKS.length; i += 1) {
    if (xp >= BASE_RANK_THRESHOLDS[i]) {
      baseIndex = i;
    } else {
      break;
    }
  }

  const start = BASE_RANK_THRESHOLDS[baseIndex];
  const nextBoundary = BASE_RANK_THRESHOLDS[baseIndex + 1] ?? Number.POSITIVE_INFINITY;
  const span = Number.isFinite(nextBoundary) ? Math.max(nextBoundary - start, 3) : 3;
  const stepSize = Math.max(Math.floor(span / 3), 1);
  const progressInTier = Math.max(xp - start, 0);

  let subtierIndex = 0;
  if (progressInTier >= stepSize * 2) {
    subtierIndex = 2;
  } else if (progressInTier >= stepSize) {
    subtierIndex = 1;
  }

  if (!Number.isFinite(nextBoundary) && xp >= start) {
    subtierIndex = 2;
  }

  const rankIndex = baseIndex * 3 + subtierIndex;
  const label = `${BASE_RANKS[baseIndex]} ${RANK_SUBTIERS[subtierIndex]}`;
  const nextRankIndex = Math.min(rankIndex + 1, BASE_RANKS.length * 3 - 1);
  const nextThreshold =
    nextRankIndex === rankIndex
      ? null
      : start + stepSize * (subtierIndex + 1) >= nextBoundary
        ? nextBoundary
        : start + stepSize * (subtierIndex + 1);

  return {
    label,
    base: BASE_RANKS[baseIndex],
    subtier: RANK_SUBTIERS[subtierIndex],
    rankIndex,
    nextThreshold,
  };
}

function getRankFromXp(xp) {
  return getRankInfoFromXp(xp).label;
}

function getRankIndexFromLabel(rankLabel) {
  const normalized = String(rankLabel || "").trim();
  if (!normalized) return null;

  for (let baseIndex = 0; baseIndex < BASE_RANKS.length; baseIndex += 1) {
    for (let subtierIndex = 0; subtierIndex < RANK_SUBTIERS.length; subtierIndex += 1) {
      if (`${BASE_RANKS[baseIndex]} ${RANK_SUBTIERS[subtierIndex]}` === normalized) {
        return baseIndex * 3 + subtierIndex;
      }
    }
  }

  return null;
}

function loadLocalState() {
  const savedSettings = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || getDefaultSettings();
  const savedProgress = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null") || getDefaultProgress();
  const currentSeason = getCurrentSeasonTag();
  const progress = { ...getDefaultProgress(), ...savedProgress };

  if (progress.seasonTag && progress.seasonTag !== currentSeason) {
    progress.xp = 0;
    progress.rank = getRankFromXp(0);
    progress.highestRankIndex = 0;
    progress.seasonTag = currentSeason;
  }

  state.profile = {
    username: savedSettings.username || "Guest",
    theme: savedSettings.theme || "Arena Blue",
    xp: progress.xp || 0,
    rank: getRankFromXp(progress.xp || 0),
    achievements: progress.achievements || [],
    gamesPlayed: progress.gamesPlayed || 0,
    bestScore: progress.bestScore || 0,
    onlineWins: progress.onlineWins || 0,
    rankHistory: progress.rankHistory || [],
    highestRankIndex: progress.highestRankIndex ?? getRankInfoFromXp(progress.xp || 0).rankIndex,
    seasonTag: progress.seasonTag || currentSeason,
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
  els.dailyMode.checked = false;
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
      onlineWins: state.profile.onlineWins,
      rankHistory: state.profile.rankHistory,
      highestRankIndex: state.profile.highestRankIndex,
      seasonTag: state.profile.seasonTag || getCurrentSeasonTag(),
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
  const requestHeaders = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const response = await fetch(`${API_BASE}${path}`, {
    headers: requestHeaders,
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateShort(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRankHistory() {
  if (!state.profile.rankHistory.length) {
    return '<div class="achievement-empty">No rank promotions yet. Win games and stack bonuses to climb the ladder.</div>';
  }

  return state.profile.rankHistory
    .slice(-5)
    .reverse()
    .map(
      (entry) => `
        <div class="history-row">
          <strong>${escapeHtml(entry.rank)}</strong>
          <span class="leaderboard-meta">${escapeHtml(entry.date)} • ${escapeHtml(entry.season)}</span>
        </div>
      `
    )
    .join("");
}

function renderSeasonStatus() {
  const rankInfo = getRankInfoFromXp(state.profile.xp);
  const nextTarget = rankInfo.nextThreshold;
  const xpToNext = nextTarget == null ? 0 : Math.max(nextTarget - state.profile.xp, 0);

  els.dailyOutput.innerHTML = `
    <div class="daily-header">
      <div>
        <p class="eyebrow">Ranked Progress</p>
        <div class="daily-status">Your current ladder standing is tracked here.</div>
      </div>
      <div class="profile-rank-badge">${escapeHtml(rankInfo.label)}</div>
    </div>
    <div class="daily-note">
      ${nextTarget == null
        ? "You are at the top prestige tier. Keep winning to defend your spot on the ranked board."
        : `${xpToNext} XP until the next prestige step. Clean runs, no-hint games, and online wins are your biggest boosts.`}
    </div>
  `;
}

function renderAnalyticsSummary(summary) {
  if (!summary) {
    removeAnalyticsCard();
    return;
  }

  const analyticsOutput = ensureAnalyticsCard();
  analyticsOutput.innerHTML = `
    <div class="leaderboard-header">
      <div>
        <p class="eyebrow">Visitor Analytics</p>
        <div class="daily-status">Live traffic for your site, tracked by your own backend.</div>
      </div>
      <div class="leaderboard-meta">Updated ${formatDateShort(new Date(summary.generated_at * 1000))}</div>
    </div>
    <div class="analytics-grid">
      <div class="analytics-stat">
        <span class="dashboard-label">Live Now</span>
        <strong>${summary.live_visitors}</strong>
      </div>
      <div class="analytics-stat">
        <span class="dashboard-label">Unique Visitors (24h)</span>
        <strong>${summary.unique_visitors_24h}</strong>
      </div>
      <div class="analytics-stat">
        <span class="dashboard-label">Pageviews (24h)</span>
        <strong>${summary.pageviews_24h}</strong>
      </div>
      <div class="analytics-stat">
        <span class="dashboard-label">Quiz Starts (24h)</span>
        <strong>${summary.quiz_starts_24h}</strong>
      </div>
      <div class="analytics-stat">
        <span class="dashboard-label">Pageviews (7d)</span>
        <strong>${summary.pageviews_7d}</strong>
      </div>
      <div class="analytics-stat">
        <span class="dashboard-label">Total Pageviews</span>
        <strong>${summary.total_pageviews}</strong>
      </div>
    </div>
    <div class="hero-actions">
      <button id="refreshAnalytics">Refresh Analytics</button>
      <button id="clearAnalyticsKey" class="secondary-button">Hide Analytics</button>
    </div>
  `;
}

function getProfileProgress(profile) {
  const nestedProgress = profile.progress && typeof profile.progress === "object" ? profile.progress : {};
  const derivedXp = nestedProgress.xp ?? profile.xp ?? 0;
  const derivedRank = getRankFromXp(derivedXp);
  const derivedRankIndex =
    nestedProgress.highestRankIndex ?? profile.highestRankIndex ?? getRankInfoFromXp(derivedXp).rankIndex;

  return {
    ...getDefaultProgress(),
    ...nestedProgress,
    xp: derivedXp,
    rank: derivedRank,
    achievements: nestedProgress.achievements ?? profile.achievements ?? [],
    gamesPlayed: nestedProgress.gamesPlayed ?? profile.gamesPlayed ?? 0,
    bestScore: nestedProgress.bestScore ?? profile.bestScore ?? 0,
    onlineWins: nestedProgress.onlineWins ?? profile.onlineWins ?? 0,
    rankHistory: nestedProgress.rankHistory ?? profile.rankHistory ?? [],
    highestRankIndex: derivedRankIndex,
    seasonTag: nestedProgress.seasonTag ?? profile.seasonTag ?? getCurrentSeasonTag(),
  };
}

function updateProfileSummary() {
  const rankInfo = getRankInfoFromXp(state.profile.xp);
  const achievements = state.profile.achievements.length
    ? state.profile.achievements
        .map((achievement) => `<span class="achievement-pill">${escapeHtml(achievement)}</span>`)
        .join("")
    : '<span class="achievement-empty">No achievements unlocked yet.</span>';

  els.profileSummary.innerHTML = `
    <div class="profile-hero">
      <div>
        <p class="eyebrow">Saved Profile</p>
        <h3 class="profile-name">${escapeHtml(state.profile.username)}</h3>
        <div class="profile-subtitle">Season ladder progress, prestige tiers, and recent rank promotions all live here.</div>
      </div>
      <div class="profile-rank-badge">${escapeHtml(rankInfo.label)}</div>
    </div>
    <div class="profile-stat-grid">
      <div class="profile-stat">
        <span class="dashboard-label">Season XP</span>
        <strong>${state.profile.xp}</strong>
      </div>
      <div class="profile-stat">
        <span class="dashboard-label">Games Played</span>
        <strong>${state.profile.gamesPlayed}</strong>
      </div>
      <div class="profile-stat">
        <span class="dashboard-label">Best Score</span>
        <strong>${state.profile.bestScore}</strong>
      </div>
      <div class="profile-stat">
        <span class="dashboard-label">Online Wins</span>
        <strong>${state.profile.onlineWins}</strong>
      </div>
    </div>
    <div class="achievement-section">
      <span class="dashboard-label">Current Season</span>
      <div class="achievement-pill">${escapeHtml(state.profile.seasonTag || getCurrentSeasonTag())}</div>
    </div>
    <div class="achievement-section">
      <span class="dashboard-label">Achievements</span>
      <div class="achievement-list">${achievements}</div>
    </div>
    <div class="history-section">
      <span class="dashboard-label">Recent Rank History</span>
      <div class="history-list">${formatRankHistory()}</div>
    </div>
  `;
  if (state.online.enabled) {
    els.rankText.textContent = `Room ${state.online.roomCode || "----"} | Online 1v1`;
    els.achievementText.textContent = state.online.waiting ? "Waiting room" : "Hints disabled in online mode";
  } else if (state.twoPlayer) {
    els.rankText.textContent = "2-Player Local Match";
    els.achievementText.textContent = "Hints disabled in versus mode";
  } else {
    els.rankText.textContent = `${state.profile.rank} | ${state.profile.xp} XP`;
    els.achievementText.textContent = `Achievements: ${state.profile.achievements.length ? state.profile.achievements.slice(-2).join(" • ") : "none yet"}`;
  }
  renderSeasonStatus();
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
    els.standardMatchLayout.classList.add("hidden");
    els.onlineMatchLayout.classList.remove("hidden");
    const myScore = state.online.scores[state.online.playerName] ?? 0;
    const opponentName = state.online.opponentName || "Waiting...";
    const opponentScore = state.online.scores[opponentName] ?? 0;
    els.onlineYouName.textContent = state.online.playerName || "You";
    els.onlineYouScore.textContent = String(myScore);
    els.onlineOpponentName.textContent = opponentName;
    els.onlineOpponentScore.textContent = state.online.waiting ? "-" : String(opponentScore);
    els.onlineMatchState.textContent = state.online.waiting ? "Waiting for opponent to join" : "Live online match";
    els.onlineMatchCode.textContent = `Code ${state.online.roomCode || "----"}`;
    els.turnTimerText.classList.add("hidden");
    return;
  }
  if (!state.twoPlayer) {
    els.twoPlayerBanner.classList.add("hidden");
    els.turnTimerText.classList.add("hidden");
    return;
  }
  els.twoPlayerBanner.classList.remove("hidden");
  els.standardMatchLayout.classList.remove("hidden");
  els.onlineMatchLayout.classList.add("hidden");
  els.turnText.textContent = `${getActivePlayerName()}'s Turn`;
  els.matchupText.textContent = `${state.playerNames[0]} ${state.playerScores[state.playerNames[0]]} - ${state.playerScores[state.playerNames[1]]} ${state.playerNames[1]}`;
  els.turnTimerText.classList.remove("hidden");
  els.turnTimerText.textContent = `${state.questionTimeLeft || 15}s to answer`;
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

function showRoundOverlay(message, duration = 900) {
  if (!els.roundOverlay) return;
  window.clearTimeout(state.roundOverlayTimerId);
  els.roundOverlay.textContent = message;
  els.roundOverlay.classList.add("visible");
  state.roundOverlayTimerId = window.setTimeout(() => {
    els.roundOverlay.classList.remove("visible");
  }, duration);
}

function unlockAchievements(summary) {
  const earned = [];
  const existing = new Set(state.profile.achievements);
  const rules = [
    ["First Win", summary.correct > 0],
    ["Perfect Game", summary.correct === summary.total && summary.total > 0],
    ["On Fire", summary.bestStreak >= 5],
    ["No Skips", summary.skipped === 0 && summary.total > 0],
    ["No Hints", summary.hintsUsed === 0 && summary.correct > 0],
    ["Road Warrior", summary.online && summary.wonOnline],
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

function recordRankPromotions(previousXp, newXp) {
  const before = getRankInfoFromXp(previousXp).rankIndex;
  const afterInfo = getRankInfoFromXp(newXp);
  const after = afterInfo.rankIndex;
  const season = state.profile.seasonTag || getCurrentSeasonTag();

  if (after <= Math.max(before, state.profile.highestRankIndex || 0)) {
    state.profile.highestRankIndex = Math.max(after, state.profile.highestRankIndex || 0);
    return [];
  }

  const promotions = [];
  for (let index = Math.max(before, state.profile.highestRankIndex || 0) + 1; index <= after; index += 1) {
    const baseIndex = Math.floor(index / 3);
    const subtierIndex = index % 3;
    promotions.push({
      rank: `${BASE_RANKS[baseIndex]} ${RANK_SUBTIERS[subtierIndex]}`,
      date: formatDateShort(),
      season,
    });
  }

  state.profile.rankHistory = [...state.profile.rankHistory, ...promotions].slice(-24);
  state.profile.highestRankIndex = after;
  return promotions;
}

function grantRewards(summary) {
  const breakdown = [];
  const lostOnlineMatch = summary.online && !summary.wonOnline && !summary.tiedOnline;

  if (summary.correct === 0 || lostOnlineMatch) {
    state.profile.gamesPlayed += 1;
    state.profile.bestScore = Math.max(state.profile.bestScore, summary.correct);
    saveLocalProgress();
    updateProfileSummary();
    return {
      xpGain: 0,
      earned: [],
      promotions: [],
      breakdown: [
        {
          label: summary.correct === 0 ? "No XP awarded" : "Loss protection",
          value: 0,
          note: summary.correct === 0 ? "Score at least 1 point to earn season XP." : "You earn 0 XP for a loss, but your rank never drops.",
        },
      ],
    };
  }

  breakdown.push({ label: "Correct answers", value: summary.correct * 20 });
  if (summary.correct === summary.total && summary.total > 0) breakdown.push({ label: "Perfect game bonus", value: 300 });
  if (summary.skipped === 0 && summary.total > 0) breakdown.push({ label: "No skips bonus", value: 125 });
  if (summary.hintsUsed === 0 && summary.correct > 0) breakdown.push({ label: "No hints bonus", value: 150 });
  if (summary.bestStreak >= 8) {
    breakdown.push({ label: "Win streak bonus", value: 220 });
  } else if (summary.bestStreak >= 5) {
    breakdown.push({ label: "Win streak bonus", value: 100 });
  } else if (summary.bestStreak >= 3) {
    breakdown.push({ label: "Win streak bonus", value: 40 });
  }
  if (summary.online && summary.wonOnline) {
    breakdown.push({ label: "Online win bonus", value: 250 });
    state.profile.onlineWins += 1;
  }

  const xpGain = breakdown.reduce((total, item) => total + item.value, 0);
  const previousXp = state.profile.xp;
  state.profile.xp += xpGain;
  state.profile.rank = getRankFromXp(state.profile.xp);
  state.profile.gamesPlayed += 1;
  state.profile.bestScore = Math.max(state.profile.bestScore, summary.correct);
  const earned = unlockAchievements(summary);
  const promotions = recordRankPromotions(previousXp, state.profile.xp);
  saveLocalProgress();
  updateProfileSummary();
  return { xpGain, earned, promotions, breakdown };
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
  const showHeadshots = state.online.enabled ? state.online.showHeadshots : els.showHeadshots.checked;

  if (question.headshot && showHeadshots) {
    els.headshotImage.src = `${API_ORIGIN}${question.headshot}`;
    els.headshotImage.classList.remove("hidden");
    els.headshotFallback.classList.add("hidden");
  } else {
    els.headshotImage.classList.add("hidden");
    els.headshotFallback.classList.remove("hidden");
    els.headshotFallback.textContent = showHeadshots ? "No Headshot" : "Headshots Off";
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
  restartQuestionTimerIfNeeded();
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

function stopQuestionTimer() {
  clearInterval(state.questionTimerId);
  state.questionTimerId = null;
  state.questionTimeLeft = 0;
  els.turnTimerText.classList.add("hidden");
}

function restartQuestionTimerIfNeeded() {
  stopQuestionTimer();
  if (!state.twoPlayer || state.online.enabled) {
    return;
  }
  state.questionTimeLeft = 15;
  updateTwoPlayerHud();
  state.questionTimerId = setInterval(() => {
    state.questionTimeLeft -= 1;
    updateTwoPlayerHud();
    if (state.questionTimeLeft <= 0) {
      stopQuestionTimer();
      showToast("Time ran out. Turn skipped.");
      skipQuestion(true);
    }
  }, 1000);
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

  stopQuestionTimer();

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

function skipQuestion(autoSkipped = false) {
  if (state.submitted) return;
  const question = getCurrentQuestion();
  stopQuestionTimer();
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
  setFeedback(`${autoSkipped ? "Time ran out." : "Skipped."} Correct answer: ${question.college}`, "var(--muted)");
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
  stopQuestionTimer();
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
    mode: state.mode,
    hintsUsed: state.hintsUsed,
    online: state.online.enabled,
    wonOnline: false,
    tiedOnline: false,
  };
}

function finishQuiz() {
  stopTimer();
  stopQuestionTimer();
  switchScreen(screens.end);
  const summary = buildSummary();
  let reward = { xpGain: 0, earned: [] };
  document.getElementById("playAgain").classList.remove("hidden");
  document.getElementById("playMissedOnly").classList.remove("hidden");
  els.rematchStatus.classList.add("hidden");
  els.requestRematch.classList.add("hidden");
  if (!state.twoPlayer && !state.online.enabled) {
    reward = grantRewards(summary);
  }
  if (state.online.enabled) {
    const myScore = state.online.scores[state.online.playerName] ?? 0;
    const opponentScore = state.online.scores[state.online.opponentName] ?? 0;
    summary.wonOnline = myScore > opponentScore;
    summary.tiedOnline = myScore === opponentScore;
    reward = grantRewards(summary);
    if (myScore > opponentScore) {
      els.endTitle.textContent = "You Win";
    } else if (myScore < opponentScore) {
      els.endTitle.textContent = "You Lose";
    } else {
      els.endTitle.textContent = "Tie Game";
    }
    els.endSummary.textContent = `Final score: ${myScore} - ${opponentScore}`;
    const onlineBreakdown = reward.breakdown?.length
      ? reward.breakdown.map((item) => `${item.label}: +${item.value}`).join("\n")
      : "No XP awarded this match.";
    const onlinePromotions = reward.promotions?.length ? `\nRank Ups: ${reward.promotions.map((item) => item.rank).join(", ")}` : "";
    els.rewardSummary.textContent =
      `You: ${state.online.playerName} (${myScore})\n` +
      `Opponent: ${state.online.opponentName || "Opponent"} (${opponentScore})\n` +
      `Match code: ${state.online.roomCode}\n` +
      `Season XP: +${reward.xpGain}\n` +
      `Current Rank: ${state.profile.rank}${onlinePromotions}\n` +
      `XP Breakdown:\n${onlineBreakdown}`;
    els.missedSummary.textContent = "Press Request Rematch to play again with the same opponent, or Return Home to leave the room.";
    els.requestRematch.textContent = state.online.rematchRequested ? "Rematch Requested" : "Request Rematch";
    els.requestRematch.disabled = state.online.rematchRequested;
    els.requestRematch.classList.remove("hidden");
    document.getElementById("playAgain").classList.add("hidden");
    document.getElementById("playMissedOnly").classList.add("hidden");
  } else if (state.twoPlayer) {
    const [p1, p2] = state.playerNames;
    const s1 = state.playerScores[p1];
    const s2 = state.playerScores[p2];
    const winner = s1 === s2 ? `Tie game: ${s1}-${s2}` : `Winner: ${s1 > s2 ? p1 : p2} (${Math.max(s1, s2)}-${Math.min(s1, s2)})`;
    els.endSummary.textContent = `${winner} | Total questions ${summary.total}`;
    els.rewardSummary.textContent = `${p1}: ${s1}\n${p2}: ${s2}\n2-player local mode does not change XP or achievements.`;
  } else {
    els.endSummary.textContent = `${summary.correct}/${summary.total} correct | Accuracy ${summary.accuracy}% | Wrong ${summary.wrong} | Skipped ${summary.skipped}`;
    const breakdownLines = reward.breakdown?.length
      ? reward.breakdown.map((item) => `${item.label}: +${item.value}${item.note ? ` (${item.note})` : ""}`).join("\n")
      : "No bonus XP this run.";
    const promotionLines = reward.promotions?.length
      ? `Rank Ups: ${reward.promotions.map((item) => item.rank).join(", ")}\n`
      : "";
    els.rewardSummary.textContent =
      `Season XP Gained: ${reward.xpGain}\n` +
      `Current Rank: ${state.profile.rank}\n` +
      `${promotionLines}` +
      `XP Breakdown:\n${breakdownLines}\n` +
      `New Achievements: ${reward.earned.length ? reward.earned.join(", ") : "None this run"}`;
  }
  if (!state.online.enabled) {
    const missed = state.missedQuestions.map((question) => `${question.player_name} — ${question.college}`).join("\n");
    els.missedSummary.textContent = missed || "Perfect run. No missed questions.";
  }
  document.getElementById("submitLeaderboard").classList.add("hidden");
  saveProfile(true).catch(() => {});
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
      daily: false,
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
  els.dailyOutput.innerHTML = `
    <div class="daily-header">
      <div>
        <p class="eyebrow">Current Season</p>
        <div class="daily-status">${escapeHtml(state.profile.seasonTag || getCurrentSeasonTag())} ladder is active.</div>
      </div>
      <div class="profile-rank-badge">${state.questions.length} Questions</div>
    </div>
    <div class="daily-note">${escapeHtml(username)} is playing a ranked run. Stack clean wins, protect your rank, and push toward the next prestige tier.</div>
  `;
}

async function startQuiz(customQuestions = null) {
  const username = els.username.value.trim() || "Guest";
  state.profile.username = username;
  trackAnalytics("quiz_start");
  applyTheme(els.theme.value);
  saveLocalSettings();
  if (els.onlineMode.checked) {
    await startOnlineMatch();
    return;
  }
  state.daily = false;
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
  els.modeChip.textContent = state.twoPlayer ? "2-Player Local" : state.mode;
  els.endTitle.textContent = "Final Scoreboard";
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
    rematchRequested: false,
    showHeadshots: true,
  };
  updateProfileSummary();
}

function applyOnlineMatchSettings(payload = {}) {
  const hostAnswerMode = payload.answer_mode || state.answerMode || "typed";
  const hostShowHeadshots =
    typeof payload.show_headshots === "boolean" ? payload.show_headshots : state.online.showHeadshots;

  state.answerMode = hostAnswerMode;
  state.online.showHeadshots = hostShowHeadshots;
  els.answerMode.value = hostAnswerMode;
  els.showHeadshots.checked = hostShowHeadshots;

  if (payload.question_count !== undefined && payload.question_count !== null) {
    els.questionCount.value = String(payload.question_count);
  }

  if (payload.question_count === null) {
    els.questionCount.value = "all";
  }

  if (payload.conference) {
    els.conferenceFilter.value = payload.conference;
  }
}

function prepareOnlineQuizState(totalQuestions, payload) {
  state.online.enabled = true;
  state.twoPlayer = false;
  state.daily = false;
  state.mode = "Online 1v1";
  applyOnlineMatchSettings(payload);
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
  state.online.rematchRequested = false;
  state.online.opponentName = (payload.players || []).find((name) => name !== state.online.playerName) || state.online.opponentName;
  els.modeChip.textContent = "Online 1v1";
  els.endTitle.textContent = "Online Match Recap";
  els.requestRematch.classList.add("hidden");
  els.rematchStatus.classList.add("hidden");
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
  if (!payload.finished) {
    showRoundOverlay(
      myResult?.correct ? "Correct • Next Round" : myResult?.skipped ? "Skipped • Next Round" : "Wrong • Next Round",
      850
    );
  }

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
      applyOnlineMatchSettings(payload);
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
      showRoundOverlay("Match Start");
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

    if (payload.type === "rematch_status") {
      els.rematchStatus.classList.remove("hidden");
      if (payload.requested_by === state.online.playerName) {
        state.online.rematchRequested = true;
        els.requestRematch.textContent = "Rematch Requested";
        els.requestRematch.disabled = true;
        els.rematchStatus.textContent = "Rematch requested. Waiting for your opponent to accept.";
      } else {
        els.rematchStatus.textContent = `${payload.requested_by} wants a rematch. Press Request Rematch to accept.`;
      }
      return;
    }

    if (payload.type === "rematch_started") {
      prepareOnlineQuizState(payload.total_questions, payload);
      switchScreen(screens.quiz);
      startTimer();
      showRoundOverlay("Rematch Start");
      renderQuestion();
      showToast("Rematch started.");
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
  applyOnlineMatchSettings(roomPayload);
  switchScreen(screens.quiz);
  renderOnlineWaiting();
  startTimer();
  attachOnlineSocket(roomPayload.room_code, state.online.playerName);
}

async function saveProfile(silent = false) {
  const username = els.username.value.trim() || "Guest";
  state.profile.username = username;
  state.profile.seasonTag = state.profile.seasonTag || getCurrentSeasonTag();
  state.profile.rank = getRankFromXp(state.profile.xp);
  state.profile.highestRankIndex = Math.max(
    state.profile.highestRankIndex || 0,
    getRankInfoFromXp(state.profile.xp).rankIndex
  );
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
        dailyMode: false,
      },
      progress: {
        xp: state.profile.xp,
        rank: state.profile.rank,
        achievements: state.profile.achievements,
        gamesPlayed: state.profile.gamesPlayed,
        bestScore: state.profile.bestScore,
        onlineWins: state.profile.onlineWins,
        rankHistory: state.profile.rankHistory,
        highestRankIndex: state.profile.highestRankIndex,
        seasonTag: state.profile.seasonTag || getCurrentSeasonTag(),
      },
    }),
  });
  updateProfileSummary();
  await loadLeaderboard().catch(() => {});
  if (!silent) {
    alert(`Saved profile for ${username}`);
  }
}

async function loadLeaderboard() {
  const data = await fetchJson("/profiles");
  const activeUsername = (els.username.value.trim() || state.profile.username || "Guest").trim().toLowerCase();
  const remoteProfiles = [...(data.profiles || [])];
  const localProfileEntry = {
    username: state.profile.username || els.username.value.trim() || "Guest",
    progress: {
      xp: state.profile.xp,
      rank: getRankFromXp(state.profile.xp),
      achievements: state.profile.achievements,
      gamesPlayed: state.profile.gamesPlayed,
      bestScore: state.profile.bestScore,
      onlineWins: state.profile.onlineWins,
      rankHistory: state.profile.rankHistory,
      highestRankIndex: Math.max(
        state.profile.highestRankIndex || 0,
        getRankInfoFromXp(state.profile.xp).rankIndex
      ),
      seasonTag: state.profile.seasonTag || getCurrentSeasonTag(),
    },
  };

  const existingIndex = remoteProfiles.findIndex(
    (profile) => String(profile.username || "").trim().toLowerCase() === activeUsername
  );
  if (existingIndex >= 0) {
    remoteProfiles[existingIndex] = {
      ...remoteProfiles[existingIndex],
      ...localProfileEntry,
      progress: {
        ...(remoteProfiles[existingIndex].progress || {}),
        ...localProfileEntry.progress,
      },
    };
  } else if (activeUsername) {
    remoteProfiles.push(localProfileEntry);
  }

  const mergedProfiles = remoteProfiles
    .map((profile) => {
      const progress = getProfileProgress(profile);
      return {
        username: profile.username,
        xp: progress.xp || 0,
        rank: progress.rank || getRankFromXp(progress.xp || 0),
        rankIndex: progress.highestRankIndex ?? getRankIndexFromLabel(progress.rank) ?? getRankInfoFromXp(progress.xp || 0).rankIndex,
        bestScore: progress.bestScore || 0,
        achievements: (progress.achievements || []).length,
        onlineWins: progress.onlineWins || 0,
      };
    })
    .filter((profile) => String(profile.username || "").trim());

  const dedupedProfiles = [];
  const byUsername = new Map();

  for (const profile of mergedProfiles) {
    const key = String(profile.username).trim().toLowerCase();
    const existing = byUsername.get(key);
    if (
      !existing ||
      profile.rankIndex > existing.rankIndex ||
      (profile.rankIndex === existing.rankIndex && profile.xp > existing.xp) ||
      (profile.rankIndex === existing.rankIndex && profile.xp === existing.xp && profile.bestScore > existing.bestScore)
    ) {
      byUsername.set(key, profile);
    }
  }

  for (const profile of byUsername.values()) {
    dedupedProfiles.push(profile);
  }

  const profiles = dedupedProfiles
    .sort((a, b) => b.rankIndex - a.rankIndex || b.xp - a.xp || b.bestScore - a.bestScore || a.username.localeCompare(b.username))
    .slice(0, 5);

  if (!profiles.length) {
    els.leaderboardOutput.innerHTML = `
      <div class="leaderboard-header">
        <div>
          <p class="eyebrow">Ranked Leaderboard</p>
          <div class="daily-status">No ranked players saved yet.</div>
        </div>
      </div>
      <div class="leaderboard-empty">Save your profile after a run to appear on the ranked board.</div>
    `;
    return;
  }

  const rows = profiles
    .map(
      (entry, index) => `
        <div class="leaderboard-row">
          <span class="leaderboard-place">${index + 1}</span>
          <div>
            <span class="leaderboard-name">${escapeHtml(entry.username)}</span>
            <div class="leaderboard-meta">${escapeHtml(entry.rank)} • ${entry.xp} XP • Best score ${entry.bestScore} • ${entry.onlineWins} online wins</div>
          </div>
          <div class="leaderboard-score">${escapeHtml(entry.rank)}</div>
        </div>
      `
    )
    .join("");

  els.leaderboardOutput.innerHTML = `
    <div class="leaderboard-header">
      <div>
        <p class="eyebrow">Ranked Leaderboard</p>
        <div class="daily-status">Top 5 players by rank and XP.</div>
      </div>
    </div>
    <div class="leaderboard-list">${rows}</div>
  `;
}

async function loadAnalyticsSummary() {
  const analyticsKey = getAnalyticsAdminKey();
  if (!analyticsKey) {
    renderAnalyticsSummary(null);
    return;
  }
  const summary = await fetchJson("/analytics/summary", {
    headers: { "X-Analytics-Key": analyticsKey },
  });
  renderAnalyticsSummary(summary);
}

async function promptAnalyticsUnlock() {
  const entered = window.prompt("Enter analytics admin key");
  const key = String(entered || "").trim();
  if (!key) {
    return;
  }
  setAnalyticsAdminKey(key);
  try {
    await loadAnalyticsSummary();
    showToast("Analytics unlocked.");
  } catch (error) {
    setAnalyticsAdminKey("");
    renderAnalyticsSummary(null);
    showToast(error?.message || "Could not unlock analytics.");
  }
}

async function trackAnalytics(eventType = "page_view") {
  const username = (els.username?.value || state.profile.username || "Guest").trim();
  try {
    await fetchJson("/analytics", {
      method: "POST",
      body: JSON.stringify({
        visitor_id: getVisitorId(),
        event_type: eventType,
        path: window.location.pathname || "/",
        username,
        referrer: document.referrer || "",
      }),
    });
  } catch (_error) {
    // Ignore analytics failures so they never block gameplay.
  }
}

async function submitLeaderboard() {
  await saveProfile(true);
  await loadLeaderboard();
  alert("Season ladder refreshed.");
}

function playMissedOnly() {
  if (!state.missedQuestions.length) return;
  startQuiz(state.missedQuestions);
}

function returnHome() {
  stopTimer();
  stopQuestionTimer();
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

document.getElementById("startQuiz").addEventListener("click", () => {
  startQuiz().catch((error) => showToast(error?.message || "Could not start game."));
});
document.getElementById("saveProfile").addEventListener("click", () => {
  saveProfile()
    .then(() => loadAnalyticsSummary().catch(() => {}))
    .then(() => showToast("Profile saved."))
    .catch((error) => showToast(error?.message || "Could not save profile."));
});
document.getElementById("loadLeaderboard").addEventListener("click", () => {
  Promise.all([loadLeaderboard(), loadAnalyticsSummary().catch(() => {})])
    .then(() => showToast("Rankings refreshed."))
    .catch((error) => showToast(error?.message || "Could not refresh rankings."));
});
els.loginButton?.addEventListener("click", () => {
  showToast("Google login is the next step to make profiles truly yours.");
});
els.shareButton?.addEventListener("click", async () => {
  const shareUrl = window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Court Vision", url: shareUrl });
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
    } else {
      const temp = document.createElement("input");
      temp.value = shareUrl;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }
    showToast("Link copied.");
  } catch (_error) {
    showToast("Could not share the link.");
  }
});
els.siteTitle?.addEventListener("click", () => {
  const now = Date.now();
  if (now - state.admin.lastTitleTapAt > 8000) {
    state.admin.titleTapCount = 0;
  }
  state.admin.lastTitleTapAt = now;
  state.admin.titleTapCount += 1;
  if (state.admin.titleTapCount >= 5) {
    state.admin.titleTapCount = 0;
    promptAnalyticsUnlock();
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "a") {
    event.preventDefault();
    promptAnalyticsUnlock();
  }
});
document.addEventListener("click", (event) => {
  if (event.target?.id === "refreshAnalytics") {
    loadAnalyticsSummary()
      .then(() => showToast("Analytics refreshed."))
      .catch((error) => showToast(error?.message || "Could not refresh analytics."));
  }

  if (event.target?.id === "clearAnalyticsKey") {
    setAnalyticsAdminKey("");
    renderAnalyticsSummary(null);
    showToast("Analytics hidden.");
  }
});
document.getElementById("submitAnswer").addEventListener("click", () => submitAnswer());
document.getElementById("showHint").addEventListener("click", showHint);
document.getElementById("skipQuestion").addEventListener("click", skipQuestion);
document.getElementById("quitToHome").addEventListener("click", returnHome);
document.getElementById("playAgain").addEventListener("click", () => {
  startQuiz().catch((error) => showToast(error?.message || "Could not start game."));
});
document.getElementById("playMissedOnly").addEventListener("click", playMissedOnly);
document.getElementById("submitLeaderboard").addEventListener("click", submitLeaderboard);
document.getElementById("returnHome").addEventListener("click", returnHome);
document.getElementById("requestRematch").addEventListener("click", () => {
  if (!state.online.enabled || state.online.rematchRequested) return;
  state.online.rematchRequested = true;
  els.requestRematch.textContent = "Rematch Requested";
  els.requestRematch.disabled = true;
  els.rematchStatus.classList.remove("hidden");
  els.rematchStatus.textContent = "Rematch requested. Waiting for your opponent to accept.";
  state.online.socket?.send(JSON.stringify({ type: "request_rematch" }));
});
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
renderAnalyticsSummary(null);
populateMeta().catch(() => {});
loadLeaderboard().catch(() => {
  els.leaderboardOutput.innerHTML = '<div class="leaderboard-empty">Start the backend to load the season ladder.</div>';
});
trackAnalytics("page_view").then(() => loadAnalyticsSummary()).catch(() => {
  renderAnalyticsSummary(null);
});
