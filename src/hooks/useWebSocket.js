import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { getWebSocketManager } from '../services/websocket';

/**
 * Hook for WebSocket management
 */
export function useWebSocket() {
  const { token, isAuthenticated } = useAuthStore();
  const [isConnected, setIsConnected] = useState(false);

  const ws = getWebSocketManager();

  useEffect(() => {
    if (!isAuthenticated || !token) {
      // Disconnect if not authenticated
      if (isConnected) {
        ws.disconnect();
        setIsConnected(false);
      }
      return;
    }

    // Connect on mount if authenticated
    if (!ws.getIsConnected()) {
      ws.connect(token).
      then(() => {
        setIsConnected(true);
      }).
      catch((error) => {
        console.error('WebSocket connection failed:', error);
        setIsConnected(false);
      });
    } else {
      setIsConnected(true);
    }

    // Cleanup on unmount
    return () => {

      // Don't disconnect on unmount, keep connection alive
    };}, [isAuthenticated, token, ws, isConnected]);

  return {
    isConnected,
    send: (message) => {
      if (isConnected) {
        ws.send(message);
      }
    },
    ws
  };
}

export default useWebSocket;