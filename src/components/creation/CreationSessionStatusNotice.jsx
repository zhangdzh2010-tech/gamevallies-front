/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import './CreationSession.scss';

export function CreationSessionStatusNotice({
  status = '',
  entryMode = 'create',
  notice = '',
}) {
  if (!notice) {
    return null;
  }

  const modeLabel = entryMode === 'fork'
    ? '复刻会话'
    : entryMode === 'iterate'
      ? '优化会话'
      : '创作会话';

  return (
    <View className={`creation-session-notice creation-session-notice--${status || 'default'}`}>
      <Text className="creation-session-notice__title">{modeLabel}提示</Text>
      <Text className="creation-session-notice__text">{notice}</Text>
    </View>
  );
}

export default CreationSessionStatusNotice;
