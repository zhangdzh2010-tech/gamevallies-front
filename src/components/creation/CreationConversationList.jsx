/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import './CreationSession.scss';

function getRoleLabel(role) {
  if (role === 'user') {
    return '你';
  }

  if (role === 'assistant') {
    return 'AI';
  }

  return '会话';
}

export function CreationConversationList({
  title = '最近几轮',
  hint = '留下最近几轮记录，方便你回看。',
  messages = [],
  emptyText = '还没有聊过，直接在下面写下你的想法就行。',
}) {
  return (
    <View className="creation-session-card">
      <View className="creation-session-card__header">
        <View>
          <Text className="creation-session-card__title">{title}</Text>
          <Text className="creation-session-card__hint">{hint}</Text>
        </View>
      </View>

      <View className="creation-session-card__body">
        {messages.length ? (
          <View className="creation-conversation-list">
            {messages.map((message) => (
              <View
                key={message.id || `${message.role}-${message.createdAt || message.content}`}
                className={`creation-conversation-item ${message.role === 'user' ? 'creation-conversation-item--user' : ''}`}
              >
                <Text className="creation-conversation-item__role">{getRoleLabel(message.role)}</Text>
                <Text className="creation-conversation-item__content">{message.content || ' '}</Text>
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

export default CreationConversationList;
