/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockShowToast = jest.fn();
const mockGetSystemInfoSync = jest.fn(() => ({ windowHeight: 720 }));
const mockCreateGame = jest.fn(() => Promise.resolve());
const mockRestorePersistedTask = jest.fn(() => Promise.resolve(true));
const mockCancelCurrentTask = jest.fn(() => Promise.resolve());
const mockClearError = jest.fn();
const mockConsumeCreateEntryIntent = jest.fn();
const mockResetCreateSession = jest.fn();
const mockSetCreateEntryIntent = jest.fn();
const mockSetCurrentGame = jest.fn();
const mockOpenIteratePageWithAuth = jest.fn();
const mockOpenProfilePageWithTab = jest.fn();
const mockOpenPaywall = jest.fn();
const mockOpenGame = jest.fn();
const mockEnsureCreateAccess = jest.fn();
const mockGameService = {
  getGame: jest.fn(),
  forkGame: jest.fn(),
};

let mockGameStoreState;

jest.mock('@tarojs/components', () => require('../../../test-utils/taroComponentsMock'));

jest.mock('@tarojs/taro', () => {
  const api = {
    showToast: mockShowToast,
    getSystemInfoSync: mockGetSystemInfoSync,
    showModal: jest.fn(),
    navigateTo: jest.fn(() => Promise.resolve()),
    switchTab: jest.fn(() => Promise.resolve()),
    redirectTo: jest.fn(() => Promise.resolve()),
    getStorageSync: jest.fn(),
    setStorageSync: jest.fn(),
    removeStorageSync: jest.fn(),
    getCurrentPages: jest.fn(() => []),
    getMenuButtonBoundingClientRect: jest.fn(),
  };

  return {
    __esModule: true,
    default: api,
    ...api,
    useDidShow: jest.fn(),
    useDidHide: jest.fn(),
  };
});

jest.mock('../../../components/common/AppTopBar', () => ({
  AppTopBar: ({ rightText, onRightClick }) => (
    <button type="button" onClick={onRightClick}>
      {rightText || 'top-bar'}
    </button>
  ),
}));

jest.mock('../../../components/common/CustomTabBar', () => ({
  CustomTabBar: () => <div>tab-bar</div>,
}));

jest.mock('../../../components/common/GamePlayer', () => ({
  GlobalGamePlayer: () => <div>global-player</div>,
}));

jest.mock('../../../components/common/PipelineOrbit', () => ({
  PipelineOrbit: ({ stageLabel }) => <div>{stageLabel}</div>,
}));

jest.mock('../../../components/common/PaywallPopup', () => ({
  PaywallPopup: () => <div>paywall</div>,
}));

jest.mock('../../../services/game', () => mockGameService);

jest.mock('../../../stores/gamePlayer', () => ({
  __esModule: true,
  default: jest.fn((selector) => selector({ openGame: mockOpenGame })),
}));

jest.mock('../../../stores/quotaStore', () => ({
  __esModule: true,
  default: jest.fn((selector) => selector({ openPaywall: mockOpenPaywall })),
}));

jest.mock('../../../utils/authNavigation', () => ({
  consumePersistedCreateEntryIntent: jest.fn(),
  ensureCreateAccess: mockEnsureCreateAccess,
  getPersistedCreateEntryIntent: jest.fn(() => null),
  isLoggedIn: jest.fn(() => true),
  openForkPageWithAuth: jest.fn(),
  openIteratePageWithAuth: mockOpenIteratePageWithAuth,
  openProfilePageWithTab: mockOpenProfilePageWithTab,
}));

jest.mock('../../../store/gameStore', () => ({
  PIPELINE_STAGES: [{ key: 'submitting', label: '提交创作请求', pct: 5 }],
  isCompletedGameStatus: jest.fn((status) => ['ready', 'draft', 'published', 'review'].includes(status)),
  useGameStore: jest.fn(() => mockGameStoreState),
  getPersistedGenerationTaskSnapshot: jest.fn(() => null),
}));

const CreatePage = require('../index').default;

