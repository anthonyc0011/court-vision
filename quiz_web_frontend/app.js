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
const AUTH_PROFILE_CACHE_KEY = "courtvision-web-auth-profile-cache";
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
    opponentAuthId: "",
    scores: {},
    playerName: "",
    playerId: "",
    playerAuthId: "",
    rematchRequested: false,
    showHeadshots: true,
    inviteUrl: "",
    queuePollId: null,
    rankedProfile: null,
    chatMessages: [],
    chatOpen: false,
    chatMuted: false,
    unreadCount: 0,
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
    liveSummary: null,
    userResults: [],
  },
  directory: {
    searchTimerId: null,
    results: [],
  },
  invite: {
    joinCode: "",
    autoJoinAttempted: false,
  },
  friends: {
    panelOpen: false,
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    friendCode: "",
    loaded: false,
  },
  auth: {
    token: "",
    user: null,
    panelOpen: false,
    lastExpiryNoticeAt: 0,
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
  continueToMatchType: document.getElementById("continueToMatchType"),
  backToQuizSetup: document.getElementById("backToQuizSetup"),
  quizSetupStep: document.getElementById("quizSetupStep"),
  matchTypeStep: document.getElementById("matchTypeStep"),
  soloMode: document.getElementById("soloMode"),
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
  toggleQuizSetup: document.getElementById("toggleQuizSetup"),
  quizSetupBody: document.getElementById("quizSetupBody"),
  toggleMatchType: document.getElementById("toggleMatchType"),
  matchTypeBody: document.getElementById("matchTypeBody"),
  toggleDirectory: document.getElementById("toggleDirectory"),
  directoryBody: document.getElementById("directoryBody"),
  loginButton: document.getElementById("loginButton"),
  friendsButton: document.getElementById("friendsButton"),
  shareButton: document.getElementById("shareButton"),
  mobilePlayTab: document.getElementById("mobilePlayTab"),
  mobileHubTab: document.getElementById("mobileHubTab"),
  authPanel: document.getElementById("authPanel"),
  friendsPanel: document.getElementById("friendsPanel"),
  friendsStatus: document.getElementById("friendsStatus"),
  friendsContent: document.getElementById("friendsContent"),
  refreshFriends: document.getElementById("refreshFriends"),
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
  onlineInviteActions: document.getElementById("onlineInviteActions"),
  copyInviteLink: document.getElementById("copyInviteLink"),
  shareInviteLink: document.getElementById("shareInviteLink"),
  toggleChat: document.getElementById("toggleChat"),
  chatUnreadBadge: document.getElementById("chatUnreadBadge"),
  chatPanel: document.getElementById("chatPanel"),
  chatMessages: document.getElementById("chatMessages"),
  chatInput: document.getElementById("chatInput"),
  sendChatMessage: document.getElementById("sendChatMessage"),
  muteChat: document.getElementById("muteChat"),
  closeChat: document.getElementById("closeChat"),
  achievementText: document.getElementById("achievementText"),
  rankText: document.getElementById("rankText"),
  progressBar: document.getElementById("progressBar"),
  quizLayout: document.getElementById("quizLayout"),
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
  sendFriendRequest: document.getElementById("sendFriendRequest"),
  rematchStatus: document.getElementById("rematchStatus"),
};

const PLAYER_POOL_LABELS = {
  all: "All Players",
  rotation: "Rotation Players",
  starter: "Starters",
  bench: "Bench Players",
};

const FRIENDS_CACHE_KEY = "courtvision-web-friends-cache";

let mobileHomeTab = "play";
const mobileHomeSections = {
  quizSetup: true,
  matchType: false,
  directory: false,
};
let homeSetupStep = "quiz";

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
    soloMode: false,
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

function enforceArenaBlueTheme() {
  if (els.theme) {
    els.theme.value = "Arena Blue";
  }
  applyTheme("Arena Blue");
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

function getCachedAuthProfile() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_PROFILE_CACHE_KEY) || "null");
  } catch (_error) {
    return null;
  }
}

function getCachedFriendsSummary() {
  try {
    return JSON.parse(localStorage.getItem(FRIENDS_CACHE_KEY) || "null");
  } catch (_error) {
    return null;
  }
}

function persistCachedAuthProfile() {
  if (!state.auth.user?.sub) return;
  localStorage.setItem(
    AUTH_PROFILE_CACHE_KEY,
    JSON.stringify({
      sub: state.auth.user.sub,
      profile: state.profile,
      rankedProfile: state.online.rankedProfile,
      savedAt: Date.now(),
    })
  );
}

function persistCachedFriendsSummary() {
  if (!state.auth.user?.sub) return;
  localStorage.setItem(
    FRIENDS_CACHE_KEY,
    JSON.stringify({
      sub: state.auth.user.sub,
      friendCode: state.friends.friendCode,
      friends: state.friends.friends,
      incomingRequests: state.friends.incomingRequests,
      outgoingRequests: state.friends.outgoingRequests,
      savedAt: Date.now(),
    })
  );
}

function clearCachedAuthProfile() {
  localStorage.removeItem(AUTH_PROFILE_CACHE_KEY);
}

function clearCachedFriendsSummary() {
  localStorage.removeItem(FRIENDS_CACHE_KEY);
}

function clearAuthState() {
  state.auth.token = "";
  state.auth.user = null;
  persistAuthState();
  clearCachedAuthProfile();
  clearCachedFriendsSummary();
}

function handleExpiredAuthSession() {
  const now = Date.now();
  if (now - (state.auth.lastExpiryNoticeAt || 0) < 3000) {
    return;
  }
  state.auth.lastExpiryNoticeAt = now;
  clearAuthState();
  state.online.rankedProfile = null;
  state.friends.friends = [];
  state.friends.incomingRequests = [];
  state.friends.outgoingRequests = [];
  state.friends.friendCode = "";
  renderAuthPanel();
  renderFriendsPanel();
  updateProfileSummary();
  showToast("Your login expired. Please sign in again.");
}

function hydrateCachedAuthenticatedState() {
  const cached = getCachedAuthProfile();
  if (!cached || !state.auth.user?.sub || cached.sub !== state.auth.user.sub) return;
  if (cached.profile) {
    state.profile = {
      ...state.profile,
      ...cached.profile,
      usernameLocked: Boolean(cached.profile.usernameLocked),
    };
    if (state.profile.username) {
      els.username.value = state.profile.username;
    }
  }
  if (cached.rankedProfile) {
    state.online.rankedProfile = cached.rankedProfile;
  }
  updateProfileSummary();
}

function hydrateCachedFriendsSummary() {
  const cached = getCachedFriendsSummary();
  if (!cached || !state.auth.user?.sub || cached.sub !== state.auth.user.sub) return;
  state.friends.friendCode = cached.friendCode || "";
  state.friends.friends = Array.isArray(cached.friends) ? cached.friends : [];
  state.friends.incomingRequests = Array.isArray(cached.incomingRequests) ? cached.incomingRequests : [];
  state.friends.outgoingRequests = Array.isArray(cached.outgoingRequests) ? cached.outgoingRequests : [];
  state.friends.loaded = true;
  renderFriendsPanel();
}

function refreshSignedInData(options = {}) {
  const { loadFriends = false } = options;
  if (!state.auth.token) return Promise.resolve();

  const tasks = [
    loadAuthenticatedProfile(),
    loadRankedProfile(),
  ];

  if (loadFriends && isGoogleUsernameLocked()) {
    tasks.push(loadFriendsSummary().catch(() => {}));
  }

  return Promise.allSettled(tasks).then(() => {
    renderAuthPanel();
    renderFriendsPanel();
    updateProfileSummary();
    persistAuthState();
  });
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
  if (els.directoryOutput) {
    els.directoryOutput.insertAdjacentElement("beforebegin", card);
  } else if (els.profileSummary?.parentElement) {
    els.profileSummary.parentElement.appendChild(card);
  }
  return card;
}

