/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockStartCreationSession = jest.fn(() => Promise.resolve({ sessionId: 'create-1', generationTier: 'standard' }));
const mockConfirmEditedPrompt = jest.fn(() => Promise.resolve());
const mockConfirmCurrentPrompt = jest.fn(() => Promise.resolve());
const mockConfirmAndGenerate = jest.fn(() => Promise.resolve());
const mockAbandonCreationSession = jest.fn(() => Promise.resolve());
const mockRestoreActiveCreationSession = jest.fn(() => Promise.resolve(null));
const mockResetCreationSessionState = jest.fn();
const mockRestorePersistedTask = jest.fn(() => Promise.resolve(true));
const mockCancelCurrentTask = jest.fn(() => Promise.resolve());
const mockClearError = jest.fn();
const mockResetCreateSession = jest.fn();
const mockSetCreateEntryIntent = jest.fn();
const mockConsumeCreateEntryIntent = jest.fn();
const mockOpenGame = jest.fn();
const mockOpenPaywall = jest.fn();
const mockShowToast = jest.fn();
const mockOpenProfilePageWithTab = jest.fn();

let mockGameStoreState;

jest.mock('@tarojs/components', () => require('../../../test-utils/taroComponentsMock'));

jest.mock('@tarojs/taro', () => {
  const api = {
    showToast: mockShowToast,
    navigateTo: jest.fn(() => Promise.resolve()),
    showModal: jest.fn(),
  };

  return {
    __esModule: true,
    default: api,
    ...api,
    useDidShow: jest.fn(),
    useDidHide: jest.fn(),
  };
});

jest.mock('../../../components/creative-web/CreativeShell', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
  CreativeIcon: () => <span />,
}));
jest.mock('../../../components/creative-web/WorkPreview', () => ({ __esModule: true, default: () => <div>preview</div> }));
jest.mock('../../../components/creative-web/ConversationLayout', () => ({ __esModule: true, default: ({ children, actions }) => <div>{actions}{children}</div>, ConversationIcon: () => <span /> }));

jest.mock('../../../components/common/AppTopBar', () => ({
  AppTopBar: ({ rightText, onRightClick }) => (
    <button type="button" onClick={onRightClick}>{rightText || 'top-bar'}</button>
  ),
}));

jest.mock('../../../components/common/CustomTabBar', () => ({
  CustomTabBar: () => <div>tab-bar</div>,
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
    showSettings = true,
    session,
    inputValue,
    onInputChange,
    onPrimaryAction,
    secondaryActions = [],
  }) => (
    <div data-testid="workspace" data-show-settings={String(showSettings)}>
      <textarea
        aria-label={session ? 'create-session-prompt' : 'create-initial-prompt'}
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
  CreationResultCoverCard: () => <div>result-cover</div>,
  CreationSessionActions: () => <div>actions</div>,
  CreationSessionShell: ({ sections }) => (
    <div>{(sections || []).map((section) => <div key={section.key}>{section.node}</div>)}</div>
  ),
  CreationStateCard: () => <div>state-card</div>,
}));

jest.mock('../../../store/gameStore', () => ({
  PIPELINE_STAGES: [{ key: 'submitting', label: 'Submitting', pct: 5 }],
  getPersistedGenerationTaskSnapshot: jest.fn(() => null),
  isCompletedGameStatus: jest.fn((status) => ['ready', 'draft', 'published', 'review'].includes(status)),
  useGameStore: jest.fn(() => mockGameStoreState),
}));

jest.mock('../../../stores/gamePlayer', () => ({
  __esModule: true,
  default: jest.fn((selector) => selector({ openGame: mockOpenGame })),
}));

jest.mock('../../../stores/quotaStore', () => ({
  __esModule: true,
  default: jest.fn((selector) => selector({
    openPaywall: mockOpenPaywall,
    freeQuota: 3,
    totalFreeQuota: 5,
    subscription: {
      active: false,
      planId: null,
      planName: null,
      expiresAt: null,
      usedThisPeriod: 0,
      quotaThisPeriod: 0,
    },
    fetchQuota: jest.fn(() => Promise.resolve()),
    loading: false,
  })),
}));

jest.mock('../../../utils/authNavigation', () => ({
  consumePersistedCreateEntryIntent: jest.fn(),
  ensureCreateAccess: jest.fn(),
  getPersistedCreateEntryIntent: jest.fn(() => null),
  isLoggedIn: jest.fn(() => true),
  openForkPageWithAuth: jest.fn(),
  openIteratePageWithAuth: jest.fn(),
  openProfilePageWithTab: (...args) => mockOpenProfilePageWithTab(...args),
}));

jest.mock('../../../utils/gameOrientation', () => ({
  getGameOrientation: jest.fn(() => 'portrait'),
  getDefaultCreateOrientation: jest.fn(() => (
    require('../../../utils/runtime').isH5Runtime() ? 'landscape' : 'portrait'
  )),
}));

jest.mock('../../../utils/media', () => ({
  getGameCoverUrl: jest.fn(() => ''),
}));

jest.mock('../../../utils/runtime', () => ({
  isH5Runtime: jest.fn(() => true),
  isWeappRuntime: jest.fn(() => false),
}));

const { isH5Runtime, isWeappRuntime } = require('../../../utils/runtime');

