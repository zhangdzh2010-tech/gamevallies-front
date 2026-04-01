/* eslint-env jest */

describe('auth wechat h5 login', () => {
  const mockGet = jest.fn();
  const assignMock = jest.fn();

  beforeEach(() => {
    jest.resetModules();
    mockGet.mockReset();

    process.env.TARO_APP_ENABLE_WECHAT_H5_LOGIN = 'true';
    process.env.TARO_APP_WECHAT_OAUTH_APP_ID = 'wx-frontend-app';
    process.env.TARO_APP_WECHAT_OAUTH_SCOPE = 'snsapi_base';

    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/#/pages/login/index');

    Object.defineProperty(window.navigator, 'userAgent', {
      value: 'Mozilla/5.0 MicroMessenger',
      configurable: true,
    });

    assignMock.mockReset();

    jest.doMock('../api', () => ({
      get: mockGet,
      post: jest.fn(),
      patch: jest.fn(),
    }));

    jest.doMock(require.resolve('../../config/env'), () => ({
      ENV: {
        WECHAT: {
          H5_LOGIN_ENABLED: true,
          H5_OAUTH_APP_ID: 'wx-frontend-app',
          H5_OAUTH_SCOPE: 'snsapi_base',
          H5_OAUTH_AUTHORIZE_URL: 'https://open.weixin.qq.com/connect/oauth2/authorize',
        },
      },
    }));

    jest.doMock('../../utils/storage', () => ({
      Storage: {
        setToken: jest.fn(),
        setRefreshToken: jest.fn(),
        setUser: jest.fn(),
        getUser: jest.fn(() => null),
      },
    }));
  });

  afterEach(() => {
    delete process.env.TARO_APP_ENABLE_WECHAT_H5_LOGIN;
    delete process.env.TARO_APP_WECHAT_OAUTH_APP_ID;
    delete process.env.TARO_APP_WECHAT_OAUTH_SCOPE;
  });

  test('prefers backend authorize url when backend endpoint succeeds', async () => {
    mockGet.mockResolvedValue({
      authorizeUrl: 'https://backend.example/wechat-authorize',
    });

    const { startWechatH5Login } = require('../auth');

    await startWechatH5Login({
      location: {
        assign: assignMock,
      },
    });

    expect(assignMock).toHaveBeenCalledWith('https://backend.example/wechat-authorize');
  });

  test('blocks h5 wechat login when switch is disabled even in wechat browser', async () => {
    jest.resetModules();
    mockGet.mockReset();
    mockGet.mockResolvedValue({
      authorizeUrl: 'https://backend.example/wechat-authorize',
    });

    jest.doMock('../api', () => ({
      get: mockGet,
      post: jest.fn(),
      patch: jest.fn(),
    }));

    jest.doMock(require.resolve('../../config/env'), () => ({
      ENV: {
        WECHAT: {
          H5_LOGIN_ENABLED: false,
          H5_OAUTH_APP_ID: 'wx-frontend-app',
          H5_OAUTH_SCOPE: 'snsapi_base',
          H5_OAUTH_AUTHORIZE_URL: 'https://open.weixin.qq.com/connect/oauth2/authorize',
        },
      },
    }));

    jest.doMock('../../utils/storage', () => ({
      Storage: {
        setToken: jest.fn(),
        setRefreshToken: jest.fn(),
        setUser: jest.fn(),
        getUser: jest.fn(() => null),
      },
    }));

    const { startWechatH5Login, isWechatH5LoginEnabled } = require('../auth');

    expect(isWechatH5LoginEnabled()).toBe(false);
    await expect(startWechatH5Login({
      location: {
        assign: assignMock,
      },
    })).rejects.toThrow();
    expect(assignMock).not.toHaveBeenCalled();
  });
});
