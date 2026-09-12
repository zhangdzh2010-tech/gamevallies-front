/* eslint-env jest */
import { get, post } from '../api';
import {
  abandonCreationSession,
  buildCreationSessionStreamUrl,
  cancelGenerationTask,
  confirmAndGenerate,
  createCreationSession,
  generateFromCreationSession,
  normalizeCreationSessionSnapshot,
  normalizeCreationSessionStreamEvent,
  normalizeGenerationTaskStatus,
  subscribeCreationSessionStream,
} from '../game';

jest.mock('../api', () => ({
  post: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  patch: jest.fn(),
}));

jest.mock('../../utils/runtime', () => ({
  isH5Runtime: jest.fn(() => true),
}));

const { isH5Runtime } = require('../../utils/runtime');

jest.mock('../../utils/storage', () => ({
  Storage: {
    getToken: jest.fn(() => 'token-1'),
  },
}));

describe('gameService.createCreationSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isH5Runtime.mockReturnValue(true);
    post.mockResolvedValue({
      sessionId: 'session-1',
      status: 'collecting',
      prompt: '做一个双人竞速小游戏',
      title: 'Wide Runner',
      orientation: 'landscape',
      generationTier: 'showcase',
    });
  });

  test('submits prompt without legacy description field', async () => {
    await createCreationSession('做一个双人竞速小游戏', 'Wide Runner', {
      entryMode: 'create',
      orientation: 'landscape',
      generationTier: 'showcase',
    });

    expect(post).toHaveBeenCalledWith(
      '/api/v1/games/creation-sessions',
      expect.objectContaining({
        prompt: '做一个双人竞速小游戏',
        title: 'Wide Runner',
        entryMode: 'create',
        orientation: 'landscape',
        generationTier: 'showcase',
      }),
      expect.objectContaining({
        timeout: 90000,
      })
    );
  });

  test('defaults omitted orientation to landscape on Creative Web', async () => {
    await createCreationSession('观察双摆轨迹如何分离', '双摆实验', {
      entryMode: 'create',
    });

    expect(post).toHaveBeenCalledWith(
      '/api/v1/games/creation-sessions',
      expect.objectContaining({
        prompt: '观察双摆轨迹如何分离',
        orientation: 'landscape',
      }),
      expect.any(Object),
    );
  });

  test('keeps an explicit portrait orientation', async () => {
    await createCreationSession('做一个竖向展示的交互实验', '竖向实验', {
      entryMode: 'create',
      orientation: 'portrait',
    });

    expect(post).toHaveBeenCalledWith(
      '/api/v1/games/creation-sessions',
      expect.objectContaining({
        orientation: 'portrait',
      }),
      expect.any(Object),
    );
  });

  test('defaults omitted orientation to portrait on weapp', async () => {
    isH5Runtime.mockReturnValue(false);

    await createCreationSession('观察双摆轨迹如何分离', '双摆实验', {
      entryMode: 'create',
    });

    expect(post).toHaveBeenCalledWith(
      '/api/v1/games/creation-sessions',
      expect.objectContaining({
        orientation: 'portrait',
      }),
      expect.any(Object),
    );
  });
});

describe('gameService.normalizeGenerationTaskStatus', () => {
  test('maps legacy terminal task status aliases to the canonical frontend vocabulary', () => {
    expect(normalizeGenerationTaskStatus('completed')).toBe('succeeded');
    expect(normalizeGenerationTaskStatus('cancelled')).toBe('canceled');
    expect(normalizeGenerationTaskStatus('timedout')).toBe('timed_out');
  });

  test('keeps canonical backend statuses unchanged', () => {
    expect(normalizeGenerationTaskStatus('queued')).toBe('queued');
    expect(normalizeGenerationTaskStatus('running')).toBe('running');
    expect(normalizeGenerationTaskStatus('failed')).toBe('failed');
    expect(normalizeGenerationTaskStatus('succeeded')).toBe('succeeded');
    expect(normalizeGenerationTaskStatus('canceled')).toBe('canceled');
  });
});

