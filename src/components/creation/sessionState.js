export function isCreationSessionQuestioning(status) {
  return status === 'collecting' || status === 'ready';
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
    return `AI 正在整理这一轮${modeLabel}想法，通常几秒内就会给出第一版提示词。`;
  }

  if (status === 'collecting') {
    return `AI 已经整理出一版可编辑提示词。你可以先修改确认，再开始这轮${modeLabel}。`;
  }

  if (status === 'ready') {
    return `当前提示词已经确认，可以直接开始${modeLabel}；如果还想调整，也可以继续编辑后再次确认。`;
  }

  if (status === 'failed') {
    return `这轮${modeLabel}会话遇到了异常，建议重新开始，避免沿用不完整的上下文。`;
  }

  if (status === 'expired') {
    return `这轮${modeLabel}会话已经过期，请重新开始，系统会按最新输入重新整理方向。`;
  }

  if (status === 'abandoned') {
    const initError = session?.metadata?.initError;

    if (initError) {
      if (/timeout|超时/i.test(initError)) {
        return `${modeLabel}会话初始化超时了，请重新开始。`;
      }

      return initError;
    }

    return `这轮${modeLabel}会话已经结束，如需继续请重新发起新的会话。`;
  }

  return '';
}

export default getCreationSessionNotice;
