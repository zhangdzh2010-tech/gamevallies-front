import Taro from '@tarojs/taro';
import { create } from 'zustand';
import * as gameService from '../services/game';
import { getWebSocketManager } from '../services/websocket';
import useQuotaStore from '../stores/quotaStore';
import { Storage } from '../utils/storage';

const COMPLETED_GAME_STATUSES = ['ready', 'draft', 'published', 'review'];
const TERMINAL_TASK_STATUSES = new Set(['succeeded', 'failed', 'canceled', 'timed_out']);
const ACTIVE_GENERATION_TASK_KEY = 'gamevallies_active_generation_task';
const TRACKED_GENERATION_TASKS_KEY = 'gamevallies_tracked_generation_tasks';
const ACTIVE_GENERATION_TASK_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ACTIVE_TASK_TIMEOUT_MS = 30 * 60 * 1000;
const TRACKED_TASKS_LIMIT = 12;

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

let activeTaskPollInterval = null;
let activeEventPollInterval = null;
let activeTimeoutId = null;
let activeWebSocketUnsubscribers = [];

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
}

function clampProgress(progress, fallback = 5) {
  const value = Number(progress);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getStageAlias(task) {
  if (task?.status === 'succeeded') {
    return 'completed';
  }

  const keys = [
    task?.progressStage,
    task?.currentStage,
    task?.currentStepKey,
    task?.stage,
    task?.stepKey,
  ].filter(Boolean);

  for (const key of keys) {
    if (STAGE_KEY_ALIASES[key]) {
      return STAGE_KEY_ALIASES[key];
    }
  }

  return 'submitting';
}

function getLatestTaskMessage(events, fallback = '') {
  const latestEvent = Array.isArray(events) && events.length > 0
    ? events[events.length - 1]
    : null;

  return latestEvent?.message || fallback;
}

function buildProgressFromTask(task, events = []) {
  const stageKey = getStageAlias(task);
  const stageIndex = Math.max(0, PIPELINE_STAGES.findIndex((stage) => stage.key === stageKey));
  const stage = PIPELINE_STAGES[stageIndex] || PIPELINE_STAGES[0];
  const fallbackPct = task?.status === 'succeeded' ? 100 : stage.pct;
  const fallbackLabel = task?.status === 'canceled'
    ? '已取消创作任务'
    : task?.status === 'timed_out'
      ? '任务超时'
      : task?.status === 'failed'
        ? '创作失败'
        : stage.label;

  return {
    stageIndex,
    stageKey,
    stageLabel: getLatestTaskMessage(events, task?.progressMessage || fallbackLabel),
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

  if (task.status === 'canceled') {
    return '已取消创作任务';
  }

  if (task.status === 'timed_out') {
    return '创作超时，请稍后到“我的作品”里查看结果';
  }

  return task.terminalError?.message || '创作失败，请稍后重试';
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
      .filter((item) => item && !isTerminalTaskStatus(item.status))
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

  if (isTerminalTaskStatus(normalizedItem.status)) {
    return removeTrackedTaskItem(previous, normalizedItem.taskId);
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

  return normalizeTrackedTaskItem({
    taskId: task.taskId,
    taskType: task.taskType,
    gameId: task.gameId || options.gameId || '',
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

function persistActiveGenerationTask(task) {
  if (!task?.taskId || isTerminalTaskStatus(task.status)) {
    clearPersistedGenerationTaskSnapshot();
    return;
  }

  try {
    Taro.setStorageSync(
      ACTIVE_GENERATION_TASK_KEY,
      JSON.stringify({
        taskId: task.taskId,
        taskType: task.taskType || '',
        gameId: task.gameId || '',
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
    coverUrl: previewUrl || gameUrl || state.currentGame?.coverUrl || '',
    canPlay: state.canPlay !== false,
    requireSubscription: state.canPlay === false,
  };
}

export const useGameStore = create((set, get) => ({
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

  createGame: async (description, title, type) => {
    clearActiveTaskRuntime();

    set({
      currentGame: null,
      currentTask: null,
      currentTaskEvents: [],
      currentTaskCursor: 0,
      isLoading: true,
      isGenerating: true,
      error: null,
      terminalError: null,
      latestTaskMessage: PIPELINE_STAGES[0].label,
      canPlay: true,
      generationProgress: {
        stageIndex: 0,
        stageKey: PIPELINE_STAGES[0].key,
        stageLabel: PIPELINE_STAGES[0].label,
        pct: PIPELINE_STAGES[0].pct,
      },
    });

    try {
      const result = await gameService.generateGame(description, title, type);
      const gameId = result.gameId;
      const gameTitle = result.title || title || '';
      const promptPreview = description ? String(description).slice(0, 80) : '';

      set({
        generatingGameId: gameId,
        isLoading: false,
        canPlay: result.canPlay !== false,
      });

      if (result.generationTask?.taskId) {
        set((state) => ({
          trackedTasks: mergeTrackedTaskItems(
            state.trackedTasks,
            buildTrackedTaskItem(result.generationTask, {
              gameId,
              gameTitle,
              promptPreview,
              latestMessage: PIPELINE_STAGES[0].label,
            })
          ),
        }));
      }

      if (result.generationTask?.taskId) {
        await get()._beginTaskTracking(result.generationTask, {
          gameId,
          resetEvents: true,
          preloadGame: false,
          taskMeta: {
            gameTitle,
            promptPreview,
          },
        });
      } else {
        throw new Error('创建响应缺少 generationTask');
      }

      return result;
    } catch (error) {
      const message = error?.message || '游戏创建失败，请稍后重试';
      clearPersistedGenerationTaskSnapshot();
      set({
        isLoading: false,
        isGenerating: false,
        generationProgress: null,
        generatingGameId: null,
        currentTask: null,
        error: message,
      });
      throw new Error(message);
    }
  },

  iterateGame: async (gameId, feedback) => {
    clearActiveTaskRuntime();

    set({
      currentTask: null,
      currentTaskEvents: [],
      currentTaskCursor: 0,
      isLoading: true,
      isGenerating: true,
      error: null,
      terminalError: null,
      latestTaskMessage: PIPELINE_STAGES[0].label,
      generationProgress: {
        stageIndex: 0,
        stageKey: PIPELINE_STAGES[0].key,
        stageLabel: PIPELINE_STAGES[0].label,
        pct: PIPELINE_STAGES[0].pct,
      },
    });

    try {
      const result = await gameService.iterateGame(gameId, feedback);
      const currentGame = get().currentGame;
      const gameTitle = currentGame?.title || '';
      const promptPreview = feedback ? String(feedback).slice(0, 80) : '';

      set({
        generatingGameId: result.gameId || gameId,
        isLoading: false,
      });

      if (result.generationTask?.taskId) {
        set((state) => ({
          trackedTasks: mergeTrackedTaskItems(
            state.trackedTasks,
            buildTrackedTaskItem(result.generationTask, {
              gameId: result.gameId || gameId,
              gameTitle,
              promptPreview,
              latestMessage: PIPELINE_STAGES[0].label,
            })
          ),
        }));
      }

      if (result.generationTask?.taskId) {
        await get()._beginTaskTracking(result.generationTask, {
          gameId: result.gameId || gameId,
          resetEvents: true,
          preloadGame: true,
          taskMeta: {
            gameTitle,
            promptPreview,
          },
        });
      } else {
        throw new Error('优化响应缺少 generationTask');
      }

      return result;
    } catch (error) {
      const message = error?.message || '优化失败，请重试';
      clearPersistedGenerationTaskSnapshot();
      set({
        isLoading: false,
        isGenerating: false,
        generationProgress: null,
        currentTask: null,
        error: message,
      });
      throw error;
    }
  },

  _beginTaskTracking: async (task, options = {}) => {
    clearActiveTaskRuntime();
    ensureTaskWebSocketConnected();

    const gameId = options.gameId || task?.gameId || '';
    const taskMeta = options.taskMeta || {};
    const progress = buildProgressFromTask(task, []);

    set((state) => ({
      currentTask: task,
      currentTaskEvents: options.resetEvents ? [] : state.currentTaskEvents,
      currentTaskCursor: options.resetEvents ? 0 : state.currentTaskCursor,
      generatingGameId: gameId,
      isGenerating: !isTerminalTaskStatus(task?.status),
      isLoading: false,
      error: null,
      terminalError: task?.terminalError || null,
      latestTaskMessage: progress.stageLabel,
      generationProgress: progress,
      trackedTasks: mergeTrackedTaskItems(
        state.trackedTasks,
        buildTrackedTaskItem(task, {
          gameId,
          gameTitle: taskMeta.gameTitle || state.currentGame?.title || '',
          promptPreview: taskMeta.promptPreview || '',
          latestMessage: progress.stageLabel,
        })
      ),
    }));

    persistActiveGenerationTask(task);

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

    activeTaskPollInterval = setInterval(() => {
      const currentTask = useGameStore.getState().currentTask;
      if (!currentTask?.taskId || currentTask.taskId !== task.taskId) {
        return;
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
        latestTaskMessage: progress?.stageLabel || getLatestTaskMessage(mergedEvents, ''),
        generationProgress: progress || state.generationProgress,
        trackedTasks: latestTask?.taskId
          ? mergeTrackedTaskItems(
              state.trackedTasks,
              buildTrackedTaskItem(latestTask, {
                gameId: latestTask.gameId,
                gameTitle: existingTrackedTask?.gameTitle || state.currentGame?.title || '',
                promptPreview: existingTrackedTask?.promptPreview || '',
                latestMessage: progress?.stageLabel || getLatestTaskMessage(mergedEvents, ''),
              })
            )
          : state.trackedTasks,
      }));
    } catch (_error) {
      // Keep polling even if event fetching fails.
    }
  },

  _applyTaskUpdate: async (task) => {
    const events = get().currentTaskEvents;
    const progress = buildProgressFromTask(task, events);
    const existingTrackedTask = get().trackedTasks.find((item) => item.taskId === task.taskId);

    set((state) => ({
      currentTask: task,
      generatingGameId: task.gameId || state.generatingGameId,
      generationProgress: progress,
      latestTaskMessage: progress.stageLabel,
      terminalError: task.terminalError || null,
      isLoading: false,
      trackedTasks: mergeTrackedTaskItems(
        state.trackedTasks,
        buildTrackedTaskItem(task, {
          gameId: task.gameId || state.generatingGameId,
          gameTitle: existingTrackedTask?.gameTitle || state.currentGame?.title || '',
          promptPreview: existingTrackedTask?.promptPreview || '',
          latestMessage: progress.stageLabel,
          terminalErrorMessage: task.terminalError?.message || '',
        })
      ),
    }));

    persistActiveGenerationTask(task);

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

    if (task?.status === 'succeeded') {
      const doneProgress = buildProgressFromTask(
        { ...task, status: 'succeeded', progressPct: 100 },
        get().currentTaskEvents
      );

      try {
        const game = await loadGameWithRetry(task.gameId || get().generatingGameId);
        const canPlayGame = game?.canPlay !== false;

        set((state) => ({
          currentTask: task,
          currentGame: game,
          canPlay: canPlayGame,
          generationProgress: doneProgress,
          latestTaskMessage: doneProgress.stageLabel,
          terminalError: null,
          error: null,
          trackedTasks: mergeTrackedTaskItems(
            state.trackedTasks,
            buildTrackedTaskItem(
              { ...task, progressPct: 100, completedAt: task.completedAt || new Date().toISOString() },
              {
                gameId: task.gameId || state.generatingGameId,
                gameTitle: game?.title || state.currentGame?.title || '',
                promptPreview: state.trackedTasks.find((item) => item.taskId === task.taskId)?.promptPreview || '',
                latestMessage: doneProgress.stageLabel,
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
            currentTask: task,
            currentGame: fallbackGame,
            canPlay: canPlayGame,
            generationProgress: doneProgress,
            latestTaskMessage: doneProgress.stageLabel,
            terminalError: null,
            error: null,
            trackedTasks: mergeTrackedTaskItems(
              state.trackedTasks,
              buildTrackedTaskItem(
                { ...task, progressPct: 100, completedAt: task.completedAt || new Date().toISOString() },
                {
                  gameId: task.gameId || state.generatingGameId,
                  gameTitle: fallbackGame?.title || state.currentGame?.title || '',
                  promptPreview: state.trackedTasks.find((item) => item.taskId === task.taskId)?.promptPreview || '',
                  latestMessage: doneProgress.stageLabel,
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
      currentTask: task,
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
            gameId: task.gameId || state.generatingGameId,
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
        stageKey: PIPELINE_STAGES[0].key,
        stageLabel: '正在恢复创作任务...',
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

      if (isTerminalTaskStatus(task.status)) {
        set((state) => ({
          trackedTasks: removeTrackedTaskItem(state.trackedTasks, taskId),
        }));
        return task;
      }

      set((state) => {
        const currentTrackedTask = state.trackedTasks.find((item) => item.taskId === taskId);
        return {
          trackedTasks: mergeTrackedTaskItems(
            state.trackedTasks,
            buildTrackedTaskItem(task, {
              gameId: task.gameId,
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

  forkGame: async (gameId) => {
    set({ isLoading: true, error: null });

    try {
      const newGameId = await gameService.forkGame(gameId);
      const game = await gameService.getGame(newGameId);
      set({ currentGame: game, isLoading: false });
      return newGameId;
    } catch (error) {
      set({ isLoading: false, error: error?.message || '复制失败' });
      throw error;
    }
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
  clearError: () => set({ error: null, terminalError: null }),
}));

export { PIPELINE_STAGES };
export default useGameStore;
