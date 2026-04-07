/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import './CreationSession.scss';

export function CreationReferenceCard({
  eyebrow = '',
  title = '',
  badge = '',
  description = '',
  preview = null,
  metadata = [],
  metrics = [],
  children = null,
}) {
  return (
    <View className="creation-session-card creation-reference-card">
      <View className="creation-reference-card__top">
        {preview ? <View className="creation-reference-card__preview">{preview}</View> : null}

        <View className="creation-reference-card__copy">
          {eyebrow ? <Text className="creation-reference-card__eyebrow">{eyebrow}</Text> : null}
          {title ? <Text className="creation-reference-card__title">{title}</Text> : null}
          {badge ? (
            <View className="creation-reference-card__badge">
              <Text className="creation-reference-card__badge-text">{badge}</Text>
            </View>
          ) : null}
          {description ? <Text className="creation-reference-card__description">{description}</Text> : null}
        </View>
      </View>

      {metadata.length ? (
        <View className="creation-reference-card__meta-grid">
          {metadata.map((item) => (
            <View key={item.label} className="creation-reference-card__meta-item">
              <Text className="creation-reference-card__meta-label">{item.label}</Text>
              <Text className="creation-reference-card__meta-value">{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {metrics.length ? (
        <View className="creation-reference-card__metric-grid">
          {metrics.map((item) => (
            <View key={item.label} className="creation-reference-card__metric-item">
              <Text className="creation-reference-card__metric-value">{item.value}</Text>
              <Text className="creation-reference-card__metric-label">{item.label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {children ? <View className="creation-reference-card__footer">{children}</View> : null}
    </View>
  );
}

export default CreationReferenceCard;
