/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import { getCreationEntryErrorContent } from './entryState';

export function CreationEntryErrorCard({
  entryMode = 'create',
  error = '',
}) {
  const content = getCreationEntryErrorContent(entryMode, error);

  return (
    <View className="creation-entry-error-card">
      <Text className="creation-entry-error-card__eyebrow">需要重新试一次</Text>
      <Text className="creation-entry-error-card__title">{content.title}</Text>
      <Text className="creation-entry-error-card__text">{content.message}</Text>
      <Text className="creation-entry-error-card__hint">{content.hint}</Text>
    </View>
  );
}

export default CreationEntryErrorCard;
