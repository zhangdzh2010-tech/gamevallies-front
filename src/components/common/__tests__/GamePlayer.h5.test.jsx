/* eslint-env jest */
import React from 'react';
import { render } from '@testing-library/react';

jest.mock('@tarojs/components', () => require('../../../test-utils/taroComponentsMock'));

const mockCloseGame = jest.fn();

jest.mock('../../../stores/gamePlayer', () => ({
  __esModule: true,
  default: jest.fn((selector) =>
    selector({
      gameUrl: '',
      gameTitle: '',
      closeGame: mockCloseGame,
    })
  ),
}));

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    getSystemInfoSync: jest.fn(() => {
      throw new Error('unsupported on h5');
    }),
  },
  getSystemInfoSync: jest.fn(() => {
    throw new Error('unsupported on h5');
  }),
}));

const { GlobalGamePlayer } = require('../GamePlayer');

describe('GlobalGamePlayer on H5', () => {
  const originalEnv = process.env.TARO_ENV;

  beforeEach(() => {
    process.env.TARO_ENV = 'h5';
  });

  afterAll(() => {
    process.env.TARO_ENV = originalEnv;
  });

  test('does not crash when getSystemInfoSync is unavailable', () => {
    const { container } = render(<GlobalGamePlayer />);

    expect(container).toBeTruthy();
    expect(container.querySelector('iframe')).toBeNull();
  });
});
