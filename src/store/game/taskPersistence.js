// Tracked task history and active-task storage.
import {
  ACTIVE_GENERATION_TASK_KEY,
  TRACKED_GENERATION_TASKS_KEY,
  ACTIVE_GENERATION_TASK_MAX_AGE_MS,
  TRACKED_TASKS_LIMIT,
} from './constants';
import {
  clampProgress,
  normalizeTaskStatus,
  isTerminalTaskStatus,
} from './taskProgress';
import Taro from '@tarojs/taro';

export function normalizeTrackedTaskItem(item) {
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


export function loadTrackedTaskItems() {
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


export function saveTrackedTaskItems(items) {
  try {
    Taro.setStorageSync(TRACKED_GENERATION_TASKS_KEY, JSON.stringify(items.slice(0, TRACKED_TASKS_LIMIT)));
  } catch (error) {
    console.warn('Failed to save tracked task items:', error);
  }
}


export function mergeTrackedTaskItems(previous, nextItem) {
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


export function removeTrackedTaskItem(previous, taskId) {
  const nextItems = previous.filter((item) => item.taskId !== taskId);
  saveTrackedTaskItems(nextItems);
  return nextItems;
}


export function buildTrackedTaskItem(task, options = {}) {
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


export function persistActiveGenerationTask(task, options = {}) {
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
        status: normalizeTaskStatus(snapshot.status, 'queued'),
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
