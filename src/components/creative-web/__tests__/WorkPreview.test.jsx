import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { get } from '../../../services/api';
import WorkPreview from '../WorkPreview';
jest.mock('../../../services/api', () => ({ get: jest.fn() }));
jest.mock('../CreativeShell', () => ({ CreativeIcon: () => <span /> }));
const work = { id: 'creative-1', version: 1, title: '双摆实验' };
beforeEach(() => jest.clearAllMocks());
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
  expect(get).toHaveBeenCalledWith('/api/v1/games/creative-1/play');
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
