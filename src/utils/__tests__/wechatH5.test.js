/* eslint-env jest */

describe('wechatH5 utils', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('buildWechatOauthAuthorizeUrl encodes redirect uri and state', () => {
    const { buildWechatOauthAuthorizeUrl } = require('../wechatH5');

    const authorizeUrl = buildWechatOauthAuthorizeUrl({
      appId: 'wx123456',
      redirectUri: 'https://gamevallies.com/#/pages/login/index',
      state: 'oauth-state',
      scope: 'snsapi_base',
    });

    expect(authorizeUrl).toContain('appid=wx123456');
    expect(authorizeUrl).toContain('redirect_uri=https%3A%2F%2Fgamevallies.com%2F%23%2Fpages%2Flogin%2Findex');
    expect(authorizeUrl).toContain('state=oauth-state');
    expect(authorizeUrl.endsWith('#wechat_redirect')).toBe(true);
  });

  test('extractWechatOauthParamsFromUrl reads code and state from search', () => {
    const { extractWechatOauthParamsFromUrl } = require('../wechatH5');

    expect(extractWechatOauthParamsFromUrl({
      search: '?code=oauth-code&state=oauth-state',
      hash: '#/pages/login/index',
    })).toEqual({
      code: 'oauth-code',
      state: 'oauth-state',
    });
  });

  test('clearWechatOauthParamsFromUrl strips oauth params but preserves route', () => {
    const { clearWechatOauthParamsFromUrl } = require('../wechatH5');
    const replaceState = jest.fn();

    const nextUrl = clearWechatOauthParamsFromUrl({
      href: 'https://gamevallies.com/?code=oauth-code&state=oauth-state#/pages/login/index',
      replaceState,
      title: 'GameVallies',
    });

    expect(nextUrl).toBe('/#/pages/login/index');
    expect(replaceState).toHaveBeenCalledWith({}, 'GameVallies', '/#/pages/login/index');
  });
});
