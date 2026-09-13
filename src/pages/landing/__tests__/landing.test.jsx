/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';

const mockSwitchTab = jest.fn(() => Promise.resolve());
const mockNavigateTo = jest.fn(() => Promise.resolve());
const mockOpenCreate = jest.fn();
const mockGetLatest = jest.fn();
const mockGetFeatured = jest.fn();
const mockGetTrending = jest.fn();

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    switchTab: (...args) => mockSwitchTab(...args),
    navigateTo: (...args) => mockNavigateTo(...args),
  },
}));

jest.mock('../../../utils/authNavigation', () => ({
  HOME_PAGE_URL: '/pages/index/index',
  openCreatePageWithAuth: (...args) => mockOpenCreate(...args),
}));

jest.mock('../../../utils/runtime', () => ({
  isH5Runtime: () => true,
}));

jest.mock('../../../services/feed', () => ({
  getLatest: (...args) => mockGetLatest(...args),
  getFeaturedGames: (...args) => mockGetFeatured(...args),
  getTrending: (...args) => mockGetTrending(...args),
}));

jest.mock('../../../utils/media', () => ({
  getGameCoverUrl: () => '',
}));

jest.mock('../../../components/creative-web/coverLetterbox', () => ({
  CoverMatte: () => null,
}));

const LandingPage = require('../index').default;
const scss = readFileSync(join(__dirname, '../index.scss'), 'utf8');

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLatest.mockRejectedValue(new Error('no feed'));
  mockGetFeatured.mockRejectedValue(new Error('no feed'));
  mockGetTrending.mockRejectedValue(new Error('no feed'));
});

test('landing shows approved marketing copy and never AI 游戏工坊', async () => {
  render(<LandingPage />);
  expect(screen.getByRole('heading', { name: /把想法和科学/ })).toBeTruthy();
  expect(screen.getByText('小角度理想单摆演示')).toBeTruthy();
  expect(screen.getByText('这样探索科学')).toBeTruthy();
  expect(screen.getByText('可感知的规律')).toBeTruthy();
  expect(screen.getByText('灵感即刻成实验')).toBeTruthy();
  expect(screen.queryByText('AI 游戏工坊')).toBeNull();
  await waitFor(() => expect(mockGetLatest).toHaveBeenCalled());
});

test('unauth CTAs enter Creative Web home or create', async () => {
  render(<LandingPage />);
  fireEvent.click(screen.getAllByText('开启智了')[0]);
  expect(mockSwitchTab).toHaveBeenCalledWith({ url: '/pages/index/index' });
  fireEvent.click(screen.getAllByText('开始创作')[0]);
  expect(mockOpenCreate).toHaveBeenCalledWith({ mode: 'fresh' });
  fireEvent.submit(screen.getByLabelText('你的想法').closest('form'));
  expect(mockOpenCreate).toHaveBeenCalled();
});

test('landing chrome is solid cyan-tech: no frost or purple neon', () => {
  expect(scss).toMatch(/#060C20/);
  expect(scss).toMatch(/#004DC8/);
  expect(scss).toMatch(/#00CAE0/);
  expect(scss).not.toMatch(/backdrop-filter/i);
  expect(scss).not.toMatch(/#6e56ff/i);
  expect(scss).not.toMatch(/#c4f465/i);
});

test('showcase falls back to curated KEEP when public feed is empty', async () => {
  render(<LandingPage />);
  await screen.findByText('双摆轨迹如何分叉');
  fireEvent.click(screen.getByRole('tab', { name: '物理' }));
  expect(screen.getByText('小角度理想单摆演示')).toBeTruthy();
  expect(screen.queryByText('单位换算工作台')).toBeNull();
});

test('showcase uses published feed when the public API returns works', async () => {
  mockGetLatest.mockResolvedValue({
    items: [{ id: 'pub-1', title: '公开单摆', description: '物理实验', tags: ['物理'] }],
  });
  render(<LandingPage />);
  await screen.findByText('公开单摆');
  expect(screen.queryByText('单位换算工作台')).toBeNull();
});
