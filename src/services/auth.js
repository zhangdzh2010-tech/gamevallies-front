import { post, get, patch } from './api';

import { Storage } from '../utils/storage';

/**
 * Register new user
 */
export async function register(data) {
  const payload = {
    username: data.username,
    email: data.email,
    phone: data.phone,
    password: data.password,
    verificationCode: data.verificationCode
  };

  const response = await post('/api/v1/auth/register', payload);
  return response.user;
}

/**
 * Login with account and password
 */
export async function login(account, password) {
  const response = await post('/api/v1/auth/login', {
    account,
    password
  });

  // Save tokens and user
  Storage.setToken(response.token);
  Storage.setRefreshToken(response.refreshToken);
  Storage.setUser(response.user);

  return response;
}

/**
 * Refresh token
 */
export async function refreshTokenRequest(refreshToken) {
  const response = await post(
    '/api/v1/auth/refresh',
    { refreshToken }
  );

  // Update stored tokens
  Storage.setToken(response.token);
  Storage.setRefreshToken(response.refreshToken);

  return response.token;
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
    // Always clear local storage
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
    type
  });
}

/**
 * Verify code
 */
export async function verifyCode(target, code) {
  const result = await post('/api/v1/auth/verify-code', {
    target,
    code
  });

  return result.valid;
}

/**
 * Reset password with verification code
 */
export async function resetPassword(
target,
code,
newPassword)
{
  await post('/api/v1/auth/reset-password', {
    target,
    code,
    newPassword
  });
}

/**
 * Change password (requires current password)
 */
export async function changePassword(currentPassword, newPassword) {
  await post('/api/v1/auth/change-password', {
    currentPassword,
    newPassword
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
  // Note: This would typically use a different approach with multipart form data
  // For now, returning a placeholder
  const response = await post('/api/v1/users/avatar', {
    filePath
  });

  return response.url;
}

export default {
  register,
  login,
  refreshTokenRequest,
  logout,
  getMe,
  sendVerificationCode,
  verifyCode,
  resetPassword,
  changePassword,
  getUserProfile,
  updateProfile,
  uploadAvatar
};