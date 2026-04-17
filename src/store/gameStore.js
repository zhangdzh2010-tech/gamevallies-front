import Taro from '@tarojs/taro';
import { create } from 'zustand';
import * as gameService from '../services/game';
import { getWebSocketManager } from '../services/websocket';
import useQuotaStore from '../stores/quotaStore';
import { Storage } from '../utils/storage';
import { subscribeGameUnlocked } from '../utils/gameUnlock';

const COMPLETED_GAME_STATUSES = ['ready', 'draft', 'published', 'review'];
// Include both frontend vocabulary and schema vocabulary so tasks are recognised
// as terminal regardless of which variant the backend returns.
//   Schema uses: "completed" (鈮?succeeded), "cancelled" (UK spelling)
//   Frontend uses: "succeeded", "canceled" (US spelling), "timed_out"
const TERMINAL_TASK_STATUSES = new Set([
  'succeeded', 'completed',          // task finished successfully
  'failed',                          // task failed
  'canceled', 'cancelled',           // task was cancelled (both spellings)
  'timed_out',                       // client-side timeout sentinel
]);
const ACTIVE_GENERATION_TASK_KEY = 'gamevallies_active_generation_task';
const TRACKED_GENERATION_TASKS_KEY = 'gamevallies_tracked_generation_tasks';
const ACTIVE_GENERATION_TASK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ACTIVE_TASK_TIMEOUT_MS = 30 * 60 * 1000;
// #8 闃舵鍋滄粸妫€娴嬶細鍚屼竴闃舵瓒呰繃姝ゆ椂闂磋Е鍙戞彁绀?
const STAGE_STALE_WARN_MS = 5 * 60 * 1000;
const TRACKED_TASKS_LIMIT = 20;
const SESSION_INIT_POLL_INTERVAL_MS = 2000;
const SESSION_INIT_MAX_POLLS = 15;
const SESSION_READY_WAIT_INTERVAL_MS = 200;
const SESSION_READY_WAIT_TIMEOUT_MS = (SESSION_INIT_POLL_INTERVAL_MS * SESSION_INIT_MAX_POLLS) + 1000;
const ACTIVE_CREATION_SESSION_STATUSES = new Set(['initializing', 'collecting', 'ready']);

const PIPELINE_STAGES = [
  { key: 'submitting', label: '提交需求', pct: 5 },
  { key: 'planning', label: '梳理方案', pct: 30 },
  { key: 'generating', label: '生成内容', pct: 60 },
  { key: 'qa', label: '质量检查', pct: 92 },
  { key: 'completed', label: '完成', pct: 100 },
];

const DETAILED_PIPELINE_STAGES = [
  { key: 'submitting', label: '提交需求', pct: 5 },
  { key: 'spec_build', label: '梳理方案', pct: 15 },
  { key: 'runtime_profile_select', label: '匹配合适能力', pct: 30 },
  { key: 'contract_compose', label: '组装规则与资源', pct: 40 },
  { key: 'logic_generate', label: '生成内容', pct: 60 },
  { key: 'contract_qa', label: '质量检查', pct: 76 },
  { key: 'runtime_simulation_qa', label: '运行验证', pct: 92 },
  { key: 'completed', label: '完成', pct: 100 },
];

const PIPELINE_STAGE_SUMMARIES = {
  submitting: '正在接收你的创作需求',
  spec_build: '正在整理玩法目标与核心设定',
  runtime_profile_select: '正在匹配适合这次创作的能力组合',
  contract_compose: '正在组装规则、资源与运行约束',
  logic_generate: '正在生成游戏内容与交互逻辑',
  contract_qa: '正在检查质量并修正细节',
  runtime_simulation_qa: '正在验证运行表现与可玩性',
  completed: '内容已经生成完成',
};

const DISPLAY_STAGE_ALIASES = {
  submitting: 'submitting',
  spec_build: 'planning',
  runtime_profile_select: 'planning',
  contract_compose: 'generating',
  logic_generate: 'generating',
  contract_qa: 'qa',
  runtime_simulation_qa: 'qa',
  completed: 'completed',
};

const STAGE_KEY_ALIASES = {
  started: 'submitting',
  queued: 'submitting',
  submitted: 'submitting',
  running: 'submitting',
  submitting: 'submitting',
  dialogue_slot_extract: 'submitting',
  'dialogue.slot_extract': 'submitting',
  dialogue_reply: 'submitting',
  'dialogue.reply': 'submitting',
  intent_parse: 'submitting',
  intent_parsing: 'submitting',
  request_normalized: 'submitting',
  understanding: 'spec_build',
  spec_build: 'spec_build',
  runtime_profile_select: 'runtime_profile_select',
  template_match: 'runtime_profile_select',
  template_matching: 'runtime_profile_select',
  designing: 'contract_compose',
  contract_compose: 'contract_compose',
  generating: 'logic_generate',
  logic_generate: 'logic_generate',
  code_generate: 'logic_generate',
  code_generating: 'logic_generate',
  contract_qa: 'contract_qa',
  qa_fix: 'contract_qa',
  qa_checking: 'contract_qa',
  targeted_remediation: 'contract_qa',
  validating: 'runtime_simulation_qa',
  runtime_simulation_qa: 'runtime_simulation_qa',
  runtime_qa: 'runtime_simulation_qa',
  code_review: 'runtime_simulation_qa',
  finalizing: 'completed',
  completed: 'completed',
  succeeded: 'completed',
};

let activeTaskPollInterval = null;
let activeEventPollInterval = null;
let activeTimeoutId = null;
let activeWebSocketUnsubscribers = [];
let activeSessionPollInterval = null;
let activeSessionWebSocketUnsubscribers = [];
let activeSessionStreamUnsubscribe = null;
// #8 闃舵鍋滄粸妫€娴嬬姸鎬?
let lastStageKey = null;
let lastStageChangedAt = 0;
let staleStageWarned = false;

function clearActiveTaskRuntime() {
  if (activeTaskPollInterval) {
    clearInterval(activeTaskPollInterval);
    activeTaskPollInterval = null;
  }

  if (activeEventPollInterval) {
    clearInterval(activeEventPollInterval);
    activeEventPollInterval = null;
  }

  if (activeTimeoutId) {
    clearTimeout(activeTimeoutId);
    activeTimeoutId = null;
  }

  activeWebSocketUnsubscribers.forEach((unsubscribe) => {
    try {
      unsubscribe();
    } catch (_error) {
      // Ignore listener cleanup failures.
    }
  });
  activeWebSocketUnsubscribers = [];

  // #8 鍚屾閲嶇疆闃舵鍋滄粸妫€娴嬬姸鎬侊紝闃叉娈嬬暀鍒颁笅涓€涓?task
  lastStageKey = null;
  lastStageChangedAt = 0;
  staleStageWarned = false;
}

function clearActiveSessionRuntime() {
  if (activeSessionPollInterval) {
    clearInterval(activeSessionPollInterval);
    activeSessionPollInterval = null;
  }

  if (activeSessionStreamUnsubscribe) {
    try {
      activeSessionStreamUnsubscribe();
    } catch (_error) {
      // Ignore stream cleanup failures.
    }
    activeSessionStreamUnsubscribe = null;
  }

  activeSessionWebSocketUnsubscribers.forEach((unsubscribe) => {
    try {
      unsubscribe();
    } catch (_error) {
      // Ignore listener cleanup failures.
    }
  });
  activeSessionWebSocketUnsubscribers = [];
}

function hasActiveSessionRuntimeBinding() {
  return Boolean(
    activeSessionPollInterval
    || activeSessionStreamUnsubscribe
    || activeSessionWebSocketUnsubscribers.length
  );
}

function getCreationSessionRuntimePhase(session) {
  if (!session?.sessionId) {
    return '';
  }

  if (session.status === 'initializing') {
    return 'initializing';
  }

  if (ACTIVE_CREATION_SESSION_STATUSES.has(session.status)) {
    return 'interactive';
  }

  return '';
}

function getCreationSessionRuntimeBindingKey(session) {
  const phase = getCreationSessionRuntimePhase(session);
  if (!phase) {
    return '';
  }

  return `${String(session.sessionId)}:${phase}`;
}

