/* eslint-env jest */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { get } from '../../../services/api';
import WorkPreview from '../WorkPreview';
import { EMPTY_PLAY_GUIDE } from '../../../utils/workPlayGuide';
jest.mock('../../../utils/storage', () => ({ Storage: { getUser: () => null } }));
jest.mock('../../../services/api', () => ({ get: jest.fn() }));
jest.mock('../CreativeShell', () => ({ CreativeIcon: () => <span /> }));
const work = { id: 'creative-1', version: 1, title: '双摆实验' };
beforeEach(() => {
  jest.clearAllMocks();
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
});
test('loads real HTML only after explicit play and isolates it from application credentials', async () => {
  get.mockResolvedValue({ htmlCode: '<html><body>experiment</body></html>' });
  const { container } = render(<WorkPreview work={work} />);
  expect(get).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('开始体验'));
  await waitFor(() => expect(container.querySelector('iframe')).not.toBeNull());
  const frame = container.querySelector('iframe');
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(frame.getAttribute('srcdoc')).toContain('experiment');
  expect(frame.closest('.cw-preview-frame')).toBeTruthy();
  expect(frame.closest('.cw-player-letterbox--scaled')).toBeTruthy();
  expect(get).toHaveBeenCalledWith('/api/v1/games/creative-1/play');
});

test('conversation experience wraps the live iframe in a letterbox stage', async () => {
  get.mockResolvedValue({ htmlCode: '<html><body>studio</body></html>' });
  const { container } = render(<WorkPreview conversation work={work} />);
  fireEvent.click(screen.getByText('开始体验'));
  await waitFor(() => expect(container.querySelector('iframe')).not.toBeNull());
  const frame = container.querySelector('iframe.work-player');
  expect(frame.closest('.cw-player-letterbox--scaled')).toBeTruthy();
});
test('does not bypass subscription gating', () => {
  const unlock = jest.fn();
  render(<WorkPreview work={work} canPlay={false} onUnlock={unlock} />);
  fireEvent.click(screen.getByText('查看解锁方式'));
  expect(unlock).toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
});
test('shows a request failure and supports retry without inventing preview content', async () => {
  get.mockRejectedValue(new Error('未获授权'));
  const { container } = render(<WorkPreview work={work} />);
  fireEvent.click(screen.getByText('开始体验'));
  await screen.findByText('未获授权');
  expect(container.querySelector('iframe')).toBeNull();
  get.mockResolvedValue({ htmlCode: '<p>authorized</p>' });
  fireEvent.click(screen.getByText('重试'));
  await waitFor(() => expect(container.querySelector('iframe')).not.toBeNull());
});
test('discards a delayed preview response after switching works', async () => {
  let resolve;
  get.mockImplementation(() => new Promise(r => { resolve = r; }));
  const { rerender, container } = render(<WorkPreview work={work} />);
  fireEvent.click(screen.getByText('开始体验'));
  rerender(<WorkPreview work={{ ...work, id: 'creative-2' }} />);
  await act(async () => resolve({ htmlCode: '<p>old private work</p>' }));
  expect(container.querySelector('iframe')).toBeNull();
});

test('conversation preview keeps one primary play CTA and reaches howto after start', async () => {
  get.mockResolvedValue({
    htmlCode: '<html><body>studio</body></html>',
    howto: '拖动温度滑块，观察酶活性曲线。',
  });
  const described = { ...work, description: '调节摆长与重力，观察周期变化。' };
  render(<WorkPreview conversation work={described} onEdit={() => {}} />);
  expect(screen.getByText('开始体验')).toBeTruthy();
  expect(screen.queryByText('打开体验 ↗')).toBeNull();
  expect(screen.queryByText(/打开体验/)).toBeNull();
  expect(screen.getByText('继续调整')).toBeTruthy();
  expect(screen.getByLabelText('放大').disabled).toBe(true);
  expect(screen.queryByText('玩法说明')).toBeNull();

  fireEvent.click(screen.getByText('开始体验'));
  await screen.findByText('拖动温度滑块，观察酶活性曲线。');
  expect(screen.queryByText('调节摆长与重力，观察周期变化。')).toBeNull();
  expect(screen.getByText('玩法说明')).toBeTruthy();
  expect(screen.getByLabelText('放大').disabled).toBe(false);
  expect(screen.queryByText('打开体验 ↗')).toBeNull();
  expect(screen.queryByText('开始体验')).toBeNull();
});

test('conversation howto stays reachable when the author left description empty', async () => {
  get.mockResolvedValue({ htmlCode: '<p>ready</p>' });
  render(<WorkPreview conversation work={work} />);
  fireEvent.click(screen.getByText('开始体验'));
  await screen.findByText(EMPTY_PLAY_GUIDE);
  fireEvent.click(screen.getByLabelText('关闭玩法说明'));
  expect(screen.queryByText(EMPTY_PLAY_GUIDE)).toBeNull();
  fireEvent.click(screen.getByText('玩法说明'));
  expect(screen.getByText(EMPTY_PLAY_GUIDE)).toBeTruthy();
});
