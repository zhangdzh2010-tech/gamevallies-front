export function isCreationSessionQuestioning(status) {
  return status === 'collecting';
}

export function canGenerateCreationSession(status) {
  return status === 'collecting' || status === 'ready';
}

export function getCreationSessionNotice(status, entryMode = 'create', session = null) {
  if (status === 'initializing') {
    return '正在整理你的想法，马上就好。';
  }

  if (status === 'failed') {
    return '这轮内容没准备好，重新开始会更稳妥。';
  }

  if (status === 'expired') {
    return '这轮对话已经过期了，重新开始就好。';
  }

  if (status === 'abandoned') {
    const initError = session?.metadata?.initError;
    if (initError) {
      if (/timeout|超时/i.test(initError)) {
        return '准备这轮对话花了太久，重新开始试试。';
      }
    }

    return '这轮对话已经结束了，重新开始即可。';
  }

  return '';
}
