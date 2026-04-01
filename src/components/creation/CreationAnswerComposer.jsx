/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text, Textarea } from '@tarojs/components';
import './CreationSession.scss';

export function CreationAnswerComposer({
  value = '',
  placeholder = '直接写下你想补充或纠正的内容……',
  onChange,
  suggestions = [],
  disabled = false,
}) {
  return (
    <View className="creation-session-card">
      <View className="creation-session-card__header">
        <View>
          <Text className="creation-session-card__title">回答输入</Text>
          <Text className="creation-session-card__hint">第一版先使用文本输入，后续可扩展结构化回答。</Text>
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
          maxlength={1000}
        />

        {suggestions.length ? (
          <View className="creation-answer-composer__suggestions">
            {suggestions.map((item) => (
              <View key={item} className="creation-answer-composer__chip">
                <Text className="creation-answer-composer__chip-text">{item}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default CreationAnswerComposer;
