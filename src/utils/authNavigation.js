import Taro from '@tarojs/taro';
import { ENV } from '../config/env';
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

const TAB_BAR_PAGES = new Set([
  HOME_PAGE_URL,
  '/pages/discover/index',
  CREATE_PAGE_URL,
  '/pages/message/index',
  PROFILE_PAGE_URL,
]);

const POST_LOGIN_REDIRECT_KEY =
  ENV.STORAGE_KEYS.POST_LOGIN_REDIRECT || 'gamevallies_post_login_redirect';
const CREATE_ENTRY_INTENT_KEY =
  ENV.STORAGE_KEYS.CREATE_ENTRY_INTENT || 'gamevallies_create_entry_intent';
const PROFILE_ACTIVE_TAB_KEY =
  ENV.STORAGE_KEYS.PROFILE_ACTIVE_TAB || 'gamevallies_profile_active_tab';
const CREATE_ENTRY_INTENT_MAX_AGE_MS = 30 * 60 * 1000;
const PROFILE_SUB_TABS = new Set(['works', 'drafts', 'liked', 'bookmarks', 'tasks']);

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

export function clearPersistedCreateEntryIntent() {
  try {
    Taro.removeStorageSync(CREATE_ENTRY_INTENT_KEY);
  } catch (error) {
    console.warn('Failed to clear create entry intent:', error);
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

function getPageRoute(page) {
  return page?.route ? `/${page.route}` : '';
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

function promptLoginAndGo(redirectUrl) {
  setPostLoginRedirect(redirectUrl);
  Taro.showToast({ title: '请先登录后再创作', icon: 'none' });
  setTimeout(() => {
    navigateToLogin();
  }, 300);
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
    Taro.switchTab({ url: CREATE_PAGE_URL }).catch(() => {});
    return true;
  }

  promptLoginAndGo(CREATE_PAGE_URL);
  return false;
}

export function openFreshCreatePageWithAuth() {
  return openCreatePageWithAuth({ mode: 'fresh' });
}

export function openResumeCreatePageWithAuth(game, gameId = null) {
  return openCreatePageWithAuth({ mode: 'resume', game, gameId: gameId || game?.id || null });
}

export function openForkCreatePageWithAuth(sourceGameId) {
  return openCreatePageWithAuth({ mode: 'fork', sourceGameId });
}

export function openTaskCreatePageWithAuth(taskId, gameId = null) {
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

  if (TAB_BAR_PAGES.has(targetUrl)) {
    return Taro.switchTab({ url: targetUrl }).catch(() => {});
  }

  const pages = Taro.getCurrentPages();
  if (pages.length > 1) {
    return Taro.navigateBack().catch(() => {});
  }

  return Taro.switchTab({ url: fallbackUrl }).catch(() => {});
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

  if (pages.length > 1) {
    Taro.navigateBack().catch(() => {});
    return;
  }

  Taro.switchTab({ url: HOME_PAGE_URL }).catch(() => {});
}
