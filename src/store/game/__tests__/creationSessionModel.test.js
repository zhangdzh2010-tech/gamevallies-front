/* eslint-env jest */

jest.mock('../../../utils/runtime', () => ({
  isH5Runtime: jest.fn(() => true),
}));

jest.mock('../taskProgress', () => ({
  isCompletedGameStatus: jest.fn(() => false),
}));

const { buildCreationSessionContext } = require('../creationSessionModel');
const { isH5Runtime } = require('../../../utils/runtime');

describe('buildCreationSessionContext orientation defaults', () => {
  beforeEach(() => {
    isH5Runtime.mockReturnValue(true);
  });

  test('defaults omitted orientation to landscape on Creative Web', () => {
    expect(buildCreationSessionContext({
      prompt: '观察双摆轨迹如何分离',
      entryMode: 'create',
    })).toEqual(expect.objectContaining({
      orientation: 'landscape',
      entryMode: 'create',
    }));
  });

  test('defaults omitted orientation to portrait on weapp', () => {
    isH5Runtime.mockReturnValue(false);
    expect(buildCreationSessionContext({
      prompt: '观察双摆轨迹如何分离',
      entryMode: 'create',
    })).toEqual(expect.objectContaining({
      orientation: 'portrait',
    }));
  });

  test('keeps an explicit portrait choice on Creative Web', () => {
    expect(buildCreationSessionContext({
      prompt: '做一个竖向展示的交互实验',
      orientation: 'portrait',
    })).toEqual(expect.objectContaining({
      orientation: 'portrait',
    }));
  });
});
