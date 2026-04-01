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
    '/api/v1/auth/wechat/h5-login',
    '/api/v1/auth/wechat/oauth-login',
    '/api/v1/auth/wechat/web-login',
  ];

  return directAuthUrls.some((path) => url.includes(path));
}

function shouldRecoverUnauthorized(url) {
  if (!url || shouldBypassUnauthorizedRecovery(url)) {
    return false;
  }

  // #19 补全受保护 API 列表，确保所有认证操作都能触发 token 刷新
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
    '/api/v1/games/creation-sessions',
    '/api/v1/games/generate',
    '/api/v1/games/',
  ];

  return guardedUrls.some((path) => {
    if (path === '/api/v1/games/') {
      return /\/api\/v1\/games\/(creation-sessions(?:\/|$)|[^/]+\/(unlock|publish|settings))/.test(url);
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
  const fallbackBaseUrl = API_CONFIG.BASE_URL;
  if (!s) return fallbackBaseUrl;
  // /games/* all go to GAME service
  // game-service proxies to ai-engine internally
  if (url.startsWith('/api/v1/auth') || url.startsWith('/api/v1/users')) return s.AUTH || fallbackBaseUrl;
  if (url.startsWith('/api/v1/games')) return s.GAME || fallbackBaseUrl;
  if (url.startsWith('/api/v1/social') || url.startsWith('/api/v1/comments') || url.startsWith('/api/v1/notifications')) return s.SOCIAL || fallbackBaseUrl;
  if (url.startsWith('/api/v1/feed') || url.startsWith('/api/v1/tags') || url.startsWith('/api/v1/challenges') || url.startsWith('/api/v1/creators')) return s.FEED || fallbackBaseUrl;
  return fallbackBaseUrl;
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
  const normalizedMethod = String(method || 'GET').toUpperCase();

  try {
    const headers = {
      ...config.header
    };

    if (
      normalizedMethod !== 'GET' &&
      normalizedMethod !== 'HEAD' &&
      !Object.prototype.hasOwnProperty.call(headers, 'Content-Type') &&
      !Object.prototype.hasOwnProperty.call(headers, 'content-type')
    ) {
      headers['Content-Type'] = 'application/json';
    }

    // Add authorization token
    const token = Storage.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = shouldUseH5NoStoreFetch(method, config)
      ? await requestWithH5Fetch({
          url: finalUrl,
          method,
          timeout,
          headers,
        })
      : await Taro.request({
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
          // #16 Token 刷新增加重试机制，防止网络抖动导致全量登出
          const MAX_REFRESH_RETRIES = 2;
          for (let attempt = 0; attempt <= MAX_REFRESH_RETRIES; attempt += 1) {
            try {
              const newToken = await requestTokenRefresh(refreshToken);
              if (newToken) {
                isRefreshing = false;
                onTokenRefreshed(newToken);
                return createRequest(config, { ...retryConfig, count: 0 });
              }
            } catch (refreshErr) {
              console.warn(`Token refresh attempt ${attempt + 1} failed:`, refreshErr);
              // 如果是 4xx 错误（非网络问题），不再重试
              if (refreshErr?.statusCode >= 400 && refreshErr?.statusCode < 500) {
                break;
              }
              if (attempt < MAX_REFRESH_RETRIES) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
              }
            }
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
  const rawMessage = [error?.message, error?.errMsg]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!rawMessage) {
    return false;
  }

  const networkPatterns = [
    'network_error',
    'network error',
    'request:fail',
    'timeout',
    'timed out',
    'econnrefused',
    'econnreset',
    'enotfound',
    'enetunreach',
    '网络',
    '超时',
  ];

  return networkPatterns.some((pattern) => rawMessage.includes(pattern));
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

function appendQueryString(url, params) {
  if (!params || !params.length) {
    return url;
  }

  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}${params.join('&')}`;
}

function shouldUseH5NoStoreFetch(method, config) {
  if (process.env.TARO_ENV !== 'h5' || config?.useCache === true) {
    return false;
  }

  return String(method || 'GET').toUpperCase() === 'GET' && typeof fetch === 'function';
}

async function requestWithH5Fetch({ url, method, timeout, headers }) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;

  try {
    const response = await fetch(url, {
      method,
      headers,
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller?.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    let responseData = null;

    if (contentType.includes('application/json')) {
      responseData = await response.json();
    } else {
      const text = await response.text();
      responseData = text ? { message: text } : null;
    }

    return {
      statusCode: response.status,
      data: responseData,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('request:fail timeout');
      timeoutError.errMsg = 'request:fail timeout';
      throw timeoutError;
    }

    throw error;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
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
  const queryEntries = [];

  if (queryParams && typeof queryParams === 'object') {
    queryEntries.push(
      ...Object.entries(queryParams)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    );
  }

  finalUrl = appendQueryString(url, queryEntries);

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
