/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import './CreationSession.scss';

export function CreationStateCard({
  eyebrow = '',
  title = '',
  description = '',
  hint = '',
  tone = 'default',
  centered = false,
  loading = false,
  items = [],
  children = null,
}) {
  return (
    <View className={`creation-session-card creation-state-card creation-state-card--${tone}${centered ? ' creation-state-card--centered' : ''}`}>
      {eyebrow ? <Text className="creation-state-card__eyebrow">{eyebrow}</Text> : null}
      {title ? <Text className="creation-state-card__title">{title}</Text> : null}
      {description ? <Text className="creation-state-card__description">{description}</Text> : null}

      {loading ? (
        <View className="creation-state-card__spinner" aria-hidden="true">
          <View className="creation-state-card__spinner-dot" />
          <View className="creation-state-card__spinner-dot" />
          <View className="creation-state-card__spinner-dot" />
        </View>
      ) : null}

      {items.length ? (
        <View className="creation-state-card__list">
          {items.map((item) => (
            <View key={item.label} className="creation-state-card__list-item">
              <Text className="creation-state-card__list-label">{item.label}</Text>
              <Text className="creation-state-card__list-value">{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {children ? <View className="creation-state-card__body">{children}</View> : null}
      {hint ? <Text className="creation-state-card__hint">{hint}</Text> : null}
    </View>
  );
}

export default CreationStateCard;
