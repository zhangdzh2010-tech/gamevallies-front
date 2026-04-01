/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import './CreationSession.scss';

function toMetaItems(confidenceSummary, questionStrategy) {
  const items = [];

  if (confidenceSummary != null && confidenceSummary !== '') {
    items.push({
      key: 'confidence',
      label: '理解情况',
      value: typeof confidenceSummary === 'string'
        ? confidenceSummary
        : JSON.stringify(confidenceSummary, null, 2),
    });
  }

  if (questionStrategy != null && questionStrategy !== '') {
    items.push({
      key: 'strategy',
      label: '本轮追问原因',
      value: typeof questionStrategy === 'string'
        ? questionStrategy
        : JSON.stringify(questionStrategy, null, 2),
    });
  }

  return items;
}

export function CreationConfidenceCard({
  title = '理解与追问',
  hint = '帮助用户理解系统目前已经掌握了什么，以及为什么继续问。',
  confidenceSummary,
  questionStrategy,
  emptyText = '当前还没有可展示的理解摘要。',
}) {
  const items = toMetaItems(confidenceSummary, questionStrategy);

  return (
    <View className="creation-session-card">
      <View className="creation-session-card__header">
        <View>
          <Text className="creation-session-card__title">{title}</Text>
          <Text className="creation-session-card__hint">{hint}</Text>
        </View>
      </View>

      <View className="creation-session-card__body">
        {items.length ? (
          <View className="creation-session-meta-list">
            {items.map((item) => (
              <View key={item.key} className="creation-session-meta-item">
                <Text className="creation-session-meta-item__label">{item.label}</Text>
                <Text className="creation-session-meta-item__value">{item.value}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="creation-session-card__empty">{emptyText}</Text>
        )}
      </View>
    </View>
  );
}

export default CreationConfidenceCard;
