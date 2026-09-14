export const DESKTOP_VIEWPORT_MIN_WIDTH = 768;

export function isH5Runtime() {
  return process.env.TARO_ENV === 'h5' || (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  );
}

export function isH5WebBuild() {
  return process.env.TARO_ENV === 'h5';
}

export function isWeappRuntime() {
  return process.env.TARO_ENV === 'weapp';
}

export function getViewportWidth() {
  if (typeof window === 'undefined') {
    return 0;
  }

  if (typeof window.innerWidth === 'number' && window.innerWidth > 0) {
    return window.innerWidth;
  }

  if (typeof window.screen?.width === 'number' && window.screen.width > 0) {
    return window.screen.width;
  }

  return 0;
}

export function isDesktopViewport(width = getViewportWidth()) {
  return Number(width) >= DESKTOP_VIEWPORT_MIN_WIDTH;
}

export function isPcWebViewport() {
  return isH5WebBuild() && isDesktopViewport();
}

export function isWechatBrowserRuntime() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /micromessenger/i.test(navigator.userAgent || '');
}
