/* eslint-env jest */

const mockStorage = {};
const mockCreateCreationSession = jest.fn();
const mockGetCreationSession = jest.fn();
const mockGetActiveCreationSession = jest.fn();
const mockGenerateFromCreationSession = jest.fn();
const mockSessionMessageHandlers = {};
const mockOnMessage = jest.fn((type, callback) => {
  mockSessionMessageHandlers[type] = callback;
});
const mockOffMessage = jest.fn((type, callback) => {
  if (mockSessionMessageHandlers[type] === callback) {
    delete mockSessionMessageHandlers[type];
  }
});

jest.mock('@tarojs/taro', () => {
  const api = {
    getStorageSync: jest.fn((key) => {
      if (key === '') {
        return mockStorage;
      }

      return mockStorage[key];
    }),
    setStorageSync: jest.fn((key, value) => {
      mockStorage[key] = value;
    }),
    removeStorageSync: jest.fn((key) => {
      delete mockStorage[key];
    }),
    getStorageInfoSync: jest.fn(() => ({ keys: Object.keys(mockStorage) })),
    eventCenter: {
      on: jest.fn(),
      off: jest.fn(),
      trigger: jest.fn(),
    },
  };

  return {
    __esModule: true,
    default: api,
    ...api,
  };
});

jest.mock('../../services/game', () => ({
  normalizeCreationSessionSnapshot: jest.fn((value) => value),
  createCreationSession: (...args) => mockCreateCreationSession(...args),
  getCreationSession: (...args) => mockGetCreationSession(...args),
  getActiveCreationSession: (...args) => mockGetActiveCreationSession(...args),
  generateFromCreationSession: (...args) => mockGenerateFromCreationSession(...args),
  getGame: jest.fn(),
  generateGame: jest.fn(),
  getGameTypes: jest.fn(),
  appendCreationSessionMessage: jest.fn(),
  skipCreationSessionQuestion: jest.fn(),
  abandonCreationSession: jest.fn(),
  getGenerationStatus: jest.fn(),
  iterateGame: jest.fn(),
  getGenerationTask: jest.fn(),
  getGenerationTaskEvents: jest.fn(() => Promise.resolve({ items: [], nextCursor: 0, hasMore: false })),
  cancelGenerationTask: jest.fn(),
  forkGame: jest.fn(),
  publishGame: jest.fn(),
  getMyGames: jest.fn(),
  deleteGame: jest.fn(),
  updateGameSettings: jest.fn(),
}));

jest.mock('../../services/websocket', () => ({
  getWebSocketManager: jest.fn(() => ({
    getIsConnected: jest.fn(() => true),
    connect: jest.fn(() => Promise.resolve()),
    onMessage: mockOnMessage,
    offMessage: mockOffMessage,
  })),
}));

jest.mock('../../stores/quotaStore', () => ({
  __esModule: true,
  default: {
    getState: () => ({
      updateAfterCreate: jest.fn(),
      fetchQuota: jest.fn(() => Promise.resolve()),
    }),
  },
}));

jest.mock('../../utils/storage', () => ({
  Storage: {
    getToken: jest.fn(() => ''),
  },
}));

jest.mock('../../utils/gameUnlock', () => ({
  subscribeGameUnlocked: jest.fn(),
}));

const { useGameStore } = require('../gameStore');

