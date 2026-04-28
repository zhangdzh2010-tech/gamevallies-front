/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockStartCreationSession = jest.fn(() => Promise.resolve({ sessionId: 'fork-new', generationTier: 'standard' }));
const mockConfirmEditedPrompt = jest.fn(() => Promise.resolve());
const mockConfirmCurrentPrompt = jest.fn(() => Promise.resolve());
const mockConfirmAndGenerate = jest.fn(() => Promise.resolve());
const mockRefreshCreationSession = jest.fn(() => Promise.resolve());
const mockAbandonCreationSession = jest.fn(() => Promise.resolve());
const mockCancelCurrentTask = jest.fn(() => Promise.resolve());
const mockResetCreationSessionState = jest.fn();
const mockShowToast = jest.fn();
const mockNavigateTo = jest.fn(() => Promise.resolve());
const mockOpenGame = jest.fn();
const mockOpenIteratePageWithAuth = jest.fn();
const mockSetPostLoginRedirect = jest.fn();
const mockGetActiveCreationSession = jest.fn(() => Promise.resolve(null));
const mockGetGame = jest.fn();
const mockBuildGameDetailPath = jest.fn((id, params = {}) => {
  const query = new URLSearchParams({ id, ...params }).toString();
  return `/pages/game/detail/index?${query}`;
});

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

const mockForkResultGame = {
  id: 'fork-result-1',
  title: 'Fork Result',
  status: 'ready',
  description: 'Forked game result',
  orientation: 'portrait',
  gameUrl: 'https://play.example/fork-result',
  canPlay: true,
};

const mockForkSession = {
  sessionId: 'fork-1',
  entryMode: 'fork',
  sourceGameId: 'source-1',
  status: 'collecting',
  prompt: 'Keep the core loop but swap the art style',
  expandedPrompt: 'Expanded fork prompt',
  currentQuestion: {
    content: 'Please confirm or edit the prompt.',
  },
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

jest.mock('../../../components/common/GenerationProgressPanel', () => ({
  GenerationProgressPanel: ({ stageLabel }) => <div>{stageLabel}</div>,
}));

jest.mock('../../../components/common/PaywallPopup', () => ({
  PaywallPopup: () => <div>paywall</div>,
}));

jest.mock('../../../components/creation', () => ({
  CreationCreateWorkspace: ({
    session,
    inputValue,
    onInputChange,
    onPrimaryAction,
    secondaryActions = [],
    topContent,
  }) => (
    <div data-testid="workspace">
      {topContent}
      <textarea
        aria-label={session ? 'fork-session-prompt' : 'fork-initial-prompt'}
        value={inputValue}
        onChange={(e) => onInputChange({ detail: { value: e.target.value } })}
      />
      <button data-testid="workspace-primary" type="button" onClick={onPrimaryAction}>primary</button>
      {secondaryActions.map((action) => (
        <button
          key={action.key}
          data-testid={`secondary-${action.key}`}
          type="button"
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ))}
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

jest.mock('../../../stores/gamePlayer', () => ({
  __esModule: true,
  default: jest.fn((selector) => selector({ openGame: mockOpenGame })),
}));

jest.mock('../../../utils/gameOrientation', () => ({
  getGameOrientation: jest.fn(() => 'portrait'),
}));

jest.mock('../../../utils/media', () => ({
  getGameCoverUrl: jest.fn(() => 'https://img.example/fork-cover.png'),
}));

jest.mock('../../../utils/share', () => ({
  buildGameDetailPath: (...args) => mockBuildGameDetailPath(...args),
}));

jest.mock('../../../utils/storage', () => ({
  Storage: {
    getUser: jest.fn(() => ({
      id: 'viewer-1',
    })),
  },
}));

jest.mock('../../../utils/runtime', () => ({
  isH5Runtime: jest.fn(() => true),
}));

jest.mock('../../../utils/systemInfo', () => ({
  getSafeSystemInfo: jest.fn(() => ({ windowHeight: 720 })),
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
    creationSessionUiState: {
      isInitializing: false,
      isAwaitingPromptConfirmation: false,
      canGenerate: false,
      canEditPrompt: false,
    },
    creationSessionError: null,
    creationSessionSubmitting: false,
    refreshCreationSession: mockRefreshCreationSession,
    startCreationSession: mockStartCreationSession,
    confirmEditedPrompt: mockConfirmEditedPrompt,
    confirmCurrentPrompt: mockConfirmCurrentPrompt,
    confirmAndGenerate: mockConfirmAndGenerate,
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

    expect(await screen.findByLabelText('fork-initial-prompt')).toBeTruthy();
    await waitFor(() => {
      expect(mockGetActiveCreationSession).toHaveBeenCalled();
    });
    expect(mockStartCreationSession).not.toHaveBeenCalled();
  });

  test('starts a fork session from the first instruction', async () => {
    render(<ForkPage />);

    const initialInput = await screen.findByLabelText('fork-initial-prompt');
    fireEvent.change(initialInput, { target: { value: 'Keep the loop and switch to neon visuals' } });
    fireEvent.click(screen.getByTestId('workspace-primary'));

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

  test('confirms an edited fork prompt for an active session', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: mockForkSession,
      creationSessionUiState: {
        isInitializing: false,
        isAwaitingPromptConfirmation: true,
        canGenerate: true,
        canEditPrompt: true,
      },
    });

    render(<ForkPage />);

    const promptInput = await screen.findByLabelText('fork-session-prompt');
    fireEvent.change(promptInput, { target: { value: 'Expanded fork prompt with clearer art direction' } });
    fireEvent.click(screen.getByTestId('workspace-primary'));

    await waitFor(() => {
      expect(mockConfirmEditedPrompt).toHaveBeenCalledWith('Expanded fork prompt with clearer art direction');
    });
  });

  test('direct generate from the first instruction chains through confirmAndGenerate', async () => {
    render(<ForkPage />);

    const initialInput = await screen.findByLabelText('fork-initial-prompt');
    fireEvent.change(initialInput, { target: { value: 'Keep the puzzle loop but add sci-fi art' } });
    fireEvent.click(screen.getByTestId('secondary-generate-fork-directly'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        'Keep the puzzle loop but add sci-fi art',
        'Source Game',
        expect.objectContaining({
          entryMode: 'fork',
          sourceGameId: 'source-1',
          generationTier: 'standard',
        }),
      );
    });

    await waitFor(() => {
      expect(mockConfirmAndGenerate).toHaveBeenCalledWith(expect.objectContaining({
        editedPrompt: '',
        generationTier: 'standard',
      }));
    });
  });

  test('offers play and detail exits after a fork result completes', async () => {
    mockGameStoreState = buildGameStoreState({
      currentGame: mockForkResultGame,
      creationSession: {
        ...mockForkSession,
        status: 'generating',
        gameId: 'fork-result-1',
      },
    });

    render(<ForkPage />);

    expect(await screen.findByText('Fork Result')).toBeTruthy();

    fireEvent.click(screen.getByText('试玩这版'));
    expect(mockOpenGame).toHaveBeenCalledWith(
      'https://play.example/fork-result',
      'Fork Result',
      'https://img.example/fork-cover.png',
      expect.objectContaining({
        canPlay: true,
        gameId: 'fork-result-1',
        orientation: 'portrait',
      }),
    );

    fireEvent.click(screen.getByText('查看详情'));
    expect(mockNavigateTo).toHaveBeenCalledWith({
      url: '/pages/game/detail/index?id=fork-result-1&authorView=1',
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
