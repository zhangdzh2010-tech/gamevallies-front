function getDefaultAnswerPlaceholder(entryMode) {
  if (entryMode === 'iterate') {
    return '例如：保留核心玩法，把节奏再快一点，角色改成像素风。';
  }

  if (entryMode === 'fork') {
    return '例如：保留核心玩法，但换成像素风，节奏再快一点。';
  }

  return '如果系统理解偏了，也可以直接写“你理解偏了，我想要……”';
}

const CREATION_SESSION_MODE_CONFIG = {
  create: {
    layout: 'shell',
    shell: {
      eyebrow: 'AI Creation Session',
      title: '先确认创作方向，再交给 AI 开始生成',
      subtitle: '系统会先整理方案草案，并一次只追问一个最值得确认的问题。',
      statusLabel: '当前阶段',
    },
    panel: {
      planHint: '这是系统根据你首轮创意整理出来的方案草案。',
      generateLabel: '直接开始创作',
      errorClassName: 'create-session-error',
    },
  },
  iterate: {
    layout: 'shell',
    shell: {
      eyebrow: 'AI Optimize Session',
      title: '先确认这次想怎么优化，再交给 AI 动手',
      subtitle: '系统会先理解你最想改的部分，再补问 1 个最关键的细节。',
      statusLabel: '当前阶段',
    },
    panel: {
      planHint: '这是系统基于当前作品和上下文整理出的优化方案草案。',
      generateLabel: '直接开始优化',
      errorClassName: 'iterate-error-banner',
    },
  },
  fork: {
    layout: 'shell',
    shell: {
      eyebrow: 'AI Remix Session',
      title: '先确认想保留和改变的部分，再生成新版本',
      subtitle: '系统会先理解你对原作品的改动方向，再决定是否继续追问。',
      statusLabel: '当前阶段',
    },
    panel: {
      planHint: '这是系统基于原作品和当前上下文整理出的复刻方案草案。',
      generateLabel: '直接开始复刻',
      errorClassName: 'fork-warning-card',
    },
  },
};

export function getCreationSessionModeConfig(entryMode = 'create') {
  return CREATION_SESSION_MODE_CONFIG[entryMode] || CREATION_SESSION_MODE_CONFIG.create;
}

export function buildCreationSessionSceneProps({
  entryMode = 'create',
  session = null,
  statusValue = '',
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
        statusValue,
      }
    : null;

  return {
    layout: modeConfig.layout || 'panel',
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
