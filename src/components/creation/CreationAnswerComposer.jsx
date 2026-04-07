/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text, Textarea } from '@tarojs/components';
import './CreationSession.scss';

const INNER_TEXTAREA_STYLE = {
  background: 'transparent',
  color: '#f3f1ff',
  border: '0',
  outline: 'none',
  boxShadow: 'none',
  resize: 'none',
};

const IS_H5 = process.env.TARO_ENV === 'h5';

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

  const handleNativeInput = (event) => {
    onChange?.({
      detail: {
        value: event.currentTarget.value,
      },
    });
  };

  return (
    <View className="creation-session-card">
      <View className="creation-session-card__header">
        <View>
          <Text className="creation-session-card__title">你的想法</Text>
          <Text className="creation-session-card__hint">直接写玩法、目标，或者你想要的体验。</Text>
        </View>
      </View>

      <View className="creation-answer-composer">
        {IS_H5 ? (
          <textarea
            className="creation-answer-composer__textarea creation-answer-composer__textarea--native"
            placeholder={placeholder}
            value={value}
            onInput={handleNativeInput}
            disabled={disabled}
            maxLength={maxLength}
            rows={4}
            style={INNER_TEXTAREA_STYLE}
          />
        ) : (
          <Textarea
            className="creation-answer-composer__textarea"
            placeholder={placeholder}
            placeholderStyle="color: #67627d"
            value={value}
            onInput={onChange}
            autoHeight
            disabled={disabled}
            maxlength={maxLength}
            nativeProps={{
              style: INNER_TEXTAREA_STYLE,
            }}
          />
        )}

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
