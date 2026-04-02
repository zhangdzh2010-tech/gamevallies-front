import { post, get, patch } from './api';
import { ENV } from '../config/env';
import { Storage } from '../utils/storage';
import {
  buildWechatOauthAuthorizeUrl,
  buildWechatOauthRedirectUri,
  clearWechatOauthParamsFromUrl,
  clearWechatOauthState,
  createWechatOauthState,
  extractWechatOauthParamsFromUrl,
  isWechatBrowser,
  persistWechatOauthState,
  readWechatOauthState,
} from '../utils/wechatH5';

const MINIAPP_LOGIN_URL = '/api/v1/auth/wechat/miniapp-login';
const H5_LOGIN_ENDPOINTS = [
  '/api/v1/auth/wechat/h5-login',
  '/api/v1/auth/wechat/oauth-login',
  '/api/v1/auth/wechat/web-login',
];
const H5_AUTHORIZE_ENDPOINTS = [
  '/api/v1/auth/wechat/h5-authorize-url',
];

export function isWechatH5LoginEnabled() {
  return Boolean(ENV?.WECHAT?.H5_LOGIN_ENABLED);
}

function extractWechatProfile(userInfo) {
  const nickname = typeof userInfo?.nickName === 'string' ? userInfo.nickName.trim() : '';
  const avatarUrl = typeof userInfo?.avatarUrl === 'string' ? userInfo.avatarUrl.trim() : '';

  return {
    nickname,
    avatarUrl,
  };
}

function hasProfileValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasDisplayName(user) {
  return hasProfileValue(user?.displayName) || hasProfileValue(user?.nickname) || hasProfileValue(user?.name);
}

function hasAvatar(user) {
  return hasProfileValue(user?.avatar) || hasProfileValue(user?.avatarUrl);
}

function mergeWechatProfile(user, userInfo) {
  const { nickname, avatarUrl } = extractWechatProfile(userInfo);

  if (!nickname && !avatarUrl) {
    return user || null;
  }

  const nextUser = {
    ...(user || {}),
  };

  if (nickname) {
    if (!hasProfileValue(nextUser.displayName)) {
      nextUser.displayName = nickname;
    }
    if (!hasProfileValue(nextUser.nickname)) {
      nextUser.nickname = nickname;
    }
    if (!hasProfileValue(nextUser.name)) {
      nextUser.name = nickname;
    }
  }

  if (avatarUrl) {
    if (!hasProfileValue(nextUser.avatar)) {
      nextUser.avatar = avatarUrl;
    }
    if (!hasProfileValue(nextUser.avatarUrl)) {
      nextUser.avatarUrl = avatarUrl;
    }
  }

  return nextUser;
}

async function persistAuthResponse(response) {
  const accessToken = response?.accessToken || response?.token;

  if (!accessToken) {
    throw new Error('登录响应缺少 accessToken');
  }

  Storage.setToken(accessToken);

  if (response?.refreshToken) {
    Storage.setRefreshToken(response.refreshToken);
  }

  let user = response?.user || null;
  if (!user) {
    try {
      user = await get('/api/v1/users/me');
    } catch (error) {
      console.warn('Failed to fetch current user after login:', error);
    }
  }

  if (user) {
    Storage.setUser(user);
  }

  return {
    ...response,
    accessToken,
    user,
  };
}

export async function sendSmsCode(phone, type) {
  return post('/api/v1/auth/sms/send-code', { phone, type });
}

export async function registerByPhone(phone, smsCode, nickname, password) {
  const response = await post('/api/v1/auth/sms/register', { phone, smsCode, nickname, password });
  return persistAuthResponse(response);
}

export async function loginByPhone(phone, smsCode) {
  const response = await post('/api/v1/auth/sms/login', { phone, smsCode });
  return persistAuthResponse(response);
}

