/* eslint-env jest */

const mockStorage = {};
const mockCreateCreationSession = jest.fn();
const mockGetActiveCreationSession = jest.fn();
const mockGenerateFromCreationSession = jest.fn();

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
  createCreationSession: (...args) => mockCreateCreationSession(...args),
  getActiveCreationSession: (...args) => mockGetActiveCreationSession(...args),
  generateFromCreationSession: (...args) => mockGenerateFromCreationSession(...args),
  getGame: jest.fn(),
  generateGame: jest.fn(),
  getGameTypes: jest.fn(),
  getCreationSession: jest.fn(),
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
    onMessage: jest.fn(),
    offMessage: jest.fn(),
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
