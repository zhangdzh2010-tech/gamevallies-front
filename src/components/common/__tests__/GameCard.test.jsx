/* eslint-env jest */
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('@tarojs/components', () => require('../../../test-utils/taroComponentsMock'));

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    navigateTo: jest.fn(),
  },
  navigateTo: jest.fn(),
}));

jest.mock('../../../utils/media', () => ({
  getSafeGameImage: jest.fn(() => ''),
}));

const { GameCard } = require('../GameCard');

describe('GameCard author subtitle', () => {
  test('renders author name below title when enabled', () => {
    render(
      <GameCard
        game={{
          id: 'game-1',
          title: '朋友的新作品',
          author: { displayName: '作者甲' },
          plays: 12,
          likes: 3,
          comments: 1,
        }}
        variant="home-showcase"
        showAuthorInInfo
      />
    );

    expect(screen.getByText('朋友的新作品')).toBeTruthy();
    expect(screen.getByText('作者甲')).toBeTruthy();
  });

  test('does not render author name below title when disabled', () => {
    render(
      <GameCard
        game={{
          id: 'game-2',
          title: '另一款作品',
          author: { displayName: '作者乙' },
          plays: 8,
          likes: 2,
          comments: 0,
        }}
        variant="home-showcase"
      />
    );

    expect(screen.getByText('另一款作品')).toBeTruthy();
    expect(screen.queryByText('作者乙')).toBeNull();
  });
});
