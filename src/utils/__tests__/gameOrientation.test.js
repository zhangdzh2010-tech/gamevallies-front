/* eslint-env jest */

const {
  normalizeGameOrientation,
  getGameOrientation,
  isLandscapeOrientation,
} = require('../gameOrientation');

describe('gameOrientation utils', () => {
  test('normalizes valid orientations and falls back to portrait', () => {
    expect(normalizeGameOrientation('landscape')).toBe('landscape');
    expect(normalizeGameOrientation(' portrait ')).toBe('portrait');
    expect(normalizeGameOrientation('wide')).toBe('portrait');
  });

  test('reads orientation from game objects with common field names', () => {
    expect(getGameOrientation({ orientation: 'landscape' })).toBe('landscape');
    expect(getGameOrientation({ screenOrientation: 'landscape' })).toBe('landscape');
    expect(getGameOrientation({ gameOrientation: 'portrait' })).toBe('portrait');
    expect(getGameOrientation({}, 'landscape')).toBe('landscape');
  });

  test('detects landscape orientation from both strings and objects', () => {
    expect(isLandscapeOrientation('landscape')).toBe(true);
    expect(isLandscapeOrientation({ orientation: 'landscape' })).toBe(true);
    expect(isLandscapeOrientation({ orientation: 'portrait' })).toBe(false);
  });
});
