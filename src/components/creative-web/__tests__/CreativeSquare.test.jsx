/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CreativeSquare from '../CreativeSquare';
import { getLatest, getTrending, searchGames } from '../../../services/feed';
import { openForkPageWithAuth, openIteratePageWithAuth } from '../../../utils/authNavigation';
import { Storage } from '../../../utils/storage';
jest.mock('../../../services/feed', () => ({ getLatest: jest.fn(), getTrending: jest.fn(), searchGames: jest.fn() }));
jest.mock('../../../utils/authNavigation', () => ({ openForkPageWithAuth: jest.fn(), openIteratePageWithAuth: jest.fn() }));
jest.mock('../../../utils/storage', () => ({ Storage: { getUser: jest.fn() } }));
jest.mock('../../../utils/media', () => ({ getGameCoverUrl: () => '' }));
jest.mock('../CreativeShell', () => ({ CreativeIcon: () => null }));
const work = { id: 'public-work', title: '种群模型', authorId: 'author', status: 'published', author: { displayName: '原作者' } };
beforeEach(() => {
  jest.clearAllMocks(); Storage.getUser.mockReturnValue(null);
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
  getLatest.mockResolvedValue({ items: [work], hasMore: false });
  getTrending.mockResolvedValue({ items: [], hasMore: false });
  searchGames.mockResolvedValue({ items: [], hasMore: false });
});
test('visitors can browse and play public works without the authenticated play endpoint', async () => {
  render(<CreativeSquare />);
  await screen.findByText('种群模型');
  fireEvent.click(screen.getByText('体验作品'));
  fireEvent.click(await screen.findByText('开始体验'));
  const frame = screen.getByTitle('种群模型');
  expect(frame.getAttribute('src')).toBe('/games/public-work/index.html');
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
});
test('remixing somebody else opens fork flow, while own works open iteration', async () => {
  const result = render(<CreativeSquare />); await screen.findByText('种群模型');
  fireEvent.click(screen.getByText('复刻并创作'));
  expect(openForkPageWithAuth).toHaveBeenCalledWith('public-work');
  expect(openIteratePageWithAuth).not.toHaveBeenCalled();
  Storage.getUser.mockReturnValue({ id: 'author' }); result.rerender(<CreativeSquare />);
  fireEvent.click(screen.getByText('继续创作'));
  expect(openIteratePageWithAuth).toHaveBeenCalledWith(work, 'public-work');
});
test('searches the server and respects pagination, rather than filtering one page', async () => {
  getLatest.mockResolvedValueOnce({ items: [work], hasMore: true }).mockResolvedValueOnce({ items: [{...work,id:'second',title:'第二件作品'}], hasMore: false });
  render(<CreativeSquare />); fireEvent.click(await screen.findByText('加载更多作品'));
  await screen.findByText('第二件作品'); expect(getLatest).toHaveBeenLastCalledWith(2,24);
  fireEvent.change(screen.getByLabelText('搜索广场作品'), { target: {value:'化学'} });
  fireEvent.click(screen.getByText('搜索'));
  await waitFor(() => expect(searchGames).toHaveBeenCalledWith('化学',{page:1,limit:24}));
  await screen.findByText('没有找到匹配的作品');
});
test.each([false, true])('releases the preview modal before navigating (own work: %s)', async isOwn => {
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
  getLatest.mockResolvedValueOnce({items:[{...work,allowFork:false}],hasMore:false});
  render(<CreativeSquare />); const button=await screen.findByText('作者未开放复刻');
  expect(button.disabled).toBe(true);
  getTrending.mockRejectedValue(new Error('服务暂时不可用'));
  fireEvent.click(screen.getByText('热门作品'));
  await screen.findByText('服务暂时不可用');
});
