/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import './CreationSession.scss';

export function CreationQuestionCard({
  title = '当前问题',
  hint = '每次只问一个最值得确认的问题。',
  question,
  emptyText = '没有需要继续确认的问题，可以直接开始做了。',
}) {
  return (
    <View className="creation-session-card creation-question-card">
      <View className="creation-session-card__header">
        <View>
          <Text className="creation-session-card__title">{title}</Text>
          <Text className="creation-session-card__hint">{hint}</Text>
        </View>
        {question?.answerType ? (
          <View className="creation-question-card__badge">
            <Text className="creation-question-card__badge-text">{question.answerType}</Text>
          </View>
        ) : null}
      </View>

      <View className="creation-session-card__body">
        {question?.content ? (
          <>
            <Text className="creation-session-card__text">{question.content}</Text>
            {question.description ? (
              <Text className="creation-session-card__hint">{question.description}</Text>
            ) : null}
          </>
        ) : (
          <Text className="creation-session-card__empty">{emptyText}</Text>
        )}
      </View>
    </View>
  );
}

export default CreationQuestionCard;
