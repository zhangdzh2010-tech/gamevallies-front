import { create } from 'zustand';
import Taro from '@tarojs/taro';
import { ENV } from '../config/env';
import useQuotaStore from './quotaStore';

const PLAY_PAGE_PATH = '/pages/game/play/index';

function buildPlayPageUrl(gameId) {
  return gameId ? `${PLAY_PAGE_PATH}?id=${encodeURIComponent(String(gameId))}` : PLAY_PAGE_PATH;
}

// Backend may return gameUrl with localhost - replace with actual server host.
export function resolveGameUrl(url) {
  if (!url) return '';

  const gameBase = ENV.GAME_CONTENT_URL || ENV.SERVICE_URLS?.GAME || '';
  if (!gameBase) return url;

  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const target = new URL(gameBase);
      const resolvedUrl = url.replace(/https?:\/\/localhost(:\d+)?/, target.origin);
      const parsedUrl = new URL(resolvedUrl);

      if (!parsedUrl.pathname || parsedUrl.pathname === '/') {
        return '';
      }

      return parsedUrl.href;
    }

    const baseUrl = new URL(gameBase);
    const baseHref = baseUrl.href.endsWith('/') ? baseUrl.href.slice(0, -1) : baseUrl.href;
    const cleanUrl = url.startsWith('/') ? url.slice(1) : url;
    return `${baseHref}/${cleanUrl}`;
  } catch (error) {
    console.error('Failed to resolve game URL:', error);
    return url;
  }
}

const useGamePlayerStore = create((set) => ({
  gameUrl: '',
  gameTitle: '',
  gameCover: '',
  minimized: false,
  gameId: '',
  setGameContext: (payload = {}) =>
    set((state) => ({
      gameUrl: payload.gameUrl ?? state.gameUrl,
      gameTitle: payload.gameTitle ?? state.gameTitle,
      gameCover: payload.gameCover ?? state.gameCover,
      gameId: payload.gameId ?? state.gameId,
      minimized: payload.minimized ?? false,
    })),
  openGame: (url, title, cover, options) => {
    const opts = options || {};
    const canPlay = opts.canPlay !== false;
    const isOwnGame = opts.isOwnGame || false;
    const gameId = opts.gameId || '';

    if (isOwnGame && !canPlay) {
      Taro.showToast({ title: '订阅后可试玩', icon: 'none' });
      useQuotaStore.getState().openPaywall(gameId);
      return;
    }

    const resolved = resolveGameUrl(url);

    try {
      const parsedUrl = new URL(resolved);
      if (parsedUrl.protocol !== 'https:') {
        Taro.showToast({
          title: '游戏地址协议错误',
          icon: 'none',
        });
        return;
      }

      set({
        gameUrl: resolved,
        gameTitle: title || '游戏',
        gameCover: cover || '',
        gameId,
        minimized: false,
      });

      if (process.env.TARO_ENV === 'weapp') {
        Taro.navigateTo({ url: buildPlayPageUrl(gameId) }).catch(() => {});
      }
    } catch (error) {
      console.error('Invalid game URL:', error);
      Taro.showToast({
        title: '游戏地址格式错误',
        icon: 'none',
      });
    }
  },
  minimizeGame: () => set({ minimized: true }),
  restoreGame: () => {
    const state = useGamePlayerStore.getState();
    if (!state.gameUrl) return;

    set({ minimized: false });
    if (process.env.TARO_ENV === 'weapp') {
      Taro.navigateTo({ url: buildPlayPageUrl(state.gameId) }).catch(() => {});
    }
  },
  closeGame: () =>
    set({
      gameUrl: '',
      gameTitle: '',
      gameCover: '',
      gameId: '',
      minimized: false,
    }),
}));

export default useGamePlayerStore;
