import React, { useRef } from 'react';
import { ScrollView, View } from '@tarojs/components';
import { isH5Runtime } from '../../utils/runtime';
import { getH5PageScrollContainer } from '../../utils/h5Scroll';

const H5_PULL_REFRESH_THRESHOLD = 72;
const H5_PULL_REFRESH_TOP_TOLERANCE = 4;
const H5_PULL_REFRESH_INTENT_DELTA = 8;

function getTouchClientPoint(event) {
  const point = event?.touches?.[0] || event?.changedTouches?.[0];

  return {
    x: Number(point?.clientX) || 0,
    y: Number(point?.clientY) || 0,
  };
}

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
  const pullRefreshStateRef = useRef({
    active: false,
    distance: 0,
    startX: 0,
    startY: 0,
    vertical: false,
  });

  const resetPullRefreshState = () => {
    pullRefreshStateRef.current = {
      active: false,
      distance: 0,
      startX: 0,
      startY: 0,
      vertical: false,
    };
  };

  if (isH5Runtime()) {
    const mergedStyle = h5Style
      ? { ...(style || {}), ...h5Style }
      : style;
    const refreshable = refresherEnabled && typeof onRefresherRefresh === 'function';
    const h5ClassName = refreshable
      ? `${className} page-scroll-container--h5-refreshable`.trim()
      : className;

    const handleTouchStart = (event) => {
      if (!refreshable || refresherTriggered) {
        resetPullRefreshState();
        return;
      }

      const scrollContainer = getH5PageScrollContainer();
      const scrollTop = Number(scrollContainer?.scrollTop) || 0;

      if (scrollTop > H5_PULL_REFRESH_TOP_TOLERANCE) {
        resetPullRefreshState();
        return;
      }

      const { x, y } = getTouchClientPoint(event);
      pullRefreshStateRef.current = {
        active: true,
        distance: 0,
        startX: x,
        startY: y,
        vertical: false,
      };
    };

    const handleTouchMove = (event) => {
      const state = pullRefreshStateRef.current;

      if (!state.active || refresherTriggered) {
        return;
      }

      const { x, y } = getTouchClientPoint(event);
      const deltaX = x - state.startX;
      const deltaY = y - state.startY;

      if (!state.vertical) {
        if (Math.abs(deltaX) < H5_PULL_REFRESH_INTENT_DELTA && Math.abs(deltaY) < H5_PULL_REFRESH_INTENT_DELTA) {
          return;
        }

        if (Math.abs(deltaY) <= Math.abs(deltaX) || deltaY <= 0) {
          resetPullRefreshState();
          return;
        }

        state.vertical = true;
      }

      state.distance = Math.max(deltaY, 0);
    };

    const handleTouchEnd = () => {
      const state = pullRefreshStateRef.current;
      const shouldRefresh = state.active
        && state.vertical
        && state.distance >= H5_PULL_REFRESH_THRESHOLD
        && !refresherTriggered;

      resetPullRefreshState();

      if (shouldRefresh) {
        onRefresherRefresh();
      }
    };

    return (
      <View
        className={h5ClassName}
        style={mergedStyle}
        onTouchStart={refreshable ? handleTouchStart : undefined}
        onTouchMove={refreshable ? handleTouchMove : undefined}
        onTouchEnd={refreshable ? handleTouchEnd : undefined}
        onTouchCancel={refreshable ? handleTouchEnd : undefined}
      >
        {refreshable && refresherTriggered ? (
          <View className="page-scroll-container__refresh-status">
            <View className="page-scroll-container__refresh-indicator">
              <View className="page-scroll-container__refresh-icon" />
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
