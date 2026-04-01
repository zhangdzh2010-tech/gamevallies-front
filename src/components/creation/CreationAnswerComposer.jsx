/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text, Textarea } from '@tarojs/components';
import './CreationSession.scss';

function emitValue(onChange, nextValue) {
  if (!onChange) {
    return;
  }

  onChange({
    detail: { value: nextValue },
    target: { value: nextValue },
  });
}

export function CreationAnswerComposer({
  value = '',
  placeholder = '继续补充你想确认的内容…',
  onChange,
  suggestions = [],
  disabled = false,
}) {
  return (
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
            <View
              key={item}
              className="creation-answer-composer__chip"
              onClick={disabled ? undefined : () => emitValue(onChange, item)}
            >
              <Text className="creation-answer-composer__chip-text">{item}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default CreationAnswerComposer;
