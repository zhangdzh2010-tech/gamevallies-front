/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import {
  canGenerateCreationSession,
  getCreationSessionNotice,
  isCreationSessionQuestioning,
} from './sessionState';
import { CreationPlanDraftCard } from './CreationPlanDraftCard';
import { CreationConfidenceCard } from './CreationConfidenceCard';
import { CreationSessionStatusNotice } from './CreationSessionStatusNotice';
import { CreationConversationList } from './CreationConversationList';
import { CreationQuestionCard } from './CreationQuestionCard';
import { CreationAnswerComposer } from './CreationAnswerComposer';
import { CreationSessionActions } from './CreationSessionActions';
import './CreationSession.scss';

export function CreationSessionPanel({
  session = null,
  entryMode = 'create',
  planHint = '',
  answerValue = '',
  onAnswerChange,
  answerPlaceholder = '',
  answerSuggestions = [],
  submitting = false,
  actions = [],
  errorMessage = '',
  errorClassName = '',
  headerTitle = '',
  headerHint = '',
}) {
  if (!session) {
    return null;
  }

  const sessionStatus = session?.status || '';
  const isInitializing = sessionStatus === 'initializing';
  const allowQuestionAnswer = isCreationSessionQuestioning(sessionStatus);
  const allowDirectGenerate = canGenerateCreationSession(sessionStatus);
  const sessionNotice = getCreationSessionNotice(sessionStatus, entryMode, session);
  const decoratedActions = actions.map((action) => {
    if (action.key === 'submit') {
      return {
        ...action,
        tone: allowDirectGenerate ? 'ghost' : action.tone,
        disabled: Boolean(action.disabled) || !allowQuestionAnswer,
      };
    }

    if (action.key === 'skip') {
      return {
        ...action,
        disabled: Boolean(action.disabled) || !allowQuestionAnswer || !session?.currentQuestion,
      };
    }

    if (action.key === 'generate') {
      return {
        ...action,
        tone: allowDirectGenerate ? 'primary' : action.tone,
        disabled: Boolean(action.disabled) || !allowDirectGenerate,
      };
    }

    return action;
  });

  return (
    <>
      {headerTitle ? <Text className="creation-session-panel__title">{headerTitle}</Text> : null}
      {headerHint ? <Text className="creation-session-panel__hint">{headerHint}</Text> : null}

      {isInitializing ? (
        <View className="creation-session-card creation-session-loading-card">
          <View className="creation-session-card__header">
            <View>
              <Text className="creation-session-card__title">正在整理第一轮问题</Text>
              <Text className="creation-session-card__hint">会先提炼你的意图，再决定是继续追问还是可以直接生成。</Text>
            </View>
          </View>

          <View className="creation-session-card__body">
            {session?.prompt ? (
              <Text className="creation-session-card__text">{`“${session.prompt}”`}</Text>
            ) : null}
            <View className="creation-session-loading-card__dots">
              <View className="creation-session-loading-card__dot" />
              <View className="creation-session-loading-card__dot" />
              <View className="creation-session-loading-card__dot" />
            </View>
          </View>
        </View>
      ) : null}

      {!isInitializing ? (
        <CreationPlanDraftCard
          draft={session?.planDraft}
          hint={planHint}
        />
      ) : null}
      {!isInitializing ? (
        <CreationConfidenceCard
          confidenceSummary={session?.confidenceSummary}
          questionStrategy={session?.questionStrategy}
        />
      ) : null}
      <CreationSessionStatusNotice
        status={sessionStatus}
        entryMode={entryMode}
        notice={sessionNotice}
      />
      {!isInitializing ? <CreationConversationList messages={session?.messages || []} /> : null}
      {allowQuestionAnswer ? (
        <>
          <CreationQuestionCard question={session?.currentQuestion} />
          <CreationAnswerComposer
            value={answerValue}
            onChange={onAnswerChange}
            placeholder={answerPlaceholder}
            suggestions={answerSuggestions}
            disabled={submitting}
          />
        </>
      ) : null}
      <CreationSessionActions actions={decoratedActions} />
      {errorMessage ? (
        <View className={errorClassName}>
          <Text className={`${errorClassName}__text`}>{errorMessage}</Text>
        </View>
      ) : null}
    </>
  );
}

export default CreationSessionPanel;
