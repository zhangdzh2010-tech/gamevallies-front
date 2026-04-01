/* eslint-env jest */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { View, Text, Textarea } from '@tarojs/components';
import {
  CreationAnswerComposer,
  CreationEntryErrorCard,
  CreationConfidenceCard,
  CreationConversationList,
  CreationPlanDraftCard,
  CreationQuestionCard,
  CreationResumeScene,
  CreationResumePrompt,
  CreationSessionActions,
  CreationSessionScene,
  CreationSessionShell,
  buildCreationSessionActions,
  buildCreationSessionSceneProps,
  getCreationEntryErrorContent,
} from '..';

jest.mock('@tarojs/components', () => ({
  View: ({ children, className, onClick }) => (
    <div className={className} onClick={onClick}>{children}</div>
  ),
  Text: ({ children, className }) => <span className={className}>{children}</span>,
  Textarea: ({ value, placeholder }) => <textarea value={value} placeholder={placeholder} readOnly />,
}));

describe('CreationSession components', () => {
  test('renders the shared creation session shell with subcomponents', () => {
    render(
      <CreationSessionShell
        title="一起确认这次创作方向"
        statusValue="ready"
        sections={[
          { key: 'plan', node: <CreationPlanDraftCard draft="这是第一版方案草案" /> },
          {
            key: 'confidence',
            node: (
              <CreationConfidenceCard
                confidenceSummary="系统已经理解了核心玩法。"
                questionStrategy="还需要确认视觉表现。"
              />
            ),
          },
          {
            key: 'conversation',
            node: <CreationConversationList messages={[{ id: '1', role: 'user', content: '我想做一个像素风跑酷游戏' }]} />,
          },
          {
            key: 'question',
            node: <CreationQuestionCard question={{ content: '你更希望角色是什么设定？', answerType: 'text' }} />,
          },
          {
            key: 'composer',
            node: <CreationAnswerComposer value="主角是会冲刺的猫咪" suggestions={['像素风', '节奏更快']} />,
          },
          {
            key: 'actions',
            node: <CreationSessionActions actions={[{ key: 'submit', label: '提交回答', tone: 'primary' }]} />,
          },
        ]}
      />
    );

    expect(screen.getByText('一起确认这次创作方向')).toBeTruthy();
    expect(screen.getByText('这是第一版方案草案')).toBeTruthy();
    expect(screen.getByText('系统已经理解了核心玩法。')).toBeTruthy();
    expect(screen.getByText('我想做一个像素风跑酷游戏')).toBeTruthy();
    expect(screen.getByText('你更希望角色是什么设定？')).toBeTruthy();
    expect(screen.getByDisplayValue('主角是会冲刺的猫咪')).toBeTruthy();
    expect(screen.getByText('提交回答')).toBeTruthy();
  });

  test('renders the shared creation session scene in shell layout', () => {
    render(
      <CreationSessionScene
        layout="shell"
        shell={{
          title: '统一会话场景',
          statusValue: 'collecting',
        }}
        panel={{
          session: {
            status: 'collecting',
            planDraft: '场景层统一包裹会话面板',
            confidenceSummary: '系统理解已同步到公共 scene',
            currentQuestion: {
              content: '你想保留哪部分玩法？',
            },
          },
          entryMode: 'create',
          answerValue: '保留跑酷和冲刺感',
          answerPlaceholder: '继续补充',
          actions: [{ key: 'submit', label: '提交回答', tone: 'primary' }],
        }}
      />
    );

    expect(screen.getByText('统一会话场景')).toBeTruthy();
    expect(screen.getByText('场景层统一包裹会话面板')).toBeTruthy();
    expect(screen.getByText('你想保留哪部分玩法？')).toBeTruthy();
    expect(screen.getByDisplayValue('保留跑酷和冲刺感')).toBeTruthy();
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
      actions: [{ key: 'generate', label: '直接开始优化' }],
      errorMessage: '会话异常',
    });

    expect(props).toEqual(expect.objectContaining({
      layout: 'shell',
      className: '',
    }));
    expect(props.shell).toEqual(expect.objectContaining({
      eyebrow: '继续打磨',
      title: '先说这次最想改什么，再一起把改动方向敲定',
      subtitle: 'AI 会基于当前版本整理优化思路，再补问一个最值得确认的细节。',
      statusLabel: '进行到',
    }));
    expect(props.panel).toEqual(expect.objectContaining({
      entryMode: 'iterate',
      planHint: '这是 AI 基于当前版本整理出的优化思路，你可以继续补充或直接开始生成。',
      answerPlaceholder: '例如：保留核心玩法，把节奏再推快一点，打击反馈更爽。',
      errorClassName: 'iterate-error-banner',
    }));
  });

  test('renders shared resume prompt actions', () => {
    render(
      <CreationResumePrompt
        title="上次的优化方向"
        prompt="继续这轮优化，或者结束它开始新的方向。"
        continueLabel="继续上次优化"
        restartLabel="开始新的优化"
      />
    );

    expect(screen.getByText('上次的优化方向')).toBeTruthy();
    expect(screen.getByText('继续这轮优化，或者结束它开始新的方向。')).toBeTruthy();
    expect(screen.getByText('继续上次优化')).toBeTruthy();
    expect(screen.getByText('开始新的优化')).toBeTruthy();
  });

  test('renders shared resume scene with summary metadata', () => {
    render(
      <CreationResumeScene
        entryMode="fork"
        session={{
          status: 'collecting',
          title: '赛博贪吃蛇',
          prompt: '继续这轮新版本对话，或者结束它重新开始。',
          updatedAt: '2026-03-31T12:00:00.000Z',
        }}
        subjectTitle="赛博贪吃蛇"
      />
    );

    expect(screen.getByText('继续上次复刻，还是重新来一轮？')).toBeTruthy();
    expect(screen.getByText('赛博贪吃蛇')).toBeTruthy();
    expect(screen.getByText('上次停在')).toBeTruthy();
    expect(screen.getByText('最近更新')).toBeTruthy();
    expect(screen.getAllByText('继续上次复刻').length).toBeGreaterThan(0);
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

    expect(screen.getByText('最近更新')).toBeTruthy();
    expect(screen.getByText('最近整理过')).toBeTruthy();
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