function removeAnalyticsCard() {
  const card = document.getElementById("analyticsOutput");
  if (card) {
    card.remove();
  }
}

function renderMobileHomeTabs() {
  const playPanel = document.querySelector(".home-panel-play");
  const hubPanel = document.querySelector(".home-panel-hub");

  if (!playPanel || !hubPanel || !els.mobilePlayTab || !els.mobileHubTab) return;

  playPanel.classList.remove("hidden-mobile-panel");
  hubPanel.classList.remove("hidden-mobile-panel");
  els.mobilePlayTab.classList.add("is-active");
  els.mobileHubTab.classList.remove("is-active");
}

function setMobileHomeTab(tabName) {
  mobileHomeTab = tabName === "hub" ? "hub" : "play";
  renderMobileHomeTabs();
}

function renderHomeSetupStep() {
  if (!els.quizSetupStep || !els.matchTypeStep) return;
  const onMatchStep = homeSetupStep === "match";
  els.quizSetupStep.classList.toggle("hidden", onMatchStep);
  els.matchTypeStep.classList.toggle("hidden", !onMatchStep);
}

function goToHomeSetupStep(stepName) {
  homeSetupStep = stepName === "match" ? "match" : "quiz";
  renderHomeSetupStep();
}

function isMobileHomeViewport() {
  return typeof window !== "undefined" && window.innerWidth <= 760;
}

function renderMobileSectionToggle(button, body, isOpen) {
  if (!button || !body) return;
  const mobile = isMobileHomeViewport();
  button.classList.toggle("hidden", !mobile);
  if (!mobile) {
    body.classList.remove("hidden-mobile-section");
    button.textContent = "Hide";
    button.setAttribute("aria-expanded", "true");
    return;
  }
  body.classList.toggle("hidden-mobile-section", !isOpen);
  button.textContent = isOpen ? "Hide" : "Show";
  button.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function renderMobileHomeSections() {
  renderMobileSectionToggle(els.toggleQuizSetup, els.quizSetupBody, mobileHomeSections.quizSetup);
  renderMobileSectionToggle(els.toggleMatchType, els.matchTypeBody, mobileHomeSections.matchType);
  renderMobileSectionToggle(els.toggleDirectory, els.directoryBody, mobileHomeSections.directory);
}

function toggleMobileHomeSection(sectionName) {
  if (!(sectionName in mobileHomeSections)) return;
  if (!isMobileHomeViewport()) return;
  mobileHomeSections[sectionName] = !mobileHomeSections[sectionName];
  renderMobileHomeSections();
}

function isGoogleUsernameLocked() {
  return Boolean(state.auth.user?.username_locked);
}

function canChangeGoogleUsernameOnce() {
  return Boolean(state.auth.user?.username_change_available);
}

function getGoogleDisplayName() {
  return state.auth.user?.google_name || state.auth.user?.name || "Account";
}

function getLockedUsername() {
  return (state.auth.user?.username || state.profile.username || "").trim();
}

function ensureLockedGoogleAccount(actionLabel = "use this feature") {
  if (!state.auth.token) {
    throw new Error("Sign in with Google first.");
  }
  if (!isGoogleUsernameLocked()) {
    throw new Error(`Choose and save your Court Vision username first to ${actionLabel}.`);
  }
}

function renderAuthPanel() {
  const signedIn = Boolean(state.auth.user && state.auth.token);
  els.authPanel?.classList.toggle("hidden", !state.auth.panelOpen);
  if (state.auth.panelOpen) {
    state.friends.panelOpen = false;
  }
  els.authSignedOut?.classList.toggle("hidden", signedIn);
  els.authSignedIn?.classList.toggle("hidden", !signedIn);
  els.profileSettingsCard?.classList.toggle("hidden", !signedIn);
  if (els.username) {
    const usernameLocked = signedIn && isGoogleUsernameLocked();
    const canRename = signedIn && canChangeGoogleUsernameOnce();
    els.username.readOnly = usernameLocked && !canRename;
    els.username.title = usernameLocked && !canRename
      ? "This username is locked to your signed-in Google account."
      : canRename
      ? "You can change this Google account username one time. Save profile to lock the new name."
      : signedIn
      ? "Choose your Court Vision username, then save profile to lock it in."
      : "";
  }

  if (signedIn) {
    const usernameLocked = isGoogleUsernameLocked();
    const canRename = canChangeGoogleUsernameOnce();
    const lockedUsername = getLockedUsername();
    els.loginButton.textContent = usernameLocked ? lockedUsername : "Account";
    els.authUserName.textContent = usernameLocked ? lockedUsername : getGoogleDisplayName();
    els.authUserEmail.textContent = usernameLocked && !canRename
      ? state.auth.user.email || ""
      : canRename
      ? "You can rename this Google-backed account one time. Enter the new username on the left, then save profile."
      : "Choose a username in the field on the left, then press Save Profile to lock it in.";
    if (state.auth.user.picture) {
      els.authUserPicture.src = state.auth.user.picture;
      els.authUserPicture.classList.remove("hidden");
    } else {
      els.authUserPicture.classList.add("hidden");
    }
  } else {
    els.loginButton.textContent = "Profile";
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
    if (payload.user?.username_locked && payload.user?.username) {
      els.username.value = payload.user.username;
      state.profile.username = payload.user.username;
    } else if (!els.username.value.trim() || ["guest", payload.user?.google_name?.toLowerCase?.() || ""].includes(els.username.value.trim().toLowerCase())) {
      els.username.value = "";
      state.profile.username = "";
    }
    state.friends.friendCode = payload.user?.friend_code || "";
    state.auth.panelOpen = false;
    renderAuthPanel();
    renderFriendsPanel();
    updateProfileSummary();
    refreshSignedInData({ loadFriends: false });
    showToast(payload.user?.username_locked ? "Signed in with Google." : "Signed in. Choose a username and save profile to lock it in.");
  } catch (error) {
    if (els.authStatus) {
      els.authStatus.textContent = error?.message || "Google sign-in failed.";
    }
    showToast(error?.message || "Google sign-in failed.");
  }
}

function getFriendOnlineLabel(friend) {
  return friend?.online ? "Online" : "Offline";
}

function renderFriendsPanel() {
  if (!els.friendsPanel || !els.friendsContent || !els.friendsStatus) return;
  const signedIn = Boolean(state.auth.user && state.auth.token);
  els.friendsPanel.classList.toggle("hidden", !state.friends.panelOpen);
  if (state.friends.panelOpen) {
    state.auth.panelOpen = false;
  }
  if (!signedIn) {
    els.friendsStatus.textContent = "Sign in to build your friends list.";
    els.friendsContent.innerHTML = '<div class="leaderboard-empty">Friends, requests, and direct 1v1 challenges are available for signed-in players.</div>';
    return;
  }

  const incoming = state.friends.incomingRequests || [];
  const outgoing = state.friends.outgoingRequests || [];
  const friends = state.friends.friends || [];
  els.friendsStatus.textContent = `${friends.length} friend${friends.length === 1 ? "" : "s"} • ${friends.filter((friend) => friend.online).length} online`;
  const friendCode = state.friends.friendCode || "";

  const incomingHtml = incoming.length
    ? `
      <div class="friends-section">
        <p class="eyebrow">Incoming Requests</p>
        <div class="friends-list">
          ${incoming
            .map(
              (request) => `
                <div class="friend-row request-row">
                  <div>
                    <strong>${escapeHtml(request.username)}</strong>
                    <div class="leaderboard-meta">${escapeHtml(formatDateShort(request.created_at * 1000))}</div>
                  </div>
                  <div class="friend-actions">
                    <button class="secondary-button compact-button friend-respond-button" data-request-id="${request.id}" data-action="accept">Accept</button>
                    <button class="secondary-button compact-button friend-respond-button" data-request-id="${request.id}" data-action="decline">Decline</button>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `
    : "";

  const outgoingHtml = outgoing.length
    ? `
      <div class="friends-section">
        <p class="eyebrow">Sent Requests</p>
        <div class="friends-list">
          ${outgoing
            .map(
              (request) => `
                <div class="friend-row request-row">
                  <div>
                    <strong>${escapeHtml(request.username)}</strong>
                    <div class="leaderboard-meta">Pending</div>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `
    : "";

  const friendsHtml = friends.length
    ? friends
        .map(
          (friend) => `
            <div class="friend-row">
              <div class="friend-main">
                ${friend.picture ? `<img src="${escapeHtml(friend.picture)}" alt="${escapeHtml(friend.username)}" class="friend-avatar" />` : '<div class="friend-avatar friend-avatar-fallback">CV</div>'}
                <div>
                  <div class="friend-name-row">
                    <strong>${escapeHtml(friend.username)}</strong>
                    <span class="friend-status ${friend.online ? "is-online" : "is-offline"}">${escapeHtml(getFriendOnlineLabel(friend))}</span>
                  </div>
                  <div class="leaderboard-meta">${escapeHtml(friend.rank || "Unranked")} • ${friend.xp || 0} XP • Best ${friend.best_score || 0}</div>
                  <div class="leaderboard-meta">Ranked: ${escapeHtml(friend.ranked?.division || "Unranked")} • ${friend.ranked?.elo ?? 0} Elo • ${friend.ranked?.wins ?? 0}-${friend.ranked?.losses ?? 0}</div>
                  ${
                    friend.incoming_challenge
                      ? `<div class="friend-challenge-banner">Challenge waiting: code ${escapeHtml(friend.incoming_challenge.room_code)}</div>`
                      : ""
                  }
                </div>
              </div>
              <div class="friend-actions">
                ${
                  friend.incoming_challenge
                    ? `<button class="secondary-button compact-button join-friend-challenge" data-room-code="${escapeHtml(friend.incoming_challenge.room_code)}">Join Challenge</button>`
                    : ""
                }
                <button class="secondary-button compact-button challenge-friend-button" data-username="${escapeHtml(friend.username)}" ${friend.online ? "" : "disabled"}>Challenge</button>
              </div>
            </div>
          `
        )
        .join("")
    : '<div class="leaderboard-empty">No friends yet. Finish a private match and add someone, or accept a request here.</div>';

  els.friendsContent.innerHTML = `
    <div class="friends-section">
      <p class="eyebrow">Friend Code</p>
      <div class="friend-code-card">
        <div>
          <strong class="friend-code-value">${escapeHtml(friendCode || "Loading...")}</strong>
          <div class="leaderboard-meta">Share this code so someone can send you a friend request.</div>
        </div>
        <button class="secondary-button compact-button" id="copyFriendCode" ${friendCode ? "" : "disabled"}>Copy</button>
      </div>
      <div class="admin-cleanup-row">
        <input id="friendCodeInput" placeholder="Enter friend code" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" />
        <button id="sendFriendCodeRequest" class="secondary-button">Add Friend</button>
      </div>
    </div>
    ${incomingHtml}
    ${outgoingHtml}
    <div class="friends-section">
      <p class="eyebrow">Friends List</p>
      <div class="friends-list">${friendsHtml}</div>
    </div>
  `;

  els.friendsContent.querySelectorAll(".friend-respond-button").forEach((button) => {
    button.addEventListener("click", async () => {
      const requestId = Number(button.getAttribute("data-request-id") || 0);
      const action = button.getAttribute("data-action") || "decline";
      try {
        await fetchJson("/friends/respond", {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ request_id: requestId, action }),
        });
        await loadFriendsSummary(true);
        showToast(action === "accept" ? "Friend request accepted." : "Friend request declined.");
      } catch (error) {
        showToast(error?.message || "Could not update that friend request.");
      }
    });
  });

  document.getElementById("copyFriendCode")?.addEventListener("click", () => {
    if (!friendCode) return;
    copyText(friendCode)
      .then(() => showToast("Friend code copied."))
      .catch(() => showToast("Could not copy friend code."));
  });

  document.getElementById("sendFriendCodeRequest")?.addEventListener("click", async () => {
    const codeInput = document.getElementById("friendCodeInput");
    const rawCode = String(codeInput?.value || "").trim().toUpperCase();
    if (!rawCode) {
      showToast("Enter a friend code.");
      return;
    }
    try {
      await fetchJson("/friends/request-by-code", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ friend_code: rawCode }),
      });
      if (codeInput) codeInput.value = "";
      await loadFriendsSummary().catch(() => {});
      showToast("Friend request sent.");
    } catch (error) {
      showToast(error?.message || "Could not send friend request.");
    }
  });

  els.friendsContent.querySelectorAll(".challenge-friend-button").forEach((button) => {
    button.addEventListener("click", () => {
      const username = button.getAttribute("data-username") || "";
      challengeFriend(username).catch((error) => showToast(error?.message || "Could not challenge that friend."));
    });
  });

  els.friendsContent.querySelectorAll(".join-friend-challenge").forEach((button) => {
    button.addEventListener("click", () => {
      const roomCode = button.getAttribute("data-room-code") || "";
      if (!roomCode) return;
      els.onlineMode.checked = true;
      els.onlineAction.value = "join";
      els.onlineCode.value = roomCode;
      syncModeFields();
      toggleOnlineFields();
      startOnlineMatch().catch((error) => showToast(error?.message || "Could not join that challenge."));
    });
  });
}

