import Taro from '@tarojs/taro';
import { API_CONFIG } from '../types';

/**
 * Parse the WS_URL (Socket.IO client format: "http://host/namespace")
 * into the engine.io HTTP base URL and the Socket.IO namespace.
 *
 * Examples:
 *   "http://localhost:3002/ws"  → { engineBase: "http://localhost:3002", namespace: "/ws" }
 *   "https://api.example.com"  → { engineBase: "https://api.example.com", namespace: "/" }
 */
function normalizePathPrefix(pathname) {
  if (!pathname || pathname === '/') return '';
  return String(pathname).replace(/\/+$/, '');
}

export function parseWsUrl(wsUrl) {
  if (!wsUrl) return { engineBase: '', enginePathPrefix: '', namespace: '/' };

  try {
    // Accept ws:// / wss:// as well as http:// / https://
    const normalized = String(wsUrl).replace(/^wss?:\/\//, (m) =>
      m === 'wss://' ? 'https://' : 'http://'
    );
    const url = new URL(normalized);
    const enginePathPrefix = normalizePathPrefix(url.pathname);
    return {
      engineBase: url.origin,
      enginePathPrefix,
      namespace: enginePathPrefix || '/',
    };
  } catch (_e) {
    const enginePathPrefix = wsUrl.startsWith('/') ? normalizePathPrefix(wsUrl) : '';
    return {
      engineBase: enginePathPrefix ? '' : wsUrl,
      enginePathPrefix,
      namespace: enginePathPrefix || '/',
    };
  }
}

/**
 * Build the engine.io WebSocket URL for a direct-WebSocket connection to
 * a Socket.IO v4 server (bypasses the HTTP-polling handshake).
 *
 * Result: wss://host/socket.io/?EIO=4&transport=websocket&token=…
 */
