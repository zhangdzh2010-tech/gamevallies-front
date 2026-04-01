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
//   Schema uses: "completed" (≈ succeeded), "cancelled" (UK spelling)
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
// #8 阶段停滞检测：同一阶段超过此时间触发提示
const STAGE_STALE_WARN_MS = 5 * 60 * 1000;
const TRACKED_TASKS_LIMIT = 20;
const SESSION_INIT_POLL_INTERVAL_MS = 2000;
const SESSION_INIT_MAX_POLLS = 15;

const PIPELINE_STAGES = [
  { key: 'submitting', label: '提交创作请求', pct: 5 },
  { key: 'intent_parsing', label: '解析游戏意图', pct: 18 },
  { key: 'designing', label: '设计游戏参数', pct: 32 },
  { key: 'template_matching', label: '匹配游戏模板', pct: 46 },
  { key: 'code_generating', label: '生成游戏代码', pct: 64 },
  { key: 'qa_checking', label: '质量检查中', pct: 78 },
  { key: 'runtime_qa', label: '运行时验证', pct: 88 },
  { key: 'code_review', label: 'AI 代码审查', pct: 94 },
  { key: 'completed', label: '生成完成', pct: 100 },
];

const STAGE_KEY_ALIASES = {
  started: 'submitting',
  queued: 'submitting',
  submitting: 'submitting',
  dialogue_slot_extract: 'intent_parsing',
  'dialogue.slot_extract': 'intent_parsing',
  dialogue_reply: 'intent_parsing',
  'dialogue.reply': 'intent_parsing',
  intent_parse: 'intent_parsing',
  intent_parsing: 'intent_parsing',
  designing: 'designing',
  template_match: 'template_matching',
  template_matching: 'template_matching',
  code_generate: 'code_generating',
  code_generating: 'code_generating',
  qa_fix: 'qa_checking',
  qa_checking: 'qa_checking',
  runtime_qa: 'runtime_qa',
  code_review: 'code_review',
  completed: 'completed',
  succeeded: 'completed',
};

const DISPLAY_PIPELINE_STAGES = PIPELINE_STAGES.length
  ? [
      { key: 'submitting', label: '提交创作请求', pct: 5 },
      { key: 'spec_build', label: '构建游戏规格', pct: 15 },
      { key: 'runtime_profile_select', label: '选择运行时模板', pct: 30 },
      { key: 'contract_compose', label: '组装运行时约束', pct: 40 },
      { key: 'logic_generate', label: '生成游戏逻辑', pct: 60 },
      { key: 'contract_qa', label: '合约校验与修复', pct: 76 },
      { key: 'runtime_simulation_qa', label: '运行时模拟校验', pct: 92 },
      { key: 'completed', label: '生成完成', pct: 100 },
    ]
  : [];

const DISPLAY_STAGE_KEY_ALIASES = {
  ...STAGE_KEY_ALIASES,
  dialogue_slot_extract: 'submitting',
  'dialogue.slot_extract': 'submitting',
  dialogue_reply: 'submitting',
  'dialogue.reply': 'submitting',
  intent_parse: 'submitting',
  intent_parsing: 'submitting',
  request_normalized: 'submitting',
  spec_build: 'spec_build',
  runtime_profile_select: 'runtime_profile_select',
  template_match: 'runtime_profile_select',
  template_matching: 'runtime_profile_select',
  designing: 'contract_compose',
  contract_compose: 'contract_compose',
  logic_generate: 'logic_generate',
  code_generate: 'logic_generate',
  code_generating: 'logic_generate',
  contract_qa: 'contract_qa',
  qa_fix: 'contract_qa',
  qa_checking: 'contract_qa',
  targeted_remediation: 'contract_qa',
  runtime_simulation_qa: 'runtime_simulation_qa',
  runtime_qa: 'runtime_simulation_qa',
  code_review: 'runtime_simulation_qa',
  completed: 'completed',
  succeeded: 'completed',
};

let activeTaskPollInterval = null;
let activeEventPollInterval = null;
let activeTimeoutId = null;
let activeWebSocketUnsubscribers = [];
let activeSessionPollInterval = null;
let activeSessionWebSocketUnsubscribers = [];
// #8 阶段停滞检测状态
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

  // #8 同步重置阶段停滞检测状态，防止残留到下一个 task
  lastStageKey = null;
  lastStageChangedAt = 0;
  staleStageWarned = false;
}

