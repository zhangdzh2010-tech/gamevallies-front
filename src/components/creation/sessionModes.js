function getDefaultAnswerPlaceholder(entryMode) {
  if (entryMode === 'iterate') {
    return '继续说这次想怎么优化';
  }

  if (entryMode === 'fork') {
    return '继续补充你想保留和改变的部分';
  }

  return '如果方向不对，也可以直接纠正';
}

const CREATION_SESSION_MODE_CONFIG = {
  create: {
    shell: {
      title: '继续创作',
    },
    panel: {
      generateLabel: '开始创作',
      errorClassName: 'creation-session-error',
    },
  },
  iterate: {
    shell: {
      title: '继续优化',
    },
    panel: {
      generateLabel: '开始优化',
      errorClassName: 'creation-session-error',
    },
  },
  fork: {
    shell: {
      title: '继续复刻',
    },
    panel: {
      generateLabel: '开始复刻',
      errorClassName: 'creation-session-error',
    },
  },
};

export function getCreationSessionModeConfig(entryMode = 'create') {
  return CREATION_SESSION_MODE_CONFIG[entryMode] || CREATION_SESSION_MODE_CONFIG.create;
}

export function buildCreationSessionSceneProps({
  entryMode = 'create',
  session = null,
  answerValue = '',
  onAnswerChange,
  answerPlaceholder = '',
  answerSuggestions = [],
  submitting = false,
  actions = [],
  errorMessage = '',
}) {
  const modeConfig = getCreationSessionModeConfig(entryMode);
  const shellConfig = modeConfig.shell
    ? {
        ...modeConfig.shell,
      }
    : null;

  return {
    className: modeConfig.className || '',
    shell: shellConfig,
    panel: {
      ...(modeConfig.panel || {}),
      session,
      entryMode,
      answerValue,
      onAnswerChange,
      answerPlaceholder: answerPlaceholder || getDefaultAnswerPlaceholder(entryMode),
      answerSuggestions,
      submitting,
      actions,
      errorMessage,
    },
  };
}

export default getCreationSessionModeConfig;
