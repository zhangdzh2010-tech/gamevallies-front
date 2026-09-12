import { isH5Runtime } from './runtime';

const VALID_GAME_ORIENTATIONS = new Set(['portrait', 'landscape']);

// Creative Web / PC create is landscape-first. Weapp native create stays
// portrait. Playback of existing games still uses the portrait fallback below.
export function getDefaultCreateOrientation() {
  return isH5Runtime() ? 'landscape' : 'portrait';
}

export function normalizeGameOrientation(value, fallback = 'portrait') {
  const normalizedFallback = VALID_GAME_ORIENTATIONS.has(String(fallback || '').trim().toLowerCase())
    ? String(fallback).trim().toLowerCase()
    : 'portrait';
  const normalizedValue = typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';

  return VALID_GAME_ORIENTATIONS.has(normalizedValue)
    ? normalizedValue
    : normalizedFallback;
}

export function getGameOrientation(source, fallback = 'portrait') {
  if (typeof source === 'string') {
    return normalizeGameOrientation(source, fallback);
  }

  if (!source || typeof source !== 'object') {
    return normalizeGameOrientation('', fallback);
  }

  return normalizeGameOrientation(
    source.orientation
      || source.gameOrientation
      || source.screenOrientation
      || source.displayOrientation
      || source.layoutOrientation,
    fallback,
  );
}

export function isLandscapeOrientation(source) {
  return getGameOrientation(source) === 'landscape';
}

export default normalizeGameOrientation;
