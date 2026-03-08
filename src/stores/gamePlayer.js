import { create } from 'zustand';
import { ENV } from '../config/env';

// Backend may return gameUrl with localhost — replace with actual server host
export function resolveGameUrl(url) {
  if (!url) return '';
  const gameBase = ENV.GAME_CONTENT_URL || ENV.SERVICE_URLS?.GAME || '';
  if (!gameBase) return url;
  // Extract host from gameBase (e.g. http://172.16.30.179:3002)
  try {
    const target = new URL(gameBase);
    return url.replace(/https?:\/\/localhost(:\d+)?/, target.origin);
  } catch {
    return url;
  }
}

const useGamePlayerStore = create((set) => ({
  gameUrl: '',
  gameTitle: '',
  openGame: (url, title) => {
    const resolved = resolveGameUrl(url);
    set({ gameUrl: resolved, gameTitle: title || '游戏' });
    // WeChat WebView always fills the full page — use a dedicated play page
    if (process.env.TARO_ENV === 'weapp') {
      const Taro = require('@tarojs/taro').default;
      Taro.navigateTo({ url: '/pages/game/play/index' });
    }
  },
  closeGame: () => set({ gameUrl: '', gameTitle: '' }),
}));

export default useGamePlayerStore;
