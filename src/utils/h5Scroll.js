import { isH5Runtime } from './runtime';

export function getH5PageScrollContainer() {
  if (!isH5Runtime() || typeof document === 'undefined') {
    return null;
  }

  const html = document.documentElement;
  const body = document.body;

  if (!body) {
    return document.scrollingElement || html || null;
  }

  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const bodyStyle = window.getComputedStyle(body);
    const bodyOverflowY = bodyStyle.overflowY || bodyStyle.overflow || '';
    const bodyCanScroll = /(auto|scroll)/.test(bodyOverflowY);
    const bodyHasOverflow = body.scrollHeight > body.clientHeight + 1;

    if (bodyCanScroll && bodyHasOverflow) {
      return body;
    }
  }

  return document.scrollingElement || html || body;
}

export function resetH5PageScrollTop() {
  if (!isH5Runtime() || typeof document === 'undefined') {
    return;
  }

  const scrollContainer = getH5PageScrollContainer();

  if (scrollContainer) {
    scrollContainer.scrollTop = 0;
  }

  if (document.body) {
    document.body.scrollTop = 0;
  }

  if (document.documentElement) {
    document.documentElement.scrollTop = 0;
  }

  if (typeof window !== 'undefined') {
    const userAgent = window.navigator?.userAgent || '';
    if (/jsdom/i.test(userAgent)) {
      return;
    }

    try {
      window.scrollTo(0, 0);
    } catch {
      // jsdom and a few embedded webviews expose scrollTo but do not implement it.
    }
  }
}
