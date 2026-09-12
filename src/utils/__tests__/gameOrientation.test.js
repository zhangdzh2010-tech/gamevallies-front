/* eslint-env jest */

jest.mock('../runtime', () => ({
  isH5Runtime: jest.fn(() => true),
}));

const {
  normalizeGameOrientation,
  getGameOrientation,
  isLandscapeOrientation,
  getDefaultCreateOrientation,
} = require('../gameOrientation');
const { isH5Runtime } = require('../runtime');

describe('gameOrientation utils', () => {
  beforeEach(() => {
    isH5Runtime.mockReturnValue(true);
  });

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

  test('defaults new Creative Web / PC create sessions to landscape', () => {
    expect(getDefaultCreateOrientation()).toBe('landscape');
  });

  test('defaults weapp native create sessions to portrait', () => {
    isH5Runtime.mockReturnValue(false);
    expect(getDefaultCreateOrientation()).toBe('portrait');
  });
});
