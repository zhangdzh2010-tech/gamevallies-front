/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import './CreationSession.scss';

export function CreationSessionShell({
  eyebrow = '开始创作',
  title = '和 AI 一起把想法说清楚',
  subtitle = '先把方向聊明白，再决定继续补充还是直接进入生成。',
  statusLabel = '',
  statusValue = '',
  sections = [],
  footer = null,
  hideHero = false,
}) {
  const isCreateEntryHero = eyebrow === 'AI Game Atelier';
  const showHero = !hideHero && !isCreateEntryHero;
  const showStatus = showHero && Boolean(statusLabel || statusValue);

  return (
    <View className="creation-session-shell">
      {showHero ? (
        <View className="creation-session-shell__hero">
          <View className="creation-session-shell__hero-copy">
            <Text className="creation-session-shell__eyebrow">{eyebrow}</Text>
            <Text className="creation-session-shell__title">{title}</Text>
            <Text className="creation-session-shell__subtitle">{subtitle}</Text>
          </View>

          {showStatus ? (
            <View className="creation-session-shell__status">
              {statusLabel ? <Text className="creation-session-shell__status-label">{statusLabel}</Text> : null}
              {statusValue ? <Text className="creation-session-shell__status-value">{statusValue}</Text> : null}
            </View>
          ) : null}
        </View>
      ) : null}

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
