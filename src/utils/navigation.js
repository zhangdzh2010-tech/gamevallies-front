import Taro from '@tarojs/taro';

export const HOME_PAGE_URL = '/pages/index/index';

function fallbackToUrl(fallbackUrl = '') {
  if (fallbackUrl) {
    Taro.redirectTo({ url: fallbackUrl })
      .catch(() => Taro.reLaunch({ url: fallbackUrl }))
      .catch(() => Taro.switchTab({ url: HOME_PAGE_URL }))
      .catch(() => {});
    return;
  }

  Taro.switchTab({ url: HOME_PAGE_URL })
    .catch(() => Taro.reLaunch({ url: HOME_PAGE_URL }))
    .catch(() => {});
}

export function navigateBackOrHome(fallbackUrl = '', delta = 1) {
  const pages = typeof Taro.getCurrentPages === 'function' ? Taro.getCurrentPages() : [];

  if (Array.isArray(pages) && pages.length > delta) {
    Taro.navigateBack({ delta })
      .catch(() => fallbackToUrl(fallbackUrl));
    return;
  }

  fallbackToUrl(fallbackUrl);
}
