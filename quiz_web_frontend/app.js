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
const GOOGLE_CLIENT_ID =
  typeof window !== "undefined" && typeof window.COURT_VISION_GOOGLE_CLIENT_ID === "string"
    ? window.COURT_VISION_GOOGLE_CLIENT_ID.trim()
    : "";
const STORAGE_KEY = "courtvision-web-settings";
const PROGRESS_KEY = "courtvision-web-progress";
const VISITOR_KEY = "courtvision-web-visitor-id";
const ANALYTICS_KEY_STORAGE = "courtvision-web-analytics-key";
const AUTH_STORAGE_KEY = "courtvision-web-auth";
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
    ranked: false,
    action: "create",
    roomCode: "",
    matchId: "",
    socket: null,
    waiting: false,
    currentQuestion: null,
    opponentName: "",
    opponentId: "",
    scores: {},
    playerName: "",
    playerId: "",
    rematchRequested: false,
    showHeadshots: true,
    queuePollId: null,
    rankedProfile: null,
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
    profiles: [],
  },
  directory: {
    searchTimerId: null,
    results: [],
  },
  auth: {
    token: "",
    user: null,
    panelOpen: false,
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
  playerPool: document.getElementById("playerPool"),
  answerMode: document.getElementById("answerMode"),
  showHeadshots: document.getElementById("showHeadshots"),
  twoPlayerMode: document.getElementById("twoPlayerMode"),
  twoPlayerFields: document.getElementById("twoPlayerFields"),
  playerOneName: document.getElementById("playerOneName"),
  playerTwoName: document.getElementById("playerTwoName"),
  onlineMode: document.getElementById("onlineMode"),
  onlineFields: document.getElementById("onlineFields"),
  rankedMode: document.getElementById("rankedMode"),
  rankedFields: document.getElementById("rankedFields"),
  onlineAction: document.getElementById("onlineAction"),
  onlineCode: document.getElementById("onlineCode"),
  onlineStatus: document.getElementById("onlineStatus"),
  dailyMode: document.getElementById("dailyMode"),
  profileSummary: document.getElementById("profileSummary"),
  dailyOutput: document.getElementById("dailyOutput"),
  leaderboardOutput: document.getElementById("leaderboardOutput"),
  directoryOutput: document.getElementById("directoryOutput"),
  directorySearch: document.getElementById("directorySearch"),
  directorySearchButton: document.getElementById("directorySearchButton"),
  directoryResults: document.getElementById("directoryResults"),
  loginButton: document.getElementById("loginButton"),
  shareButton: document.getElementById("shareButton"),
  authPanel: document.getElementById("authPanel"),
  authSignedOut: document.getElementById("authSignedOut"),
  authSignedIn: document.getElementById("authSignedIn"),
  authStatus: document.getElementById("authStatus"),
  googleSignInButton: document.getElementById("googleSignInButton"),
  authUserPicture: document.getElementById("authUserPicture"),
  authUserName: document.getElementById("authUserName"),
  authUserEmail: document.getElementById("authUserEmail"),
  openProfileSettings: document.getElementById("openProfileSettings"),
  logoutButton: document.getElementById("logoutButton"),
  siteTitle: document.getElementById("siteTitle"),
  profileSettingsCard: document.getElementById("profileSettingsCard"),
  profileDisplayName: document.getElementById("profileDisplayName"),
  profileTheme: document.getElementById("profileTheme"),
  profileDefaultMode: document.getElementById("profileDefaultMode"),
  profileDefaultCount: document.getElementById("profileDefaultCount"),
  profileDefaultAnswerMode: document.getElementById("profileDefaultAnswerMode"),
  profileDefaultPlayerPool: document.getElementById("profileDefaultPlayerPool"),
  profileDefaultHeadshots: document.getElementById("profileDefaultHeadshots"),
  saveProfileSettings: document.getElementById("saveProfileSettings"),
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

const PLAYER_POOL_LABELS = {
  all: "All Players",
  rotation: "Rotation Players",
  starter: "Starters",
  bench: "Bench Players",
};

function getDefaultSettings() {
  return {
    username: "Guest",
    theme: "Arena Blue",
    gameMode: "Practice",
    questionCount: "25",
    conferenceFilter: "All",
    playerPool: "all",
    answerMode: "typed",
    showHeadshots: true,
    twoPlayerMode: false,
    onlineMode: false,
    rankedMode: false,
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

function loadAuthState() {
  const saved = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
  if (saved?.token && saved?.user) {
    state.auth.token = saved.token;
    state.auth.user = saved.user;
  }
}

function persistAuthState() {
  if (state.auth.token && state.auth.user) {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        token: state.auth.token,
        user: state.auth.user,
      })
    );
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

function clearAuthState() {
  state.auth.token = "";
  state.auth.user = null;
  persistAuthState();
}

function getAuthHeaders() {
  return state.auth.token ? { Authorization: `Bearer ${state.auth.token}` } : {};
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

function renderAuthPanel() {
  const signedIn = Boolean(state.auth.user && state.auth.token);
  els.authPanel?.classList.toggle("hidden", !state.auth.panelOpen);
  els.authSignedOut?.classList.toggle("hidden", signedIn);
  els.authSignedIn?.classList.toggle("hidden", !signedIn);
  els.profileSettingsCard?.classList.toggle("hidden", !signedIn);
  if (els.username) {
    els.username.readOnly = signedIn;
    els.username.title = signedIn ? "This profile is locked to your signed-in Google account." : "";
  }

  if (signedIn) {
    els.loginButton.textContent = state.auth.user.name || "Account";
    els.authUserName.textContent = state.auth.user.name || "Signed in";
    els.authUserEmail.textContent = state.auth.user.email || "";
    if (state.auth.user.picture) {
      els.authUserPicture.src = state.auth.user.picture;
      els.authUserPicture.classList.remove("hidden");
    } else {
      els.authUserPicture.classList.add("hidden");
    }
  } else {
    els.loginButton.textContent = "Login";
    if (els.authStatus) {
      els.authStatus.textContent = GOOGLE_CLIENT_ID
        ? "Sign in to save a profile that belongs to your Google account."
        : "Google login is not configured yet.";
    }
    if (els.authUserPicture) {
      els.authUserPicture.classList.add("hidden");
    }
  }
  populateProfileSettingsForm();
}

function initializeGoogleButton() {
  if (!els.googleSignInButton || !window.google?.accounts?.id) return;
  els.googleSignInButton.innerHTML = "";
  if (!GOOGLE_CLIENT_ID) {
    if (els.authStatus) {
      els.authStatus.textContent = "Google login is not configured yet.";
    }
    return;
  }

  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredentialResponse,
  });
  window.google.accounts.id.renderButton(els.googleSignInButton, {
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "continue_with",
    width: 280,
  });
}

async function handleGoogleCredentialResponse(response) {
  try {
    const payload = await fetchJson("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential: response.credential }),
    });
    state.auth.token = payload.token;
    state.auth.user = payload.user;
    persistAuthState();
    if (payload.user?.name) {
      els.username.value = payload.user.name;
      state.profile.username = payload.user.name;
    }
    await loadAuthenticatedProfile();
    await loadRankedProfile();
    state.auth.panelOpen = false;
    renderAuthPanel();
    showToast("Signed in with Google.");
  } catch (error) {
    if (els.authStatus) {
      els.authStatus.textContent = error?.message || "Google sign-in failed.";
    }
    showToast(error?.message || "Google sign-in failed.");
  }
}

