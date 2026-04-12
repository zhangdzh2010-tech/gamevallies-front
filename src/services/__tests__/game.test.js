/* eslint-env jest */
import { post } from '../api';
import {
  abandonCreationSession,
  buildCreationSessionStreamUrl,
  createCreationSession,
  generateFromCreationSession,
  generateGame,
  normalizeCreationSessionSnapshot,
  normalizeCreationSessionStreamEvent,
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

jest.mock('../../utils/storage', () => ({
  Storage: {
    getToken: jest.fn(() => 'token-1'),
  },
}));

describe.skip('gameService.generateGame', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    post.mockResolvedValue({
      gameId: 'game-1',
      status: 'generating',
      generationTask: {
        taskId: 'task-1',
        taskType: 'pipeline_run',
        status: 'queued',
      },
    });
  });

  test('includes the requested orientation in generate requests', async () => {
    await generateGame('做一个双人竞速小游戏', 'Wide Runner', {
      orientation: 'landscape',
    });

    expect(post).toHaveBeenCalledWith('/api/v1/games/generate', expect.objectContaining({
      title: 'Wide Runner',
      description: '做一个双人竞速小游戏',
      prompt: '做一个双人竞速小游戏',
      orientation: 'landscape',
    }), expect.objectContaining({ timeout: 60000 }));
  });

  test('defaults orientation to portrait when no option is provided', async () => {
    await generateGame('做一个平台跳跃游戏', 'Portrait Game');

    expect(post).toHaveBeenCalledWith('/api/v1/games/generate', expect.objectContaining({
      title: 'Portrait Game',
      description: '做一个平台跳跃游戏',
      prompt: '做一个平台跳跃游戏',
      orientation: 'portrait',
    }), expect.objectContaining({ timeout: 60000 }));
  });
});

describe('gameService.createCreationSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
