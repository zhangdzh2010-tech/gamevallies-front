/* eslint-disable react/prop-types */
import React from 'react';
import { View, Text } from '@tarojs/components';
import { formatDate, formatRelativeTime } from '../../utils/date';
import { CreationResumePrompt } from './CreationResumePrompt';
import { CreationSessionShell } from './CreationSessionShell';

const RESUME_STATUS_LABELS = {
  collecting: '继续补充',
  ready: '可以直接生成',
  generating: '生成中',
  completed: '已完成',
  abandoned: '已结束',
  expired: '已过期',
  failed: '会话异常',
};

const RESUME_MODE_COPY = {
  create: {
    eyebrow: '继续上次创作',
    shellTitle: '你有一轮还没完成的创作',
    shellSubtitle: '可以继续沿着上次的思路往下聊，也可以结束它，从一个全新的方向重新开始。',
    summaryTitle: '上一轮创作',
    summaryHint: '系统检测到这条创作会话仍然处于进行中。',
    promptFallback: '继续这轮创作，或者换一个新方向重新开始。',
    description: '继续会回到上次的方案和追问；重新开始会结束旧会话，但不会清空你接下来要写的新想法。',
    continueLabel: '继续上次创作',
    restartLabel: '开始新的创作',
  },
  iterate: {
    eyebrow: '继续上次优化',
    shellTitle: '继续上次优化，还是开始新的方向？',
    shellSubtitle: '检测到这款作品还有一轮未完成的优化对话，你可以继续接着聊，也可以结束它重新开一轮。',
    summaryTitle: '上次的优化方向',
    summaryHint: '这是系统检测到的未完成优化会话。',
    promptFallback: '继续这轮优化，或者结束它开始新的方向。',
    description: '如果你这次目标已经变了，建议直接开始新一轮，避免旧上下文干扰。',
    continueLabel: '继续上次优化',
    restartLabel: '开始新的优化',
  },
  fork: {
    eyebrow: '继续上次复刻',
    shellTitle: '继续上次复刻，还是重新来一轮？',
    shellSubtitle: '检测到你对这款作品还有一轮未完成的新版本对话，可以继续接着聊，也可以结束它重新开始。',
    summaryTitle: '上次的新版本方向',
    summaryHint: '这是系统检测到的未完成复刻会话。',
    promptFallback: '继续这轮新版本对话，或者结束它重新开始。',
    description: '如果你这次准备换一个完全不同的方向，建议直接开始新的复刻。',
    continueLabel: '继续上次复刻',
    restartLabel: '开始新的复刻',
  },
};

function formatResumeTime(value) {
  if (!value) {
    return '刚刚整理过';
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
  const statusValue = RESUME_STATUS_LABELS[session?.status] || '未完成';
  const summaryTitle = subjectTitle || session?.title || copy.summaryTitle;

  return (
    <CreationSessionShell
      eyebrow={copy.eyebrow}
      title={copy.shellTitle}
      subtitle={copy.shellSubtitle}
      statusLabel="当前状态"
      statusValue={statusValue}
      sections={[
        {
          key: 'resume-summary',
          node: (
            <View className="creation-session-card creation-resume-summary">
              <View className="creation-session-card__header">
                <View>
                  <Text className="creation-session-card__title">{summaryTitle}</Text>
                  <Text className="creation-session-card__hint">{copy.summaryHint}</Text>
                </View>
              </View>

              <View className="creation-session-meta-list">
                <View className="creation-session-meta-item">
                  <Text className="creation-session-meta-item__label">上次停在</Text>
                  <Text className="creation-session-meta-item__value">{statusValue}</Text>
                </View>
                <View className="creation-session-meta-item">
                  <Text className="creation-session-meta-item__label">最近更新</Text>
                  <Text className="creation-session-meta-item__value">
                    {formatResumeTime(session?.updatedAt || session?.createdAt)}
                  </Text>
                </View>
              </View>
            </View>
          ),
        },
        {
          key: 'resume-actions',
          node: (
            <CreationResumePrompt
              title={copy.summaryTitle}
              hint={copy.summaryHint}
              prompt={session?.prompt || copy.promptFallback}
              description={copy.description}
              continueLabel={copy.continueLabel}
              restartLabel={copy.restartLabel}
              submitting={submitting}
              onContinue={onContinue}
              onRestart={onRestart}
            />
          ),
        },
      ]}
    />
  );
}

export default CreationResumeScene;
