/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockStartCreationSession = jest.fn(() => Promise.resolve({ sessionId: 'fork-new' }));
const mockGenerateFromCreationSession = jest.fn(() => Promise.resolve());
const mockAnswerCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockSkipCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockRefreshCreationSession = jest.fn(() => Promise.resolve());
const mockAbandonCreationSession = jest.fn(() => Promise.resolve());
const mockCancelCurrentTask = jest.fn(() => Promise.resolve());
const mockResetCreationSessionState = jest.fn();
const mockShowToast = jest.fn();
const mockNavigateTo = jest.fn(() => Promise.resolve());
const mockOpenIteratePageWithAuth = jest.fn();
const mockSetPostLoginRedirect = jest.fn();
const mockGetActiveCreationSession = jest.fn(() => Promise.resolve(null));
const mockGetGame = jest.fn();

const mockSourceGame = {
  id: 'source-1',
  title: 'Source Game',
  status: 'published',
  description: 'Community puzzle game',
  orientation: 'portrait',
  allowFork: true,
  plays: 530,
  likes: 48,
  forks: 12,
  author: {
    id: 'author-1',
    displayName: 'Author One',
  },
};

const mockForkSession = {
  sessionId: 'fork-1',
  entryMode: 'fork',
  sourceGameId: 'source-1',
  status: 'collecting',
  prompt: 'Keep the core loop but swap the art style',
  planDraft: 'Version the art and keep the loop readable.',
  currentQuestion: {
    content: 'What should remain unchanged?',
    skippable: true,
  },
  messages: [
    {
      id: 'msg-1',
      role: 'assistant',
      content: 'Tell me what to keep and what to change.',
    },
  ],
};

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
        aria-label={session ? 'fork-session-answer' : 'fork-initial-answer'}
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
  getActiveCreationSession: (...args) => mockGetActiveCreationSession(...args),
}));

jest.mock('../../../store/gameStore', () => ({
  PIPELINE_STAGES: [{ key: 'submitting', label: 'Submitting', pct: 5 }],
  isCompletedGameStatus: jest.fn((status) => ['ready', 'draft', 'published', 'review'].includes(status)),
  useGameStore: jest.fn(() => mockGameStoreState),
}));

jest.mock('../../../utils/authNavigation', () => ({
  LOGIN_PAGE_URL: '/pages/login/index',
  buildForkPageUrl: jest.fn(() => '/pages/game/fork/index?sourceGameId=source-1'),
  isLoggedIn: jest.fn(() => true),
  openIteratePageWithAuth: (...args) => mockOpenIteratePageWithAuth(...args),
  setPostLoginRedirect: (...args) => mockSetPostLoginRedirect(...args),
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
    error: '',
    terminalError: null,
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
    ...overrides,
  };
}

describe('Fork page creation session flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGame.mockResolvedValue(mockSourceGame);
    mockGameStoreState = buildGameStoreState();
  });

  test('does not auto-start a fork session before the first instruction', async () => {
    render(<ForkPage />);

    expect(await screen.findByLabelText('fork-initial-answer')).toBeTruthy();
    await waitFor(() => {
      expect(mockGetActiveCreationSession).toHaveBeenCalled();
    });
    expect(mockStartCreationSession).not.toHaveBeenCalled();
  });

  test('starts a fork session from the first message', async () => {
    render(<ForkPage />);

    const initialInput = await screen.findByLabelText('fork-initial-answer');
    fireEvent.change(initialInput, { target: { value: 'Keep the loop and switch to neon visuals' } });
    fireEvent.click(screen.getByTestId('workspace-send'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        'Keep the loop and switch to neon visuals',
        'Source Game',
        expect.objectContaining({
          entryMode: 'fork',
          sourceGameId: 'source-1',
          generationTier: 'standard',
        }),
      );
    });
  });

  test('renders the streaming draft and submits follow-up answers for an active fork session', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: mockForkSession,
      creationSessionStreamingReply: {
        id: 'fork-draft-1',
        role: 'assistant',
        content: 'Live streamed fork draft',
        isStreaming: true,
      },
    });

    render(<ForkPage />);

    const answerInput = await screen.findByLabelText('fork-session-answer');
    expect(screen.getByTestId('workspace-streaming').textContent).toBe('Live streamed fork draft');

    fireEvent.change(answerInput, { target: { value: 'Keep the core puzzle but soften the difficulty curve' } });
    fireEvent.click(screen.getByTestId('workspace-send'));

    await waitFor(() => {
      expect(mockAnswerCreationSessionQuestion).toHaveBeenCalledWith('Keep the core puzzle but soften the difficulty curve');
    });
  });

  test('shows the resume scene for a matching active fork session restored from the backend', async () => {
    mockGetActiveCreationSession.mockResolvedValueOnce({
      sessionId: 'resume-fork-1',
      entryMode: 'fork',
      sourceGameId: 'source-1',
      title: 'Source Game',
      prompt: 'Keep the same mechanics but add a sci-fi layer',
    });

    render(<ForkPage />);

    expect(await screen.findByTestId('resume-scene')).toBeTruthy();

    fireEvent.click(screen.getByTestId('resume-continue'));

    await waitFor(() => {
      expect(mockRefreshCreationSession).toHaveBeenCalledWith('resume-fork-1');
    });
  });
});
