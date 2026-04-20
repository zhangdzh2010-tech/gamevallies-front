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
  title = '本轮操作',
  hint = '',
}) {
  return (
    <View className="creation-session-card">
      <View className="creation-session-card__header">
        <View>
          <Text className="creation-session-card__title">{title}</Text>
          {hint ? <Text className="creation-session-card__hint">{hint}</Text> : null}
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
