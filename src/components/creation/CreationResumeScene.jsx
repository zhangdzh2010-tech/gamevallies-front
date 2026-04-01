/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import { formatDate, formatRelativeTime } from '../../utils/date';
import { CreationSessionActions } from './CreationSessionActions';

const RESUME_MODE_COPY = {
  create: {
    title: '继续上次创作',
    subtitle: '检测到你还有一轮没完成的创作。',
    continueLabel: '继续上次创作',
    restartLabel: '开始新的创作',
  },
  iterate: {
    title: '继续上次优化',
    subtitle: '这款作品还有一轮没完成的优化。',
    continueLabel: '继续上次优化',
    restartLabel: '开始新的优化',
  },
  fork: {
    title: '继续上次复刻',
    subtitle: '这款作品还有一轮没完成的新版本对话。',
    continueLabel: '继续上次复刻',
    restartLabel: '开始新的复刻',
  },
};

function formatResumeTime(value) {
  if (!value) {
    return '最近整理过';
  }

  const parsedDate = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsedDate.getTime())) {
    return '最近整理过';
  }

  return `${formatRelativeTime(parsedDate)} · ${formatDate(parsedDate, 'YYYY-MM-DD HH:mm')}`;
}

export function CreationResumeScene({
  entryMode = 'create',
  session = null,
  subjectTitle = '',
  onContinue,
  onRestart,
  submitting = false,
}) {
  const copy = RESUME_MODE_COPY[entryMode] || RESUME_MODE_COPY.create;
  const summaryTitle = subjectTitle || session?.title || '未命名内容';

  return (
    <View className="creation-resume-scene">
      <View className="creation-resume-scene__header">
        <View>
          <Text className="creation-resume-scene__title">{copy.title}</Text>
          <Text className="creation-resume-scene__subtitle">{copy.subtitle}</Text>
        </View>
      </View>

      <View className="creation-resume-scene__summary">
        <Text className="creation-resume-scene__subject">{summaryTitle}</Text>
        <Text className="creation-resume-scene__meta">最近更新 · {formatResumeTime(session?.updatedAt || session?.createdAt)}</Text>
        <Text className="creation-resume-scene__prompt">{session?.prompt || '继续这轮对话，或者结束它重新开始。'}</Text>
      </View>

      <CreationSessionActions
        actions={[
          {
            key: 'continue-existing-session',
            label: submitting ? '正在恢复...' : copy.continueLabel,
            tone: 'primary',
            disabled: submitting,
            onClick: onContinue,
          },
          {
            key: 'start-fresh-session',
            label: submitting ? '处理中...' : copy.restartLabel,
            tone: 'ghost',
            disabled: submitting,
            onClick: onRestart,
          },
        ]}
      />
    </View>
  );
}

export default CreationResumeScene;
