import { ENV } from '../config/env';





export class WebSocketManager {
  url = ENV.WS_URL;
  socket = null;
  messageHandlers = new Set();
  statusHandlers = new Set();
  reconnectAttempts = 0;
  maxReconnectAttempts = 5;
  reconnectDelay = 1000;
  heartbeatInterval = null;
  messageQueue = [];
  token = null;

  constructor(token) {
    if (token) {
      this.token = token;
    }
  }

  setToken(token) {
    this.token = token;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL(this.url);
        if (this.token) {
          url.searchParams.append('token', this.token);
        }

        this.notifyStatusChange('connecting');

        this.socket = new WebSocket(url.toString());

        this.socket.onopen = () => {
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.flushMessageQueue();
          this.notifyStatusChange('connected');
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.notifyMessage(message);
          } catch (error) {
            console.error('[WebSocket] Failed to parse message:', error);
          }
        };

        this.socket.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
          this.notifyStatusChange('error');
          reject(error);
        };

        this.socket.onclose = () => {
          this.stopHeartbeat();
          this.notifyStatusChange('disconnected');
          this.attemptReconnect();
        };
      } catch (error) {
        console.error('[WebSocket] Connection failed:', error);
        this.notifyStatusChange('error');
        reject(error);
      }
    });
  }

  disconnect() {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  send(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      // Queue message if not connected
      this.messageQueue.push(message);
    }
  }

  onMessage(handler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatusChange(handler) {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  notifyMessage(message) {
    this.messageHandlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.error('[WebSocket] Error in message handler:', error);
      }
    });
  }

  notifyStatusChange(status) {
    this.statusHandlers.forEach((handler) => {
      try {
        handler(status);
      } catch (error) {
        console.error('[WebSocket] Error in status handler:', error);
      }
    });
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.send({
        type: 'connection',
        payload: { action: 'ping' },
        timestamp: new Date().toISOString()
      });
    }, 30000); // 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message);
      }
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

      setTimeout(() => {
        this.connect().catch((error) => {
          console.error('[WebSocket] Reconnection failed:', error);
        });
      }, delay);
    } else {
      console.error('[WebSocket] Max reconnection attempts reached');
    }
  }

  isConnected() {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  getStatus() {
    if (!this.socket) {
      return 'disconnected';
    }
    switch (this.socket.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'disconnecting';
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'unknown';
    }
  }
}

// Global WebSocket instance
let wsManager = null;

export function getWebSocketManager(token) {
  if (!wsManager) {
    wsManager = new WebSocketManager(token);
  }
  return wsManager;
}

export function resetWebSocketManager() {
  if (wsManager) {
    wsManager.disconnect();
    wsManager = null;
  }
}
