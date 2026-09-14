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
const landingScss = readFileSync(join(__dirname, '../index.scss'), 'utf8');
const chromeTokens = readFileSync(join(__dirname, '../../../styles/chrome-tokens.scss'), 'utf8');
const appScss = readFileSync(join(__dirname, '../../../app.scss'), 'utf8');

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLatest.mockRejectedValue(new Error('no feed'));
  mockGetFeatured.mockRejectedValue(new Error('no feed'));
  mockGetTrending.mockRejectedValue(new Error('no feed'));
});

test('landing shows approved marketing copy and never AI 游戏工坊', async () => {
  render(<LandingPage />);
  expect(screen.getByText(/把想法和科学/)).toBeTruthy();
  expect(screen.getAllByText('小角度理想单摆演示').length).toBeGreaterThan(0);
  expect(screen.getByText('这样探索科学')).toBeTruthy();
  expect(screen.getByText('可感知的规律')).toBeTruthy();
  expect(screen.getByText('灵感即刻成实验')).toBeTruthy();
  expect(screen.queryByText('AI 游戏工坊')).toBeNull();
  await waitFor(() => expect(mockGetLatest).toHaveBeenCalled());
});

test('landing never shows a draft watermark or version chip', () => {
  const { container } = render(<LandingPage />);
  expect(container.querySelector('.zl-ver')).toBeNull();
  expect(screen.queryByText(/草箱/)).toBeNull();
  expect(screen.queryByText(/草稿/)).toBeNull();
  expect(screen.queryByText(/v2\.2/)).toBeNull();
  expect(landingScss).not.toMatch(/\.zl-ver\s*\{/);
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

test('landing chrome is the approved dark draft and ignores shared light tokens', () => {
  expect(landingScss).not.toMatch(/@import['"\s].*chrome-tokens/);
  expect(landingScss).toMatch(/--zl-bg:\s*#060C20/);
  expect(landingScss).toMatch(/--zl-surface:\s*#111318/);
  expect(landingScss).toMatch(/--zl-band:\s*#004DC8/);
  expect(landingScss).toMatch(/--zl-cta:\s*#00CAE0/);
  expect(landingScss).toMatch(/--zl-ice:\s*#EBF8FF/);
  expect(landingScss).not.toMatch(/#F7F8FA/);
  expect(landingScss).not.toMatch(/backdrop-filter/i);
  expect(landingScss).not.toMatch(/#6e56ff/i);
  expect(landingScss).not.toMatch(/#c4f465/i);
  expect(appScss).toMatch(/html\.zl-landing-route[\s\S]*background:\s*#060C20/);
  expect(chromeTokens).toMatch(/\$chrome-bg:\s*#F7F8FA/);
  expect(chromeTokens).not.toMatch(/\$chrome-bg:\s*#060C20/);
});

test('v2.2 static draft remains the approved dark structure and palette reference', () => {
  const draft = readFileSync(join(__dirname, '../../../../docs/landing/zhile-landing-draft-v2.html'), 'utf8');
  expect(draft).toMatch(/#060C20|#060c20/);
  expect(draft).toMatch(/#111318/);
  expect(draft).toMatch(/#004DC8/);
  expect(draft).toMatch(/#00CAE0/);
  expect(draft).toMatch(/探索方式/);
  expect(draft).toMatch(/这样探索科学/);
  expect(draft).toMatch(/即刻创作/);
  expect(draft).toMatch(/灵感即刻成实验/);
  expect(draft).toMatch(/精选作品/);
  expect(draft).toMatch(/物理 · 单摆/);
  expect(draft).not.toMatch(/backdrop-filter/i);
  expect(draft).not.toMatch(/AI 游戏工坊/);
  expect(landingScss).toMatch(/grid-template-columns:\s*1\.05fr \.95fr/);
  expect(landingScss).toMatch(/\.zl-hero h1 \{[\s\S]*margin: 12PX 0 0/);
});

test('showcase falls back to curated KEEP when public feed is empty', async () => {
  render(<LandingPage />);
  await screen.findByText('双摆轨迹如何分叉');
  fireEvent.click(screen.getAllByText('物理')[0]);
  expect(screen.getAllByText('小角度理想单摆演示').length).toBeGreaterThan(0);
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

test('showcase covers match the draft matte label, and API images still letterbox', async () => {
  render(<LandingPage />);
  await screen.findByText('物理 · 单摆');
  expect(screen.getByText('生物 · 光合')).toBeTruthy();
  expect(landingScss).toMatch(/\.zl-card__cover \{[\s\S]*aspect-ratio: 16\/10/);
  expect(landingScss).toMatch(/background: #0b1f1c/);
  expect(landingScss).toMatch(/place-items: center/);
  expect(landingScss).toMatch(/object-fit: contain/);
  expect(landingScss).toMatch(/\.zl-card h3 \{[\s\S]*font-size: 18PX/);
  expect(landingScss).toMatch(/\.zl-ico \{[\s\S]*border: 2PX solid #3d4d63/);
});
