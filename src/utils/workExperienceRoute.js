import { useEffect } from 'react';
import Taro from '@tarojs/taro';
import {
  DESKTOP_VIEWPORT_MIN_WIDTH,
  getViewportWidth,
  isDesktopViewport as runtimeIsDesktopViewport,
  isH5WebBuild as runtimeIsH5WebBuild,
  isPcWebViewport as runtimeIsPcWebViewport,
} from './runtime';
import { buildGameDetailPath } from './share';
import {
  LANDSCAPE_PLAY_PAGE_PATH,
  PORTRAIT_PLAY_PAGE_PATH,
} from './gamePlayRoute';
import { isPlayableWorkId } from './workPlayability';

export { isPlayableWorkId };

function isH5WebBuild() {
  return typeof runtimeIsH5WebBuild === 'function'
    ? runtimeIsH5WebBuild()
    : process.env.TARO_ENV === 'h5';
}

function isDesktopViewport(width) {
  if (typeof runtimeIsDesktopViewport === 'function') {
    return runtimeIsDesktopViewport(width);
  }
  const measured = width == null
    ? (typeof getViewportWidth === 'function' ? getViewportWidth() : 0)
    : width;
  return Number(measured) >= DESKTOP_VIEWPORT_MIN_WIDTH;
}

function isPcWebViewport() {
  return typeof runtimeIsPcWebViewport === 'function'
    ? runtimeIsPcWebViewport()
    : isH5WebBuild() && isDesktopViewport();
}

export const WORK_EXPERIENCE_PAGE_PATH = '/pages/game/experience/index';
export const MOBILE_DETAIL_PAGE_PATH = '/pages/game/detail/index';
const PENDING_EXPERIENCE_KEY = 'gamevallies.pc-experience.work.v1';
const PENDING_EXPERIENCE_MAX_AGE_MS = 10 * 60 * 1000;

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

function buildPagePath(pagePath, params = {}) {
  const query = buildQueryString(params);
  return query ? `${pagePath}?${query}` : pagePath;
}

export function stripQuery(path = '') {
  return String(path || '').split('?')[0];
}

export function buildWorkExperiencePath(workId, extraQuery = {}) {
  return buildPagePath(WORK_EXPERIENCE_PAGE_PATH, {
    id: normalizeId(workId),
    ...extraQuery,
  });
}

export function isPcWorkExperiencePath(path = '') {
  return stripQuery(path) === WORK_EXPERIENCE_PAGE_PATH;
}

export function isMobileWorkShellPath(path = '') {
  const current = stripQuery(path);
  return current === MOBILE_DETAIL_PAGE_PATH
    || current === PORTRAIT_PLAY_PAGE_PATH
    || current === LANDSCAPE_PLAY_PAGE_PATH;
}

export function resolveWorkOpenPath(workId, extraQuery = {}) {
  const id = normalizeId(workId);
  if (!id) {
    return '';
  }
  return isPcWebViewport()
    ? buildWorkExperiencePath(id, extraQuery)
    : buildGameDetailPath(id, extraQuery);
}

let overlayHost = null;

export function registerWorkExperienceOverlayHost(openFn) {
  overlayHost = typeof openFn === 'function' ? openFn : null;
}

export function unregisterWorkExperienceOverlayHost() {
  overlayHost = null;
}

export function openWorkExperience(work, extraQuery = {}) {
  const id = normalizeId(work?.id ?? (typeof work === 'string' || typeof work === 'number' ? work : ''));
  if (!id) {
    return undefined;
  }
  const payload = work && typeof work === 'object' ? { ...work, id } : { id };
  const playable = isPlayableWorkId(id);
  if (!isPcWebViewport()) {
    if (!playable) {
      return undefined;
    }
    return settleNavigation(Taro.navigateTo({ url: buildGameDetailPath(id, extraQuery) }));
  }
  if (typeof overlayHost === 'function') {
    overlayHost(payload);
    return { overlay: true, work: payload, playable };
  }
  if (!playable) {
    return undefined;
  }
  rememberExperienceWork(payload);
  return settleNavigation(Taro.navigateTo({ url: buildWorkExperiencePath(id, extraQuery) }));
}

export function rememberExperienceWork(work) {
  const id = normalizeId(work?.id);
  if (!id || typeof sessionStorage === 'undefined') {
    return false;
  }
  try {
    sessionStorage.setItem(PENDING_EXPERIENCE_KEY, JSON.stringify({
      id,
      title: work.title || '',
      description: work.description || '',
      author: work.author || work.authorName || '',
      authorId: work.authorId || work.author?.id || '',
      allowFork: work.allowFork,
      createdAt: Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function consumePendingExperienceWork(workId) {
  const expected = normalizeId(workId);
  if (!expected || typeof sessionStorage === 'undefined') {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(PENDING_EXPERIENCE_KEY);
    sessionStorage.removeItem(PENDING_EXPERIENCE_KEY);
    const work = JSON.parse(raw || 'null');
    if (!work || normalizeId(work.id) !== expected) {
      return null;
    }
    if (Date.now() - Number(work.createdAt || 0) > PENDING_EXPERIENCE_MAX_AGE_MS) {
      return null;
    }
    return work;
  } catch {
    return null;
  }
}

export function parseH5HashRoute(hash = '') {
  const raw = String(hash || '').replace(/^#/, '');
  const [path, query = ''] = raw.split('?');
  const params = {};
  new URLSearchParams(query).forEach((value, key) => {
    params[key] = value;
  });
  return { path, params };
}

export function shouldBlockWorkShell(path = '') {
  if (!isH5WebBuild()) {
    return false;
  }
  if (isMobileWorkShellPath(path) && isDesktopViewport()) {
    return true;
  }
  if (isPcWorkExperiencePath(path) && !isDesktopViewport()) {
    return true;
  }
  return false;
}

function settleNavigation(result) {
  return Promise.resolve(result).catch(() => {});
}

function navigateToWorkShell(url) {
  return Taro.redirectTo({ url })
    .catch(() => Taro.reLaunch({ url }))
    .catch(() => {});
}

export function redirectWorkShellIfMismatched({ path, workId } = {}) {
  const id = normalizeId(workId);
  if (!isH5WebBuild() || !id) {
    return false;
  }
  const current = stripQuery(path);
  if (isDesktopViewport() && isMobileWorkShellPath(current)) {
    navigateToWorkShell(buildWorkExperiencePath(id));
    return true;
  }
  if (!isDesktopViewport() && isPcWorkExperiencePath(current)) {
    navigateToWorkShell(buildGameDetailPath(id));
    return true;
  }
  return false;
}

export function syncH5WorkShellRoute(hash = typeof window === 'undefined' ? '' : window.location.hash) {
  const { path, params } = parseH5HashRoute(hash);
  return redirectWorkShellIfMismatched({ path, workId: params.id });
}

export function useWorkShellGuard(path, workId) {
  useEffect(() => {
    redirectWorkShellIfMismatched({ path, workId });
  }, [path, workId]);
  return shouldBlockWorkShell(path);
}
