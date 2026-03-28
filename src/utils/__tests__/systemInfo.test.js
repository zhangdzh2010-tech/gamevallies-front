/* eslint-env jest */
const mockTaro = {
  getSystemInfoSync: jest.fn(() => {
    throw new Error('unsupported on h5');
  }),
};

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: mockTaro,
  ...mockTaro,
}));

describe('systemInfo fallbacks', () => {
  let warnSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('returns stable defaults when the runtime API throws', () => {
    const { getSafeSystemInfo, getSafeStatusBarHeight } = require('../systemInfo');

    expect(getSafeSystemInfo()).toEqual({
      windowHeight: 720,
      statusBarHeight: 0,
      safeArea: null,
    });
    expect(getSafeStatusBarHeight()).toBe(0);
  });
});
