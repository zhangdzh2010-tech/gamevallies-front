import React from 'react';
import { View, Text } from '@tarojs/components';
import './PipelineOrbit.scss';

function clampIndex(index, max) {
  if (!Number.isFinite(index)) {
    return 0;
  }

  return Math.max(0, Math.min(max, Math.round(index)));
}

function clampPercent(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function getNodeState(index, currentIndex) {
  if (index < currentIndex) {
    return 'done';
  }

  if (index === currentIndex) {
    return 'current';
  }

  return 'pending';
}

function formatStageOrder(index) {
  const order = index + 1;
  return order < 10 ? `0${order}` : String(order);
}

export function PipelineOrbit({
  stages = [],
  currentIndex = 0,
  progressPct = 0,
  title = '处理进度',
  stageLabel = '',
  progressMessage = '',
  statusLabel = '',
  modeLabel = '处理流程',
  coreLabel = 'AI 处理中',
}) {
  const safeStages = Array.isArray(stages) && stages.length ? stages : [];
  const activeIndex = clampIndex(currentIndex, Math.max(safeStages.length - 1, 0));
  const pct = clampPercent(progressPct);
  const activeStageLabel = stageLabel || safeStages[activeIndex]?.label || '处理中';
  const stageCount = safeStages.length || 1;
  const orbitRadiusX = stageCount >= 8 ? 134 : 142;
  const orbitRadiusY = stageCount >= 8 ? 102 : 116;

  return (
    <View className="pipeline-orbit-card">
      <View className="pipeline-orbit-card__grid" />
      <View className="pipeline-orbit-card__header">
        <View className="pipeline-orbit-card__label-group">
          <Text className="pipeline-orbit-card__eyebrow">{modeLabel}</Text>
          <Text className="pipeline-orbit-card__title">{title}</Text>
        </View>
        <View className="pipeline-orbit-card__status-chip">
          <Text className="pipeline-orbit-card__status-text">{statusLabel || '执行中'}</Text>
        </View>
      </View>

      <View className="pipeline-orbit-visual">
        <View className="pipeline-orbit-visual__halo pipeline-orbit-visual__halo--outer" />
        <View className="pipeline-orbit-visual__halo pipeline-orbit-visual__halo--inner" />
        <View className="pipeline-orbit-visual__ring pipeline-orbit-visual__ring--outer" />
        <View className="pipeline-orbit-visual__ring pipeline-orbit-visual__ring--inner" />
        <View className="pipeline-orbit-visual__scan">
          <View className="pipeline-orbit-visual__beam" />
          <View className="pipeline-orbit-visual__beam-head" />
        </View>

        {safeStages.map((stage, index) => {
          const angle = -90 + ((360 / stageCount) * index);
          const radians = (angle * Math.PI) / 180;
          const state = getNodeState(index, activeIndex);
          const offsetX = Math.cos(radians) * orbitRadiusX;
          const offsetY = Math.sin(radians) * orbitRadiusY;

          return (
            <View
              key={stage.key}
              className={`pipeline-orbit-node pipeline-orbit-node--${state}`}
              style={{
                marginLeft: `${offsetX}px`,
                marginTop: `${offsetY}px`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <View className="pipeline-orbit-node__inner">
                <View className="pipeline-orbit-node__core">
                  <Text className="pipeline-orbit-node__text">{formatStageOrder(index)}</Text>
                </View>
              </View>
            </View>
          );
        })}

        <View className="pipeline-orbit-core">
          <Text className="pipeline-orbit-core__eyebrow">{coreLabel}</Text>
          <Text className="pipeline-orbit-core__pct">{pct}%</Text>
          <Text className="pipeline-orbit-core__stage">{activeStageLabel}</Text>
          <Text className="pipeline-orbit-core__message">{progressMessage || '请稍候'}</Text>
        </View>
      </View>

      <View className="pipeline-orbit-card__metrics">
        <View className="pipeline-orbit-card__metric">
          <Text className="pipeline-orbit-card__metric-label">阶段</Text>
          <Text className="pipeline-orbit-card__metric-value">{`${activeIndex + 1}/${stageCount}`}</Text>
        </View>
        <View className="pipeline-orbit-card__metric">
          <Text className="pipeline-orbit-card__metric-label">进度</Text>
          <Text className="pipeline-orbit-card__metric-value">{`${pct}%`}</Text>
        </View>
        <View className="pipeline-orbit-card__metric">
          <Text className="pipeline-orbit-card__metric-label">状态</Text>
          <Text className="pipeline-orbit-card__metric-value">{statusLabel || '执行中'}</Text>
        </View>
      </View>

      <View className="pipeline-orbit-legend">
        {safeStages.map((stage, index) => {
          const state = getNodeState(index, activeIndex);
          return (
            <View
              key={stage.key}
              className={`pipeline-orbit-legend__item pipeline-orbit-legend__item--${state}`}
            >
              <Text className="pipeline-orbit-legend__index">{formatStageOrder(index)}</Text>
              <Text className="pipeline-orbit-legend__label">{stage.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default PipelineOrbit;