async function restoreAuthenticatedUser() {
  if (!state.auth.token) return;
  try {
    const payload = await fetchJson("/auth/me", {
      headers: getAuthHeaders(),
    });
    state.auth.user = payload.user;
    if (payload.user?.name) {
      els.username.value = payload.user.name;
      state.profile.username = payload.user.name;
    }
    await loadAuthenticatedProfile();
    await loadRankedProfile();
    persistAuthState();
  } catch (_error) {
    clearAuthState();
    state.online.rankedProfile = null;
  }
}

function applyProfilePayload(profile) {
  if (!profile) return;
  const settings = profile.settings || {};
  const progress = getProfileProgress(profile);

  state.profile = {
    username: profile.username || state.auth.user?.name || state.profile.username || "Guest",
    theme: profile.theme || state.profile.theme || "Arena Blue",
    xp: progress.xp,
    rank: getRankFromXp(progress.xp || 0),
    achievements: progress.achievements || [],
    gamesPlayed: progress.gamesPlayed || 0,
    bestScore: progress.bestScore || 0,
    onlineWins: progress.onlineWins || 0,
    rankHistory: progress.rankHistory || [],
    highestRankIndex: progress.highestRankIndex ?? getRankInfoFromXp(progress.xp || 0).rankIndex,
    seasonTag: progress.seasonTag || getCurrentSeasonTag(),
  };

  if (profile.auth_id && state.auth.user?.sub && profile.auth_id === `google:${state.auth.user.sub}`) {
    state.profile.authId = profile.auth_id;
  }

  els.username.value = state.profile.username;
  els.theme.value = profile.theme || els.theme.value;
  els.gameMode.value = settings.mode || els.gameMode.value;
  els.questionCount.value = settings.questionCount || els.questionCount.value;
  els.conferenceFilter.value = settings.conferenceFilter || els.conferenceFilter.value;
  els.playerPool.value = settings.playerPool || els.playerPool.value;
  els.answerMode.value = settings.answerMode || els.answerMode.value;
  els.showHeadshots.checked = settings.showHeadshots !== false;
  els.twoPlayerMode.checked = Boolean(settings.twoPlayerMode);
  els.onlineMode.checked = Boolean(settings.onlineMode);
  els.playerOneName.value = settings.playerOneName || els.playerOneName.value;
  els.playerTwoName.value = settings.playerTwoName || els.playerTwoName.value;
  syncModeFields();
  applyTheme(els.theme.value);
  saveLocalSettings();
  saveLocalProgress();
  updateProfileSummary();
  populateProfileSettingsForm();
}

async function loadAuthenticatedProfile() {
  if (!state.auth.token) return;
  try {
    const payload = await fetchJson("/auth/profile", {
      headers: getAuthHeaders(),
    });
    applyProfilePayload(payload.profile);
  } catch (_error) {
    // Keep local state when the signed-in account has not saved a profile yet.
  }
}

function populateProfileSettingsForm() {
  const signedIn = Boolean(state.auth.user && state.auth.token);
  if (!signedIn || !els.profileDisplayName) return;
  els.profileDisplayName.value = state.profile.username || state.auth.user?.name || "";
  els.profileTheme.value = state.profile.theme || els.theme.value;
  els.profileDefaultMode.value = els.gameMode.value;
  els.profileDefaultCount.value = els.questionCount.value;
  els.profileDefaultAnswerMode.value = els.answerMode.value;
  els.profileDefaultPlayerPool.value = els.playerPool.value;
  els.profileDefaultHeadshots.checked = els.showHeadshots.checked;
}

