/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text, Textarea } from '@tarojs/components';
import './CreationSession.scss';

export function CreationAnswerComposer({
  value = '',
  placeholder = '直接写下你想补充、修正或强调的内容...',
  onChange,
  suggestions = [],
  onSuggestionSelect,
  disabled = false,
  maxLength = 1000,
}) {
  const normalizedSuggestions = suggestions.map((item) => (
    typeof item === 'string'
      ? { label: item, value: item }
      : item
  ));

  return (
    <View className="creation-session-card">
      <View className="creation-session-card__header">
        <View>
          <Text className="creation-session-card__title">回答输入</Text>
          <Text className="creation-session-card__hint">先用自然语言说清楚想法，系统会继续帮你整理成清晰方案。</Text>
        </View>
      </View>

      <View className="creation-answer-composer">
        <Textarea
          className="creation-answer-composer__textarea"
          placeholder={placeholder}
          placeholderStyle="color: #67627d"
          value={value}
          onInput={onChange}
          autoHeight
          disabled={disabled}
          maxlength={maxLength}
        />

        {normalizedSuggestions.length ? (
          <View className="creation-answer-composer__suggestions">
            {normalizedSuggestions.map((item) => (
              <View
                key={item.value}
                className={`creation-answer-composer__chip${onSuggestionSelect && !disabled ? ' creation-answer-composer__chip--interactive' : ''}`}
                onClick={onSuggestionSelect && !disabled ? () => onSuggestionSelect(item.value) : undefined}
              >
                <Text className="creation-answer-composer__chip-text">{item.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default CreationAnswerComposer;
