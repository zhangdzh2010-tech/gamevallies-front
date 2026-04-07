export function isCreationSessionQuestioning(status) {
  return status === 'collecting';
}

export function canGenerateCreationSession(status) {
  return status === 'collecting' || status === 'ready';
}

export function getCreationSessionNotice(status, entryMode = 'create', session = null) {
  const modeLabel = entryMode === 'fork'
    ? '复刻'
    : entryMode === 'iterate'
      ? '优化'
      : '创作';

  if (status === 'initializing') {
    return `AI 正在整理这轮${modeLabel}的第一版理解，通常几秒内就会回来。`;
  }

  if (status === 'ready') {
    return `当前信息已经足够，确认后就可以直接开始${modeLabel}。`;
  }

  if (status === 'failed') {
    return `本轮${modeLabel}会话遇到异常，建议重新开始，避免沿用不完整的上下文。`;
  }

  if (status === 'expired') {
    return `本轮${modeLabel}会话已经过期，请重新开始，系统会按最新输入重新整理方向。`;
  }

  if (status === 'abandoned') {
    const initError = session?.metadata?.initError;

    if (initError) {
      if (/timeout|超时/i.test(initError)) {
        return `${modeLabel}会话初始化超时了，请重新开始。`;
      }

      return initError;
    }

    return `本轮${modeLabel}会话已经结束，如需继续请重新发起新的会话。`;
  }

  return '';
}

export default getCreationSessionNotice;
