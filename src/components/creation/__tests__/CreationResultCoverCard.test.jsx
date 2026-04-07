/* eslint-env jest */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CreationResultCoverCard } from '..';

jest.mock('@tarojs/components', () => require('../../../test-utils/taroComponentsMock'));

describe('CreationResultCoverCard', () => {
  test('renders the ready cover content and triggers the play action', () => {
    const handleAction = jest.fn();

    render(
      <CreationResultCoverCard
        badge="已就绪"
        title="像素冲刺"
        description="现在可以直接试玩，也可以继续打磨。"
        coverUrl="https://example.com/cover.png"
        actionLabel="试玩游戏"
        onAction={handleAction}
      />
    );

    expect(screen.getByText('已就绪')).toBeTruthy();
    expect(screen.getByText('像素冲刺')).toBeTruthy();
    expect(screen.getByText('现在可以直接试玩，也可以继续打磨。')).toBeTruthy();

    fireEvent.click(screen.getByText('试玩游戏'));

    expect(handleAction).toHaveBeenCalledTimes(1);
  });
});
