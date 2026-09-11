/* eslint-env jest */
const mockStorageState = {};
const mockGetToken = jest.fn();
const mockGameStoreState = {
  clearError: jest.fn(),
  setCreateEntryIntent: jest.fn(),
  resetCreateSession: jest.fn(),
  setCurrentGame: jest.fn(),
  currentGame: null,
};
const mockGetPersistedGenerationTaskSnapshot = jest.fn(() => null);
const mockSetPersistedGenerationTaskSnapshot = jest.fn();
const mockTaro = {
  getStorageSync: jest.fn((key) => {
    if (key === '') {
      return { ...mockStorageState };
    }
    return mockStorageState[key];
  }),
  setStorageSync: jest.fn((key, value) => {
    mockStorageState[key] = value;
  }),
  removeStorageSync: jest.fn((key) => {
    delete mockStorageState[key];
  }),
  switchTab: jest.fn(() => Promise.resolve()),
  navigateTo: jest.fn(() => Promise.resolve()),
  redirectTo: jest.fn(() => Promise.resolve()),
  navigateBack: jest.fn(() => Promise.resolve()),
  showToast: jest.fn(),
  getCurrentPages: jest.fn(() => []),
};

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: mockTaro,
  ...mockTaro,
}));

jest.mock('../storage', () => ({
  Storage: {
    getToken: mockGetToken,
  },
}));

jest.mock('../../store/gameStore', () => ({
  useGameStore: {
    getState: jest.fn(() => mockGameStoreState),
  },
  getPersistedGenerationTaskSnapshot: mockGetPersistedGenerationTaskSnapshot,
  setPersistedGenerationTaskSnapshot: mockSetPersistedGenerationTaskSnapshot,
}));

const POST_LOGIN_REDIRECT_KEY = 'gamevallies_post_login_redirect';
const LOGIN_HINT_KEY = 'gamevallies_login_hint';
const CREATE_ENTRY_INTENT_KEY = 'gamevallies_create_entry_intent';
const ITERATE_ENTRY_GAME_KEY = 'gamevallies_iterate_entry_game';

