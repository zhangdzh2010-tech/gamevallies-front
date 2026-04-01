/* eslint-env jest */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockShowToast = jest.fn();
const mockGetSystemInfoSync = jest.fn(() => ({ windowHeight: 720 }));
const mockStartCreationSession = jest.fn(() => Promise.resolve());
const mockRestoreActiveCreationSession = jest.fn(() => Promise.resolve(null));
const mockRestorePersistedTask = jest.fn(() => Promise.resolve(true));
const mockCancelCurrentTask = jest.fn(() => Promise.resolve());
const mockAnswerCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockSkipCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockGenerateFromCreationSession = jest.fn(() => Promise.resolve());
const mockRefreshCreationSession = jest.fn(() => Promise.resolve());
const mockAbandonCreationSession = jest.fn(() => Promise.resolve());
const mockClearError = jest.fn();
const mockConsumeCreateEntryIntent = jest.fn();
const mockResetCreateSession = jest.fn();
const mockResetCreationSessionState = jest.fn();
const mockSetCreateEntryIntent = jest.fn();
const mockSetCurrentGame = jest.fn();
const mockOpenIteratePageWithAuth = jest.fn();
const mockOpenProfilePageWithTab = jest.fn();
const mockOpenPaywall = jest.fn();
const mockOpenGame = jest.fn();
const mockEnsureCreateAccess = jest.fn();
const didShowCallbacks = [];
const mockGameService = {
  getGame: jest.fn(),
  forkGame: jest.fn(),
  getActiveCreationSession: jest.fn(() => Promise.resolve(null)),
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
    useDidShow: jest.fn((callback) => {
      didShowCallbacks.push(callback);
    }),
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

jest.mock('../../../components/creation', () => ({
  CreationResumeScene: ({ subjectTitle, session }) => (
    <div>
      <div>resume-scene</div>
      <div>{subjectTitle}</div>
      <div>{session?.prompt}</div>
    </div>
  ),
  canGenerateCreationSession: jest.fn((status) => ['collecting', 'ready'].includes(status)),
  getCreationSessionNotice: jest.fn((status) => (
    status === 'initializing'
      ? 'AI 正在整理这轮创作的第一版理解，通常几秒内会回来。'
      : status === 'expired'
      ? '本轮创作会话已过期，请重新开始，系统会基于最新信息重新整理方案。'
      : status === 'ready'
        ? '当前信息已经足够，确认后就可以直接开始创作。'
        : ''
  )),
  isCreationSessionQuestioning: jest.fn((status) => status === 'collecting'),
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

const PORTRAIT_TEXT = /\u7ad6\u5c4f/;
const LANDSCAPE_TEXT = /\u6a2a\u5c4f/;
const OPTIMIZE_TEXT = /\u7ee7\u7eed\u4f18\u5316/;
const SUBSCRIBE_PLAY_TEXT = /\u8ba2\u9605\u540e\u8bd5\u73a9/;
const CREATE_AGAIN_TEXT = /\u518d\u521b\u4e00\u4e2a/;

function buildGameStoreState(overrides = {}) {
  return {
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
    creationSession: null,
    creationSessionError: null,
    creationSessionSubmitting: false,
    getCreationFlowStage: jest.fn(() => 'idle'),
    refreshCreationSession: mockRefreshCreationSession,
    startCreationSession: mockStartCreationSession,
    answerCreationSessionQuestion: mockAnswerCreationSessionQuestion,
    skipCreationSessionQuestion: mockSkipCreationSessionQuestion,
    generateFromCreationSession: mockGenerateFromCreationSession,
    abandonCreationSession: mockAbandonCreationSession,
    resetCreationSessionState: mockResetCreationSessionState,
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
    didShowCallbacks.length = 0;
    mockGameStoreState = buildGameStoreState();
  });

  async function flushDidShowCallbacks() {
    for (const callback of didShowCallbacks) {
      // Taro calls these after page show, so run them after render inside act.
      await act(async () => {
        await callback();
      });
    }

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  test('creative textarea keeps the intended 2000-char limit and submits long input', async () => {
    render(<CreatePage />);

    const textarea = screen.getByLabelText('create-initial-answer');
    const longPrompt = 'creative'.repeat(180);

    expect(screen.getByPlaceholderText('游戏名（可选）')).toBeTruthy();
    expect(screen.getByText(PORTRAIT_TEXT)).toBeTruthy();

    fireEvent.change(textarea, { target: { value: longPrompt } });
    expect(screen.getByText(`${longPrompt.length}/2000`)).toBeTruthy();

    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(longPrompt, '', {
        entryMode: 'create',
        orientation: 'portrait',
        generationTier: 'standard',
      });
    });
  });

  test('short prompts are blocked before starting the session', async () => {
    render(<CreatePage />);

    fireEvent.change(screen.getByLabelText('create-initial-answer'), {
      target: { value: '\u592a\u77ed' },
    });
    expect(
      screen.getByText('发送').parentElement.className.includes('is-disabled')
    ).toBe(true);
    expect(mockStartCreationSession).not.toHaveBeenCalled();
  });

  test('orientation defaults to portrait and can switch to landscape before submit', async () => {
    render(<CreatePage />);

    fireEvent.change(screen.getByLabelText('create-initial-answer'), {
      target: { value: 'build a horizontal shooter game with a spaceship and enemies' },
    });
    fireEvent.click(screen.getByText(LANDSCAPE_TEXT));
    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        'build a horizontal shooter game with a spaceship and enemies',
        '',
        {
          entryMode: 'create',
          orientation: 'landscape',
          generationTier: 'standard',
        }
      );
    });
  });

  test('session view renders after a creation session exists and can trigger direct generation', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: {
        sessionId: 'session-1',
        entryMode: 'create',
        status: 'collecting',
        planDraft: '这是系统整理出的第一版方案',
        confidenceSummary: '已经理解核心玩法',
        currentQuestion: {
          content: '你更偏向什么视觉风格？',
        },
        messages: [{ id: 'm1', role: 'user', content: '做一个像素风跑酷游戏' }],
      },
      getCreationFlowStage: jest.fn(() => 'collecting'),
    });

    render(<CreatePage />);

    expect(screen.getByText('做一个像素风跑酷游戏')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('你更偏向什么视觉风格？')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('生成'));

    await waitFor(() => {
      expect(mockGenerateFromCreationSession).toHaveBeenCalledWith({
        orientation: 'portrait',
        generationTier: 'standard',
      });
    });
  });

  test('initializing create session keeps the first prompt visible and disables sending', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: {
        sessionId: 'session-init',
        entryMode: 'create',
        status: 'initializing',
        prompt: '做一个像素风跑酷游戏',
        messages: [],
      },
      getCreationFlowStage: jest.fn(() => 'initializing'),
    });

    render(<CreatePage />);

    expect(screen.getByText('做一个像素风跑酷游戏')).toBeTruthy();
    expect(screen.getByText('AI 正在整理这轮创作的第一版理解，通常几秒内会回来。')).toBeTruthy();
    expect(screen.getByText('整理中...').parentElement.className.includes('is-disabled')).toBe(true);
  });

  test('expired create session shows notice and disables stale question actions', () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: {
        sessionId: 'session-2',
        entryMode: 'create',
        status: 'expired',
        planDraft: '旧方案',
        confidenceSummary: '旧理解',
        currentQuestion: {
          content: '这个问题不该再让用户回答',
        },
      },
      getCreationFlowStage: jest.fn(() => 'expired'),
    });

    render(<CreatePage />);

    expect(screen.getByText('本轮创作会话已过期，请重新开始，系统会基于最新信息重新整理方案。')).toBeTruthy();
    expect(screen.queryByText('这个问题不该再让用户回答')).toBeNull();
    fireEvent.click(screen.getByText('发送'));
    expect(mockAnswerCreationSessionQuestion).not.toHaveBeenCalled();
    expect(mockGenerateFromCreationSession).not.toHaveBeenCalled();
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
    expect(mockResetCreationSessionState).toHaveBeenCalledTimes(1);
  });

  test('active create session is shown even when a stale completed game exists', async () => {
    mockGameStoreState = buildGameStoreState({
      currentGame: {
        id: 'game-old',
        title: '旧作品',
        status: 'ready',
      },
      creationSession: {
        sessionId: 'session-active',
        entryMode: 'create',
        status: 'collecting',
        planDraft: '新的创作方案',
        confidenceSummary: '新的创作理解',
        currentQuestion: {
          content: '新的补充问题',
        },
      },
      getCreationFlowStage: jest.fn(() => 'collecting'),
    });

    render(<CreatePage />);

    await waitFor(() => {
      expect(screen.getByText('新的补充问题')).toBeTruthy();
    });
    expect(screen.queryByText('创作完成！')).toBeNull();
  });

  test('create page still probes active create sessions when store keeps a stale session from another entry mode', async () => {
    mockResetCreationSessionState.mockImplementation(() => {
      mockGameStoreState = {
        ...mockGameStoreState,
        creationSession: null,
        creationSessionError: null,
      };
    });
    mockGameStoreState = buildGameStoreState({
      creationSession: {
        sessionId: 'session-other',
        entryMode: 'iterate',
        status: 'collecting',
      },
    });
    mockGameService.getActiveCreationSession.mockResolvedValueOnce({
      sessionId: 'session-create',
      entryMode: 'create',
      title: '旧创作',
      prompt: '继续这轮创作',
    });

    render(<CreatePage />);
    await flushDidShowCallbacks();

    await waitFor(() => {
      expect(mockResetCreationSessionState).toHaveBeenCalled();
      expect(mockGameService.getActiveCreationSession).toHaveBeenCalled();
    });
  });

  test('opening create clears stale generation task state instead of auto-restoring the old task', async () => {
    mockGameStoreState = buildGameStoreState({
      currentTask: {
        taskId: 'task-old',
        status: 'running',
      },
      currentGame: {
        id: 'game-old',
        title: '旧作品',
        status: 'draft',
      },
    });

    render(<CreatePage />);
    await flushDidShowCallbacks();

    await waitFor(() => {
      expect(mockResetCreateSession).toHaveBeenCalledWith({ clearPersistedTask: false });
      expect(mockGameService.getActiveCreationSession).toHaveBeenCalled();
    });

    expect(mockRestorePersistedTask).not.toHaveBeenCalled();
  });

  test('initial create retry keeps the first prompt and offers a retry action', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSessionError: '创建失败，请重试',
    });

    render(<CreatePage />);

    fireEvent.change(screen.getByLabelText('create-initial-answer'), {
      target: { value: '做一个节奏更快的像素风闯关游戏' },
    });

    fireEvent.click(screen.getByText('发送'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        '做一个节奏更快的像素风闯关游戏',
        '',
        {
          entryMode: 'create',
          orientation: 'portrait',
          generationTier: 'standard',
        }
      );
    });

    expect(screen.getByLabelText('create-initial-answer').value).toBe('做一个节奏更快的像素风闯关游戏');
  });

  test('raw creation session abort errors are rendered as a friendly chinese message', () => {
    mockGameStoreState = buildGameStoreState({
      creationSessionError: 'The user aborted a request.',
    });

    render(<CreatePage />);

    expect(screen.getByText('创建游戏请求被中断了，请再试一次')).toBeTruthy();
  });
});