function clearActiveSessionRuntime() {
  if (activeSessionPollInterval) {
    clearInterval(activeSessionPollInterval);
    activeSessionPollInterval = null;
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

function clampProgress(progress, fallback = 5) {
  const value = Number(progress);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getDisplayStageDefinition(stageKey) {
  return DISPLAY_PIPELINE_STAGES.find((stage) => stage.key === stageKey) || DISPLAY_PIPELINE_STAGES[0];
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
    if (key === 'targeted_remediation') {
      return Number(task?.progressPct) >= 90
        ? 'runtime_simulation_qa'
        : 'contract_qa';
    }

    if (DISPLAY_STAGE_KEY_ALIASES[key]) {
      return DISPLAY_STAGE_KEY_ALIASES[key];
    }
  }

  return DISPLAY_PIPELINE_STAGES[0].key;
}

function getStageAlias(task) {
  if (task?.status === 'succeeded') {
    return 'completed';
  }

  if (
    task?.displayStageKey
    && DISPLAY_PIPELINE_STAGES.some((stage) => stage.key === task.displayStageKey)
  ) {
    return task.displayStageKey;
  }

  return getFallbackStageAlias(task);
}

function getLatestTaskMessage(events, fallback = '') {
  const latestEvent = Array.isArray(events) && events.length > 0
    ? events[events.length - 1]
    : null;

  return latestEvent?.message || fallback;
}

function buildProgressFromTask(task, events = []) {
  const stageKey = getStageAlias(task);
  const stageIndex = Math.max(0, DISPLAY_PIPELINE_STAGES.findIndex((stage) => stage.key === stageKey));
  const stage = getDisplayStageDefinition(stageKey);
  const fallbackPct = task?.status === 'succeeded'
    ? 100
    : clampProgress(task?.displayStagePct, stage.pct);
  const fallbackLabel = task?.status === 'canceled' || task?.status === 'cancelled'
    ? '已取消创作任务'
    : task?.status === 'timed_out'
      ? '任务超时'
      : task?.status === 'failed'
        ? '创作失败'
        : stage.label;
  const stageLabel = task?.status === 'canceled' || task?.status === 'cancelled'
    ? '已取消创作任务'
    : task?.status === 'timed_out'
      ? '任务超时'
      : task?.status === 'failed'
        ? (task?.displayStageLabel || stage.label || '创作失败')
        : (task?.displayStageLabel || stage.label || fallbackLabel);
  const message = getLatestTaskMessage(events, task?.progressMessage || stageLabel || fallbackLabel);

  return {
    stageIndex,
    stageKey,
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

  return task.terminalError?.message || '创作失败，请稍后重试';
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
    const nextSession = session || null;

    set({
      creationSession: nextSession,
      creationSessionContext: nextSession
        ? buildCreationSessionContext({
            prompt: nextSession.prompt,
            title: nextSession.title,
            entryMode: nextSession.entryMode,
            orientation: nextSession.orientation,
            generationTier: nextSession.generationTier,
            sourceGameId: nextSession.sourceGameId,
          })
        : null,
      ...overrides,
    });

    bindCreationSessionRuntime(nextSession);
    return nextSession;
  };

  const bindCreationSessionRuntime = (session) => {
    clearActiveSessionRuntime();

    if (!session?.sessionId || session.status !== 'initializing') {
      return;
    }

    const ws = getWebSocketManager();
    const targetSessionId = String(session.sessionId);

    ensureTaskWebSocketConnected();

    if (ws) {
      const handleSessionUpdated = (payload) => {
        const payloadSession = payload?.session || payload;
        const nextSession = gameService.normalizeCreationSessionSnapshot(payloadSession);

        if (!nextSession?.sessionId || String(nextSession.sessionId) !== targetSessionId) {
          return;
        }

        applyCreationSessionSnapshot(nextSession, {
          creationSessionSubmitting: false,
          creationSessionRestoring: false,
          creationSessionError: null,
        });
      };

      const handleSessionError = (payload) => {
        const payloadSessionId = String(payload?.sessionId || payload?.session?.sessionId || '');
        if (payloadSessionId && payloadSessionId !== targetSessionId) {
          return;
        }

        clearActiveSessionRuntime();

        const currentSession = get().creationSession;
        const nextSession = currentSession && String(currentSession.sessionId || '') === targetSessionId
          ? {
              ...currentSession,
              status: 'abandoned',
              metadata: {
                ...(currentSession.metadata || {}),
                initError: payload?.error || payload?.message || '',
                initReason: payload?.details?.reason || '',
              },
            }
          : null;

        applyCreationSessionSnapshot(nextSession, {
          creationSessionSubmitting: false,
          creationSessionRestoring: false,
          creationSessionError: deriveCreationSessionErrorMessage(
            payload?.error || payload?.message,
            '创作会话初始化失败，请重新开始'
          ),
        });
      };

      ws.onMessage('session:updated', handleSessionUpdated);
      ws.onMessage('session:error', handleSessionError);

      activeSessionWebSocketUnsubscribers.push(() => ws.offMessage('session:updated', handleSessionUpdated));
      activeSessionWebSocketUnsubscribers.push(() => ws.offMessage('session:error', handleSessionError));
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
  creationSessionError: null,
  creationSessionSubmitting: false,
  creationSessionRestoring: false,
  creationSessionContext: null,
  startCreationSession: async (prompt, title, options = {}) => {
    if (countPromptCharacters(prompt) < 5) {
      throw new Error('至少输入 5 个字，再开始这一轮');
    }

    // #4 双击防护：如果正在提交或恢复中，拒绝重复请求
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
      creationSessionError: null,
      creationSessionSubmitting: true,
      creationSessionRestoring: false,
      creationSessionContext: context,
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
      if (silentIfMissing && (error?.statusCode === 404 || /not found|不存在|没有/i.test(error?.message || ''))) {
        clearActiveSessionRuntime();
        set({
          creationSession: null,
          creationSessionRestoring: false,
          creationSessionError: null,
        });
        return null;
      }

      const message = deriveCreationSessionErrorMessage(error, '恢复创作会话失败，请手动重新开始');
      set({
        creationSessionRestoring: false,
        creationSessionError: message,
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
      if (silentIfMissing && (error?.statusCode === 404 || /not found|不存在|没有/i.test(error?.message || ''))) {
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
      const message = deriveCreationSessionErrorMessage(error, '刷新创作会话失败，请稍后重试');
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }
  },

  answerCreationSessionQuestion: async (content, options = {}) => {
    const session = get().creationSession;
    if (!session?.sessionId) {
      throw new Error('当前没有可回答的创作会话');
    }

    if (session.status === 'initializing') {
      const message = 'AI 还在整理第一轮问题，请稍等';
      set({ creationSessionError: message });
      throw new Error(message);
    }

    set({ creationSessionSubmitting: true, creationSessionError: null });

    try {
      const nextSession = await gameService.appendCreationSessionMessage(
        session.sessionId,
        content,
        options.revision ?? session.revision
      );

      applyCreationSessionSnapshot(nextSession, {
        creationSessionSubmitting: false,
      });

      return nextSession;
    } catch (error) {
      const message = deriveCreationSessionErrorMessage(error, '提交回答失败，请稍后重试');

      // #7 版本冲突时自动刷新 session 获取最新 revision
      if (/revision|版本冲突|冲突/i.test(error?.message || '')) {
        try {
          await get().refreshCreationSession(session.sessionId);
        } catch (_refreshError) {
          // 刷新失败则保持原错误消息
        }
      }

      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }
  },

  skipCreationSessionQuestion: async (options = {}) => {
    const session = get().creationSession;
    if (!session?.sessionId) {
      throw new Error('当前没有可跳过的创作会话');
    }

    if (session.status === 'initializing') {
      const message = 'AI 还在整理第一轮问题，请稍等';
      set({ creationSessionError: message });
      throw new Error(message);
    }

    set({ creationSessionSubmitting: true, creationSessionError: null });

    try {
      const nextSession = await gameService.skipCreationSessionQuestion(
        session.sessionId,
        options.revision ?? session.revision
      );

      applyCreationSessionSnapshot(nextSession, {
        creationSessionSubmitting: false,
      });

      return nextSession;
    } catch (error) {
      const message = deriveCreationSessionErrorMessage(error, '跳过问题失败，请稍后重试');
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
      });
      throw new Error(message);
    }
  },

  generateFromCreationSession: async (sessionIdOrOptions = {}, maybeOptions = {}) => {
    // #4 双击防护：如果正在生成中，拒绝重复请求
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
    const options = {
      ...(rawOptions || {}),
      ...((rawOptions?.revision == null && session?.revision != null)
        ? { revision: session.revision }
        : {}),
    };
    const resolvedSession = session?.sessionId === targetSessionId ? session : null;

    if (!targetSessionId) {
      throw new Error('当前没有可生成的创作会话');
    }

    if (resolvedSession?.status === 'initializing') {
      const message = 'AI 还在整理第一轮问题，请稍等';
      set({ creationSessionError: message });
      throw new Error(message);
    }

    clearActiveTaskRuntime();
    clearActiveSessionRuntime();

    set({
      currentTask: null,
      currentTaskEvents: [],
      currentTaskCursor: 0,
      creationSessionSubmitting: true,
      creationSessionError: null,
      error: null,
      terminalError: null,
      isGenerating: true,
      generationProgress: {
        stageIndex: 0,
        stageKey: DISPLAY_PIPELINE_STAGES[0].key,
        stageLabel: DISPLAY_PIPELINE_STAGES[0].label,
        pct: DISPLAY_PIPELINE_STAGES[0].pct,
      },
      latestTaskMessage: DISPLAY_PIPELINE_STAGES[0].label,
    });

    try {
      const result = await gameService.generateFromCreationSession(targetSessionId, options);
      const gameId = result.gameId || resolvedSession?.gameId || '';
      const gameTitle = options.title || result.title || resolvedSession?.title || '';
      const promptPreview = options.promptPreview
        ? String(options.promptPreview).slice(0, 80)
        : resolvedSession?.prompt
          ? String(resolvedSession.prompt).slice(0, 80)
          : '';
      const trackedTaskType = resolvedSession?.entryMode === 'iterate'
        ? 'pipeline_iterate'
        : (result.generationTask?.taskType || 'pipeline_run');
      const trackedTaskGameId = resolvedSession?.entryMode === 'iterate'
        ? (resolvedSession?.sourceGameId || gameId)
        : gameId;

      set({
        generatingGameId: gameId,
        isLoading: false,
        canPlay: result.canPlay !== false,
        creationSessionSubmitting: false,
        creationSession: resolvedSession
          ? {
              ...resolvedSession,
              status: 'generating',
              gameId,
            }
          : get().creationSession,
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
              latestMessage: DISPLAY_PIPELINE_STAGES[0].label,
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
        throw new Error('会话生成响应缺少 generationTask');
      }

      return result;
    } catch (error) {
      const message = deriveCreationSessionErrorMessage(error, '生成阶段遇到问题，可稍后重试');
      set({
        creationSessionSubmitting: false,
        creationSessionError: message,
        isGenerating: false,
        generationProgress: null,
        latestTaskMessage: '',
      });
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
      const message = deriveCreationSessionErrorMessage(error, '结束创作会话失败，请稍后重试');
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
      creationSessionError: null,
      creationSessionSubmitting: false,
      creationSessionRestoring: false,
      creationSessionContext: null,
    });
  },

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

    // #8 初始化阶段停滞检测
    lastStageKey = task.displayStageKey || null;
    lastStageChangedAt = Date.now();
    staleStageWarned = false;

    activeTaskPollInterval = setInterval(() => {
      const currentTask = useGameStore.getState().currentTask;
      if (!currentTask?.taskId || currentTask.taskId !== task.taskId) {
        return;
      }

      // #8 阶段停滞检测：同一阶段停留超过阈值时给出提示
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
          message: '创作超时，请稍后到“我的作品”里查看结果',
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
    // #6 竞态防护：如果新数据的进度比当前已有的更旧，跳过更新
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
      latestTaskMessage: '正在恢复创作任务...',
      generationProgress: {
        stageIndex: 0,
        stageKey: DISPLAY_PIPELINE_STAGES[0].key,
        stageLabel: '正在恢复创作任务...',
        pct: DISPLAY_PIPELINE_STAGES[0].pct,
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
        error: error?.message || '取消任务失败，请重试',
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
      set({ isLoading: false, error: error?.message || '发布失败' });
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
      set({ isLoading: false, error: error?.message || '加载失败' });
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
      creationSessionError: null,
      creationSessionSubmitting: false,
      creationSessionRestoring: false,
      creationSessionContext: null,
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

export { DISPLAY_PIPELINE_STAGES as PIPELINE_STAGES };
export default useGameStore;
