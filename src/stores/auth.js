import { create } from 'zustand';

import { request } from '@/utils/request';
import { storage } from '@/utils/storage';
import { ENV } from '@/config/env';




















export const useAuthStore = create((set, get) => ({
  user: null,
  tokens: null,
  status: 'idle',
  error: null,

  setUser: (user) => set({ user }),
  setTokens: (tokens) => set({ tokens }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),

  login: async (phone, code) => {
    set({ status: 'loading', error: null });
    try {
      const response = await request.post('/auth/login',
      { phone, code },
      { skipAuth: true }
      );

      const { user, tokens } = response;

      set({ user, tokens, status: 'authenticated', error: null });

      // Store tokens and user
      await storage.setItem(ENV.STORAGE_KEYS.USER, user);
      await storage.setItem(ENV.STORAGE_KEYS.ACCESS_TOKEN, tokens.access_token);
      await storage.setItem(ENV.STORAGE_KEYS.REFRESH_TOKEN, tokens.refresh_token);

      request.setToken(tokens.access_token);
    } catch (error) {
      const errorMessage = error.message || 'Login failed';
      set({ status: 'error', error: errorMessage });
      throw error;
    }
  },

  logout: async () => {
    set({ status: 'loading' });
    try {
      await request.post('/auth/logout', {});
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      set({ user: null, tokens: null, status: 'unauthenticated', error: null });
      request.clearToken();
      await storage.removeItem(ENV.STORAGE_KEYS.USER);
      await storage.removeItem(ENV.STORAGE_KEYS.ACCESS_TOKEN);
      await storage.removeItem(ENV.STORAGE_KEYS.REFRESH_TOKEN);
    }
  },

  refreshToken: async () => {
    try {
      const tokens = get().tokens;
      if (!tokens) throw new Error('No refresh token available');

      const response = await request.post('/auth/refresh',
      { refresh_token: tokens.refresh_token },
      { skipAuth: true }
      );

      const newTokens = response;
      set({ tokens: newTokens });

      await storage.setItem(ENV.STORAGE_KEYS.ACCESS_TOKEN, newTokens.access_token);
      await storage.setItem(ENV.STORAGE_KEYS.REFRESH_TOKEN, newTokens.refresh_token);

      request.setToken(newTokens.access_token);
    } catch (error) {
      set({ status: 'unauthenticated', error: 'Token refresh failed' });
      request.clearToken();
      throw error;
    }
  },

  checkAuth: async () => {
    try {
      const user = await storage.getItem(ENV.STORAGE_KEYS.USER);
      const accessToken = await storage.getItem(ENV.STORAGE_KEYS.ACCESS_TOKEN);
      const refreshToken = await storage.getItem(ENV.STORAGE_KEYS.REFRESH_TOKEN);

      if (user && accessToken && refreshToken) {
        const tokens = {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 0 // Would need to get from server
        };

        set({ user, tokens, status: 'authenticated' });
        request.setToken(accessToken);

        // Try to refresh token if needed
        try {
          await get().refreshToken();
        } catch (error) {
          // If refresh fails, still use existing token
          console.warn('Token refresh failed, using existing token');
        }
      } else {
        set({ status: 'unauthenticated' });
      }
    } catch (error) {
      console.error('Check auth error:', error);
      set({ status: 'unauthenticated' });
    }
  },

  updateProfile: async (updates) => {
    try {
      const user = get().user;
      if (!user) throw new Error('No user logged in');

      const response = await request.put('/users/me', updates);
      const updatedUser = response;

      set({ user: updatedUser });
      await storage.setItem(ENV.STORAGE_KEYS.USER, updatedUser);
    } catch (error) {
      set({ error: error.message || 'Update failed' });
      throw error;
    }
  }
}));