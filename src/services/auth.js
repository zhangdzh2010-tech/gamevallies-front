import { post, get, patch } from './api';
import { Storage } from '../utils/storage';

const MINIAPP_LOGIN_URL = '/api/v1/auth/wechat/miniapp-login';

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
