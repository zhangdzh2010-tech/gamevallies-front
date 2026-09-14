/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import CreativeSquare from '../CreativeSquare';
import SquareGalleryCard, { isDocumentLikePoster } from '../SquareGalleryCard';
import { getLatest, getTrending, searchGames } from '../../../services/feed';
import { openForkPageWithAuth, openIteratePageWithAuth } from '../../../utils/authNavigation';
import { Storage } from '../../../utils/storage';
import { getGalleryPosterUrl } from '../../../utils/media';

jest.mock('../../../services/feed', () => ({ getLatest: jest.fn(), getTrending: jest.fn(), searchGames: jest.fn() }));
jest.mock('../../../utils/authNavigation', () => ({ openForkPageWithAuth: jest.fn(), openIteratePageWithAuth: jest.fn() }));
jest.mock('../../../utils/storage', () => ({ Storage: { getUser: jest.fn() } }));
jest.mock('../../../utils/media', () => ({
  getGameCoverUrl: jest.fn(() => ''),
  getGalleryPosterUrl: jest.fn(() => ''),
}));

const work = { id: 'public-work', title: '种群模型', authorId: 'author', status: 'published', author: { displayName: '原作者' } };

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '<html>public work</html>' });
  Storage.getUser.mockReturnValue(null);
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
  getLatest.mockResolvedValue({ items: [], hasMore: false });
  getTrending.mockResolvedValue({ items: [work], hasMore: false });
  searchGames.mockResolvedValue({ items: [], hasMore: false });
  getGalleryPosterUrl.mockReturnValue('');
});

test('visitors can browse and play public works without the authenticated play endpoint', async () => {
  render(<CreativeSquare />);
  await screen.findByText('种群模型');
  fireEvent.click(screen.getByText('体验作品'));
  fireEvent.click(await screen.findByText('开始体验'));
  const frame = await screen.findByTitle('种群模型');
  expect(global.fetch).toHaveBeenCalledWith('/games/public-work/index.html', { credentials: 'omit', referrerPolicy: 'no-referrer' });
  expect(frame.getAttribute('srcdoc')).toContain('public work');
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
});

test('remixing somebody else opens fork flow, while own works open iteration', async () => {
  const result = render(<CreativeSquare />);
  await screen.findByText('种群模型');
  fireEvent.click(screen.getByText('复刻并创作'));
  expect(openForkPageWithAuth).toHaveBeenCalledWith('public-work');
  expect(openIteratePageWithAuth).not.toHaveBeenCalled();
  Storage.getUser.mockReturnValue({ id: 'author' });
  result.rerender(<CreativeSquare />);
  fireEvent.click(screen.getByText('继续创作'));
  expect(openIteratePageWithAuth).toHaveBeenCalledWith(work, 'public-work');
});

test('searches the server and respects pagination, rather than filtering one page', async () => {
  getTrending
    .mockResolvedValueOnce({ items: [work], hasMore: true })
    .mockResolvedValueOnce({ items: [{ ...work, id: 'second', title: '第二件作品' }], hasMore: false });
  render(<CreativeSquare />);
  fireEvent.click(await screen.findByText('加载更多作品'));
  await screen.findByText('第二件作品');
  expect(getTrending).toHaveBeenLastCalledWith(2, 24);
  fireEvent.change(screen.getByLabelText('搜索广场作品'), { target: { value: '化学' } });
  fireEvent.click(screen.getByText('搜索'));
  await waitFor(() => expect(searchGames).toHaveBeenCalledWith('化学', { page: 1, limit: 24 }));
  await screen.findByText('没有找到匹配的作品');
});

