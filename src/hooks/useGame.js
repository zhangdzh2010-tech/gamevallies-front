import { useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { getWebSocketManager } from '../services/websocket';

/**
 * Hook for game operations
 */
export function useGame() {
  const {
    currentGame,
    isGenerating,
    generationProgress,
    isLoading,
    error,
    createGame,
    iterateGame,
    forkGame,
    publishGame,
    fetchMyGames,
    setCurrentGame,
    clearError
  } = useGameStore();

  const { token, isAuthenticated } = useAuthStore();

  // Setup WebSocket on mount if authenticated
  useEffect(() => {
    if (isAuthenticated && token) {
      const ws = getWebSocketManager();

      if (!ws.getIsConnected()) {
        ws.connect(token).catch((error) => {
          console.error('WebSocket connection failed:', error);
        });
      }
    }
  }, [isAuthenticated, token]);

  return {
    currentGame,
    isGenerating,
    progress: generationProgress,
    isLoading,
    error,
    create: createGame,
    iterate: iterateGame,
    fork: forkGame,
    publish: publishGame,
    fetchMyGames,
    setCurrentGame,
    clearError
  };
}

export default useGame;