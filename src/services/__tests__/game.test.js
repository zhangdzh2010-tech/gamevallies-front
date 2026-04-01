/* eslint-env jest */
import { post } from '../api';
import {
  abandonCreationSession,
  createCreationSession,
  generateFromCreationSession,
  generateGame,
  normalizeCreationSessionSnapshot,
} from '../game';

jest.mock('../api', () => ({
  post: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  patch: jest.fn(),
}));

describe('gameService.generateGame', () => {
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
    }));
  });

  test('defaults orientation to portrait when no option is provided', async () => {
    await generateGame('做一个平台跳跃游戏', 'Portrait Game');

    expect(post).toHaveBeenCalledWith('/api/v1/games/generate', expect.objectContaining({
      title: 'Portrait Game',
      description: '做一个平台跳跃游戏',
      prompt: '做一个平台跳跃游戏',
      orientation: 'portrait',
    }));
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
});
