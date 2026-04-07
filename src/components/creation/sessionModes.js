function getDefaultAnswerPlaceholder(entryMode) {
  if (entryMode === 'iterate') {
    return '例如：保留核心玩法，把节奏再推快一点，打击反馈更爽。';
  }

  if (entryMode === 'fork') {
    return '例如：保留核心玩法，但把题材换成像素冒险，节奏再紧凑一点。';
  }

  return '如果系统理解偏了，也可以直接写“我真正想要的是……”';
}

const CREATION_SESSION_MODE_CONFIG = {
  create: {
    layout: 'shell',
    shell: {
      eyebrow: '开始新创作',
      title: '先把想法说清楚，再一起把方向定下来',
      subtitle: 'AI 会先整理一版创作理解，再只追问最关键的细节，避免你一开始写太长。',
      statusLabel: '进行中',
    },
    panel: {
      planHint: '这是 AI 根据你刚才的想法整理出的第一版创作方向。',
      generateLabel: '直接开始创作',
      errorClassName: 'creation-session-inline-error',
    },
  },
  iterate: {
    layout: 'shell',
    shell: {
      eyebrow: '继续打磨',
      title: '先说这次最想改什么，再一起把优化方向敲定',
      subtitle: 'AI 会基于当前版本整理优化思路，再追问一个最值得确认的细节。',
      statusLabel: '进行中',
    },
    panel: {
      planHint: '这是 AI 基于当前版本整理出的优化思路，你可以继续补充或直接开始生成。',
      generateLabel: '直接开始优化',
      errorClassName: 'creation-session-inline-error',
    },
  },
  fork: {
    layout: 'shell',
    shell: {
      eyebrow: '做一个新版本',
      title: '先说想保留什么、改变什么，再做出新的版本',
      subtitle: 'AI 会先理解你对原作品的改动方向，再决定还要不要继续追问。',
      statusLabel: '进行中',
    },
    panel: {
      planHint: '这是 AI 根据原作品和你的改动方向整理出的新版本方案。',
      generateLabel: '直接开始复刻',
      errorClassName: 'creation-session-inline-error',
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
