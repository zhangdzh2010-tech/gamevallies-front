/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockStartCreationSession = jest.fn(() => Promise.resolve());
const mockGenerateFromCreationSession = jest.fn(() => Promise.resolve());
const mockAnswerCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockSkipCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockRestoreActiveCreationSession = jest.fn(() => Promise.resolve(null));
const mockRefreshCreationSession = jest.fn(() => Promise.resolve());
const mockCancelCurrentTask = jest.fn(() => Promise.resolve());
const mockResetCreationSessionState = jest.fn();
const mockShowToast = jest.fn();
const mockNavigateTo = jest.fn(() => Promise.resolve());
const mockOpenIteratePageWithAuth = jest.fn();
const mockGetActiveCreationSession = jest.fn(() => Promise.resolve(null));

let mockGameStoreState;

jest.mock('@tarojs/components', () => require('../../../test-utils/taroComponentsMock'));

jest.mock('@tarojs/hooks', () => ({
  useRoute: jest.fn(() => ({
    params: {
      sourceGameId: 'source-1',
    },
  })),
}));

jest.mock('@tarojs/taro', () => {
  const api = {
    showToast: mockShowToast,
    navigateTo: mockNavigateTo,
    showModal: jest.fn(),
  };

  return {
    __esModule: true,
    default: api,
    ...api,
  };
});

jest.mock('../../../components/common/AppTopBar', () => ({
  AppTopBar: () => <div>top-bar</div>,
}));

jest.mock('../../../components/common/GamePlayer', () => ({
  GlobalGamePlayer: () => <div>player</div>,
}));

