// Task status normalization, progress and error presentation.
import {
  COMPLETED_GAME_STATUSES,
  TERMINAL_TASK_STATUSES,
  PIPELINE_STAGES,
  DETAILED_PIPELINE_STAGES,
  PIPELINE_STAGE_SUMMARIES,
  DISPLAY_STAGE_ALIASES,
  STAGE_KEY_ALIASES,
} from './constants';
import * as gameService from '../../services/game';

export function clampProgress(progress, fallback = 5) {
  const value = Number(progress);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}


export function normalizeTaskStatus(status, fallback = '') {
  if (typeof gameService.normalizeGenerationTaskStatus === 'function') {
    return gameService.normalizeGenerationTaskStatus(status, fallback);
  }

  return String(status || '').trim().toLowerCase() || fallback;
}


export function getDisplayStageDefinition(stageKey) {
  if (!stageKey) {
    return PIPELINE_STAGES[0] || null;
  }

  return PIPELINE_STAGES.find((stage) => stage.key === stageKey) || null;
}


export function getDetailedStageDefinition(stageKey) {
  if (!stageKey) {
    return DETAILED_PIPELINE_STAGES[0] || null;
  }

  return DETAILED_PIPELINE_STAGES.find((stage) => stage.key === stageKey) || null;
}


export function prettifyStageKey(stageKey) {
  return String(stageKey || '')
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ');
}


export function getResolvedStageAlias(rawKey, task = null) {
  const normalizedKey = String(rawKey || '').trim().toLowerCase();
  if (!normalizedKey) {
    return '';
  }

  if (normalizedKey === 'targeted_remediation') {
    return Number(task?.progressPct) >= 90
      ? 'runtime_simulation_qa'
      : 'contract_qa';
  }

  return STAGE_KEY_ALIASES[normalizedKey] || normalizedKey;
}


export function buildDynamicStageDefinition(stageKey, metadata = {}) {
  if (!stageKey) {
    return null;
  }

  const fallbackDefinition = getDetailedStageDefinition(stageKey);
  const label = fallbackDefinition?.label
    || String(metadata.label || '').trim()
    || prettifyStageKey(stageKey)
    || DETAILED_PIPELINE_STAGES[0]?.label
    || '处理中';
  const pctFallback = Number.isFinite(Number(metadata.pct))
    ? Number(metadata.pct)
    : (fallbackDefinition?.pct ?? DETAILED_PIPELINE_STAGES[0]?.pct ?? 5);

  return {
    key: stageKey,
    label,
    pct: clampProgress(metadata.pct, pctFallback),
  };
}


export function getDisplayStageKey(stageKey, task = null) {
  const normalizedStageKey = String(stageKey || '').trim();
  if (!normalizedStageKey) {
    return PIPELINE_STAGES[0]?.key || 'understanding';
  }

  const mappedKey = DISPLAY_STAGE_ALIASES[normalizedStageKey];
  if (mappedKey) {
    return mappedKey;
  }

  const taskStatus = normalizeTaskStatus(task?.status);
  if (taskStatus === 'succeeded') {
    return PIPELINE_STAGES[PIPELINE_STAGES.length - 1]?.key || 'finalizing';
  }

  const progress = clampProgress(task?.displayStagePct ?? task?.progressPct, 0);
  const inferredStage = PIPELINE_STAGES.find((stage) => progress <= stage.pct);
  return inferredStage?.key || PIPELINE_STAGES[PIPELINE_STAGES.length - 1]?.key || 'finalizing';
}


export function buildStageSequence(task, events = []) {
  void task;
  void events;
  return PIPELINE_STAGES;
}


export function getFallbackStageAlias(task) {
  const keys = [
    task?.progressStage,
    task?.currentStage,
    task?.currentStepKey,
    task?.rawStage,
    task?.stage,
    task?.stepKey,
  ].filter(Boolean);

  for (const key of keys) {
    const alias = getResolvedStageAlias(key, task);
    if (alias) {
      return alias;
    }
  }

  return PIPELINE_STAGES[0]?.key || 'understanding';
}


export function getStageAlias(task) {
  const taskStatus = normalizeTaskStatus(task?.status);
  if (taskStatus === 'succeeded') {
    return 'finalizing';
  }

  if (task?.displayStageKey) {
    return getResolvedStageAlias(task.displayStageKey, task);
  }

  return getFallbackStageAlias(task);
}


export function getLatestTaskMessage(events, fallback = '') {
  const latestEvent = Array.isArray(events) && events.length > 0
    ? events[events.length - 1]
    : null;

  return latestEvent?.message || fallback;
}


export function getDisplayProgressMessage(task, stageKey, events = [], fallback = '') {
  const taskStatus = normalizeTaskStatus(task?.status);
  if (taskStatus === 'canceled') {
    return '创作任务已取消';
  }

  if (taskStatus === 'timed_out') {
    return '创作耗时较长，你可以稍后回来查看结果';
  }

  if (taskStatus === 'failed') {
    return '这次创作没有顺利完成，我们可以重新再试一次';
  }

  return PIPELINE_STAGE_SUMMARIES[stageKey]
    || getLatestTaskMessage(events, task?.progressMessage || fallback);
}