function clampProgress(progress, fallback = 5) {
  const value = Number(progress);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getDisplayStageDefinition(stageKey) {
  if (!stageKey) {
    return PIPELINE_STAGES[0] || null;
  }

  return PIPELINE_STAGES.find((stage) => stage.key === stageKey) || null;
}

function getDetailedStageDefinition(stageKey) {
  if (!stageKey) {
    return DETAILED_PIPELINE_STAGES[0] || null;
  }

  return DETAILED_PIPELINE_STAGES.find((stage) => stage.key === stageKey) || null;
}

function prettifyStageKey(stageKey) {
  return String(stageKey || '')
    .trim()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function getResolvedStageAlias(rawKey, task = null) {
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

function buildDynamicStageDefinition(stageKey, metadata = {}) {
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

function getDisplayStageKey(stageKey, task = null) {
  const normalizedStageKey = String(stageKey || '').trim();
  if (!normalizedStageKey) {
    return PIPELINE_STAGES[0]?.key || 'submitting';
  }

  const mappedKey = DISPLAY_STAGE_ALIASES[normalizedStageKey];
  if (mappedKey) {
    return mappedKey;
  }

  if (task?.status === 'succeeded' || task?.status === 'completed') {
    return 'completed';
  }

  const progress = clampProgress(task?.displayStagePct ?? task?.progressPct, 0);
  const inferredStage = PIPELINE_STAGES.find((stage) => progress <= stage.pct);
  return inferredStage?.key || PIPELINE_STAGES[PIPELINE_STAGES.length - 1]?.key || 'completed';
}

function buildStageSequence(task, events = []) {
  return PIPELINE_STAGES;
}

function getFallbackStageAlias(task) {
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

  return DETAILED_PIPELINE_STAGES[0]?.key || 'submitting';
}

function getStageAlias(task) {
  if (task?.status === 'succeeded' || task?.status === 'completed') {
    return 'completed';
  }

  if (task?.displayStageKey) {
    return getResolvedStageAlias(task.displayStageKey, task);
  }

  return getFallbackStageAlias(task);
}

function getLatestTaskMessage(events, fallback = '') {
  const latestEvent = Array.isArray(events) && events.length > 0
    ? events[events.length - 1]
    : null;

  return latestEvent?.message || fallback;
}

function getDisplayProgressMessage(task, stageKey, events = [], fallback = '') {
  if (task?.status === 'canceled' || task?.status === 'cancelled') {
    return '创作任务已取消';
  }

  if (task?.status === 'timed_out') {
    return '创作耗时较长，你可以稍后回来查看结果';
  }

  if (task?.status === 'failed') {
    return '这次创作没有顺利完成，我们可以重新再试一次';
  }

  return PIPELINE_STAGE_SUMMARIES[stageKey]
    || getLatestTaskMessage(events, task?.progressMessage || fallback);
}

function buildProgressFromTask(task, events = []) {
  const stageKey = getStageAlias(task);
  const displayStageKey = getDisplayStageKey(stageKey, task);
  const stages = buildStageSequence(task, events);
  const stageIndex = Math.max(0, stages.findIndex((stage) => stage.key === displayStageKey));
  const displayStage = stages[stageIndex] || getDisplayStageDefinition(displayStageKey) || PIPELINE_STAGES[0];
  const detailedStage = buildDynamicStageDefinition(stageKey, {
    label: task?.displayStageLabel,
    pct: task?.displayStagePct ?? task?.progressPct,
  }) || DETAILED_PIPELINE_STAGES[0];
  const fallbackPct = task?.status === 'succeeded'
    ? 100
    : clampProgress(task?.displayStagePct ?? task?.progressPct, detailedStage?.pct ?? displayStage?.pct);
  const fallbackLabel = task?.status === 'canceled' || task?.status === 'cancelled'
    ? '已取消创作任务'
    : task?.status === 'timed_out'
      ? '任务超时'
      : task?.status === 'failed'
        ? '创作失败'
        : displayStage?.label;
  const isMappedDisplayStage = Boolean(DISPLAY_STAGE_ALIASES[stageKey]);
  const defaultStageLabel = isMappedDisplayStage
    ? (displayStage?.label || fallbackLabel)
    : (String(task?.displayStageLabel || '').trim() || detailedStage?.label || displayStage?.label || fallbackLabel);
  const stageLabel = task?.status === 'canceled' || task?.status === 'cancelled'
    ? '已取消创作任务'
    : task?.status === 'timed_out'
      ? '任务超时'
      : task?.status === 'failed'
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

function mergeTaskEvents(previous, incoming) {
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

function deriveTaskErrorMessage(task) {
  if (!task) {
    return '创作失败，请稍后重试';
  }

  if (task.status === 'canceled' || task.status === 'cancelled') {
    return '已取消创作任务';
  }

  if (task.status === 'timed_out') {
    return '创作超时，请稍后到“我的作品”里查看结果';
  }

  const source = String(task.terminalError?.message || task.errorMessage || '').trim();
  const failureFamily = String(task.failureFamily || '').trim().toLowerCase();
  const failedStage = String(task.failedStage || '').trim().toLowerCase();

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
    return '创作超时，请稍后到“我的作品”里查看结果';
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

function deriveCreationSessionErrorMessage(error, fallback = '创作会话处理失败，请稍后重试') {
  const source = typeof error === 'string'
    ? error.trim()
    : error?.message
      ? String(error.message).trim()
      : '';

  if (!source) {
    return fallback;
  }

  if (/revision|版本冲突|冲突/i.test(source)) {
    return '当前创作已在其他地方更新，已自动刷新，请重试';
  }

  if (/expired|过期/i.test(source)) {
    return '创作会话已过期，请重新开始';
  }

  if (/abandoned|已结束|已放弃/i.test(source)) {
    return '当前创作会话已结束，请重新开启';
  }

  if (/aborted a request|aborterror|aborted|取消了请求|中断了请求/i.test(source)) {
    return '这次请求被中断了，请再试一次';
  }

  if (/request:fail timeout|timeout|timed out|超时/i.test(source)) {
    return '这次请求超时了，请稍后再试';
  }

  if (/network|request:fail|econn|enotfound|enetunreach|网络/i.test(source)) {
    return '当前网络不稳定，请稍后重试';
  }

  if (/authentication required|unauthorized|请先登录/i.test(source)) {
    return '登录状态已失效，请重新登录后继续';
  }

  if (/restore|恢复/i.test(source)) {
    return '恢复创作失败，请手动重新开始';
  }

  if (/generate|生成/i.test(source)) {
    return '生成阶段遇到问题，可稍后重试';
  }

  if (/must be longer than or equal to 5 characters|min length 5|at least 5/i.test(source)) {
    return '至少输入 5 个字，再开始这一轮';
  }

  // #10 补充更多常见错误类型的友好提示
  if (/quota|limit|配额|次数.*用完|额度/i.test(source)) {
    return '创作次数已用完，请升级或等待配额刷新';
  }

  if (/forbidden|permission|权限|禁止/i.test(source)) {
    return '没有操作权限，请确认账号状态';
  }

  if (/not found|404|找不到/i.test(source)) {
    return '请求的资源不存在，可能已被删除';
  }

  if (/server error|internal server|HTTP 5\d{2}|服务器/i.test(source)) {
    return '服务器暂时出了点问题，请稍后再试';
  }

  if (/rate.?limit|too many|频繁/i.test(source)) {
    return '操作太频繁了，请稍后再试';
  }

  if (!/[\u4e00-\u9fa5]/.test(source)) {
    return fallback;
  }

  return source || fallback;
}

function normalizeSessionMessageContent(content) {
  return String(content || '').trim();
}

function buildPendingCreationSessionUserMessage(content, session) {
  const normalizedContent = normalizeSessionMessageContent(content);
  if (!normalizedContent) {
    return null;
  }

  return {
    id: `pending-user-${session?.sessionId || 'session'}-${Date.now()}`,
    role: 'user',
    content: normalizedContent,
    createdAt: Date.now(),
    revision: session?.revision ?? null,
    isPending: true,
  };
}

function getCreationSessionRevision(session) {
  const revision = Number(session?.revision ?? 0);
  return Number.isFinite(revision) ? revision : 0;
}

function getCreationSessionExpandedPrompt(session) {
  if (session?.expandedPrompt != null && session.expandedPrompt !== '') {
    return String(session.expandedPrompt);
  }

  if (session?.prompt != null && session.prompt !== '') {
    return String(session.prompt);
  }

  if (session?.initialPrompt != null && session.initialPrompt !== '') {
    return String(session.initialPrompt);
  }

  return '';
}

function getCreationSessionQuestionText(session) {
  return [session?.currentQuestion?.content, session?.currentQuestion?.description]
    .filter(Boolean)
    .join('\n')
    .trim();
}

function buildCreationSessionUiState(session) {
  const status = String(session?.status || '');

  return {
    isInitializing: status === 'initializing',
    isAwaitingPromptConfirmation: status === 'collecting',
    canGenerate: status === 'collecting' || status === 'ready',
    canEditPrompt: status === 'collecting' || status === 'ready',
  };
}

function isCreationSessionRevisionConflictError(error) {
  const statusCode = Number(error?.statusCode ?? error?.status ?? 0);
  return statusCode === 409 || /revision|版本冲突|冲突/i.test(error?.message || '');
}

function sessionContainsAssistantReply(session, reply) {
  const replyContent = normalizeSessionMessageContent(reply?.content);
  if (!replyContent) {
    return false;
  }

  const hasMatchingMessage = Array.isArray(session?.messages) && session.messages.some((message) => (
    message?.role === 'assistant'
    && normalizeSessionMessageContent(message.content) === replyContent
  ));

  if (hasMatchingMessage) {
    return true;
  }

  return normalizeSessionMessageContent(getCreationSessionQuestionText(session)) === replyContent;
}

function sessionContainsUserReply(session, reply) {
  const replyContent = normalizeSessionMessageContent(reply?.content);
  if (!replyContent) {
    return false;
  }

  return Array.isArray(session?.messages) && session.messages.some((message) => (
    message?.role === 'user'
    && normalizeSessionMessageContent(message.content) === replyContent
  ));
}

function isStaleCreationSessionSnapshot(previousSession, nextSession) {
  if (!previousSession?.sessionId || !nextSession?.sessionId) {
    return false;
  }

  if (String(previousSession.sessionId) !== String(nextSession.sessionId)) {
    return false;
  }

  const previousRevision = getCreationSessionRevision(previousSession);
  const nextRevision = getCreationSessionRevision(nextSession);

  return previousRevision > 0 && nextRevision > 0 && nextRevision < previousRevision;
}

function resolveCreationSessionStreamingReply(previousSession, nextSession, streamingReply) {
  if (!streamingReply) {
    return null;
  }

  if (!previousSession?.sessionId || !nextSession?.sessionId) {
    return null;
  }

  if (String(previousSession.sessionId) !== String(nextSession.sessionId)) {
    return null;
  }

  if (!getCreationSessionRuntimePhase(nextSession)) {
    return null;
  }

  return sessionContainsAssistantReply(nextSession, streamingReply) ? null : streamingReply;
}

function resolveCreationSessionPendingUserMessage(previousSession, nextSession, pendingUserMessage) {
  if (!pendingUserMessage) {
    return null;
  }

  if (!previousSession?.sessionId || !nextSession?.sessionId) {
    return null;
  }

  if (String(previousSession.sessionId) !== String(nextSession.sessionId)) {
    return null;
  }

  return sessionContainsUserReply(nextSession, pendingUserMessage) ? null : pendingUserMessage;
}

function countPromptCharacters(value) {
  return Array.from(String(value || '').trim()).length;
}

function buildCreationSessionContext(input = {}) {
  if (!input || typeof input !== 'object') {
    return null;
  }

  return {
    prompt: input.prompt || input.description || '',
    title: input.title || '',
    entryMode: input.entryMode || 'create',
    orientation: input.orientation || 'portrait',
    generationTier: input.generationTier || 'standard',
    sourceGameId: input.sourceGameId || '',
  };
}

function getCreationFlowStageFromState(state) {
  if (state.isGenerating) {
    return 'generating';
  }

  const sessionStatus = state.creationSession?.status || '';

  if (sessionStatus === 'initializing') {
    return 'initializing';
  }

  if (sessionStatus === 'ready') {
    return 'ready_to_generate';
  }

  if (sessionStatus === 'collecting') {
    return 'collecting';
  }

  if (sessionStatus === 'expired') {
    return 'expired';
  }

  if (sessionStatus === 'abandoned') {
    return 'abandoned';
  }

  if (sessionStatus === 'failed') {
    return 'failed';
  }

  if (sessionStatus === 'completed') {
    return 'completed';
  }

  if (state.currentGame && isCompletedGameStatus(state.currentGame?.status)) {
    return 'completed';
  }

  return 'idle';
}

function normalizeTrackedTaskItem(item) {
  if (!item?.taskId) {
    return null;
  }

  return {
    taskId: String(item.taskId),
    taskType: item.taskType || 'pipeline_run',
    gameId: item.gameId || '',
    gameTitle: item.gameTitle || '',
    promptPreview: item.promptPreview || '',
    status: item.status || 'queued',
    progressPct: clampProgress(item.progressPct, 0),
    latestMessage: item.latestMessage || '',
    updatedAt: item.updatedAt || Date.now(),
    createdAt: item.createdAt || item.updatedAt || Date.now(),
    completedAt: item.completedAt || null,
    terminalErrorMessage: item.terminalErrorMessage || '',
  };
}

function loadTrackedTaskItems() {
  try {
    const raw = Taro.getStorageSync(TRACKED_GENERATION_TASKS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const nextItems = parsed
      .map(normalizeTrackedTaskItem)
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, TRACKED_TASKS_LIMIT);

    if (nextItems.length !== parsed.length) {
      saveTrackedTaskItems(nextItems);
    }

    return nextItems;
  } catch (error) {
    console.warn('Failed to load tracked task items:', error);
    return [];
  }
}

function saveTrackedTaskItems(items) {
  try {
    Taro.setStorageSync(TRACKED_GENERATION_TASKS_KEY, JSON.stringify(items.slice(0, TRACKED_TASKS_LIMIT)));
  } catch (error) {
    console.warn('Failed to save tracked task items:', error);
  }
}

function mergeTrackedTaskItems(previous, nextItem) {
  const normalizedItem = normalizeTrackedTaskItem(nextItem);
  if (!normalizedItem) {
    return previous;
  }

  const nextItems = [
    normalizedItem,
    ...previous.filter((item) => item.taskId !== normalizedItem.taskId),
  ]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, TRACKED_TASKS_LIMIT);

  saveTrackedTaskItems(nextItems);
  return nextItems;
}

function removeTrackedTaskItem(previous, taskId) {
  const nextItems = previous.filter((item) => item.taskId !== taskId);
  saveTrackedTaskItems(nextItems);
  return nextItems;
}

function ensureTaskWebSocketConnected() {
  const token = Storage.getToken();
  if (!token) {
    return;
  }

  const ws = getWebSocketManager();
  if (!ws || ws.getIsConnected()) {
    return;
  }

  ws.connect(token).catch(() => {
    // Polling remains the primary source of truth.
  });
}

function buildTrackedTaskItem(task, options = {}) {
  if (!task?.taskId) {
    return null;
  }

  const taskType = (() => {
    const explicitTaskType = options.taskType || '';
    if (explicitTaskType && explicitTaskType !== 'pipeline_run') {
      return explicitTaskType;
    }
    return task.taskType || explicitTaskType || 'pipeline_run';
  })();

  return normalizeTrackedTaskItem({
    taskId: task.taskId,
    taskType,
    gameId: options.gameId || task.gameId || '',
    gameTitle: options.gameTitle || '',
    promptPreview: options.promptPreview || '',
    status: task.status,
    progressPct: task.progressPct,
    latestMessage: options.latestMessage || '',
    updatedAt: Date.now(),
    createdAt: options.createdAt || Date.now(),
    completedAt: task.completedAt || null,
    terminalErrorMessage: task.terminalError?.message || options.terminalErrorMessage || '',
  });
}

function persistActiveGenerationTask(task, options = {}) {
  if (!task?.taskId || isTerminalTaskStatus(task.status)) {
    clearPersistedGenerationTaskSnapshot();
    return;
  }

  try {
    Taro.setStorageSync(
      ACTIVE_GENERATION_TASK_KEY,
      JSON.stringify({
        taskId: task.taskId,
        taskType: options.taskType || task.taskType || '',
        gameId: options.gameId || task.gameId || '',
        status: task.status || 'queued',
        version: task.version ?? null,
        updatedAt: Date.now(),
      })
    );
  } catch (error) {
    console.warn('Failed to persist active generation task snapshot:', error);
  }
}

export function clearPersistedGenerationTaskSnapshot() {
  try {
    Taro.removeStorageSync(ACTIVE_GENERATION_TASK_KEY);
  } catch (error) {
    console.warn('Failed to clear active generation task snapshot:', error);
  }
}

export function setPersistedGenerationTaskSnapshot(snapshot) {
  if (!snapshot?.taskId) {
    clearPersistedGenerationTaskSnapshot();
    return;
  }

  try {
    Taro.setStorageSync(
      ACTIVE_GENERATION_TASK_KEY,
      JSON.stringify({
        taskId: snapshot.taskId,
        taskType: snapshot.taskType || 'pipeline_run',
        gameId: snapshot.gameId || '',
        status: snapshot.status || 'queued',
        version: snapshot.version ?? null,
        updatedAt: Date.now(),
      })
    );
  } catch (error) {
    console.warn('Failed to set active generation task snapshot:', error);
  }
}

export function getPersistedGenerationTaskSnapshot() {
  try {
    const raw = Taro.getStorageSync(ACTIVE_GENERATION_TASK_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const age = Date.now() - (parsed.updatedAt || 0);

    if (!parsed.taskId || age > ACTIVE_GENERATION_TASK_MAX_AGE_MS || isTerminalTaskStatus(parsed.status)) {
      clearPersistedGenerationTaskSnapshot();
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to read active generation task snapshot:', error);
    return null;
  }
}

export function isCompletedGameStatus(status) {
  return COMPLETED_GAME_STATUSES.includes(status);
}

export function isTerminalTaskStatus(status) {
  return TERMINAL_TASK_STATUSES.has(status);
}

async function loadGameWithRetry(gameId, attempts = 3) {
  if (!gameId) {
    return null;
  }

  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await gameService.getGame(gameId);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        // Give the backend a brief moment to finalize status and bundle metadata.
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

function buildFallbackCompletedGame(task, state) {
  const gameId = task?.gameId || state.generatingGameId || state.currentGame?.id || '';
  const previewUrl = task?.previewUrl || state.currentGame?.previewUrl || '';
  const gameUrl = task?.gameUrl || state.currentGame?.gameUrl || '';

  if (!gameId || (!previewUrl && !gameUrl)) {
    return null;
  }

  const trackedTask = state.trackedTasks.find((item) => item.taskId === task?.taskId);

  return {
    ...(state.currentGame || {}),
    id: gameId,
    title: trackedTask?.gameTitle || state.currentGame?.title || '',
    status: state.currentGame?.status || 'draft',
    gameUrl: gameUrl || state.currentGame?.gameUrl || '',
    previewUrl: previewUrl || state.currentGame?.previewUrl || '',
    coverUrl: task?.coverUrl || state.currentGame?.coverUrl || '',
    canPlay: state.canPlay !== false,
    requireSubscription: state.canPlay === false,
  };
}

function buildUnlockedCurrentGame(currentGame, payload) {
  const unlockedGame = payload?.game || {};

  return {
    ...(currentGame || {}),
    ...unlockedGame,
    id: unlockedGame.id || currentGame?.id || payload?.gameId || '',
    canPlay: true,
    requireSubscription: false,
    quotaRemaining: payload?.quotaRemaining ?? unlockedGame.quotaRemaining ?? currentGame?.quotaRemaining ?? null,
  };
}

export const useGameStore = create((set, get) => {
  const applyCreationSessionSnapshot = (session, overrides = {}) => {
    const previousSession = get().creationSession;
    const previousStreamingReply = get().creationSessionStreamingReply;
    const previousPendingUserMessage = get().creationSessionPendingUserMessage;
    const rawNextSession = session || null;
    const nextSession = isStaleCreationSessionSnapshot(previousSession, rawNextSession)
      ? previousSession
      : rawNextSession;
    const previousRuntimeKey = getCreationSessionRuntimeBindingKey(previousSession);
    const nextRuntimeKey = getCreationSessionRuntimeBindingKey(nextSession);
    const runtimeBindingActive = hasActiveSessionRuntimeBinding();
    const preserveStreamConnection = Boolean(
      previousRuntimeKey
      && previousRuntimeKey === nextRuntimeKey
      && get().creationSessionStreamConnected
      && runtimeBindingActive
    );
    const nextStreamingReply = isStaleCreationSessionSnapshot(previousSession, rawNextSession)
      ? previousStreamingReply
      : resolveCreationSessionStreamingReply(previousSession, nextSession, previousStreamingReply);
    const nextPendingUserMessage = isStaleCreationSessionSnapshot(previousSession, rawNextSession)
      ? previousPendingUserMessage
      : resolveCreationSessionPendingUserMessage(previousSession, nextSession, previousPendingUserMessage);

    set({
      creationSession: nextSession,
      creationSessionUiState: buildCreationSessionUiState(nextSession),
      creationSessionContext: nextSession
        ? buildCreationSessionContext({
            prompt: nextSession.initialPrompt || nextSession.prompt,
            title: nextSession.title,
            entryMode: nextSession.entryMode,
            orientation: nextSession.orientation,
            generationTier: nextSession.generationTier,
            sourceGameId: nextSession.sourceGameId,
          })
        : null,
      creationSessionStreamingReply: nextStreamingReply,
      creationSessionPendingUserMessage: nextPendingUserMessage,
      creationSessionStreamConnected: preserveStreamConnection,
      ...overrides,
    });

    if (previousRuntimeKey !== nextRuntimeKey) {
      bindCreationSessionRuntime(nextSession);
    } else if (nextRuntimeKey && !runtimeBindingActive) {
      bindCreationSessionRuntime(nextSession);
    }
    return nextSession;
  };

  const bindCreationSessionRuntime = (session) => {
    clearActiveSessionRuntime();

    const runtimePhase = getCreationSessionRuntimePhase(session);
    if (!session?.sessionId || !runtimePhase) {
      return;
    }

    const ws = getWebSocketManager();
    const targetSessionId = String(session.sessionId);

    ensureTaskWebSocketConnected();

    const applyRuntimeSessionSnapshot = (payloadSession, overrides = {}) => {
      const nextSession = gameService.normalizeCreationSessionSnapshot(payloadSession);

      if (!nextSession?.sessionId || String(nextSession.sessionId) !== targetSessionId) {
        return;
      }

      applyCreationSessionSnapshot(nextSession, {
        creationSessionRestoring: false,
        creationSessionError: null,
        ...overrides,
      });
    };

    const applyRuntimeSessionError = (message, details = {}) => {
      const currentSession = get().creationSession;
      if (String(currentSession?.sessionId || '') !== targetSessionId) {
        return;
      }

      const isInitializationFailure = currentSession?.status === 'initializing'
        || details?.reason === 'init_failed'
        || details?.reason === 'init_timeout';

      if (isInitializationFailure) {
        applyCreationSessionSnapshot(
          {
            ...currentSession,
            status: 'abandoned',
            metadata: {
              ...(currentSession.metadata || {}),
              initError: message || '',
              initReason: details?.reason || '',
            },
          },
          {
            creationSessionSubmitting: false,
            creationSessionRestoring: false,
            creationSessionError: deriveCreationSessionErrorMessage(
              message,
              '创作会话初始化失败，请重新开始'
            ),
            creationSessionStreamingReply: null,
            creationSessionPendingUserMessage: null,
            creationSessionStreamConnected: false,
          }
        );
        return;
      }

      set({
        creationSessionSubmitting: false,
        creationSessionRestoring: false,
        creationSessionError: deriveCreationSessionErrorMessage(
          message,
          '鍒涗綔浼氳瘽澶勭悊澶辫触锛岃绋嶅悗閲嶈瘯'
        ),
        creationSessionStreamingReply: null,
        creationSessionPendingUserMessage: null,
      });
    };

    activeSessionStreamUnsubscribe = gameService.subscribeCreationSessionStream(session, {
      onOpen: () => {
        const currentSession = get().creationSession;
        if (String(currentSession?.sessionId || '') !== targetSessionId) {
          return;
        }

        set({ creationSessionStreamConnected: true });
      },
      onBootstrap: (event) => {
        if (event?.session) {
          applyRuntimeSessionSnapshot(event.session, {
            creationSessionStreamConnected: true,
          });
          return;
        }

        set({ creationSessionStreamConnected: true });
      },
      onSnapshot: (event) => {
        if (!event?.session) {
          return;
        }

        applyRuntimeSessionSnapshot(event.session, {
          creationSessionStreamConnected: true,
        });
      },
      onDelta: (event) => {
        if (!event?.sessionId || String(event.sessionId) !== targetSessionId) {
          return;
        }

        const currentSession = get().creationSession;
        if (String(currentSession?.sessionId || '') !== targetSessionId || !getCreationSessionRuntimePhase(currentSession)) {
          return;
        }

        set({
          creationSessionStreamConnected: true,
          creationSessionStreamingReply: {
            id: event.messageId || 'assistant-stream',
            role: 'assistant',
            kind: event.kind || 'question',
            content: event.accumulated || event.delta || '',
            createdAt: event.timestamp || Date.now(),
            isStreaming: true,
          },
        });
      },
      onDone: (event) => {
        if (!event?.sessionId || String(event.sessionId) !== targetSessionId) {
          return;
        }

        const currentSession = get().creationSession;
        if (String(currentSession?.sessionId || '') !== targetSessionId || !getCreationSessionRuntimePhase(currentSession)) {
          return;
        }

        set({
          creationSessionStreamConnected: true,
          creationSessionStreamingReply: {
            id: event.messageId || 'assistant-stream',
            role: 'assistant',
            kind: event.kind || 'question',
            content: event.message || '',
            createdAt: event.timestamp || Date.now(),
            isStreaming: false,
          },
        });
      },
      onError: (event) => {
        if (!event?.sessionId || String(event.sessionId) !== targetSessionId) {
          return;
        }

        applyRuntimeSessionError(event.message, {
          ...(event.details || {}),
          reason: event.code || event.details?.reason || '',
        });
      },
      onTransportError: () => {
        const currentSession = get().creationSession;
        if (String(currentSession?.sessionId || '') !== targetSessionId) {
          return;
        }

        set({ creationSessionStreamConnected: false });
      },
    });

    if (ws) {
      const handleSessionUpdated = (payload) => {
        const payloadSession = payload?.session || payload;
        applyRuntimeSessionSnapshot(payloadSession);
      };

      const handleSessionError = (payload) => {
        const payloadSessionId = String(payload?.sessionId || payload?.session?.sessionId || '');
        if (payloadSessionId && payloadSessionId !== targetSessionId) {
          return;
        }

        clearActiveSessionRuntime();
        applyRuntimeSessionError(payload?.error || payload?.message, payload?.details || {});
      };

      ws.onMessage('session:updated', handleSessionUpdated);
      ws.onMessage('session:error', handleSessionError);

      activeSessionWebSocketUnsubscribers.push(() => ws.offMessage('session:updated', handleSessionUpdated));
      activeSessionWebSocketUnsubscribers.push(() => ws.offMessage('session:error', handleSessionError));
    }

    if (runtimePhase !== 'initializing') {
      return;
    }

    let pollCount = 0;

    activeSessionPollInterval = setInterval(async () => {
      const state = get();
      const currentSession = state.creationSession;

      if (
        String(currentSession?.sessionId || '') !== targetSessionId
        || currentSession?.status !== 'initializing'
      ) {
        clearActiveSessionRuntime();
        return;
      }

      pollCount += 1;

      try {
        const freshSession = await gameService.getCreationSession(targetSessionId);

        if (!freshSession) {
          return;
        }

        if (freshSession.status !== 'initializing') {
          applyCreationSessionSnapshot(freshSession, {
            creationSessionSubmitting: false,
            creationSessionRestoring: false,
            creationSessionError: null,
          });
          return;
        }

        if (pollCount < SESSION_INIT_MAX_POLLS) {
          return;
        }

        clearActiveSessionRuntime();

        applyCreationSessionSnapshot(
          {
            ...freshSession,
            status: 'abandoned',
            metadata: {
              ...(freshSession.metadata || {}),
              initError: freshSession?.metadata?.initError || 'Session initialization timed out',
              initReason: freshSession?.metadata?.initReason || 'init_timeout',
            },
          },
          {
            creationSessionSubmitting: false,
            creationSessionRestoring: false,
            creationSessionError: '创作会话初始化超时，请重新开始',
          }
        );
      } catch (_error) {
        if (pollCount < SESSION_INIT_MAX_POLLS) {
          return;
        }

        clearActiveSessionRuntime();

        const latestSession = get().creationSession;
        applyCreationSessionSnapshot(
          latestSession
            ? {
                ...latestSession,
                status: 'abandoned',
                metadata: {
                  ...(latestSession.metadata || {}),
                  initError: latestSession?.metadata?.initError || 'Session initialization timed out',
                  initReason: latestSession?.metadata?.initReason || 'init_timeout',
                },
              }
            : null,
          {
            creationSessionSubmitting: false,
            creationSessionRestoring: false,
            creationSessionError: '创作会话初始化超时，请重新开始',
          }
        );
      }
    }, SESSION_INIT_POLL_INTERVAL_MS);
  };

  const waitForCreationSessionReady = async (sessionId, options = {}) => {
    const targetSessionId = String(sessionId || get().creationSession?.sessionId || '');
    if (!targetSessionId) {
      return null;
    }

    const timeoutMs = Number.isFinite(Number(options.timeoutMs))
      ? Math.max(0, Number(options.timeoutMs))
      : SESSION_READY_WAIT_TIMEOUT_MS;
    const intervalMs = Number.isFinite(Number(options.intervalMs))
      ? Math.max(50, Number(options.intervalMs))
      : SESSION_READY_WAIT_INTERVAL_MS;
    const deadline = Date.now() + timeoutMs;
    const readMatchingSession = () => {
      const currentSession = get().creationSession;
      if (String(currentSession?.sessionId || '') !== targetSessionId) {
        return null;
      }

      return currentSession;
    };

    const currentSession = readMatchingSession();
    if (currentSession?.status && currentSession.status !== 'initializing') {
      return currentSession;
    }

    while (Date.now() < deadline) {
      await delay(intervalMs);

      const nextSession = readMatchingSession();
      if (nextSession?.status && nextSession.status !== 'initializing') {
        return nextSession;
      }
    }

    return readMatchingSession();
  };

  const recoverCreationSessionRevisionConflict = async (sessionId) => {
    const message = '会话已更新，请基于最新版本继续操作';

    if (!sessionId) {
      return message;
    }

    try {
      await get().refreshCreationSession(sessionId);
    } catch (_refreshError) {
      // Keep the user-facing conflict hint even if the refresh also fails.
    }

    return message;
  };

  return ({
  currentGame: null,
  currentTask: null,
  currentTaskEvents: [],
  currentTaskCursor: 0,
  createEntryIntent: null,
  myGames: [],
  trackedTasks: loadTrackedTaskItems(),
  isGenerating: false,
  generationProgress: null,
  generatingGameId: null,
  isLoading: false,
  error: null,
  terminalError: null,
  latestTaskMessage: '',
  canPlay: true,
  creationSession: null,
  creationSessionUiState: buildCreationSessionUiState(null),
  creationSessionError: null,
  creationSessionSubmitting: false,
  creationSessionRestoring: false,
  creationSessionContext: null,
  creationSessionStreamingReply: null,
  creationSessionPendingUserMessage: null,
  creationSessionStreamConnected: false,
  startCreationSession: async (prompt, title, options = {}) => {
    if (countPromptCharacters(prompt) < 5) {
      throw new Error('至少输入 5 个字，再开始这一轮');
    }

    // #4 鍙屽嚮闃叉姢锛氬鏋滄鍦ㄦ彁浜ゆ垨鎭㈠涓紝鎷掔粷閲嶅璇锋眰
    if (get().creationSessionSubmitting || get().creationSessionRestoring) {
      throw new Error('正在处理中，请稍候');
    }

    const previousGame = get().currentGame;
    const context = buildCreationSessionContext({
      prompt,
      title,
      ...options,
    });
    const shouldPreserveCurrentGame = context?.entryMode === 'iterate';

    clearActiveTaskRuntime();
    clearActiveSessionRuntime();

    set({
      currentGame: shouldPreserveCurrentGame ? previousGame : null,
      currentTask: null,
      currentTaskEvents: [],
      currentTaskCursor: 0,
      isGenerating: false,
      generationProgress: null,
      generatingGameId: null,
      error: null,
      terminalError: null,
      latestTaskMessage: '',
      creationSession: null,
      creationSessionUiState: buildCreationSessionUiState(null),
      creationSessionError: null,
      creationSessionSubmitting: true,
      creationSessionRestoring: false,
      creationSessionContext: context,
      creationSessionStreamingReply: null,
      creationSessionPendingUserMessage: null,
      creationSessionStreamConnected: false,
    });

    try {
      const session = await gameService.createCreationSession(prompt, title, options);
      applyCreationSessionSnapshot(session, {
        creationSessionSubmitting: false,
        creationSessionError: null,
      });
      return session;
    } catch (error) {
      const message = deriveCreationSessionErrorMessage(error, '创建创作会话失败，请稍后重试');
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }
  },

  restoreActiveCreationSession: async (options = {}) => {
    const { silentIfMissing = false } = options;

    clearActiveSessionRuntime();

    set({
      creationSessionRestoring: true,
      creationSessionError: null,
      creationSessionStreamingReply: null,
      creationSessionPendingUserMessage: null,
      creationSessionStreamConnected: false,
    });

    try {
      const session = await gameService.getActiveCreationSession();
      applyCreationSessionSnapshot(session, {
        creationSessionRestoring: false,
      });

      if (session?.generationTask?.taskId) {
        await get()._beginTaskTracking(session.generationTask, {
          gameId: session.gameId || session.generationTask.gameId,
          resetEvents: true,
          preloadGame: true,
          taskMeta: {
            gameTitle: session.title || '',
            promptPreview: session.prompt ? String(session.prompt).slice(0, 80) : '',
          },
        });
      }

      return session;
    } catch (error) {
      if (silentIfMissing && (error?.statusCode === 404 || /not found|涓嶅瓨鍦▅娌℃湁/i.test(error?.message || ''))) {
        clearActiveSessionRuntime();
        set({
          creationSession: null,
          creationSessionUiState: buildCreationSessionUiState(null),
          creationSessionRestoring: false,
          creationSessionError: null,
          creationSessionStreamingReply: null,
          creationSessionPendingUserMessage: null,
          creationSessionStreamConnected: false,
        });
        return null;
      }

      const message = deriveCreationSessionErrorMessage(error, '恢复创作会话失败，请手动重新开始');
      set({
        creationSessionRestoring: false,
        creationSessionError: message,
        creationSessionStreamingReply: null,
        creationSessionPendingUserMessage: null,
        creationSessionStreamConnected: false,
      });
      throw new Error(message);
    }
  },

  getMatchingActiveCreationSession: async (options = {}) => {
    const {
      entryMode = '',
      sourceGameId = '',
      silentIfMissing = true,
    } = options;

    try {
      const session = await gameService.getActiveCreationSession();
      const matchesEntryMode = !entryMode || session?.entryMode === entryMode;
      const expectedSourceGameId = String(sourceGameId || '');
      const matchesSourceGameId = !expectedSourceGameId
        || String(session?.sourceGameId || '') === expectedSourceGameId;

      get().resetCreationSessionState();

      if (matchesEntryMode && matchesSourceGameId) {
        return session;
      }

      return null;
    } catch (error) {
      if (silentIfMissing && (error?.statusCode === 404 || /not found|涓嶅瓨鍦▅娌℃湁/i.test(error?.message || ''))) {
        get().resetCreationSessionState();
        return null;
      }

      const message = deriveCreationSessionErrorMessage(error, '恢复创作会话失败，请手动重新开始');
      set({
        creationSessionError: message,
      });
      throw new Error(message);
    }
  },

  refreshCreationSession: async (sessionId) => {
    const targetSessionId = sessionId || get().creationSession?.sessionId;
    if (!targetSessionId) {
      return null;
    }

    set({ creationSessionSubmitting: true, creationSessionError: null });

    try {
      const session = await gameService.getCreationSession(targetSessionId);
      applyCreationSessionSnapshot(session, {
        creationSessionSubmitting: false,
      });
      return session;
    } catch (error) {
      const message = deriveCreationSessionErrorMessage(error, '鍒锋柊鍒涗綔浼氳瘽澶辫触锛岃绋嶅悗閲嶈瘯');
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }
  },

  confirmEditedPrompt: async (content, options = {}) => {
    let session = get().creationSession;
    const normalizedContent = normalizeSessionMessageContent(content);
    if (!session?.sessionId) {
      throw new Error('当前没有可确认的创作会话');
    }

    if (!normalizedContent) {
      throw new Error('请先完善提示词内容');
    }

    if (session.status === 'initializing') {
      set({
        creationSessionSubmitting: true,
        creationSessionError: null,
      });

      session = await waitForCreationSessionReady(session.sessionId);
    }

    if (session?.status === 'initializing') {
      const message = 'AI 还在整理提示词，请稍等';
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }

    if (session && ['abandoned', 'expired', 'failed'].includes(String(session.status || ''))) {
      const message = deriveCreationSessionErrorMessage(
        session?.metadata?.initError || session?.metadata?.lastError || '',
        '创作会话初始化失败，请重新开始'
      );
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }

    set({
      creationSessionSubmitting: true,
      creationSessionError: null,
      creationSessionPendingUserMessage: buildPendingCreationSessionUserMessage(normalizedContent, session),
    });

    try {
      const nextSession = await gameService.confirmEditedPrompt(
        session.sessionId,
        normalizedContent,
        options.revision ?? session.revision
      );

      applyCreationSessionSnapshot(nextSession, {
        creationSessionSubmitting: false,
      });

      return nextSession;
    } catch (error) {
      const message = isCreationSessionRevisionConflictError(error)
        ? await recoverCreationSessionRevisionConflict(session.sessionId)
        : deriveCreationSessionErrorMessage(error, '确认提示词失败，请稍后重试');

      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
        creationSessionPendingUserMessage: null,
      });
      throw new Error(message);
    }
  },

  answerCreationSessionQuestion: async (content, options = {}) => (
    get().confirmEditedPrompt(content, options)
  ),

  confirmCurrentPrompt: async (options = {}) => {
    let session = get().creationSession;
    if (!session?.sessionId) {
      throw new Error('当前没有可确认的创作会话');
    }

    if (session.status === 'initializing') {
      set({
        creationSessionSubmitting: true,
        creationSessionError: null,
      });

      session = await waitForCreationSessionReady(session.sessionId);
    }

    if (session?.status === 'initializing') {
      const message = 'AI 还在整理提示词，请稍等';
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }

    if (session && ['abandoned', 'expired', 'failed'].includes(String(session.status || ''))) {
      const message = deriveCreationSessionErrorMessage(
        session?.metadata?.initError || session?.metadata?.lastError || '',
        '创作会话初始化失败，请重新开始'
      );
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }

    set({ creationSessionSubmitting: true, creationSessionError: null });

    try {
      const nextSession = await gameService.confirmCurrentPrompt(
        session.sessionId,
        options.revision ?? session.revision
      );

      applyCreationSessionSnapshot(nextSession, {
        creationSessionSubmitting: false,
      });

      return nextSession;
    } catch (error) {
      const message = isCreationSessionRevisionConflictError(error)
        ? await recoverCreationSessionRevisionConflict(session.sessionId)
        : deriveCreationSessionErrorMessage(error, '确认当前提示词失败，请稍后重试');

      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }
  },

  skipCreationSessionQuestion: async (options = {}) => (
    get().confirmCurrentPrompt(options)
  ),

  confirmAndGenerate: async (promptOrOptions = {}, maybeOptions = {}) => {
    const hasPromptArgument = typeof promptOrOptions === 'string';
    const rawOptions = hasPromptArgument
      ? (maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {})
      : (promptOrOptions && typeof promptOrOptions === 'object' ? promptOrOptions : {});
    const normalizedEditedPrompt = normalizeSessionMessageContent(
      hasPromptArgument ? promptOrOptions : rawOptions.editedPrompt
    );
    const {
      editedPrompt: _ignoredEditedPrompt,
      ...generateOptions
    } = rawOptions || {};
    let session = get().creationSession;

    if (!session?.sessionId) {
      throw new Error('当前没有可生成的创作会话');
    }

    if (session.status === 'initializing') {
      set({
        creationSessionSubmitting: true,
        creationSessionError: null,
      });

      session = await waitForCreationSessionReady(session.sessionId);
    }

    if (session?.status === 'initializing') {
      const message = 'AI 还在整理提示词，请稍等';
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }

    const currentExpandedPrompt = normalizeSessionMessageContent(
      getCreationSessionExpandedPrompt(session)
    );
    const hasEditedPrompt = Boolean(normalizedEditedPrompt);
    const hasPromptChanges = hasEditedPrompt && normalizedEditedPrompt !== currentExpandedPrompt;

    if (session?.status === 'collecting' || hasPromptChanges) {
      session = hasPromptChanges
        ? await get().confirmEditedPrompt(normalizedEditedPrompt, {
            revision: generateOptions.revision ?? session?.revision,
          })
        : await get().confirmCurrentPrompt({
            revision: generateOptions.revision ?? session?.revision,
          });
    }

    return get().generateFromCreationSession(session?.sessionId || '', {
      ...generateOptions,
      revision: session?.revision ?? generateOptions.revision,
      promptPreview: normalizedEditedPrompt || currentExpandedPrompt,
    });
  },

  generateFromCreationSession: async (sessionIdOrOptions = {}, maybeOptions = {}) => {
    // #4 鍙屽嚮闃叉姢锛氬鏋滄鍦ㄧ敓鎴愪腑锛屾嫆缁濋噸澶嶈姹?
    if (get().isGenerating || get().creationSessionSubmitting) {
      throw new Error('正在处理中，请稍候');
    }

    const session = get().creationSession;
    const hasLegacySessionId = typeof sessionIdOrOptions === 'string' && sessionIdOrOptions.trim();
    const targetSessionId = hasLegacySessionId
      ? sessionIdOrOptions.trim()
      : session?.sessionId || '';
    const rawOptions = hasLegacySessionId
      ? (maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {})
      : (sessionIdOrOptions && typeof sessionIdOrOptions === 'object' ? sessionIdOrOptions : {});
    let resolvedSession = session?.sessionId === targetSessionId ? session : null;

    if (!targetSessionId) {
      throw new Error('当前没有可生成的创作会话');
    }

    if (resolvedSession?.status === 'initializing') {
      set({
        creationSessionSubmitting: true,
        creationSessionError: null,
      });

      resolvedSession = await waitForCreationSessionReady(targetSessionId);
    }

    if (resolvedSession?.status === 'initializing') {
      const message = 'AI 还在整理第一轮问题，请稍等后再试';
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }

    if (resolvedSession && ['abandoned', 'expired', 'failed'].includes(String(resolvedSession.status || ''))) {
      const message = deriveCreationSessionErrorMessage(
        resolvedSession?.metadata?.initError || resolvedSession?.metadata?.lastError || '',
        '创作会话初始化失败，请重新开始'
      );
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }

    if (resolvedSession?.status === 'collecting') {
      const message = '请先确认提示词，再开始生成';
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }

    const options = {
      ...(rawOptions || {}),
      ...((rawOptions?.revision == null && resolvedSession?.revision != null)
        ? { revision: resolvedSession.revision }
        : {}),
    };

    clearActiveTaskRuntime();
    clearActiveSessionRuntime();

    set({
      currentTask: null,
      currentTaskEvents: [],
      currentTaskCursor: 0,
      creationSessionSubmitting: true,
      creationSessionError: null,
      creationSessionStreamingReply: null,
      creationSessionPendingUserMessage: null,
      creationSessionStreamConnected: false,
      error: null,
      terminalError: null,
      isGenerating: true,
      generationProgress: {
        stages: PIPELINE_STAGES,
        stageIndex: 0,
        stageKey: PIPELINE_STAGES[0].key,
        stageLabel: PIPELINE_STAGES[0].label,
        message: PIPELINE_STAGE_SUMMARIES[PIPELINE_STAGES[0].key] || PIPELINE_STAGES[0].label,
        pct: PIPELINE_STAGES[0].pct,
      },
      latestTaskMessage: PIPELINE_STAGE_SUMMARIES[PIPELINE_STAGES[0].key] || PIPELINE_STAGES[0].label,
    });

    try {
      const result = await gameService.generateFromCreationSession(targetSessionId, options);
      const gameId = result.gameId || resolvedSession?.gameId || '';
      const gameTitle = options.title || result.title || resolvedSession?.title || '';
      const promptPreview = options.promptPreview
        ? String(options.promptPreview).slice(0, 80)
        : getCreationSessionExpandedPrompt(resolvedSession)
          ? String(getCreationSessionExpandedPrompt(resolvedSession)).slice(0, 80)
          : '';
      const trackedTaskType = resolvedSession?.entryMode === 'iterate'
        ? 'pipeline_iterate'
        : (result.generationTask?.taskType || 'pipeline_run');
      const trackedTaskGameId = resolvedSession?.entryMode === 'iterate'
        ? (resolvedSession?.sourceGameId || gameId)
        : gameId;

      const nextGeneratingSession = resolvedSession
        ? {
            ...resolvedSession,
            status: 'generating',
            gameId,
          }
        : get().creationSession;

      set({
        generatingGameId: gameId,
        isLoading: false,
        canPlay: result.canPlay !== false,
        creationSessionSubmitting: false,
        creationSessionStreamingReply: null,
        creationSessionPendingUserMessage: null,
        creationSessionStreamConnected: false,
        creationSession: nextGeneratingSession,
        creationSessionUiState: buildCreationSessionUiState(nextGeneratingSession),
      });

      if (result.generationTask?.taskId) {
        set((state) => ({
          trackedTasks: mergeTrackedTaskItems(
            state.trackedTasks,
            buildTrackedTaskItem(result.generationTask, {
              gameId: trackedTaskGameId,
              taskType: trackedTaskType,
              gameTitle,
              promptPreview,
              latestMessage: PIPELINE_STAGE_SUMMARIES[PIPELINE_STAGES[0].key] || PIPELINE_STAGES[0].label,
            })
          ),
        }));

        await get()._beginTaskTracking(result.generationTask, {
          gameId,
          resetEvents: true,
          preloadGame: false,
          taskMeta: {
            taskType: trackedTaskType,
            routeGameId: trackedTaskGameId,
            gameTitle,
            promptPreview,
          },
        });
      } else {
        throw new Error('浼氳瘽鐢熸垚鍝嶅簲缂哄皯 generationTask');
      }

      return result;
    } catch (error) {
      const message = isCreationSessionRevisionConflictError(error)
        ? await recoverCreationSessionRevisionConflict(targetSessionId)
        : deriveCreationSessionErrorMessage(error, '鐢熸垚闃舵閬囧埌闂锛屽彲绋嶅悗閲嶈瘯');
      const runtimeBindingActive = hasActiveSessionRuntimeBinding();
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
        creationSessionStreamingReply: null,
        creationSessionPendingUserMessage: null,
        creationSessionStreamConnected: runtimeBindingActive
          ? get().creationSessionStreamConnected
          : false,
        isGenerating: false,
        generationProgress: null,
        latestTaskMessage: '',
      });

      const recoverySession = get().creationSession || resolvedSession;
      if (!runtimeBindingActive && getCreationSessionRuntimePhase(recoverySession)) {
        bindCreationSessionRuntime(recoverySession);
      }

      throw new Error(message);
    }
  },

  abandonCreationSession: async (sessionId) => {
    const targetSessionId = sessionId || get().creationSession?.sessionId;
    if (!targetSessionId) {
      return null;
    }

    set({ creationSessionSubmitting: true, creationSessionError: null });

    try {
      const nextSession = await gameService.abandonCreationSession(targetSessionId);
      clearActiveSessionRuntime();
      applyCreationSessionSnapshot(
        nextSession || {
          ...(get().creationSession || {}),
          sessionId: targetSessionId,
          status: 'abandoned',
        },
        {
          creationSessionSubmitting: false,
        }
      );
      return nextSession;
    } catch (error) {
      const message = deriveCreationSessionErrorMessage(error, '缁撴潫鍒涗綔浼氳瘽澶辫触锛岃绋嶅悗閲嶈瘯');
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }
  },

  resetCreationSessionState: () => {
    clearActiveSessionRuntime();
    set({
      creationSession: null,
      creationSessionUiState: buildCreationSessionUiState(null),
      creationSessionError: null,
      creationSessionSubmitting: false,
      creationSessionRestoring: false,
      creationSessionContext: null,
      creationSessionStreamingReply: null,
      creationSessionPendingUserMessage: null,
      creationSessionStreamConnected: false,
    });
  },

  getCreationSessionUiState: () => buildCreationSessionUiState(get().creationSession),
  getCreationFlowStage: () => getCreationFlowStageFromState(get()),

  _beginTaskTracking: async (task, options = {}) => {
    clearActiveTaskRuntime();
    ensureTaskWebSocketConnected();

    const gameId = options.gameId || task?.gameId || '';
    const taskMeta = options.taskMeta || {};
    const trackedTaskType = taskMeta.taskType || task?.taskType || 'pipeline_run';
    const trackedTaskGameId = taskMeta.routeGameId || gameId;
    const progress = buildProgressFromTask(task, []);

    set((state) => ({
      currentTask: {
        ...task,
        taskType: trackedTaskType,
      },
      currentTaskEvents: options.resetEvents ? [] : state.currentTaskEvents,
      currentTaskCursor: options.resetEvents ? 0 : state.currentTaskCursor,
      generatingGameId: gameId,
      isGenerating: !isTerminalTaskStatus(task?.status),
      isLoading: false,
      error: null,
      terminalError: task?.terminalError || null,
      latestTaskMessage: progress.message,
      generationProgress: progress,
      trackedTasks: mergeTrackedTaskItems(
        state.trackedTasks,
        buildTrackedTaskItem(task, {
          gameId: trackedTaskGameId,
          taskType: trackedTaskType,
          gameTitle: taskMeta.gameTitle || state.currentGame?.title || '',
          promptPreview: taskMeta.promptPreview || '',
          latestMessage: progress.message,
        })
      ),
    }));

    persistActiveGenerationTask(task, {
      taskType: trackedTaskType,
      gameId: trackedTaskGameId,
    });

    if (options.preloadGame !== false && gameId && String(get().currentGame?.id || '') !== String(gameId)) {
      gameService.getGame(gameId).then((game) => {
        if (game) {
          set({
            currentGame: game,
            canPlay: game.canPlay !== false,
          });
        }
      }).catch(() => {});
    }

    get()._bindTaskWebSocket(task.taskId, gameId);

    if (isTerminalTaskStatus(task?.status)) {
      await get()._handleTaskTerminal(task);
      return;
    }

    await get()._syncTaskEvents(task.taskId, { reset: true });

    // #8 鍒濆鍖栭樁娈靛仠婊炴娴?
    lastStageKey = task.displayStageKey || null;
    lastStageChangedAt = Date.now();
    staleStageWarned = false;

    activeTaskPollInterval = setInterval(() => {
      const currentTask = useGameStore.getState().currentTask;
      if (!currentTask?.taskId || currentTask.taskId !== task.taskId) {
        return;
      }

      // #8 闃舵鍋滄粸妫€娴嬶細鍚屼竴闃舵鍋滅暀瓒呰繃闃堝€兼椂缁欏嚭鎻愮ず
      const currentStageKey = currentTask.displayStageKey;
      if (currentStageKey && currentStageKey !== lastStageKey) {
        lastStageKey = currentStageKey;
        lastStageChangedAt = Date.now();
        staleStageWarned = false;
      } else if (
        !staleStageWarned
        && lastStageChangedAt > 0
        && Date.now() - lastStageChangedAt > STAGE_STALE_WARN_MS
      ) {
        staleStageWarned = true;
        Taro.showToast({
          title: '生成时间较长，请耐心等待或稍后查看',
          icon: 'none',
          duration: 3000,
        });
      }

      void useGameStore.getState()._syncTask(task.taskId);
    }, 4000);

    activeEventPollInterval = setInterval(() => {
      const currentTask = useGameStore.getState().currentTask;
      if (!currentTask?.taskId || currentTask.taskId !== task.taskId) {
        return;
      }
      void useGameStore.getState()._syncTaskEvents(task.taskId);
    }, 2500);

    activeTimeoutId = setTimeout(() => {
      const store = useGameStore.getState();
      if (!store.isGenerating || store.currentTask?.taskId !== task.taskId) {
        return;
      }

      void store._handleTaskTerminal({
        ...store.currentTask,
        status: 'timed_out',
        terminalError: store.currentTask?.terminalError || {
          errorCode: 'task_timeout',
          message: '鍒涗綔瓒呮椂锛岃绋嶅悗鍒扳€滄垜鐨勪綔鍝佲€濋噷鏌ョ湅缁撴灉',
        },
      });
    }, ACTIVE_TASK_TIMEOUT_MS);
  },

  _syncTask: async (taskId) => {
    try {
      const task = await gameService.getGenerationTask(taskId);
      if (!task?.taskId) {
        return;
      }

      await get()._applyTaskUpdate(task);
    } catch (_error) {
      // Keep polling on transient failures.
    }
  },

  _syncTaskEvents: async (taskId, options = {}) => {
    const { reset = false } = options;

    try {
      const cursor = reset ? undefined : (get().currentTaskCursor || undefined);
      const response = await gameService.getGenerationTaskEvents(taskId, cursor, 50);
      if (!response) {
        return;
      }

      const mergedEvents = mergeTaskEvents(
        reset ? [] : get().currentTaskEvents,
        response.items || []
      );
      const latestTask = get().currentTask;
      const nextCursor = response.nextCursor || (mergedEvents.length ? mergedEvents[mergedEvents.length - 1].seqNo : 0);
      const progress = latestTask
        ? buildProgressFromTask(latestTask, mergedEvents)
        : get().generationProgress;
      const existingTrackedTask = get().trackedTasks.find((item) => item.taskId === taskId);

      set((state) => ({
        currentTaskEvents: mergedEvents,
        currentTaskCursor: nextCursor,
        latestTaskMessage: progress?.message || getLatestTaskMessage(mergedEvents, ''),
        generationProgress: progress || state.generationProgress,
        trackedTasks: latestTask?.taskId
          ? mergeTrackedTaskItems(
            state.trackedTasks,
            buildTrackedTaskItem(latestTask, {
                gameId: existingTrackedTask?.gameId || latestTask.gameId,
                taskType: existingTrackedTask?.taskType || latestTask.taskType,
                gameTitle: existingTrackedTask?.gameTitle || state.currentGame?.title || '',
                promptPreview: existingTrackedTask?.promptPreview || '',
                latestMessage: progress?.message || getLatestTaskMessage(mergedEvents, ''),
              })
            )
          : state.trackedTasks,
      }));
    } catch (_error) {
      // Keep polling even if event fetching fails.
    }
  },

  _applyTaskUpdate: async (task) => {
    // #6 绔炴€侀槻鎶わ細濡傛灉鏂版暟鎹殑杩涘害姣斿綋鍓嶅凡鏈夌殑鏇存棫锛岃烦杩囨洿鏂?
    const currentTask = get().currentTask;
    if (
      currentTask?.taskId === task.taskId
      && currentTask?.progressPct != null
      && task?.progressPct != null
      && Number(task.progressPct) < Number(currentTask.progressPct)
      && !isTerminalTaskStatus(task.status)
    ) {
      return;
    }

    const events = get().currentTaskEvents;
    const progress = buildProgressFromTask(task, events);
    const existingTrackedTask = get().trackedTasks.find((item) => item.taskId === task.taskId);
    const trackedTaskType = existingTrackedTask?.taskType || task.taskType || 'pipeline_run';
    const trackedTaskGameId = existingTrackedTask?.gameId || task.gameId || get().generatingGameId;

    set((state) => ({
      currentTask: {
        ...task,
        taskType: trackedTaskType,
      },
      generatingGameId: task.gameId || state.generatingGameId,
      generationProgress: progress,
      latestTaskMessage: progress.message,
      terminalError: task.terminalError || null,
      isLoading: false,
      trackedTasks: mergeTrackedTaskItems(
        state.trackedTasks,
        buildTrackedTaskItem(task, {
          gameId: trackedTaskGameId,
          taskType: trackedTaskType,
          gameTitle: existingTrackedTask?.gameTitle || state.currentGame?.title || '',
          promptPreview: existingTrackedTask?.promptPreview || '',
          latestMessage: progress.message,
          terminalErrorMessage: task.terminalError?.message || '',
        })
      ),
    }));

    persistActiveGenerationTask(task, {
      taskType: trackedTaskType,
      gameId: trackedTaskGameId,
    });

    if (isTerminalTaskStatus(task.status)) {
      await get()._handleTaskTerminal(task);
    }
  },

  _bindTaskWebSocket: (taskId, gameId) => {
    const ws = getWebSocketManager();
    if (!ws) {
      return;
    }

    const refreshTask = () => {
      const store = useGameStore.getState();
      if (store.currentTask?.taskId !== taskId) {
        return;
      }
      void store._syncTask(taskId);
      void store._syncTaskEvents(taskId);
    };

    const progressHandler = (payload) => {
      if (payload?.taskId && payload.taskId !== taskId) {
        return;
      }
      if (payload?.gameId && gameId && payload.gameId !== gameId) {
        return;
      }
      refreshTask();
    };

    const completeHandler = (payload) => {
      if (payload?.taskId && payload.taskId !== taskId) {
        return;
      }
      refreshTask();
    };

    const errorHandler = (payload) => {
      if (payload?.taskId && payload.taskId !== taskId) {
        return;
      }
      refreshTask();
    };

    ws.onMessage('gen:progress', progressHandler);
    ws.onMessage('gen:complete', completeHandler);
    ws.onMessage('gen:error', errorHandler);

    activeWebSocketUnsubscribers.push(() => ws.offMessage('gen:progress', progressHandler));
    activeWebSocketUnsubscribers.push(() => ws.offMessage('gen:complete', completeHandler));
    activeWebSocketUnsubscribers.push(() => ws.offMessage('gen:error', errorHandler));
  },

  _handleTaskTerminal: async (task) => {
    clearActiveTaskRuntime();
    const existingTrackedTask = get().trackedTasks.find((item) => item.taskId === task?.taskId);
    const trackedTaskType = existingTrackedTask?.taskType || task?.taskType || 'pipeline_run';
    const trackedTaskGameId = existingTrackedTask?.gameId || task?.gameId || get().generatingGameId;

    // Treat both "succeeded" (frontend) and "completed" (schema) as success.
    if (task?.status === 'succeeded' || task?.status === 'completed') {
      const doneProgress = buildProgressFromTask(
        { ...task, status: 'succeeded', progressPct: 100 },
        get().currentTaskEvents
      );

      try {
        const game = await loadGameWithRetry(task.gameId || get().generatingGameId);
        const canPlayGame = game?.canPlay !== false;

        set((state) => ({
          currentTask: {
            ...task,
            taskType: trackedTaskType,
          },
          currentGame: game,
          canPlay: canPlayGame,
          generationProgress: doneProgress,
          latestTaskMessage: doneProgress.message,
          terminalError: null,
          error: null,
          trackedTasks: mergeTrackedTaskItems(
            state.trackedTasks,
            buildTrackedTaskItem(
              { ...task, progressPct: 100, completedAt: task.completedAt || new Date().toISOString() },
              {
                gameId: trackedTaskGameId,
                taskType: trackedTaskType,
                gameTitle: game?.title || state.currentGame?.title || '',
                promptPreview: state.trackedTasks.find((item) => item.taskId === task.taskId)?.promptPreview || '',
                latestMessage: doneProgress.message,
              }
            )
          ),
        }));

        useQuotaStore.getState().updateAfterCreate(canPlayGame, game?.quotaRemaining);
        await useQuotaStore.getState().fetchQuota(true);
        clearPersistedGenerationTaskSnapshot();

        setTimeout(() => {
          const store = useGameStore.getState();
          if (store.currentTask?.taskId !== task.taskId) {
            return;
          }
          store._finishGenerationTransition();
        }, 600);
        return;
      } catch (_error) {
        const fallbackGame = buildFallbackCompletedGame(task, get());
        clearPersistedGenerationTaskSnapshot();

        if (fallbackGame) {
          const canPlayGame = fallbackGame?.canPlay !== false;

          set((state) => ({
            currentTask: {
              ...task,
              taskType: trackedTaskType,
            },
            currentGame: fallbackGame,
            canPlay: canPlayGame,
            generationProgress: doneProgress,
            latestTaskMessage: doneProgress.message,
            terminalError: null,
            error: null,
            trackedTasks: mergeTrackedTaskItems(
              state.trackedTasks,
              buildTrackedTaskItem(
                { ...task, progressPct: 100, completedAt: task.completedAt || new Date().toISOString() },
                {
                  gameId: trackedTaskGameId,
                  taskType: trackedTaskType,
                  gameTitle: fallbackGame?.title || state.currentGame?.title || '',
                  promptPreview: state.trackedTasks.find((item) => item.taskId === task.taskId)?.promptPreview || '',
                  latestMessage: doneProgress.message,
                }
              )
            ),
          }));

          useQuotaStore.getState().updateAfterCreate(canPlayGame, fallbackGame?.quotaRemaining);
          await useQuotaStore.getState().fetchQuota(true);

          setTimeout(() => {
            const store = useGameStore.getState();
            if (store.currentTask?.taskId !== task.taskId) {
              return;
            }
            store._finishGenerationTransition();
          }, 600);
          return;
        }

        set({
          currentTask: task,
          isGenerating: false,
          isLoading: false,
          generationProgress: null,
          generatingGameId: null,
          error: '作品已生成完成，但加载结果失败，请到“我的作品”查看',
          terminalError: null,
        });
        return;
      }
    }

    clearPersistedGenerationTaskSnapshot();
    set((state) => ({
      currentTask: {
        ...task,
        taskType: trackedTaskType,
      },
      isGenerating: false,
      isLoading: false,
      generationProgress: null,
      generatingGameId: null,
      error: deriveTaskErrorMessage(task),
      terminalError: task?.terminalError || null,
      trackedTasks: mergeTrackedTaskItems(
        state.trackedTasks,
        buildTrackedTaskItem(
          { ...task, completedAt: task.completedAt || new Date().toISOString() },
          {
            gameId: trackedTaskGameId,
            taskType: trackedTaskType,
            gameTitle: state.trackedTasks.find((item) => item.taskId === task.taskId)?.gameTitle || state.currentGame?.title || '',
            promptPreview: state.trackedTasks.find((item) => item.taskId === task.taskId)?.promptPreview || '',
            latestMessage: deriveTaskErrorMessage(task),
            terminalErrorMessage: task?.terminalError?.message || '',
          }
        )
      ),
    }));
  },

  _finishGenerationTransition: () => {
    set({
      isGenerating: false,
      isLoading: false,
      generationProgress: null,
      generatingGameId: null,
    });
  },

  restorePersistedTask: async (snapshot) => {
    const persistedTask = snapshot || getPersistedGenerationTaskSnapshot();
    if (!persistedTask?.taskId) {
      return false;
    }

    set({
      isLoading: true,
      isGenerating: true,
      error: null,
      terminalError: null,
      creationSessionError: null,
      currentTask: {
        taskId: persistedTask.taskId,
        taskType: persistedTask.taskType || '',
        gameId: persistedTask.gameId || '',
        status: persistedTask.status || 'queued',
        progressPct: 0,
      },
      currentTaskEvents: [],
      currentTaskCursor: 0,
      latestTaskMessage: '姝ｅ湪鎭㈠鍒涗綔浠诲姟...',
      generationProgress: {
        stages: PIPELINE_STAGES,
        stageIndex: 0,
        stageKey: PIPELINE_STAGES[0].key,
        stageLabel: '姝ｅ湪鎭㈠鍒涗綔浠诲姟...',
        message: '姝ｅ湪鎭㈠鍒涗綔浠诲姟...',
        pct: PIPELINE_STAGES[0].pct,
      },
      generatingGameId: persistedTask.gameId || null,
    });

    try {
      const [task, game] = await Promise.all([
        gameService.getGenerationTask(persistedTask.taskId),
        persistedTask.gameId ? gameService.getGame(persistedTask.gameId).catch(() => null) : Promise.resolve(null),
      ]);

      if (game) {
        set({
          currentGame: game,
          canPlay: game.canPlay !== false,
        });
      }

      if (!task?.taskId) {
        throw new Error('任务不存在');
      }

        await get()._beginTaskTracking(task, {
          gameId: persistedTask.gameId || task.gameId,
          resetEvents: true,
          preloadGame: false,
          taskMeta: {
            taskType: persistedTask.taskType || task.taskType || 'pipeline_run',
            routeGameId: persistedTask.gameId || task.gameId || '',
          },
        });

      return true;
    } catch (_error) {
      clearPersistedGenerationTaskSnapshot();
      set({
        isLoading: false,
        isGenerating: false,
        generationProgress: null,
        currentTask: null,
        generatingGameId: null,
        error: '恢复创作任务失败，请重新开始',
      });
      return false;
    }
  },

  cancelCurrentTask: async () => {
    const task = get().currentTask;
    if (!task?.taskId || !get().isGenerating) {
      return false;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await gameService.cancelGenerationTask(task.taskId);
      const nextStatus = response?.status || 'canceled';
      const nextTask = {
        ...task,
        status: nextStatus,
        cancelRequested: true,
        completedAt: task.completedAt || new Date().toISOString(),
      };

      if (isTerminalTaskStatus(nextStatus)) {
        await get()._handleTaskTerminal(nextTask);
      } else {
        set({
          currentTask: nextTask,
          isLoading: false,
        });
        persistActiveGenerationTask(nextTask);
        setTimeout(() => {
          void get()._syncTask(task.taskId);
        }, 1000);
      }

      return true;
    } catch (error) {
      set({
        isLoading: false,
        error: error?.message || '鍙栨秷浠诲姟澶辫触锛岃閲嶈瘯',
      });
      throw error;
    }
  },

  hydrateTrackedTasks: () => {
    const trackedTasks = loadTrackedTaskItems();
    set({ trackedTasks });
    return trackedTasks;
  },

  refreshTrackedTask: async (taskId) => {
    if (!taskId) {
      return null;
    }

    try {
      const task = await gameService.getGenerationTask(taskId);
      if (!task?.taskId) {
        return null;
      }

      const existingTrackedTask = get().trackedTasks.find((item) => item.taskId === taskId);
      let gameTitle = existingTrackedTask?.gameTitle || '';

      if (!isTerminalTaskStatus(task.status) && task.gameId && !gameTitle) {
        const game = await gameService.getGame(task.gameId).catch(() => null);
        if (game?.title) {
          gameTitle = game.title;
        }
      }

      set((state) => {
        const currentTrackedTask = state.trackedTasks.find((item) => item.taskId === taskId);
        return {
          trackedTasks: mergeTrackedTaskItems(
            state.trackedTasks,
            buildTrackedTaskItem(task, {
              gameId: existingTrackedTask?.gameId || task.gameId,
              taskType: existingTrackedTask?.taskType || task.taskType,
              gameTitle,
              promptPreview: currentTrackedTask?.promptPreview || existingTrackedTask?.promptPreview || '',
              latestMessage: currentTrackedTask?.latestMessage || existingTrackedTask?.latestMessage || '',
              terminalErrorMessage: task.terminalError?.message || '',
            })
          ),
        };
      });

      return task;
    } catch (_error) {
      return null;
    }
  },

  refreshTrackedTasks: async () => {
    const trackedTasks = get().trackedTasks;
    if (!trackedTasks.length) {
      return [];
    }

    const refreshedTasks = [];
    for (const task of trackedTasks) {
      const nextTask = await get().refreshTrackedTask(task.taskId);
      if (nextTask) {
        refreshedTasks.push(nextTask);
      }
    }
    return refreshedTasks;
  },

  cancelTaskById: async (taskId) => {
    if (!taskId) {
      return false;
    }

    if (get().currentTask?.taskId === taskId) {
      return get().cancelCurrentTask();
    }

    await gameService.cancelGenerationTask(taskId);
    await get().refreshTrackedTask(taskId);
    return true;
  },

  removeTrackedTask: (taskId) => {
    if (!taskId) {
      return;
    }

    set((state) => ({
      trackedTasks: removeTrackedTaskItem(state.trackedTasks, taskId),
    }));
  },


  publishGame: async (gameId, data) => {
    set({ isLoading: true, error: null });

    try {
      const publishedGame = await gameService.publishGame(gameId, data);
      set({ currentGame: publishedGame, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: error?.message || '鍙戝竷澶辫触' });
      throw error;
    }
  },

  fetchMyGames: async (page = 1, limit = 10) => {
    set({ isLoading: true, error: null });

    try {
      const result = await gameService.getMyGames(page, limit);
      set({
        myGames: page === 1 ? result.items : [...get().myGames, ...result.items],
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false, error: error?.message || '鍔犺浇澶辫触' });
      throw error;
    }
  },

  resetCreateSession: (options = {}) => {
    const { clearPersistedTask = true } = options;

    clearActiveTaskRuntime();
    clearActiveSessionRuntime();
    if (clearPersistedTask) {
      clearPersistedGenerationTaskSnapshot();
    }

    set({
      currentGame: null,
      currentTask: null,
      currentTaskEvents: [],
      currentTaskCursor: 0,
      isGenerating: false,
      generationProgress: null,
      generatingGameId: null,
      isLoading: false,
      error: null,
      terminalError: null,
      latestTaskMessage: '',
      canPlay: true,
      creationSession: null,
      creationSessionUiState: buildCreationSessionUiState(null),
      creationSessionError: null,
      creationSessionSubmitting: false,
      creationSessionRestoring: false,
      creationSessionContext: null,
      creationSessionStreamingReply: null,
      creationSessionPendingUserMessage: null,
      creationSessionStreamConnected: false,
    });
  },

  setCreateEntryIntent: (intent) => set({ createEntryIntent: intent || null }),

  consumeCreateEntryIntent: () => {
    const intent = get().createEntryIntent;
    set({ createEntryIntent: null });
    return intent;
  },

  setCurrentGame: (game) => set({
    currentGame: game,
    canPlay: game?.canPlay !== false,
  }),
  clearError: () => set({ error: null, terminalError: null, creationSessionError: null }),
  });
});

let hasBoundUnlockedGameSync = false;

function bindUnlockedGameSync() {
  if (hasBoundUnlockedGameSync) {
    return;
  }

  hasBoundUnlockedGameSync = true;
  subscribeGameUnlocked((payload) => {
    const state = useGameStore.getState();
    const payloadGameId = String(payload?.gameId || '');
    if (!payloadGameId) {
      return;
    }

    const currentGameId = String(state.currentGame?.id || '');
    const generatingGameId = String(state.generatingGameId || '');
    const matchesCurrentGame = currentGameId && currentGameId === payloadGameId;
    const matchesGeneratingGame = generatingGameId && generatingGameId === payloadGameId;

    if (!matchesCurrentGame && !matchesGeneratingGame) {
      return;
    }

    useGameStore.setState((prev) => ({
      currentGame: buildUnlockedCurrentGame(prev.currentGame, payload),
      canPlay: true,
    }));
  });
}

bindUnlockedGameSync();

export { PIPELINE_STAGES };
export default useGameStore;
