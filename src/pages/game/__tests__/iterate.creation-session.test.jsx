/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockStartCreationSession = jest.fn(() => Promise.resolve({ sessionId: 'iter-new' }));
const mockGenerateFromCreationSession = jest.fn(() => Promise.resolve());
const mockAnswerCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockSkipCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockRefreshCreationSession = jest.fn(() => Promise.resolve());
const mockAbandonCreationSession = jest.fn(() => Promise.resolve());
const mockRestorePersistedTask = jest.fn(() => Promise.resolve(true));
const mockCancelCurrentTask = jest.fn(() => Promise.resolve());
const mockSetCurrentGame = jest.fn();
const mockResetCreationSessionState = jest.fn();
const mockShowToast = jest.fn();
const mockNavigateTo = jest.fn(() => Promise.resolve());
const mockOpenGame = jest.fn();
const mockOpenPaywall = jest.fn();
const mockOpenProfilePageWithTab = jest.fn();
const mockSetPostLoginRedirect = jest.fn();
const mockGetActiveCreationSession = jest.fn(() => Promise.resolve(null));
const mockGetGame = jest.fn();
const mockGetGenerationStatus = jest.fn(() => Promise.resolve(null));

const mockReadyGame = {
  id: 'game-1',
  title: 'Pixel Runner',
  status: 'ready',
  description: 'Fast arcade platformer',
  orientation: 'portrait',
  canPlay: true,
  type: 'casual',
};

const mockIterateSession = {
  sessionId: 'iter-1',
  entryMode: 'iterate',
  sourceGameId: 'game-1',
  status: 'collecting',
  prompt: 'Make the loop faster',
  planDraft: 'Speed up the pacing and feedback.',
  currentQuestion: {
    content: 'Which part should feel faster?',
    skippable: true,
  },
  messages: [
    {
      id: 'msg-1',
      role: 'assistant',
      content: 'Tell me what you want to improve first.',
    },
  ],
};

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
  PipelineOrbit: ({ title, stageLabel }) => (
    <div>
      <div>{title}</div>
      <div>{stageLabel}</div>
    </div>
  ),
}));

jest.mock('../../../components/common/PaywallPopup', () => ({
  PaywallPopup: () => <div>paywall</div>,
}));