export function buildProgressFromTask(task, events = []) {
  const taskStatus = normalizeTaskStatus(task?.status);
  const stageKey = getStageAlias(task);
  const displayStageKey = getDisplayStageKey(stageKey, task);
  const stages = buildStageSequence(task, events);
  const stageIndex = Math.max(0, stages.findIndex((stage) => stage.key === displayStageKey));
  const displayStage = stages[stageIndex] || getDisplayStageDefinition(displayStageKey) || PIPELINE_STAGES[0];
  const detailedStage = buildDynamicStageDefinition(stageKey, {
    label: task?.displayStageLabel,
    pct: task?.displayStagePct ?? task?.progressPct,
  }) || DETAILED_PIPELINE_STAGES[0];
  const fallbackPct = taskStatus === 'succeeded'
    ? 100
    : clampProgress(task?.displayStagePct ?? task?.progressPct, detailedStage?.pct ?? displayStage?.pct);
  const fallbackLabel = taskStatus === 'canceled'
    ? '已取消创作任务'
    : taskStatus === 'timed_out'
      ? '任务超时'
      : taskStatus === 'failed'
        ? '创作失败'
        : displayStage?.label;
  const isMappedDisplayStage = Boolean(DISPLAY_STAGE_ALIASES[stageKey]);
  const defaultStageLabel = isMappedDisplayStage
    ? (displayStage?.label || fallbackLabel)
    : (String(task?.displayStageLabel || '').trim() || detailedStage?.label || displayStage?.label || fallbackLabel);
  const stageLabel = taskStatus === 'canceled'
    ? '已取消创作任务'
    : taskStatus === 'timed_out'
      ? '任务超时'
      : taskStatus === 'failed'
        ? (String(task?.displayStageLabel || '').trim() || detailedStage?.label || displayStage?.label || '创作失败')
        : defaultStageLabel;
  const message = getDisplayProgressMessage(task, stageKey, events, stageLabel || fallbackLabel);

  return {
    stages,
    stageIndex,
    stageKey,
    displayStageKey,
    stageLabel,
    message,
    pct: clampProgress(task?.progressPct, fallbackPct),
  };
}


export function mergeTaskEvents(previous, incoming) {
  const byKey = new Map();

  [...previous, ...incoming].forEach((event) => {
    if (!event) {
      return;
    }

    const dedupeKey =
      event.id ||
      (Number.isFinite(event.seqNo) ? `seq:${event.seqNo}` : '') ||
      `${event.createdAt || ''}:${event.message || ''}`;

    if (!dedupeKey) {
      return;
    }

    byKey.set(dedupeKey, event);
  });

  return Array.from(byKey.values())
    .sort((a, b) => {
      const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;

      if (aTime !== bTime) {
        return aTime - bTime;
      }

      return (a?.seqNo || 0) - (b?.seqNo || 0);
    })
    .slice(-20);
}


export function deriveTaskErrorMessage(task) {
  if (!task) {
    return '创作失败，请稍后重试';
  }

  const taskStatus = normalizeTaskStatus(task.status);
  if (taskStatus === 'canceled') {
    return '已取消创作任务';
  }

  if (taskStatus === 'timed_out') {
    return '本次创作已超时并停止，未生成可用作品。请重试。';
  }

  const source = String(task.terminalError?.message || task.errorMessage || '').trim();
  const failureFamily = String(task.failureFamily || '').trim().toLowerCase();
  const failedStage = String(task.failedStage || '').trim().toLowerCase();

  if (failureFamily === 'worker_interrupted') {
    return '创作服务中断，自动恢复未能完成。请重试。';
  }

  if (!source) {
    if (failureFamily === 'code_generation' || failedStage === 'logic_generate') {
      return 'AI 生成内容时出了点问题，请稍后重试';
    }
    return '创作失败，请稍后重试';
  }

  if (
    /full llm generation failed|chat\/completions|ark\.cn-|model provider|provider/i.test(source)
    && /403|401|429|forbidden|unauthorized|rate.?limit|5\d{2}|server error|internal server/i.test(source)
  ) {
    return 'AI 生成服务暂时不可用，请稍后重试';
  }

  if (/full llm generation failed|chat\/completions|ark\.cn-|model provider|provider/i.test(source)) {
    return 'AI 生成阶段遇到问题，请稍后重试';
  }

  if (/request:fail timeout|timeout|timed out|超时/i.test(source)) {
    return ['failed', 'timed_out'].includes(taskStatus)
      ? '本次创作已超时并停止，未生成可用作品。请重试。'
      : '暂时无法获取创作进度，可到“我的作品”查看任务状态。';
  }

  if (/network|request:fail|econn|enotfound|enetunreach|网络/i.test(source)) {
    return '当前网络不稳定，请稍后重试';
  }

  if (/server error|internal server|HTTP 5\d{2}|服务器/i.test(source)) {
    return '服务器暂时出了点问题，请稍后再试';
  }

  if (/rate.?limit|too many|频繁|429/i.test(source)) {
    return '当前生成服务较忙，请稍后再试';
  }

  if (!/[\u4e00-\u9fa5]/.test(source)) {
    if (failureFamily === 'code_generation' || failedStage === 'logic_generate') {
      return 'AI 生成内容时出了点问题，请稍后重试';
    }
    return '创作失败，请稍后重试';
  }

  return source;
}


export function isCompletedGameStatus(status) {
  return COMPLETED_GAME_STATUSES.includes(status);
}


export function isTerminalTaskStatus(status) {
  return TERMINAL_TASK_STATUSES.has(normalizeTaskStatus(status));
}
