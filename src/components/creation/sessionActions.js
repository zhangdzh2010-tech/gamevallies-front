export function buildCreationSessionActions({
  submitting = false,
  answerValue = '',
  submitLabel = '提交回答',
  generateLabel = '直接开始创作',
  restartLabel = '重新开始',
  onSubmit,
  onSkip,
  onGenerate,
  onRestart,
}) {
  return [
    {
      key: 'submit',
      label: submitting ? '提交中...' : submitLabel,
      tone: 'primary',
      disabled: submitting || !String(answerValue || '').trim(),
      onClick: onSubmit,
    },
    {
      key: 'skip',
      label: '跳过此题',
      tone: 'ghost',
      disabled: submitting,
      onClick: onSkip,
    },
    {
      key: 'generate',
      label: generateLabel,
      tone: 'ghost',
      disabled: submitting,
      onClick: onGenerate,
    },
    {
      key: 'restart',
      label: restartLabel,
      tone: 'danger',
      disabled: submitting,
      onClick: onRestart,
    },
  ];
}

export default buildCreationSessionActions;
