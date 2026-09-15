/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    getStorageSync: jest.fn(() => ''),
  },
}));

jest.mock('../../../utils/authNavigation', () => ({
  HOME_PAGE_URL: '/pages/index/index',
  openCreatePageWithAuth: (...args) => mockOpenCreate(...args),
}));

jest.mock('../../../utils/runtime', () => {
  const actual = jest.requireActual('../../../utils/runtime');
  return {
    ...actual,
    isH5Runtime: () => true,
    isH5WebBuild: () => true,
  };
});

jest.mock('../../../services/feed', () => ({
  getLatest: (...args) => mockGetLatest(...args),
  getFeaturedGames: (...args) => mockGetFeatured(...args),
  getTrending: (...args) => mockGetTrending(...args),
}));

jest.mock('../../../utils/media', () => ({
  getGameCoverUrl: () => '',
}));

jest.mock('../../../components/creative-web/coverLetterbox', () => ({
  CoverMatte: ({ src, alt }) => (src ? <img src={src} alt={alt || ''} /> : null),
  PlayerLetterbox: ({ children, className }) => <div className={className}>{children}</div>,
}));

jest.mock('../../../services/game', () => ({
  getGame: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../../../components/creative-web/WorkSandbox', () => ({
  __esModule: true,
  default: ({ title }) => <iframe title={title || '交互作品'} sandbox="allow-scripts" />,
}));

const landingModule = require('../index');
const LandingPage = landingModule.default;
const { openShowcaseWork } = landingModule;
const landingScss = readFileSync(join(__dirname, '../index.scss'), 'utf8');
const landingJsx = readFileSync(join(__dirname, '../index.jsx'), 'utf8');
const chromeTokens = readFileSync(join(__dirname, '../../../styles/chrome-tokens.scss'), 'utf8');
const appScss = readFileSync(join(__dirname, '../../../app.scss'), 'utf8');

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TARO_ENV = 'h5';
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  mockGetLatest.mockRejectedValue(new Error('no feed'));
  mockGetFeatured.mockRejectedValue(new Error('no feed'));
  mockGetTrending.mockRejectedValue(new Error('no feed'));
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '<html>keep work</html>' });
});

test('landing brand lockup uses the square Z mark plus 智了空间', async () => {
  const { container } = render(<LandingPage />);
  const mark = container.querySelector('img.zl-mark');
  expect(mark).toBeTruthy();
  expect(mark.getAttribute('src')).toBeTruthy();
  expect(screen.getAllByText('智了空间').length).toBeGreaterThan(0);
  expect(landingJsx).not.toMatch(/<span className="zl-mark">智<\/span>/);
  expect(readFileSync(join(__dirname, '../../../index.html'), 'utf8')).toMatch(/rel="icon"/);
  expect(readFileSync(join(__dirname, '../../../index.html'), 'utf8')).toMatch(/apple-touch-icon/);
});

