/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CreativeHome from '../CreativeHome';
import { getMyGames } from '../../../services/game';
import { openTaskCreatePageWithAuth, openCreatePageWithAuth } from '../../../utils/authNavigation';
import { consumeCreativeDraft } from '../creativeModel';
import { useGameStore } from '../../../store/gameStore';
jest.mock('@tarojs/taro', () => ({ useDidShow: cb => require('react').useEffect(cb, []) }));
jest.mock('../../../services/game', () => ({ getMyGames: jest.fn() }));
jest.mock('../../../utils/authNavigation', () => ({ isLoggedIn: () => true, openCreatePageWithAuth: jest.fn(), openIteratePageWithAuth: jest.fn(), openTaskCreatePageWithAuth: jest.fn() }));
jest.mock('../../../utils/media', () => ({ getGameCoverUrl: () => '' }));
jest.mock('../../../store/gameStore', () => ({ useGameStore: jest.fn() }));
jest.mock('../../../stores/quotaStore', () => ({ __esModule: true, default: { getState: () => ({ fetchQuota: () => Promise.resolve() }) } }));
jest.mock('../CreativeShell', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div>, CreativeIcon: () => null }));
jest.mock('../ConversationLayout', () => ({ __esModule: true, default: ({ children }) => <div>{children}</div>, ConversationIcon: () => null }));
jest.mock('../WorkPreview', () => () => null);
beforeEach(() => {
  jest.clearAllMocks(); sessionStorage.clear();
  HTMLDialogElement.prototype.showModal = jest.fn(); HTMLDialogElement.prototype.close = jest.fn();
  useGameStore.mockReturnValue({ isGenerating: false });
  getMyGames.mockResolvedValue({ items: [], total: 0 });
});
test('loads actual works and preserves iterate task routing', async () => {
  useGameStore.mockReturnValue({ isGenerating: true, currentTask: { taskId: 'task-1', gameId: 'work-1', taskType: 'pipeline_iterate' } });
  getMyGames.mockResolvedValue({ items: [{ id: 'work-1', title: '真实双摆作品', status: 'ready' }], total: 1 });
  render(<CreativeHome />);
  await screen.findByText('查看进展');
  expect(getMyGames).toHaveBeenCalledWith(1, 24);
  fireEvent.click(screen.getByText('查看进展'));
  expect(openTaskCreatePageWithAuth).toHaveBeenCalledWith('task-1', 'work-1', 'pipeline_iterate');
});
test('carries the chosen scientific idea into the authenticated creation flow', async () => {
  render(<CreativeHome />);
  await screen.findByText('让一个想法，变得可以探索。');
  fireEvent.change(screen.getByLabelText('你的创意'), { target: { value: '观察不同初始角度的双摆运动' } });
  fireEvent.click(screen.getByTestId('workspace-primary'));
  expect(openCreatePageWithAuth).toHaveBeenCalledWith({ mode: 'fresh' });
  expect(consumeCreativeDraft().prompt).toContain('观察不同初始角度的双摆运动');
});