async function loadRankedProfile() {
  if (!state.auth.token) {
    state.online.rankedProfile = null;
    updateProfileSummary();
    return;
  }
  try {
    const payload = await fetchJson("/ranked/profile", {
      headers: getAuthHeaders(),
    });
    state.online.rankedProfile = payload.profile;
    updateProfileSummary();
  } catch (_error) {
    state.online.rankedProfile = null;
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
  els.playerPool.value = savedSettings.playerPool || "all";
  els.answerMode.value = savedSettings.answerMode || "typed";
  els.showHeadshots.checked = savedSettings.showHeadshots !== false;
  els.twoPlayerMode.checked = Boolean(savedSettings.twoPlayerMode);
  els.onlineMode.checked = Boolean(savedSettings.onlineMode);
  els.rankedMode.checked = Boolean(savedSettings.rankedMode);
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
    playerPool: els.playerPool.value,
    answerMode: els.answerMode.value,
    showHeadshots: els.showHeadshots.checked,
    twoPlayerMode: els.twoPlayerMode.checked,
    onlineMode: els.onlineMode.checked,
    rankedMode: els.rankedMode.checked,
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
  const { headers: _ignoredHeaders, ...restOptions } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    ...restOptions,
    headers: requestHeaders,
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

function resolveAssetUrl(value) {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `${API_ORIGIN}${value}`;
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
      <div class="analytics-stat">
        <span class="dashboard-label">Live Matches</span>
        <strong>${summary.live_matches}</strong>
      </div>
      <div class="analytics-stat">
        <span class="dashboard-label">Waiting Rooms</span>
        <strong>${summary.waiting_rooms}</strong>
      </div>
      <div class="analytics-stat">
        <span class="dashboard-label">Online Players</span>
        <strong>${summary.online_players}</strong>
      </div>
    </div>
    <div class="admin-section">
      <div class="leaderboard-header">
        <div>
          <p class="eyebrow">Admin Cleanup</p>
          <div class="daily-status">Remove junk, duplicate, or test profiles from the backend.</div>
        </div>
      </div>
      <div class="admin-cleanup-row">
        <input id="adminCleanupUsername" placeholder="Enter username to remove" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
        <button id="adminCleanupButton" class="secondary-button">Remove Player</button>
      </div>
      <div id="adminProfileList" class="admin-profile-list"></div>
    </div>
    <div class="hero-actions">
      <button id="refreshAnalytics">Refresh Analytics</button>
      <button id="refreshAdminProfiles" class="secondary-button">Refresh Admin List</button>
      <button id="clearAnalyticsKey" class="secondary-button">Hide Analytics</button>
    </div>
  `;

  document.getElementById("refreshAnalytics")?.addEventListener("click", () => {
    loadAnalyticsSummary()
      .then(() => showToast("Analytics refreshed."))
      .catch((error) => showToast(error?.message || "Could not refresh analytics."));
  });
  document.getElementById("refreshAdminProfiles")?.addEventListener("click", () => {
    loadAdminProfiles()
      .then(() => showToast("Admin list refreshed."))
      .catch((error) => showToast(error?.message || "Could not refresh admin list."));
  });
  document.getElementById("adminCleanupButton")?.addEventListener("click", () => {
    const username = document.getElementById("adminCleanupUsername")?.value?.trim() || "";
    if (!username) {
      showToast("Enter a username to remove.");
      return;
    }
    deleteAdminProfile(username)
      .then((deleted) => {
        if (deleted) {
          const input = document.getElementById("adminCleanupUsername");
          if (input) input.value = "";
          showToast(`Removed ${username}.`);
        } else {
          showToast("No matching profile found.");
        }
      })
      .catch((error) => showToast(error?.message || "Could not remove that profile."));
  });
  renderAdminProfiles(state.admin.profiles || []);
}

function renderAdminProfiles(profiles) {
  state.admin.profiles = profiles || [];
  const container = document.getElementById("adminProfileList");
  if (!container) return;
  if (!state.admin.profiles.length) {
    container.innerHTML = '<div class="leaderboard-empty">No profiles loaded yet.</div>';
    return;
  }
  container.innerHTML = state.admin.profiles
    .map(
      (profile) => `
        <div class="admin-profile-row">
          <div>
            <span class="leaderboard-name">${escapeHtml(profile.username)}</span>
            <div class="leaderboard-meta">${escapeHtml(profile.auth_provider || "guest")} • ${profile.xp} XP • Best score ${profile.best_score}</div>
          </div>
          <div class="admin-profile-actions">
            <button class="secondary-button admin-remove-button" data-username="${escapeHtml(profile.username)}">Remove</button>
          </div>
        </div>
      `
    )
    .join("");
  container.querySelectorAll(".admin-remove-button").forEach((button) => {
    button.addEventListener("click", () => {
      const username = button.getAttribute("data-username") || "";
      deleteAdminProfile(username)
        .then((deleted) => {
          if (deleted) {
            showToast(`Removed ${username}.`);
          } else {
            showToast("No matching profile found.");
          }
        })
        .catch((error) => showToast(error?.message || "Could not remove that profile."));
    });
  });
}

async function loadAdminProfiles() {
  const analyticsKey = getAnalyticsAdminKey();
  if (!analyticsKey) {
    renderAdminProfiles([]);
    return;
  }
  const payload = await fetchJson("/admin/profiles?limit=20", {
    headers: { "X-Analytics-Key": analyticsKey },
  });
  renderAdminProfiles(payload.profiles || []);
}

async function deleteAdminProfile(username) {
  const analyticsKey = getAnalyticsAdminKey();
  if (!analyticsKey) throw new Error("Analytics access denied.");
  const payload = await fetchJson(`/admin/profiles/${encodeURIComponent(username)}`, {
    method: "DELETE",
    headers: { "X-Analytics-Key": analyticsKey },
  });
  await loadLeaderboard().catch(() => {});
  await loadAdminProfiles().catch(() => {});
  return Boolean(payload.deleted);
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
  const rankedProfile = state.online.rankedProfile;
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
        <div class="profile-subtitle">Your season progress, ranked stats, and recent promotions stay here in one place.</div>
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
    <div class="profile-stat-grid">
      <div class="profile-stat">
        <span class="dashboard-label">Ranked Division</span>
        <strong>${escapeHtml(rankedProfile?.division || "Unranked")}</strong>
      </div>
      <div class="profile-stat">
        <span class="dashboard-label">Ranked Elo</span>
        <strong>${rankedProfile?.elo ?? 0}</strong>
      </div>
      <div class="profile-stat">
        <span class="dashboard-label">Ranked Record</span>
        <strong>${rankedProfile ? `${rankedProfile.wins}-${rankedProfile.losses}` : "0-0"}</strong>
      </div>
      <div class="profile-stat">
        <span class="dashboard-label">Win Streak</span>
        <strong>${rankedProfile?.win_streak ?? 0}</strong>
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

function toggleRankedFields() {
  els.rankedFields.classList.toggle("hidden", !els.rankedMode.checked);
}

function syncModeFields() {
  if (els.rankedMode.checked) {
    els.twoPlayerMode.checked = false;
    els.onlineMode.checked = false;
  }
  if (els.onlineMode.checked) {
    els.twoPlayerMode.checked = false;
    els.rankedMode.checked = false;
  }
  if (els.twoPlayerMode.checked) {
    els.onlineMode.checked = false;
    els.rankedMode.checked = false;
  }
  toggleTwoPlayerFields();
  toggleOnlineFields();
  toggleRankedFields();
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
    const myScore = state.online.scores[state.online.ranked ? state.online.playerId : state.online.playerName] ?? 0;
    const opponentName = state.online.opponentName || "Waiting...";
    const opponentScore = state.online.scores[state.online.ranked ? state.online.opponentId : opponentName] ?? 0;
    els.onlineYouName.textContent = state.online.playerName || "You";
    els.onlineYouScore.textContent = state.online.ranked ? `${state.online.rankedProfile?.elo ?? 0} Elo` : String(myScore);
    els.onlineOpponentName.textContent = opponentName;
    els.onlineOpponentScore.textContent = state.online.waiting
      ? "-"
      : state.online.ranked
        ? `${state.online.opponentElo ?? 0} Elo`
        : String(opponentScore);
    els.onlineMatchState.textContent = state.online.waiting
      ? (state.online.ranked ? "Searching for ranked opponent" : "Waiting for opponent to join")
      : (state.online.ranked ? `Live ranked match • ${myScore}-${opponentScore}` : "Live online match");
    els.onlineMatchCode.textContent = state.online.ranked ? `${state.online.rankedProfile?.division || "Blacktop"} • Ranked` : `Code ${state.online.roomCode || "----"}`;
    if (state.online.ranked) {
      els.turnTimerText.classList.remove("hidden");
      els.turnTimerText.textContent = `${state.questionTimeLeft || 15}s to answer`;
    } else {
      els.turnTimerText.classList.add("hidden");
    }
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
    els.headshotImage.src = resolveAssetUrl(question.headshot);
    els.headshotImage.classList.remove("hidden");
    els.headshotFallback.classList.add("hidden");
  } else {
    els.headshotImage.classList.add("hidden");
    els.headshotFallback.classList.remove("hidden");
    els.headshotFallback.textContent = showHeadshots ? "No Headshot" : "Headshots Off";
  }

  if (question.logo) {
    els.logoCard.classList.remove("hidden");
    els.logoImage.src = resolveAssetUrl(question.logo);
    els.logoImage.classList.remove("hidden");
    els.logoFallback.classList.add("hidden");
  } else {
    els.logoCard.classList.add("hidden");
    els.logoImage.classList.add("hidden");
    els.logoFallback.classList.add("hidden");
  }
}

function renderDirectoryResults(players = [], query = "") {
  state.directory.results = players;
  if (!players.length) {
    els.directoryResults.innerHTML = query
      ? `<div class="leaderboard-empty">No players matched "${escapeHtml(query)}".</div>`
      : '<div class="leaderboard-empty">Search for a player to open the directory.</div>';
    return;
  }

  els.directoryResults.innerHTML = players
    .map(
      (player) => `
        <button class="directory-row" data-player-name="${escapeHtml(player.player_name)}" type="button">
          <img class="directory-headshot" src="${escapeHtml(resolveAssetUrl(player.headshot))}" alt="${escapeHtml(player.player_name)} headshot" />
          <div>
            <span class="directory-name">${escapeHtml(player.player_name)}</span>
            <div class="directory-college">${escapeHtml(player.college)}</div>
            <div class="directory-meta">${escapeHtml(player.conference)}</div>
          </div>
        </button>
      `
    )
    .join("");
}

async function searchDirectory() {
  const query = (els.directorySearch?.value || "").trim();
  if (!query) {
    renderDirectoryResults([], "");
    return;
  }

  els.directoryResults.innerHTML = '<div class="leaderboard-empty">Searching player directory...</div>';
  const payload = await fetchJson(`/player-directory?q=${encodeURIComponent(query)}&limit=8`);
  renderDirectoryResults(payload.players || [], payload.query || query);
}

function queueDirectorySearch() {
  if (state.directory.searchTimerId) {
    window.clearTimeout(state.directory.searchTimerId);
  }

  const query = (els.directorySearch?.value || "").trim();
  if (!query) {
    renderDirectoryResults([], "");
    return;
  }

  state.directory.searchTimerId = window.setTimeout(() => {
    searchDirectory().catch((error) => showToast(error?.message || "Could not search the directory."));
  }, 140);
}

function selectDirectoryPlayer(playerName) {
  const selected = state.directory.results.find((player) => player.player_name === playerName);
  if (!selected) return;
  els.directorySearch.value = selected.player_name;
  renderDirectoryResults([selected], selected.player_name);
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
    ? state.online.ranked ? "Ranked queue match" : "Online versus mode"
    : state.twoPlayer
      ? "Local versus mode"
      : `Current Streak: ${state.streak}`;
  if (state.online.enabled) {
    const myScore = state.online.scores[state.online.playerName] ?? 0;
    els.scoreChip.textContent = state.online.ranked ? `Elo ${state.online.rankedProfile?.elo ?? 0}` : `Score ${myScore}`;
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
  if (state.online.enabled && state.online.ranked) {
    state.questionTimeLeft = 15;
    updateTwoPlayerHud();
    state.questionTimerId = setInterval(() => {
      state.questionTimeLeft -= 1;
      updateTwoPlayerHud();
      if (state.questionTimeLeft <= 0) {
        stopQuestionTimer();
        showToast("Time ran out. Answer skipped.");
        skipQuestion(true);
      }
    }, 1000);
    return;
  }
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

function markMissed(question, correctAnswer = null) {
  if (!question) return;
  if (!state.missedQuestions.find((item) => item.player_name === question.player_name)) {
    state.missedQuestions.push({
      ...question,
      correct_answer: correctAnswer || question.correct_answer || null,
    });
  }
}

async function checkAnswer(rawAnswer, skipped = false, revealAnswer = true) {
  const question = getCurrentQuestion();
  return fetchJson("/check-answer", {
    method: "POST",
    body: JSON.stringify({
      question_id: question.question_id,
      answer: rawAnswer,
      skipped,
      reveal_answer: revealAnswer,
    }),
  });
}

async function fetchHint(stage) {
  const question = getCurrentQuestion();
  return fetchJson("/question-hint", {
    method: "POST",
    body: JSON.stringify({
      question_id: question.question_id,
      stage,
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
  const result = await checkAnswer(
    rawAnswer,
    false,
    !(state.mode === "Learning" && state.currentQuestionAttempts < 3)
  );

  if (state.mode === "Learning" && !result.correct) {
    if (state.currentQuestionAttempts === 1) {
      const hint = await fetchHint(0);
      setFeedback(`Wrong. ${hint.hint}`, "var(--gold)");
      return;
    }
    if (state.currentQuestionAttempts === 2) {
      const hint = await fetchHint(1);
      setFeedback(`Wrong again. ${hint.hint}`, "var(--gold)");
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
    setFeedback(`Wrong. Correct answer: ${result.correct_answer || "Unavailable"}`, "var(--red)");
    if (clickedButton) clickedButton.classList.add("wrong-choice");
    markMissed(question, result.correct_answer);
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
  checkAnswer("", true)
    .then((result) => {
      markMissed(question, result.correct_answer);
      setFeedback(`${autoSkipped ? "Time ran out." : "Skipped."} Correct answer: ${result.correct_answer || "Unavailable"}`, "var(--muted)");
      updateHintAvailability();
      renderProgress();
      advancePlayerTurn();
      updateTwoPlayerHud();
      window.setTimeout(nextQuestion, 500);
    })
    .catch((error) => {
      setFeedback(error?.message || "Could not skip this question.", "var(--muted)");
    });
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
    showToast(state.online.ranked ? "No hints during ranked mode." : "No hints during online mode.");
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

  state.hintsUsed += 1;
  fetchHint(state.hintStage)
    .then((payload) => {
      setFeedback(payload.hint, "var(--gold)");
      state.hintStage = Math.min(state.hintStage + 1, 3);
      updateHintAvailability();
    })
    .catch((error) => {
      state.hintsUsed = Math.max(state.hintsUsed - 1, 0);
      showToast(error?.message || "Could not load a hint.");
      updateHintAvailability();
    });
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
    const myScore = state.online.scores[state.online.ranked ? state.online.playerId : state.online.playerName] ?? 0;
    const opponentScore = state.online.scores[state.online.ranked ? state.online.opponentId : state.online.opponentName] ?? 0;
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
    if (state.online.ranked) {
      const rankedProfile = state.online.rankedProfile || { elo: 0, division: "Blacktop", wins: 0, losses: 0, win_streak: 0 };
      const eloChange = (() => {
        if (summary.tiedOnline) return 0;
        if (summary.wonOnline) {
          if (rankedProfile.win_streak >= 10) return 50;
          if (rankedProfile.win_streak >= 5) return 40;
          return 30;
        }
        return -10;
      })();
      els.endSummary.textContent = `Ranked final score: ${myScore} - ${opponentScore}`;
      els.rewardSummary.textContent =
        `Division: ${rankedProfile.division}\n` +
        `Current Elo: ${rankedProfile.elo}\n` +
        `Elo Change: ${eloChange >= 0 ? "+" : ""}${eloChange}\n` +
        `Ranked Record: ${rankedProfile.wins}-${rankedProfile.losses}\n` +
        `Win Streak: ${rankedProfile.win_streak}`;
      els.missedSummary.textContent = "Ranked queue has no rematches. Return home to queue again.";
      els.requestRematch.classList.add("hidden");
      document.getElementById("playAgain").classList.add("hidden");
      document.getElementById("playMissedOnly").classList.add("hidden");
    } else {
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
    }
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
    const missed = state.missedQuestions
      .map((question) => `${question.player_name} — ${question.correct_answer || "Unavailable"}`)
      .join("\n");
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
      player_pool: els.playerPool.value,
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
  if (els.rankedMode.checked) {
    await startRankedQueue();
    return;
  }
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
  if (state.online.queuePollId) {
    clearInterval(state.online.queuePollId);
  }
  if (state.online.socket && state.online.socket.readyState < 2) {
    state.online.socket.close();
  }
  state.online = {
    enabled: false,
    ranked: false,
    action: "create",
    roomCode: "",
    matchId: "",
    socket: null,
    waiting: false,
    currentQuestion: null,
    opponentName: "",
    opponentId: "",
    scores: {},
    playerName: "",
    playerId: "",
    rematchRequested: false,
    showHeadshots: true,
    queuePollId: null,
    rankedProfile: state.online.rankedProfile || null,
    opponentElo: 0,
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

  if (payload.player_pool) {
    els.playerPool.value = payload.player_pool;
  }
}

function prepareOnlineQuizState(totalQuestions, payload) {
  state.online.enabled = true;
  state.twoPlayer = false;
  state.daily = false;
  state.mode = payload.ranked ? "Ranked Online" : "Online 1v1";
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
  state.online.ranked = Boolean(payload.ranked);
  if (payload.player_names && state.online.playerId) {
    state.online.opponentId = Object.keys(payload.player_names).find((id) => id !== state.online.playerId) || state.online.opponentId;
  }
  state.online.opponentName = (payload.players || []).find((name) => name !== state.online.playerName) || state.online.opponentName;
  if (payload.player_names && state.online.playerId) {
    const opponentId = Object.keys(payload.player_names).find((id) => id !== state.online.playerId);
    if (opponentId) {
      state.online.opponentName = payload.player_names[opponentId];
    }
  }
  if (payload.ranked_profile) {
    state.online.rankedProfile = {
      ...(state.online.rankedProfile || {}),
      ...payload.ranked_profile,
    };
  }
  if (payload.opponent_profile) {
    state.online.opponentElo = payload.opponent_profile.elo ?? 0;
  }
  els.modeChip.textContent = payload.ranked ? "Ranked Online" : "Online 1v1";
  els.endTitle.textContent = payload.ranked ? "Ranked Match Recap" : "Online Match Recap";
  els.requestRematch.classList.toggle("hidden", Boolean(payload.ranked));
  els.rematchStatus.classList.add("hidden");
}

function renderOnlineWaiting() {
  state.online.waiting = true;
  state.questions = Array(state.online.ranked ? 25 : (getRequestedQuestionCount() ?? 10)).fill(null);
  state.results = Array(state.questions.length).fill(null);
  els.modeChip.textContent = state.online.ranked ? "Ranked Online" : "Online 1v1";
  els.endTitle.textContent = state.online.ranked ? "Ranked Match Recap" : "Online Match Recap";
  updateTwoPlayerHud();
  renderQuestion();
}

function handleOnlineRoundComplete(payload) {
  const myResult = payload.round_results?.[state.online.ranked ? state.online.playerId : state.online.playerName];
  if (myResult?.correct) {
    state.results[state.currentIndex] = "correct";
    setFeedback("Correct!", "var(--green)");
  } else if (myResult?.skipped) {
    state.results[state.currentIndex] = "skipped";
    setFeedback(`Skipped. Correct answer: ${payload.correct_answer}`, "var(--muted)");
    if (getCurrentQuestion()) {
      markMissed(getCurrentQuestion(), payload.correct_answer);
    }
  } else {
    state.results[state.currentIndex] = "wrong";
    setFeedback(`Wrong. Correct answer: ${payload.correct_answer}`, "var(--red)");
    if (getCurrentQuestion()) {
      markMissed(getCurrentQuestion(), payload.correct_answer);
    }
  }

  state.online.scores = payload.scores || state.online.scores;
  if (payload.ranked_profile) {
    state.online.rankedProfile = {
      ...(state.online.rankedProfile || {}),
      ...payload.ranked_profile,
    };
  }
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
      if (state.online.ranked && payload.rating_updates && state.online.playerId) {
        const myUpdate = payload.rating_updates[state.online.playerId];
        if (myUpdate) {
          state.online.rankedProfile = {
            ...(state.online.rankedProfile || {}),
            elo: myUpdate.new_elo,
            division: myUpdate.division,
            wins: myUpdate.wins,
            losses: myUpdate.losses,
            win_streak: myUpdate.win_streak,
            best_win_streak: myUpdate.best_win_streak,
          };
        }
      }
      finishQuiz();
      return;
    }
    prepareOnlineQuizState(payload.total_questions, payload);
    renderQuestion();
  }, 1000);
}

async function pollRankedQueueStatus() {
  if (!state.online.ranked) return;
  try {
    const payload = await fetchJson("/ranked/queue/status", {
      headers: getAuthHeaders(),
    });
    if (payload.status === "matched" && payload.match_id) {
      clearInterval(state.online.queuePollId);
      state.online.queuePollId = null;
      state.online.matchId = payload.match_id;
      state.online.opponentName = payload.opponent_name || "Opponent";
      attachRankedSocket(payload.match_id);
    }
  } catch (_error) {
    // keep waiting quietly
  }
}

function attachRankedSocket(matchId) {
  const token = state.auth.token;
  const socketUrl = `${getWebSocketBase()}/ws/ranked/${matchId}?token=${encodeURIComponent(token)}`;
  const socket = new WebSocket(socketUrl);
  state.online.socket = socket;
  state.online.matchId = matchId;

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "room_joined") {
      state.online.enabled = true;
      state.online.ranked = true;
      state.online.playerId = payload.player_id;
      state.online.playerName = payload.player_name;
      state.online.opponentName = payload.opponent_name || "";
      if (payload.player_names && payload.player_id) {
        state.online.opponentId = Object.keys(payload.player_names).find((id) => id !== payload.player_id) || "";
      }
      state.online.scores = payload.scores || {};
      state.online.waiting = Boolean(payload.waiting);
      state.answerMode = payload.answer_mode || "multiple-choice";
      els.answerMode.value = state.answerMode;
      if (payload.ranked_profile) {
        state.online.rankedProfile = payload.ranked_profile;
      }
      if (payload.opponent_profile) {
        state.online.opponentElo = payload.opponent_profile.elo ?? 0;
      }
      renderOnlineWaiting();
      updateTwoPlayerHud();
      return;
    }

    if (payload.type === "match_started") {
      prepareOnlineQuizState(payload.total_questions, payload);
      switchScreen(screens.quiz);
      startTimer();
      showRoundOverlay("Ranked Match Found");
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
      showToast(payload.message || "Opponent left the ranked match.");
      state.online.currentQuestion = null;
      finishQuiz();
    }
  });

  socket.addEventListener("close", () => {
    if (state.online.ranked && screens.quiz.classList.contains("active") && !screens.end.classList.contains("active")) {
      showToast("Ranked connection closed.");
    }
  });
}

async function startRankedQueue() {
  if (!state.auth.token) {
    showToast("Sign in with Google to play ranked.");
    return;
  }
  saveLocalSettings();
  resetOnlineState();
  state.online.enabled = true;
  state.online.ranked = true;
  state.mode = "Ranked Online";
  state.answerMode = "multiple-choice";
  els.answerMode.value = "multiple-choice";
  els.modeChip.textContent = "Ranked Online";
  state.hintLimit = 0;
  state.hintsUsed = 0;
  state.hintStage = 0;
  state.results = [];
  state.missedQuestions = [];
  state.currentIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  await loadRankedProfile();
  const payload = await fetchJson("/ranked/queue/join", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({}),
  });
  state.online.playerName = state.profile.username;
  state.online.waiting = payload.status === "waiting";
  state.questions = Array(payload.question_count || 25).fill(null);
  state.results = Array(state.questions.length).fill(null);
  switchScreen(screens.quiz);
  renderOnlineWaiting();
  startTimer();
  if (payload.status === "matched" && payload.match_id) {
    attachRankedSocket(payload.match_id);
  } else {
    els.onlineStatus.textContent = "Searching for a ranked opponent...";
    state.online.queuePollId = setInterval(pollRankedQueueStatus, 2500);
  }
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
          player_pool: els.playerPool.value,
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
  const profilePayload = {
    username,
    theme: els.theme.value,
      settings: {
        mode: els.gameMode.value,
        questionCount: els.questionCount.value,
        conferenceFilter: els.conferenceFilter.value,
        playerPool: els.playerPool.value,
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
  };

  if (state.auth.token) {
    await fetchJson("/auth/profile", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(profilePayload),
    });
  } else {
    await fetchJson("/profiles", {
      method: "POST",
      body: JSON.stringify(profilePayload),
    });
  }
  updateProfileSummary();
  await loadLeaderboard().catch(() => {});
  if (!silent) {
    showToast(`Saved profile for ${username}.`);
  }
}

async function saveAccountSettings() {
  if (!state.auth.token) {
    showToast("Sign in with Google first.");
    return;
  }

  const displayName = (els.profileDisplayName.value || "").trim();
  if (!displayName) {
    showToast("Enter a display name.");
    return;
  }

  els.username.value = displayName;
  state.profile.username = displayName;
  els.theme.value = els.profileTheme.value;
  els.gameMode.value = els.profileDefaultMode.value;
  els.questionCount.value = els.profileDefaultCount.value;
  els.playerPool.value = els.profileDefaultPlayerPool.value;
  els.answerMode.value = els.profileDefaultAnswerMode.value;
  els.showHeadshots.checked = els.profileDefaultHeadshots.checked;
  syncModeFields();
  applyTheme(els.theme.value);
  await saveProfile(true);

  if (state.auth.user) {
    state.auth.user.name = displayName;
    persistAuthState();
  }
  renderAuthPanel();
  showToast("Account settings saved.");
}

async function loadLeaderboard() {
  const data = await fetchJson("/ranked/leaderboard?limit=5");
  const entries = data.entries || [];

  if (!entries.length) {
    els.leaderboardOutput.innerHTML = `
      <div class="leaderboard-header">
        <div>
          <p class="eyebrow">True Ranked Online</p>
          <div class="daily-status">No ranked players yet.</div>
        </div>
      </div>
      <div class="leaderboard-empty">Sign in with Google and queue ranked to appear on the competitive ladder.</div>
    `;
    return;
  }

  const rows = entries
    .map(
      (entry, index) => `
        <div class="leaderboard-row">
          <span class="leaderboard-place">${index + 1}</span>
          <div>
            <span class="leaderboard-name">${escapeHtml(entry.username)}</span>
            <div class="leaderboard-meta">${escapeHtml(entry.division)} • ${entry.elo} Elo • ${entry.wins}-${entry.losses} record • ${entry.win_streak} streak</div>
          </div>
          <div class="leaderboard-score">${entry.elo} Elo</div>
        </div>
      `
    )
    .join("");

  els.leaderboardOutput.innerHTML = `
    <div class="leaderboard-header">
      <div>
        <p class="eyebrow">True Ranked Online</p>
        <div class="daily-status">Top 5 players by Elo.</div>
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
  await loadAdminProfiles().catch(() => {});
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
  showToast("Season ladder refreshed.");
}

function playMissedOnly() {
  if (!state.missedQuestions.length) return;
  startQuiz(state.missedQuestions);
}

function returnHome() {
  stopTimer();
  stopQuestionTimer();
  if (state.online.ranked && state.auth.token) {
    fetchJson("/ranked/queue/leave", {
      method: "DELETE",
      headers: getAuthHeaders(),
    }).catch(() => {});
  }
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
  const playerPoolCounts = data.player_pools || {};
  [els.playerPool, els.profileDefaultPlayerPool].forEach((select) => {
    if (!select) return;
    Array.from(select.options).forEach((option) => {
      const baseLabel = PLAYER_POOL_LABELS[option.value] || option.textContent;
      const count = playerPoolCounts[option.value];
      option.textContent = Number.isFinite(count) ? `${baseLabel} (${count})` : baseLabel;
    });
  });
  if (saved?.playerPool) {
    els.playerPool.value = saved.playerPool;
  }
}

document.getElementById("startQuiz").addEventListener("click", () => {
  startQuiz().catch((error) => showToast(error?.message || "Could not start game."));
});
document.getElementById("saveProfile").addEventListener("click", () => {
  saveProfile()
    .then(() => loadAnalyticsSummary().catch(() => {}))
    .catch((error) => showToast(error?.message || "Could not save profile."));
});
document.getElementById("loadLeaderboard").addEventListener("click", () => {
  Promise.all([loadLeaderboard(), loadAnalyticsSummary().catch(() => {})])
    .then(() => showToast("Rankings refreshed."))
    .catch((error) => showToast(error?.message || "Could not refresh rankings."));
});
els.loginButton?.addEventListener("click", () => {
  state.auth.panelOpen = !state.auth.panelOpen;
  renderAuthPanel();
  if (state.auth.panelOpen) {
    initializeGoogleButton();
  }
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
els.directorySearchButton?.addEventListener("click", () => {
  searchDirectory().catch((error) => showToast(error?.message || "Could not search the directory."));
});
els.directoryResults?.addEventListener("click", (event) => {
  const button = event.target.closest(".directory-row[data-player-name]");
  if (!button) return;
  selectDirectoryPlayer(button.dataset.playerName || "");
});
els.directorySearch?.addEventListener("input", () => {
  queueDirectorySearch();
});
els.directorySearch?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchDirectory().catch((error) => showToast(error?.message || "Could not search the directory."));
  }
});
els.logoutButton?.addEventListener("click", () => {
  clearAuthState();
  state.online.rankedProfile = null;
  state.auth.panelOpen = false;
  renderAuthPanel();
  updateProfileSummary();
  showToast("Logged out.");
});
els.openProfileSettings?.addEventListener("click", () => {
  if (els.profileSettingsCard?.classList.contains("hidden")) return;
  populateProfileSettingsForm();
  els.profileSettingsCard.scrollIntoView({ behavior: "smooth", block: "start" });
});
els.saveProfileSettings?.addEventListener("click", () => {
  saveAccountSettings().catch((error) => showToast(error?.message || "Could not save account settings."));
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
  if (event.target?.id === "clearAnalyticsKey") {
    setAnalyticsAdminKey("");
    renderAnalyticsSummary(null);
    renderAdminProfiles([]);
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
els.playerPool.addEventListener("change", saveLocalSettings);
els.twoPlayerMode.addEventListener("change", () => {
  syncModeFields();
  saveLocalSettings();
});
els.onlineMode.addEventListener("change", () => {
  syncModeFields();
  saveLocalSettings();
});
els.rankedMode.addEventListener("change", () => {
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
loadAuthState();
applyTheme(els.theme.value);
renderAuthPanel();
restoreAuthenticatedUser()
  .then(() => {
    renderAuthPanel();
    updateProfileSummary();
  })
  .catch(() => {
    renderAuthPanel();
    updateProfileSummary();
  });
updateProfileSummary();
syncModeFields();
renderAnalyticsSummary(null);
populateMeta().catch(() => {});
loadLeaderboard().catch(() => {
  els.leaderboardOutput.innerHTML = '<div class="leaderboard-empty">Start the backend to load the ranked ladder.</div>';
});
trackAnalytics("page_view").then(() => loadAnalyticsSummary()).catch(() => {
  renderAnalyticsSummary(null);
});
