/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockGetFollowingFeed = jest.fn();
const mockLikeGame = jest.fn();
const mockOpenGame = jest.fn();
const mockNavigateTo = jest.fn(() => Promise.resolve());
const mockSwitchTab = jest.fn(() => Promise.resolve());
const mockShowToast = jest.fn();
const mockIsLoggedIn = jest.fn(() => true);
const mockSetPostLoginRedirect = jest.fn();
const mockGameCard = jest.fn(({ game, showAuthorInInfo }) => (
  <div data-testid={`friend-game-${game.id}`} data-show-author={showAuthorInInfo ? 'yes' : 'no'}>
    <span>{game.title}</span>
    {showAuthorInInfo ? <span>{game.author}</span> : null}
  </div>
));

jest.mock('@tarojs/components', () => require('../../../test-utils/taroComponentsMock'));

jest.mock('@tarojs/taro', () => {
  const api = {
    navigateTo: mockNavigateTo,
    switchTab: mockSwitchTab,
    showToast: mockShowToast,
  };

  return {
    __esModule: true,
    default: api,
    ...api,
    useDidShow: jest.fn(),
  };
});

jest.mock('../../../components/common/AppTopBar', () => ({
  AppTopBar: () => <div>top-bar</div>,
}));

jest.mock('../../../components/common/CustomTabBar', () => ({
  CustomTabBar: () => <div>tab-bar</div>,
}));

jest.mock('../../../components/common/GamePlayer', () => ({
  GlobalGamePlayer: () => <div>global-player</div>,
}));

jest.mock('../../../components/common/FloatingPlayer', () => ({
  FloatingPlayer: () => <div>floating-player</div>,
}));

jest.mock('../../../components/common/PaywallPopup', () => ({
  PaywallPopup: () => <div>paywall</div>,
}));

jest.mock('../../../components/common/PageScrollContainer', () => ({
  PageScrollContainer: ({ children }) => <div>{children}</div>,
}));

jest.mock('../../../components/common/GameCard', () => ({
  GameCard: (props) => mockGameCard(props),
}));

jest.mock('../../../services/feed', () => ({
  getFollowingFeed: (...args) => mockGetFollowingFeed(...args),
}));

jest.mock('../../../services/social', () => ({
  likeGame: (...args) => mockLikeGame(...args),
}));

jest.mock('../../../stores/gamePlayer', () => ({
  __esModule: true,
  default: jest.fn((selector) => selector({ openGame: mockOpenGame })),
}));

jest.mock('../../../utils/authNavigation', () => ({
  LOGIN_PAGE_URL: '/pages/login/index',
  isLoggedIn: () => mockIsLoggedIn(),
  setPostLoginRedirect: (...args) => mockSetPostLoginRedirect(...args),
}));

jest.mock('../../../utils/bookmarks', () => ({
  mergeBookmarkedFlags: jest.fn((items) => items),
  setGameBookmarked: jest.fn(),
}));

jest.mock('../../../utils/media', () => ({
  getGameCoverUrl: jest.fn(() => ''),
}));

jest.mock('../../../utils/gameOrientation', () => ({
  getGameOrientation: jest.fn(() => 'portrait'),
}));

jest.mock('../../../utils/share', () => ({
  buildGameDetailPath: jest.fn((id) => `/pages/game/detail/index?id=${id}`),
}));

jest.mock('../../../utils/h5Scroll', () => ({
  getH5PageScrollContainer: jest.fn(() => null),
  resetH5PageScrollTop: jest.fn(),
}));

jest.mock('../../../utils/runtime', () => ({
  isH5Runtime: jest.fn(() => false),
  isWeappRuntime: jest.fn(() => false),
}));

const FriendsPage = require('../index').default;

function mockFeedGame(overrides = {}) {
  return {
    id: 'game-1',
    title: '朋友的新作品',
    playCount: 12,
    likeCount: 3,
    commentCount: 1,
    viewerHasLiked: false,
    viewerHasBookmarked: false,
    author: { displayName: '作者甲' },
    ...overrides,
  };
}

describe('Discover friends feed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLoggedIn.mockReturnValue(true);
    mockGetFollowingFeed.mockResolvedValue({
      items: [
        mockFeedGame({ id: 'game-1', title: '朋友的新作品', author: { displayName: '作者甲' } }),
        mockFeedGame({ id: 'game-2', title: '朋友的迭代作品', author: { displayName: '作者乙' } }),
      ],
      hasMore: false,
    });
  });

  test('loads followed friends games with a simple feed layout', async () => {
    render(<FriendsPage />);

    await waitFor(() => {
      expect(mockGetFollowingFeed).toHaveBeenCalledWith(1, 10);
    });

    expect(await screen.findByTestId('friend-game-game-1')).toBeTruthy();
    expect(screen.getByTestId('friend-game-game-2')).toBeTruthy();
    expect(screen.getByText('朋友作品')).toBeTruthy();
    expect(screen.queryByText('Friends Feed')).toBeNull();
    expect(screen.queryByText('朋友们最近在做这些作品')).toBeNull();
    expect(screen.getByText('作者甲')).toBeTruthy();
    expect(screen.getByText('作者乙')).toBeTruthy();
    expect(screen.getByTestId('friend-game-game-1').getAttribute('data-show-author')).toBe('yes');
  });

  test('shows login guide when the viewer is not logged in', async () => {
    mockIsLoggedIn.mockReturnValue(false);

    render(<FriendsPage />);

    expect(mockGetFollowingFeed).not.toHaveBeenCalled();
    expect(await screen.findByText('登录后查看朋友作品')).toBeTruthy();
    expect(screen.getByText('这里只展示你已关注创作者最近发布和更新的作品。')).toBeTruthy();

    fireEvent.click(screen.getByText('去登录'));

    expect(mockSetPostLoginRedirect).toHaveBeenCalledWith('/pages/discover/index');
    expect(mockNavigateTo).toHaveBeenCalledWith({ url: '/pages/login/index' });
  });
});
