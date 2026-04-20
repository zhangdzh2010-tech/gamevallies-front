/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import './CreationSession.scss';

function formatStructuredValue(value) {
  if (value == null || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}

export function CreationPlanDraftCard({
  title = '当前方向',
  hint = '这是 AI 目前整理出的方向，你可以继续补充或改。',
  draft,
  emptyText = 'AI 还在整理，稍等一下。',
}) {
  const draftText = formatStructuredValue(draft);

  return (
    <View className="creation-session-card">
      <View className="creation-session-card__header">
        <View>
          <Text className="creation-session-card__title">{title}</Text>
          <Text className="creation-session-card__hint">{hint}</Text>
        </View>
      </View>

      <View className="creation-session-card__body">
        {draftText ? (
          <Text className="creation-session-card__text">{draftText}</Text>
        ) : (
          <Text className="creation-session-card__empty">{emptyText}</Text>
        )}
      </View>
    </View>
  );
}

export default CreationPlanDraftCard;