export async function loginByWechatMiniapp(code, userInfo = null) {
  const payload = { code };
  const { nickname, avatarUrl } = extractWechatProfile(userInfo);

  if (nickname) {
    payload.nickname = nickname;
  }

  if (avatarUrl) {
    payload.avatarUrl = avatarUrl;
  }

  try {
    const response = await post(MINIAPP_LOGIN_URL, payload);
    const authData = await persistAuthResponse(response);
    const mergedUser = mergeWechatProfile(authData.user, userInfo);

    if (!mergedUser) {
      return authData;
    }

    const shouldSyncProfile =
      Boolean(userInfo) &&
      ((nickname && !hasDisplayName(authData.user)) || (avatarUrl && !hasAvatar(authData.user)));

    if (shouldSyncProfile) {
      const syncedUser = await syncWechatProfile(userInfo);
      return {
        ...authData,
        user: syncedUser || mergedUser,
      };
    }

    Storage.setUser(mergedUser);
    return {
      ...authData,
      user: mergedUser,
    };
  } catch (error) {
    if (error?.statusCode === 404) {
      throw new Error('微信登录接口未部署，请检查 /api/v1/auth/wechat/miniapp-login');
    }
    throw error;
  }
}

async function loginByWechatH5Endpoint(payload) {
  let lastError = null;

  for (const endpoint of H5_LOGIN_ENDPOINTS) {
    try {
      const response = await post(endpoint, payload);
      return persistAuthResponse(response);
    } catch (error) {
      if (error?.statusCode === 404) {
        lastError = error;
        continue;
      }

      throw error;
    }
  }

  if (lastError) {
    throw new Error('后端未部署 H5 微信授权登录接口，请补齐 /api/v1/auth/wechat/h5-login');
  }

  throw new Error('微信授权登录失败');
}

async function getWechatH5AuthorizeUrl(payload) {
  let lastError = null;
  const clientWechatOauthAppId =
    ENV.WECHAT.H5_OAUTH_APP_ID || process.env.TARO_APP_WECHAT_OAUTH_APP_ID || '';

  for (const endpoint of H5_AUTHORIZE_ENDPOINTS) {
    try {
      const query = new URLSearchParams(payload).toString();
      return get(`${endpoint}?${query}`);
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      const shouldFallbackToClientConfig = Boolean(clientWechatOauthAppId) && (
        error?.statusCode === 404
        || error?.statusCode >= 500
        || message.includes('appid')
        || message.includes('appsecret')
        || message.includes('未配置')
      );

      if (shouldFallbackToClientConfig) {
        lastError = error;
        continue;
      }

      throw error;
    }
  }

  if (lastError) {
    return null;
  }

  return null;
}

export function getWechatH5AuthParams() {
  return extractWechatOauthParamsFromUrl();
}

export function clearWechatH5AuthParams() {
  clearWechatOauthParamsFromUrl();
}

export async function startWechatH5Login(options = {}) {
  if (!isWechatH5LoginEnabled()) {
    throw new Error('微信登录暂未开放');
  }

  if (!isWechatBrowser()) {
    throw new Error('请在微信内打开当前页面后再使用微信授权登录');
  }

  const clientWechatOauthAppId =
    ENV.WECHAT.H5_OAUTH_APP_ID || process.env.TARO_APP_WECHAT_OAUTH_APP_ID || '';
  const state = createWechatOauthState();
  const redirectUri = buildWechatOauthRedirectUri();
  const backendAuthorize = await getWechatH5AuthorizeUrl({
    redirectUri,
    state,
    scope: ENV.WECHAT.H5_OAUTH_SCOPE,
  });
  const authorizeUrl = backendAuthorize?.authorizeUrl || (
    clientWechatOauthAppId
      ? buildWechatOauthAuthorizeUrl({
          appId: clientWechatOauthAppId,
          redirectUri,
          state,
        })
      : ''
  );

  if (!authorizeUrl) {
    throw new Error('未配置 H5 微信授权 AppID，请先补齐 TARO_APP_WECHAT_OAUTH_APP_ID');
  }

  if (!authorizeUrl) {
    throw new Error('鏈厤缃?H5 寰俊鎺堟潈 AppID锛岃鍏堣ˉ榻?TARO_APP_WECHAT_OAUTH_APP_ID');
  }

  const locationLike = options.location || (typeof window !== 'undefined' ? window.location : null);
  if (!locationLike || typeof locationLike.assign !== 'function') {
    throw new Error('当前环境不支持微信 OAuth 跳转');
  }

  if (!locationLike || typeof locationLike.assign !== 'function') {
    throw new Error('褰撳墠鐜涓嶆敮鎸佸井淇?OAuth 璺宠浆');
  }

  persistWechatOauthState(state);
  locationLike.assign(authorizeUrl);
}

