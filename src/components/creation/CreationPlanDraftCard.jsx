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
  title = '方案草稿',
  hint = '这是系统当前整理出的理解，你可以继续补充或纠偏。',
  draft,
  emptyText = '系统还在整理本轮方案草稿。',
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
