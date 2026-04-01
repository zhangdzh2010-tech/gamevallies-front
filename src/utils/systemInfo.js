import Taro from '@tarojs/taro';

const DEFAULT_SYSTEM_INFO = Object.freeze({
  windowHeight: 720,
  statusBarHeight: 0,
  safeArea: null,
});

export function getSafeSystemInfo() {
  if (typeof Taro.getSystemInfoSync !== 'function') {
    return { ...DEFAULT_SYSTEM_INFO };
  }

  try {
    const info = Taro.getSystemInfoSync() || {};
    return {
      ...DEFAULT_SYSTEM_INFO,
      ...info,
    };
  } catch (error) {
    console.warn('getSystemInfoSync unavailable:', error);
    return { ...DEFAULT_SYSTEM_INFO };
  }
}

export function getSafeStatusBarHeight() {
  return getSafeSystemInfo().statusBarHeight || 0;
}
