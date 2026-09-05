/* eslint-env jest */

const mockStorage = {};
const mockCreateCreationSession = jest.fn();
const mockGetCreationSession = jest.fn();
const mockGetActiveCreationSession = jest.fn();
const mockGenerateFromCreationSession = jest.fn();
const mockConfirmEditedPrompt = jest.fn();
const mockConfirmCurrentPrompt = jest.fn();
const mockSubscribeCreationSessionStream = jest.fn();
const mockGetGenerationTaskEvents = jest.fn(() => Promise.resolve({ items: [], nextCursor: 0, hasMore: false }));
const mockGenerationTaskStatusAliases = {
  completed: 'succeeded',
  complete: 'succeeded',
  success: 'succeeded',
  succeeded: 'succeeded',
  cancelled: 'canceled',
  canceled: 'canceled',
  timeout: 'timed_out',
  timedout: 'timed_out',
  timed_out: 'timed_out',
  queued: 'queued',
  running: 'running',
  failed: 'failed',
};
const mockNormalizeGenerationTaskStatus = jest.fn((status, fallback = 'queued') => {
  const normalized = String(status || '').trim().toLowerCase();
  return mockGenerationTaskStatusAliases[normalized] || fallback;
});
const mockSessionMessageHandlers = {};
let mockCreationSessionStreamHandlers = null;
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
  normalizeGenerationTaskStatus: mockNormalizeGenerationTaskStatus,
  createCreationSession: (...args) => mockCreateCreationSession(...args),
  getCreationSession: (...args) => mockGetCreationSession(...args),
  getActiveCreationSession: (...args) => mockGetActiveCreationSession(...args),
  generateFromCreationSession: (...args) => mockGenerateFromCreationSession(...args),
  subscribeCreationSessionStream: (...args) => mockSubscribeCreationSessionStream(...args),
  getGame: jest.fn(),
  generateGame: jest.fn(),
  getGameTypes: jest.fn(),
  appendCreationSessionMessage: mockConfirmEditedPrompt,
  confirmEditedPrompt: mockConfirmEditedPrompt,
  skipCreationSessionQuestion: mockConfirmCurrentPrompt,
  confirmCurrentPrompt: mockConfirmCurrentPrompt,
  abandonCreationSession: jest.fn(),
  getGenerationStatus: jest.fn(),
  getGenerationTask: jest.fn(),
  getGenerationTaskEvents: (...args) => mockGetGenerationTaskEvents(...args),
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

const gameService = require('../../services/game');
const { useGameStore, isTerminalTaskStatus } = require('../gameStore');

