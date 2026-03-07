import { useEffect } from 'react';
import { useSocialStore, setupSocialWebSocketListeners } from '../store/socialStore';
import { useAuthStore } from '../store/authStore';

/**
 * Hook for notifications
 */
export function useNotifications() {
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllRead,
    clearError
  } = useSocialStore();

  const { isAuthenticated } = useAuthStore();

  // Setup WebSocket listeners and initial fetch on mount
  useEffect(() => {
    if (isAuthenticated) {
      // Setup WebSocket listeners for real-time notifications
      setupSocialWebSocketListeners();

      // Fetch initial data
      fetchNotifications(1);
      fetchUnreadCount();

      // Refresh every 30 seconds
      const interval = setInterval(() => {
        fetchUnreadCount();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchNotifications, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
    markAllRead,
    clearError
  };
}

export default useNotifications;