jest.mock('../../../utils/systemInfo', () => ({
  getSafeSystemInfo: jest.fn(() => ({ windowHeight: 720 })),
}));

const mockCreateSession = {
  sessionId: 'create-1',
  entryMode: 'create',
  status: 'collecting',
  prompt: 'Build a physics puzzle game',
  expandedPrompt: 'Expanded prompt draft',
  currentQuestion: {
    content: 'Please confirm or edit the prompt.',
  },
};

const CreatePage = require('../index').default;

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
    createEntryIntent: null,
    consumeCreateEntryIntent: mockConsumeCreateEntryIntent,
    resetCreateSession: mockResetCreateSession,
    setCreateEntryIntent: mockSetCreateEntryIntent,
    creationSession: null,
    creationSessionUiState: {
      isInitializing: false,
      isAwaitingPromptConfirmation: false,
      canGenerate: false,
      canEditPrompt: false,
    },
    creationSessionError: null,
    creationSessionSubmitting: false,
    startCreationSession: mockStartCreationSession,
    confirmEditedPrompt: mockConfirmEditedPrompt,
    confirmCurrentPrompt: mockConfirmCurrentPrompt,
    confirmAndGenerate: mockConfirmAndGenerate,
    abandonCreationSession: mockAbandonCreationSession,
    restoreActiveCreationSession: mockRestoreActiveCreationSession,
    resetCreationSessionState: mockResetCreationSessionState,
    ...overrides,
  };
}

describe('Create page creation session flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isH5Runtime.mockReturnValue(true);
    isWeappRuntime.mockReturnValue(false);
    mockGameStoreState = buildGameStoreState();
  });

  test('starts a creation session from the first prompt', async () => {
    render(<CreatePage />);

    expect(screen.getByLabelText('呈现比例').value).toBe('landscape');
    const initialInput = await screen.findByLabelText('creative-description');
    fireEvent.change(initialInput, { target: { value: 'Make a funny office stealth game' } });
    fireEvent.click(screen.getByTestId('workspace-primary'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        expect.stringContaining('Make a funny office stealth game'),
        '',
        expect.objectContaining({
          entryMode: 'create',
          orientation: 'landscape',
          generationTier: 'standard',
        }),
      );
    });
    expect(mockStartCreationSession.mock.calls[0][0]).toContain('呈现方式：交互实验');
    expect(mockStartCreationSession.mock.calls[0][0]).toContain('请生成桌面浏览器中的可交互创意作品');
  });

  test('keeps an explicit portrait choice on Creative Web', async () => {
    render(<CreatePage />);

    fireEvent.change(await screen.findByLabelText('呈现比例'), { target: { value: 'portrait' } });
    fireEvent.change(screen.getByLabelText('creative-description'), {
      target: { value: '做一个竖向展示的交互实验' },
    });
    fireEvent.click(screen.getByTestId('workspace-primary'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        expect.stringContaining('做一个竖向展示的交互实验'),
        '',
        expect.objectContaining({
          entryMode: 'create',
          orientation: 'portrait',
        }),
      );
    });
  });

  test('defaults weapp native create to portrait without desktop framing', async () => {
    isH5Runtime.mockReturnValue(false);
    isWeappRuntime.mockReturnValue(true);
    render(<CreatePage />);

    const initialInput = await screen.findByLabelText('create-initial-prompt');
    fireEvent.change(initialInput, { target: { value: '观察不同初始角度的双摆运动' } });
    fireEvent.click(screen.getByTestId('workspace-primary'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        '观察不同初始角度的双摆运动',
        '',
        expect.objectContaining({
          entryMode: 'create',
          orientation: 'portrait',
        }),
      );
    });
  });

  test('confirms an edited prompt for an active session', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: mockCreateSession,
      creationSessionUiState: {
        isInitializing: false,
        isAwaitingPromptConfirmation: true,
        canGenerate: true,
        canEditPrompt: true,
      },
    });

    render(<CreatePage />);

    const promptInput = await screen.findByLabelText('creative-description');
    fireEvent.change(promptInput, { target: { value: 'Expanded prompt draft with more traps' } });
    fireEvent.click(screen.getByTestId('workspace-primary'));

    await waitFor(() => {
      expect(mockConfirmEditedPrompt).toHaveBeenCalledWith('Expanded prompt draft with more traps');
    });
  });

  test('locks title and orientation once the prompt-confirmation session starts', async () => {
    mockGameStoreState = buildGameStoreState({
      creationSession: mockCreateSession,
      creationSessionUiState: {
        isInitializing: false,
        isAwaitingPromptConfirmation: true,
        canGenerate: true,
        canEditPrompt: true,
      },
    });

    render(<CreatePage />);

    expect((await screen.findByLabelText('作品名称')).disabled).toBe(true);
    expect(screen.getByLabelText('呈现比例').disabled).toBe(true);
  });

  test('supports direct generate from the initial entry prompt', async () => {
    render(<CreatePage />);

    const initialInput = await screen.findByLabelText('creative-description');
    fireEvent.change(initialInput, { target: { value: 'Make a boss-rush rhythm game' } });
    fireEvent.click(screen.getByText('直接生成'));

    await waitFor(() => {
      expect(mockStartCreationSession).toHaveBeenCalledWith(
        expect.stringContaining('Make a boss-rush rhythm game'),
        '',
        expect.objectContaining({
          entryMode: 'create',
          orientation: 'landscape',
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
});