describe('gameService.cancelGenerationTask', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    post.mockResolvedValue({
      taskId: 'task-1',
      status: 'cancelled',
      gameId: 'game-1',
      taskType: 'pipeline_run',
    });
  });

  test('returns a normalized generation task summary', async () => {
    await expect(cancelGenerationTask('task-1')).resolves.toEqual(expect.objectContaining({
      taskId: 'task-1',
      status: 'canceled',
      gameId: 'game-1',
    }));
    expect(post).toHaveBeenCalledWith('/api/v1/games/tasks/task-1/cancel', {});
  });
});

describe('creation session follow-up endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('generateFromCreationSession posts an empty payload', async () => {
    post.mockResolvedValue({
      gameId: 'game-11',
      status: 'generating',
      generationTask: {
        taskId: 'task-11',
        taskType: 'pipeline_run',
        status: 'queued',
      },
    });

    await generateFromCreationSession('session-11', {
      orientation: 'portrait',
      generationTier: 'standard',
    });

    expect(post).toHaveBeenCalledWith(
      '/api/v1/games/creation-sessions/session-11/generate',
      {},
      expect.objectContaining({
        timeout: 90000,
      })
    );
  });

  test('abandonCreationSession uses the abandon action endpoint', async () => {
    post.mockResolvedValue({
      sessionId: 'session-12',
      status: 'abandoned',
    });

    await abandonCreationSession('session-12');

    expect(post).toHaveBeenCalledWith('/api/v1/games/creation-sessions/session-12/abandon', {});
  });

  test('confirmAndGenerate refreshes string session ids and skips reconfirming ready prompts', async () => {
    get.mockResolvedValue({
      sessionId: 'session-ready',
      status: 'ready',
      revision: 7,
      expandedPrompt: 'Expanded prompt draft',
    });
    post.mockResolvedValue({
      generatedGameId: 'game-ready',
      generationTaskId: 'task-ready',
      title: 'Ready Draft',
      status: 'generating',
    });

    await confirmAndGenerate('session-ready', 'Expanded prompt draft');

    expect(get).toHaveBeenCalledWith('/api/v1/games/creation-sessions/session-ready');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      '/api/v1/games/creation-sessions/session-ready/generate',
      { revision: 7 },
      expect.objectContaining({
        timeout: 90000,
      })
    );
  });
});

describe('gameService.normalizeCreationSessionSnapshot', () => {
  test('keeps generationTask null when the snapshot has not started generating', () => {
    const snapshot = normalizeCreationSessionSnapshot({
      sessionId: 'session-1',
      status: 'collecting',
      prompt: '做一个平台跳跃游戏',
      currentQuestion: {
        id: 'question-1',
        prompt: '角色形象更偏向什么风格？',
      },
    });

    expect(snapshot).toEqual(expect.objectContaining({
      sessionId: 'session-1',
      status: 'collecting',
      prompt: '做一个平台跳跃游戏',
      orientation: '',
      generationTask: null,
      currentQuestion: expect.objectContaining({
        id: 'question-1',
        content: '角色形象更偏向什么风格？',
      }),
    }));
  });

  test('normalizes nested generation task payload when present', () => {
    const snapshot = normalizeCreationSessionSnapshot({
      sessionId: 'session-2',
      status: 'generating',
      generationTask: {
        taskId: 'task-2',
        taskType: 'pipeline_run',
        status: 'running',
        progressPct: 48,
      },
    });

    expect(snapshot.generationTask).toEqual(expect.objectContaining({
      taskId: 'task-2',
      taskType: 'pipeline_run',
      status: 'running',
      progressPct: 48,
    }));
  });

  test('maps titleDraft, generatedGameId and generationTaskId from backend snapshots', () => {
    const snapshot = normalizeCreationSessionSnapshot({
      id: 'session-3',
      status: 'ready',
      titleDraft: '后端草案标题',
      initialPrompt: '后端初始提示词',
      generatedGameId: 'game-3',
      generationTaskId: 'task-3',
    });

    expect(snapshot).toEqual(expect.objectContaining({
      sessionId: 'session-3',
      title: '后端草案标题',
      prompt: '后端初始提示词',
      gameId: 'game-3',
      generationTask: expect.objectContaining({
        taskId: 'task-3',
        gameId: 'game-3',
      }),
    }));
  });

  test('keeps schema-aligned stream and multi-turn fields on normalized snapshots', () => {
    const snapshot = normalizeCreationSessionSnapshot({
      id: 'session-4',
      streamPath: '/api/v1/games/creation-sessions/session-4/events',
      status: 'collecting',
      titleDraft: '像素摸鱼',
      initialPrompt: '做一个办公室题材的搞笑小游戏',
      readyToGenerate: true,
      skippedSlots: ['difficulty'],
      slotFillPct: 0.75,
      questionBudget: 4,
      intentBuild: {
        brief: '办公室摸鱼小游戏',
      },
      conversation: [
        { role: 'user', content: '做一个办公室题材的搞笑小游戏', kind: 'prompt' },
      ],
      currentQuestion: {
        slotKey: 'win_condition',
        label: 'Win Condition',
        prompt: '玩家怎样才算赢？',
        skippable: true,
      },
    });

    expect(snapshot).toEqual(expect.objectContaining({
      sessionId: 'session-4',
      streamPath: '/api/v1/games/creation-sessions/session-4/events',
      titleDraft: '像素摸鱼',
      initialPrompt: '做一个办公室题材的搞笑小游戏',
      readyToGenerate: true,
      skippedSlots: ['difficulty'],
      slotFillPct: 0.75,
      questionBudget: 4,
      intentBuild: expect.objectContaining({
        brief: '办公室摸鱼小游戏',
      }),
      currentQuestion: expect.objectContaining({
        slotKey: 'win_condition',
        content: '玩家怎样才算赢？',
        skippable: true,
      }),
      messages: [
        expect.objectContaining({
          role: 'user',
          content: '做一个办公室题材的搞笑小游戏',
          kind: 'prompt',
        }),
      ],
    }));
  });
});

