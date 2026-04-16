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
  test('renders an entry editor and title input before a session exists', () => {
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
    expect(container.querySelector('textarea.creation-create-editor__input')).toBeTruthy();
    expect(screen.getByText('你的初始想法')).toBeTruthy();
  });

  test('renders a prompt editor with session helper text when the session is collecting', () => {
    render(
      <CreationCreateWorkspace
        showSettings={false}
        session={{
          sessionId: 'session-1',
          status: 'collecting',
          initialPrompt: 'Make a funny office stealth game',
          expandedPrompt: 'Expanded prompt draft',
          currentQuestion: {
            content: 'Please confirm or edit the prompt.',
          },
        }}
        inputValue="Expanded prompt draft"
        onInputChange={jest.fn()}
      />
    );

    expect(screen.getByText('AI 整理后的提示词')).toBeTruthy();
    expect(screen.getByText('Please confirm or edit the prompt.')).toBeTruthy();
    expect(screen.getByText('最初输入')).toBeTruthy();
  });

  test('renders the loading card when the session is initializing', () => {
    render(
      <CreationCreateWorkspace
        showSettings={false}
        session={{
          sessionId: 'session-init',
          status: 'initializing',
          initialPrompt: 'Make a co-op puzzle game',
        }}
        inputValue=""
        onInputChange={jest.fn()}
      />
    );

    expect(screen.getByText('正在整理并扩写你的想法')).toBeTruthy();
    expect(screen.queryByText('AI 整理后的提示词')).toBeNull();
  });
});
