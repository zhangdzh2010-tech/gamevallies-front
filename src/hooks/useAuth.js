import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

/**
 * Hook for authentication
 */
export function useAuth() {
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    loadFromStorage,
    clearError
  } = useAuthStore();

  // Load auth state from storage on mount
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    clearError
  };
}

export default useAuth;