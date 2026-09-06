import { ENV } from '../config/env';

export function normalizeAvatarSource(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (
    /^https?:\/\//i.test(trimmed) ||
    /^data:image\//i.test(trimmed) ||
    /^wxfile:\/\//i.test(trimmed) ||
    /^file:\/\//i.test(trimmed)
  ) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    return `${ENV.API_BASE_URL.replace(/\/$/, '')}${trimmed}`;
  }

  return '';
}

export function isSuspiciousProfileText(value) {
  if (typeof value !== 'string') {
    return true;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  if (normalizeAvatarSource(trimmed)) {
    return true;
  }

  if (/[\\/]/.test(trimmed) || /\.(png|jpe?g|gif|webp|svg)$/i.test(trimmed)) {
    return true;
  }

  if (trimmed.length > 24 && /^[a-f0-9_.-]+$/i.test(trimmed)) {
    return true;
  }

  // H.7.1 - 兜底裸 WeChat openid / unionid 前缀（如 wx_vw-sxsiex8 / wxopenid_xxx）
  // 只要以 wx_ / wxopenid_ / wxunionid_ / openid_ / unionid_ / oauth_ 开头，
  // 后接的全是 ASCII 字母数字下划线连字符点号，就视为系统占位昵称。
  if (/^(wx_|wxopenid_|wxunionid_|openid_|unionid_|oauth_)[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return true;
  }

  return false;
}

export function getSafeDisplayText(candidates, fallback) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();
    if (!trimmed || isSuspiciousProfileText(trimmed)) {
      continue;
    }

    return trimmed;
  }

  return fallback;
}

export function getAvatarFallback(value, name, fallback = '👤') {
  const avatarText = typeof value === 'string' ? value.trim() : '';

  if (avatarText && Array.from(avatarText).length <= 2 && !isSuspiciousProfileText(avatarText) && !/[/:.]/.test(avatarText)) {
    return avatarText;
  }

  const safeName = getSafeDisplayText([name], '');
  const firstChar = safeName ? Array.from(safeName)[0] : '';

  if (!firstChar) {
    return fallback;
  }

  return /^[a-z]$/i.test(firstChar) ? firstChar.toUpperCase() : firstChar;
}
