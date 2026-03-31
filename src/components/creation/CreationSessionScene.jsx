/* eslint-disable react/prop-types */
import React from 'react';
import { View } from '@tarojs/components';
import { CreationSessionShell } from './CreationSessionShell';
import { CreationSessionPanel } from './CreationSessionPanel';

export function CreationSessionScene({
  layout = 'panel',
  className = '',
  shell = null,
  panel = null,
}) {
  const panelNode = <CreationSessionPanel {...(panel || {})} />;

  if (layout === 'shell') {
    return (
      <CreationSessionShell
        {...(shell || {})}
        sections={[
          {
            key: 'session-panel',
            node: panelNode,
          },
        ]}
      />
    );
  }

  return (
    <View className={className}>
      {panelNode}
    </View>
  );
}

export default CreationSessionScene;
