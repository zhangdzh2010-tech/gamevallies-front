export const NETWORK_MESSAGE = '网络连接失败，请稍后重试';

function collectErrorText(error) {
  return [error?.message, error?.errMsg, error?.name]
    .filter(Boolean)
    .join(' ');
}

export function isNetworkError(error) {
  const rawMessage = collectErrorText(error).toLowerCase();
  if (!rawMessage) {
    return false;
  }

  const networkPatterns = [
    'failed to fetch',
    'fetch failed',
    'network_error',
    'network error',
    'request:fail',
    'timeout',
    'timed out',
    'aborterror',
    'econnrefused',
    'econnreset',
    'enotfound',
    'enetunreach',
    '网络',
    '超时',
  ];

  return networkPatterns.some((pattern) => rawMessage.includes(pattern));
}

export function formatUserErrorMessage(error, fallback = '请求失败，请稍后重试') {
  if (isNetworkError(error)) {
    return NETWORK_MESSAGE;
  }

  if (error?.message) {
    return error.message;
  }

  if (error?.errMsg) {
    return error.errMsg;
  }

  if (error?.code) {
    return `Error ${error.code}`;
  }

  return fallback;
}
