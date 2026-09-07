/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CreativeStudio from '../CreativeStudio';
import { publishGame } from '../../../services/game';
import { openIteratePageWithAuth } from '../../../utils/authNavigation';
import { consumeIterationDraft } from '../creativeModel';
jest.mock('../../../services/game', () => ({ publishGame: jest.fn() }));
jest.mock('../../../utils/share', () => ({ buildGameDetailPath: id => `/pages/game/detail/index?id=${id}` }));
jest.mock('../../../utils/authNavigation', () => ({ openIteratePageWithAuth: jest.fn() }));
jest.mock('../../common/PaywallPopup', () => ({ PaywallPopup: () => null }));
jest.mock('../CreativeShell', () => ({ __esModule: true, default: ({ children, actions }) => <div>{actions}{children}</div>, CreativeIcon: () => null }));
jest.mock('../ConversationLayout', () => ({ __esModule: true, default: ({ children, actions }) => <div>{actions}{children}</div>, ConversationIcon: () => null }));
jest.mock('../WorkPreview', () => () => null);
const work = { id: 'physics-1', title: '双摆实验', status: 'ready', version: 2 };
beforeEach(() => { jest.clearAllMocks(); HTMLDialogElement.prototype.showModal = jest.fn(); });
test('publishes through the real service and exposes the returned public state', async () => {
  publishGame.mockResolvedValue({ status: 'published' });
  render(<CreativeStudio work={work} />);
  fireEvent.click(screen.getByText('确认公开发布'));
  await screen.findByText('已发布');
  expect(publishGame).toHaveBeenCalledWith('physics-1', { visibility: 'public' });
  expect(screen.getByLabelText('作品分享地址').value).toContain('id=physics-1');
});
test('moderation is not presented as a successful public release', async () => {
  publishGame.mockResolvedValue({ status: 'review' });
  render(<CreativeStudio work={work} />);
  fireEvent.click(screen.getByText('确认公开发布'));
  await screen.findByText('发布请求已提交，请在我的作品中查看审核与发布状态。');
  expect(screen.queryByLabelText('作品分享地址')).toBeNull();
});
test('failed publishing can be retried and rapid duplicate requests are prevented', async () => {
  let reject;
  publishGame.mockImplementation(() => new Promise((_, r) => { reject = r; }));
  render(<CreativeStudio work={work} />);
  const button = screen.getByText('确认公开发布');
  fireEvent.click(button); fireEvent.click(button);
  expect(publishGame).toHaveBeenCalledTimes(1);
  reject(new Error('服务暂不可用'));
  await screen.findByText('服务暂不可用');
  publishGame.mockResolvedValue({ status: 'published' });
  fireEvent.click(screen.getByText('确认公开发布'));
  await waitFor(() => expect(screen.getByText('已发布')).toBeTruthy());
});
test('already published works can be shared without another mutation', () => {
  render(<CreativeStudio work={{ ...work, status: 'published' }} />);
  expect(screen.getByLabelText('作品分享地址').value).toContain('id=physics-1');
  expect(publishGame).not.toHaveBeenCalled();
});

test('blocks duplicate generation while the task is running and displays actual progress', () => {
  const generate = jest.fn();
  render(<CreativeStudio generating input="生态实验" session={{initialPrompt:'生态实验'}} progress={{pct:37,stageLabel:'构建交互'}} primary={{label:'开始生成',onClick:generate}} />);
  const button=screen.getByTestId('workspace-primary');
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  fireEvent.keyDown(screen.getByLabelText('creative-description'),{key:'Enter'});
  expect(generate).not.toHaveBeenCalled();
  expect(screen.getByText('37%')).toBeTruthy();
});

test('carries a completed-work follow-up into iteration without silently discarding the input', () => {
  render(<CreativeStudio work={work} />);
  fireEvent.change(screen.getByLabelText('creative-description'),{target:{value:'增加摆长对比曲线'}});
  fireEvent.click(screen.getByTestId('workspace-primary'));
  expect(openIteratePageWithAuth).toHaveBeenCalledWith(work,work.id);
  expect(consumeIterationDraft(work.id)).toBe('增加摆长对比曲线');
  expect(consumeIterationDraft(work.id)).toBe('');
});
