import Taro from '@tarojs/taro';
import { setCreativeView, setPendingStudioOpen } from '../components/creative-web/creativeModel';
import { ENV } from '../config/env';
import { isH5Runtime } from './runtime';
import {
  getPersistedGenerationTaskSnapshot,
  setPersistedGenerationTaskSnapshot,
  useGameStore,
} from '../store/gameStore';
import { Storage } from './storage';

export const HOME_PAGE_URL = '/pages/index/index';
export const LOGIN_PAGE_URL = '/pages/login/index';
export const CREATE_PAGE_URL = '/pages/create/index';
export const PROFILE_PAGE_URL = '/pages/profile/index';
export const ITERATE_PAGE_URL = '/pages/game/iterate/index';
export const FORK_PAGE_URL = '/pages/game/fork/index';

const TAB_BAR_PAGES = new Set([
  HOME_PAGE_URL,
  '/pages/discover/index',
  CREATE_PAGE_URL,
  '/pages/message/index',
  PROFILE_PAGE_URL,
]);

const POST_LOGIN_REDIRECT_KEY =
  ENV.STORAGE_KEYS.POST_LOGIN_REDIRECT || 'gamevallies_post_login_redirect';
const LOGIN_HINT_KEY =
  ENV.STORAGE_KEYS.LOGIN_HINT || 'gamevallies_login_hint';
const CREATE_ENTRY_INTENT_KEY =
  ENV.STORAGE_KEYS.CREATE_ENTRY_INTENT || 'gamevallies_create_entry_intent';
const ITERATE_ENTRY_GAME_KEY =
  ENV.STORAGE_KEYS.ITERATE_ENTRY_GAME || 'gamevallies_iterate_entry_game';
const PROFILE_ACTIVE_TAB_KEY =
  ENV.STORAGE_KEYS.PROFILE_ACTIVE_TAB || 'gamevallies_profile_active_tab';
const PROFILE_LAST_TAB_KEY =
  ENV.STORAGE_KEYS.PROFILE_LAST_TAB || 'gamevallies_profile_last_tab';
const CREATE_ENTRY_INTENT_MAX_AGE_MS = 30 * 60 * 1000;
const ITERATE_ENTRY_GAME_MAX_AGE_MS = 30 * 60 * 1000;
const PROFILE_SUB_TABS = new Set(['works', 'drafts', 'liked', 'bookmarks', 'tasks']);

let creativeStudioHost = null;

export function registerCreativeStudioHost(openFn) {
  creativeStudioHost = typeof openFn === 'function' ? openFn : null;
}

export function unregisterCreativeStudioHost() {
  creativeStudioHost = null;
}

function shouldDeferStudioToHome() {
  const pages = Taro.getCurrentPages();
  if (!pages.length) {
    return false;
  }

  const route = getPageRoute(pages[pages.length - 1]);
  return route.includes('pages/profile/');
}

function openCreativeStudioInPage(spec) {
  if (!isH5Runtime()) {
    return false;
  }

  if (creativeStudioHost) {
    return creativeStudioHost(spec);
  }

  if (shouldDeferStudioToHome()) {
    setPendingStudioOpen(spec);
    setCreativeView('works');
    Taro.switchTab({ url: HOME_PAGE_URL }).catch(() => {});
    return true;
  }

  return false;
}

function normalizeProfileActiveTab(tab) {
  if (!tab || !PROFILE_SUB_TABS.has(tab)) {
    return '';
  }

  return tab;
}

function normalizeCreateEntryIntent(intent) {
  if (!intent?.mode) {
    return null;
  }

  const normalized = {
    mode: intent.mode,
    gameId: intent.gameId || null,
    taskId: intent.taskId || null,
    sourceGameId: intent.sourceGameId || null,
    createdAt: intent.createdAt || Date.now(),
  };

  if (!['fresh', 'resume', 'task', 'fork'].includes(normalized.mode)) {
    return null;
  }

  if (normalized.mode === 'resume' && !normalized.gameId) {
    return null;
  }

  if (normalized.mode === 'task' && !normalized.taskId) {
    return null;
  }

  if (normalized.mode === 'fork' && !normalized.sourceGameId) {
    return null;
  }

  return normalized;
}

