/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockGetTrending = jest.fn();
const mockGetGamesByType = jest.fn();
const mockLikeGame = jest.fn();
const mockOpenCreatePageWithAuth = jest.fn();
const mockOpenGame = jest.fn();
const mockFetchQuota = jest.fn();
const mockPush = jest.fn();
const mockShowToast = jest.fn();
const mockStorageGetToken = jest.fn(() => null);

jest.mock('@tarojs/components', () => require('../../../test-utils/taroComponentsMock'));

jest.mock('@tarojs/taro', () => {
  const api = {
    showToast: mockShowToast,
  };

  return {
    __esModule: true,
    default: api,
    ...api,
    useDidShow: jest.fn(),
  };
});

jest.mock('@tarojs/hooks', () => ({
  useNavigation: jest.fn(() => ({
    push: mockPush,
    switchTab: jest.fn(),
  })),
}));

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

jest.mock('../../../components/common/GameCard', () => ({
  GameCard: ({ game, onPlay, onOpenDetail }) => (
    <div data-testid={`game-card-${game.id}`}>
      <span>{game.title}</span>
      <button type="button" onClick={() => onPlay(game)}>
        play-{game.id}
      </button>
      <button type="button" onClick={() => onOpenDetail(game)}>
        detail-{game.id}
      </button>
    </div>
  ),
}));

jest.mock('../../../utils/authNavigation', () => ({
  openCreatePageWithAuth: mockOpenCreatePageWithAuth,
}));

jest.mock('../../../services/feed', () => ({
  getTrending: mockGetTrending,
  getGamesByType: mockGetGamesByType,
}));

jest.mock('../../../services/social', () => ({
  likeGame: mockLikeGame,
}));

jest.mock('../../../stores/gamePlayer', () => ({
  __esModule: true,
  default: jest.fn((selector) => selector({ openGame: mockOpenGame })),
}));

jest.mock('../../../stores/quotaStore', () => ({
  __esModule: true,
  default: Object.assign(
    jest.fn(() => ({})),
    {
      getState: jest.fn(() => ({
        fetchQuota: mockFetchQuota,
      })),
    }
  ),
}));

jest.mock('../../../utils/storage', () => ({
  Storage: {
    getToken: mockStorageGetToken,
  },
}));

jest.mock('../../../utils/bookmarks', () => ({
  mergeBookmarkedFlags: jest.fn((items) => items),
  setGameBookmarked: jest.fn(),
}));

jest.mock('../../../utils/gameTypes', () => ({
  buildGameTypeTabs: jest.fn((options = [
    { key: 'casual', label: 'Casual' },
    { key: 'puzzle', label: 'Puzzle' },
  ]) => [
    { key: 'all', label: 'All' },
    ...options,
  ]),
  fetchGameTypeOptions: jest.fn(() => Promise.resolve([
    { key: 'casual', label: 'Casual' },
    { key: 'puzzle', label: 'Puzzle' },
  ])),
  normalizeGameTypeKey: jest.fn((value) => String(value || '').toLowerCase()),
}));

jest.mock('../../../utils/share', () => ({
  buildGameDetailPath: jest.fn((id, params = {}) => {
    const suffix = params.openComment ? '?openComment=1' : '';
    return `/pages/game/detail/index?id=${id}${suffix}`;
  }),
}));

jest.mock('../../../utils/profileDisplay', () => ({
  getSafeDisplayText: jest.fn((candidates, fallback) => candidates.find(Boolean) || fallback),
}));

const HomePage = require('../index').default;

function mockFeedGame(overrides = {}) {
  return {
    id: 'game-1',
    title: '飞船闪避',
    author: { displayName: '作者 A' },
    type: 'casual',
    playCount: 128,
    likeCount: 16,
    commentCount: 4,
    viewerHasLiked: false,
    viewerHasBookmarked: false,
    ...overrides,
  };
}

describe('Home page journey coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTrending.mockResolvedValue({
      items: [
        mockFeedGame({ id: 'game-1', title: '飞船闪避', gameUrl: 'https://game.example/1' }),
        mockFeedGame({ id: 'game-2', title: '像素拼图', type: 'puzzle', gameUrl: '' }),
      ],
      hasMore: false,
    });
    mockGetGamesByType.mockResolvedValue({
      items: [mockFeedGame({ id: 'game-3', title: '脑力迷宫', type: 'puzzle' })],
      hasMore: false,
    });
  });

  test('home loads feed, opens create entry, and routes play/detail actions correctly', async () => {
    const { container } = render(<HomePage />);

    await screen.findByTestId('game-card-game-1');
    expect(screen.getByTestId('game-card-game-2')).toBeTruthy();

    fireEvent.click(container.querySelector('.challenge-banner'));
    fireEvent.click(screen.getByText('play-game-1'));
    fireEvent.click(screen.getByText('detail-game-2'));

    expect(mockOpenCreatePageWithAuth).toHaveBeenCalledTimes(1);
    expect(mockOpenGame).toHaveBeenCalledWith(
      'https://game.example/1',
      '飞船闪避',
      '',
      expect.objectContaining({ gameId: 'game-1' })
    );
    expect(mockPush).toHaveBeenCalledWith({ url: '/pages/game/detail/index?id=game-2' });
  });

  test('switching game type reloads the feed with the selected tab', async () => {
    render(<HomePage />);

    await screen.findByTestId('game-card-game-1');
    fireEvent.click(screen.getByText('Puzzle'));

    await waitFor(() => {
      expect(mockGetGamesByType).toHaveBeenCalledWith('puzzle', 1, 10);
    });
    expect(await screen.findByTestId('game-card-game-3')).toBeTruthy();
  });

  test('feed loading failure surfaces retry guidance', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetTrending.mockRejectedValueOnce(new Error('network failed'));

    render(<HomePage />);

    await screen.findByText('加载失败');
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ icon: 'none' })
    );
    expect(screen.getByText('重试')).toBeTruthy();
    errorSpy.mockRestore();
  });
});
