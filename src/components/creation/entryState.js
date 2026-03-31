const ENTRY_MODE_LABELS = {
  create: '创作',
  iterate: '优化',
  fork: '复刻',
};

export function getCreationEntryErrorContent(entryMode = 'create', rawError = '') {
  const modeLabel = ENTRY_MODE_LABELS[entryMode] || '创作';
  const source = typeof rawError === 'string' ? rawError.trim() : '';

  if (/quota|subscription|subscribe|额度|次数|会员|订阅/i.test(source)) {
    return {
      title: `这轮${modeLabel}暂时还不能继续`,
      message: '当前账号的额度或权限暂时不足，先处理权限问题后，再回来继续这一轮输入。',
      hint: '你刚才写的内容还在，条件恢复后可以直接重试。',
    };
  }

  if (/expired|过期|失效/i.test(source)) {
    return {
      title: `这轮${modeLabel}已经失效了`,
      message: '系统没能沿用刚才那次状态，需要你重新发起一轮新的对话。',
      hint: '你刚才写的内容还在，直接重新提交就可以。',
    };
  }

  if (/conflict|revision|版本冲突|状态变化/i.test(source)) {
    return {
      title: `这轮${modeLabel}刚刚被更新过`,
      message: '系统检测到会话状态已经变化，建议直接重新提交，让最新状态重新整理方向。',
      hint: '你不用重写内容，直接重试即可。',
    };
  }

  if (/timeout|timed out|超时|network|fetch|请求失败|加载失败/i.test(source)) {
    return {
      title: `刚才没把这轮${modeLabel}准备好`,
      message: '这次请求可能因为网络波动或服务暂时繁忙，没有顺利把会话建立起来。',
      hint: '你刚才写的内容还在，直接点下面的重试按钮就好。',
    };
  }

  return {
    title: `刚才没把这轮${modeLabel}准备好`,
    message: '系统还没顺利把这一轮对话建立起来，可能是短暂波动，也可能是会话状态刚发生了变化。',
    hint: '你刚才写的内容还在，不用重写，直接重试就好。',
  };
}

export default getCreationEntryErrorContent;
