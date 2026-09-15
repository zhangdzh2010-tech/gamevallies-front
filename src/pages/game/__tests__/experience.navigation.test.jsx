/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockRedirectTo = jest.fn(() => Promise.resolve());
const mockReLaunch = jest.fn(() => Promise.resolve());
const mockGetGame = jest.fn();
const mockOpenFork = jest.fn();
const mockOpenIterate = jest.fn();
const mockNavigateBackOrHome = jest.fn();

let mockRouteParams = { id: 'public-work' };
let mockRoutePath = '/pages/game/experience/index';

jest.mock('@tarojs/hooks', () => ({
  useRoute: jest.fn(() => ({
    params: mockRouteParams,
    path: mockRoutePath,
  })),
}));

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    redirectTo: (...args) => mockRedirectTo(...args),
    reLaunch: (...args) => mockReLaunch(...args),
  },
}));

jest.mock('../../../services/game', () => ({
  getGame: (...args) => mockGetGame(...args),
}));

jest.mock('../../../utils/authNavigation', () => ({
  HOME_PAGE_URL: '/pages/index/index',
  openForkPageWithAuth: (...args) => mockOpenFork(...args),
  openIteratePageWithAuth: (...args) => mockOpenIterate(...args),
}));

jest.mock('../../../utils/navigation', () => ({
  navigateBackOrHome: (...args) => mockNavigateBackOrHome(...args),
}));

jest.mock('../../../utils/storage', () => ({
  Storage: { getUser: jest.fn(() => null) },
}));

const WorkExperiencePage = require('../experience/index').default;
const { Storage } = require('../../../utils/storage');

describe('PC work experience page', () => {
  const previousEnv = process.env.TARO_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TARO_ENV = 'h5';
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
    mockRouteParams = { id: 'public-work' };
    mockRoutePath = '/pages/game/experience/index';
    HTMLDialogElement.prototype.showModal = jest.fn();
    HTMLDialogElement.prototype.close = jest.fn();
    Storage.getUser.mockReturnValue(null);
    mockGetGame.mockResolvedValue({
      id: 'public-work',
      title: '种群模型',
      description: '调节繁殖率',
      author: { displayName: '林栖', id: 'author' },
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => '<html>public work</html>',
    });
  });

  afterEach(() => {
    process.env.TARO_ENV = previousEnv;
  });

  test('desktop H5 plays the public work in the Creative Web sandbox', async () => {
    render(<WorkExperiencePage />);
    expect((await screen.findAllByText('种群模型')).length).toBeGreaterThan(0);
    expect(screen.getByText('林栖')).toBeTruthy();
    const frame = await screen.findByTitle('种群模型');
    expect(global.fetch).toHaveBeenCalledWith('/games/public-work/index.html', {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    expect(frame.getAttribute('srcdoc')).toContain('public work');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(mockRedirectTo).not.toHaveBeenCalled();
  });

  test('remixing somebody else opens fork, while own works open iteration', async () => {
    const { rerender } = render(<WorkExperiencePage />);
    fireEvent.click(await screen.findByText('复刻并创作'));
    expect(mockOpenFork).toHaveBeenCalledWith('public-work');
    Storage.getUser.mockReturnValue({ id: 'author' });
    rerender(<WorkExperiencePage />);
    fireEvent.click(await screen.findByText('继续创作'));
    expect(mockOpenIterate).toHaveBeenCalled();
  });

  test('phone-width visits redirect to the mobile detail shell', async () => {
    window.innerWidth = 390;
    const { container } = render(<WorkExperiencePage />);
    await waitFor(() => {
      expect(mockRedirectTo).toHaveBeenCalledWith({
        url: '/pages/game/detail/index?id=public-work',
      });
    });
    expect(container.firstChild).toBeNull();
  });
});
