/* eslint-env jest */
import { post } from '../api';
import { generateGame } from '../game';

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