function normalizeIterateEntryGame(game) {
  if (!game?.id) {
    return null;
  }

  return {
    ...game,
    id: game.id,
    createdAt: game.createdAt || Date.now(),
  };
}

export function clearPersistedCreateEntryIntent() {
  try {
    Taro.removeStorageSync(CREATE_ENTRY_INTENT_KEY);
  } catch (error) {
    console.warn('Failed to clear create entry intent:', error);
  }
}

export function clearPersistedIterateEntryGame() {
  try {
    Taro.removeStorageSync(ITERATE_ENTRY_GAME_KEY);
  } catch (error) {
    console.warn('Failed to clear iterate entry game:', error);
  }
}

export function setPersistedIterateEntryGame(game) {
  const normalizedGame = normalizeIterateEntryGame(game);
  if (!normalizedGame) {
    clearPersistedIterateEntryGame();
    return;
  }

  try {
    Taro.setStorageSync(ITERATE_ENTRY_GAME_KEY, JSON.stringify({
      ...normalizedGame,
      createdAt: Date.now(),
    }));
  } catch (error) {
    console.warn('Failed to persist iterate entry game:', error);
  }
}

export function getPersistedIterateEntryGame() {
  try {
    const raw = Taro.getStorageSync(ITERATE_ENTRY_GAME_KEY);
    if (!raw) {
      return null;
    }

    const parsed = normalizeIterateEntryGame(JSON.parse(raw));
    if (!parsed) {
      clearPersistedIterateEntryGame();
      return null;
    }

    if (Date.now() - (parsed.createdAt || 0) > ITERATE_ENTRY_GAME_MAX_AGE_MS) {
      clearPersistedIterateEntryGame();
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to read iterate entry game:', error);
    return null;
  }
}

export function setPersistedCreateEntryIntent(intent) {
  const normalizedIntent = normalizeCreateEntryIntent(intent);
  if (!normalizedIntent) {
    clearPersistedCreateEntryIntent();
    return;
  }

  try {
    Taro.setStorageSync(CREATE_ENTRY_INTENT_KEY, JSON.stringify(normalizedIntent));
  } catch (error) {
    console.warn('Failed to persist create entry intent:', error);
  }
}

export function getPersistedCreateEntryIntent() {
  try {
    const raw = Taro.getStorageSync(CREATE_ENTRY_INTENT_KEY);
    if (!raw) {
      return null;
    }

    const parsed = normalizeCreateEntryIntent(JSON.parse(raw));
    if (!parsed) {
      clearPersistedCreateEntryIntent();
      return null;
    }

    if (Date.now() - (parsed.createdAt || 0) > CREATE_ENTRY_INTENT_MAX_AGE_MS) {
      clearPersistedCreateEntryIntent();
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to read create entry intent:', error);
    return null;
  }
}

export function consumePersistedCreateEntryIntent() {
  const intent = getPersistedCreateEntryIntent();
  if (intent) {
    clearPersistedCreateEntryIntent();
  }
  return intent;
}

export function setPersistedProfileActiveTab(tab) {
  const normalizedTab = normalizeProfileActiveTab(tab);
  if (!normalizedTab) {
    try {
      Taro.removeStorageSync(PROFILE_ACTIVE_TAB_KEY);
    } catch (error) {
      console.warn('Failed to clear profile active tab:', error);
    }
    return;
  }

  try {
    Taro.setStorageSync(PROFILE_ACTIVE_TAB_KEY, normalizedTab);
  } catch (error) {
    console.warn('Failed to persist profile active tab:', error);
  }
}

export function getPersistedProfileActiveTab() {
  try {
    return normalizeProfileActiveTab(Taro.getStorageSync(PROFILE_ACTIVE_TAB_KEY));
  } catch (error) {
    console.warn('Failed to read profile active tab:', error);
    return '';
  }
}

export function consumePersistedProfileActiveTab() {
  const activeTab = getPersistedProfileActiveTab();
  if (!activeTab) {
    return '';
  }

  try {
    Taro.removeStorageSync(PROFILE_ACTIVE_TAB_KEY);
  } catch (error) {
    console.warn('Failed to clear profile active tab:', error);
  }

  return activeTab;
}

/**
 * Sticky "last visited" profile tab. Unlike the consume-once intent above,
 * this value is read-only persistent and updated whenever the user manually
 * switches tabs so the page restores the last viewed section on re-entry.
 */
export function setLastViewedProfileTab(tab) {
  const normalizedTab = normalizeProfileActiveTab(tab);
  if (!normalizedTab) {
    return;
  }

  try {
    Taro.setStorageSync(PROFILE_LAST_TAB_KEY, normalizedTab);
  } catch (error) {
    console.warn('Failed to persist last viewed profile tab:', error);
  }
}

export function getLastViewedProfileTab() {
  try {
    return normalizeProfileActiveTab(Taro.getStorageSync(PROFILE_LAST_TAB_KEY));
  } catch (error) {
    console.warn('Failed to read last viewed profile tab:', error);
    return '';
  }
}

function getPageRoute(page) {
  return page?.route ? `/${page.route}` : '';
}

function buildUrlWithQuery(baseUrl, params = {}) {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return query ? `${baseUrl}?${query}` : baseUrl;
}

function openPage(url) {
  if (TAB_BAR_PAGES.has(url)) {
    return Taro.switchTab({ url }).catch(() => {});
  }

  return Taro.navigateTo({ url }).catch(() => {});
}

function replacePage(url) {
  if (TAB_BAR_PAGES.has(url)) {
    return Taro.switchTab({ url }).catch(() => {});
  }

  return Taro.redirectTo({ url }).catch(() => Taro.navigateTo({ url }).catch(() => {}));
}

function isWorkflowPageUrl(url) {
  return typeof url === 'string'
    && (url.startsWith(CREATE_PAGE_URL) || url.startsWith(ITERATE_PAGE_URL) || url.startsWith(FORK_PAGE_URL));
}

function navigateToLogin() {
  const pages = Taro.getCurrentPages();
  const currentRoute = getPageRoute(pages[pages.length - 1]);

  if (currentRoute === LOGIN_PAGE_URL) {
    return;
  }

  Taro.navigateTo({ url: LOGIN_PAGE_URL }).catch(() => {});
}

function setCreateEntryIntent(gameStore, intent) {
  const normalizedIntent = normalizeCreateEntryIntent(intent);
  if (!normalizedIntent) {
    return;
  }

  gameStore.clearError();
  gameStore.setCreateEntryIntent(normalizedIntent);
  setPersistedCreateEntryIntent(normalizedIntent);
}

function prepareCreateEntry(options = {}) {
  const { mode = null, game = null, gameId = null, taskId = null, sourceGameId = null } = options;
  const gameStore = useGameStore.getState();

  if (mode === 'resume') {
    if (game) {
      gameStore.setCurrentGame(game);
    }
    setCreateEntryIntent(gameStore, {
      mode: 'resume',
      gameId: game?.id || gameId || gameStore.currentGame?.id || null,
    });
    return;
  }

  if (mode === 'task' && taskId) {
    setPersistedGenerationTaskSnapshot({
      taskId,
      gameId: gameId || '',
      status: 'running',
    });
    setCreateEntryIntent(gameStore, {
      mode: 'task',
      taskId,
      gameId: gameId || null,
    });
    return;
  }

  if (mode === 'fork' && sourceGameId) {
    setCreateEntryIntent(gameStore, {
      mode: 'fork',
      sourceGameId,
    });
    return;
  }

  if (mode === 'fresh') {
    gameStore.resetCreateSession();
    setCreateEntryIntent(gameStore, { mode: 'fresh' });
    return;
  }

  const activeTaskSnapshot = getPersistedGenerationTaskSnapshot();
  if (activeTaskSnapshot?.taskId) {
    setCreateEntryIntent(gameStore, {
      mode: 'task',
      taskId: activeTaskSnapshot.taskId,
      gameId: activeTaskSnapshot.gameId || null,
    });
    return;
  }

  gameStore.resetCreateSession();
  setCreateEntryIntent(gameStore, { mode: 'fresh' });
}

function promptLoginAndGo(redirectUrl, hint = '请先登录后再创作') {
  setPostLoginRedirect(redirectUrl);
  setLoginHint(hint);
  navigateToLogin();
}

export function setLoginHint(hint) {
  if (!hint) {
    try {
      Taro.removeStorageSync(LOGIN_HINT_KEY);
    } catch (error) {
      console.warn('Failed to clear login hint:', error);
    }
    return;
  }

  try {
    Taro.setStorageSync(LOGIN_HINT_KEY, String(hint));
  } catch (error) {
    console.warn('Failed to save login hint:', error);
  }
}

export function consumeLoginHint() {
  try {
    const hint = Taro.getStorageSync(LOGIN_HINT_KEY) || '';
    if (hint) {
      Taro.removeStorageSync(LOGIN_HINT_KEY);
    }
    return hint;
  } catch (error) {
    console.warn('Failed to read login hint:', error);
    return '';
  }
}

export function isLoggedIn() {
  return Boolean(Storage.getToken());
}

export function setPostLoginRedirect(url) {
  if (!url) return;
  try {
    Taro.setStorageSync(POST_LOGIN_REDIRECT_KEY, url);
  } catch (error) {
    console.warn('Failed to save post-login redirect:', error);
  }
}

export function getPostLoginRedirect() {
  try {
    return Taro.getStorageSync(POST_LOGIN_REDIRECT_KEY) || '';
  } catch (error) {
    console.warn('Failed to read post-login redirect:', error);
    return '';
  }
}

export function clearPostLoginRedirect() {
  try {
    Taro.removeStorageSync(POST_LOGIN_REDIRECT_KEY);
  } catch (error) {
    console.warn('Failed to clear post-login redirect:', error);
  }
}

export function consumePostLoginRedirect() {
  const redirectUrl = getPostLoginRedirect();
  if (redirectUrl) {
    clearPostLoginRedirect();
  }
  return redirectUrl;
}

export function openCreatePageWithAuth(options = {}) {
  prepareCreateEntry(options);

  if (isLoggedIn()) {
    clearPostLoginRedirect();
    openPage(CREATE_PAGE_URL);
    return true;
  }

  promptLoginAndGo(CREATE_PAGE_URL);
  return false;
}

export function openFreshCreatePageWithAuth() {
  return openCreatePageWithAuth({ mode: 'fresh' });
}

export function openResumeCreatePageWithAuth(game, gameId = null) {
  return openIteratePageWithAuth(game, gameId || game?.id || null);
}

export function openForkCreatePageWithAuth(sourceGameId) {
  return openForkPageWithAuth(sourceGameId);
}

export function buildIteratePageUrl(gameId = null, taskId = null) {
  return buildUrlWithQuery(ITERATE_PAGE_URL, {
    ...(gameId ? { gameId } : {}),
    ...(taskId ? { taskId } : {}),
  });
}

export function buildForkPageUrl(sourceGameId) {
  return buildUrlWithQuery(FORK_PAGE_URL, { sourceGameId });
}

export function openIteratePageWithAuth(game, gameId = null, options = {}) {
  const targetGameId = gameId || game?.id || null;
  const { taskId = null } = options;

  if (!targetGameId && !taskId) {
    return false;
  }

  const gameStore = useGameStore.getState();
  if (game) {
    gameStore.setCurrentGame(game);
    setPersistedIterateEntryGame(game);
  }

  const targetUrl = buildIteratePageUrl(targetGameId, taskId);
  const studioSpec = {
    kind: 'iterate',
    mode: 'iterate',
    game,
    gameId: targetGameId,
    taskId,
    title: game?.title || '',
  };

  if (isLoggedIn()) {
    clearPostLoginRedirect();
    if (openCreativeStudioInPage(studioSpec)) {
      return true;
    }
    openPage(targetUrl);
    return true;
  }

  promptLoginAndGo(targetUrl);
  return false;
}

export function openForkPageWithAuth(sourceGameId) {
  if (!sourceGameId) {
    return false;
  }

  const targetUrl = buildForkPageUrl(sourceGameId);

  if (isLoggedIn()) {
    clearPostLoginRedirect();
    openPage(targetUrl);
    return true;
  }

  promptLoginAndGo(targetUrl);
  return false;
}

export function openTaskCreatePageWithAuth(taskId, gameId = null, taskType = 'pipeline_run') {
  if (taskType === 'pipeline_iterate') {
    setPersistedGenerationTaskSnapshot({
      taskId,
      taskType,
      gameId: gameId || '',
      status: 'running',
    });
    return openIteratePageWithAuth(null, gameId, { taskId });
  }

  if (isLoggedIn()) {
    prepareCreateEntry({ mode: 'task', taskId, gameId });
    const studioSpec = {
      kind: 'create-task',
      mode: 'create-task',
      taskId,
      gameId: gameId || '',
      title: '',
    };
    if (openCreativeStudioInPage(studioSpec)) {
      clearPostLoginRedirect();
      return true;
    }
  }

  return openCreatePageWithAuth({ mode: 'task', taskId, gameId });
}

export function openProfilePageWithTab(tab = 'works') {
  const normalizedTab = normalizeProfileActiveTab(tab) || 'works';
  setPersistedProfileActiveTab(normalizedTab);
  return Taro.switchTab({ url: PROFILE_PAGE_URL }).catch(() => {});
}

export function ensureCreateAccess() {
  if (isLoggedIn()) {
    clearPostLoginRedirect();
    return true;
  }

  promptLoginAndGo(CREATE_PAGE_URL);
  return false;
}

export function navigateAfterLogin(fallbackUrl = HOME_PAGE_URL) {
  const redirectUrl = consumePostLoginRedirect();
  const targetUrl = redirectUrl || fallbackUrl;
  if (targetUrl === HOME_PAGE_URL) setCreativeView('square');

  if (targetUrl) {
    return replacePage(targetUrl);
  }

  return replacePage(fallbackUrl);
}

export function handleLoginBackNavigation() {
  const redirectUrl = getPostLoginRedirect();
  const pages = Taro.getCurrentPages();
  const previousRoute = getPageRoute(pages[pages.length - 2]);

  if (!isLoggedIn() && redirectUrl === CREATE_PAGE_URL && previousRoute === CREATE_PAGE_URL) {
    clearPostLoginRedirect();
    clearPersistedCreateEntryIntent();
    Taro.switchTab({ url: HOME_PAGE_URL }).catch(() => {});
    return;
  }

  if (!isLoggedIn() && redirectUrl === CREATE_PAGE_URL) {
    clearPostLoginRedirect();
    clearPersistedCreateEntryIntent();
  }

  if (!isLoggedIn() && isWorkflowPageUrl(redirectUrl) && redirectUrl !== CREATE_PAGE_URL) {
    clearPostLoginRedirect();
  }

  if (pages.length > 1) {
    Taro.navigateBack().catch(() => {});
    return;
  }

  Taro.switchTab({ url: HOME_PAGE_URL }).catch(() => {});
}
