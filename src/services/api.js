import Taro from '@tarojs/taro';
import { API_CONFIG } from '../types';
import { Storage } from '../utils/storage';















const DEFAULT_RETRY_CONFIG = {
  count: API_CONFIG.RETRY_COUNT,
  delay: API_CONFIG.RETRY_DELAY,
  maxDelay: 10000
};

let isRefreshing = false;
let refreshSubscribers = [];

/**
 * Subscribe to token refresh
 */
function subscribeTokenRefresh(callback) {
  refreshSubscribers.push(callback);
}

/**
 * Notify all subscribers of new token
 */
function onTokenRefreshed(token) {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

function shouldBypassUnauthorizedRecovery(url) {
  if (!url) return false;

  const directAuthUrls = [
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/sms/login',
    '/api/v1/auth/sms/register',
    '/api/v1/auth/sms/send-code',
    '/api/v1/auth/wechat/miniapp-login',
  ];

  return directAuthUrls.some((path) => url.includes(path));
}

function shouldRecoverUnauthorized(url) {
  if (!url || shouldBypassUnauthorizedRecovery(url)) {
    return false;
  }

  const guardedUrls = [
    '/api/v1/social',
    '/api/v1/comments',
    '/api/v1/notifications',
    '/api/v1/users/me',
    '/api/v1/users/profile',
    '/api/v1/users/quota',
    '/api/v1/users/avatar',
    '/api/v1/subscription',
    '/api/v1/feed/following',
    '/api/v1/games/my',
    '/api/v1/games/tasks',
    '/api/v1/games/',
  ];

  return guardedUrls.some((path) => {
    if (path === '/api/v1/games/') {
      return /\/api\/v1\/games\/[^/]+\/(unlock|iterate|publish|settings|fork)/.test(url);
    }

    return url.includes(path);
  });
}

function normalizeBackendMessage(message) {
  if (Array.isArray(message)) {
    return message.filter(Boolean).join('；');
  }

  return message;
}

/**
 * Resolve base URL by matching API path to the appropriate microservice
 */
function resolveBaseUrl(url) {
  const s = API_CONFIG.SERVICE_URLS;
  if (!s) return API_CONFIG.BASE_URL;
  // /games/* (including /generate, /iterate) all go to GAME service
  // game-service proxies to ai-engine internally
  if (url.startsWith('/api/v1/auth') || url.startsWith('/api/v1/users')) return s.AUTH;
  if (url.startsWith('/api/v1/games')) return s.GAME;
  if (url.startsWith('/api/v1/social') || url.startsWith('/api/v1/comments') || url.startsWith('/api/v1/notifications')) return s.SOCIAL;
  if (url.startsWith('/api/v1/feed') || url.startsWith('/api/v1/tags') || url.startsWith('/api/v1/challenges') || url.startsWith('/api/v1/creators')) return s.FEED;
  return API_CONFIG.BASE_URL;
}

async function requestTokenRefresh(refreshToken) {
  const refreshPath = '/api/v1/auth/refresh';
  const refreshUrl = `${resolveBaseUrl(refreshPath)}${refreshPath}`;
  const response = await Taro.request({
    url: refreshUrl,
    method: 'POST',
    data: { refreshToken },
    header: {
      'Content-Type': 'application/json',
    },
    timeout: API_CONFIG.TIMEOUT,
  });

  if (response.statusCode >= 400) {
    const errorMessage = normalizeBackendMessage(response.data && response.data.message) || `HTTP ${response.statusCode}`;
    const error = new Error(errorMessage);
    error.statusCode = response.statusCode;
    throw error;
  }

  const result = response.data;
  const payload = result && result.data ? result.data : result;
  const nextAccessToken = payload?.accessToken || payload?.token;

  if (!nextAccessToken) {
    throw new Error('刷新 token 响应缺少 accessToken');
  }

  Storage.setToken(nextAccessToken);
  if (payload.refreshToken) {
    Storage.setRefreshToken(payload.refreshToken);
  }

  return nextAccessToken;
}

/**
 * Create request with error handling and retry logic
 */
export async function createRequest(
config,
retryConfig = DEFAULT_RETRY_CONFIG)
{
  const { method, url, data, timeout = API_CONFIG.TIMEOUT } = config;
  const finalUrl = url.startsWith('http') ? url : `${resolveBaseUrl(url)}${url}`;

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...config.header
    };

    // Add authorization token
    const token = Storage.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await Taro.request({
      url: finalUrl,
      method,
      data,
      header: headers,
      timeout
    });

    // Handle response
    const result = response.data;

    // Only protected APIs should trigger token refresh / relogin flow.
    // Login-related endpoints may also return 401, but those should surface
    // the backend message directly instead of being rewritten as "请先登录".
    if (response.statusCode === 401 && shouldRecoverUnauthorized(url)) {
      if (!isRefreshing) {
        isRefreshing = true;
        const refreshToken = Storage.getRefreshToken();

        if (refreshToken) {
          try {
            const newToken = await requestTokenRefresh(refreshToken);
            if (newToken) {
              isRefreshing = false;
              onTokenRefreshed(newToken);
              return createRequest(config, { ...retryConfig, count: 0 });
            }
          } catch (refreshErr) {
            console.warn('Token refresh failed:', refreshErr);
          }
        }

        isRefreshing = false;

        // Clear tokens and navigate to login
        Storage.removeToken();
        Storage.removeRefreshToken();

        try {
          Taro.navigateTo({ url: '/pages/login/index' });
        } catch (_e) {
          // ignore navigation error
        }
        throw new Error('请先登录');
      } else {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh(() => {
            createRequest(config, { ...retryConfig, count: 0 })
              .then(resolve)
              .catch(reject);
          });
        });
      }
    }

    // Handle other HTTP errors
    if (response.statusCode >= 400) {
      const msg = normalizeBackendMessage(result && result.message) || `HTTP ${response.statusCode}`;
      const error = new Error(msg);
      error.code = result && result.code;
      error.statusCode = response.statusCode;
      throw error;
    }

    // Handle API-level errors
    if (result && result.code !== undefined && result.code !== 0 && result.code !== 200) {
      const error = new Error(normalizeBackendMessage(result && result.message) || 'API Error');
      error.code = result.code;
      throw error;
    }

    return result ? result.data : null;
  } catch (error) {
    // Retry logic for network errors
    if (retryConfig.count > 0 && isNetworkError(error)) {
      const delay = Math.min(retryConfig.delay * 2, retryConfig.maxDelay);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return createRequest(config, {
        ...retryConfig,
        count: retryConfig.count - 1,
        delay
      });
    }

    // Format error message
    const errorMessage = formatErrorMessage(error);
    console.error(`[API Error] ${config.method} ${finalUrl}:`, errorMessage);
    throw error;
  }
}

