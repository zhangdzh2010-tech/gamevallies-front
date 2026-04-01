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

export function CreationSessionActions({ actions = [] }) {
  if (!actions.length) {
    return null;
  }

  return (
    <View className={`creation-session-actions creation-session-actions--count-${actions.length || 0}`}>
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
  );
}

export default CreationSessionActions;
