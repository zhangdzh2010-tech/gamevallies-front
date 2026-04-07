/* eslint-env jest */
jest.mock('@tarojs/taro', () => ({
  connectSocket: jest.fn(),
  onSocketMessage: jest.fn(),
  onSocketOpen: jest.fn(),
  onSocketError: jest.fn(),
  onSocketClose: jest.fn(),
  closeSocket: jest.fn(),
  sendSocketMessage: jest.fn(),
}));

const { buildEngineIoWsUrl, parseWsUrl } = require('../websocket');

describe('websocket service helpers', () => {
  test('preserves the /ws prefix for Socket.IO handshakes', () => {
    expect(parseWsUrl('https://gamevallies.com/ws')).toEqual({
      engineBase: 'https://gamevallies.com',
      enginePathPrefix: '/ws',
      namespace: '/ws',
    });

    expect(buildEngineIoWsUrl('https://gamevallies.com', 'token-123', '/ws')).toBe(
      'wss://gamevallies.com/ws/socket.io/?EIO=4&transport=websocket&token=token-123'
    );
  });

  test('keeps the legacy relative fallback when WS_URL is unset', () => {
    expect(parseWsUrl('')).toEqual({
      engineBase: '',
      enginePathPrefix: '',
      namespace: '/',
    });

    expect(buildEngineIoWsUrl('', '')).toBe(
      '/socket.io/?EIO=4&transport=websocket'
    );
  });
});
