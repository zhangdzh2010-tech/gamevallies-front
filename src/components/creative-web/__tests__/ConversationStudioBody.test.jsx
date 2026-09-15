/* eslint-env jest */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ConversationStudioBody from '../ConversationStudioBody';
import { StudioEmbedContext } from '../StudioEmbedContext';

jest.mock('@tarojs/taro', () => ({ __esModule: true, default: { navigateTo: jest.fn(), switchTab: jest.fn() } }));
jest.mock('../../../services/game', () => ({ getMyGames: jest.fn(() => Promise.resolve({ items: [], total: 0 })) }));
jest.mock('../../../utils/authNavigation', () => ({
  isLoggedIn: () => true,
  openCreatePageWithAuth: jest.fn(),
  openIteratePageWithAuth: jest.fn(),
  openTaskCreatePageWithAuth: jest.fn(),
  openProfilePageWithTab: jest.fn(),
}));
jest.mock('../../../utils/storage', () => ({
  Storage: { getUser: () => ({ id: 'user-1', displayName: '创作者甲' }) },
}));
jest.mock('../../../stores/quotaStore', () => {
  const state = { loading: false, freeQuota: 1, totalFreeQuota: 1, subscription: null, fetchQuota: jest.fn(() => Promise.resolve()) };
  const useQuotaStore = (selector) => (typeof selector === 'function' ? selector(state) : state);
  useQuotaStore.getState = () => state;
  return { __esModule: true, default: useQuotaStore };
});
jest.mock('../../common/BrandMark', () => ({ BRAND_MARK_SRC: '', BrandMarkImg: () => <img alt="" /> }));
jest.mock('../WorkPreview', () => () => null);

test('embedded studio body does not render a second session sidebar', () => {
  render(<ConversationStudioBody embedded home input="" inputAriaLabel="你的创意" />);
  expect(screen.queryByText('创作会话')).toBeNull();
  expect(screen.getByText('让一个想法，变得可以探索。')).toBeTruthy();
});

test('in-page studio embed also skips conversation chrome', () => {
  render(
    <StudioEmbedContext.Provider value={{ inPage: true, mode: 'iterate', gameId: 'work-1' }}>
      <ConversationStudioBody input="观察双摆" session={{ initialPrompt: '观察双摆' }} work={{ id: 'work-1', title: '双摆', status: 'ready' }} />
    </StudioEmbedContext.Provider>
  );
  expect(screen.queryByText('创作会话')).toBeNull();
  expect(screen.getByText('发布作品 ↗')).toBeTruthy();
});