describe('gameStore creation session actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockStorage).forEach((key) => {
      delete mockStorage[key];
    });
    Object.keys(mockSessionMessageHandlers).forEach((key) => {
      delete mockSessionMessageHandlers[key];
    });

    useGameStore.setState({
      currentGame: null,
      currentTask: null,
      currentTaskEvents: [],
      currentTaskCursor: 0,
      createEntryIntent: null,
      myGames: [],
      trackedTasks: [],
      isGenerating: false,
      generationProgress: null,
      generatingGameId: null,
      isLoading: false,
      error: null,
      terminalError: null,
      latestTaskMessage: '',
      canPlay: true,
      creationSession: null,
      creationSessionError: null,
      creationSessionSubmitting: false,
      creationSessionRestoring: false,
      creationSessionContext: null,
    });
  });

  test('startCreationSession stores session snapshot and context', async () => {
    mockCreateCreationSession.mockResolvedValue({
      sessionId: 'session-1',
      status: 'collecting',
      prompt: '做一个平台跳跃游戏',
      title: 'Sky Hop',
      orientation: 'landscape',
      generationTier: 'showcase',
      entryMode: 'create',
    });

    const session = await useGameStore.getState().startCreationSession('做一个平台跳跃游戏', 'Sky Hop', {
      orientation: 'landscape',
      generationTier: 'showcase',
      entryMode: 'create',
    });

    expect(session.sessionId).toBe('session-1');
    expect(useGameStore.getState().creationSession).toEqual(expect.objectContaining({
      sessionId: 'session-1',
      status: 'collecting',
    }));
    expect(useGameStore.getState().creationSessionContext).toEqual(expect.objectContaining({
      prompt: '做一个平台跳跃游戏',
      title: 'Sky Hop',
      orientation: 'landscape',
      generationTier: 'showcase',
      entryMode: 'create',
    }));
  });

  test('startCreationSession keeps initializing sessions active and applies websocket updates', async () => {
    mockCreateCreationSession.mockResolvedValue({
      sessionId: 'session-init',
      status: 'initializing',
      prompt: '做一个平台跳跃游戏',
      title: 'Sky Hop',
      entryMode: 'create',
    });

    await useGameStore.getState().startCreationSession('做一个平台跳跃游戏', 'Sky Hop', {
      entryMode: 'create',
    });

    expect(useGameStore.getState().creationSession).toEqual(expect.objectContaining({
      sessionId: 'session-init',
      status: 'initializing',
    }));
    expect(useGameStore.getState().getCreationFlowStage()).toBe('initializing');
    expect(mockOnMessage).toHaveBeenCalledWith('session:updated', expect.any(Function));

    mockSessionMessageHandlers['session:updated']({
      sessionId: 'session-init',
      session: {
        sessionId: 'session-init',
        status: 'collecting',
        prompt: '做一个平台跳跃游戏',
        title: 'Sky Hop',
        entryMode: 'create',
        currentQuestion: {
          content: '主角更偏向什么风格？',
        },
      },
    });

    expect(useGameStore.getState().creationSession).toEqual(expect.objectContaining({
      sessionId: 'session-init',
      status: 'collecting',
    }));
    expect(useGameStore.getState().getCreationFlowStage()).toBe('collecting');
  });

  test('getCreationFlowStage reflects session and task state priority', () => {
    useGameStore.setState({
      creationSession: {
        sessionId: 'session-2',
        status: 'ready',
      },
      isGenerating: false,
      currentGame: null,
    });

    expect(useGameStore.getState().getCreationFlowStage()).toBe('ready_to_generate');

    useGameStore.setState({ isGenerating: true });
    expect(useGameStore.getState().getCreationFlowStage()).toBe('generating');
  });

  test('getCreationFlowStage prefers active creation session over stale completed game', () => {
    useGameStore.setState({
      currentGame: {
        id: 'game-old',
        status: 'ready',
      },
      creationSession: {
        sessionId: 'session-active',
        status: 'collecting',
      },
      isGenerating: false,
    });

    expect(useGameStore.getState().getCreationFlowStage()).toBe('collecting');
  });

  test('startCreationSession clears stale completed game context', async () => {
    useGameStore.setState({
      currentGame: {
        id: 'game-stale',
        status: 'ready',
      },
    });

    mockCreateCreationSession.mockResolvedValue({
      sessionId: 'session-4',
      status: 'collecting',
      prompt: '做一个新游戏',
      title: 'New Game',
      entryMode: 'create',
    });

    await useGameStore.getState().startCreationSession('做一个新游戏', 'New Game', {
      entryMode: 'create',
    });

    expect(useGameStore.getState().currentGame).toBe(null);
    expect(useGameStore.getState().creationSession).toEqual(expect.objectContaining({
      sessionId: 'session-4',
    }));
  });

  test('startCreationSession normalizes aborted request errors for the UI', async () => {
    mockCreateCreationSession.mockRejectedValue(new Error('The user aborted a request.'));

    await expect(
      useGameStore.getState().startCreationSession('做一个新游戏', 'New Game', {
        entryMode: 'create',
      })
    ).rejects.toThrow('这次请求被中断了，请再试一次');

    expect(useGameStore.getState().creationSessionError).toBe('这次请求被中断了，请再试一次');
  });

  test('startCreationSession rejects prompts shorter than five characters before calling the API', async () => {
    await expect(
      useGameStore.getState().startCreationSession('美化页面', '像素跑酷', {
        entryMode: 'iterate',
        sourceGameId: 'game-1',
      })
    ).rejects.toThrow('至少输入 5 个字，再开始这一轮');

    expect(mockCreateCreationSession).not.toHaveBeenCalled();
    expect(useGameStore.getState().creationSession).toBeNull();
    expect(useGameStore.getState().creationSessionSubmitting).toBe(false);
  });

  test('generateFromCreationSession delegates to task tracking', async () => {
    const beginTaskTracking = jest.fn(() => Promise.resolve());

    useGameStore.setState({
      creationSession: {
        sessionId: 'session-3',
        status: 'ready',
        prompt: '做一个双人赛车游戏',
        title: 'Race Rush',
      },
      trackedTasks: [],
      _beginTaskTracking: beginTaskTracking,
    });

    mockGenerateFromCreationSession.mockResolvedValue({
      gameId: 'game-3',
      title: 'Race Rush',
      status: 'generating',
      canPlay: true,
      generationTask: {
        taskId: 'task-3',
        taskType: 'pipeline_run',
        status: 'queued',
        gameId: 'game-3',
        progressPct: 5,
      },
    });

    await useGameStore.getState().generateFromCreationSession({
      generationTier: 'standard',
    });

    expect(mockGenerateFromCreationSession).toHaveBeenCalledWith('session-3', {
      generationTier: 'standard',
    });
    expect(beginTaskTracking).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-3',
    }), expect.objectContaining({
      gameId: 'game-3',
    }));
  });

  test('generateFromCreationSession supports the legacy create-page signature with explicit sessionId', async () => {
    const beginTaskTracking = jest.fn(() => Promise.resolve());

    useGameStore.setState({
      creationSession: null,
      trackedTasks: [],
      _beginTaskTracking: beginTaskTracking,
    });

    mockGenerateFromCreationSession.mockResolvedValue({
      gameId: 'game-legacy',
      title: 'Legacy Create',
      status: 'generating',
      canPlay: true,
      generationTask: {
        taskId: 'task-legacy',
        taskType: 'pipeline_run',
        status: 'queued',
        gameId: 'game-legacy',
        progressPct: 5,
      },
    });

    await useGameStore.getState().generateFromCreationSession('session-legacy', {
      revision: 7,
      title: 'Legacy Create',
      promptPreview: '做一个解谜游戏',
    });

    expect(mockGenerateFromCreationSession).toHaveBeenCalledWith('session-legacy', {
      revision: 7,
      title: 'Legacy Create',
      promptPreview: '做一个解谜游戏',
    });
    expect(beginTaskTracking).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-legacy',
    }), expect.objectContaining({
      gameId: 'game-legacy',
    }));
  });

  test('restoreActiveCreationSession can ignore missing active session silently', async () => {
    const missingError = new Error('session not found');
    missingError.statusCode = 404;
    mockGetActiveCreationSession.mockRejectedValue(missingError);

    const result = await useGameStore.getState().restoreActiveCreationSession({
      silentIfMissing: true,
    });

    expect(result).toBe(null);
    expect(useGameStore.getState().creationSession).toBe(null);
    expect(useGameStore.getState().creationSessionError).toBe(null);
  });
});
