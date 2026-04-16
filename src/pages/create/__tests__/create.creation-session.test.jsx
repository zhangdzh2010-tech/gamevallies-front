/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockAnswerCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockStartCreationSession = jest.fn(() => Promise.resolve());
const mockSkipCreationSessionQuestion = jest.fn(() => Promise.resolve());
const mockGenerateFromCreationSession = jest.fn(() => Promise.resolve());
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
    session,
    inputValue,
    onInputChange,
    onSend,
    pendingUserMessage,
  }) => (
    <div data-testid="workspace">
      {pendingUserMessage?.content ? <div data-testid="pending-message">{pendingUserMessage.content}</div> : null}
      <textarea
        aria-label={session ? 'create-session-answer' : 'create-initial-answer'}
        value={inputValue}
        onChange={(e) => onInputChange({ detail: { value: e.target.value } })}
      />
      <button data-testid="workspace-send" type="button" onClick={onSend}>send</button>
    </div>
  ),
  CreationResultCoverCard: () => <div>result-cover</div>,
  CreationSessionActions: () => <div>actions</div>,
  CreationSessionShell: ({ sections }) => (
    <div>{(sections || []).map((section) => <div key={section.key}>{section.node}</div>)}</div>
  ),
  CreationStateCard: () => <div>state-card</div>,
  canGenerateCreationSession: jest.fn((status) => ['collecting', 'ready'].includes(status)),
  isCreationSessionQuestioning: jest.fn((status) => ['collecting', 'ready'].includes(status)),
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
  default: jest.fn((selector) => selector({ openPaywall: mockOpenPaywall })),
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
}));

jest.mock('../../../utils/media', () => ({
  getGameCoverUrl: jest.fn(() => ''),
}));

jest.mock('../../../utils/runtime', () => ({
  isH5Runtime: jest.fn(() => true),
  isWeappRuntime: jest.fn(() => false),
}));

jest.mock('../../../utils/systemInfo', () => ({
  getSafeSystemInfo: jest.fn(() => ({ windowHeight: 720 })),
}));

const mockCreateSession = {
  sessionId: 'create-1',
  entryMode: 'create',
  status: 'collecting',
  prompt: 'Build a physics puzzle game',
  currentQuestion: {
    content: 'What should the main challenge feel like?',
    skippable: true,
  },
  messages: [
    { id: 'msg-1', role: 'assistant', content: 'Tell me what kind of game you want.' },
  ],
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
    creationSession: mockCreateSession,
    creationSessionError: null,
    creationSessionSubmitting: false,
    creationSessionStreamingReply: null,
    creationSessionPendingUserMessage: null,
    startCreationSession: mockStartCreationSession,
    answerCreationSessionQuestion: mockAnswerCreationSessionQuestion,
    skipCreationSessionQuestion: mockSkipCreationSessionQuestion,
    generateFromCreationSession: mockGenerateFromCreationSession,
    restoreActiveCreationSession: mockRestoreActiveCreationSession,
    resetCreationSessionState: mockResetCreationSessionState,
    ...overrides,
  };
}

describe('Create page creation session flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGameStoreState = buildGameStoreState();
  });

  test('clears the active answer input immediately after send', async () => {
    render(<CreatePage />);

    const answerInput = await screen.findByLabelText('create-session-answer');
    fireEvent.change(answerInput, { target: { value: 'Make the pressure come from timed chain reactions' } });
    fireEvent.click(screen.getByTestId('workspace-send'));

    await waitFor(() => {
      expect(screen.getByLabelText('create-session-answer').value).toBe('');
    });

    await waitFor(() => {
      expect(mockAnswerCreationSessionQuestion).toHaveBeenCalledWith('Make the pressure come from timed chain reactions');
    });
  });
});
