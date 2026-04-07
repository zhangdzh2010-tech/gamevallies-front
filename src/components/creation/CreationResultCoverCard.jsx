/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import './CreationSession.scss';

export function CreationResultCoverCard({
  badge = '',
  title = '',
  description = '',
  coverUrl = '',
  actionLabel = '试玩游戏',
  onAction,
}) {
  const mediaStyle = coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined;

  return (
    <View className="creation-session-card creation-result-cover-card">
      <View className="creation-result-cover-card__media" style={mediaStyle} />
      <View className="creation-result-cover-card__overlay" />
      <View className="creation-result-cover-card__content">
        <View className="creation-result-cover-card__badge-row">
          {badge ? (
            <View className="creation-result-cover-card__badge">
              <Text className="creation-result-cover-card__badge-text">{badge}</Text>
            </View>
          ) : null}
        </View>

        <View className="creation-result-cover-card__body">
          {title ? <Text className="creation-result-cover-card__title">{title}</Text> : null}
          {description ? <Text className="creation-result-cover-card__description">{description}</Text> : null}

          <View className="creation-result-cover-card__action" onClick={onAction}>
            <Text className="creation-result-cover-card__action-text">{actionLabel}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default CreationResultCoverCard;
