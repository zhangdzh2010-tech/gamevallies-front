/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FailedWorkDialog from '../FailedWorkDialog';
import { getGenerationStatus } from '../../../services/game';
import { openCreatePageWithAuth } from '../../../utils/authNavigation';
import { consumeCreativeDraft } from '../creativeModel';
jest.mock('../../../services/game', () => ({ getGenerationStatus: jest.fn(), getGenerationTask: jest.fn() }));
jest.mock('../../../utils/authNavigation', () => ({ openCreatePageWithAuth: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); sessionStorage.clear(); HTMLDialogElement.prototype.showModal=jest.fn(); });
test('failure inspection is read-only; only explicit restart opens creation with preserved prompt', async () => {
  getGenerationStatus.mockResolvedValue({status:'failed',errorMessage:'模型请求超时',failedStage:'generation'});
  const close=jest.fn(); render(<FailedWorkDialog work={{id:'failed-work',title:'实验',description:'比较两组双摆轨迹',status:'failed'}} onClose={close}/>);
  await screen.findByText('模型请求超时');
  expect(getGenerationStatus).toHaveBeenCalledWith('failed-work');
  expect(openCreatePageWithAuth).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('修改描述并重新创作'));
  expect(openCreatePageWithAuth).toHaveBeenCalledWith({mode:'fresh'});
  expect(consumeCreativeDraft()).toMatchObject({prompt:'比较两组双摆轨迹',title:'实验'});
  expect(close).toHaveBeenCalled();
});
test('ignores stale detail when another failed work is selected', async () => {
  let first; getGenerationStatus.mockImplementationOnce(() => new Promise(resolve => {first=resolve;})).mockResolvedValueOnce({errorMessage:'第二个错误'});
  const result=render(<FailedWorkDialog work={{id:'one'}} onClose={()=>{}}/>);
  result.rerender(<FailedWorkDialog work={{id:'two'}} onClose={()=>{}}/>);
  await screen.findByText('第二个错误'); first({errorMessage:'过期错误'});
  await waitFor(() => expect(screen.queryByText('过期错误')).toBeNull());
});