const SUBMIT_TEXT = /\u5f00\u59cb\u521b\u4f5c/;
const PORTRAIT_TEXT = /\u7ad6\u5c4f/;
const LANDSCAPE_TEXT = /\u6a2a\u5c4f/;
const OPTIMIZE_TEXT = /\u7ee7\u7eed\u4f18\u5316/;
const SUBSCRIBE_PLAY_TEXT = /\u8ba2\u9605\u540e\u8bd5\u73a9/;
const CREATE_AGAIN_TEXT = /\u518d\u521b\u4e00\u4e2a/;

function buildGameStoreState(overrides = {}) {
  return {
    createGame: mockCreateGame,
    restorePersistedTask: mockRestorePersistedTask,
    cancelCurrentTask: mockCancelCurrentTask,
    isGenerating: false,
    generationProgress: null,
    currentGame: null,
    currentTask: null,
    error: '',
    terminalError: null,
    clearError: mockClearError,
    canPlay: true,
    createEntryIntent: null,
    consumeCreateEntryIntent: mockConsumeCreateEntryIntent,
    resetCreateSession: mockResetCreateSession,
    setCreateEntryIntent: mockSetCreateEntryIntent,
    setCurrentGame: mockSetCurrentGame,
    ...overrides,
  };
}

describe('Create page journey coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGameStoreState = buildGameStoreState();
  });

  test('creative textarea keeps the intended 2000-char limit and submits long input', async () => {
    render(<CreatePage />);

    const textarea = screen.getByPlaceholderText(/AI/);
    const longPrompt = 'creative'.repeat(180);

    expect(textarea.getAttribute('data-maxlength')).toBe('2000');
    expect(screen.getByText(PORTRAIT_TEXT)).toBeTruthy();

    fireEvent.change(textarea, { target: { value: longPrompt } });
    expect(screen.getByText(`${longPrompt.length}/2000`)).toBeTruthy();

    fireEvent.click(screen.getByText(SUBMIT_TEXT));

    await waitFor(() => {
      expect(mockCreateGame).toHaveBeenCalledWith(longPrompt, '', { orientation: 'portrait' });
    });
  });

  test('example prompt click fills the textarea and short prompts are blocked', async () => {
    render(<CreatePage />);

    fireEvent.click(screen.getByText('🐍'));

    expect(screen.getByPlaceholderText(/AI/).value).toContain('\u8d2a\u5403\u86c7');

    fireEvent.change(screen.getByPlaceholderText(/AI/), {
      target: { value: '\u592a\u77ed' },
    });
    fireEvent.click(screen.getByText(SUBMIT_TEXT));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '\u8bf7\u8f93\u5165\u6e38\u620f\u63cf\u8ff0', icon: 'none' })
      );
    });
    expect(mockCreateGame).not.toHaveBeenCalled();
  });

  test('orientation defaults to portrait and can switch to landscape before submit', async () => {
    render(<CreatePage />);

    fireEvent.change(screen.getByPlaceholderText(/AI/), {
      target: { value: 'build a horizontal shooter game with a spaceship and enemies' },
    });
    fireEvent.click(screen.getByText(LANDSCAPE_TEXT));
    fireEvent.click(screen.getByText(SUBMIT_TEXT));

    await waitFor(() => {
      expect(mockCreateGame).toHaveBeenCalledWith(
        'build a horizontal shooter game with a spaceship and enemies',
        '',
        { orientation: 'landscape' }
      );
    });
  });

  test('completed journey offers continue optimization and locked play actions', () => {
    const currentGame = {
      id: 'game-88',
      title: '\u50cf\u7d20\u8dd1\u9177',
      status: 'ready',
      gameUrl: 'https://game.example/play',
    };
    mockGameStoreState = buildGameStoreState({
      currentGame,
      canPlay: false,
    });

    render(<CreatePage />);

    fireEvent.click(screen.getByText(OPTIMIZE_TEXT));
    fireEvent.click(screen.getByText(SUBSCRIBE_PLAY_TEXT));
    fireEvent.click(screen.getByText(CREATE_AGAIN_TEXT));

    expect(mockOpenIteratePageWithAuth).toHaveBeenCalledWith(currentGame, 'game-88');
    expect(mockOpenPaywall).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 'game-88',
      gameUrl: 'https://game.example/play',
      resumePlay: true,
    }));
    expect(mockResetCreateSession).toHaveBeenCalledTimes(1);
  });
});
