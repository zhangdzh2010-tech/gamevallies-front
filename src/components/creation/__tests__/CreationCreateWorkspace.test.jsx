/* eslint-env jest */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CreationCreateWorkspace } from '../CreationCreateWorkspace';

jest.mock('@tarojs/components', () => {
  const mockReact = require('react');
  const MockView = mockReact.forwardRef(({ children, className, onClick, style }, ref) => (
    <div className={className} onClick={onClick} style={style} ref={ref}>{children}</div>
  ));
  MockView.displayName = 'MockView';

  return {
    View: MockView,
    Text: ({ children, className }) => <span className={className}>{children}</span>,
    Input: ({ className, placeholder, value, onInput }) => (
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        onInput={(event) => onInput?.({ detail: { value: event.currentTarget.value } })}
        readOnly
      />
    ),
    Textarea: ({ className, placeholder, value, onInput }) => (
      <textarea
        className={className}
        placeholder={placeholder}
        value={value}
        onInput={(event) => onInput?.({ detail: { value: event.currentTarget.value } })}
        readOnly
      />
    ),
  };
});

describe('CreationCreateWorkspace', () => {
  test('does not duplicate the current AI question when the latest assistant message already covers it', () => {
    render(
      <CreationCreateWorkspace
        showSettings={false}
        session={{
          messages: [
            { id: 'user-1', role: 'user', content: '背景是现代都市海战。' },
            { id: 'assistant-1', role: 'assistant', content: '我先确认一个关键点：你想把它放在什么情境、世界观或题材里？' },
          ],
          currentQuestion: {
            content: '你想把它放在什么情境、世界观或题材里？',
          },
        }}
        inputValue=""
        onInputChange={jest.fn()}
      />
    );

    expect(screen.getAllByText(/你想把它放在什么情境、世界观或题材里？/)).toHaveLength(1);
  });

  test('collapses duplicate assistant follow-up messages and renders the optimistic user reply once', () => {
    render(
      <CreationCreateWorkspace
        showSettings={false}
        session={{
          messages: [
            { id: 'user-1', role: 'user', content: 'Modern city naval defense game' },
            { id: 'assistant-1', role: 'assistant', content: 'I want to confirm one key point: which world or theme should it use?' },
            { id: 'assistant-2', role: 'assistant', content: 'Which world or theme should it use?' },
          ],
        }}
        pendingUserMessage={{
          id: 'pending-user-1',
          role: 'user',
          content: 'Near-future geopolitics with fictional factions',
          isPending: true,
        }}
        inputValue=""
        onInputChange={jest.fn()}
      />
    );

    expect(screen.getAllByText(/Which world or theme should it use\?/)).toHaveLength(1);
    expect(screen.getByText('Near-future geopolitics with fictional factions')).toBeTruthy();
  });

  test('renders a multiline textarea for the game description composer and keeps the title input', () => {
    const { container } = render(
      <CreationCreateWorkspace
        gameName=""
        onGameNameChange={jest.fn()}
        orientationOptions={[
          { label: '竖版', value: 'portrait' },
          { label: '横版', value: 'landscape' },
        ]}
        inputValue=""
        onInputChange={jest.fn()}
      />
    );

    expect(container.querySelector('input.creation-config-input')).toBeTruthy();
    expect(container.querySelector('textarea.creation-create-composer__input')).toBeTruthy();
  });
});