describe('creation session streaming helpers', () => {
  let lastEventSourceInstance = null;

  beforeEach(() => {
    jest.clearAllMocks();

    global.EventSource = class MockEventSource {
      constructor(url) {
        this.url = url;
        this.listeners = {};
        this.onopen = null;
        this.onerror = null;
        lastEventSourceInstance = this;
      }

      addEventListener(type, callback) {
        this.listeners[type] = callback;
      }

      removeEventListener(type) {
        delete this.listeners[type];
      }

      close() {
        this.closed = true;
      }
    };

    if (typeof window !== 'undefined') {
      window.EventSource = global.EventSource;
    }
  });

  afterEach(() => {
    delete global.EventSource;
    if (typeof window !== 'undefined') {
      delete window.EventSource;
    }
    lastEventSourceInstance = null;
  });

  test('builds stream URLs with the bearer token query parameter', () => {
    expect(buildCreationSessionStreamUrl({
      sessionId: 'session-22',
      streamPath: '/api/v1/games/creation-sessions/session-22/events',
    })).toContain('/api/v1/games/creation-sessions/session-22/events?token=token-1');
  });

  test('normalizes SSE delta payloads for the store runtime', () => {
    expect(normalizeCreationSessionStreamEvent({
      type: 'delta',
      sessionId: 'session-31',
      messageId: 'reply-31',
      delta: '玩家',
      accumulated: '玩家怎样才算赢？',
      kind: 'question',
      timestamp: 1710000000000,
    })).toEqual(expect.objectContaining({
      type: 'delta',
      sessionId: 'session-31',
      messageId: 'reply-31',
      accumulated: '玩家怎样才算赢？',
      kind: 'question',
      timestamp: 1710000000000,
    }));
  });

  test('subscribes to named stream events and forwards normalized payloads', () => {
    const receivedEvents = [];
    const unsubscribe = subscribeCreationSessionStream({
      sessionId: 'session-44',
      streamPath: 'https://gamevallies.com/api/v1/games/creation-sessions/session-44/events',
    }, {
      onDelta: (event) => receivedEvents.push(event),
    });

    expect(lastEventSourceInstance?.url || '').toContain('session-44/events?token=token-1');

    lastEventSourceInstance.listeners.delta({
      data: JSON.stringify({
        type: 'delta',
        sessionId: 'session-44',
        messageId: 'reply-44',
        delta: '玩家',
        accumulated: '玩家怎样才算赢？',
        kind: 'question',
      }),
    });

    expect(receivedEvents[0]).toEqual(expect.objectContaining({
      type: 'delta',
      sessionId: 'session-44',
      messageId: 'reply-44',
      accumulated: '玩家怎样才算赢？',
    }));

    unsubscribe();
    expect(lastEventSourceInstance.closed).toBe(true);
  });
});
