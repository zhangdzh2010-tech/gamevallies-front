/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CreativeHome from '../CreativeHome';
import { resetConversationHistoryCache } from '../ConversationLayout';
import { getMyGames } from '../../../services/game';
import {
  openCreatePageWithAuth,
  openIteratePageWithAuth,
  openTaskCreatePageWithAuth,
} from '../../../utils/authNavigation';

const mockNavigateTo = jest.fn();
const mockRedirectTo = jest.fn();
const mockSwitchTab = jest.fn();

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    navigateTo: (...args) => mockNavigateTo(...args),
    redirectTo: (...args) => mockRedirectTo(...args),
    switchTab: (...args) => mockSwitchTab(...args),
  },
  useDidShow: (cb) => require('react').useEffect(cb, []),
}));

jest.mock('../../../services/game', () => ({
  getMyGames: jest.fn(),
  getGenerationStatus: jest.fn(),
  publishGame: jest.fn(),
}));

jest.mock('../../../utils/authNavigation', () => ({
  isLoggedIn: () => true,
  openCreatePageWithAuth: jest.fn(),
  openIteratePageWithAuth: jest.fn(),
  openTaskCreatePageWithAuth: jest.fn(),
  openProfilePageWithTab: jest.fn(),
  prepareIterateStudio: (game, id, options = {}) => ({
    kind: 'iterate',
    mode: 'iterate',
    game,
    gameId: id || game?.id || '',
    taskId: options.taskId || '',
    title: game?.title || '',
  }),
  prepareCreateStudio: (options = {}) => ({
    kind: options.mode === 'task' ? 'create-task' : 'create',
    mode: options.mode === 'task' ? 'create-task' : 'create',
    taskId: options.taskId || '',
    gameId: options.gameId || '',
    title: '',
  }),
  prepareTaskCreateStudio: (taskId, gameId) => ({
    kind: 'create-task',
    mode: 'create-task',
    taskId,
    gameId: gameId || '',
    title: '',
  }),
  registerCreativeStudioHost: jest.fn(),
  unregisterCreativeStudioHost: jest.fn(),
}));

jest.mock('../../../utils/media', () => ({ getGameCoverUrl: () => '' }));
jest.mock('../../../store/gameStore', () => ({
  useGameStore: jest.fn(() => ({ isGenerating: false, trackedTasks: [] })),
  setPersistedGenerationTaskSnapshot: jest.fn(),
}));
jest.mock('../../../stores/quotaStore', () => {
  const state = {
    loading: false,
    freeQuota: 3,
    totalFreeQuota: 5,
    subscription: null,
    fetchQuota: jest.fn(() => Promise.resolve()),
  };
  const useQuotaStore = (selector) => (typeof selector === 'function' ? selector(state) : state);
  useQuotaStore.getState = () => state;
  return { __esModule: true, default: useQuotaStore };
});
jest.mock('../../../utils/storage', () => ({
  Storage: { getUser: () => ({ id: 'user-1', displayName: '创作者甲' }) },
}));
jest.mock('../CreativeSquare', () => () => <div>公开作品列表</div>);
jest.mock('../CreativeStudioPanel', () => ({ context }) => (
  <div data-testid="creative-studio-panel">{context?.title || context?.gameId || '页内创作台'}</div>
));
jest.mock('../WorkPreview', () => () => null);
jest.mock('../../common/BrandMark', () => ({
  BRAND_MARK_SRC: '',
  BrandMarkImg: () => <img alt="" />,
}));

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  resetConversationHistoryCache();
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
  getMyGames.mockResolvedValue({
    items: [
      { id: 'work-1', title: '双摆实验', status: 'ready' },
      { id: 'work-2', title: '生态瓶', status: 'ready' },
    ],
    total: 2,
  });
});

test('sidebar session clicks keep ConversationLayout mounted and never change the route', async () => {
  const hrefBefore = window.location.href;
  render(<CreativeHome />);
  await screen.findByText('双摆实验');
  const sidebarLoads = getMyGames.mock.calls.filter((call) => call[1] === 12).length;
  expect(sidebarLoads).toBe(1);

  fireEvent.click(screen.getByText('双摆实验'));
  expect((await screen.findByTestId('creative-studio-panel')).textContent).toContain('双摆实验');
  fireEvent.click(screen.getByText('生态瓶'));
  expect(screen.getByTestId('creative-studio-panel').textContent).toContain('生态瓶');

  expect(screen.getAllByText('双摆实验').length).toBeGreaterThan(0);
  expect(screen.getAllByText('生态瓶').length).toBeGreaterThan(0);
  expect(screen.getByText('创作会话')).toBeTruthy();
  expect(getMyGames.mock.calls.filter((call) => call[1] === 12)).toHaveLength(1);
  expect(openIteratePageWithAuth).not.toHaveBeenCalled();
  expect(openTaskCreatePageWithAuth).not.toHaveBeenCalled();
  expect(openCreatePageWithAuth).not.toHaveBeenCalled();
  expect(mockNavigateTo).not.toHaveBeenCalled();
  expect(mockRedirectTo).not.toHaveBeenCalled();
  expect(mockSwitchTab).not.toHaveBeenCalled();
  expect(window.location.href).toBe(hrefBefore);
});
