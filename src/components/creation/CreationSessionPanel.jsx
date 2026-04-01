/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import {
  canGenerateCreationSession,
  getCreationSessionNotice,
  isCreationSessionQuestioning,
} from './sessionState';
import { CreationSessionStatusNotice } from './CreationSessionStatusNotice';
import { CreationAnswerComposer } from './CreationAnswerComposer';
import { CreationSessionActions } from './CreationSessionActions';
import './CreationSession.scss';

const DRAFT_LABELS = {
  title: '方向',
  summary: '理解',
  concept: '玩法',
  coreMechanic: '玩法',
  core_mechanic: '玩法',
  interaction: '交互',
  objective: '目标',
  winCondition: '目标',
  win_condition: '目标',
  pacing: '节奏',
  difficulty: '难度',
  theme: '主题',
  visualDirection: '风格',
  signatureMoment: '亮点',
};

function toReadableLines(value) {
  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    return [value.trim()].filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => {
        if (item == null || item === '') {
          return '';
        }

        if (typeof item === 'object') {
          return '';
        }

        const label = DRAFT_LABELS[key] || key;
        return `${label}：${String(item).trim()}`;
      })
      .filter(Boolean);
  }

  return [];
}

function getSummaryLines(session) {
  const planLines = toReadableLines(session?.planDraft);
  const promptLine = typeof session?.prompt === 'string' ? session.prompt.trim() : '';

  return [...planLines, promptLine]
    .filter(Boolean)
    .filter((line, index, arr) => arr.indexOf(line) === index)
    .slice(0, 3);
}

function buildThreadItems(session) {
  const messages = Array.isArray(session?.messages) ? session.messages.slice(-6) : [];
  const items = messages
    .filter((message) => message?.content)
    .map((message) => ({
      key: message.id || `${message.role}-${message.createdAt || message.content}`,
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content,
      description: '',
      current: false,
    }));

  const questionContent = session?.currentQuestion?.content || '';
  const hasSameAssistantMessage = items.some(
    (item) => item.role !== 'user' && item.content === questionContent,
  );

  if (questionContent && !hasSameAssistantMessage) {
    items.push({
      key: `question-${session?.currentQuestion?.id || questionContent}`,
      role: 'assistant',
      content: questionContent,
      description: session?.currentQuestion?.description || '',
      current: true,
    });
  }

  return items;
}

function decorateActions(actions, { allowQuestionAnswer, allowDirectGenerate, submitting, hasQuestion }) {
  return actions.map((action) => {
    if (action.key === 'submit') {
      return {
        ...action,
        tone: allowDirectGenerate ? 'ghost' : 'primary',
        disabled: Boolean(action.disabled) || submitting || !allowQuestionAnswer,
      };
    }

    if (action.key === 'skip') {
      return {
        ...action,
        disabled: Boolean(action.disabled) || submitting || !allowQuestionAnswer || !hasQuestion,
      };
    }

    if (action.key === 'generate') {
      return {
        ...action,
        tone: allowDirectGenerate ? 'primary' : 'ghost',
        disabled: Boolean(action.disabled) || submitting || !allowDirectGenerate,
      };
    }

    return {
      ...action,
      disabled: Boolean(action.disabled) || submitting,
    };
  });
}

export function CreationSessionPanel({
  session = null,
  entryMode = 'create',
  answerValue = '',
  onAnswerChange,
  answerPlaceholder = '',
  answerSuggestions = [],
  submitting = false,
  actions = [],
  errorMessage = '',
  errorClassName = '',
}) {
  if (!session) {
    return null;
  }

  const sessionStatus = session?.status || '';
  const isInitializing = sessionStatus === 'initializing';
  const allowQuestionAnswer = isCreationSessionQuestioning(sessionStatus);
  const allowDirectGenerate = canGenerateCreationSession(sessionStatus);
  const sessionNotice = getCreationSessionNotice(sessionStatus, entryMode, session);
  const summaryLines = getSummaryLines(session);
  const threadItems = buildThreadItems(session);
  const resolvedErrorClassName = errorClassName || 'creation-session-error';
  const decoratedActions = decorateActions(actions, {
    allowQuestionAnswer,
    allowDirectGenerate,
    submitting,
    hasQuestion: Boolean(session?.currentQuestion),
  });

  if (isInitializing) {
    return (
      <View className="creation-session-flow">
        <CreationSessionStatusNotice
          status={sessionStatus}
          notice={sessionNotice}
        />

        <View className="creation-session-loading">
          <View className="creation-session-loading__dots">
            <View className="creation-session-loading__dot" />
            <View className="creation-session-loading__dot" />
            <View className="creation-session-loading__dot" />
          </View>
          <Text className="creation-session-loading__title">正在整理这一轮方向</Text>
          {session?.prompt ? (
            <Text className="creation-session-loading__text">“{session.prompt}”</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View className="creation-session-flow">
      {summaryLines.length ? (
        <View className="creation-session-summary">
          <Text className="creation-session-summary__label">当前理解</Text>
          {summaryLines.map((line) => (
            <Text key={line} className="creation-session-summary__line">{line}</Text>
          ))}
        </View>
      ) : null}

      <CreationSessionStatusNotice
        status={sessionStatus}
        notice={sessionNotice}
      />

      {threadItems.length ? (
        <View className="creation-session-thread">
          {threadItems.map((item) => (
            <View
              key={item.key}
              className={`creation-session-message creation-session-message--${item.role}${item.current ? ' creation-session-message--current' : ''}`}
            >
              <Text className="creation-session-message__content">{item.content}</Text>
              {item.description ? (
                <Text className="creation-session-message__description">{item.description}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {allowQuestionAnswer ? (
        <CreationAnswerComposer
          value={answerValue}
          onChange={onAnswerChange}
          placeholder={answerPlaceholder}
          suggestions={answerSuggestions}
          disabled={submitting}
        />
      ) : null}

      <CreationSessionActions actions={decoratedActions} />

      {errorMessage ? (
        <View className={resolvedErrorClassName}>
          <Text className={`${resolvedErrorClassName}__text`}>{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default CreationSessionPanel;
