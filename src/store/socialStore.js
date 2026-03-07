import { create } from 'zustand';

import * as socialService from '../services/social';
import { getWebSocketManager } from '../services/websocket';

















export const useSocialStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,

  /**
   * Like a game
   */
  likeGame: async (gameId) => {
    try {
      const result = await socialService.likeGame('game', gameId);
      return result;
    } catch (error) {
      set({ error: error.message || 'Like failed' });
      throw error;
    }
  },

  /**
   * Follow user
   */
  followUser: async (userId) => {
    try {
      const result = await socialService.followUser(userId);
      return result;
    } catch (error) {
      set({ error: error.message || 'Follow failed' });
      throw error;
    }
  },

  /**
   * Add comment to game
   */
  addComment: async (gameId, content, parentId) => {
    set({ isLoading: true, error: null });

    try {
      await socialService.createComment(gameId, content, parentId);
      set({ isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || 'Comment failed'
      });
      throw error;
    }
  },

  /**
   * Fetch notifications
   */
  fetchNotifications: async (page = 1) => {
    set({ isLoading: true, error: null });

    try {
      const result = await socialService.getNotifications(page, 10);

      set({
        notifications: page === 1 ? result.items : [...get().notifications, ...result.items],
        isLoading: false
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || 'Failed to fetch notifications'
      });
    }
  },

  /**
   * Mark notifications as read
   */
  markAsRead: async (ids) => {
    try {
      await socialService.markNotificationsAsRead(ids);

      // Update local state
      const { notifications } = get();
      const updated = notifications.map((n) =>
      ids.includes(n.id) ? { ...n, read: true } : n
      );

      set({ notifications: updated });
    } catch (error) {
      set({ error: error.message || 'Failed to mark as read' });
    }
  },

  /**
   * Mark all notifications as read
   */
  markAllRead: async () => {
    try {
      await socialService.markAllNotificationsAsRead();

      // Update local state
      const { notifications } = get();
      const updated = notifications.map((n) => ({ ...n, read: true }));

      set({ notifications: updated, unreadCount: 0 });
    } catch (error) {
      set({ error: error.message || 'Failed to mark all as read' });
    }
  },

  /**
   * Fetch unread notification count
   */
  fetchUnreadCount: async () => {
    try {
      const count = await socialService.getUnreadCount();
      set({ unreadCount: count });
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  },

  /**
   * Clear error
   */
  clearError: () => {
    set({ error: null });
  }
}));

// Setup WebSocket listener for real-time notifications
export function setupSocialWebSocketListeners() {
  const ws = getWebSocketManager();
  const store = useSocialStore;

  ws.onNotification((data) => {
    const { notifications } = store.getState();

    // Add new notification to the beginning
    const newNotifications = [data, ...notifications];

    store.setState({
      notifications: newNotifications.slice(0, 100), // Keep last 100
      unreadCount: store.getState().unreadCount + 1
    });
  });
}

export default useSocialStore;