export function buildEngineIoWsUrl(engineBase, token, enginePathPrefix = '') {
  const normalizedPrefix = normalizePathPrefix(enginePathPrefix);
  const base = String(engineBase)
    .replace(/^https?:\/\//, (m) => (m === 'https://' ? 'wss://' : 'ws://'))
    .replace(/\/$/, '');
  const tokenPart = token ? `&token=${encodeURIComponent(token)}` : '';
  return `${base}${normalizedPrefix}/socket.io/?EIO=4&transport=websocket${tokenPart}`;
}

/**
 * Parse a raw engine.io + Socket.IO v4 message frame.
 *
 * Engine.io packet types (first character):
 *   0 = OPEN   1 = CLOSE   2 = PING   3 = PONG   4 = MESSAGE
 *
 * Socket.IO packet types (second character, only inside type-4 frames):
 *   0 = CONNECT   1 = DISCONNECT   2 = EVENT   3 = ACK   4 = CONNECT_ERROR
 *
 * Full event example:  42/ws,["gen:progress", { … }]
 *                      ^^--- engine.io MESSAGE + Socket.IO EVENT
 *                        ^^^--- namespace prefix (absent for default "/")
 */
function parseFrame(raw) {
  if (typeof raw !== 'string' || !raw.length) return null;

  const eioType = raw[0];

  // Server-sent PING → caller must reply with PONG ("3")
  if (eioType === '2') return { kind: 'ping' };

  // Socket.IO MESSAGE frame
  if (eioType === '4' && raw.length > 1) {
    const sioType = raw[1];

    // Namespace CONNECT acknowledgement
    if (sioType === '0') return { kind: 'connect' };

    // EVENT packet
    if (sioType === '2') {
      let rest = raw.slice(2);
      // Strip optional namespace prefix: "/ws," or "/other-ns,"
      if (rest.startsWith('/')) {
        const commaIdx = rest.indexOf(',');
        if (commaIdx !== -1) rest = rest.slice(commaIdx + 1);
      }
      try {
        const arr = JSON.parse(rest);
        if (Array.isArray(arr) && arr.length >= 1) {
          return {
            kind: 'event',
            name: String(arr[0]),
            data: arr.length > 1 ? arr[1] : null,
          };
        }
      } catch (_e) {
        // malformed JSON — ignore
      }
    }
  }

  return null;
}

class WebSocketManager {
  isConnected = false;
  isConnecting = false;
  listenersBound = false;
  reconnectCount = 0;
  reconnectDelay = 1000;
  maxReconnectDelay = 30000;
  _intentionalClose = false;
  _token = '';
  _namespace = '/';

  messageHandlers = new Map();
  progressHandlers = new Map();
  completeHandlers = new Map();
  globalNotificationHandlers = [];

  /**
   * Connect to the Socket.IO server.
   * Builds the engine.io WebSocket URL and handles the full handshake:
   *   1. Open connection
   *   2. Send Socket.IO namespace-connect frame ("40" or "40/ns,")
   *   3. Respond to server pings with pongs
   */
  connect(token) {
    return new Promise((resolve, reject) => {
      if (this.isConnected || this.isConnecting) {
        resolve();
        return;
      }

      this.isConnecting = true;
      this._intentionalClose = false;
      this._token = token || '';

      const { engineBase, enginePathPrefix, namespace } = parseWsUrl(API_CONFIG.WS_URL);
      this._namespace = namespace;

      const url = buildEngineIoWsUrl(engineBase, token, enginePathPrefix);

      try {
        Taro.connectSocket({
          url,
          header: { 'Content-Type': 'application/json' },
          success: () => {
            this.isConnecting = false;
            resolve();
          },
          fail: (error) => {
            this.isConnecting = false;
            reject(error);
          },
        });

        this._bindListeners();
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /** Intentionally close the connection (no reconnect). */
  disconnect() {
    this._intentionalClose = true;
    this.isConnected = false;
    try {
      Taro.closeSocket({});
    } catch (_e) {}
  }

  /**
   * Register a handler for a named Socket.IO event type.
   * The handler receives the event payload (second element of the event array).
   */
  onMessage(type, callback) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(callback);
  }

  offMessage(type, callback) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const idx = handlers.indexOf(callback);
      if (idx > -1) handlers.splice(idx, 1);
    }
  }

  /** Legacy per-gameId progress/complete handlers (kept for compatibility). */
  onProgress(gameId, callback) {
    if (!this.progressHandlers.has(gameId)) {
      this.progressHandlers.set(gameId, []);
    }
    this.progressHandlers.get(gameId).push(callback);
  }

  offProgress(gameId, callback) {
    const handlers = this.progressHandlers.get(gameId);
    if (handlers) {
      const idx = handlers.indexOf(callback);
      if (idx > -1) handlers.splice(idx, 1);
    }
  }

  onComplete(gameId, callback) {
    if (!this.completeHandlers.has(gameId)) {
      this.completeHandlers.set(gameId, []);
    }
    this.completeHandlers.get(gameId).push(callback);
  }

  offComplete(gameId, callback) {
    const handlers = this.completeHandlers.get(gameId);
    if (handlers) {
      const idx = handlers.indexOf(callback);
      if (idx > -1) handlers.splice(idx, 1);
    }
  }

  onNotification(callback) {
    this.globalNotificationHandlers.push(callback);
  }

  offNotification(callback) {
    const idx = this.globalNotificationHandlers.indexOf(callback);
    if (idx > -1) this.globalNotificationHandlers.splice(idx, 1);
  }

  getIsConnected() {
    return this.isConnected;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  _bindListeners() {
    // Taro registers these globally; only bind once per process lifetime.
    if (this.listenersBound) return;
    this.listenersBound = true;

    Taro.onSocketMessage((message) => {
      this._handleMessage(message);
    });

    Taro.onSocketOpen(() => {
      this.isConnected = true;
      this.reconnectCount = 0;
      // Socket.IO CONNECT frame for the configured namespace
      const ns = this._namespace !== '/' ? `${this._namespace},` : '';
      this._sendRaw(`40${ns}`);
    });

    Taro.onSocketError((error) => {
      console.error('[WebSocket] Socket error:', error);
    });

    Taro.onSocketClose(() => {
      const wasConnected = this.isConnected;
      this.isConnected = false;
      if (!this._intentionalClose) {
        // #9 WebSocket 断连后给用户一个轻量提示
        if (wasConnected && this.reconnectCount === 0) {
          Taro.showToast({ title: '实时连接已断开，正在重连…', icon: 'none', duration: 2000 });
        }
        this._scheduleReconnect();
      }
    });
  }

  /** Send a raw engine.io frame string (pong, namespace-connect, etc.). */
  _sendRaw(frame) {
    if (!this.isConnected) return;
    try {
      Taro.sendSocketMessage({ data: frame });
    } catch (_e) {}
  }

  _handleMessage(message) {
    try {
      const raw = typeof message.data === 'string' ? message.data : null;
      if (!raw) return;

      const parsed = parseFrame(raw);
      if (!parsed) return;

      // Respond to engine.io server-pings to keep the connection alive
      if (parsed.kind === 'ping') {
        this._sendRaw('3'); // engine.io PONG
        return;
      }

      // Namespace connect acknowledgement — nothing to do
      if (parsed.kind === 'connect') return;

      if (parsed.kind === 'event') {
        const { name: type, data } = parsed;
        const gameId = data?.gameId || null;

        // Legacy per-gameId handlers
        if (type === 'gen:progress' && gameId) {
          (this.progressHandlers.get(gameId) || []).forEach((cb) => cb(data));
        }
        if (type === 'gen:complete' && gameId) {
          (this.completeHandlers.get(gameId) || []).forEach((cb) => cb(data));
        }
        if (type === 'notification') {
          this.globalNotificationHandlers.forEach((cb) => cb(data));
        }

        // General named-event handlers — all callers receive the full payload
        (this.messageHandlers.get(type) || []).forEach((cb) => cb(data));
      }
    } catch (_e) {
      // Silently discard malformed frames
    }
  }

  _scheduleReconnect() {
    if (this.reconnectCount >= 5) {
      console.warn('[WebSocket] Max reconnect attempts reached');
      // #9 重连失败后给用户明确提示
      Taro.showToast({
        title: '实时连接断开，进度将通过轮询更新',
        icon: 'none',
        duration: 3000,
      });
      return;
    }

    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectCount),
      this.maxReconnectDelay,
    );
    this.reconnectCount += 1;

    setTimeout(() => {
      this.connect(this._token).catch(() => {});
    }, delay);
  }
}

let wsManager = null;

export function getWebSocketManager() {
  if (!wsManager) {
    wsManager = new WebSocketManager();
  }
  return wsManager;
}

export default getWebSocketManager();