async function loadFriendsSummary(showFeedback = false) {
  if (!state.auth.token) {
    state.friends.friends = [];
    state.friends.incomingRequests = [];
    state.friends.outgoingRequests = [];
    state.friends.loaded = false;
    renderFriendsPanel();
    return;
  }
  ensureLockedGoogleAccount("use friends");
  const payload = await fetchJson("/friends", {
    headers: getAuthHeaders(),
  });
  state.friends.friendCode = payload.friend_code || state.auth.user?.friend_code || "";
  state.friends.friends = payload.friends || [];
  state.friends.incomingRequests = payload.incoming_requests || [];
  state.friends.outgoingRequests = payload.outgoing_requests || [];
  state.friends.loaded = true;
  persistCachedFriendsSummary();
  renderFriendsPanel();
  if (showFeedback) {
    showToast("Friends refreshed.");
  }
}

async function sendFriendRequestTo(username) {
  ensureLockedGoogleAccount("add friends");
  await fetchJson("/friends/request", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ target_username: username }),
  });
  await loadFriendsSummary().catch(() => {});
}

async function challengeFriend(username) {
  ensureLockedGoogleAccount("challenge friends");
  els.onlineMode.checked = true;
  els.twoPlayerMode.checked = false;
  els.rankedMode.checked = false;
  els.onlineAction.value = "create";
  syncModeFields();
  const roomPayload = await fetchJson("/online-match/create", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      username: els.username.value.trim() || state.profile.username || "Host",
      room_code: null,
      count: getRequestedQuestionCount(),
      conference: els.conferenceFilter.value,
      player_pool: els.playerPool.value,
      answer_mode: els.answerMode.value,
      show_headshots: els.showHeadshots.checked,
    }),
  });
  resetOnlineState();
  await fetchJson("/friends/challenge", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      target_username: username,
      room_code: roomPayload.room_code,
    }),
  });
  state.friends.panelOpen = false;
  renderFriendsPanel();
  state.online.enabled = true;
  state.online.action = "create";
  state.online.playerName = roomPayload.player_name;
  state.online.playerAuthId = roomPayload.player_auth_id || "";
  state.mode = "Online 1v1";
  state.answerMode = roomPayload.answer_mode || els.answerMode.value;
  state.twoPlayer = false;
  state.daily = false;
  state.online.roomCode = roomPayload.room_code;
  state.online.inviteUrl = getPrivateMatchLink(roomPayload.room_code);
  applyOnlineMatchSettings(roomPayload);
  switchScreen(screens.quiz);
  renderOnlineWaiting();
  startTimer();
  attachOnlineSocket(roomPayload.room_code, state.online.playerName);
  showToast(`Challenge sent to ${username}.`);
}

