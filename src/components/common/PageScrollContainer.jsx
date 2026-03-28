import React from 'react';
import { ScrollView, View, Text } from '@tarojs/components';
import { isH5Runtime } from '../../utils/runtime';

export function PageScrollContainer({
  children,
  className = '',
  style,
  h5Style,
  refresherEnabled = false,
  refresherTriggered = false,
  onRefresherRefresh,
  ...scrollProps
}) {
  if (isH5Runtime()) {
    const mergedStyle = h5Style
      ? { ...(style || {}), ...h5Style }
      : style;
    const refreshable = refresherEnabled && typeof onRefresherRefresh === 'function';
    const h5ClassName = refreshable
      ? `${className} page-scroll-container--h5-refreshable`.trim()
      : className;
    const handleRefreshClick = () => {
      if (!refreshable || refresherTriggered) {
        return;
      }
      onRefresherRefresh();
    };

    return (
      <View className={h5ClassName} style={mergedStyle}>
        {refreshable ? (
          <View className="page-scroll-container__refresh-wrap">
            <View
              className={`page-scroll-container__refresh-btn${refresherTriggered ? ' is-refreshing' : ''}`}
              onClick={handleRefreshClick}
            >
              <View className="page-scroll-container__refresh-icon" />
              <Text className="page-scroll-container__refresh-text">
                {refresherTriggered ? '刷新中...' : '刷新内容'}
              </Text>
            </View>
          </View>
        ) : null}
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      className={className}
      style={style}
      refresherEnabled={refresherEnabled}
      refresherTriggered={refresherTriggered}
      onRefresherRefresh={onRefresherRefresh}
      {...scrollProps}
    >
      {children}
    </ScrollView>
  );
}
