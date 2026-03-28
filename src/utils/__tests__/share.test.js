/* eslint-env jest */

jest.mock('../media', () => ({
  getSafeGameImage: jest.fn(() => ''),
}));

jest.mock('../gameTypes', () => ({
  normalizeGameTypeKey: jest.fn((value) => value || ''),
}));

const { getShareConfig } = require('../share');

describe('share utils', () => {
  test('builds landscape play share paths from the game orientation', () => {
    const config = getShareConfig(
      {
        id: 'game-1',
        title: 'Wide Runner',
        orientation: 'landscape',
      },
      null,
      { target: 'play' },
    );

    expect(config.path).toBe('/pages/game/play-landscape/index?id=game-1&orientation=landscape');
    expect(config.query).toBe('id=game-1&orientation=landscape');
  });

  test('prefers the explicit play orientation override', () => {
    const config = getShareConfig(
      {
        id: 'game-2',
        title: 'Portrait Runner',
        orientation: 'portrait',
      },
      88,
      {
        target: 'play',
        extraQuery: {
          orientation: 'landscape',
          source: 'share-card',
        },
      },
    );

    expect(config.path).toBe('/pages/game/play-landscape/index?id=game-2&score=88&orientation=landscape&source=share-card');
    expect(config.query).toBe('id=game-2&score=88&orientation=landscape&source=share-card');
  });
});