describe('gameStore creation session actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockStorage).forEach((key) => {
      delete mockStorage[key];
    });
    Object.keys(mockSessionMessageHandlers).forEach((key) => {
      delete mockSessionMessageHandlers[key];
    });
    mockCreationSessionStreamHandlers = null;
    mockSubscribeCreationSessionStream.mockImplementation((_session, handlers = {}) => {
      mockCreationSessionStreamHandlers = handlers;
      return jest.fn();
    });
    mockGetGenerationTaskEvents.mockReset();
    mockGetGenerationTaskEvents.mockResolvedValue({ items: [], nextCursor: 0, hasMore: false });
    mockConfirmEditedPrompt.mockReset();
    mockConfirmCurrentPrompt.mockReset();

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
      creationSessionUiState: {
        isInitializing: false,
        isAwaitingPromptConfirmation: false,
        canGenerate: false,
        canEditPrompt: false,
      },
      creationSessionError: null,
      creationSessionSubmitting: false,
      creationSessionRestoring: false,
      creationSessionContext: null,
      creationSessionStreamingReply: null,
      creationSessionPendingUserMessage: null,
      creationSessionStreamConnected: false,
    });
  });

  test('treats legacy generation task status aliases as terminal states', () => {
    expect(isTerminalTaskStatus('completed')).toBe(true);
    expect(isTerminalTaskStatus('cancelled')).toBe(true);
    expect(isTerminalTaskStatus('timedout')).toBe(true);
    expect(isTerminalTaskStatus('running')).toBe(false);
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
    expect(mockSubscribeCreationSessionStream).toHaveBeenCalledTimes(1);
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

  test('stores streaming assistant drafts from creation session SSE events', async () => {
    mockCreateCreationSession.mockResolvedValue({
      sessionId: 'session-stream',
      status: 'collecting',
      prompt: '做一个双人搞笑游戏',
      title: 'Funny Duo',
      entryMode: 'create',
      currentQuestion: {
        content: '想先确认一下互动方式。',
      },
    });

    await useGameStore.getState().startCreationSession('做一个双人搞笑游戏', 'Funny Duo', {
      entryMode: 'create',
    });

    expect(mockCreationSessionStreamHandlers).toBeTruthy();

    mockCreationSessionStreamHandlers.onDelta({
      type: 'delta',
      sessionId: 'session-stream',
      messageId: 'reply-1',
      kind: 'question',
      delta: '玩家',
      accumulated: '玩家主要通过点击还是拖拽来操作？',
      timestamp: Date.now(),
    });

    expect(useGameStore.getState().creationSessionStreamingReply).toEqual(expect.objectContaining({
      id: 'reply-1',
      role: 'assistant',
      content: '玩家主要通过点击还是拖拽来操作？',
      isStreaming: true,
    }));

    mockCreationSessionStreamHandlers.onSnapshot({
      type: 'snapshot',
      sessionId: 'session-stream',
      session: {
        sessionId: 'session-stream',
        status: 'ready',
        prompt: '做一个双人搞笑游戏',
        title: 'Funny Duo',
        entryMode: 'create',
        messages: [
          { id: 'message-1', role: 'user', content: '做一个双人搞笑游戏' },
          { id: 'message-2', role: 'assistant', content: '玩家主要通过点击还是拖拽来操作？' },
        ],
      },
    });

    expect(useGameStore.getState().creationSession).toEqual(expect.objectContaining({
      sessionId: 'session-stream',
      status: 'ready',
    }));
    expect(useGameStore.getState().creationSessionStreamingReply).toBeNull();
  });

  test('preserves live assistant drafts when snapshots are partial or stale', async () => {
    mockCreateCreationSession.mockResolvedValue({
      sessionId: 'session-stale',
      status: 'collecting',
      revision: 7,
      prompt: 'make a silly arcade game',
      title: 'Arcade Draft',
      entryMode: 'create',
      currentQuestion: {
        content: 'What is the main interaction?',
      },
      messages: [
        { id: 'message-user-1', role: 'user', content: 'make a silly arcade game' },
      ],
    });

    await useGameStore.getState().startCreationSession('make a silly arcade game', 'Arcade Draft', {
      entryMode: 'create',
    });

    mockCreationSessionStreamHandlers.onDelta({
      type: 'delta',
      sessionId: 'session-stale',
      messageId: 'reply-stale-1',
      kind: 'question',
      delta: 'tap',
      accumulated: 'Should the player tap or drag to move?',
      timestamp: Date.now(),
    });

    mockCreationSessionStreamHandlers.onSnapshot({
      type: 'snapshot',
      sessionId: 'session-stale',
      session: {
        sessionId: 'session-stale',
        status: 'collecting',
        revision: 7,
        prompt: 'make a silly arcade game',
        title: 'Arcade Draft',
        entryMode: 'create',
        messages: [
          { id: 'message-user-1', role: 'user', content: 'make a silly arcade game' },
        ],
        currentQuestion: {
          content: 'What is the main interaction?',
        },
      },
    });

    expect(useGameStore.getState().creationSessionStreamingReply).toEqual(expect.objectContaining({
      id: 'reply-stale-1',
      content: 'Should the player tap or drag to move?',
      isStreaming: true,
    }));

    mockCreationSessionStreamHandlers.onSnapshot({
      type: 'snapshot',
      sessionId: 'session-stale',
      session: {
        sessionId: 'session-stale',
        status: 'collecting',
        revision: 6,
        prompt: 'make a silly arcade game',
        title: 'Arcade Draft',
        entryMode: 'create',
        messages: [
          { id: 'message-user-1', role: 'user', content: 'make a silly arcade game' },
        ],
        currentQuestion: {
          content: 'Older question that should be ignored',
        },
      },
    });

    expect(useGameStore.getState().creationSession).toEqual(expect.objectContaining({
      sessionId: 'session-stale',
      revision: 7,
      currentQuestion: expect.objectContaining({
        content: 'What is the main interaction?',
      }),
    }));
    expect(useGameStore.getState().creationSessionStreamingReply).toEqual(expect.objectContaining({
      id: 'reply-stale-1',
      content: 'Should the player tap or drag to move?',
      isStreaming: true,
    }));
  });

  test('keeps a pending user reply until the backend snapshot includes it', async () => {
    mockCreateCreationSession.mockResolvedValue({
      sessionId: 'session-pending',
      status: 'collecting',
      revision: 1,
      prompt: 'make a cooperative puzzle game',
      title: 'Puzzle Draft',
      entryMode: 'create',
      currentQuestion: {
        content: 'What kind of cooperation should players do?',
      },
      messages: [
        { id: 'message-user-1', role: 'user', content: 'make a cooperative puzzle game' },
        { id: 'message-assistant-1', role: 'assistant', content: 'What kind of cooperation should players do?' },
      ],
    });
    gameService.appendCreationSessionMessage.mockResolvedValue({
      sessionId: 'session-pending',
      status: 'collecting',
      revision: 2,
      prompt: 'make a cooperative puzzle game',
      title: 'Puzzle Draft',
      entryMode: 'create',
      currentQuestion: {
        content: 'What tone should the world have?',
      },
      messages: [
        { id: 'message-user-1', role: 'user', content: 'make a cooperative puzzle game' },
        { id: 'message-assistant-1', role: 'assistant', content: 'What kind of cooperation should players do?' },
        { id: 'message-user-2', role: 'user', content: 'Two players operating linked mechanisms together' },
        { id: 'message-assistant-2', role: 'assistant', content: 'What tone should the world have?' },
      ],
    });

    await useGameStore.getState().startCreationSession('make a cooperative puzzle game', 'Puzzle Draft', {
      entryMode: 'create',
    });

    const submitPromise = useGameStore.getState().answerCreationSessionQuestion('Two players operating linked mechanisms together');

    expect(useGameStore.getState().creationSessionPendingUserMessage).toEqual(expect.objectContaining({
      role: 'user',
      content: 'Two players operating linked mechanisms together',
      isPending: true,
    }));

    await submitPromise;

    expect(useGameStore.getState().creationSessionPendingUserMessage).toBeNull();
    expect(useGameStore.getState().creationSession).toEqual(expect.objectContaining({
      revision: 2,
      currentQuestion: expect.objectContaining({
        content: 'What tone should the world have?',
      }),
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

  test('startCreationSession preserves the current game context for iterate flows', async () => {
    useGameStore.setState({
      currentGame: {
        id: 'game-iterate',
        title: '贪吃蛇',
        status: 'published',
      },
    });

    mockCreateCreationSession.mockResolvedValue({
      sessionId: 'session-iterate',
      status: 'collecting',
      prompt: '把节奏做得更爽一点',
      title: '贪吃蛇',
      entryMode: 'iterate',
      sourceGameId: 'game-iterate',
    });

    await useGameStore.getState().startCreationSession('把节奏做得更爽一点', '贪吃蛇', {
      entryMode: 'iterate',
      sourceGameId: 'game-iterate',
    });

    expect(useGameStore.getState().currentGame).toEqual(expect.objectContaining({
      id: 'game-iterate',
      title: '贪吃蛇',
    }));
    expect(useGameStore.getState().creationSession).toEqual(expect.objectContaining({
      sessionId: 'session-iterate',
      entryMode: 'iterate',
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
        revision: 4,
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
      revision: 4,
      generationTier: 'standard',
    });
    expect(beginTaskTracking).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-3',
    }), expect.objectContaining({
      gameId: 'game-3',
    }));
  });

  test('confirmAndGenerate waits for initializing sessions before triggering generation', async () => {
    jest.useFakeTimers();

    try {
      const beginTaskTracking = jest.fn(() => Promise.resolve());

      useGameStore.setState({
        currentGame: {
          id: 'game-init-1',
          title: 'Init Wait Game',
        },
        creationSession: {
          sessionId: 'session-init-1',
          status: 'initializing',
          revision: 2,
          entryMode: 'iterate',
          sourceGameId: 'game-init-1',
          title: 'Init Wait Game',
          prompt: 'Make movement feel tighter',
          expandedPrompt: 'Expanded iterate prompt',
        },
        trackedTasks: [],
        _beginTaskTracking: beginTaskTracking,
      });

      mockConfirmCurrentPrompt.mockResolvedValue({
        sessionId: 'session-init-1',
        status: 'ready',
        revision: 5,
        entryMode: 'iterate',
        sourceGameId: 'game-init-1',
        title: 'Init Wait Game',
        expandedPrompt: 'Expanded iterate prompt',
      });
      mockGenerateFromCreationSession.mockResolvedValue({
        gameId: 'game-init-1',
        title: 'Init Wait Game',
        status: 'generating',
        canPlay: true,
        generationTask: {
          taskId: 'task-init-1',
          taskType: 'pipeline_run',
          status: 'queued',
          gameId: 'game-init-1',
        },
      });

      const generationPromise = useGameStore.getState().confirmAndGenerate({
        orientation: 'portrait',
        generationTier: 'standard',
      });

      await Promise.resolve();

      expect(mockGenerateFromCreationSession).not.toHaveBeenCalled();

      useGameStore.setState((state) => ({
        creationSession: {
          ...state.creationSession,
          status: 'collecting',
          revision: 4,
        },
      }));

      await jest.advanceTimersByTimeAsync(250);
      await generationPromise;

      expect(mockGenerateFromCreationSession).toHaveBeenCalledWith(
        'session-init-1',
        expect.objectContaining({
          revision: 5,
          orientation: 'portrait',
          generationTier: 'standard',
        }),
      );
      expect(mockConfirmCurrentPrompt).toHaveBeenCalledWith('session-init-1', 4);
      expect(beginTaskTracking).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-init-1' }),
        expect.objectContaining({
          taskMeta: expect.objectContaining({
            taskType: 'pipeline_iterate',
            routeGameId: 'game-init-1',
          }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  test('generateFromCreationSession rebinds the interactive session runtime after a failed generate attempt', async () => {
    mockCreateCreationSession.mockResolvedValue({
      sessionId: 'session-rebind',
      status: 'ready',
      revision: 3,
      prompt: 'make a neon arcade game',
      expandedPrompt: 'Expanded arcade prompt',
      title: 'Arcade Rebind',
      entryMode: 'create',
    });
    mockGenerateFromCreationSession.mockRejectedValue(new Error('network error'));

    await useGameStore.getState().startCreationSession('make a neon arcade game', 'Arcade Rebind', {
      entryMode: 'create',
    });

    expect(mockSubscribeCreationSessionStream).toHaveBeenCalledTimes(1);

    await expect(
      useGameStore.getState().generateFromCreationSession({
        generationTier: 'standard',
      })
    ).rejects.toThrow();

    expect(useGameStore.getState().creationSession).toEqual(expect.objectContaining({
      sessionId: 'session-rebind',
      status: 'ready',
    }));
    expect(mockSubscribeCreationSessionStream).toHaveBeenCalledTimes(2);
  });

  test('syncTaskEvents builds a dynamic stage sequence from backend progress events', async () => {
    mockGetGenerationTaskEvents.mockResolvedValue({
      items: [
        {
          id: 'event-1',
          eventType: 'status',
          stage: 'queued',
          percentage: 0,
          message: '任务已创建，等待执行',
          createdAt: '2026-04-15T01:58:14.773Z',
        },
        {
          id: 'event-2',
          eventType: 'progress',
          stage: 'spec_build',
          percentage: 15,
          message: 'Building structured game spec',
          createdAt: '2026-04-15T01:58:15.375Z',
        },
        {
          id: 'event-3',
          eventType: 'progress',
          stage: 'runtime_profile_select',
          percentage: 30,
          message: 'Selecting runtime profile',
          createdAt: '2026-04-15T01:58:15.484Z',
        },
        {
          id: 'event-4',
          eventType: 'progress',
          stage: 'logic_generate',
          percentage: 60,
          message: 'Generating runtime-bound game logic',
          createdAt: '2026-04-15T01:58:15.762Z',
        },
      ],
      nextCursor: 4,
      hasMore: false,
    });

    useGameStore.setState({
      currentGame: {
        id: 'game-dynamic-1',
        title: 'Dynamic Stage Game',
      },
      currentTask: {
        taskId: 'task-dynamic-1',
        taskType: 'pipeline_run',
        status: 'running',
        gameId: 'game-dynamic-1',
        progressPct: 60,
        displayStageKey: 'logic_generate',
        displayStageLabel: '生成游戏逻辑',
        displayStagePct: 60,
        progressMessage: 'Generating runtime-bound game logic',
      },
      generationProgress: null,
      currentTaskEvents: [],
      currentTaskCursor: 0,
    });

    await useGameStore.getState()._syncTaskEvents('task-dynamic-1', { reset: true });

    expect(useGameStore.getState().generationProgress).toEqual(expect.objectContaining({
      stageKey: 'logic_generate',
      displayStageKey: 'generating',
      stageIndex: 2,
      stageLabel: '搭建作品',
      message: '正在把交互一步步写出来',
    }));
    expect(useGameStore.getState().generationProgress.stages.map(({ key, pct }) => ({ key, pct }))).toEqual([
      { key: 'understanding', pct: 15 },
      { key: 'designing', pct: 35 },
      { key: 'generating', pct: 60 },
      { key: 'validating', pct: 85 },
      { key: 'finalizing', pct: 100 },
    ]);
  });

  test('applyTaskUpdate preserves unknown backend display stages instead of forcing fallback keys', async () => {
    await useGameStore.getState()._applyTaskUpdate({
      taskId: 'task-unknown-stage',
      taskType: 'pipeline_run',
      status: 'running',
      gameId: 'game-unknown-stage',
      progressPct: 47,
      displayStageKey: 'artifact_pack',
      displayStageLabel: '打包产物',
      displayStagePct: 47,
      progressMessage: 'Packing artifacts',
    });

    expect(useGameStore.getState().generationProgress).toEqual(expect.objectContaining({
      stageKey: 'artifact_pack',
      displayStageKey: 'generating',
      stageIndex: 2,
      stageLabel: '打包产物',
      message: 'Packing artifacts',
      pct: 47,
    }));
    expect(useGameStore.getState().generationProgress.stages.map(({ key, pct }) => ({ key, pct }))).toEqual([
      { key: 'understanding', pct: 15 },
      { key: 'designing', pct: 35 },
      { key: 'generating', pct: 60 },
      { key: 'validating', pct: 85 },
      { key: 'finalizing', pct: 100 },
    ]);
  });

  test('uses backend public display stage keys as the progress contract', async () => {
    await useGameStore.getState()._applyTaskUpdate({
      taskId: 'task-public-stage',
      taskType: 'pipeline_run',
      status: 'running',
      gameId: 'game-public-stage',
      progressPct: 85,
      displayStageKey: 'validating',
      displayStageLabel: 'Quality validation',
      displayStagePct: 85,
      progressMessage: 'Checking generated game quality',
    });

    expect(useGameStore.getState().generationProgress).toEqual(expect.objectContaining({
      stageKey: 'validating',
      displayStageKey: 'validating',
      stageIndex: 3,
      message: '正在自检并调整细节',
      pct: 85,
    }));
  });

  test('generateFromCreationSession falls back to the current session revision when callers omit it', async () => {
    const beginTaskTracking = jest.fn(() => Promise.resolve());

    useGameStore.setState({
      creationSession: {
        sessionId: 'session-4',
        status: 'ready',
        revision: 9,
        prompt: '做一个三消游戏',
        title: 'Match Pop',
      },
      trackedTasks: [],
      _beginTaskTracking: beginTaskTracking,
    });

    mockGenerateFromCreationSession.mockResolvedValue({
      gameId: 'game-4',
      title: 'Match Pop',
      status: 'generating',
      canPlay: true,
      generationTask: {
        taskId: 'task-4',
        taskType: 'pipeline_run',
        status: 'queued',
        gameId: 'game-4',
        progressPct: 5,
      },
    });

    await useGameStore.getState().generateFromCreationSession({
      generationTier: 'standard',
    });

    expect(mockGenerateFromCreationSession).toHaveBeenCalledWith('session-4', {
      revision: 9,
      generationTier: 'standard',
    });
    expect(beginTaskTracking).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-4',
    }), expect.objectContaining({
      gameId: 'game-4',
    }));
  });

  test('generateFromCreationSession preserves iterate task routing metadata for tracked tasks', async () => {
    const beginTaskTracking = jest.fn(() => Promise.resolve());

    useGameStore.setState({
      creationSession: {
        sessionId: 'session-iterate',
        status: 'ready',
        revision: 6,
        prompt: '把节奏做得更快一点',
        title: '贪吃蛇',
        entryMode: 'iterate',
        sourceGameId: 'source-game-1',
      },
      trackedTasks: [],
      _beginTaskTracking: beginTaskTracking,
    });

    mockGenerateFromCreationSession.mockResolvedValue({
      gameId: 'new-game-1',
      title: '贪吃蛇 Plus',
      status: 'generating',
      canPlay: true,
      generationTask: {
        taskId: 'task-iterate-1',
        taskType: 'pipeline_run',
        status: 'queued',
        gameId: 'new-game-1',
        progressPct: 5,
      },
    });

    await useGameStore.getState().generateFromCreationSession({
      generationTier: 'standard',
    });

    expect(mockGenerateFromCreationSession).toHaveBeenCalledWith('session-iterate', {
      revision: 6,
      generationTier: 'standard',
    });

    expect(useGameStore.getState().trackedTasks[0]).toEqual(expect.objectContaining({
      taskId: 'task-iterate-1',
      taskType: 'pipeline_iterate',
      gameId: 'source-game-1',
    }));

    expect(beginTaskTracking).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-iterate-1',
    }), expect.objectContaining({
      gameId: 'new-game-1',
      taskMeta: expect.objectContaining({
        taskType: 'pipeline_iterate',
        routeGameId: 'source-game-1',
      }),
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

  test('getMatchingActiveCreationSession returns only the matching iterate session and clears stale session state', async () => {
    useGameStore.setState({
      creationSession: {
        sessionId: 'session-stale',
        entryMode: 'create',
        status: 'collecting',
      },
      creationSessionContext: {
        entryMode: 'create',
      },
    });

    mockGetActiveCreationSession.mockResolvedValue({
      sessionId: 'session-iterate',
      entryMode: 'iterate',
      sourceGameId: 'game-iterate',
      status: 'collecting',
    });

    const result = await useGameStore.getState().getMatchingActiveCreationSession({
      entryMode: 'iterate',
      sourceGameId: 'game-iterate',
    });

    expect(result).toEqual(expect.objectContaining({
      sessionId: 'session-iterate',
      entryMode: 'iterate',
    }));
    expect(useGameStore.getState().creationSession).toBe(null);
    expect(useGameStore.getState().creationSessionContext).toBe(null);
  });

  test('getMatchingActiveCreationSession returns null when the active session does not match', async () => {
    useGameStore.setState({
      creationSession: {
        sessionId: 'session-stale',
        entryMode: 'create',
        status: 'collecting',
      },
    });

    mockGetActiveCreationSession.mockResolvedValue({
      sessionId: 'session-fork',
      entryMode: 'fork',
      sourceGameId: 'source-1',
      status: 'collecting',
    });

    const result = await useGameStore.getState().getMatchingActiveCreationSession({
      entryMode: 'iterate',
      sourceGameId: 'game-iterate',
    });

    expect(result).toBe(null);
    expect(useGameStore.getState().creationSession).toBe(null);
  });

  test('maps upstream model provider failures to a friendly task error', async () => {
    await useGameStore.getState()._handleTaskTerminal({
      taskId: 'task-failed-1',
      taskType: 'pipeline_run',
      gameId: 'game-failed-1',
      status: 'failed',
      failureFamily: 'code_generation',
      failedStage: 'logic_generate',
      terminalError: {
        message: "Full LLM generation failed: Client error '403 Forbidden' for url 'https://ark.cn-beijing.volces.com/api/v1/chat/completions'",
      },
    });

    expect(useGameStore.getState().error).toBe('AI 生成服务暂时不可用，请稍后重试');
    expect(useGameStore.getState().terminalError).toEqual(expect.objectContaining({
      message: expect.stringContaining('403 Forbidden'),
    }));
  });
});

