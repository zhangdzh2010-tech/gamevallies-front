/* eslint-env jest */

jest.mock('../media', () => ({
  getSafeGameImage: jest.fn(() => ''),
}));

jest.mock('../gameTypes', () => ({
  normalizeGameTypeKey: jest.fn((value) => value || ''),
}));

const { buildH5ShareUrl, getGameShareLink, getShareConfig } = require('../share');

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

  test('buildH5ShareUrl always inserts the Taro hash between pathname and the page path', () => {
    expect(buildH5ShareUrl('/pages/game/detail/index?id=game-1', {
      origin: 'https://www.zlspace.ai',
      pathname: '/',
    })).toBe('https://www.zlspace.ai/#/pages/game/detail/index?id=game-1');
    expect(buildH5ShareUrl('/pages/game/experience/index?id=game-1', {
      origin: 'https://www.zlspace.ai',
      pathname: '/index.html',
    })).toBe('https://www.zlspace.ai/index.html#/pages/game/experience/index?id=game-1');
  });

  test('getGameShareLink no longer concatenates origin and the page path without a hash', () => {
    const previous = `${window.location.origin}/pages/game/detail/index?id=game-9`;
    const link = getGameShareLink('game-9');
    expect(link).toBe(`${window.location.origin}${window.location.pathname || '/'}#/pages/game/experience/index?id=game-9`);
    expect(link).not.toBe(previous);
    expect(link).toContain('#/pages/game/experience/index?id=game-9');
    expect(getGameShareLink('game-9', 'https://www.zlspace.ai', null)).toBe(
      'https://www.zlspace.ai/#/pages/game/experience/index?id=game-9',
    );
  });
});