async function restoreAuthenticatedUser() {
  if (!state.auth.token) return;
  try {
    const payload = await fetchJson("/auth/me", {
      headers: getAuthHeaders(),
    });
    state.auth.user = payload.user;
    if (payload.user?.username_locked && payload.user?.username) {
      els.username.value = payload.user.username;
      state.profile.username = payload.user.username;
    } else if ((els.username.value || "").trim().toLowerCase() === "guest") {
      els.username.value = "";
      state.profile.username = "";
    }
    state.friends.friendCode = payload.user?.friend_code || "";
    persistAuthState();
    renderAuthPanel();
    renderFriendsPanel();
    updateProfileSummary();
    refreshSignedInData({ loadFriends: false });
  } catch (error) {
    if (error?.status === 401) {
      clearAuthState();
      state.online.rankedProfile = null;
      state.friends.friends = [];
      state.friends.incomingRequests = [];
      state.friends.outgoingRequests = [];
      state.friends.friendCode = "";
    } else {
      renderAuthPanel();
      updateProfileSummary();
    }
  }
}

function applyProfilePayload(profile) {
  if (!profile) return;
  const settings = profile.settings || {};
  const progress = getProfileProgress(profile);
  const usernameLocked = Boolean(profile.username_locked || state.auth.user?.username_locked);
  let resolvedUsername = (profile.username || "").trim();
  if (!resolvedUsername && usernameLocked) {
    resolvedUsername = getLockedUsername();
  } else if (!resolvedUsername && state.auth.token) {
    const currentValue = (els.username.value || state.profile.username || "").trim();
    resolvedUsername = currentValue.toLowerCase() === "guest" ? "" : currentValue;
  } else if (!resolvedUsername) {
    resolvedUsername = state.profile.username || "Guest";
  }

  state.profile = {
    username: resolvedUsername,
    theme: "Arena Blue",
    xp: progress.xp,
    rank: getRankFromXp(progress.xp || 0),
    achievements: progress.achievements || [],
    gamesPlayed: progress.gamesPlayed || 0,
    bestScore: progress.bestScore || 0,
    onlineWins: progress.onlineWins || 0,
    rankHistory: progress.rankHistory || [],
    highestRankIndex: progress.highestRankIndex ?? getRankInfoFromXp(progress.xp || 0).rankIndex,
    seasonTag: progress.seasonTag || getCurrentSeasonTag(),
    usernameLocked,
    usernameChangeAvailable: Boolean(profile.username_change_available || state.auth.user?.username_change_available),
  };

  if (profile.auth_id && state.auth.user?.sub && profile.auth_id === `google:${state.auth.user.sub}`) {
    state.profile.authId = profile.auth_id;
  }

  if (state.auth.user) {
    state.auth.user.username = usernameLocked ? resolvedUsername : "";
    state.auth.user.username_locked = usernameLocked;
    state.auth.user.username_change_available = Boolean(
      profile.username_change_available ?? state.auth.user.username_change_available
    );
  }

  els.username.value = state.profile.username;
  els.theme.value = "Arena Blue";
  els.gameMode.value = settings.mode === "Practice" ? settings.mode : els.gameMode.value;
  els.questionCount.value = settings.questionCount || els.questionCount.value;
  els.conferenceFilter.value = settings.conferenceFilter || els.conferenceFilter.value;
  els.playerPool.value = settings.playerPool || els.playerPool.value;
  els.answerMode.value = settings.answerMode || els.answerMode.value;
  els.showHeadshots.checked = settings.showHeadshots !== false;
  els.soloMode.checked = Boolean(settings.soloMode);
  els.twoPlayerMode.checked = Boolean(settings.twoPlayerMode);
  els.onlineMode.checked = Boolean(settings.onlineMode);
  els.rankedMode.checked = Boolean(settings.rankedMode);
  els.playerOneName.value = settings.playerOneName || els.playerOneName.value;
  els.playerTwoName.value = settings.playerTwoName || els.playerTwoName.value;
  syncModeFields();
  enforceArenaBlueTheme();
  saveLocalSettings();
  saveLocalProgress();
  updateProfileSummary();
  if (state.auth.token && state.auth.user?.sub) {
    persistCachedAuthProfile();
  }
  populateProfileSettingsForm();
}

