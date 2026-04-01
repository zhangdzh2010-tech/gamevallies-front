import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import './ChatInterface.scss';

export default function ChatInterface({
  messages = [],
  isGenerating = false,
  emptyTitle = '从一句话开始',
  emptyHint = '先发给 AI 一个想法，它会继续追问。',
}) {
  const [streamedMessages, setStreamedMessages] = useState(messages);
  const latestAnimatedKeyRef = useRef('');

  useEffect(() => {
    const latestAssistantIndex = [...messages]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find((item) => item.message?.role === 'assistant')?.index ?? -1;

    if (latestAssistantIndex === -1) {
      setStreamedMessages(messages);
      latestAnimatedKeyRef.current = '';
      return undefined;
    }

    const latestAssistantMessage = messages[latestAssistantIndex];
    const animationKey = `${latestAssistantMessage.id || latestAssistantIndex}:${latestAssistantMessage.content || ''}`;

    if (!latestAssistantMessage.content || latestAnimatedKeyRef.current === animationKey) {
      setStreamedMessages(messages);
      return undefined;
    }

    latestAnimatedKeyRef.current = animationKey;

    let frame = 0;
    const fullContent = latestAssistantMessage.content;
    const step = Math.max(1, Math.ceil(fullContent.length / 42));

    setStreamedMessages(messages.map((message, index) => (
      index === latestAssistantIndex
        ? { ...message, content: '' }
        : message
    )));

    const timer = setInterval(() => {
      frame += step;
      const nextContent = fullContent.slice(0, frame);

      setStreamedMessages(messages.map((message, index) => (
        index === latestAssistantIndex
          ? { ...message, content: nextContent }
          : message
      )));

      if (frame >= fullContent.length) {
        clearInterval(timer);
      }
    }, 18);

    return () => clearInterval(timer);
  }, [messages]);

  return (
    <View className="chat-interface">
      {streamedMessages.length ? (
        streamedMessages.map((msg) => {
          const type = msg.role === 'user' ? 'user' : 'ai';

          return (
            <View
              key={msg.id}
              className={`message-bubble ${type}`}
            >
              {type === 'ai' ? (
                <View className="ai-avatar">
                  <Text className="avatar-emoji">AI</Text>
                </View>
              ) : null}
              <View className={`bubble-content ${type}`}>
                <Text className="message-text">{msg.content}</Text>
              </View>
            </View>
          );
        })
      ) : (
        <View className="chat-empty-state">
          <Text className="chat-empty-state__title">{emptyTitle}</Text>
          <Text className="chat-empty-state__hint">{emptyHint}</Text>
        </View>
      )}

      {isGenerating ? (
        <View className="generating-indicator">
          <View className="ai-avatar">
            <Text className="avatar-emoji">AI</Text>
          </View>
          <View className="spinner">
            <View className="dot dot-1" />
            <View className="dot dot-2" />
            <View className="dot dot-3" />
          </View>
        </View>
      ) : null}
    </View>
  );
}
