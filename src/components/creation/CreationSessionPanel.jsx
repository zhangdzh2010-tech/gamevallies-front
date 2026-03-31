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
  const allowQuestionAnswer = isCreationSessionQuestioning(sessionStatus);
  const allowDirectGenerate = canGenerateCreationSession(sessionStatus);
  const sessionNotice = getCreationSessionNotice(sessionStatus, entryMode);
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

      <CreationPlanDraftCard
        draft={session?.planDraft}
        hint={planHint}
      />
      <CreationConfidenceCard
        confidenceSummary={session?.confidenceSummary}
        questionStrategy={session?.questionStrategy}
      />
      <CreationSessionStatusNotice
        status={sessionStatus}
        entryMode={entryMode}
        notice={sessionNotice}
      />
      <CreationConversationList messages={session?.messages || []} />
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
