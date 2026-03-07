import Taro from '@tarojs/taro';
import { API_CONFIG } from '../types';











class WebSocketManager {
  socketUrl = API_CONFIG.WS_URL;
  isConnected = false;
  isConnecting = false;
  reconnectCount = 0;
  reconnectDelay = 1000;
  maxReconnectDelay = 30000;
  heartbeatInterval = null;

  messageHandlers = new Map();
  progressHandlers = new Map();
  completeHandlers = new Map();
  globalNotificationHandlers = [];

  /**
   * Connect to WebSocket
   */
  connect(token) {
    return new Promise((resolve, reject) => {
      if (this.isConnected || this.isConnecting) {
        resolve();
        return;
      }

      this.isConnecting = true;

      try {
        const url = `${this.socketUrl}?token=${token}`;

        Taro.connectSocket({
          url,
          header: {
            'Content-Type': 'application/json'
          },
          success: () => {
            this.isConnecting = false;
            console.log('[WebSocket] Connected');
            resolve();
          },
          fail: (error) => {
            this.isConnecting = false;
            console.error('[WebSocket] Connection failed:', error);
            reject(error);
          }
        });

        // Handle incoming messages
        Taro.onSocketMessage((message) => {
          this.handleMessage(message);
        });

        // Handle connection open
        Taro.onSocketOpen(() => {
          this.isConnected = true;
          this.reconnectCount = 0;
          this.startHeartbeat();
          console.log('[WebSocket] Socket opened');
        });

        // Handle errors
        Taro.onSocketError((error) => {
          console.error('[WebSocket] Error:', error);
        });

        // Handle connection close
        Taro.onSocketClose(() => {
          this.isConnected = false;
          this.stopHeartbeat();
          this.attemptReconnect(token);
          console.log('[WebSocket] Socket closed');
        });
      } catch (error) {
        this.isConnecting = false;
        console.error('[WebSocket] Connection error:', error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    this.stopHeartbeat();
    this.isConnected = false;

    try {
      Taro.closeSocket({});
    } catch (error) {
      console.error('[WebSocket] Disconnect error:', error);
    }
  }

  /**
   * Send message to server
   */
  send(message) {
    if (!this.isConnected) {
      console.warn('[WebSocket] Not connected, cannot send message');
      return;
    }

    try {
      Taro.sendSocketMessage({
        data: JSON.stringify(message)
      });
    } catch (error) {
      console.error('[WebSocket] Send error:', error);
    }
  }

  /**
   * Register general message handler
   */
  onMessage(type, callback) {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type).push(callback);
  }

  /**
   * Unregister message handler
   */
  offMessage(type, callback) {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(callback);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Listen for generation progress
   */
  onProgress(gameId, callback) {
    if (!this.progressHandlers.has(gameId)) {
      this.progressHandlers.set(gameId, []);
    }
    this.progressHandlers.get(gameId).push(callback);
  }

  /**
   * Unlisten for generation progress
   */
  offProgress(gameId, callback) {
    const handlers = this.progressHandlers.get(gameId);
    if (handlers) {
      const index = handlers.indexOf(callback);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Listen for generation complete
   */
  onComplete(gameId, callback) {
    if (!this.completeHandlers.has(gameId)) {
      this.completeHandlers.set(gameId, []);
    }
    this.completeHandlers.get(gameId).push(callback);
  }

  /**
   * Unlisten for generation complete
   */
  offComplete(gameId, callback) {
    const handlers = this.completeHandlers.get(gameId);
    if (handlers) {
      const index = handlers.indexOf(callback);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Listen for notifications
   */
  onNotification(callback) {
    this.globalNotificationHandlers.push(callback);
  }

  /**
   * Unlisten for notifications
   */
  offNotification(callback) {
    const index = this.globalNotificationHandlers.indexOf(callback);
    if (index > -1) {
      this.globalNotificationHandlers.splice(index, 1);
    }
  }

  /**
   * Check if connected
   */
  getIsConnected() {
    return this.isConnected;
  }

  /**
   * Handle incoming message
   */
  handleMessage(message) {
    try {
      let data;

      if (typeof message.data === 'string') {
        data = JSON.parse(message.data);
      } else {
        data = message.data;
      }

      const { type, gameId, data: payload } = data;

      // Handle game generation progress
      if (type === 'gen:progress' && gameId) {
        const callbacks = this.progressHandlers.get(gameId) || [];
        callbacks.forEach((cb) => cb(payload));
      }

      // Handle game generation complete
      if (type === 'gen:complete' && gameId) {
        const callbacks = this.completeHandlers.get(gameId) || [];
        callbacks.forEach((cb) => cb(payload));
      }

      // Handle notifications
      if (type === 'notification') {
        this.globalNotificationHandlers.forEach((cb) => cb(payload));
      }

      // Handle general messages
      const generalCallbacks = this.messageHandlers.get(type) || [];
      generalCallbacks.forEach((cb) => cb(payload));
    } catch (error) {
      console.error('[WebSocket] Message parsing error:', error);
    }
  }

  /**
   * Start heartbeat ping
   */
  startHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected) {
        this.send({
          type: 'ping'
        });
      }
    }, 30000); // 30 seconds
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  attemptReconnect(token) {
    if (this.reconnectCount >= 5) {
      console.warn('[WebSocket] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectCount),
      this.maxReconnectDelay
    );

    this.reconnectCount++;
    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectCount})`);

    setTimeout(() => {
      this.connect(token).catch((error) => {
        console.error('[WebSocket] Reconnection failed:', error);
      });
    }, delay);
  }
}

// Singleton instance
let wsManager = null;

/**
 * Get or create WebSocket manager instance
 */
export function getWebSocketManager() {
  if (!wsManager) {
    wsManager = new WebSocketManager();
  }
  return wsManager;
}

export default getWebSocketManager();