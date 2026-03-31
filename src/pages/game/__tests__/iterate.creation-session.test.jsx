/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockStartCreationSession = jest.fn(() => Promise.resolve());
const mockGenerateFromCreationSession = jest.fn(() => Promise.resolve());
const mockAnswerCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockSkipCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockRestoreActiveCreationSession = jest.fn(() => Promise.resolve(null));
const mockRestorePersistedTask = jest.fn(() => Promise.resolve(true));
const mockCancelCurrentTask = jest.fn(() => Promise.resolve());
const mockSetCurrentGame = jest.fn();
const mockShowToast = jest.fn();
const mockNavigateTo = jest.fn(() => Promise.resolve());
const mockOpenGame = jest.fn();
const mockOpenPaywall = jest.fn();

let mockGameStoreState;

jest.mock('@tarojs/components', () => require('../../../test-utils/taroComponentsMock'));

jest.mock('@tarojs/hooks', () => ({
  useRoute: jest.fn(() => ({
    params: {
      gameId: 'game-1',
      taskId: '',
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
  AppTopBar: ({ rightText, onRightClick }) => (
    <button type="button" onClick={onRightClick}>{rightText || 'top-bar'}</button>
  ),
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
        aria-label="iterate-initial-answer"
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
    className: 'iterate-session-panel',
    panel: {
      session: config.session,
      headerTitle: '动态优化会话',
      answerValue: config.answerValue,
      onAnswerChange: config.onAnswerChange,
      answerPlaceholder: config.answerPlaceholder || '例如：保留核心玩法，把节奏再快一点，角色改成像素风。',
      actions: config.actions,
      errorMessage: config.errorMessage,
    },
  })),
  CreationSessionScene: ({ panel }) => (
    <div>
      <div>{panel?.headerTitle}</div>
      <div>{typeof panel?.session?.planDraft === 'string' ? panel.session.planDraft : 'plan-card'}</div>
      <div>{panel?.session?.confidenceSummary || 'confidence-card'}</div>
      <div>{panel?.session?.messages?.map((message) => message.content).join(' ') || 'conversation-card'}</div>
      {panel?.session?.status === 'collecting' ? (
        <>
          <div>{panel?.session?.currentQuestion?.content || 'question-card'}</div>
          <textarea
            aria-label="iterate-session-answer"
            value={panel?.answerValue}
            placeholder={panel?.answerPlaceholder}
            onChange={(e) => panel?.onAnswerChange({ detail: { value: e.target.value } })}
          />
        </>
      ) : null}
      <div>{panel?.session?.status === 'failed' ? '本轮优化会话遇到异常，建议重新开始，避免沿用不完整上下文。' : ''}</div>
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
    id: 'game-1',
    title: '像素跑酷',
    status: 'ready',
    description: '一款节奏很快的像素跑酷游戏',
    orientation: 'portrait',
    canPlay: true,
  })),
  getGenerationStatus: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../../../stores/gamePlayer', () => ({
  __esModule: true,
  default: jest.fn((selector) => selector({ openGame: mockOpenGame })),
}));

jest.mock('../../../stores/quotaStore', () => ({
  __esModule: true,
  default: jest.fn((selector) => selector({ openPaywall: mockOpenPaywall })),
}));

jest.mock('../../../utils/authNavigation', () => ({
  LOGIN_PAGE_URL: '/pages/login/index',
  buildIteratePageUrl: jest.fn(() => '/pages/game/iterate/index?gameId=game-1'),
  isLoggedIn: jest.fn(() => true),
  openProfilePageWithTab: jest.fn(),
  setPostLoginRedirect: jest.fn(),
}));

jest.mock('../../../store/gameStore', () => ({
  PIPELINE_STAGES: [{ key: 'submitting', label: '提交创作请求', pct: 5 }],
  isCompletedGameStatus: jest.fn((status) => ['ready', 'draft', 'published', 'review'].includes(status)),
  useGameStore: jest.fn(() => mockGameStoreState),
}));

const IteratePage = require('../iterate/index').default;

function buildGameStoreState(overrides = {}) {
  return {
    iterateGame: jest.fn(),
    restorePersistedTask: mockRestorePersistedTask,
    cancelCurrentTask: mockCancelCurrentTask,
    isGenerating: false,
    generationProgress: null,
    currentGame: {
      id: 'game-1',
      title: '像素跑酷',
      status: 'ready',
      description: '一款节奏很快的像素跑酷游戏',
      orientation: 'portrait',
      canPlay: true,
    },
    currentTask: null,
    error: '',
    terminalError: null,
    clearError: jest.fn(),
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
    resetCreationSessionState: jest.fn(),
    setCurrentGame: mockSetCurrentGame,
    ...overrides,
  };
}

describe('Iterate page creation session flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGameStoreState = buildGameStoreState();
  });

  test('does not auto-start an iterate session before the user gives the first instruction', async () => {
    render(<IteratePage />);

    await waitFor(() => {
      expect(screen.getByText('先说说这次最想优化哪里')).toBeTruthy();
    });

    expect(mockStartCreationSession).not.toHaveBeenCalled();
  });

  test('starts an iterate session from the first user instruction', async () => {
    render(<IteratePage />);

    fireEvent.change(screen.getByLabelText('iterate-initial-answer'), {
      target: { value: '我想先把节奏提快一点，并强化吃到食物时的反馈。' },
    });
    fireEvent.click(screen.getByText('开始这轮优化对话'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        '我想先把节奏提快一点，并强化吃到食物时的反馈。',
        '像素跑酷',
        expect.objectContaining({
          entryMode: 'iterate',
          sourceGameId: 'game-1',
        })
      );
    });
  });

  test('renders creation session UI and can trigger direct generation', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: {
        sessionId: 'session-1',
        entryMode: 'iterate',
        status: 'collecting',
        sourceGameId: 'game-1',
        generationTier: 'standard',
        planDraft: '系统建议保留跑酷核心，重点优化节奏和反馈',
        confidenceSummary: '已理解主要改动方向',
        currentQuestion: {
          content: '你更想优先优化速度节奏还是角色表现？',
        },
        messages: [{ id: 'm1', role: 'user', content: '想让它更爽快一点' }],
      },
      getCreationFlowStage: jest.fn(() => 'collecting'),
    });

    render(<IteratePage />);

    expect(screen.getByText('动态优化会话')).toBeTruthy();
    expect(screen.getByText('系统建议保留跑酷核心，重点优化节奏和反馈')).toBeTruthy();

    fireEvent.click(screen.getByText('直接开始优化'));

    await waitFor(() => {
      expect(mockGenerateFromCreationSession).toHaveBeenCalledWith({
        orientation: 'portrait',
        generationTier: 'standard',
      });
    });
  });

  test('failed iterate session shows notice and keeps stale actions disabled', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: {
        sessionId: 'session-2',
        entryMode: 'iterate',
        status: 'failed',
        sourceGameId: 'game-1',
        planDraft: '已有旧方案',
        confidenceSummary: '旧理解',
        currentQuestion: {
          content: '这个问题不该继续出现',
        },
      },
      getCreationFlowStage: jest.fn(() => 'failed'),
    });

    render(<IteratePage />);

    expect(screen.getByText('本轮优化会话遇到异常，建议重新开始，避免沿用不完整上下文。')).toBeTruthy();
    expect(screen.queryByText('这个问题不该继续出现')).toBeNull();
    expect(screen.getByText('直接开始优化').disabled).toBe(true);
    expect(screen.getByText('跳过此题').disabled).toBe(true);
  });
});
