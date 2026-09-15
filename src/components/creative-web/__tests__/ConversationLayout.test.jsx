/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ConversationLayout from '../ConversationLayout';
import { getMyGames } from '../../../services/game';
import { openIteratePageWithAuth, openProfilePageWithTab } from '../../../utils/authNavigation';

jest.mock('@tarojs/taro', () => {
  const taro = { navigateTo: jest.fn(), switchTab: jest.fn() };
  return { __esModule: true, default: taro, useDidShow: jest.fn() };
});
jest.mock('../../../services/game', () => ({ getMyGames: jest.fn() }));
jest.mock('../../../utils/authNavigation', () => ({
  isLoggedIn: () => true,
  openCreatePageWithAuth: jest.fn(),
  openIteratePageWithAuth: jest.fn(),
  openTaskCreatePageWithAuth: jest.fn(),
  openProfilePageWithTab: jest.fn(),
}));
jest.mock('../../../utils/storage', () => ({
  Storage: { getUser: () => ({ id: 'user-1', displayName: '创作者甲' }) },
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
jest.mock('../CreativeShell', () => ({
  creativeNavigate: jest.fn(),
  CreativeIcon: () => <span />,
}));
jest.mock('../../common/BrandMark', () => ({ BrandMarkImg: () => <img alt="" /> }));

beforeEach(() => {
  jest.clearAllMocks();
  getMyGames.mockResolvedValue({ items: [{ id: 'work-1', title: '双摆实验', status: 'ready' }], total: 1 });
});

test('loads the session list once and keeps it when a record is opened', async () => {
  const onOpenWork = jest.fn();
  render(<ConversationLayout onOpenWork={onOpenWork} />);
  await screen.findByText('双摆实验');
  expect(getMyGames).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('双摆实验'));
  expect(onOpenWork).toHaveBeenCalledWith(expect.objectContaining({ id: 'work-1' }));
  expect(getMyGames).toHaveBeenCalledTimes(1);
  expect(openIteratePageWithAuth).not.toHaveBeenCalled();
});

test('manual refresh is the only way to reload the session list', async () => {
  render(<ConversationLayout />);
  await screen.findByText('双摆实验');
  fireEvent.click(screen.getByLabelText('刷新创作会话'));
  await waitFor(() => expect(getMyGames).toHaveBeenCalledTimes(2));
});

test('in-shell navigation stays in the current layout instead of switching tabs', async () => {
  const navigation = jest.fn();
  render(<ConversationLayout navigation={navigation} />);
  await screen.findByText('双摆实验');
  fireEvent.click(screen.getByText('创作空间'));
  fireEvent.click(screen.getByText('发现灵感'));
  fireEvent.click(screen.getByText('创意广场'));
  fireEvent.click(screen.getByText('我的作品'));
  fireEvent.click(screen.getByText('任务中心'));
  fireEvent.click(screen.getByText('创作者甲'));
  expect(navigation).toHaveBeenCalledWith('home');
  expect(navigation).toHaveBeenCalledWith('ideas');
  expect(navigation).toHaveBeenCalledWith('square');
  expect(navigation).toHaveBeenCalledWith('works');
  expect(navigation).toHaveBeenCalledWith('tasks');
  expect(openProfilePageWithTab).not.toHaveBeenCalled();
});

test('task center and account still open profile when the shell is not hosting navigation', async () => {
  render(<ConversationLayout />);
  await screen.findByText('双摆实验');
  fireEvent.click(screen.getByText('任务中心'));
  fireEvent.click(screen.getByText('创作者甲'));
  expect(openProfilePageWithTab).toHaveBeenCalledWith('tasks');
  expect(openProfilePageWithTab).toHaveBeenCalledWith('works');
});
