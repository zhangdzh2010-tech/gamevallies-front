import { create } from 'zustand';

import * as gameService from '../services/game';
import { getWebSocketManager } from '../services/websocket';



















export const useGameStore = create((set, get) => ({
  currentGame: null,
  myGames: [],
  isGenerating: false,
  generationProgress: null,
  isLoading: false,
  error: null,

  /**
   * Create new game from description
   */
  createGame: async (description) => {
    set({ isLoading: true, isGenerating: true, error: null });

    try {
      const gameId = await gameService.generateGame(description);

      // Connect to WebSocket to listen for generation progress
      const ws = getWebSocketManager();
      const { token } = require('../store/authStore').default.getState();

      if (token && !ws.getIsConnected()) {
        await ws.connect(token);
      }

      // Listen for progress updates
      ws.onProgress(gameId, (progress) => {
        set({ generationProgress: progress });
      });

      // Listen for completion
      ws.onComplete(gameId, (result) => {
        if (result.success && result.game) {
          set({
            currentGame: result.game,
            isGenerating: false,
            generationProgress: null,
            error: null
          });
        } else {
          set({
            isGenerating: false,
            error: result.error || 'Game generation failed'
          });
        }
      });

      set({ isLoading: false });
      return gameId;
    } catch (error) {
      set({
        isLoading: false,
        isGenerating: false,
        error: error.message || 'Game creation failed'
      });
      throw error;
    }
  },

  /**
   * Iterate on existing game
   */
  iterateGame: async (gameId, feedback) => {
    set({ isLoading: true, isGenerating: true, error: null });

    try {
      const iterationId = await gameService.iterateGame(gameId, feedback);

      // Listen for iteration progress via WebSocket
      const ws = getWebSocketManager();
      ws.onProgress(gameId, (progress) => {
        set({ generationProgress: progress });
      });

      ws.onComplete(gameId, (result) => {
        if (result.success && result.game) {
          set({
            currentGame: result.game,
            isGenerating: false,
            generationProgress: null
          });
        } else {
          set({
            isGenerating: false,
            error: result.error || 'Game iteration failed'
          });
        }
      });

      set({ isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        isGenerating: false,
        error: error.message || 'Game iteration failed'
      });
      throw error;
    }
  },

  /**
   * Fork (copy) a game
   */
  forkGame: async (gameId) => {
    set({ isLoading: true, error: null });

    try {
      const newGameId = await gameService.forkGame(gameId);
      const game = await gameService.getGame(newGameId);

      set({
        currentGame: game,
        isLoading: false
      });

      return newGameId;
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || 'Game fork failed'
      });
      throw error;
    }
  },

  /**
   * Publish game
   */
  publishGame: async (gameId, data) => {
    set({ isLoading: true, error: null });

    try {
      const publishedGame = await gameService.publishGame(gameId, data);

      set({
        currentGame: publishedGame,
        isLoading: false
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || 'Game publish failed'
      });
      throw error;
    }
  },

  /**
   * Fetch user's games
   */
  fetchMyGames: async (page = 1, limit = 10) => {
    set({ isLoading: true, error: null });

    try {
      const result = await gameService.getMyGames(page, limit);

      set({
        myGames: page === 1 ? result.items : [...get().myGames, ...result.items],
        isLoading: false
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || 'Failed to fetch games'
      });
      throw error;
    }
  },

  /**
   * Set current game
   */
  setCurrentGame: (game) => {
    set({ currentGame: game });
  },

  /**
   * Set generation progress
   */
  setGenerationProgress: (progress) => {
    set({ generationProgress: progress });
  },

  /**
   * Clear error
   */
  clearError: () => {
    set({ error: null });
  }
}));

export default useGameStore;