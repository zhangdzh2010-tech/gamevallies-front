/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockStartCreationSession = jest.fn(() => Promise.resolve({ sessionId: 'iter-new', generationTier: 'standard' }));
const mockConfirmEditedPrompt = jest.fn(() => Promise.resolve());
const mockConfirmCurrentPrompt = jest.fn(() => Promise.resolve());
const mockConfirmAndGenerate = jest.fn(() => Promise.resolve());
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

const mockIterateResultGame = {
  id: 'generated-game-2',
  title: 'Updated Runner',
  status: 'ready',
  description: 'Updated arcade platformer',
  orientation: 'portrait',
  gameUrl: 'https://play.example/updated-runner',
  canPlay: true,
  type: 'casual',
};

const mockIterateSession = {
  sessionId: 'iter-1',
  entryMode: 'iterate',
  sourceGameId: 'game-1',
  status: 'collecting',
  prompt: 'Make the loop faster',
  expandedPrompt: 'Expanded iterate prompt',
  currentQuestion: {
    content: 'Please confirm or edit the prompt.',
  },
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
        aria-label={session ? 'iterate-session-prompt' : 'iterate-initial-prompt'}
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

    expect(await screen.findByLabelText('iterate-initial-prompt')).toBeTruthy();
    await waitFor(() => {
      expect(mockGetActiveCreationSession).toHaveBeenCalled();
    });
    expect(mockStartCreationSession).not.toHaveBeenCalled();
  });

  test('starts an iterate session from the first instruction', async () => {
    render(<IteratePage />);

    const initialInput = await screen.findByLabelText('iterate-initial-prompt');
    fireEvent.change(initialInput, { target: { value: 'Tighten the jump timing' } });
    fireEvent.click(screen.getByTestId('workspace-primary'));

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

  test('confirms an edited iterate prompt for an active session', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: mockIterateSession,
      creationSessionUiState: {
        isInitializing: false,
        isAwaitingPromptConfirmation: true,
        canGenerate: true,
        canEditPrompt: true,
      },
    });

    render(<IteratePage />);

    const promptInput = await screen.findByLabelText('iterate-session-prompt');
    fireEvent.change(promptInput, { target: { value: 'Expanded iterate prompt with tighter controls' } });
    fireEvent.click(screen.getByTestId('workspace-primary'));

    await waitFor(() => {
      expect(mockConfirmEditedPrompt).toHaveBeenCalledWith('Expanded iterate prompt with tighter controls');
    });
  });

  test('direct generate from the first instruction chains through confirmAndGenerate', async () => {
    render(<IteratePage />);

    const initialInput = await screen.findByLabelText('iterate-initial-prompt');
    fireEvent.change(initialInput, { target: { value: 'Make the boost feel stronger' } });
    fireEvent.click(screen.getByTestId('secondary-generate-iterate-directly'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        'Make the boost feel stronger',
        'Pixel Runner',
        expect.objectContaining({
          entryMode: 'iterate',
          sourceGameId: 'game-1',
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

  test('shows iterate progress immediately after generate before task tracking is attached', async () => {
    mockGameStoreState = buildGameStoreState({
      isGenerating: true,
      generationProgress: {
        stages: [{ key: 'submitting', label: 'Submitting', pct: 5 }],
        stageIndex: 0,
        pct: 5,
        stageLabel: 'Submitting',
        message: 'Preparing iterate run',
      },
      creationSession: {
        ...mockIterateSession,
        status: 'generating',
      },
    });

    render(<IteratePage />);

    expect(await screen.findByText('Submitting')).toBeTruthy();
    expect(screen.queryByTestId('workspace')).toBeNull();
  });

  test('keeps showing iterate progress when the tracked task game id switches to the generated game', async () => {
    mockGameStoreState = buildGameStoreState({
      isGenerating: true,
      generationProgress: {
        stages: [{ key: 'generating', label: 'Generating', pct: 60 }],
        stageIndex: 0,
        pct: 60,
        stageLabel: 'Generating',
        message: 'Generating the updated version',
      },
      creationSession: {
        ...mockIterateSession,
        status: 'generating',
      },
      currentTask: {
        taskId: 'iterate-task-1',
        taskType: 'pipeline_iterate',
        gameId: 'generated-game-2',
        status: 'running',
      },
    });

    render(<IteratePage />);

    expect(await screen.findByText('Generating')).toBeTruthy();
    expect(screen.queryByTestId('workspace')).toBeNull();
  });

  test('keeps the generated iterate result instead of reloading the source game', async () => {
    mockGameStoreState = buildGameStoreState({
      currentGame: mockIterateResultGame,
      creationSession: {
        ...mockIterateSession,
        status: 'generating',
        gameId: 'generated-game-2',
      },
    });

    render(<IteratePage />);

    expect((await screen.findAllByText('Updated Runner')).length).toBeGreaterThan(0);
    expect(mockGetGame).not.toHaveBeenCalled();
    expect(mockResetCreationSessionState).not.toHaveBeenCalled();
    expect(screen.queryByTestId('workspace')).toBeNull();
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
