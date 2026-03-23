import { ENV } from '../config/env';

export const GAME_WEB_SHELL_PATH = '/pages/game/web-shell/index';

function normalizeString(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function safeDecode(value) {
  const input = normalizeString(value);

  if (!input) {
    return '';
  }

  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function appendParam(searchParams, key, value) {
  const normalized = normalizeString(value);

  if (!normalized) {
    return;
  }

  searchParams.set(key, normalized);
}

export function buildGameWebShellHash(params = {}, options = {}) {
  const includeAuth = options.includeAuth !== false;
  const searchParams = new URLSearchParams();

  appendParam(searchParams, 'id', params.gameId || params.id);
  appendParam(searchParams, 'src', params.gameUrl || params.src);
  appendParam(searchParams, 'title', params.title);
  appendParam(searchParams, 'cover', params.coverUrl || params.cover);

  if (params.bookmarked === true || normalizeString(params.bookmarked) === '1') {
    searchParams.set('bookmarked', '1');
  }

  if (includeAuth) {
    appendParam(searchParams, 'token', params.accessToken || params.token);
    appendParam(searchParams, 'refreshToken', params.refreshToken);
  }

  const query = searchParams.toString();
  return query ? `#${GAME_WEB_SHELL_PATH}?${query}` : `#${GAME_WEB_SHELL_PATH}`;
}

export function buildGameWebShellUrl(params = {}) {
  const baseUrl = normalizeString(ENV.GAME_SHELL_URL);

  if (!baseUrl) {
    return '';
  }

  try {
    const url = new URL(baseUrl);
    url.hash = buildGameWebShellHash(params).slice(1);
    return url.toString();
  } catch (error) {
    console.error('Failed to build game web shell URL:', error);
    return '';
  }
}

export function parseGameWebShellParams(params = {}) {
  const parsed = {
    gameId: normalizeString(params.id || params.gameId),
    gameUrl: safeDecode(params.src || params.gameUrl),
    title: safeDecode(params.title),
    coverUrl: safeDecode(params.cover || params.coverUrl),
    accessToken: safeDecode(params.token || params.accessToken),
    refreshToken: safeDecode(params.refreshToken),
    bookmarked: normalizeString(params.bookmarked) === '1',
  };

  return parsed;
}