jest.mock('../../../components/common/PageScrollContainer', () => ({
  PageScrollContainer: ({ children }) => <div>{children}</div>,
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
  CreationQuestionCard: ({ title, question, hint }) => (
    <div>
      <div>{title}</div>
      <div>{question?.content}</div>
      <div>{hint}</div>
    </div>
  ),
  CreationAnswerComposer: ({ value, onChange, placeholder, suggestions }) => (
    <div>
      <textarea
        aria-label="fork-initial-answer"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange({ detail: { value: e.target.value } })}
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
  CreationResumePrompt: ({ title, prompt, continueLabel, restartLabel, onContinue, onRestart }) => (
    <div>
      <div>{title}</div>
      <div>{prompt}</div>
      <button type="button" onClick={onContinue}>{continueLabel}</button>
      <button type="button" onClick={onRestart}>{restartLabel}</button>
    </div>
  ),
  CreationResumeScene: ({ subjectTitle, session }) => (
    <div>
      <div>resume-scene</div>
      <div>{subjectTitle}</div>
      <div>{session?.prompt}</div>
    </div>
  ),
  CreationEntryErrorCard: ({ error }) => <div>{error}</div>,
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
    className: 'fork-session-panel',
    panel: {
      session: config.session,
      answerValue: config.answerValue,
      onAnswerChange: config.onAnswerChange,
      answerPlaceholder: config.answerPlaceholder || '例如：保留核心玩法，但换成像素风，节奏再快一点。',
      actions: config.actions,
      errorMessage: config.errorMessage,
    },
  })),
  CreationSessionScene: ({ panel }) => (
    <div>
      <div>{typeof panel?.session?.planDraft === 'string' ? panel.session.planDraft : 'plan-card'}</div>
      <div>{panel?.session?.confidenceSummary || 'confidence-card'}</div>
      <div>{panel?.session?.messages?.map((message) => message.content).join(' ') || 'conversation-card'}</div>
      {panel?.session?.status === 'collecting' ? (
        <>
          <div>{panel?.session?.currentQuestion?.content || 'question-card'}</div>
          <textarea
            aria-label="fork-session-answer"
            value={panel?.answerValue}
            placeholder={panel?.answerPlaceholder}
            onChange={(e) => panel?.onAnswerChange({ detail: { value: e.target.value } })}
          />
        </>
      ) : null}
      <div>{panel?.session?.status === 'abandoned' ? '本轮复刻会话已结束，如需继续请重新开始新的会话。' : ''}</div>
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

jest.mock('../../../services/game', () => ({
  getGame: jest.fn(() => Promise.resolve({
    id: 'source-1',
    title: '原始跑酷',
    status: 'published',
    description: '一款节奏紧凑的跑酷作品',
    allowFork: true,
    forks: 12,
    likes: 48,
    plays: 530,
    author: {
      id: 'author-1',
      displayName: '作者A',
    },
  })),
  getActiveCreationSession: mockGetActiveCreationSession,
}));

jest.mock('../../../store/gameStore', () => ({
  PIPELINE_STAGES: [{ key: 'submitting', label: '提交创作请求', pct: 5 }],
  isCompletedGameStatus: jest.fn((status) => ['ready', 'draft', 'published', 'review'].includes(status)),
  useGameStore: jest.fn(() => mockGameStoreState),
}));

jest.mock('../../../utils/authNavigation', () => ({
  LOGIN_PAGE_URL: '/pages/login/index',
  buildForkPageUrl: jest.fn(() => '/pages/game/fork/index?sourceGameId=source-1'),
  isLoggedIn: jest.fn(() => true),
  openIteratePageWithAuth: mockOpenIteratePageWithAuth,
  setPostLoginRedirect: jest.fn(),
}));

jest.mock('../../../utils/storage', () => ({
  Storage: {
    getUser: jest.fn(() => ({
      id: 'viewer-1',
    })),
  },
}));

const ForkPage = require('../fork/index').default;

function buildGameStoreState(overrides = {}) {
  return {
    cancelCurrentTask: mockCancelCurrentTask,
    currentGame: null,
    currentTask: null,
    isGenerating: false,
    generationProgress: null,
    creationSession: null,
    creationSessionError: null,
    creationSessionSubmitting: false,
    refreshCreationSession: mockRefreshCreationSession,
    startCreationSession: mockStartCreationSession,
    answerCreationSessionQuestion: mockAnswerCreationSessionQuestion,
    skipCreationSessionQuestion: mockSkipCreationSessionQuestion,
    generateFromCreationSession: mockGenerateFromCreationSession,
    abandonCreationSession: jest.fn(() => Promise.resolve()),
    resetCreationSessionState: mockResetCreationSessionState,
    ...overrides,
  };
}

describe('Fork page creation session flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGameStoreState = buildGameStoreState();
  });

  test('does not auto-start a fork session before the user gives the first instruction', async () => {
    render(<ForkPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('fork-initial-answer')).toBeTruthy();
      expect(screen.getByText('开始复刻')).toBeTruthy();
    });

    expect(mockStartCreationSession).not.toHaveBeenCalled();
  });

  test('starts a fork session from the first user instruction', async () => {
    render(<ForkPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('fork-initial-answer')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('fork-initial-answer'), {
      target: { value: '保留贪吃蛇核心玩法，但换成赛博风，节奏更快一些。' },
    });
    fireEvent.click(screen.getByText('开始复刻'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        '保留贪吃蛇核心玩法，但换成赛博风，节奏更快一些。',
        '原始跑酷',
        expect.objectContaining({
          entryMode: 'fork',
          sourceGameId: 'source-1',
        })
      );
    });
  });

  test('renders fork creation session and can trigger generation', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: {
        sessionId: 'session-1',
        entryMode: 'fork',
        status: 'collecting',
        sourceGameId: 'source-1',
        generationTier: 'standard',
        planDraft: '系统建议保留跑酷核心，重点改角色和视觉包装',
        confidenceSummary: '已理解复刻目标',
        currentQuestion: {
          content: '你更想优先改角色主题还是关卡节奏？',
        },
        messages: [{ id: 'm1', role: 'user', content: '我想做一个像素风版本' }],
      },
    });

    render(<ForkPage />);

    await waitFor(() => {
      expect(screen.getByText('系统建议保留跑酷核心，重点改角色和视觉包装')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('开始复刻'));

    await waitFor(() => {
      expect(mockGenerateFromCreationSession).toHaveBeenCalledWith({
        orientation: 'portrait',
        generationTier: 'standard',
      });
    });
  });

  test('abandoned fork session shows notice and disables stale actions', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: {
        sessionId: 'session-2',
        entryMode: 'fork',
        status: 'abandoned',
        sourceGameId: 'source-1',
        planDraft: '旧复刻方案',
        confidenceSummary: '旧理解',
        currentQuestion: {
          content: '这个问题不该继续出现',
        },
      },
    });

    render(<ForkPage />);

    await waitFor(() => {
      expect(screen.getByText('本轮复刻会话已结束，如需继续请重新开始新的会话。')).toBeTruthy();
    });
    expect(screen.queryByText('这个问题不该继续出现')).toBeNull();
    expect(screen.getByText('开始复刻').disabled).toBe(true);
    expect(screen.getByText('跳过此题').disabled).toBe(true);
  });

  test('restart on fork session starts a brand new fork session', async () => {
    const mockAbandonCreationSession = jest.fn(() => Promise.resolve());
    mockGameStoreState = buildGameStoreState({
      abandonCreationSession: mockAbandonCreationSession,
      resetCreationSessionState: mockResetCreationSessionState,
      creationSession: {
        sessionId: 'session-3',
        entryMode: 'fork',
        status: 'collecting',
        sourceGameId: 'source-1',
        planDraft: '旧复刻方案',
        currentQuestion: {
          content: '旧问题',
        },
      },
    });

    render(<ForkPage />);

    await waitFor(() => {
      expect(screen.getByText('旧复刻方案')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('重新开始'));

    await waitFor(() => {
      expect(mockResetCreationSessionState).toHaveBeenCalledTimes(1);
      expect(mockAbandonCreationSession).toHaveBeenCalledWith('session-3');
      expect(mockStartCreationSession).not.toHaveBeenCalled();
    });
  });

  test('fork page ignores unrelated global generating state', async () => {
    mockGameStoreState = buildGameStoreState({
      isGenerating: true,
      currentTask: {
        taskId: 'task-other',
      },
      creationSession: {
        sessionId: 'session-other',
        entryMode: 'create',
        status: 'generating',
      },
    });

    render(<ForkPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('fork-initial-answer')).toBeTruthy();
    });
    expect(mockStartCreationSession).not.toHaveBeenCalled();
    expect(screen.queryByText('AI 正在生成复刻作品')).toBeNull();
  });

  test('initial fork retry keeps the first instruction and offers a retry action', async () => {
    mockStartCreationSession.mockImplementationOnce(() => Promise.reject(new Error('创建失败，请重试')));
    mockGameStoreState = buildGameStoreState({
      creationSessionError: '创建失败，请重试',
    });

    render(<ForkPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('fork-initial-answer')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('fork-initial-answer'), {
      target: { value: '保留核心玩法，但改成美食主题，节奏更轻快。' },
    });
    fireEvent.click(screen.getByText('开始复刻'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        '保留核心玩法，但改成美食主题，节奏更轻快。',
        '原始跑酷',
        expect.objectContaining({
          entryMode: 'fork',
          sourceGameId: 'source-1',
        })
      );
    });

    expect(screen.getByLabelText('fork-initial-answer').value).toBe('保留核心玩法，但改成美食主题，节奏更轻快。');
  });

  test('fork page clears a stale store session before showing the resume choice for the matching active session', async () => {
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
        entryMode: 'create',
        status: 'collecting',
      },
    });
    mockGetActiveCreationSession.mockResolvedValueOnce({
      sessionId: 'session-fork',
      entryMode: 'fork',
      sourceGameId: 'source-1',
      title: '原始跑酷',
      prompt: '继续这轮新版本对话',
    });

    render(<ForkPage />);

    await waitFor(() => {
      expect(mockResetCreationSessionState).toHaveBeenCalled();
      expect(screen.getByText('resume-scene')).toBeTruthy();
      expect(screen.getByText('继续这轮新版本对话')).toBeTruthy();
    });
  });
});
