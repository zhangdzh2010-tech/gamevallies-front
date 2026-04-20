/* eslint-disable react/prop-types */
import React from 'react';
import { CreationQuestionCard } from './CreationQuestionCard';
import { CreationSessionActions } from './CreationSessionActions';

export function CreationResumePrompt({
  title = '上次未完成的创作',
  hint = '你上次的创作还没结束。',
  prompt = '继续这轮创作，或者换一个新方向重新开始。',
  description = '继续会回到上次的方向和追问；重新开始会丢掉那一轮，按你这次的新方向整理。',
  continueLabel = '继续上次创作',
  restartLabel = '开始新的创作',
  submitting = false,
  onContinue,
  onRestart,
}) {
  return (
    <>
      <CreationQuestionCard
        title={title}
        hint={hint}
        question={{
          content: prompt,
          description,
        }}
      />
      <CreationSessionActions
        actions={[
          {
            key: 'continue-existing-session',
            label: submitting ? '正在恢复...' : continueLabel,
            tone: 'primary',
            disabled: submitting,
            onClick: onContinue,
          },
          {
            key: 'start-fresh-session',
            label: submitting ? '处理中...' : restartLabel,
            tone: 'ghost',
            disabled: submitting,
            onClick: onRestart,
          },
        ]}
      />
    </>
  );
}

export default CreationResumePrompt;
