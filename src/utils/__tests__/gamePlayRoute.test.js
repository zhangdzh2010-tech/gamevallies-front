/* eslint-env jest */

const {
  PORTRAIT_PLAY_PAGE_PATH,
  LANDSCAPE_PLAY_PAGE_PATH,
  getGamePlayPagePath,
  isLandscapePlayPagePath,
  buildGamePlayPagePath,
} = require('../gamePlayRoute');

describe('gamePlayRoute utils', () => {
  test('chooses the correct play page by orientation', () => {
    expect(getGamePlayPagePath('portrait')).toBe(PORTRAIT_PLAY_PAGE_PATH);
    expect(getGamePlayPagePath('landscape')).toBe(LANDSCAPE_PLAY_PAGE_PATH);
  });

  test('builds landscape play paths with the game id query', () => {
    expect(buildGamePlayPagePath('game-1', 'landscape')).toBe('/pages/game/play-landscape/index?id=game-1');
    expect(buildGamePlayPagePath('game-2', 'portrait', { score: 12 })).toBe('/pages/game/play/index?id=game-2&score=12');
  });

  test('detects landscape play routes', () => {
    expect(isLandscapePlayPagePath('/pages/game/play-landscape/index')).toBe(true);
    expect(isLandscapePlayPagePath('/pages/game/play/index')).toBe(false);
  });
});
