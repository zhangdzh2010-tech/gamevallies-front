import { ENV } from '../config/env';

const WECHAT_H5_STATE_KEY = 'gamevallies_wechat_h5_oauth_state';
const DEFAULT_LOGIN_PATH = '/pages/login/index';

function safeSessionStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage || null;
  } catch (_error) {
    return null;
  }
}

export function isWechatBrowser() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /micromessenger/i.test(navigator.userAgent || '');
}

export function createWechatOauthState() {
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(12);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function persistWechatOauthState(state) {
  const sessionStorage = safeSessionStorage();
  if (!sessionStorage || !state) {
    return;
  }

  sessionStorage.setItem(WECHAT_H5_STATE_KEY, state);
}

export function readWechatOauthState() {
  const sessionStorage = safeSessionStorage();
  return sessionStorage?.getItem(WECHAT_H5_STATE_KEY) || '';
}

export function clearWechatOauthState() {
  const sessionStorage = safeSessionStorage();
  sessionStorage?.removeItem(WECHAT_H5_STATE_KEY);
}

export function buildWechatOauthRedirectUri(loginPath = DEFAULT_LOGIN_PATH, locationLike = null) {
  const location = locationLike || (typeof window !== 'undefined' ? window.location : null);
  if (!location) {
    return '';
  }

  const origin = location.origin || '';
  const pathname = location.pathname || '/';
  return `${origin}${pathname}#${loginPath}`;
}

export function buildWechatOauthAuthorizeUrl({
  appId,
  redirectUri,
  state,
  scope = ENV.WECHAT.H5_OAUTH_SCOPE,
}) {
  if (!appId) {
    throw new Error('未配置 H5 微信授权 AppID');
  }

  if (!redirectUri) {
    throw new Error('微信授权回调地址为空');
  }

  if (!state) {
    throw new Error('微信授权状态参数为空');
  }

  const searchParams = new URLSearchParams({
    appid: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    state,
  });

  return `${ENV.WECHAT.H5_OAUTH_AUTHORIZE_URL}?${searchParams.toString()}#wechat_redirect`;
}

function getHashQueryParams(hash) {
  if (!hash || !hash.includes('?')) {
    return new URLSearchParams();
  }

  return new URLSearchParams(hash.slice(hash.indexOf('?') + 1));
}

export function extractWechatOauthParamsFromUrl(locationLike = null) {
  const location = locationLike || (typeof window !== 'undefined' ? window.location : null);
  if (!location) {
    return { code: '', state: '' };
  }

  const searchParams = new URLSearchParams(location.search || '');
  const hashParams = getHashQueryParams(location.hash || '');

  return {
    code: searchParams.get('code') || hashParams.get('code') || '',
    state: searchParams.get('state') || hashParams.get('state') || '',
  };
}

export function clearWechatOauthParamsFromUrl(options = {}) {
  const currentHref = options.href || (typeof window !== 'undefined' ? window.location.href : '');
  const replaceState = options.replaceState
    || (typeof window !== 'undefined' && window.history?.replaceState
      ? window.history.replaceState.bind(window.history)
      : null);
  const title = options.title || (typeof document !== 'undefined' ? document.title : '');

  if (!currentHref || !replaceState) {
    return '';
  }

  const url = new URL(currentHref);
  url.searchParams.delete('code');
  url.searchParams.delete('state');

  let nextHash = url.hash || '';
  if (nextHash.includes('?')) {
    const hashBody = nextHash.slice(1);
    const queryIndex = hashBody.indexOf('?');
    const hashPath = hashBody.slice(0, queryIndex);
    const hashParams = new URLSearchParams(hashBody.slice(queryIndex + 1));
    hashParams.delete('code');
    hashParams.delete('state');
    nextHash = `#${hashPath}${hashParams.toString() ? `?${hashParams.toString()}` : ''}`;
  }

  const nextUrl = `${url.pathname}${url.search}${nextHash}`;
  replaceState({}, title, nextUrl);
  return nextUrl;
}
