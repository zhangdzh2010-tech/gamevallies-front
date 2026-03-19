import Taro from '@tarojs/taro';
import { API_CONFIG } from '../types';
import { Storage } from '../utils/storage';

const DEFAULT_RETRY_CONFIG = {
  count: API_CONFIG.RETRY_COUNT,
  delay: API_CONFIG.RETRY_DELAY,
  maxDelay: 10000,
};

let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(callback) {
  refreshSubscribers.push(callback);
}

function onTokenRefreshed(token) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

function getAuthService() {
  return require('./auth').default;
}

function resolveBaseUrl(url) {
  const s = API_CONFIG.SERVICE_URLS;
  if (!s) return API_CONFIG.BASE_URL;
  if (url.startsWith('/api/v1/auth') || url.startsWith('/api/v1/users')) return s.AUTH;
  if (url.startsWith('/api/v1/games')) return s.GAME;
  if (url.startsWith('/api/v1/social') || url.startsWith('/api/v1/comments') || url.startsWith('/api/v1/notifications')) return s.SOCIAL;
  if (url.startsWith('/api/v1/feed') || url.startsWith('/api/v1/tags') || url.startsWith('/api/v1/challenges') || url.startsWith('/api/v1/creators')) return s.FEED;
  return API_CONFIG.BASE_URL;
}

export async function createRequest(config, retryConfig = DEFAULT_RETRY_CONFIG) {
  const { method, url, data, timeout = API_CONFIG.TIMEOUT } = config;
  const finalUrl = url.startsWith('http') ? url : `${resolveBaseUrl(url)}${url}`;

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...config.header,
    };

    const token = Storage.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await Taro.request({
      url: finalUrl,
      method,
      data,
      header: headers,
      timeout,
    });

    const result = response.data;

    if (response.statusCode === 401) {
      if (!isRefreshing) {
        isRefreshing = true;
        const refreshToken = Storage.getRefreshToken();

        if (refreshToken) {
          try {
            const authService = getAuthService();
            await authService.refreshTokenRequest(refreshToken);
            isRefreshing = false;

            const newToken = Storage.getToken();
            if (newToken) {
              onTokenRefreshed(newToken);
              return createRequest(config, { ...retryConfig, count: 0 });
            }
          } catch (refreshErr) {
            isRefreshing = false;
          }
        } else {
          isRefreshing = false;
        }

        try {
          Taro.navigateTo({ url: '/pages/login/index' });
        } catch (_e) {
          // ignore navigation error
        }
        throw new Error('请先登录');
      }

      return new Promise((resolve, reject) => {
        subscribeTokenRefresh(() => {
          createRequest(config, { ...retryConfig, count: 0 })
            .then(resolve)
            .catch(reject);
        });
      });
    }

    if (response.statusCode >= 400) {
      const msg = (result && result.message) || `HTTP ${response.statusCode}`;
      const error = new Error(msg);
      error.code = result && result.code;
      error.statusCode = response.statusCode;
      throw error;
    }

    if (result && result.code !== undefined && result.code !== 0 && result.code !== 200) {
      const error = new Error((result && result.message) || 'API Error');
      error.code = result.code;
      throw error;
    }

    return result ? result.data : null;
  } catch (error) {
    if (retryConfig.count > 0 && isNetworkError(error)) {
      const delay = Math.min(retryConfig.delay * 2, retryConfig.maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return createRequest(config, {
        ...retryConfig,
        count: retryConfig.count - 1,
        delay,
      });
    }

    const errorMessage = formatErrorMessage(error);
    console.error(`[API Error] ${config.method} ${finalUrl}:`, errorMessage);
    throw error;
  }
}

function isNetworkError(error) {
  const networkErrors = ['NETWORK_ERROR', 'TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND'];
  return networkErrors.some((err) => error.message?.includes(err));
}

function formatErrorMessage(error) {
  if (error.message) return error.message;
  if (error.errMsg) return error.errMsg;
  if (error.code) return `Error ${error.code}`;
  return 'Unknown error';
}

export async function get(url, config) {
  let finalUrl = url;
  const { data: queryParams, ...restConfig } = config || {};
  if (queryParams && typeof queryParams === 'object') {
    const entries = Object.entries(queryParams).filter(([, v]) => v !== undefined && v !== null);
    if (entries.length > 0) {
      const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
      finalUrl = `${url}?${qs}`;
    }
  }
  return createRequest(
    {
      method: 'GET',
      url: finalUrl,
      ...restConfig,
    },
    config?.timeout ? { count: 0, delay: 0, maxDelay: 0 } : DEFAULT_RETRY_CONFIG,
  );
}

export async function post(url, data, config) {
  return createRequest(
    {
      method: 'POST',
      url,
      data,
      ...config,
    },
    config?.timeout ? { count: 0, delay: 0, maxDelay: 0 } : DEFAULT_RETRY_CONFIG,
  );
}

export async function patch(url, data, config) {
  return createRequest(
    {
      method: 'PATCH',
      url,
      data,
      ...config,
    },
    config?.timeout ? { count: 0, delay: 0, maxDelay: 0 } : DEFAULT_RETRY_CONFIG,
  );
}

export async function put(url, data, config) {
  return createRequest(
    {
      method: 'PUT',
      url,
      data,
      ...config,
    },
    config?.timeout ? { count: 0, delay: 0, maxDelay: 0 } : DEFAULT_RETRY_CONFIG,
  );
}

export async function del(url, config) {
  return createRequest(
    {
      method: 'DELETE',
      url,
      ...config,
    },
    config?.timeout ? { count: 0, delay: 0, maxDelay: 0 } : DEFAULT_RETRY_CONFIG,
  );
}

export default {
  createRequest,
  get,
  post,
  patch,
  put,
  del,
};
