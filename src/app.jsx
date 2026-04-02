import './app.scss';
import { Fragment, useEffect } from 'react';
import Taro from '@tarojs/taro';
import { isH5Runtime } from './utils/runtime';
import { Storage } from './utils/storage';
import useQuotaStore from './stores/quotaStore';
import { LANDSCAPE_PLAY_PAGE_PATH, PORTRAIT_PLAY_PAGE_PATH } from './utils/gamePlayRoute';

const H5_FULLSCREEN_PAGE_PREFIXES = [
  PORTRAIT_PLAY_PAGE_PATH,
  LANDSCAPE_PLAY_PAGE_PATH,
  '/pages/game/web-shell/index',
];

function getCurrentH5PagePath() {
  if (typeof window === 'undefined') {
    return '';
  }

  const hash = window.location.hash || '';
  return hash.replace(/^#/, '').split('?')[0] || '';
}

function shouldUseNativePageFlow(pagePath) {
  if (!pagePath) {
    return true;
  }

  return !H5_FULLSCREEN_PAGE_PREFIXES.some((prefix) => pagePath.startsWith(prefix));
}

function syncH5PageShellClasses() {
  if (!isH5Runtime() || typeof document === 'undefined') {
    return;
  }

  const pagePath = getCurrentH5PagePath();
  const enableNativePageFlow = shouldUseNativePageFlow(pagePath);
  const html = document.documentElement;
  const body = document.body;
  const page = document.querySelector('.taro_page.taro_page_show') || document.querySelector('.taro_page');
  const root = page?.firstElementChild;
  const directScrollViews = root
    ? Array.from(root.children).filter((child) => child.tagName === 'TARO-SCROLL-VIEW-CORE' && child.getAttribute('scroll-y') === 'true')
    : [];

  html.classList.toggle('h5-page-flow', enableNativePageFlow);
  body.classList.toggle('h5-page-flow', enableNativePageFlow);

  if (
    enableNativePageFlow &&
    page?.classList.contains('h5-page-flow-shell') &&
    root?.classList.contains('h5-page-flow-root') &&
    directScrollViews.every((child) => child.classList.contains('h5-page-flow-scroll'))
  ) {
    return;
  }

  document.querySelectorAll('.h5-page-flow-shell').forEach((element) => {
    element.classList.remove('h5-page-flow-shell');
  });
  document.querySelectorAll('.h5-page-flow-root').forEach((element) => {
    element.classList.remove('h5-page-flow-root');
  });
  document.querySelectorAll('.h5-page-flow-scroll').forEach((element) => {
    element.classList.remove('h5-page-flow-scroll');
  });

  if (!enableNativePageFlow) {
    return;
  }

  const container = document.querySelector('.taro-tabbar__container');
  const panel = document.querySelector('.taro-tabbar__panel');

  [container, panel, page].forEach((element) => {
    element?.classList.add('h5-page-flow-shell');
  });

  if (root) {
    root.classList.add('h5-page-flow-root');

    directScrollViews.forEach((child) => {
      child.classList.add('h5-page-flow-scroll');
    });
  }
}

// 全局错误捕获，防止 fs 错误中断业务流程
if (typeof window !== 'undefined') {
  if (window.history && 'scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual';
  }

  const originalConsoleError = console.error;
  console.error = (...args) => {
    const errorMessage = args.join(' ');
    if (errorMessage.includes('not node js file system') || 
        errorMessage.includes('saaa_config.json') ||
        errorMessage.includes('node:fs')) {
      // 静默处理 fs 相关错误，避免中断业务逻辑
      console.warn('Ignored node fs error:', errorMessage);
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

// 捕获 Taro 事件错误
Taro.eventCenter.on('__error', (err) => {
  if (err.message && (
    err.message.includes('not node js file system') || 
    err.message.includes('saaa_config.json') ||
    err.message.includes('node:fs')
  )) {
    console.warn('Ignored fs error in Taro event:', err.message);
    return;
  }
});

function App({ children }) {
  // #15 启动时验证 token 有效性，避免过期 token 保持到首次请求
  useEffect(() => {
    const token = Storage.getToken();
    if (!token) {
      return;
    }

    // 轻量请求验证 token 是否有效，失败则静默清除
    const { get: apiGet } = require('./services/api');
    apiGet('/api/v1/users/me', { timeout: 5000 })
      .then((user) => {
        if (user) {
          Storage.setUser(user);
        }
      })
      .catch((error) => {
        // 仅在明确的 401 时清除 token，网络错误不处理
        if (error?.statusCode === 401) {
          Storage.removeToken();
          Storage.removeRefreshToken();
          Storage.removeUser();
        }
      });
  }, []);

  useEffect(() => {
    if (!isH5Runtime() || typeof window === 'undefined') {
      return undefined;
    }

    let rafId = 0;
    let timeoutIds = [];
    let observer = null;

    const runSync = () => {
      syncH5PageShellClasses();
    };

    const scheduleSync = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      timeoutIds.forEach((id) => window.clearTimeout(id));
      timeoutIds = [];

      rafId = window.requestAnimationFrame(runSync);
      [60, 180, 360, 720, 1200].forEach((delay) => {
        timeoutIds.push(window.setTimeout(runSync, delay));
      });
    };

    scheduleSync();
    window.addEventListener('hashchange', scheduleSync);
    if (typeof MutationObserver !== 'undefined' && document.body) {
      observer = new MutationObserver(() => {
        scheduleSync();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      window.removeEventListener('hashchange', scheduleSync);
      observer?.disconnect();
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      timeoutIds.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    if (!isH5Runtime() || typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    let disposed = false;
    const syncPendingPayment = () => {
      if (disposed) {
        return;
      }

      // #22 H5 支付回调：用户从支付页返回时自动恢复支付流程，非静默以便给用户反馈
      void useQuotaStore.getState().hydratePaymentAttempt()
        .then(() => useQuotaStore.getState().resumePendingPayment({ silent: false }))
        .catch((error) => {
          console.warn('resumePendingPayment failed:', error);
        });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncPendingPayment();
      }
    };

    syncPendingPayment();
    window.addEventListener('focus', syncPendingPayment);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      disposed = true;
      window.removeEventListener('focus', syncPendingPayment);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return <Fragment>{children}</Fragment>;
}

export default App;
