/* eslint-env jest */
import React from 'react';
import { render, waitFor } from '@testing-library/react';

const mockShowToast = jest.fn();
const mockShowShareMenu = jest.fn(() => Promise.resolve());
const mockHideLoading = jest.fn();
const mockNavigateBack = jest.fn(() => Promise.resolve());
const mockSwitchTab = jest.fn(() => Promise.resolve());
const mockRedirectTo = jest.fn(() => Promise.resolve());
const mockReLaunch = jest.fn(() => Promise.resolve());
const mockGetCurrentPages = jest.fn(() => []);
const mockUseShareAppMessage = jest.fn();
const mockUseShareTimeline = jest.fn();
const mockGetGame = jest.fn();
const mockRecordShare = jest.fn();
const mockSetGameBookmarked = jest.fn();
const mockIsGameBookmarked = jest.fn(() => false);
const mockBuildGameWebShellUrl = jest.fn(() => 'https://shell.example/play');
const mockSetGameContext = jest.fn();

let mockShareAppMessageFactory = null;
let mockRouteParams = { id: 'game-1' };
let mockRoutePath = '/pages/game/play/index';
let mockGamePlayerState = {
  gameUrl: '',
  gameTitle: '',
  gameCover: '',
  gameOrientation: 'portrait',
  gameId: '',
  setGameContext: mockSetGameContext,
};

jest.mock('@tarojs/components', () => {
  const base = require('../../../test-utils/taroComponentsMock');
  return {
    ...base,
    WebView: ({ src }) => <div data-testid="game-webview" data-src={src} />,
  };
});

jest.mock('@tarojs/hooks', () => ({
  useRoute: jest.fn(() => ({
    params: mockRouteParams,
    path: mockRoutePath,
  })),
}));

jest.mock('@tarojs/taro', () => {
  const api = {
    showToast: mockShowToast,
    showShareMenu: mockShowShareMenu,
    hideLoading: mockHideLoading,
    navigateBack: mockNavigateBack,
    switchTab: mockSwitchTab,
    redirectTo: mockRedirectTo,
    reLaunch: mockReLaunch,
    getCurrentPages: mockGetCurrentPages,
  };

  return {
    __esModule: true,
    default: api,
    ...api,
    useDidShow: jest.fn(),
    useShareAppMessage: jest.fn((factory) => {
      mockShareAppMessageFactory = factory;
      mockUseShareAppMessage(factory);
    }),
    useShareTimeline: jest.fn((factory) => {
      mockUseShareTimeline(factory);
    }),
  };
});

jest.mock('../../../services/game', () => ({
  getGame: (...args) => mockGetGame(...args),
}));

jest.mock('../../../services/social', () => ({
  recordShare: (...args) => mockRecordShare(...args),
}));

jest.mock('../../../stores/gamePlayer', () => ({
  __esModule: true,
  default: jest.fn((selector) => selector(mockGamePlayerState)),
  resolveGameUrl: jest.fn((url) => url),
}));

jest.mock('../../../utils/bookmarks', () => ({
  isGameBookmarked: (...args) => mockIsGameBookmarked(...args),
  setGameBookmarked: (...args) => mockSetGameBookmarked(...args),
}));

jest.mock('../../../utils/gameWebShell', () => ({
  buildGameWebShellUrl: (...args) => mockBuildGameWebShellUrl(...args),
}));

jest.mock('../../../utils/storage', () => ({
  Storage: {
    getToken: jest.fn(() => 'token'),
    getRefreshToken: jest.fn(() => 'refresh'),
  },
}));

const GamePlay = require('../play/index').default;

describe('play page share navigation safeguards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShareAppMessageFactory = null;
    mockRouteParams = { id: 'game-1' };
    mockRoutePath = '/pages/game/play/index';
    mockGamePlayerState = {
      gameUrl: '',
      gameTitle: '',
      gameCover: '',
      gameOrientation: 'portrait',
      gameId: '',
      setGameContext: mockSetGameContext,
    };
    mockGetCurrentPages.mockReturnValue([]);
    mockGetGame.mockImplementation(() => new Promise(() => {}));
    process.env.TARO_ENV = 'weapp';
  });

  test('share metadata from play page points to detail page', async () => {
    mockGamePlayerState = {
      gameUrl: 'https://game.example/play',
      gameTitle: 'Shared Game',
      gameCover: 'https://img.example/cover.png',
      gameOrientation: 'portrait',
      gameId: 'game-1',
      setGameContext: mockSetGameContext,
    };

    render(<GamePlay />);

    expect(typeof mockShareAppMessageFactory).toBe('function');

    const sharePayload = mockShareAppMessageFactory();
    expect(sharePayload.path).toBe('/pages/game/detail/index?id=game-1');
  });

  test('direct shared entry into play page redirects to game detail', async () => {
    mockGetCurrentPages.mockReturnValue([{ route: 'pages/game/play/index' }]);

    render(<GamePlay />);

    await waitFor(() => {
      expect(mockRedirectTo).toHaveBeenCalledWith({
        url: '/pages/game/detail/index?id=game-1',
      });
    });
  });

  test('landscape play page forwards orientation to the game shell', async () => {
    mockRoutePath = '/pages/game/play-landscape/index';
    mockGamePlayerState = {
      gameUrl: 'https://game.example/play',
      gameTitle: 'Landscape Game',
      gameCover: 'https://img.example/cover.png',
      gameOrientation: 'landscape',
      gameId: 'game-1',
      setGameContext: mockSetGameContext,
    };

    render(<GamePlay />);

    await waitFor(() => {
      expect(mockBuildGameWebShellUrl).toHaveBeenCalledWith(expect.objectContaining({
        orientation: 'landscape',
      }));
    });
  });
});