export async function loginByWechatH5AuthCode(code, state) {
  if (!isWechatH5LoginEnabled()) {
    clearWechatOauthState();
    throw new Error('微信登录暂未开放');
  }

  if (!code) {
    throw new Error('微信授权缺少 code');
  }

  const savedState = readWechatOauthState();
  if (savedState && state && savedState !== state) {
    clearWechatOauthState();
    throw new Error('微信授权状态校验失败，请重新发起登录');
  }

  const redirectUri = buildWechatOauthRedirectUri();
  const authData = await loginByWechatH5Endpoint({
    code,
    state,
    redirectUri,
  });

  clearWechatOauthState();
  return authData;
}

export async function syncWechatProfile(userInfo) {
  if (!userInfo) {
    return Storage.getUser();
  }

  const profilePayload = {};
  const { nickname, avatarUrl } = extractWechatProfile(userInfo);

  if (nickname) {
    profilePayload.displayName = nickname;
  }

  if (avatarUrl) {
    profilePayload.avatarUrl = avatarUrl;
  }

  if (Object.keys(profilePayload).length === 0) {
    return Storage.getUser();
  }

  try {
    const updated = await updateProfile(profilePayload);
    const latestUser = updated || (await getMe().catch(() => null));
    if (latestUser) {
      const mergedLatestUser = mergeWechatProfile(latestUser, userInfo);
      Storage.setUser(mergedLatestUser);
      return mergedLatestUser;
    }
  } catch (error) {
    console.warn('Failed to sync WeChat profile:', error);
  }

  const mergedUser = mergeWechatProfile(
    {
      ...(Storage.getUser() || {}),
      ...(nickname ? { displayName: nickname, name: nickname } : {}),
      ...(avatarUrl ? { avatarUrl, avatar: avatarUrl } : {}),
    },
    userInfo
  );
  Storage.setUser(mergedUser);
  return mergedUser;
}

export async function register(data) {
  const payload = {
    username: data.username,
    email: data.email,
    password: data.password,
  };

  const response = await post('/api/v1/auth/register', payload);
  return persistAuthResponse(response);
}

export async function login(account, password) {
  const response = await post('/api/v1/auth/login', {
    account,
    password,
  });

  return persistAuthResponse(response);
}

export async function refreshTokenRequest(refreshToken) {
  const response = await post('/api/v1/auth/refresh', { refreshToken });

  Storage.setToken(response.accessToken);
  Storage.setRefreshToken(response.refreshToken);

  return response.accessToken;
}

export async function logout() {
  try {
    const token = Storage.getToken();
    if (token) {
      await post('/api/v1/auth/logout', {});
    }
  } catch (error) {
    console.error('Logout request failed:', error);
  } finally {
    Storage.removeToken();
    Storage.removeRefreshToken();
    Storage.removeUser();

    // #17 登出时清除所有残留的导航和创作状态
    try {
      const Taro = require('@tarojs/taro').default;
      Taro.removeStorageSync('gamevallies_post_login_redirect');
      Taro.removeStorageSync('gamevallies_create_entry_intent');
      Taro.removeStorageSync('gamevallies_iterate_entry_game');
      Taro.removeStorageSync('gamevallies_active_generation_task');
      Taro.removeStorageSync('gamevallies_create_draft_prompt');
      Taro.removeStorageSync('gamevallies_create_draft_name');
    } catch (_e) {
      // 忽略清除失败
    }
  }
}

export async function getMe() {
  return get('/api/v1/users/me');
}

export async function changePassword(currentPassword, newPassword) {
  await post('/api/v1/auth/change-password', {
    currentPassword,
    newPassword,
  });
}

export async function getUserProfile(userId) {
  return get(`/api/v1/users/${userId}`);
}

export async function updateProfile(data) {
  return patch('/api/v1/users/profile', data);
}

export async function uploadAvatar(filePath) {
  const response = await post('/api/v1/users/avatar', {
    filePath,
  });

  return response.url;
}

export default {
  register,
  login,
  loginByPhone,
  loginByWechatMiniapp,
  syncWechatProfile,
  registerByPhone,
  refreshTokenRequest,
  logout,
  getMe,
  sendSmsCode,
  changePassword,
  getUserProfile,
  updateProfile,
  uploadAvatar,
};
