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
