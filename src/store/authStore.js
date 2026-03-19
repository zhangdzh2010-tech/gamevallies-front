import { create } from 'zustand';
import Taro from '@tarojs/taro';

import * as authService from '../services/auth';
import { Storage } from '../utils/storage';

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  loadFromStorage: () => {
    const token = Storage.getToken();
    const refreshToken = Storage.getRefreshToken();
    const user = Storage.getUser();

    set({
      token,
      refreshToken,
      user,
      isAuthenticated: !!(token && user),
    });

    if (token && !user) {
      authService
        .getMe()
        .then((userData) => {
          set({ user: userData, isAuthenticated: true });
          Storage.setUser(userData);
        })
        .catch((error) => {
          console.error('Failed to fetch user info:', error);
          get().logout();
        });
    }
  },

  login: async (account, password) => {
    set({ isLoading: true, error: null });

    try {
      const response = await authService.login(account, password);

      set({
        user: response.user,
        token: response.accessToken,
        refreshToken: response.refreshToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || '登录失败',
      });
      throw error;
    }
  },

  loginByPhone: async (phone, smsCode) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.loginByPhone(phone, smsCode);
      set({
        user: response.user,
        token: response.accessToken,
        refreshToken: response.refreshToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({ isLoading: false, error: error.message || '登录失败' });
      throw error;
    }
  },

  loginByWechatMiniapp: async (nickname, avatarUrl) => {
    set({ isLoading: true, error: null });
    try {
      const loginResult = await Taro.login();
      if (!loginResult?.code) {
        throw new Error('未获取到微信登录 code');
      }

      const response = await authService.loginByWechatMiniapp(
        loginResult.code,
        nickname,
        avatarUrl,
      );

      set({
        user: response.user,
        token: response.accessToken,
        refreshToken: response.refreshToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({ isLoading: false, error: error.message || '微信登录失败' });
      throw error;
    }
  },

  registerByPhone: async (phone, smsCode, nickname, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.registerByPhone(phone, smsCode, nickname, password);
      set({
        user: response.user,
        token: response.accessToken,
        refreshToken: response.refreshToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({ isLoading: false, error: error.message || '注册失败' });
      throw error;
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null });

    try {
      const response = await authService.register(data);

      set({
        user: response.user,
        token: response.accessToken,
        refreshToken: response.refreshToken,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        error: error.message || '注册失败',
      });
      throw error;
    }
  },

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
      error: null,
    });
  },

  refreshAuth: async () => {
    const { refreshToken } = get();

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const newToken = await authService.refreshTokenRequest(refreshToken);

      set({
        token: newToken,
      });
    } catch (error) {
      set({ isAuthenticated: false });
      throw error;
    }
  },

  setUser: (user) => {
    set({ user });
    Storage.setUser(user);
  },

  clearError: () => {
    set({ error: null });
  },
}));

export default useAuthStore;
