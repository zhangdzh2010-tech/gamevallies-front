/* eslint-env jest */
jest.mock('@tarojs/taro', () => ({
  connectSocket: jest.fn(),
  onSocketMessage: jest.fn(),
  onSocketOpen: jest.fn(),
  onSocketError: jest.fn(),
  onSocketClose: jest.fn(),
  closeSocket: jest.fn(),
  sendSocketMessage: jest.fn(),
  showToast: jest.fn(),
}));

const Taro = require('@tarojs/taro');
const { buildEngineIoWsUrl, parseWsUrl, getWebSocketManager } = require('../websocket');

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

describe('websocket manager health & status change', () => {
  test('exposes isHealthy and notifies status-change subscribers on open/close', () => {
    const ws = getWebSocketManager();

    // 初始:未连接 → 不健康(weapp 或连接失败场景走快轮询)
    expect(ws.isHealthy()).toBe(false);

    const statusChanges = [];
    const handler = (connected) => statusChanges.push(connected);
    ws.onStatusChange(handler);

    // 触发 connect 以绑定 Taro socket 监听器
    ws.connect('token-abc').catch(() => {});
    const openHandler = Taro.onSocketOpen.mock.calls[0][0];
    const closeHandler = Taro.onSocketClose.mock.calls[0][0];

    openHandler();
    expect(ws.getIsConnected()).toBe(true);
    expect(ws.isHealthy()).toBe(true);
    expect(statusChanges).toEqual([true]);

    closeHandler();
    expect(ws.getIsConnected()).toBe(false);
    expect(ws.isHealthy()).toBe(false);
    expect(statusChanges).toEqual([true, false]);

    ws.offStatusChange(handler);
    openHandler();
    expect(statusChanges).toEqual([true, false]);
  });
});
