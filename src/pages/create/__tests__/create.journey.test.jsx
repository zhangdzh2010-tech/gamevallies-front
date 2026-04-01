/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockShowToast = jest.fn();
const mockGetSystemInfoSync = jest.fn(() => ({ windowHeight: 720 }));
const mockGenerateFromCreationSession = jest.fn(() => Promise.resolve());
const mockRestorePersistedTask = jest.fn(() => Promise.resolve(true));
const mockCancelCurrentTask = jest.fn(() => Promise.resolve());
const mockClearError = jest.fn();
const mockConsumeCreateEntryIntent = jest.fn();
const mockResetCreateSession = jest.fn();
const mockSetCreateEntryIntent = jest.fn();
const mockSetCurrentGame = jest.fn();
const mockOpenIteratePageWithAuth = jest.fn();
const mockOpenProfilePageWithTab = jest.fn();
const mockOpenPaywall = jest.fn();
const mockOpenGame = jest.fn();
const mockEnsureCreateAccess = jest.fn();
const mockNormalizeCreationSessionSnapshot = jest.fn((snapshot) => {
  if (!snapshot) {
    return null;
  }

  const messages = Array.isArray(snapshot.messages)
    ? snapshot.messages
    : Array.isArray(snapshot.conversation)
      ? snapshot.conversation
      : [];
  const currentQuestion = snapshot.currentQuestion
    ? {
        id: snapshot.currentQuestion.id || '',
        key: snapshot.currentQuestion.key || snapshot.currentQuestion.slotKey || snapshot.currentQuestion.id || '',
        title: snapshot.currentQuestion.title || snapshot.currentQuestion.label || '',
        content: snapshot.currentQuestion.content || snapshot.currentQuestion.prompt || '',
        placeholder: snapshot.currentQuestion.placeholder || '',
        required: snapshot.currentQuestion.required !== false,
      }
    : null;

  return {
    ...snapshot,
    sessionId: snapshot.sessionId || snapshot.id || '',
    title: snapshot.title || snapshot.titleDraft || '',
    prompt: snapshot.prompt || snapshot.initialPrompt || '',
    messages,
    currentQuestion,
    orientation: snapshot.orientation || 'portrait',
    status: snapshot.status || 'collecting',
    gameId: snapshot.gameId || snapshot.generatedGameId || '',
    generationTask: snapshot.generationTask || (snapshot.generationTaskId
      ? {
          taskId: snapshot.generationTaskId,
          gameId: snapshot.generatedGameId || snapshot.gameId || '',
        }
      : null),
  };
});
const mockGameService = {
  getGame: jest.fn(),
  forkGame: jest.fn(),
  createCreationSession: jest.fn(() => Promise.resolve(null)),
  appendCreationSessionMessage: jest.fn(() => Promise.resolve(null)),
  getActiveCreationSession: jest.fn(() => Promise.resolve(null)),
  abandonCreationSession: jest.fn(() => Promise.resolve(null)),
  normalizeCreationSessionSnapshot: mockNormalizeCreationSessionSnapshot,
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

const SESSION_START_TEXT = /开始创作/;
const PORTRAIT_TEXT = /竖屏/;
const LANDSCAPE_TEXT = /横屏/;
const ANSWER_TEXT = /提交回答/;
const OPTIMIZE_TEXT = /继续优化/;
const SUBSCRIBE_PLAY_TEXT = /订阅后试玩/;
const CREATE_AGAIN_TEXT = /再创一个/;

function buildGameStoreState(overrides = {}) {
  return {
    generateFromCreationSession: mockGenerateFromCreationSession,
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
    setCurrentGame: mockSetCurrentGame,
    ...overrides,
  };
}

describe('Create page journey coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGameStoreState = buildGameStoreState();
  });

  test('creative textarea keeps the intended 2000-char limit and starts a creation session', async () => {
    mockGameService.createCreationSession.mockResolvedValue({
      id: 'session-1',
      status: 'collecting',
      revision: 1,
      orientation: 'portrait',
      slotFillPct: 0.33,
      readyToGenerate: false,
      planDraft: {
        title: '办公室摸鱼计划',
        summary: '一款围绕办公室摸鱼展开的搞笑小游戏。',
        concept: '在办公室场景里快速做出摸鱼选择。',
        interaction: '点击不同摸鱼动作并及时躲避老板巡查。',
        objective: '撑到下班并积累足够摸鱼值。',
        pacing: '短局快节奏，每一轮都很快进入状态。',
        visualDirection: '霓虹办公室喜剧风格。',
        signatureMoment: '老板突然巡查时触发夸张反转。',
      },
      confidenceSummary: {
        overallConfidence: 0.61,
        strongestSlots: ['game_type'],
        weakestSlots: ['win_condition'],
        ambiguityFlags: ['win_condition:missing'],
        missingCriticalSlots: ['win_condition'],
      },
      questionStrategy: {
        mode: 'missing_required',
        slotKey: 'win_condition',
        reason: '因为“Win Condition”会直接决定玩法能否成型，而当前还没有明确答案。',
        impact: 0.95,
        confidence: 0.21,
        ambiguityWeight: 0,
      },
      conversation: [],
      currentQuestion: {
        slotKey: 'theme',
        label: 'Theme',
        prompt: '你希望它发生在什么场景里？',
        skippable: true,
      },
    });

    render(<CreatePage />);

    const textarea = screen.getByPlaceholderText(/先说一句核心想法/);
    const longPrompt = 'creative'.repeat(180);

    expect(textarea.getAttribute('data-maxlength')).toBe('2000');
    expect(screen.getByText(PORTRAIT_TEXT)).toBeTruthy();

    fireEvent.change(textarea, { target: { value: longPrompt } });
    expect(screen.getByText(`${longPrompt.length}/2000`)).toBeTruthy();

    fireEvent.click(screen.getByText(SESSION_START_TEXT));

    await waitFor(() => {
      expect(mockGameService.createCreationSession).toHaveBeenCalledWith(longPrompt, '', {
        orientation: 'portrait',
      });
    });

    expect(screen.getByText(/方案草案/)).toBeTruthy();
    expect(screen.getByText(/办公室摸鱼计划/)).toBeTruthy();
    expect(screen.getByText(/理解与追问/)).toBeTruthy();
  });

  test('example prompt click fills the textarea and short prompts are blocked', async () => {
    render(<CreatePage />);

    fireEvent.click(screen.getByText('🐍'));

    expect(screen.getByPlaceholderText(/先说一句核心想法/).value).toContain('贪吃蛇');

    fireEvent.change(screen.getByPlaceholderText(/先说一句核心想法/), {
      target: { value: '太短' },
    });
    fireEvent.click(screen.getByText(SESSION_START_TEXT));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: '请输入游戏描述', icon: 'none' }),
      );
    });
    expect(mockGameService.createCreationSession).not.toHaveBeenCalled();
  });

  test('orientation defaults to portrait and can switch to landscape before starting a session', async () => {
    mockGameService.createCreationSession.mockResolvedValue({
      id: 'session-landscape',
      status: 'collecting',
      revision: 1,
      orientation: 'landscape',
      slotFillPct: 0.33,
      readyToGenerate: false,
      conversation: [],
      currentQuestion: {
        slotKey: 'theme',
        label: 'Theme',
        prompt: 'What theme should it use?',
        skippable: true,
      },
    });

    render(<CreatePage />);

    fireEvent.change(screen.getByPlaceholderText(/先说一句核心想法/), {
      target: { value: 'build a horizontal shooter game with a spaceship and enemies' },
    });
    fireEvent.click(screen.getByText(LANDSCAPE_TEXT));
    fireEvent.click(screen.getByText(SESSION_START_TEXT));

    await waitFor(() => {
      expect(mockGameService.createCreationSession).toHaveBeenCalledWith(
        'build a horizontal shooter game with a spaceship and enemies',
        '',
        { orientation: 'landscape' },
      );
    });
  });

  test('session flow can append an answer and then trigger generation from the session', async () => {
    mockGameService.createCreationSession.mockResolvedValueOnce({
      id: 'session-2',
      status: 'collecting',
      revision: 1,
      orientation: 'portrait',
      slotFillPct: 0.4,
      readyToGenerate: false,
      conversation: [
        { role: 'user', content: '做一个办公室摸鱼游戏' },
        { role: 'assistant', content: '我先补一个最关键的信息：它发生在什么场景里？' },
      ],
      currentQuestion: {
        slotKey: 'theme',
        label: 'Theme',
        prompt: '它发生在什么场景里？',
        skippable: true,
      },
    });
    mockGameService.appendCreationSessionMessage.mockResolvedValueOnce({
      id: 'session-2',
      status: 'ready',
      revision: 2,
      orientation: 'portrait',
      slotFillPct: 0.8,
      readyToGenerate: true,
      conversation: [
        { role: 'user', content: '做一个办公室摸鱼游戏' },
        { role: 'assistant', content: '我先补一个最关键的信息：它发生在什么场景里？' },
        { role: 'user', content: '现代办公室，老板会突然巡查' },
        { role: 'assistant', content: '我已经整理出一版可生成方案了。' },
      ],
      currentQuestion: null,
    });
    mockGenerateFromCreationSession.mockResolvedValueOnce({
      gameId: 'game-creation',
      generationTask: {
        taskId: 'task-creation',
      },
    });

    render(<CreatePage />);

    fireEvent.change(screen.getByPlaceholderText(/先说一句核心想法/), {
      target: { value: '做一个办公室摸鱼游戏' },
    });
    fireEvent.click(screen.getByText(SESSION_START_TEXT));

    await waitFor(() => {
      expect(screen.getByText(ANSWER_TEXT)).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText(/它发生在什么场景里/), {
      target: { value: '现代办公室，老板会突然巡查' },
    });
    fireEvent.click(screen.getByText(ANSWER_TEXT));

    await waitFor(() => {
      expect(mockGameService.appendCreationSessionMessage).toHaveBeenCalledWith(
        'session-2',
        '现代办公室，老板会突然巡查',
        1,
      );
    });

    fireEvent.click(screen.getByText('开始创作'));

    await waitFor(() => {
      expect(mockGenerateFromCreationSession).toHaveBeenCalledWith(
        'session-2',
        expect.objectContaining({
          revision: 2,
        }),
      );
    });
  });

  test('supports normalized creation session snapshots without falling into a blank session page', async () => {
    mockGameService.createCreationSession.mockResolvedValueOnce({
      sessionId: 'session-normalized',
      status: 'collecting',
      revision: 1,
      orientation: 'portrait',
      title: '牛了个牛',
      prompt: '设计一款类似于羊了个羊的游戏',
      messages: [
        { role: 'user', content: '设计一款类似于羊了个羊的游戏' },
        { role: 'assistant', content: '先确认一下，它更偏消除还是闯关？' },
      ],
      currentQuestion: {
        id: 'question-theme',
        key: 'theme',
        title: '主题场景',
        content: '你希望它发生在什么场景里？',
        placeholder: '比如办公室、农场、校园...',
      },
    });
    mockGameService.appendCreationSessionMessage.mockResolvedValueOnce({
      sessionId: 'session-normalized',
      status: 'ready',
      revision: 2,
      orientation: 'portrait',
      title: '牛了个牛',
      prompt: '设计一款类似于羊了个羊的游戏',
      messages: [
        { role: 'user', content: '设计一款类似于羊了个羊的游戏' },
        { role: 'assistant', content: '先确认一下，它更偏消除还是闯关？' },
        { role: 'user', content: '农场闯关，三消为主' },
      ],
      currentQuestion: null,
    });

    render(<CreatePage />);

    fireEvent.change(screen.getByPlaceholderText(/先说一句核心想法/), {
      target: { value: '设计一款类似于羊了个羊的游戏' },
    });
    fireEvent.click(screen.getByText(SESSION_START_TEXT));

    await waitFor(() => {
      expect(screen.getByText(/当前问题/)).toBeTruthy();
    });

    expect(screen.getByText(/你希望它发生在什么场景里/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText(/比如办公室、农场、校园/), {
      target: { value: '农场闯关，三消为主' },
    });
    fireEvent.click(screen.getByText(ANSWER_TEXT));

    await waitFor(() => {
      expect(mockGameService.appendCreationSessionMessage).toHaveBeenCalledWith(
        'session-normalized',
        '农场闯关，三消为主',
        1,
      );
    });
  });

  test('completed journey offers continue optimization and locked play actions', () => {
    const currentGame = {
      id: 'game-88',
      title: '像素跑酷',
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
  });
});
