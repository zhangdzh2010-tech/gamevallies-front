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

    const textarea = screen.getByPlaceholderText('简单描述你想要的游戏，AI 会帮你扩展成完整方案...');
    const longPrompt = '创意'.repeat(180);

    expect(textarea.getAttribute('data-maxlength')).toBe('2000');

    fireEvent.change(textarea, { target: { value: longPrompt } });
    expect(screen.getByText(`${longPrompt.length}/2000`)).toBeTruthy();

    fireEvent.click(screen.getByText('开始创作'));

    await waitFor(() => {
      expect(mockCreateGame).toHaveBeenCalledWith(longPrompt, '');
    });
  });

  test('example prompt click fills the textarea and short prompts are blocked', async () => {
    render(<CreatePage />);

    fireEvent.click(screen.getByText('做一个贪吃蛇游戏，触屏滑动控制方向，吃到食物会变长，撞墙或撞到自己游戏结束。'));
    expect(screen.getByPlaceholderText('简单描述你想要的游戏，AI 会帮你扩展成完整方案...').value).toBe(
      '做一个贪吃蛇游戏，触屏滑动控制方向，吃到食物会变长，撞墙或撞到自己游戏结束。'
    );

    fireEvent.change(screen.getByPlaceholderText('简单描述你想要的游戏，AI 会帮你扩展成完整方案...'), {
      target: { value: '太短' },
    });
    fireEvent.click(screen.getByText('开始创作'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '请输入游戏描述', icon: 'none' })
      );
    });
    expect(mockCreateGame).not.toHaveBeenCalled();
  });

  test('completed journey offers continue optimization and locked play actions', () => {
    const currentGame = {
      id: 'game-88',
      title: '像素跑酷',
      status: 'ready',
      gameUrl: 'https://game.example/play',
    };
    mockGameStoreState = buildGameStoreState({
      currentGame,
      canPlay: false,
    });

    render(<CreatePage />);

    fireEvent.click(screen.getByText('继续优化'));
    fireEvent.click(screen.getByText('订阅后试玩'));
    fireEvent.click(screen.getByText('再创一个'));

    expect(mockOpenIteratePageWithAuth).toHaveBeenCalledWith(currentGame, 'game-88');
    expect(mockOpenPaywall).toHaveBeenCalledWith('game-88');
    expect(mockResetCreateSession).toHaveBeenCalledTimes(1);
  });
});
