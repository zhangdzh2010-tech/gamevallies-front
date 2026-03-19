import { post, get, patch } from './api';
import { Storage } from '../utils/storage';

/**
 * 发送手机验证码
 * @param {string} phone - 11 位手机号
 * @param {'register'|'login'|'reset_password'} type
 */
export async function sendSmsCode(phone, type) {
  return post('/api/v1/auth/sms/send-code', { phone, type });
}

/**
 * 手机号注册
 */
export async function registerByPhone(phone, smsCode, nickname, password) {
  const response = await post('/api/v1/auth/sms/register', { phone, smsCode, nickname, password });
  const accessToken = response.accessToken || response.token;
  Storage.setToken(accessToken);
  Storage.setRefreshToken(response.refreshToken);
  Storage.setUser(response.user);
  return { ...response, accessToken };
}

/**
 * 手机号验证码登录
 */
export async function loginByPhone(phone, smsCode) {
  const response = await post('/api/v1/auth/sms/login', { phone, smsCode });
  const accessToken = response.accessToken || response.token;
  Storage.setToken(accessToken);
  Storage.setRefreshToken(response.refreshToken);
  Storage.setUser(response.user);
  return { ...response, accessToken };
}

/**
 * 微信小程序登录
 */
export async function loginByWechatMiniapp(code, nickname, avatarUrl) {
  const response = await post('/api/v1/auth/wechat/miniapp-login', {
    code,
    nickname,
    avatarUrl,
  });
  const accessToken = response.accessToken || response.token;
  Storage.setToken(accessToken);
  Storage.setRefreshToken(response.refreshToken);
  Storage.setUser(response.user);
  return { ...response, accessToken };
}

/**
 * Register new user
 */
export async function register(data) {
  const payload = {
    username: data.username,
    email: data.email,
    password: data.password,
  };

  const response = await post('/api/v1/auth/register', payload);
  Storage.setToken(response.accessToken);
  Storage.setRefreshToken(response.refreshToken);
  Storage.setUser(response.user);
  return response;
}

/**
 * Login with account and password
 */
export async function login(account, password) {
  const response = await post('/api/v1/auth/login', {
    account,
    password,
  });

  const accessToken = response.accessToken || response.token;
  Storage.setToken(accessToken);
  Storage.setRefreshToken(response.refreshToken);
  Storage.setUser(response.user);

  return { ...response, accessToken };
}

/**
 * Refresh token
 */
export async function refreshTokenRequest(refreshToken) {
  const response = await post(
    '/api/v1/auth/refresh',
    { refreshToken },
  );

  Storage.setToken(response.accessToken);
  Storage.setRefreshToken(response.refreshToken);

  return response.accessToken;
}

/**
 * Logout
 */
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
  }
}

/**
 * Get current user info
 */
export async function getMe() {
  return get('/api/v1/users/me');
}

/**
 * Send verification code (email or phone)
 */
export async function sendVerificationCode(target, type) {
  await post('/api/v1/auth/send-code', {
    target,
    type,
  });
}

/**
 * Verify code
 */
export async function verifyCode(target, code) {
  const result = await post('/api/v1/auth/verify-code', {
    target,
    code,
  });

  return result.valid;
}

/**
 * Reset password with verification code
 */
export async function resetPassword(target, code, newPassword) {
  await post('/api/v1/auth/reset-password', {
    target,
    code,
    newPassword,
  });
}

/**
 * Change password (requires current password)
 */
export async function changePassword(currentPassword, newPassword) {
  await post('/api/v1/auth/change-password', {
    currentPassword,
    newPassword,
  });
}

/**
 * Get user profile
 */
export async function getUserProfile(userId) {
  return get(`/api/v1/users/${userId}`);
}

/**
 * Update user profile
 */
export async function updateProfile(data) {
  return patch('/api/v1/users/profile', data);
}

/**
 * Upload avatar
 * TODO: Implement multipart form data upload when backend endpoint is ready
 */
export async function uploadAvatar(filePath) {
  const response = await post('/api/v1/users/avatar', {
    filePath,
  });

  return response.url;
}

export default {
  register,
  login,
  loginByWechatMiniapp,
  refreshTokenRequest,
  logout,
  getMe,
  sendVerificationCode,
  verifyCode,
  resetPassword,
  changePassword,
  getUserProfile,
  updateProfile,
  uploadAvatar,
};
