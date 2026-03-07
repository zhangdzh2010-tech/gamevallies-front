import { create } from 'zustand';

import * as authService from '../services/auth';
import { Storage } from '../utils/storage';


















export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  /**
   * Load auth state from storage on init
   */
  loadFromStorage: () => {
    const token = Storage.getToken();
    const refreshToken = Storage.getRefreshToken();
    const user = Storage.getUser();

    set({
      token,
      refreshToken,
      user,
      isAuthenticated: !!(token && user)
    });

    // If we have tokens but no user, fetch user info
    if (token && !user) {
      authService.
      getMe().
      then((userData) => {
        set({ user: userData, isAuthenticated: true });
        Storage.setUser(userData);
      }).
      catch((error) => {
        console.error('Failed to fetch user info:', error);
        // If fetching user fails, clear auth
        get().logout();
      });
    }
  },

  /**
   * Login with account and password
   */
  login: async (account, password) => {
    set({ isLoading: true, error: null });

    try {
      const response = await authService.login(account, password);

      set({
        user: response.user,
        token: response.token,
        refreshToken: response.refreshToken,
        isAuthenticated: true,
        isLoading: false,
        error: null
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || 'Login failed'
      });
      throw error;
    }
  },

  /**
   * Register new user
   */
  register: async (data) => {
    set({ isLoading: true, error: null });

    try {
      const user = await authService.register(data);

      // Auto login after successful registration
      // Note: In a real app, you might send user a verification email first
      set({
        user,
        isLoading: false,
        error: null
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || 'Registration failed'
      });
      throw error;
    }
  },

  /**
   * Logout
   */
  logout: async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    }

    set({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      error: null
    });
  },

  /**
   * Refresh authentication tokens
   */
  refreshAuth: async () => {
    const { refreshToken } = get();

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const newToken = await authService.refreshTokenRequest(refreshToken);

      set({
        token: newToken
      });
    } catch (error) {
      set({ isAuthenticated: false });
      throw error;
    }
  },

  /**
   * Set user data
   */
  setUser: (user) => {
    set({ user });
    Storage.setUser(user);
  },

  /**
   * Clear error message
   */
  clearError: () => {
    set({ error: null });
  }
}));

export default useAuthStore;