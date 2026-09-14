export function normalizeOrigin(value) {
  if (!value) {
    return '';
  }

  const raw = String(value).trim();
  if (!raw) {
    return '';
  }

  try {
    const href = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(href);
    if (!parsed.hostname) {
      return '';
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

export function getPageOrigin(locationLike = typeof window !== 'undefined' ? window.location : null) {
  if (!locationLike?.protocol || !locationLike.host) {
    return '';
  }

  if (locationLike.protocol === 'file:') {
    return '';
  }

  return `${locationLike.protocol}//${locationLike.host}`;
}

export function isSamePublicSite(serviceOrigin, pageOrigin) {
  const service = normalizeOrigin(serviceOrigin);
  const page = normalizeOrigin(pageOrigin);
  if (!service || !page) {
    return false;
  }

  if (service === page) {
    return true;
  }

  try {
    const left = new URL(service);
    const right = new URL(page);
    if (left.protocol !== right.protocol) {
      return false;
    }

    const bareHost = (host) => String(host || '').replace(/^www\./i, '').toLowerCase();
    return bareHost(left.hostname) === bareHost(right.hostname);
  } catch {
    return false;
  }
}

export function preferRelativeBase(serviceUrl, pageOrigin = getPageOrigin()) {
  if (!serviceUrl) {
    return '';
  }

  if (isSamePublicSite(serviceUrl, pageOrigin)) {
    return '';
  }

  return String(serviceUrl).replace(/\/$/, '');
}