async function loadAuthenticatedProfile() {
  if (!state.auth.token) return;
  try {
    const payload = await fetchJson("/auth/profile", {
      headers: getAuthHeaders(),
    });
    if (!payload.profile?.has_saved_profile) {
      if (state.auth.user) {
        state.auth.user.username = payload.profile?.username || "";
        state.auth.user.username_locked = Boolean(payload.profile?.username_locked);
      }
      renderAuthPanel();
      return;
    }
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
    persistCachedAuthProfile();
  } catch (error) {
    if (error?.status === 401) {
      state.online.rankedProfile = null;
      clearCachedAuthProfile();
    }
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

function formatNumberCompact(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function getRankTimelineItems() {
  return BASE_RANKS.map((baseRank, index) => ({
    label: `${baseRank} III`,
    xp: BASE_RANK_THRESHOLDS[index],
  }));
}

function renderRankTimelineTooltip() {
  return `
    <div class="rank-info">
      <button
        class="rank-info-trigger"
        type="button"
        aria-label="Show rank XP requirements"
        title="Show rank XP requirements"
      >i</button>
      <div class="rank-info-tooltip" role="tooltip">
        <div class="rank-info-tooltip-title">Rank Timeline</div>
        <div class="rank-info-tooltip-subtitle">Season XP needed to reach each rank tier.</div>
        <div class="rank-timeline">
          ${getRankTimelineItems()
            .map(
              (item) => `
                <div class="rank-timeline-row">
                  <span class="rank-timeline-dot"></span>
                  <div class="rank-timeline-copy">
                    <strong>${escapeHtml(item.label)}</strong>
                    <span>${formatNumberCompact(item.xp)} XP</span>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
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
    theme: "Arena Blue",
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
  els.theme.value = "Arena Blue";
  els.gameMode.value = savedSettings.gameMode || "Practice";
  if (!["Practice"].includes(els.gameMode.value)) {
    els.gameMode.value = "Practice";
  }
  els.questionCount.value = savedSettings.questionCount || "25";
  els.playerPool.value = savedSettings.playerPool || "all";
  els.answerMode.value = savedSettings.answerMode || "typed";
  els.showHeadshots.checked = savedSettings.showHeadshots !== false;
  els.soloMode.checked = Boolean(savedSettings.soloMode);
  els.twoPlayerMode.checked = Boolean(savedSettings.twoPlayerMode);
  els.onlineMode.checked = Boolean(savedSettings.onlineMode);
  els.rankedMode.checked = Boolean(savedSettings.rankedMode);
  els.onlineAction.value = savedSettings.onlineAction || "create";
  els.onlineCode.value = savedSettings.onlineCode || "";
  els.playerOneName.value = savedSettings.playerOneName || "Player 1";
  els.playerTwoName.value = savedSettings.playerTwoName || "Player 2";
  els.dailyMode.checked = false;
  applyJoinLinkFromUrl();
  syncModeFields();
}

function saveLocalSettings() {
  const payload = {
    username: els.username.value.trim() || "Guest",
    theme: "Arena Blue",
    gameMode: els.gameMode.value,
    questionCount: els.questionCount.value,
    conferenceFilter: els.conferenceFilter.value,
    playerPool: els.playerPool.value,
    answerMode: els.answerMode.value,
    showHeadshots: els.showHeadshots.checked,
    soloMode: els.soloMode.checked,
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
  if (state.auth.token && state.auth.user?.sub) {
    persistCachedAuthProfile();
  }
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
    if (response.status === 401 && requestHeaders.Authorization) {
      handleExpiredAuthSession();
    }
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function switchScreen(target) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  target.classList.add("active");
  window.scrollTo(0, 0);
}

function getPrivateMatchLink(roomCode) {
  const url = new URL(window.location.href);
  url.searchParams.set("join", roomCode);
  return url.toString();
}

function applyJoinLinkFromUrl() {
  if (typeof window === "undefined" || !window.location) return;
  const params = new URLSearchParams(window.location.search);
  const joinCode = (params.get("join") || "").trim().toUpperCase();
  if (!joinCode) return;

  state.invite.joinCode = joinCode;
  state.invite.autoJoinAttempted = false;

  els.onlineMode.checked = true;
  els.twoPlayerMode.checked = false;
  els.rankedMode.checked = false;
  els.onlineAction.value = "join";
  els.onlineCode.value = joinCode;
  syncModeFields();
  toggleOnlineFields();
  els.onlineStatus.textContent = `Invite link loaded. Join match ${joinCode} when you're ready.`;
}

function clearJoinLinkFromUrl() {
  if (typeof window === "undefined" || !window.location || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  url.searchParams.delete("join");
  window.history.replaceState({}, "", url.toString());
}

function getInviteMessage() {
  const roomCode = state.online.roomCode || "----";
  return `Join my Court Vision game: ${state.online.inviteUrl}\nCode: ${roomCode}`;
}

async function shareInviteLink() {
  if (!state.online.inviteUrl) {
    showToast("Invite link is not ready yet.");
    return;
  }

  try {
    if (navigator.share) {
      await navigator.share({
        title: "Join Game",
        text: getInviteMessage(),
        url: state.online.inviteUrl,
      });
    } else {
      await copyText(getInviteMessage());
    }
    showToast("Invite link ready to send.");
  } catch (_error) {
    showToast("Could not share the invite link.");
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const temp = document.createElement("input");
  temp.value = text;
  document.body.appendChild(temp);
  temp.select();
  document.execCommand("copy");
  temp.remove();
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

function formatChatTime(timestampSeconds) {
  const date = new Date(Number(timestampSeconds || 0) * 1000 || Date.now());
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function createChatMessageId() {
  return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function shouldStickChatToBottom() {
  if (!els.chatMessages) return false;
  const threshold = 32;
  return els.chatMessages.scrollHeight - els.chatMessages.scrollTop - els.chatMessages.clientHeight <= threshold;
}

function createChatMessageMarkup(message) {
  const own = message.sender === state.online.playerName;
  return `
    <div class="chat-message ${own ? "own-message" : ""}" data-chat-message-id="${escapeHtml(message.id || "")}">
      <div class="chat-message-header">
        <strong>${escapeHtml(own ? "You" : message.sender || "Opponent")}</strong>
        <span>${escapeHtml(formatChatTime(message.created_at))}</span>
      </div>
      <div class="chat-message-text">${escapeHtml(message.text || "")}</div>
    </div>
  `;
}

function renderChatMessages(force = false) {
  if (!els.chatMessages) return;

  const messages = state.online.chatMessages || [];
  const renderedCount = Number(els.chatMessages.dataset.renderedCount || 0);
  const shouldAutoScroll = shouldStickChatToBottom();

  if (!messages.length) {
    if (force || renderedCount !== 0) {
      els.chatMessages.innerHTML = '<div class="chat-empty">Messages from your opponent will show up here.</div>';
      els.chatMessages.dataset.renderedCount = "0";
    }
    return;
  }

  if (force || renderedCount > messages.length) {
    els.chatMessages.innerHTML = messages.map(createChatMessageMarkup).join("");
    els.chatMessages.dataset.renderedCount = String(messages.length);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    return;
  }

  if (renderedCount === 0) {
    els.chatMessages.innerHTML = "";
  }

  if (renderedCount < messages.length) {
    const fragment = document.createDocumentFragment();
    messages.slice(renderedCount).forEach((message) => {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = createChatMessageMarkup(message).trim();
      if (wrapper.firstElementChild) {
        fragment.appendChild(wrapper.firstElementChild);
      }
    });
    els.chatMessages.appendChild(fragment);
    els.chatMessages.dataset.renderedCount = String(messages.length);
  }

  if (shouldAutoScroll || state.online.chatOpen) {
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }
}

function renderChatPanel() {
  if (!els.chatPanel || !els.chatMessages || !els.muteChat || !els.quizLayout) return;

  const chatAvailable = state.online.enabled && !state.online.ranked;
  els.toggleChat?.classList.toggle("hidden", !chatAvailable);
  els.chatPanel.classList.toggle("hidden", !chatAvailable || !state.online.chatOpen);
  els.quizLayout.classList.toggle("online-private-layout", chatAvailable);
  els.quizLayout.classList.toggle("private-chat-open", chatAvailable && state.online.chatOpen);
  els.muteChat.textContent = state.online.chatMuted ? "Unmute" : "Mute";

  if (!chatAvailable) {
    return;
  }

  renderChatMessages();
}

function updateChatBadge() {
  if (!els.chatUnreadBadge || !els.toggleChat) return;
  const chatAvailable = state.online.enabled && !state.online.ranked;
  els.toggleChat.classList.toggle("hidden", !chatAvailable);
  const count = state.online.unreadCount || 0;
  els.chatUnreadBadge.textContent = String(count);
  els.chatUnreadBadge.classList.toggle("hidden", !chatAvailable || count <= 0);
}

function openChatPanel() {
  state.online.chatOpen = true;
  state.online.unreadCount = 0;
  updateChatBadge();
  renderChatPanel();
  els.chatInput?.focus();
}

function closeChatPanel() {
  state.online.chatOpen = false;
  renderChatPanel();
}

function handleIncomingChatMessage(message) {
  if (!message) return;
  if (
    message.id &&
    state.online.chatMessages.some((existing) => existing && existing.id && existing.id === message.id)
  ) {
    return;
  }
  state.online.chatMessages.push(message);
  state.online.chatMessages = state.online.chatMessages.slice(-100);
  const fromOpponent = message.sender && message.sender !== state.online.playerName;
  if (fromOpponent && !state.online.chatOpen) {
    state.online.unreadCount += 1;
  }
  updateChatBadge();
  renderChatMessages();
  if (fromOpponent && !state.online.chatMuted) {
    showToast(`New message from ${message.sender}.`);
  }
}

function sendChatMessage() {
  const text = (els.chatInput?.value || "").trim();
  if (!text) return;
  if (!state.online.socket || state.online.socket.readyState !== WebSocket.OPEN) {
    showToast("Chat is not connected yet.");
    return;
  }
  const clientMessageId = createChatMessageId();
  handleIncomingChatMessage({
    id: clientMessageId,
    sender: state.online.playerName || state.profile.username,
    text,
    created_at: Math.floor(Date.now() / 1000),
  });
  state.online.socket.send(JSON.stringify({ type: "chat_message", text, client_message_id: clientMessageId }));
  els.chatInput.value = "";
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
  if (!els.dailyOutput) return;
  const rankInfo = getRankInfoFromXp(state.profile.xp);

  els.dailyOutput.innerHTML = `
    <div class="daily-header">
      <div>
        <p class="eyebrow">Ranked Progress</p>
        <div class="daily-status">Your current ladder standing.</div>
      </div>
      <div class="profile-rank-badge">${escapeHtml(rankInfo.label)}</div>
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
    <div class="admin-section">
      <div class="leaderboard-header">
        <div>
          <p class="eyebrow">Live Match Monitor</p>
          <div class="daily-status">See private rooms, ranked games, and queue activity in real time.</div>
        </div>
      </div>
      <div id="adminLiveMonitor" class="admin-profile-list">
        <div class="leaderboard-empty">Load live match data.</div>
      </div>
    </div>
    <div class="admin-section">
      <div class="leaderboard-header">
        <div>
          <p class="eyebrow">User Lookup</p>
          <div class="daily-status">Search a player account, inspect progress, and reset ranked if needed.</div>
        </div>
      </div>
      <div class="admin-cleanup-row">
        <input id="adminUserLookup" placeholder="Search username" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" />
        <button id="adminLookupButton" class="secondary-button">Search</button>
      </div>
      <div id="adminUserResults" class="admin-profile-list">
        <div class="leaderboard-empty">Search for a user to inspect their account.</div>
      </div>
    </div>
    <div class="hero-actions">
      <button id="refreshAnalytics">Refresh Analytics</button>
      <button id="refreshAdminProfiles" class="secondary-button">Refresh Admin List</button>
      <button id="refreshAdminLive" class="secondary-button">Refresh Live</button>
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
  document.getElementById("refreshAdminLive")?.addEventListener("click", () => {
    Promise.all([loadAdminLiveMonitor(), loadAdminUserLookup()])
      .then(() => showToast("Admin monitor refreshed."))
      .catch((error) => showToast(error?.message || "Could not refresh admin monitor."));
  });
  document.getElementById("adminLookupButton")?.addEventListener("click", () => {
    loadAdminUserLookup(document.getElementById("adminUserLookup")?.value || "")
      .catch((error) => showToast(error?.message || "Could not search users."));
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
  renderAdminLive(state.admin.liveSummary || null);
  renderAdminUsers(state.admin.userResults || []);
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

function renderAdminLive(payload) {
  state.admin.liveSummary = payload || null;
  const container = document.getElementById("adminLiveMonitor");
  if (!container) return;
  if (!payload) {
    container.innerHTML = '<div class="leaderboard-empty">Load live match data.</div>';
    return;
  }
  const online = payload.online_matches || [];
  const ranked = payload.ranked_matches || [];
  const queue = payload.ranked_queue || [];
  container.innerHTML = `
    <div class="admin-profile-row">
      <div>
        <span class="leaderboard-name">Private Matches</span>
        <div class="leaderboard-meta">${online.length} active</div>
      </div>
    </div>
    ${online.length ? online.map((room) => `
      <div class="admin-profile-row">
        <div>
          <span class="leaderboard-name">Code ${escapeHtml(room.room_code)}</span>
          <div class="leaderboard-meta">${escapeHtml((room.players || []).join(" vs "))} • ${room.started ? "live" : "waiting"} • Q${room.current_index}/${room.total_questions}</div>
        </div>
      </div>
    `).join("") : '<div class="leaderboard-empty">No active private matches.</div>'}
    <div class="admin-profile-row">
      <div>
        <span class="leaderboard-name">Ranked Matches</span>
        <div class="leaderboard-meta">${ranked.length} live • ${queue.length} in queue</div>
      </div>
    </div>
    ${ranked.length ? ranked.map((match) => `
      <div class="admin-profile-row">
        <div>
          <span class="leaderboard-name">${escapeHtml((match.players || []).join(" vs "))}</span>
          <div class="leaderboard-meta">Q${match.current_index}/${match.total_questions} • ${match.started ? "live" : "starting"}</div>
        </div>
      </div>
    `).join("") : '<div class="leaderboard-empty">No ranked matches live.</div>'}
  `;
}

function renderAdminUsers(users) {
  state.admin.userResults = users || [];
  const container = document.getElementById("adminUserResults");
  if (!container) return;
  if (!state.admin.userResults.length) {
    container.innerHTML = '<div class="leaderboard-empty">Search for a user to inspect their account.</div>';
    return;
  }
  container.innerHTML = state.admin.userResults
    .map((user) => `
      <div class="admin-profile-row">
        <div>
          <span class="leaderboard-name">${escapeHtml(user.username)}</span>
          <div class="leaderboard-meta">${escapeHtml(user.auth_provider || "guest")} • ${(user.progress?.xp ?? 0)} XP • ${(user.ranked?.division || "Unranked")} • ${(user.ranked?.elo ?? 0)} Elo</div>
        </div>
        <div class="admin-profile-actions">
          <button class="secondary-button admin-reset-ranked" data-username="${escapeHtml(user.username)}">Reset Ranked</button>
        </div>
      </div>
    `)
    .join("");
  container.querySelectorAll(".admin-reset-ranked").forEach((button) => {
    button.addEventListener("click", () => {
      const username = button.getAttribute("data-username") || "";
      resetAdminRankedUser(username)
        .then(() => showToast(`Reset ranked for ${username}.`))
        .catch((error) => showToast(error?.message || "Could not reset ranked data."));
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

async function loadAdminLiveMonitor() {
  const analyticsKey = getAnalyticsAdminKey();
  if (!analyticsKey) {
    renderAdminLive(null);
    return;
  }
  const payload = await fetchJson("/admin/live", {
    headers: { "X-Analytics-Key": analyticsKey },
  });
  renderAdminLive(payload);
}

async function loadAdminUserLookup(query = "") {
  const analyticsKey = getAnalyticsAdminKey();
  if (!analyticsKey) {
    renderAdminUsers([]);
    return;
  }
  const payload = await fetchJson(`/admin/users?q=${encodeURIComponent(query)}&limit=20`, {
    headers: { "X-Analytics-Key": analyticsKey },
  });
  renderAdminUsers(payload.users || []);
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

async function resetAdminRankedUser(username) {
  const analyticsKey = getAnalyticsAdminKey();
  if (!analyticsKey) throw new Error("Analytics access denied.");
  const payload = await fetchJson(`/admin/ranked/reset/${encodeURIComponent(username)}`, {
    method: "POST",
    headers: { "X-Analytics-Key": analyticsKey },
  });
  await loadAdminUserLookup(username).catch(() => {});
  return payload;
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

  els.profileSummary.innerHTML = `
    <div class="profile-hero">
      <div>
        <p class="eyebrow">Saved Profile</p>
        <h3 class="profile-name">${escapeHtml(state.profile.username)}</h3>
      </div>
      <div class="profile-rank-badge-wrap">
        <div class="profile-rank-badge">${escapeHtml(rankInfo.label)}</div>
        ${renderRankTimelineTooltip()}
      </div>
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
  `;
  if (state.online.enabled) {
    els.rankText.textContent = `Room ${state.online.roomCode || "----"} | Online 1v1`;
    els.achievementText.textContent = state.online.waiting ? "Waiting room" : "Hints disabled in online mode";
  } else if (state.twoPlayer) {
    els.rankText.textContent = "2-Player Local Match";
    els.achievementText.textContent = "Hints disabled in versus mode";
  } else {
    els.rankText.textContent = `${state.profile.rank} | ${state.profile.xp} XP`;
    els.achievementText.textContent =
      els.answerMode.value === "multiple-choice"
        ? "Multiple choice mode"
        : `${PLAYER_POOL_LABELS[els.playerPool.value] || "All Players"} • Typed mode`;
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
  if (els.soloMode.checked) {
    els.twoPlayerMode.checked = false;
    els.onlineMode.checked = false;
    els.rankedMode.checked = false;
  }
  if (els.rankedMode.checked) {
    els.soloMode.checked = false;
    els.twoPlayerMode.checked = false;
    els.onlineMode.checked = false;
  }
  if (els.onlineMode.checked) {
    els.soloMode.checked = false;
    els.twoPlayerMode.checked = false;
    els.rankedMode.checked = false;
  }
  if (els.twoPlayerMode.checked) {
    els.soloMode.checked = false;
    els.onlineMode.checked = false;
    els.rankedMode.checked = false;
  }
  toggleTwoPlayerFields();
  toggleOnlineFields();
  toggleRankedFields();
}

function hasSelectedMatchType() {
  return Boolean(
    els.soloMode?.checked ||
      els.twoPlayerMode?.checked ||
      els.onlineMode?.checked ||
      els.rankedMode?.checked
  );
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
    const showInviteActions = !state.online.ranked && state.online.waiting && Boolean(state.online.inviteUrl);
    els.onlineInviteActions?.classList.toggle("hidden", !showInviteActions);
    if (state.online.ranked) {
      els.turnTimerText.classList.remove("hidden");
      els.turnTimerText.textContent = `${state.questionTimeLeft || 15}s to answer`;
    } else {
      els.turnTimerText.classList.add("hidden");
    }
    updateChatBadge();
    renderChatPanel();
    return;
  }
  if (!state.twoPlayer) {
    els.twoPlayerBanner.classList.add("hidden");
    els.turnTimerText.classList.add("hidden");
    els.onlineInviteActions?.classList.add("hidden");
    els.toggleChat?.classList.add("hidden");
    els.chatPanel?.classList.add("hidden");
    updateChatBadge();
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
  void summary;
  return [];
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
  const questionCount = state.questions.length || 10;
  els.progressBar.style.setProperty("--question-count", questionCount);

  if (els.progressBar.children.length !== questionCount) {
    els.progressBar.innerHTML = "";
    const fragment = document.createDocumentFragment();
    state.questions.forEach(() => {
      const segment = document.createElement("div");
      segment.className = "progress-segment";
      const fill = document.createElement("div");
      fill.className = "progress-fill";
      segment.appendChild(fill);
      fragment.appendChild(segment);
    });
    els.progressBar.appendChild(fragment);
  }

  Array.from(els.progressBar.children).forEach((segment, index) => {
    segment.classList.toggle("current", index === state.currentIndex && !state.results[index]);
    const fill = segment.firstElementChild;
    if (!fill) return;
    fill.classList.toggle("correct", state.results[index] === "correct");
    fill.classList.toggle("wrong", state.results[index] === "wrong");
    fill.classList.toggle("skipped", state.results[index] === "skipped");
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
  const noHintsMode = state.twoPlayer || state.online.enabled;
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
    true
  );

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
  window.setTimeout(nextQuestion, 700);
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
  els.sendFriendRequest?.classList.add("hidden");
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
      if (state.auth.token && state.online.opponentName && (state.online.opponentAuthId || state.online.ranked)) {
        els.sendFriendRequest.textContent = `Add ${state.online.opponentName}`;
        els.sendFriendRequest.disabled = false;
        els.sendFriendRequest.classList.remove("hidden");
      }
      document.getElementById("playAgain").classList.add("hidden");
      document.getElementById("playMissedOnly").classList.add("hidden");
    }
  } else if (state.twoPlayer) {
    const [p1, p2] = state.playerNames;
    const s1 = state.playerScores[p1];
    const s2 = state.playerScores[p2];
    const winner = s1 === s2 ? `Tie game: ${s1}-${s2}` : `Winner: ${s1 > s2 ? p1 : p2} (${Math.max(s1, s2)}-${Math.min(s1, s2)})`;
    els.endSummary.textContent = `${winner} | Total questions ${summary.total}`;
    els.rewardSummary.textContent = `${p1}: ${s1}\n${p2}: ${s2}\n2-player local mode does not change season XP.`;
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
      `XP Breakdown:\n${breakdownLines}`;
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
}

async function startQuiz(customQuestions = null) {
  const username = els.username.value.trim() || "Guest";
  state.profile.username = username;
  if (!hasSelectedMatchType()) {
    throw new Error("Choose a match type before starting a game.");
  }
  trackAnalytics("quiz_start");
  enforceArenaBlueTheme();
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
  state.mode = els.soloMode.checked ? "Practice" : els.gameMode.value;
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
    opponentAuthId: "",
    scores: {},
    playerName: "",
    playerId: "",
    playerAuthId: "",
    rematchRequested: false,
    showHeadshots: true,
    inviteUrl: "",
    queuePollId: null,
    rankedProfile: state.online.rankedProfile || null,
    opponentElo: 0,
    chatMessages: [],
    chatOpen: false,
    chatMuted: false,
    unreadCount: 0,
  };
  if (els.chatInput) {
    els.chatInput.value = "";
  }
  if (els.chatMessages) {
    els.chatMessages.innerHTML = "";
    els.chatMessages.dataset.renderedCount = "0";
  }
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
  if (payload.opponent_auth_id) {
    state.online.opponentAuthId = payload.opponent_auth_id;
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
  els.sendFriendRequest?.classList.add("hidden");
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
  try {
    ensureLockedGoogleAccount("play ranked");
  } catch (error) {
    showToast(error?.message || "Sign in with Google to play ranked.");
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
      state.online.playerAuthId = payload.player_auth_id || "";
      state.online.opponentName = payload.opponent_name || "";
      state.online.opponentAuthId = payload.opponent_auth_id || "";
      state.online.scores = payload.scores || {};
      state.online.chatMessages = Array.isArray(payload.chat_history) ? payload.chat_history : [];
      state.online.unreadCount = 0;
      applyOnlineMatchSettings(payload);
      renderOnlineWaiting();
      renderChatPanel();
      updateChatBadge();
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

    if (payload.type === "chat_message") {
      handleIncomingChatMessage(payload.message);
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
  state.questions = Array(getRequestedQuestionCount() ?? 10).fill(null);
  state.results = Array(state.questions.length).fill(null);
  switchScreen(screens.quiz);
  els.onlineStatus.textContent = action === "create" ? "Creating your private match..." : "Joining private match...";
  renderOnlineWaiting();
  startTimer();

  let roomPayload;
  try {
    if (action === "create") {
      roomPayload = await fetchJson("/online-match/create", {
        method: "POST",
        headers: getAuthHeaders(),
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
        stopTimer();
        showToast("Enter a match code to join.");
        resetOnlineState();
        switchScreen(screens.home);
        return;
      }
      roomPayload = await fetchJson("/online-match/join", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          room_code: roomCode,
          username,
        }),
      });
    }
  } catch (error) {
    stopTimer();
    resetOnlineState();
    switchScreen(screens.home);
    showToast(error?.message || (action === "join" ? "Could not join that match code." : "Could not create an online match."));
    return;
  }

  state.online.roomCode = roomPayload.room_code;
  state.online.playerName = roomPayload.player_name || username;
  state.online.playerAuthId = roomPayload.player_auth_id || "";
  state.online.inviteUrl = getPrivateMatchLink(roomPayload.room_code);
  applyOnlineMatchSettings(roomPayload);
  if (action === "join") {
    clearJoinLinkFromUrl();
    state.invite.joinCode = "";
  }
  if (action === "create") {
    copyText(state.online.inviteUrl)
      .then(() => showToast("Invite link copied. Send it to your opponent."))
      .catch(() => showToast(`Match created. Share code ${roomPayload.room_code}.`));
  }
  renderOnlineWaiting();
  attachOnlineSocket(roomPayload.room_code, state.online.playerName);
}

async function autoJoinInviteIfNeeded() {
  if (!state.invite.joinCode || state.invite.autoJoinAttempted || state.online.enabled) return;
  state.invite.autoJoinAttempted = true;
  await startOnlineMatch();
  if (state.online.enabled && state.online.roomCode) {
    showToast(`Joined match ${state.online.roomCode}.`);
  }
}

async function saveProfile(silent = false) {
  const username = els.username.value.trim() || (state.auth.token ? "" : "Guest");
  if (state.auth.token && !isGoogleUsernameLocked() && !username) {
    throw new Error("Choose a username first.");
  }
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
    const authPayload = await fetchJson("/auth/me", {
      headers: getAuthHeaders(),
    });
    state.auth.user = authPayload.user;
    persistAuthState();
    await loadAuthenticatedProfile();
    refreshSignedInData({ loadFriends: isGoogleUsernameLocked() });
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
  els.theme.value = "Arena Blue";
  els.gameMode.value = els.profileDefaultMode?.value === "Practice" ? els.profileDefaultMode.value : "Practice";
  els.questionCount.value = els.profileDefaultCount.value;
  els.playerPool.value = els.profileDefaultPlayerPool.value;
  els.answerMode.value = els.profileDefaultAnswerMode.value;
  els.showHeadshots.checked = els.profileDefaultHeadshots.checked;
  syncModeFields();
  enforceArenaBlueTheme();
  await saveProfile(true);

  if (state.auth.user) {
    state.auth.user.username = displayName;
    state.auth.user.username_locked = true;
    persistAuthState();
  }
  renderAuthPanel();
  showToast("Account settings saved.");
}

async function loadLeaderboard() {
  if (!els.leaderboardOutput) return;
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
  await Promise.all([
    loadAdminProfiles().catch(() => {}),
    loadAdminLiveMonitor().catch(() => {}),
    loadAdminUserLookup().catch(() => {}),
  ]);
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
  ensureLockedGoogleAccount("refresh rankings");
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

function scheduleDeferredStartupTasks() {
  const deferred = () => {
    trackAnalytics("page_view").catch(() => {});
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(deferred, { timeout: 2000 });
  } else {
    window.setTimeout(deferred, 800);
  }
}

document.getElementById("startQuiz").addEventListener("click", () => {
  startQuiz().catch((error) => showToast(error?.message || "Could not start game."));
});
els.continueToMatchType?.addEventListener("click", () => {
  saveLocalSettings();
  goToHomeSetupStep("match");
});
els.backToQuizSetup?.addEventListener("click", () => goToHomeSetupStep("quiz"));
document.getElementById("saveProfile").addEventListener("click", () => {
  saveProfile()
    .then(() => loadAnalyticsSummary().catch(() => {}))
    .catch((error) => showToast(error?.message || "Could not save profile."));
});
document.getElementById("loadLeaderboard")?.addEventListener("click", () => {
  Promise.all([loadLeaderboard(), loadAnalyticsSummary().catch(() => {})])
    .then(() => showToast("Rankings refreshed."))
    .catch((error) => showToast(error?.message || "Could not refresh rankings."));
});
els.loginButton?.addEventListener("click", () => {
  state.auth.panelOpen = !state.auth.panelOpen;
  state.friends.panelOpen = false;
  renderAuthPanel();
  renderFriendsPanel();
  if (state.auth.panelOpen) {
    initializeGoogleButton();
  }
});
els.friendsButton?.addEventListener("click", () => {
  state.friends.panelOpen = !state.friends.panelOpen;
  state.auth.panelOpen = false;
  renderAuthPanel();
  renderFriendsPanel();
  if (state.friends.panelOpen) {
    loadFriendsSummary().catch((error) => showToast(error?.message || "Could not load friends."));
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
els.mobilePlayTab?.addEventListener("click", () => setMobileHomeTab("play"));
els.mobileHubTab?.addEventListener("click", () => setMobileHomeTab("hub"));
els.refreshFriends?.addEventListener("click", () => {
  loadFriendsSummary(true).catch((error) => showToast(error?.message || "Could not refresh friends."));
});
els.copyInviteLink?.addEventListener("click", () => {
  if (!state.online.inviteUrl) {
    showToast("Invite link is not ready yet.");
    return;
  }
  copyText(state.online.inviteUrl)
    .then(() => showToast("Invite link copied."))
    .catch(() => showToast("Could not copy the invite link."));
});
els.shareInviteLink?.addEventListener("click", () => {
  shareInviteLink().catch(() => showToast("Could not share the invite link."));
});
els.toggleChat?.addEventListener("click", () => {
  if (state.online.chatOpen) {
    closeChatPanel();
  } else {
    openChatPanel();
  }
});
els.closeChat?.addEventListener("click", closeChatPanel);
els.muteChat?.addEventListener("click", () => {
  state.online.chatMuted = !state.online.chatMuted;
  renderChatPanel();
  showToast(state.online.chatMuted ? "Chat muted." : "Chat unmuted.");
});
els.sendChatMessage?.addEventListener("click", sendChatMessage);
els.chatInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendChatMessage();
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
  state.friends.panelOpen = false;
  state.friends.friends = [];
  state.friends.incomingRequests = [];
  state.friends.outgoingRequests = [];
  state.friends.friendCode = "";
  renderAuthPanel();
  renderFriendsPanel();
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
els.sendFriendRequest?.addEventListener("click", () => {
  const target = state.online.opponentName || "";
  if (!target) return;
  sendFriendRequestTo(target)
    .then(() => {
      els.sendFriendRequest.disabled = true;
      els.sendFriendRequest.textContent = "Friend Request Sent";
      showToast(`Friend request sent to ${target}.`);
    })
    .catch((error) => showToast(error?.message || "Could not send that friend request."));
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
els.soloMode.addEventListener("change", () => {
  syncModeFields();
  saveLocalSettings();
});
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
els.toggleQuizSetup?.addEventListener("click", () => toggleMobileHomeSection("quizSetup"));
els.toggleMatchType?.addEventListener("click", () => toggleMobileHomeSection("matchType"));
els.toggleDirectory?.addEventListener("click", () => toggleMobileHomeSection("directory"));
els.username.addEventListener("change", saveLocalSettings);
els.conferenceFilter.addEventListener("change", saveLocalSettings);

loadLocalState();
loadAuthState();
hydrateCachedAuthenticatedState();
hydrateCachedFriendsSummary();
enforceArenaBlueTheme();
renderMobileHomeTabs();
renderMobileHomeSections();
renderHomeSetupStep();
renderAuthPanel();
renderFriendsPanel();
restoreAuthenticatedUser()
  .then(() => {
    autoJoinInviteIfNeeded().catch(() => {});
  })
  .catch(() => {
    autoJoinInviteIfNeeded().catch(() => {});
  });
updateProfileSummary();
syncModeFields();
renderAnalyticsSummary(null);
populateMeta().catch(() => {});
scheduleDeferredStartupTasks();
window.addEventListener("resize", () => {
  renderMobileHomeTabs();
  renderMobileHomeSections();
});