/**
 * Check if error is network-related
 */
function isNetworkError(error) {
  const networkErrors = ['NETWORK_ERROR', 'TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND'];
  return networkErrors.some((err) => error.message?.includes(err));
}

/**
 * Format error message
 */
function formatErrorMessage(error) {
  if (error.message) return error.message;
  if (error.errMsg) return error.errMsg;
  if (error.code) return `Error ${error.code}`;
  return 'Unknown error';
}

/**
 * GET request — query params are explicitly appended to the URL
 */
export async function get(
url,
config)
{
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
      ...restConfig
    },
    config?.timeout ? { count: 0, delay: 0, maxDelay: 0 } : DEFAULT_RETRY_CONFIG
  );
}

/**
 * POST request
 */
export async function post(
url,
data,
config)
{
  return createRequest(
    {
      method: 'POST',
      url,
      data,
      ...config
    },
    config?.timeout ? { count: 0, delay: 0, maxDelay: 0 } : DEFAULT_RETRY_CONFIG
  );
}

/**
 * PATCH request
 */
export async function patch(
url,
data,
config)
{
  return createRequest(
    {
      method: 'PATCH',
      url,
      data,
      ...config
    },
    config?.timeout ? { count: 0, delay: 0, maxDelay: 0 } : DEFAULT_RETRY_CONFIG
  );
}

/**
 * PUT request
 */
export async function put(
url,
data,
config)
{
  return createRequest(
    {
      method: 'PUT',
      url,
      data,
      ...config
    },
    config?.timeout ? { count: 0, delay: 0, maxDelay: 0 } : DEFAULT_RETRY_CONFIG
  );
}

/**
 * DELETE request
 */
export async function del(
url,
config)
{
  return createRequest(
    {
      method: 'DELETE',
      url,
      ...config
    },
    config?.timeout ? { count: 0, delay: 0, maxDelay: 0 } : DEFAULT_RETRY_CONFIG
  );
}

export default {
  createRequest,
  get,
  post,
  patch,
  put,
  del
};
