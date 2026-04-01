/**
 * Shim for @tarojs/hooks - provides navigation and route hooks
 * using Taro's built-in APIs.
 */
import Taro, { getCurrentInstance } from '@tarojs/taro';

export function useNavigation() {
  return {
    push: (config) => {
      const url = typeof config === 'string' ? config : config?.url;
      Taro.navigateTo({ url });
    },
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
    switchTab: (config) => {
      const url = typeof config === 'string' ? config : config?.url;
      Taro.switchTab({ url });
    },
    back: (delta = 1) => {
      Taro.navigateBack({ delta });
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
