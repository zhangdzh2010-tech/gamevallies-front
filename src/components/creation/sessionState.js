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
    return `AI 正在整理这一轮${modeLabel}的想法，通常几秒内就会给出第一版方向。`;
  }

  if (status === 'collecting') {
    return `AI 已经整理出一版可以改的方向。你可以先改一改再确认，然后开始这次${modeLabel}。`;
  }

  if (status === 'ready') {
    return `这版方向已经确认，可以直接开始${modeLabel}；想再调整的话也可以继续改，再次确认就行。`;
  }

  if (status === 'failed') {
    return `这次${modeLabel}过程中出了点问题，建议重新开始，避免接着用不完整的方向。`;
  }

  if (status === 'expired') {
    return `这次${modeLabel}已经过期了，请重新开始，AI 会按你最新的想法重新整理方向。`;
  }

  if (status === 'abandoned') {
    const initError = session?.metadata?.initError;

    if (initError) {
      if (/timeout|超时/i.test(initError)) {
        return `这次${modeLabel}启动超时了，请重新开始。`;
      }

      return initError;
    }

    return `这次${modeLabel}已经结束，如需继续请重新开始一次。`;
  }

  return '';
}

export default getCreationSessionNotice;
