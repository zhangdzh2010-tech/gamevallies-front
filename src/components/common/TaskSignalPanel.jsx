import React from 'react';
import { View, Text } from '@tarojs/components';
import './TaskSignalPanel.scss';

export function TaskSignalPanel({
  eyebrow = '当前状态',
  title = '本轮信息',
  statusLabel = 'AI 正在做',
  description = '',
  items = [],
}) {
  const safeItems = Array.isArray(items) ? items.filter((item) => item?.label && item?.value) : [];
  const hasItems = safeItems.length > 0;

  return (
    <View className="task-signal-panel">
      <View className="task-signal-panel__grid" />
      <View className="task-signal-panel__scan" />

      <View className="task-signal-panel__header">
        <View className="task-signal-panel__copy">
          <Text className="task-signal-panel__eyebrow">{eyebrow}</Text>
          <Text className="task-signal-panel__title">{title}</Text>
          {description ? (
            <Text className="task-signal-panel__desc">{description}</Text>
          ) : null}
        </View>

        <View className="task-signal-panel__status">
          <Text className="task-signal-panel__status-text">{statusLabel}</Text>
        </View>
      </View>

      {hasItems ? (
        <>
          <View className="task-signal-panel__dots">
            <View className="task-signal-panel__dot" />
            <View className="task-signal-panel__dot" />
            <View className="task-signal-panel__dot" />
          </View>

          <View className="task-signal-panel__items">
            {safeItems.map((item) => (
              <View key={item.label} className="task-signal-panel__item">
                <Text className="task-signal-panel__label">{item.label}</Text>
                <Text className="task-signal-panel__value">{item.value}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

export default TaskSignalPanel;
