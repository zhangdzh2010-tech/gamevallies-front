/* eslint-env jest */

const {
  DESKTOP_VIEWPORT_MIN_WIDTH,
  getViewportWidth,
  isDesktopViewport,
  isH5WebBuild,
  isPcWebViewport,
} = require('../runtime');

describe('desktop viewport helpers', () => {
  const previousEnv = process.env.TARO_ENV;

  afterEach(() => {
    process.env.TARO_ENV = previousEnv;
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 });
  });

  test('reads the current viewport width', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });
    expect(getViewportWidth()).toBe(390);
    expect(isDesktopViewport()).toBe(false);
    expect(isDesktopViewport(1280)).toBe(true);
    expect(DESKTOP_VIEWPORT_MIN_WIDTH).toBe(768);
  });

  test('PC web is H5 build plus a wide viewport, never weapp', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1440 });
    process.env.TARO_ENV = 'h5';
    expect(isH5WebBuild()).toBe(true);
    expect(isPcWebViewport()).toBe(true);
    process.env.TARO_ENV = 'weapp';
    expect(isH5WebBuild()).toBe(false);
    expect(isPcWebViewport()).toBe(false);
  });
});