test('landing shows approved marketing copy and never AI 游戏工坊', async () => {
  render(<LandingPage />);
  expect(screen.getByText(/把想法和科学/)).toBeTruthy();
  expect(screen.getAllByText('小角度理想单摆演示').length).toBeGreaterThan(0);
  expect(screen.getByText('这样探索科学')).toBeTruthy();
  expect(screen.getByText('把科学变成可感知、可调节、可继续改的作品。')).toBeTruthy();
  expect(screen.queryByText('来自已公开发布的交互实验。')).toBeNull();
  expect(screen.queryByText(/高质验收批次的 KEEP/)).toBeNull();
  expect(screen.queryByText(/上线后接创意广场/)).toBeNull();
  expect(screen.queryByText(/不是一键生成小游戏工厂/)).toBeNull();
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
  expect(landingScss).toMatch(/--zl-bg:\s*#0B1B36/);
  expect(landingScss).toMatch(/--zl-surface:\s*#111318/);
  expect(landingScss).toMatch(/--zl-band:\s*#004DC8/);
  expect(landingScss).toMatch(/--zl-cta:\s*#00CAE0/);
  expect(landingScss).toMatch(/--zl-ice:\s*#EBF8FF/);
  expect(landingScss).not.toMatch(/#060C20/);
  expect(landingScss).not.toMatch(/#F7F8FA/);
  expect(landingScss).not.toMatch(/backdrop-filter/i);
  expect(landingScss).not.toMatch(/#6e56ff/i);
  expect(landingScss).not.toMatch(/#c4f465/i);
  expect(appScss).toMatch(/html\.zl-landing-route[\s\S]*background-color:\s*#0B1B36/);
  expect(chromeTokens).toMatch(/\$chrome-bg:\s*#F7F8FA/);
  expect(chromeTokens).not.toMatch(/\$chrome-bg:\s*#060C20/);
  expect(chromeTokens).not.toMatch(/\$chrome-bg:\s*#0B1B36/);
});

test('landing nav controls stay transparent so Taro/weui cannot paint white chips', () => {
  // Taro H5 rewrites bare `button` → `taro-button-core` in page SCSS and app.scss.
  // Native <button> only matches class selectors that survive the rewrite.
  expect(landingJsx).toMatch(/className="zl-nav__link"/);
  expect(landingJsx).toMatch(/className=\{filter === item\.id \? 'zl-filter is-active' : 'zl-filter'\}/);
  expect(landingScss).toMatch(/\.zl-nav__link \{[\s\S]*background:\s*transparent\s*!important/);
  expect(landingScss).toMatch(/\.zl-nav__link \{[\s\S]*appearance:\s*none/);
  expect(landingScss).toMatch(/\.zl-nav__link:hover \{[\s\S]*background:\s*transparent\s*!important/);
  expect(landingScss).toMatch(/\.zl-brand \{[\s\S]*color:\s*inherit/);
  expect(landingScss).toMatch(/\.zl-brand,[\s\S]*\.zl-nav__link \{[\s\S]*background:\s*transparent\s*!important/);
  expect(landingScss).toMatch(/\.zl-filter \{[\s\S]*appearance:\s*none/);
  expect(landingScss).toMatch(/\.zl-btn--cta,[\s\S]*background:\s*var\(--zl-cta\)\s*!important/);
  expect(appScss).toMatch(/html\.zl-landing-route \.zl-nav__link \{[\s\S]*appearance:\s*none/);
  expect(appScss).toMatch(/html\.zl-landing-route \.zl-brand,[\s\S]*background:\s*transparent\s*!important/);
  expect(landingScss).toMatch(/\.weui-btn/);
  expect(landingScss).toMatch(/taro-button-core/);
});

test('v2.2 static draft remains the approved dark structure and palette reference', () => {
  const draft = readFileSync(join(__dirname, '../../../../docs/landing/zhile-landing-draft-v2.html'), 'utf8');
  const config = readFileSync(join(__dirname, '../index.config.js'), 'utf8');
  const atmosphere = /radial-gradient\(ellipse 90% 58% at 50% -12%, rgba\(0, 77, 200, 0\.44\), transparent 62%\)/;
  expect(draft).toMatch(/#0B1B36|#0b1b36/);
  expect(draft).not.toMatch(/#060C20|#060c20/);
  expect(draft).toMatch(/#111318/);
  expect(draft).toMatch(/#004DC8/);
  expect(draft).toMatch(/#00CAE0/);
  expect(draft).toMatch(atmosphere);
  expect(landingScss).toMatch(atmosphere);
  expect(appScss).toMatch(atmosphere);
  expect(config).toMatch(/backgroundColor:\s*'#0B1B36'/);
  expect(draft).toMatch(/探索方式/);
  expect(draft).toMatch(/这样探索科学/);
  expect(draft).toMatch(/把科学变成可感知、可调节、可继续改的作品。/);
  expect(draft).not.toMatch(/不是一键生成小游戏工厂/);
  expect(draft).toMatch(/即刻创作/);
  expect(draft).toMatch(/灵感即刻成实验/);
  expect(draft).toMatch(/精选作品/);
  expect(draft).not.toMatch(/来自已公开发布的交互实验/);
  expect(draft).not.toMatch(/高质验收批次的 KEEP/);
  expect(draft).not.toMatch(/上线后接创意广场/);
  expect(draft).toMatch(/物理 · 单摆/);
  expect(draft).not.toMatch(/backdrop-filter/i);
  expect(draft).not.toMatch(/AI 游戏工坊/);
  expect(landingScss).toMatch(/grid-template-columns:\s*1\.05fr \.95fr/);
  expect(landingScss).toMatch(/\.zl-hero h1 \{[\s\S]*margin: 12PX 0 0/);
  expect(draft).toMatch(/class="photo"/);
  expect(draft).toMatch(/photo-blade/);
  expect(draft).toMatch(/photo-bubble/);
  expect(draft).not.toMatch(/产氧可视化（示意）/);
});

test('band card is a labeled photosynthesis schematic, not a text-only void', async () => {
  const { container } = render(<LandingPage />);
  expect(screen.queryByText('光合作 · 产氧可视化（示意）')).toBeNull();
  expect(screen.getByLabelText('查看光合作 · 产氧可视化')).toBeTruthy();
  expect(container.querySelector('.zl-band__card .zl-photo')).toBeTruthy();
  expect(container.querySelector('.zl-photo__blade')).toBeTruthy();
  expect(container.querySelectorAll('.zl-photo__bubble').length).toBe(3);
  expect(container.querySelector('.zl-photo__tag--o2')?.textContent).toBe('O₂');
  expect(landingJsx).not.toMatch(/产氧可视化（示意）/);
  expect(landingJsx).toMatch(/function PhotosynthesisMark/);
  expect(landingScss).toMatch(/border-radius:\s*120PX 120PX 12PX 12PX/);
  expect(landingScss).toMatch(/\.zl-photo__blade/);
  expect(landingScss).toMatch(/@keyframes zl-photo-rise/);
  const scrollIntoView = jest.fn();
  const getById = jest.spyOn(document, 'getElementById').mockImplementation((id) => (
    id === 'showcase' ? { scrollIntoView } : null
  ));
  fireEvent.click(screen.getByLabelText('查看光合作 · 产氧可视化'));
  expect(scrollIntoView).toHaveBeenCalled();
  getById.mockRestore();
  await waitFor(() => expect(mockGetLatest).toHaveBeenCalled());
});

test('band card letterboxes a published photosynthesis cover when present', async () => {
  mockGetLatest.mockResolvedValue({
    items: [{
      id: 'pub-photo',
      title: '光合产氧',
      description: '生物学',
      coverUrl: 'https://cdn.example.com/o2.png',
    }],
  });
  const { container } = render(<LandingPage />);
  await screen.findByText('光合产氧');
  expect(container.querySelector('.zl-band__card img[src="https://cdn.example.com/o2.png"]')).toBeTruthy();
  expect(container.querySelector('.zl-band__card .zl-photo')).toBeNull();
});

test('showcase heading has no developer-jargon lead', async () => {
  const { container } = render(<LandingPage />);
  const heading = container.querySelector('#showcase h2');
  expect(heading?.textContent).toBe('精选作品');
  expect(heading.nextElementSibling?.className).not.toMatch(/zl-section-lead/);
  expect(container.querySelector('#showcase .zl-section-lead')).toBeNull();
  expect(landingJsx).not.toMatch(/来自已公开发布的交互实验/);
  expect(landingJsx).not.toMatch(/高质验收批次的 KEEP/);
  expect(landingJsx).not.toMatch(/上线后接创意广场/);
  await waitFor(() => expect(mockGetLatest).toHaveBeenCalled());
});

test('showcase falls back to curated KEEP when public feed is empty', async () => {
  render(<LandingPage />);
  await screen.findByText('双摆轨迹如何分叉');
  fireEvent.click(screen.getAllByText('物理')[0]);
  expect(screen.getAllByText('小角度理想单摆演示').length).toBeGreaterThan(0);
  expect(screen.queryByText('单位换算工作台')).toBeNull();
});

test('showcase cards keep title and author only', async () => {
  render(<LandingPage />);
  await screen.findByText('双摆轨迹如何分叉');
  const card = screen.getByText('双摆轨迹如何分叉').closest('article');
  expect(card.className).toContain('zl-card');
  expect(within(card).queryByText(/两个几乎相同的初始角度/)).toBeNull();
  expect(within(card).getByText('智了')).toBeTruthy();
  expect(card.querySelector('.zl-card__avatar')).toBeTruthy();
});

test('showcase uses published feed when the public API returns works', async () => {
  mockGetLatest.mockResolvedValue({
    items: [{ id: 'pub-1', title: '公开单摆', description: '物理实验', tags: ['物理'], author: { displayName: '林栖' } }],
  });
  render(<LandingPage />);
  const heading = await screen.findByText('公开单摆');
  const card = heading.closest('article');
  expect(screen.queryByText('单位换算工作台')).toBeNull();
  expect(screen.queryByText('物理实验')).toBeNull();
  expect(screen.queryByText('来自已公开发布的交互实验。')).toBeNull();
  expect(card.textContent).toContain('林栖');
});

test('clicking a KEEP showcase card opens an empty-state overlay, not a blank player', async () => {
  render(<LandingPage />);
  const heading = await screen.findByText('双摆轨迹如何分叉');
  const hit = heading.closest('.zl-card__hit');
  expect(hit).toBeTruthy();
  expect(hit.getAttribute('type')).toBe('button');
  expect(hit.getAttribute('aria-label')).toBe('体验 双摆轨迹如何分叉');
  fireEvent.click(hit);
  expect(mockNavigateTo).not.toHaveBeenCalled();
  const modal = screen.getByRole('dialog', { hidden: true });
  expect(modal.className).toContain('cw-experience-dialog');
  expect(within(modal).getByText('这个作品暂时无法体验')).toBeTruthy();
  expect(within(modal).queryByText('开始体验')).toBeNull();
  expect(modal.querySelector('iframe')).toBeNull();
  const maximize = modal.querySelector('[aria-label="最大化"]');
  expect(maximize).toBeTruthy();
  fireEvent.click(maximize);
  expect(modal.className).toContain('is-maximized');
  expect(modal.querySelector('[aria-label="还原窗口"]')).toBeTruthy();
});

test('showcase navigation skips works without an id', () => {
  openShowcaseWork({});
  openShowcaseWork({ id: '   ' });
  expect(mockNavigateTo).not.toHaveBeenCalled();
});

test('clicking a published showcase card opens an on-page overlay on desktop', async () => {
  mockGetLatest.mockResolvedValue({
    items: [{ id: 'pub-1', title: '公开单摆', description: '物理实验', tags: ['物理'] }],
  });
  render(<LandingPage />);
  const heading = await screen.findByText('公开单摆');
  fireEvent.click(heading.closest('.zl-card__hit'));
  expect(mockNavigateTo).not.toHaveBeenCalled();
  const modal = screen.getByRole('dialog', { hidden: true });
  expect(within(modal).getAllByText('公开单摆').length).toBeGreaterThan(0);
  expect(within(modal).getByText('物理实验')).toBeTruthy();
  expect(modal.querySelector('[aria-label="最大化"]')).toBeTruthy();
});

test('phone-width KEEP clicks stay on an empty-state overlay instead of a broken detail page', async () => {
  window.innerWidth = 390;
  render(<LandingPage />);
  const heading = await screen.findByText('双摆轨迹如何分叉');
  fireEvent.click(heading.closest('.zl-card__hit'));
  expect(mockNavigateTo).not.toHaveBeenCalled();
  expect(screen.getByText('这个作品暂时无法体验')).toBeTruthy();
});

test('phone-width published showcase clicks keep the mobile detail path', async () => {
  window.innerWidth = 390;
  mockGetLatest.mockResolvedValue({
    items: [{ id: 'pub-1', title: '公开单摆', description: '物理实验', tags: ['物理'] }],
  });
  render(<LandingPage />);
  const heading = await screen.findByText('公开单摆');
  fireEvent.click(heading.closest('.zl-card__hit'));
  expect(mockNavigateTo).toHaveBeenCalledWith({ url: '/pages/game/detail/index?id=pub-1' });
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
  expect(landingScss).toMatch(/\.zl-card__author \{[\s\S]*display: flex/);
  expect(landingScss).toMatch(/\.zl-card__avatar \{[\s\S]*border-radius: 50%/);
  expect(landingScss).toMatch(/\.zl-card__hit \{[\s\S]*cursor: pointer/);
  expect(landingScss).toMatch(/\.zl-card__hit \{[\s\S]*appearance:\s*none/);
  expect(landingJsx).toMatch(/WorkExperienceOverlay/);
  expect(landingJsx).toMatch(/openShowcaseWork/);
  expect(landingJsx).toMatch(/className="zl-card__hit"/);
  expect(appScss).toMatch(/html\.zl-landing-route \.zl-card__hit \{[\s\S]*appearance:\s*none/);
  expect(landingScss).toMatch(/\.zl-ico \{[\s\S]*border: 2PX solid #3d4d63/);
});

test('photosynthesis mark beams originate on the sun and aim at the leaf', () => {
  const draft = readFileSync(join(__dirname, '../../../../docs/landing/zhile-landing-draft-v2.html'), 'utf8');
  expect(landingScss).toMatch(/\.zl-photo__sun \{[\s\S]*top:\s*26PX;[\s\S]*right:\s*44PX;[\s\S]*width:\s*38PX/);
  expect(landingScss).toMatch(/\.zl-photo__ray \{[\s\S]*top:\s*45PX;[\s\S]*right:\s*63PX/);
  expect(landingScss).toMatch(/\.zl-photo__ray \{[\s\S]*transform-origin:\s*100% 50%/);
  expect(landingScss).toMatch(/\.zl-photo__ray \{[\s\S]*transform:\s*rotate\(16deg\)/);
  expect(landingScss).toMatch(/\.zl-photo__ray--2 \{[\s\S]*transform:\s*rotate\(24deg\)/);
  expect(landingScss).toMatch(/\.zl-photo__ray--3 \{[\s\S]*transform:\s*rotate\(34deg\)/);
  expect(landingScss).not.toMatch(/\.zl-photo__ray \{[^}]*top:\s*42PX/);
  expect(landingScss).not.toMatch(/\.zl-photo__ray--2 \{[^}]*top:\s*58PX/);
  expect(landingScss).not.toMatch(/\.zl-photo__tag--light \{[^}]*left:\s*28PX/);
  expect(landingScss).toMatch(/\.zl-photo__tag--light \{[\s\S]*width:\s*28PX;[\s\S]*height:\s*28PX;[\s\S]*border-radius:\s*50%/);
  expect(landingScss).toMatch(/\.zl-photo__tag--light \{[\s\S]*left:\s*52PX/);
  expect(draft).toMatch(/\.photo-ray \{[^}]*top: 45px;[^}]*right: 63px/);
  expect(draft).toMatch(/\.photo-ray \{[^}]*transform: rotate\(16deg\)/);
  expect(draft).toMatch(/\.photo-tag-light \{[^}]*width: 28px;[^}]*height: 28px;[^}]*border-radius: 50%/);
  expect(draft).not.toMatch(/photo-tag-light \{ top: 22px; left: 28px/);
});

test('pendulum mark keeps the bob center on the string end', () => {
  const draft = readFileSync(join(__dirname, '../../../../docs/landing/zhile-landing-draft-v2.html'), 'utf8');
  expect(landingScss).toMatch(/\.zl-pendulum__arm \{[\s\S]*width:\s*28PX;[\s\S]*margin-left:\s*-14PX/);
  expect(landingScss).toMatch(/\.zl-pendulum__bob \{[\s\S]*margin:\s*-11PX auto 0/);
  expect(landingScss).not.toMatch(/\.zl-pendulum__arm \{[^}]*width:\s*2PX/);
  expect(landingScss).not.toMatch(/\.zl-pendulum__bob \{[^}]*margin:\s*-2PX auto 0/);
  expect(draft).toMatch(/\.arm \{[^}]*width: 28px;[^}]*margin-left: -14px/);
  expect(draft).toMatch(/\.bob \{[^}]*margin: -11px auto 0/);
});