jest.mock('../../../components/creation', () => ({
  CreationCreateWorkspace: ({
    topContent,
    session,
    streamingMessage,
    inputValue,
    onInputChange,
    onSend,
    onSkip,
    onGenerate,
    onPreview,
    errorMessage,
  }) => (
    <div data-testid="workspace">
      {topContent}
      {streamingMessage?.content ? (
        <div data-testid="workspace-streaming">{streamingMessage.content}</div>
      ) : null}
      <textarea
        aria-label={session ? 'iterate-session-answer' : 'iterate-initial-answer'}
        value={inputValue}
        onChange={(e) => onInputChange({ detail: { value: e.target.value } })}
      />
      <button data-testid="workspace-send" type="button" onClick={onSend}>send</button>
      <button data-testid="workspace-skip" type="button" onClick={onSkip}>skip</button>
      <button data-testid="workspace-generate" type="button" onClick={onGenerate}>generate</button>
      <button data-testid="workspace-preview" type="button" onClick={onPreview}>preview</button>
      {errorMessage ? <div>{errorMessage}</div> : null}
    </div>
  ),
  CreationReferenceCard: ({ title, description }) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
    </div>
  ),
  CreationResumeScene: ({ subjectTitle, session, onContinue, onRestart }) => (
    <div data-testid="resume-scene">
      <div>{subjectTitle}</div>
      <div>{session?.prompt || ''}</div>
      <button data-testid="resume-continue" type="button" onClick={onContinue}>continue</button>
      <button data-testid="resume-restart" type="button" onClick={onRestart}>restart</button>
    </div>
  ),
  CreationSessionActions: ({ actions }) => (
    <div>
      {(actions || []).map((action) => (
        <button key={action.key} type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </div>
  ),
  CreationSessionShell: ({ title, sections }) => (
    <div>
      <div>{title}</div>
      {(sections || []).map((section) => (
        <div key={section.key}>{section.node}</div>
      ))}
    </div>
  ),
  CreationStateCard: ({ title, description }) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
    </div>
  ),
  canGenerateCreationSession: jest.fn((status) => ['collecting', 'ready'].includes(status)),
  isCreationSessionQuestioning: jest.fn((status) => ['collecting', 'ready'].includes(status)),
}));

jest.mock('../../../services/game', () => ({
  getGame: (...args) => mockGetGame(...args),
  getGenerationStatus: (...args) => mockGetGenerationStatus(...args),
  getActiveCreationSession: (...args) => mockGetActiveCreationSession(...args),
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
  openProfilePageWithTab: (...args) => mockOpenProfilePageWithTab(...args),
  setPostLoginRedirect: (...args) => mockSetPostLoginRedirect(...args),
}));

jest.mock('../../../store/gameStore', () => ({
  PIPELINE_STAGES: [{ key: 'submitting', label: 'Submitting', pct: 5 }],
  isCompletedGameStatus: jest.fn((status) => ['ready', 'draft', 'published', 'review'].includes(status)),
  useGameStore: jest.fn(() => mockGameStoreState),
}));

const IteratePage = require('../iterate/index').default;

function buildGameStoreState(overrides = {}) {
  return {
    restorePersistedTask: mockRestorePersistedTask,
    cancelCurrentTask: mockCancelCurrentTask,
    isGenerating: false,
    generationProgress: null,
    currentGame: mockReadyGame,
    currentTask: null,
    error: '',
    terminalError: null,
    canPlay: true,
    creationSession: null,
    creationSessionError: null,
    creationSessionSubmitting: false,
    creationSessionStreamingReply: null,
    refreshCreationSession: mockRefreshCreationSession,
    startCreationSession: mockStartCreationSession,
    answerCreationSessionQuestion: mockAnswerCreationSessionQuestion,
    skipCreationSessionQuestion: mockSkipCreationSessionQuestion,
    generateFromCreationSession: mockGenerateFromCreationSession,
    abandonCreationSession: mockAbandonCreationSession,
    resetCreationSessionState: mockResetCreationSessionState,
    setCurrentGame: mockSetCurrentGame,
    ...overrides,
  };
}

describe('Iterate page creation session flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGame.mockResolvedValue(mockReadyGame);
    mockGameStoreState = buildGameStoreState();
  });

  test('does not auto-start an iterate session before the first instruction', async () => {
    render(<IteratePage />);

    expect(await screen.findByLabelText('iterate-initial-answer')).toBeTruthy();
    await waitFor(() => {
      expect(mockGetActiveCreationSession).toHaveBeenCalled();
    });
    expect(mockStartCreationSession).not.toHaveBeenCalled();
  });

  test('starts an iterate session from the first message', async () => {
    render(<IteratePage />);

    const initialInput = await screen.findByLabelText('iterate-initial-answer');
    fireEvent.change(initialInput, { target: { value: 'Tighten the jump timing' } });
    fireEvent.click(screen.getByTestId('workspace-send'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        'Tighten the jump timing',
        'Pixel Runner',
        expect.objectContaining({
          entryMode: 'iterate',
          sourceGameId: 'game-1',
          generationTier: 'standard',
        }),
      );
    });
  });

  test('renders the streaming draft and submits follow-up answers for an active iterate session', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: mockIterateSession,
      creationSessionStreamingReply: {
        id: 'draft-1',
        role: 'assistant',
        content: 'Live streamed plan draft',
        isStreaming: true,
      },
    });

    render(<IteratePage />);

    const answerInput = await screen.findByLabelText('iterate-session-answer');
    expect(screen.getByTestId('workspace-streaming').textContent).toBe('Live streamed plan draft');

    fireEvent.change(answerInput, { target: { value: 'Focus on the landing feedback' } });
    fireEvent.click(screen.getByTestId('workspace-send'));

    await waitFor(() => {
      expect(mockAnswerCreationSessionQuestion).toHaveBeenCalledWith('Focus on the landing feedback');
    });
  });

  test('shows the resume scene for a matching active iterate session restored from the backend', async () => {
    mockGetActiveCreationSession.mockResolvedValueOnce({
      sessionId: 'resume-iter-1',
      entryMode: 'iterate',
      sourceGameId: 'game-1',
      title: 'Pixel Runner',
      prompt: 'Keep the speed but reduce frustration',
    });

    render(<IteratePage />);

    expect(await screen.findByTestId('resume-scene')).toBeTruthy();

    fireEvent.click(screen.getByTestId('resume-continue'));

    await waitFor(() => {
      expect(mockRefreshCreationSession).toHaveBeenCalledWith('resume-iter-1');
    });
  });
});
