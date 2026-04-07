/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import './CreationSession.scss';

function getButtonClassName(action) {
  return [
    'creation-session-actions__button',
    action.tone === 'primary' ? 'creation-session-actions__button--primary' : '',
    action.tone === 'danger' ? 'creation-session-actions__button--danger' : '',
    action.tone === 'ghost' ? 'creation-session-actions__button--ghost' : '',
    action.disabled ? 'creation-session-actions__button--disabled' : '',
  ].filter(Boolean).join(' ');
}

export function CreationSessionActions({
  actions = [],
  title = '会话操作',
  hint = '统一承载回答、跳过、直接生成、重新开始等动作。',
}) {
  return (
    <View className="creation-session-card">
      <View className="creation-session-card__header">
        <View>
          <Text className="creation-session-card__title">{title}</Text>
          <Text className="creation-session-card__hint">{hint}</Text>
        </View>
      </View>

      <View className="creation-session-actions">
        {actions.map((action) => (
          <View
            key={action.key}
            className={getButtonClassName(action)}
            onClick={action.disabled ? undefined : action.onClick}
          >
            <Text className="creation-session-actions__button-text">{action.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default CreationSessionActions;
