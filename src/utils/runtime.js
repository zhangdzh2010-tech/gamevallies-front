export function isH5Runtime() {
  return process.env.TARO_ENV === 'h5' || (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined'
  );
}

export function isWeappRuntime() {
  return process.env.TARO_ENV === 'weapp';
}

export function isWechatBrowserRuntime() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /micromessenger/i.test(navigator.userAgent || '');
}