test.each([false, true])('releases the preview modal before navigating (own work: %s)', async (isOwn) => {
  Storage.getUser.mockReturnValue({ id: isOwn ? 'author' : 'visitor' });
  render(<CreativeSquare />);
  fireEvent.click(await screen.findByText('体验作品'));
  const modal = screen.getByRole('dialog', { hidden: true });
  const navigate = isOwn ? openIteratePageWithAuth : openForkPageWithAuth;
  navigate.mockImplementationOnce(() => {
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1);
  });
  fireEvent.click(within(modal).getByText(isOwn ? '继续创作' : '复刻并创作'));
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
});

test('disabled forks and API errors are visible', async () => {
  getTrending.mockResolvedValueOnce({ items: [{ ...work, allowFork: false }], hasMore: false });
  render(<CreativeSquare />);
  const button = await screen.findByText('作者未开放复刻');
  expect(button.disabled).toBe(true);
  getLatest.mockRejectedValue(new Error('服务暂时不可用'));
  fireEvent.click(screen.getByText('最新发布'));
  await screen.findByText('服务暂时不可用');
});

test('maps Failed to fetch to Chinese copy and keeps 重试 as its own control', async () => {
  getTrending.mockRejectedValue(new TypeError('Failed to fetch'));
  const scss = readFileSync(join(__dirname, '../creative-web.scss'), 'utf8');
  render(<CreativeSquare />);
  const message = await screen.findByText('网络连接失败，请稍后重试');
  const alert = message.closest('[role="alert"]');
  expect(alert).toBeTruthy();
  expect(alert.textContent).not.toMatch(/Failed to fetch/i);
  const retry = within(alert).getByText('重试');
  expect(retry.className).toContain('cw-error__retry');
  expect(alert.querySelector('.cw-error__message')).toBe(message);
  expect(retry.previousSibling).toBe(message);
  expect(scss).toMatch(/\.cw-error \{[^}]*display:flex/);
  expect(scss).toMatch(/gap:12PX 16PX/);
});

test('defaults to ranked popular works and highlights the leading cards', async () => {
  render(<CreativeSquare />);
  await screen.findByText('种群模型');
  expect(getTrending).toHaveBeenCalledWith(1, 24);
  expect(screen.getByText('热门 · 1').closest('article').className).toContain('cw-project-featured');
  expect(getLatest).not.toHaveBeenCalled();
});

test('keeps square meta compact while exposing the full description and both actions', async () => {
  const description = '改变轨道半径与恒星质量，观察行星公转周期如何变化。在理想圆轨道模型里，动手探索开普勒第三定律。';
  getTrending.mockResolvedValue({
    items: [{ ...work, title: '引力漫游 · 圆轨道周期探索', description, author: { displayName: 'willzhang' } }],
    hasMore: false,
  });
  render(<CreativeSquare />);
  const heading = await screen.findByText('引力漫游 · 圆轨道周期探索');
  const card = heading.closest('article');
  expect(card.className).toContain('cw-square-card');
  const blurb = within(card).getByText(description);
  expect(blurb.getAttribute('title')).toBe(description);
  expect(within(card).getByText('作者：willzhang')).toBeTruthy();
  expect(within(card).getByText('体验作品')).toBeTruthy();
  expect(within(card).getByText('复刻并创作')).toBeTruthy();
  fireEvent.click(within(card).getByText('体验作品'));
  const modal = screen.getByRole('dialog', { hidden: true });
  expect(modal.className).toContain('cw-experience-dialog');
  expect(modal.querySelector('.cw-dialog-stage')).toBeTruthy();
  expect(within(modal).getByText('复刻并创作')).toBeTruthy();
});

