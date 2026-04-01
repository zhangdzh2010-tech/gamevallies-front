/* eslint-env jest */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';

const mockNavigateBack = jest.fn(() => Promise.resolve());
const mockSwitchTab = jest.fn(() => Promise.resolve());
const mockRedirectTo = jest.fn(() => Promise.resolve());
const mockReLaunch = jest.fn(() => Promise.resolve());
const mockShowShareMenu = jest.fn(() => Promise.resolve());
const mockShowToast = jest.fn();
const mockGetCurrentPages = jest.fn(() => []);
const mockGetMenuButtonBoundingClientRect = jest.fn(() => null);
const mockGetGame = jest.fn();
const mockGetComments = jest.fn();
const mockRecordShare = jest.fn();
const mockCheckFollowStatus = jest.fn(() => Promise.resolve(false));
const mockOpenGame = jest.fn();

let mockRouteParams = { id: 'game-1' };

jest.mock('@tarojs/components', () => require('../../../test-utils/taroComponentsMock'));

jest.mock('@tarojs/hooks', () => ({
  useRoute: jest.fn(() => ({
    params: mockRouteParams,
    path: '/pages/game/detail/index',
  })),
}));

jest.mock('@tarojs/taro', () => {
  const api = {
    navigateBack: mockNavigateBack,
    switchTab: mockSwitchTab,
    redirectTo: mockRedirectTo,
    reLaunch: mockReLaunch,
    showShareMenu: mockShowShareMenu,
    showToast: mockShowToast,
    getCurrentPages: mockGetCurrentPages,
    getMenuButtonBoundingClientRect: mockGetMenuButtonBoundingClientRect,
  };

  return {
    __esModule: true,
    default: api,
    ...api,
    useShareAppMessage: jest.fn(),
    useShareTimeline: jest.fn(),
  };
});

jest.mock('../../../services/game', () => ({
  getGame: (...args) => mockGetGame(...args),
}));

jest.mock('../../../services/social', () => ({
  getComments: (...args) => mockGetComments(...args),
  recordShare: (...args) => mockRecordShare(...args),
  checkFollowStatus: (...args) => mockCheckFollowStatus(...args),
}));

jest.mock('../../../components/common/GamePlayer', () => ({
  GlobalGamePlayer: () => null,
}));

jest.mock('../../../components/common/PaywallPopup', () => ({
  PaywallPopup: () => null,
}));

jest.mock('../../../components/common/SharePanel', () => ({
  SharePanel: () => null,
}));

jest.mock('../../../stores/gamePlayer', () => jest.fn((selector) => selector({
  openGame: mockOpenGame,
})));

jest.mock('../../../stores/quotaStore', () => {
  const store = jest.fn(() => null);
  store.getState = jest.fn(() => ({ openPaywall: jest.fn() }));
  return {
    __esModule: true,
    default: store,
  };
});

jest.mock('../../../store/gameStore', () => ({
  useGameStore: jest.fn((selector) => selector({
    currentGame: null,
  })),
}));

jest.mock('../../../utils/bookmarks', () => ({
  isGameBookmarked: jest.fn(() => false),
  setGameBookmarked: jest.fn(),
}));

jest.mock('../../../utils/gameUnlock', () => ({
  subscribeGameUnlocked: jest.fn(() => jest.fn()),
}));

jest.mock('../../../utils/media', () => ({
  getGameCoverUrl: jest.fn(() => 'https://img.example/cover.png'),
}));

jest.mock('../../../utils/storage', () => ({
  Storage: {
    getUser: jest.fn(() => null),
    getToken: jest.fn(() => ''),
  },
}));

jest.mock('../../../utils/systemInfo', () => ({
  getSafeSystemInfo: jest.fn(() => ({
    windowHeight: 750,
    safeArea: { bottom: 750 },
    statusBarHeight: 20,
  })),
}));

jest.mock('../../../utils/share', () => ({
  buildGameDetailPath: jest.fn((id, params = {}) => {
    const query = new URLSearchParams({ id, ...params }).toString();
    return `/pages/game/detail/index?${query}`;
  }),
  getShareConfig: jest.fn(() => ({
    title: 'Shared Game',
    path: '/pages/game/detail/index?id=game-1',
    query: 'id=game-1',
    imageUrl: 'https://img.example/cover.png',
  })),
}));

const GameDetail = require('../detail/index').default;

describe('game detail back navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = { id: 'game-1' };
    mockGetCurrentPages.mockReturnValue([]);
    mockGetGame.mockResolvedValue({
      id: 'game-1',
      title: '上班摸鱼',
      description: '分享进来的详情页',
      author: { id: 'author-1', username: 'system_admin', displayName: 'system_admin' },
      canPlay: true,
      likes: 0,
      plays: 0,
      forks: 0,
      comments: 0,
      tags: [],
    });
    mockGetComments.mockResolvedValue({ items: [], total: 0, hasMore: false });
  });

  test('falls back to home tab when detail page is opened directly from share', async () => {
    mockGetCurrentPages.mockReturnValue([{ route: 'pages/game/detail/index' }]);

    const { container, findByText } = render(<GameDetail />);
    await findByText('上班摸鱼');

    const backButton = container.querySelector('.back-btn');
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(mockSwitchTab).toHaveBeenCalledWith({ url: '/pages/index/index' });
    });
    expect(mockNavigateBack).not.toHaveBeenCalled();
  });

  test('uses navigateBack when there is a previous page in the stack', async () => {
    mockGetCurrentPages.mockReturnValue([
      { route: 'pages/index/index' },
      { route: 'pages/game/detail/index' },
    ]);

    const { container, findByText } = render(<GameDetail />);
    await findByText('上班摸鱼');

    const backButton = container.querySelector('.back-btn');
    fireEvent.click(backButton);

    await waitFor(() => {
      expect(mockNavigateBack).toHaveBeenCalledWith({ delta: 1 });
    });
    expect(mockSwitchTab).not.toHaveBeenCalled();
  });
});
