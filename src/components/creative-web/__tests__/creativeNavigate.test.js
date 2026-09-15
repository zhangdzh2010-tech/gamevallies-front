/* eslint-env jest */
const mockTaro = {
  switchTab: jest.fn(() => Promise.resolve()),
  getStorageSync: jest.fn(() => ''),
  setStorageSync: jest.fn(),
  removeStorageSync: jest.fn(),
};

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: mockTaro,
}));

describe('creativeNavigate', () => {
  beforeEach(() => {
    mockTaro.switchTab.mockClear();
    sessionStorage.clear();
    const { unregisterCreativeHomeNavigate } = require('../CreativeShell');
    unregisterCreativeHomeNavigate();
  });

  test('uses the registered Creative Home navigator without switching tabs', () => {
    const {
      creativeNavigate,
      registerCreativeHomeNavigate,
      unregisterCreativeHomeNavigate,
    } = require('../CreativeShell');
    const navigate = jest.fn();
    registerCreativeHomeNavigate(navigate);
    creativeNavigate('ideas');
    creativeNavigate('tasks');
    expect(navigate).toHaveBeenCalledWith('ideas');
    expect(navigate).toHaveBeenCalledWith('tasks');
    expect(mockTaro.switchTab).not.toHaveBeenCalled();
    unregisterCreativeHomeNavigate();
  });

  test('falls back to switchTab when Creative Home is not mounted', () => {
    const { creativeNavigate } = require('../CreativeShell');
    creativeNavigate('square');
    expect(mockTaro.switchTab).toHaveBeenCalledWith({ url: '/pages/index/index' });
  });
});
