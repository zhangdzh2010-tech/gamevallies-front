/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import { CreationSessionPanel } from './CreationSessionPanel';

export function CreationSessionScene({
  className = '',
  shell = null,
  panel = null,
}) {
  const hasIntro = Boolean(
    shell
    && (shell.eyebrow || shell.title || shell.subtitle)
  );

  return (
    <View className={`creation-session-scene ${className}`.trim()}>
      {hasIntro ? (
        <View className="creation-session-scene__intro">
          <View className="creation-session-scene__intro-copy">
            {shell?.eyebrow ? (
              <Text className="creation-session-scene__eyebrow">{shell.eyebrow}</Text>
            ) : null}
            {shell?.title ? (
              <Text className="creation-session-scene__title">{shell.title}</Text>
            ) : null}
            {shell?.subtitle ? (
              <Text className="creation-session-scene__subtitle">{shell.subtitle}</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      <CreationSessionPanel {...(panel || {})} />
    </View>
  );
}

export default CreationSessionScene;
