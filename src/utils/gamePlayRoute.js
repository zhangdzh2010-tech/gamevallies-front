import { isLandscapeOrientation } from './gameOrientation';

export const PORTRAIT_PLAY_PAGE_PATH = '/pages/game/play/index';
export const LANDSCAPE_PLAY_PAGE_PATH = '/pages/game/play-landscape/index';

function normalizeId(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function buildQueryString(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function buildMiniProgramPath(pagePath, params = {}) {
  const query = buildQueryString(params);
  return query ? `${pagePath}?${query}` : pagePath;
}

export function getGamePlayPagePath(orientation = 'portrait') {
  return isLandscapeOrientation(orientation)
    ? LANDSCAPE_PLAY_PAGE_PATH
    : PORTRAIT_PLAY_PAGE_PATH;
}

export function isLandscapePlayPagePath(pagePath = '') {
  return String(pagePath || '').trim().startsWith(LANDSCAPE_PLAY_PAGE_PATH);
}

export function buildGamePlayPagePath(gameId, orientation = 'portrait', extraQuery = {}) {
  return buildMiniProgramPath(getGamePlayPagePath(orientation), {
    id: normalizeId(gameId),
    ...extraQuery,
  });
}

export default buildGamePlayPagePath;
