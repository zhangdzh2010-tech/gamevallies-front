/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import './CreationSession.scss';

export function CreationSessionShell({
  eyebrow = 'Dynamic Creation Session',
  title = '和 AI 一起把方案说清楚',
  subtitle = '先确认方案草案，再决定继续补充还是直接生成。',
  statusLabel = '会话状态',
  statusValue = '收集中',
  sections = [],
  footer = null,
}) {
  return (
    <View className="creation-session-shell">
      <View className="creation-session-shell__hero">
        <View className="creation-session-shell__hero-copy">
          <Text className="creation-session-shell__eyebrow">{eyebrow}</Text>
          <Text className="creation-session-shell__title">{title}</Text>
          <Text className="creation-session-shell__subtitle">{subtitle}</Text>
        </View>

        <View className="creation-session-shell__status">
          <Text className="creation-session-shell__status-label">{statusLabel}</Text>
          <Text className="creation-session-shell__status-value">{statusValue}</Text>
        </View>
      </View>

      {sections.map((section) => (
        <View key={section.key} className="creation-session-shell__section">
          {section.node}
        </View>
      ))}

      {footer}
    </View>
  );
}

export default CreationSessionShell;
