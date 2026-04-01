/* eslint-env jest */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CreationEntryErrorCard, CreationResumeScene, CreationSessionScene, buildCreationSessionActions, buildCreationSessionSceneProps, getCreationEntryErrorContent } from '..';

jest.mock('@tarojs/components', () => ({
  View: ({ children, className, onClick }) => (
    <div className={className} onClick={onClick}>{children}</div>
  ),
  Text: ({ children, className }) => <span className={className}>{children}</span>,
  Textarea: ({ value, placeholder }) => <textarea value={value} placeholder={placeholder} readOnly />,
}));

describe('CreationSession components', () => {
  test('renders the shared creation session scene without exposing draft fields', () => {
    render(
      <CreationSessionScene
        shell={{
          title: '逐步把方向聊清楚',
        }}
        panel={{
          session: {
            status: 'collecting',
            planDraft: {
              title: '办公室摸鱼计划',
              summary: '一款围绕办公室摸鱼展开的小游戏。',
            },
            messages: [
              { id: '1', role: 'user', content: '我想做一个摸鱼游戏' },
            ],
            currentQuestion: {
              content: '我已经整理出一版方向了，目前方向是：simulation / office。如果你愿意继续打磨，我还想确认一个点：你希望它发生在什么场景里？',
            },
          },
          entryMode: 'create',
          answerValue: '现代办公室',
          answerPlaceholder: '继续补充',
          actions: [{ key: 'submit', label: '提交回答', tone: 'primary' }],
        }}
      />
    );

    expect(screen.getByText('逐步把方向聊清楚')).toBeTruthy();
    expect(screen.queryByText('当前理解')).toBeNull();
    expect(screen.queryByText('方向：办公室摸鱼计划')).toBeNull();
    expect(screen.getByText('我想做一个摸鱼游戏')).toBeTruthy();
    expect(screen.getByText('你希望它发生在什么场景里？')).toBeTruthy();
    expect(screen.queryByText(/目前方向是/)).toBeNull();
    expect(screen.getByDisplayValue('现代办公室')).toBeTruthy();
    expect(screen.getByText('提交回答')).toBeTruthy();
  });

  test('builds shared creation session actions with mode-specific generate label', () => {
    const actions = buildCreationSessionActions({
      submitting: false,
      answerValue: '想做像素风',
      generateLabel: '开始优化',
      onSubmit: jest.fn(),
      onSkip: jest.fn(),
      onGenerate: jest.fn(),
      onRestart: jest.fn(),
    });

    expect(actions).toHaveLength(4);
    expect(actions[0]).toEqual(expect.objectContaining({
      key: 'submit',
      label: '提交回答',
      disabled: false,
    }));
    expect(actions[2]).toEqual(expect.objectContaining({
      key: 'generate',
      label: '开始优化',
      disabled: false,
    }));
  });

  test('builds shared creation session scene props from mode schema', () => {
    const props = buildCreationSessionSceneProps({
      entryMode: 'iterate',
      session: {
        status: 'collecting',
      },
      answerValue: '加快节奏',
      answerSuggestions: ['像素风'],
      actions: [{ key: 'generate', label: '开始优化' }],
      errorMessage: '会话异常',
    });

    expect(props.shell).toEqual(expect.objectContaining({
      title: '继续优化',
    }));
    expect(props.panel).toEqual(expect.objectContaining({
      entryMode: 'iterate',
      answerPlaceholder: '继续说这次想怎么优化',
      errorClassName: 'creation-session-error',
    }));
  });

  test('renders shared resume scene with summary metadata', () => {
    render(
      <CreationResumeScene
        entryMode="fork"
        session={{
          status: 'collecting',
          title: '赛博贪吃蛇',
          prompt: '继续这轮新版本对话',
          updatedAt: '2026-03-31T12:00:00.000Z',
        }}
        subjectTitle="赛博贪吃蛇"
      />
    );

    expect(screen.getAllByText('继续上次复刻').length).toBeGreaterThan(0);
    expect(screen.getByText('赛博贪吃蛇')).toBeTruthy();
    expect(screen.getByText('继续这轮新版本对话')).toBeTruthy();
  });

  test('falls back gracefully when resume scene receives an invalid timestamp', () => {
    render(
      <CreationResumeScene
        entryMode="create"
        session={{
          status: 'collecting',
          prompt: '继续这轮创作',
          updatedAt: 'not-a-date',
        }}
      />
    );

    expect(screen.getByText('最近更新 · 最近整理过')).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  test('builds friendly entry error content and renders the shared error card', () => {
    const content = getCreationEntryErrorContent('iterate', 'timeout');

    expect(content).toEqual(expect.objectContaining({
      title: '刚才没把这轮优化准备好',
    }));

    render(
      <CreationEntryErrorCard
        entryMode="iterate"
        error="timeout"
      />
    );

    expect(screen.getByText('需要重新试一次')).toBeTruthy();
    expect(screen.getByText('刚才没把这轮优化准备好')).toBeTruthy();
    expect(screen.getByText('你刚才写的内容还在，直接点下面的重试按钮就好。')).toBeTruthy();
  });
});
