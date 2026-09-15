/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';
import WorkExperienceOverlay from '../WorkExperienceOverlay';
import { openForkPageWithAuth, openIteratePageWithAuth } from '../../../utils/authNavigation';
import { Storage } from '../../../utils/storage';

jest.mock('../../../utils/authNavigation', () => ({
  openForkPageWithAuth: jest.fn(),
  openIteratePageWithAuth: jest.fn(),
}));
jest.mock('../../../utils/storage', () => ({ Storage: { getUser: jest.fn() } }));
jest.mock('../../../services/game', () => ({ getGame: jest.fn(() => Promise.resolve(null)) }));

const work = {
  id: 'public-work',
  title: '种群模型',
  description: '调节繁殖率',
  authorId: 'author',
  author: { displayName: '林栖' },
};

beforeEach(() => {
  jest.clearAllMocks();
  Storage.getUser.mockReturnValue(null);
  HTMLDialogElement.prototype.showModal = jest.fn();
  HTMLDialogElement.prototype.close = jest.fn();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '<html>public work</html>' });
});

test('plays the public work in a maximizable overlay without navigating', async () => {
  const onClose = jest.fn();
  render(<WorkExperienceOverlay work={work} onClose={onClose} />);
  const modal = screen.getByRole('dialog', { hidden: true });
  expect(modal.className).toContain('cw-experience-dialog');
  expect(modal.className).not.toContain('is-maximized');
  fireEvent.click(modal.querySelector('[aria-label="最大化"]'));
  expect(modal.className).toContain('is-maximized');
  fireEvent.click(modal.querySelector('[aria-label="还原窗口"]'));
  expect(modal.className).not.toContain('is-maximized');
  fireEvent.click(screen.getByText('开始体验'));
  const frame = await screen.findByTitle('种群模型');
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  fireEvent.click(modal.querySelector('[aria-label="关闭作品体验"]'));
  expect(onClose).toHaveBeenCalledWith('close');
});

test('remix closes the overlay before leaving the current page', async () => {
  const onClose = jest.fn();
  const { rerender } = render(<WorkExperienceOverlay work={work} onClose={onClose} />);
  fireEvent.click(screen.getByText('复刻并创作'));
  expect(openForkPageWithAuth).toHaveBeenCalledWith('public-work');
  expect(onClose).toHaveBeenCalledWith('remix');
  Storage.getUser.mockReturnValue({ id: 'author' });
  rerender(<WorkExperienceOverlay work={work} onClose={onClose} />);
  fireEvent.click(screen.getByText('继续创作'));
  expect(openIteratePageWithAuth).toHaveBeenCalled();
});

test('autoPlay skips the start gate and styles support a near-fullscreen window', async () => {
  const scss = readFileSync(join(__dirname, '../creative-web.scss'), 'utf8');
  render(<WorkExperienceOverlay work={work} autoPlay />);
  expect(screen.queryByText('开始体验')).toBeNull();
  await waitFor(() => expect(screen.getByTitle('种群模型')).toBeTruthy());
  expect(scss).toMatch(/\.cw-experience-dialog\.is-maximized/);
  expect(scss).toMatch(/width:96vw/);
  expect(scss).toMatch(/height:96vh/);
  expect(scss).toMatch(/cw-experience-overlay-root \{[^}]*display:flex/);
  expect(scss).toMatch(/cw-experience-overlay-root \{[^}]*width:100%/);
  expect(scss).not.toMatch(/cw-experience-overlay-root \{[^}]*width:0/);
  expect(scss).toMatch(/is-maximized \.cw-square-stage/);
  expect(scss).toMatch(/is-maximized \.cw-player-letterbox/);
  expect(scss).toMatch(/\.cw-experience-dialog \{[^}]*margin:auto/);
});

test('KEEP marketing ids show an empty state instead of a blank player', () => {
  render(<WorkExperienceOverlay work={{ id: 'keep-pendulum', title: '单摆', description: '示意' }} autoPlay />);
  expect(screen.getByText('这个作品暂时无法体验')).toBeTruthy();
  expect(screen.queryByText('开始体验')).toBeNull();
  expect(screen.queryByTitle('单摆')).toBeNull();
});
