/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockShowToast = jest.fn();
const mockGetSystemInfoSync = jest.fn(() => ({ windowHeight: 720 }));
const mockStartCreationSession = jest.fn(() => Promise.resolve());
const mockRestoreActiveCreationSession = jest.fn(() => Promise.resolve(null));
const mockRestorePersistedTask = jest.fn(() => Promise.resolve(true));
const mockCancelCurrentTask = jest.fn(() => Promise.resolve());
const mockAnswerCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockSkipCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockGenerateFromCreationSession = jest.fn(() => Promise.resolve());
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

jest.mock('../../../components/creation', () => ({
  CreationSessionShell: ({ title, sections }) => (
    <div>
      <div>{title}</div>
      {sections?.map((section) => (
        <div key={section.key}>{section.node}</div>
      ))}
    </div>
  ),
  CreationQuestionCard: ({ question }) => <div>{question?.content || 'question-card'}</div>,
  CreationAnswerComposer: ({ value, onChange, placeholder, suggestions }) => (
    <div>
      <textarea
        aria-label="create-initial-answer"
        value={value}
        onChange={(e) => onChange({ detail: { value: e.target.value } })}
        placeholder={placeholder}
      />
      {(suggestions || []).map((item) => (
        <button key={item} type="button" onClick={() => onChange({ detail: { value: item } })}>
          {item}
        </button>
      ))}
    </div>
  ),
  CreationSessionActions: ({ actions }) => (
    <div>
      {(actions || []).map((action) => (
        <button key={action.key} type="button" onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </button>
      ))}
    </div>
  ),
  buildCreationSessionActions: jest.fn((config) => ([
    {
      key: 'submit',
      label: config.submitting ? '提交中...' : '提交回答',
      disabled: config.submitting || !String(config.answerValue || '').trim(),
      onClick: config.onSubmit,
    },
    {
      key: 'skip',
      label: '跳过此题',
      disabled: config.submitting,
      onClick: config.onSkip,
    },
    {
      key: 'generate',
      label: config.generateLabel,
      disabled: config.submitting,
      onClick: config.onGenerate,
    },
    {
      key: 'restart',
      label: '重新开始',
      disabled: config.submitting,
      onClick: config.onRestart,
    },
  ])),
  buildCreationSessionSceneProps: jest.fn((config) => ({
    layout: 'shell',
    shell: {
      title: '先确认创作理解，再交给 AI 开始生成',
      statusValue: config.statusValue,
    },
    panel: {
      session: config.session,
      answerValue: config.answerValue,
      onAnswerChange: config.onAnswerChange,
      answerPlaceholder: config.answerPlaceholder || '如果系统理解偏了，也可以直接写“你理解偏了，我想要……”',
      actions: config.actions,
      errorMessage: config.errorMessage,
    },
  })),
  CreationSessionScene: ({ shell, panel }) => (
    <div>
      <div>{shell?.title}</div>
      <div>{typeof panel?.session?.planDraft === 'string' ? panel.session.planDraft : 'plan-card'}</div>
      <div>{panel?.session?.confidenceSummary || panel?.session?.questionStrategy || 'confidence-card'}</div>
      <div>{panel?.session?.messages?.map((message) => message.content).join(' ') || 'conversation-card'}</div>
      {panel?.session?.status === 'collecting' ? (
        <>
          <div>{panel?.session?.currentQuestion?.content || 'question-card'}</div>
          <textarea aria-label="session-answer" value={panel?.answerValue} onChange={(e) => panel?.onAnswerChange({ detail: { value: e.target.value } })} placeholder={panel?.answerPlaceholder} />
        </>
      ) : null}
      <div>
        {panel?.session?.status === 'expired' ? '本轮创作会话已过期，请重新开始，系统会基于最新信息重新整理方案。' : ''}
      </div>
      <div>
        {(panel?.actions || []).map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            disabled={Boolean(action.disabled)
              || (action.key === 'submit' && panel?.session?.status !== 'collecting')
              || (action.key === 'skip' && panel?.session?.status !== 'collecting')
              || (action.key === 'generate' && !['collecting', 'ready'].includes(panel?.session?.status))}
          >
            {action.label}
          </button>
        ))}
      </div>
      {panel?.errorMessage ? <div>{panel.errorMessage}</div> : null}
    </div>
  ),
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
    restoreActiveCreationSession: mockRestoreActiveCreationSession,
    startCreationSession: mockStartCreationSession,
    answerCreationSessionQuestion: mockAnswerCreationSessionQuestion,
    skipCreationSessionQuestion: mockSkipCreationSessionQuestion,
    generateFromCreationSession: mockGenerateFromCreationSession,
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
    mockGameStoreState = buildGameStoreState();
  });

  test('creative textarea keeps the intended 2000-char limit and submits long input', async () => {
    render(<CreatePage />);

    const textarea = screen.getByLabelText('create-initial-answer');
    const longPrompt = 'creative'.repeat(180);

    expect(screen.getByText(PORTRAIT_TEXT)).toBeTruthy();

    fireEvent.change(textarea, { target: { value: longPrompt } });
    expect(screen.getByText(`${longPrompt.length}/2000`)).toBeTruthy();

    fireEvent.click(screen.getByText('先看 AI 怎么理解'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(longPrompt, '', {
        entryMode: 'create',
        orientation: 'portrait',
        generationTier: 'standard',
      });
    });
  });

  test('example prompt click fills the textarea and short prompts are blocked', async () => {
    render(<CreatePage />);

    fireEvent.click(screen.getByText('做一个贪吃蛇游戏，触屏滑动控制方向，吃到食物会变长，撞墙或撞到自己游戏结束。'));

    expect(screen.getByLabelText('create-initial-answer').value).toContain('\u8d2a\u5403\u86c7');

    fireEvent.change(screen.getByLabelText('create-initial-answer'), {
      target: { value: '\u592a\u77ed' },
    });
    expect(screen.getByText('先看 AI 怎么理解').disabled).toBe(true);
    expect(mockStartCreationSession).not.toHaveBeenCalled();
  });

  test('orientation defaults to portrait and can switch to landscape before submit', async () => {
    render(<CreatePage />);

    fireEvent.change(screen.getByLabelText('create-initial-answer'), {
      target: { value: 'build a horizontal shooter game with a spaceship and enemies' },
    });
    fireEvent.click(screen.getByText(LANDSCAPE_TEXT));
    fireEvent.click(screen.getByText('先看 AI 怎么理解'));

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

    expect(screen.getByText('先确认创作理解，再交给 AI 开始生成')).toBeTruthy();
    expect(screen.getByText('这是系统整理出的第一版方案')).toBeTruthy();
    fireEvent.click(screen.getByText('直接开始创作'));

    await waitFor(() => {
      expect(mockGenerateFromCreationSession).toHaveBeenCalledWith({
        orientation: 'portrait',
        generationTier: 'standard',
      });
    });
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
    expect(screen.getByText('直接开始创作').disabled).toBe(true);
    expect(screen.getByText('跳过此题').disabled).toBe(true);
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

  test('active create session is shown even when a stale completed game exists', () => {
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

    expect(screen.getByText('先确认创作理解，再交给 AI 开始生成')).toBeTruthy();
    expect(screen.getByText('新的创作方案')).toBeTruthy();
    expect(screen.queryByText('创作完成！')).toBeNull();
  });
});
