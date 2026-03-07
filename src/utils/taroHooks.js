/**
 * Shim for @tarojs/hooks - provides navigation and route hooks
 * using Taro's built-in APIs.
 */
import Taro, { getCurrentInstance } from '@tarojs/taro';

export function useNavigation() {
  return {
    navigate: (url, params) => {
      const query = params ?
      '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') :
      '';
      Taro.navigateTo({ url: url + query });
    },
    goBack: (delta = 1) => {
      Taro.navigateBack({ delta });
    },
    replace: (url, params) => {
      const query = params ?
      '?' + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') :
      '';
      Taro.redirectTo({ url: url + query });
    },
    navigateTo: (url) => {
      Taro.navigateTo({ url });
    },
    navigateBack: (delta = 1) => {
      Taro.navigateBack({ delta });
    }
  };
}

export function useRoute() {
  const instance = getCurrentInstance();
  const router = instance?.router;
  return {
    params: router?.params || {},
    path: router?.path || ''
  };
}