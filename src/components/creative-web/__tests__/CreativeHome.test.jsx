/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CreativeHome from '../CreativeHome';
import { getMyGames, getGenerationStatus, publishGame } from '../../../services/game';
import { openTaskCreatePageWithAuth, openCreatePageWithAuth, openIteratePageWithAuth } from '../../../utils/authNavigation';
import { consumeCreativeDraft, setCreativeView } from '../creativeModel';
import { useGameStore } from '../../../store/gameStore';
jest.mock('@tarojs/taro', () => ({ useDidShow: cb => require('react').useEffect(cb, []) }));
jest.mock('../../../services/game', () => ({ getMyGames: jest.fn(), getGenerationStatus: jest.fn(), publishGame: jest.fn() }));
let mockStudioHost = null;
jest.mock('../../../utils/authNavigation', () => ({
  isLoggedIn: () => true,
  openCreatePageWithAuth: jest.fn(),
  openIteratePageWithAuth: jest.fn((game, id) => mockStudioHost?.({ mode: 'iterate', game, gameId: id || game?.id, title: game?.title })),
  openTaskCreatePageWithAuth: jest.fn(),
  registerCreativeStudioHost: jest.fn((fn) => { mockStudioHost = fn; }),
  unregisterCreativeStudioHost: jest.fn(() => { mockStudioHost = null; }),
}));
jest.mock('../../../utils/media', () => ({ getGameCoverUrl: () => '' }));
jest.mock('../../../store/gameStore', () => ({ useGameStore: jest.fn() }));
jest.mock('../../../stores/quotaStore', () => ({ __esModule: true, default: { getState: () => ({ fetchQuota: () => Promise.resolve() }) } }));
jest.mock('../CreativeShell', () => ({
  __esModule: true,
  default: ({ children }) => <div>{children}</div>,
  CreativeIcon: () => null,
  registerCreativeHomeNavigate: jest.fn(),
  unregisterCreativeHomeNavigate: jest.fn(),
}));
jest.mock('../ConversationLayout', () => ({
  __esModule: true,
  default: ({ children, navigation, onOpenWork }) => <div>
    <button type="button" onClick={() => navigation('home')}>创作空间</button>
    <button type="button" onClick={() => navigation('ideas')}>发现灵感</button>
    <button type="button" onClick={() => navigation('square')}>创意广场</button>
    <button type="button" onClick={() => navigation('works')}>我的作品</button>
    <button type="button" onClick={() => onOpenWork?.({ id: 'work-1', title: '真实双摆作品', status: 'ready' })}>打开会话</button>
    {children}
  </div>,
  ConversationIcon: () => null,
}));
jest.mock('../CreativeSquare', () => () => <div>公开作品列表</div>);
jest.mock('../CreativeStudioPanel', () => () => <div data-testid="creative-studio-panel">页内创作台</div>);
jest.mock('../WorkPreview', () => () => null);
beforeEach(() => {
  jest.clearAllMocks(); sessionStorage.clear();
  mockStudioHost = null;
  HTMLDialogElement.prototype.showModal = jest.fn(); HTMLDialogElement.prototype.close = jest.fn();
  useGameStore.mockReturnValue({ isGenerating: false, trackedTasks: [] });
  getMyGames.mockResolvedValue({ items: [], total: 0 });
});
test('loads actual works and preserves iterate task routing', async () => {
  setCreativeView('home');
  useGameStore.mockReturnValue({ isGenerating: true, currentTask: { taskId: 'task-1', gameId: 'work-1', taskType: 'pipeline_iterate' } });
  getMyGames.mockResolvedValue({ items: [{ id: 'work-1', title: '真实双摆作品', status: 'ready' }], total: 1 });
  render(<CreativeHome />);
  await screen.findByText('查看进展');
  expect(getMyGames).toHaveBeenCalledWith(1, 24);
  fireEvent.click(screen.getByText('查看进展'));
  expect(openTaskCreatePageWithAuth).toHaveBeenCalledWith('task-1', 'work-1', 'pipeline_iterate');
});
test('carries the chosen scientific idea into the authenticated creation flow', async () => {
  setCreativeView('home');
  render(<CreativeHome />);
  await screen.findByText('让一个想法，变得可以探索。');
  fireEvent.change(screen.getByLabelText('你的创意'), { target: { value: '观察不同初始角度的双摆运动' } });
  fireEvent.click(screen.getByTestId('workspace-primary'));
  await waitFor(() => expect(openCreatePageWithAuth).toHaveBeenCalledWith({ mode: 'fresh' }));
  const draft = consumeCreativeDraft();
  expect(draft.prompt).toContain('观察不同初始角度的双摆运动');
  expect(draft.prompt).toContain('呈现方式：交互实验');
  expect(draft.orientation).toBe('landscape');
  expect(draft.format).toBe('experiment');
});


