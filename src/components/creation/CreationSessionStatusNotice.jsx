/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import './CreationSession.scss';

export function CreationSessionStatusNotice({
  status = '',
  notice = '',
}) {
  if (!notice) {
    return null;
  }

  return (
    <View className={`creation-session-notice creation-session-notice--${status || 'default'}`}>
      <Text className="creation-session-notice__text">{notice}</Text>
    </View>
  );
}

export default CreationSessionStatusNotice;