describe('authNavigation user journey', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    Object.keys(mockStorageState).forEach((key) => delete mockStorageState[key]);
    mockGetToken.mockReturnValue(null);
    mockGetPersistedGenerationTaskSnapshot.mockReturnValue(null);
    mockGameStoreState.currentGame = null;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('logged-in user can enter the create tab directly and gets a fresh intent', () => {
    mockGetToken.mockReturnValue('token');

    const {
      CREATE_PAGE_URL,
      openCreatePageWithAuth,
    } = require('../authNavigation');

    const result = openCreatePageWithAuth({ mode: 'fresh' });

    expect(result).toBe(true);
    expect(mockGameStoreState.resetCreateSession).toHaveBeenCalledTimes(1);
    expect(mockGameStoreState.clearError).toHaveBeenCalledTimes(1);
    expect(mockGameStoreState.setCreateEntryIntent).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'fresh' })
    );
    expect(mockTaro.switchTab).toHaveBeenCalledWith({ url: CREATE_PAGE_URL });
    expect(mockTaro.showToast).not.toHaveBeenCalled();
  });

  test('unauthenticated user opening iterate flow is redirected to login with preserved target', () => {
    const {
      LOGIN_PAGE_URL,
      openIteratePageWithAuth,
    } = require('../authNavigation');

    const result = openIteratePageWithAuth({ id: 'game-1' }, null, { taskId: 'task-7' });

    expect(result).toBe(false);
    expect(JSON.parse(mockStorageState[ITERATE_ENTRY_GAME_KEY])).toEqual(expect.objectContaining({
      id: 'game-1',
    }));
    expect(mockStorageState[POST_LOGIN_REDIRECT_KEY]).toBe(
      '/pages/game/iterate/index?gameId=game-1&taskId=task-7'
    );
    expect(mockStorageState[LOGIN_HINT_KEY]).toBe('请先登录后再创作');
    expect(mockTaro.showToast).not.toHaveBeenCalled();
    expect(mockTaro.navigateTo).toHaveBeenCalledWith({ url: LOGIN_PAGE_URL });
  });

  test('logged-in iterate entry persists the selected game snapshot before navigation', () => {
    mockGetToken.mockReturnValue('token');
    const { openIteratePageWithAuth } = require('../authNavigation');

    const result = openIteratePageWithAuth({
      id: 'game-2',
      title: '节奏跑酷',
      status: 'published',
    });

    expect(result).toBe(true);
    expect(JSON.parse(mockStorageState[ITERATE_ENTRY_GAME_KEY])).toEqual(expect.objectContaining({
      id: 'game-2',
      title: '节奏跑酷',
      status: 'published',
    }));
    expect(mockTaro.navigateTo).toHaveBeenCalledWith({
      url: '/pages/game/iterate/index?gameId=game-2',
    });
  });

  test('logged-in iterate entry opens in-page studio when host is registered on H5', () => {
    mockGetToken.mockReturnValue('token');
    const openInPage = jest.fn(() => true);
    const {
      openIteratePageWithAuth,
      registerCreativeStudioHost,
      unregisterCreativeStudioHost,
    } = require('../authNavigation');

    registerCreativeStudioHost(openInPage);
    const result = openIteratePageWithAuth({ id: 'game-3', title: '页内作品' }, null);

    expect(result).toBe(true);
    expect(openInPage).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'iterate',
      gameId: 'game-3',
    }));
    expect(mockTaro.navigateTo).not.toHaveBeenCalled();

    unregisterCreativeStudioHost();
  });

  test('iterate task entry persists task snapshot before redirecting to login', () => {
    const { openTaskCreatePageWithAuth } = require('../authNavigation');

    const result = openTaskCreatePageWithAuth('task-9', 'game-9', 'pipeline_iterate');

    expect(result).toBe(false);
    expect(mockSetPersistedGenerationTaskSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-9',
        taskType: 'pipeline_iterate',
        gameId: 'game-9',
        status: 'running',
      })
    );
    expect(mockStorageState[POST_LOGIN_REDIRECT_KEY]).toBe(
      '/pages/game/iterate/index?gameId=game-9&taskId=task-9'
    );
  });

  test('successful login returns users to the preserved workflow page', () => {
    mockStorageState[POST_LOGIN_REDIRECT_KEY] = '/pages/game/iterate/index?gameId=game-1&taskId=task-7';
    const { navigateAfterLogin } = require('../authNavigation');

    navigateAfterLogin();

    expect(mockTaro.removeStorageSync).toHaveBeenCalledWith(POST_LOGIN_REDIRECT_KEY);
    expect(mockTaro.redirectTo).toHaveBeenCalledWith({
      url: '/pages/game/iterate/index?gameId=game-1&taskId=task-7',
    });
  });

  test('backing out from login clears create redirect state and returns to home', () => {
    mockStorageState[POST_LOGIN_REDIRECT_KEY] = '/pages/create/index';
    mockStorageState[CREATE_ENTRY_INTENT_KEY] = JSON.stringify({ mode: 'fresh', createdAt: Date.now() });
    mockTaro.getCurrentPages.mockReturnValue([
      { route: 'pages/create/index' },
      { route: 'pages/login/index' },
    ]);

    const {
      HOME_PAGE_URL,
      handleLoginBackNavigation,
    } = require('../authNavigation');

    handleLoginBackNavigation();

    expect(mockTaro.removeStorageSync).toHaveBeenCalledWith(POST_LOGIN_REDIRECT_KEY);
    expect(mockTaro.removeStorageSync).toHaveBeenCalledWith(CREATE_ENTRY_INTENT_KEY);
    expect(mockTaro.switchTab).toHaveBeenCalledWith({ url: HOME_PAGE_URL });
    expect(mockTaro.navigateBack).not.toHaveBeenCalled();
  });
});