test('failed works open local details without task navigation', async () => {
  setCreativeView('works');
  getMyGames.mockResolvedValue({items:[{id:'failed',title:'失败实验',status:'failed',description:'实验描述'}],total:1});
  getGenerationStatus.mockResolvedValue({errorMessage:'生成超时'});
  render(<CreativeHome />); fireEvent.click(await screen.findByText('失败实验'));
  await screen.findByText('生成超时');
  expect(openTaskCreatePageWithAuth).not.toHaveBeenCalled();
  expect(openCreatePageWithAuth).not.toHaveBeenCalled();
});
test('a draft is published only after explicit confirmation and the returned status updates the list', async () => {
  setCreativeView('works');
  getMyGames.mockResolvedValue({items:[{id:'draft',title:'我的实验',description:'改变参数，观察周期如何变化。',status:'ready'}],total:1});
  publishGame.mockResolvedValue({id:'draft',status:'published'});
  render(<CreativeHome />); fireEvent.click(await screen.findByText('发布到创意广场'));
  expect(publishGame).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('确认公开发布'));
  await screen.findByText('已发布', {selector:'.cw-cover > span'});
  expect(publishGame).toHaveBeenCalledWith('draft',{visibility:'public',title:'我的实验',description:'改变参数，观察周期如何变化。'});
});

test('opens the creative square by default without introductory filler', async () => {
  render(<CreativeHome />);
  await screen.findByText('公开作品列表');
  expect(screen.getAllByText('创意广场').length).toBeGreaterThan(0);
  expect(screen.queryByText(/体验大家公开发布的作品/)).toBeNull();
  expect(screen.queryByLabelText('你的创意')).toBeNull();
});
test('primary sidebar views switch the main region without remounting a new home page', async () => {
  render(<CreativeHome />);
  await screen.findByText('公开作品列表');
  fireEvent.click(screen.getByText('发现灵感'));
  expect(screen.getByText('世界的规律，也是创意的起点。')).toBeTruthy();
  fireEvent.click(screen.getByText('创意广场'));
  expect(screen.getByText('公开作品列表')).toBeTruthy();
  fireEvent.click(screen.getByText('创作空间'));
  expect(screen.getByText('让一个想法，变得可以探索。')).toBeTruthy();
});
test('opening a session stays on the in-shell studio panel without refetching works', async () => {
  getMyGames.mockResolvedValue({ items: [{ id: 'work-1', title: '真实双摆作品', status: 'ready' }], total: 1 });
  render(<CreativeHome />);
  await screen.findByText('公开作品列表');
  const calls = getMyGames.mock.calls.length;
  fireEvent.click(screen.getByText('打开会话'));
  expect(openIteratePageWithAuth).toHaveBeenCalledWith({ id: 'work-1', title: '真实双摆作品', status: 'ready' }, 'work-1');
  expect(await screen.findByTestId('creative-studio-panel')).toBeTruthy();
  expect(getMyGames).toHaveBeenCalledTimes(calls);
});