test('grid cards are gallery posters: badge on cover, title once, never a live work embed', async () => {
  const description = '调节初态与重力参数，观察自由落体运动和位移—时间关系。';
  getTrending.mockResolvedValue({
    items: [{
      ...work,
      title: '自由落体演示',
      description,
      html: '<h1>自由落体演示</h1><p>模型、公式与假设</p><input type="range" /><button>开始</button>',
      screenshot: 'https://cdn.example/full-screenshot.png',
      author: { displayName: 'willzhang' },
    }],
    hasMore: false,
  });
  const scss = readFileSync(join(__dirname, '../creative-web.scss'), 'utf8');
  const source = readFileSync(join(__dirname, '../SquareGalleryCard.jsx'), 'utf8');
  render(<CreativeSquare />);
  const heading = await screen.findByText('自由落体演示');
  const card = heading.closest('article');
  const cover = card.querySelector('.cw-gallery-cover');
  const meta = card.querySelector('.cw-gallery-meta');
  const badge = within(card).getByText('热门 · 1');
  expect(cover.contains(badge)).toBe(true);
  expect(meta.contains(badge)).toBe(false);
  expect(within(card).getAllByText('自由落体演示')).toHaveLength(1);
  expect(within(card).queryByText('模型、公式与假设')).toBeNull();
  expect(card.querySelector('iframe')).toBeNull();
  expect(card.querySelector('input[type="range"]')).toBeNull();
  expect(within(card).queryByText('开始体验')).toBeNull();
  expect(within(card).queryByText('暂停')).toBeNull();
  expect(within(card).queryByText('重置')).toBeNull();
  expect(card.querySelector('.cw-gallery-placeholder')).toBeTruthy();
  expect(source).not.toMatch(/WorkSandbox|iframe|srcDoc|sandbox/);
  expect(scss).toMatch(/\.cw-gallery-cover \{[^}]*padding-top:62\.5%/);
  expect(scss).toMatch(/\.cw-gallery-cover \.cw-hot-badge \{[^}]*top:12PX/);
  expect(scss).toMatch(/\.cw-square-card \.cw-gallery-meta \.cw-hot-badge \{display:none;\}/);
});

test('letterboxed posters stay in the cover and live iframes open only after 开始体验', async () => {
  getGalleryPosterUrl.mockReturnValue('https://cdn.example/covers/ohm.png');
  getTrending.mockResolvedValue({
    items: [{ ...work, title: '电流的秘密', description: '拨动电压与电阻' }],
    hasMore: false,
  });
  render(<CreativeSquare />);
  const heading = await screen.findByText('电流的秘密');
  const card = heading.closest('article');
  const coverImg = card.querySelector('.cw-gallery-cover img');
  expect(coverImg.getAttribute('src')).toBe('https://cdn.example/covers/ohm.png');
  expect(card.querySelector('iframe')).toBeNull();
  fireEvent.click(within(card).getByText('体验作品'));
  fireEvent.click(await screen.findByText('开始体验'));
  const frame = await screen.findByTitle('电流的秘密');
  expect(frame.closest('.cw-player-letterbox')).toBeTruthy();
  expect(frame.closest('.cw-player-letterbox--scaled')).toBeTruthy();
  expect(frame.closest('.cw-player-scaler')).toBeTruthy();
  expect(frame.closest('.cw-square-stage')).toBeTruthy();
  expect(card.contains(frame)).toBe(false);
});

test('tall work-page screenshots are rejected so the cover never repeats in-work chrome', () => {
  expect(isDocumentLikePoster(1280, 800)).toBe(false);
  expect(isDocumentLikePoster(800, 1400)).toBe(true);
  getGalleryPosterUrl.mockReturnValue('https://cdn.example/covers/dump.png');
  render(
    <SquareGalleryCard
      work={{ ...work, title: '自由落体演示', description: '调节初态与重力参数。' }}
      onExperience={() => {}}
      onRemix={() => {}}
      remixLabel="复刻并创作"
    />,
  );
  const image = document.querySelector('.cw-gallery-cover img');
  Object.defineProperty(image, 'naturalWidth', { value: 800 });
  Object.defineProperty(image, 'naturalHeight', { value: 1400 });
  fireEvent.load(image);
  expect(document.querySelector('.cw-gallery-cover img')).toBeNull();
  expect(document.querySelector('.cw-gallery-placeholder')).toBeTruthy();
  expect(document.querySelectorAll('h3')).toHaveLength(1);
});
