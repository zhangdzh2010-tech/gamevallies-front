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

function extractActionableQuestion(content) {
  if (typeof content !== 'string') {
    return '';
  }

  const normalized = content
    .replace(/\s+/g, ' ')
    .replace(/。(?=[A-Za-z])/g, '。 ')
    .trim();

  if (!normalized) {
    return '';
  }

  const explicitQuestion = normalized.match(
    /(?:确认一个点|还想确认(?:一下|一个点)?|想确认(?:一下|一个点)?|请确认(?:一下)?)[：:]\s*(.+)$/u
  );

  if (explicitQuestion?.[1]) {
    return explicitQuestion[1].trim();
  }

  const sentences = normalized
    .split(/(?<=[。！？?])/u)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const questionSentence = [...sentences].reverse().find((segment) => (
    /[？?]/.test(segment)
    || /(什么|怎么|怎样|如何|是否|哪|哪个|多少|优先|还是|保留什么|改变什么)/.test(segment)
  ));

  return questionSentence || normalized;
}

function buildThreadItems(session) {
  const messages = Array.isArray(session?.messages) ? session.messages.slice(-6) : [];
  const items = messages
    .filter((message) => message?.role === 'user' && message?.content)
    .map((message) => ({
      key: message.id || `${message.role}-${message.createdAt || message.content}`,
      role: 'user',
      content: message.content,
      description: '',
      current: false,
    }));

  const questionContent = extractActionableQuestion(session?.currentQuestion?.content || '');
  if (questionContent) {
    items.push({
      key: `question-${session?.currentQuestion?.id || questionContent}`,
      role: 'assistant',
      content: questionContent,
      description: '',
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
