import React from 'react';
import { View, Text } from '@tarojs/components';
import { isH5Runtime } from '../../utils/runtime';
import './GenerationProgressPanel.scss';

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

export function GenerationProgressPanel({
  stages = [],
  currentIndex = 0,
  progressPct = 0,
  stageLabel = '',
  progressMessage = '',
  statusLabel = '',
  modeLabel = 'AI 正在创作',
  coreLabel = 'AI 创作',
}) {
  const isH5 = isH5Runtime();
  const safeStages = Array.isArray(stages) && stages.length ? stages : [];
  const stageCount = safeStages.length || 1;
  const activeIndex = clampIndex(currentIndex, Math.max(stageCount - 1, 0));
  const pct = clampPercent(progressPct);
  const activeStageLabel = stageLabel || safeStages[activeIndex]?.label || '正在处理';
  const activeStatusLabel = statusLabel || 'AI 正在做';
  const orbitRadiusX = isH5 ? (stageCount >= 8 ? 108 : 116) : (stageCount >= 8 ? 144 : 154);
  const orbitRadiusY = isH5 ? (stageCount >= 8 ? 82 : 96) : (stageCount >= 8 ? 110 : 122);

  return (
    <View className={`generation-progress-panel${isH5 ? ' generation-progress-panel--h5' : ''}`}>
      <View className="generation-progress-panel__grid" />

      <View className="generation-progress-panel__header">
        <Text className="generation-progress-panel__eyebrow">{modeLabel}</Text>
        <View className="generation-progress-panel__status-chip">
          <Text className="generation-progress-panel__status-text">{activeStatusLabel}</Text>
        </View>
      </View>

      <View className="generation-progress-panel__visual">
        <View className="generation-progress-panel__halo generation-progress-panel__halo--outer" />
        <View className="generation-progress-panel__halo generation-progress-panel__halo--inner" />
        <View className="generation-progress-panel__ring generation-progress-panel__ring--outer" />
        <View className="generation-progress-panel__ring generation-progress-panel__ring--inner" />
        <View className="generation-progress-panel__scan">
          <View className="generation-progress-panel__beam" />
          <View className="generation-progress-panel__beam-head" />
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
              className={`generation-progress-panel__node generation-progress-panel__node--${state}`}
              style={{
                marginLeft: `${offsetX}px`,
                marginTop: `${offsetY}px`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <View className="generation-progress-panel__node-core">
                <Text className="generation-progress-panel__node-text">{formatStageOrder(index)}</Text>
              </View>
            </View>
          );
        })}

        <View className="generation-progress-panel__core">
          <Text className="generation-progress-panel__core-eyebrow">{coreLabel}</Text>
          <Text className="generation-progress-panel__core-pct">{pct}%</Text>
          <Text className="generation-progress-panel__core-stage">{activeStageLabel}</Text>
          <Text className="generation-progress-panel__core-message">
            {progressMessage || '正在做，请等一下'}
          </Text>
        </View>
      </View>

      <View className="generation-progress-panel__metrics">
        <View className="generation-progress-panel__metric">
          <Text className="generation-progress-panel__metric-label">当前步骤</Text>
          <Text className="generation-progress-panel__metric-value">{`${activeIndex + 1}/${stageCount}`}</Text>
        </View>
        <View className="generation-progress-panel__metric">
          <Text className="generation-progress-panel__metric-label">完成度</Text>
          <Text className="generation-progress-panel__metric-value">{`${pct}%`}</Text>
        </View>
      </View>
    </View>
  );
}

export default GenerationProgressPanel;
