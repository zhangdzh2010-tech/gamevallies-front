export function isCreationSessionQuestioning(status) {
  return status === 'collecting';
}

export function canGenerateCreationSession(status) {
  return status === 'collecting' || status === 'ready';
}

export function getCreationSessionNotice(status, entryMode = 'create') {
  const modeLabel = entryMode === 'fork'
    ? '复刻'
    : entryMode === 'iterate'
      ? '优化'
      : '创作';

  if (status === 'ready') {
    return `当前信息已经足够，确认后就可以直接开始${modeLabel}。`;
  }

  if (status === 'failed') {
    return `本轮${modeLabel}会话遇到异常，建议重新开始，避免沿用不完整上下文。`;
  }

  if (status === 'expired') {
    return `本轮${modeLabel}会话已过期，请重新开始，系统会基于最新信息重新整理方案。`;
  }

  if (status === 'abandoned') {
    return `本轮${modeLabel}会话已结束，如需继续请重新开始新的会话。`;
  }

  return '';
}
