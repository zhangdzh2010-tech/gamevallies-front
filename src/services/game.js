import { post, get, del, patch } from './api';

function mergeTaskPayload(source) {
  if (!source || typeof source !== 'object') {
    return null;
  }

  const nestedTask = source.generationTask && typeof source.generationTask === 'object'
    ? source.generationTask
    : null;

  return {
    ...source,
    ...(nestedTask || {}),
  };
}

function normalizeGenerationTask(task) {
  if (!task || typeof task !== 'object') {
    return null;
  }

  const progressPct = Number(task.progressPct ?? task.progress ?? 0);
  const errorMessage = task.errorMessage || task.terminalError?.message || '';

  return {
    taskId: task.taskId || task.id || '',
    taskType: task.taskType || task.type || '',
    status: task.status || 'queued',
    region: task.region || '',
    gameId: task.gameId || task.game_id || '',
    version: task.version ?? null,
    pipelineVersion: task.pipelineVersion || null,
    promptBundleId: task.promptBundleId || null,
    promptBundleVersion: task.promptBundleVersion ?? null,
    runtimeProfile: task.runtimeProfile || null,
    contractVersion: task.contractVersion || null,
    progressPct: Number.isFinite(progressPct) ? progressPct : 0,
    cancelRequested: task.cancelRequested === true,
    currentStage: task.currentStage || task.progressStage || task.stage || null,
    currentStepKey: task.currentStepKey || task.stepKey || null,
    progressMessage: task.progressMessage || '',
    displayStageKey: task.displayStageKey || null,
    displayStageLabel: task.displayStageLabel || null,
    displayStageIndex: task.displayStageIndex ?? null,
    displayStagePct: task.displayStagePct ?? null,
    rawStage: task.rawStage || null,
    errorMessage,
    failedStage: task.failedStage || null,
    taskTimeoutS: task.taskTimeoutS ?? task.timeoutS ?? null,
    wsChannel: task.wsChannel || null,
    pollUrl: task.pollUrl || null,
    eventsUrl: task.eventsUrl || null,
    artifactsUrl: task.artifactsUrl || null,
    cancelUrl: task.cancelUrl || null,
    previewUrl: task.previewUrl || null,
    gameUrl: task.gameUrl || null,
    statusText: task.statusText || null,
    failureFamily: task.failureFamily || null,
    primaryArtifactId: task.primaryArtifactId || null,
    retryCount: task.retryCount ?? null,
    startedAt: task.startedAt || null,
    completedAt: task.completedAt || null,
    createdAt: task.createdAt || null,
    updatedAt: task.updatedAt || null,
    resultSummary: task.resultSummary || null,
    gameStatus: task.gameStatus || null,
    canPlay: typeof task.canPlay === 'boolean' ? task.canPlay : null,
    requireSubscription: task.requireSubscription === true,
    terminalError: task.terminalError || (errorMessage ? {
      message: errorMessage,
      errorCode: task.failedStage || 'task_failed',
    } : null),
  };
}

function normalizeTaskEvent(event, index = 0) {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const seqNo = Number(event.seqNo ?? event.seq_no ?? event.sequence ?? index + 1);

  return {
    id: event.id || '',
    seqNo: Number.isFinite(seqNo) ? seqNo : 0,
    eventType: event.eventType || event.type || '',
    stage: event.stage || null,
    stepKey: event.stepKey || event.stage || null,
    percentage: Number(event.percentage ?? event.progressPct ?? event.progress ?? 0) || 0,
    status: event.status || event.eventType || 'info',
    message: event.message || event.progressMessage || '',
    detail: event.detail || event.details || null,
    createdAt: event.createdAt || null,
  };
}

function normalizeTaskEventsResponse(response) {
  const rawItems = Array.isArray(response)
    ? response
    : Array.isArray(response?.items)
      ? response.items
      : Array.isArray(response?.data)
        ? response.data
        : [];

  const items = rawItems.map((event, index) => normalizeTaskEvent(event, index)).filter(Boolean);

  return {
    items,
    nextCursor: response?.nextCursor ?? response?.cursor ?? (items.length ? items[items.length - 1].seqNo : 0),
    hasMore: response?.hasMore === true,
  };
}

function normalizeGenerateResponse(response, fallbackGameId = '') {
  if (typeof response === 'string') {
    return {
      gameId: response,
      title: '',
      description: '',
      status: 'generating',
      canPlay: true,
      quotaRemaining: null,
      requireSubscription: false,
      generationTask: null,
    };
  }

  const taskPayload = mergeTaskPayload(response);

  return {
    gameId: response?.gameId || response?.id || fallbackGameId || '',
    title: response?.title || '',
    description: response?.description || response?.prompt || '',
    status: response?.status || 'generating',
    canPlay: response?.canPlay !== false,
    quotaRemaining: response?.quotaRemaining ?? null,
    requireSubscription: response?.requireSubscription === true,
    generationTask: normalizeGenerationTask(taskPayload),
  };
}

function normalizeIterateResponse(response, fallbackGameId = '') {
  if (!response || typeof response !== 'object') {
    return {
      gameId: fallbackGameId,
      version: null,
      status: 'iterating',
      iterationId: null,
      generationTask: null,
    };
  }

  const taskPayload = mergeTaskPayload(response);

  return {
    gameId: response.gameId || fallbackGameId,
    version: response.version ?? null,
    status: response.status || 'iterating',
    iterationId: response.iterationId || null,
    generationTask: normalizeGenerationTask(taskPayload),
  };
}

/**
 * Generate a new game from a prompt
 */
export async function generateGame(prompt, title, options) {
  const normalizedOptions = typeof options === 'string'
    ? { type: options }
    : (options && typeof options === 'object' ? options : {});

  const response = await post('/api/v1/games/generate', {
    description: prompt,
    prompt,
    ...(title ? { title } : {}),
    ...(normalizedOptions.type ? { type: normalizedOptions.type } : {}),
    ...(normalizedOptions.orientation ? { orientation: normalizedOptions.orientation } : {}),
  });
  return normalizeGenerateResponse(response);
}

/**
 * Get supported game types
 */
export async function getGameTypes() {
  return get('/api/v1/games/game-types');
}

/**
 * Get single game by ID
 */
export async function getGame(id) {
  return get(`/api/v1/games/${id}`);
}

/**
 * Iterate (improve) an existing game with feedback
 */
export async function iterateGame(gameId, feedback) {
  const response = await post(
    `/api/v1/games/${gameId}/iterate`,
    { feedback }
  );
  return normalizeIterateResponse(response, gameId);
}

/**
 * Get author-visible generation status for a game
 */
export async function getGenerationStatus(gameId) {
  const response = await get(`/api/v1/games/${gameId}/generation-status`);
  return normalizeGenerationTask(response);
}

/**
 * Query generation task details
 */
export async function getGenerationTask(taskId) {
  const response = await get(`/api/v1/games/tasks/${taskId}`);
  return normalizeGenerationTask(response);
}

/**
 * Query generation task events
 */
export async function getGenerationTaskEvents(taskId, cursor, limit = 50) {
  const response = await get(`/api/v1/games/tasks/${taskId}/events`, {
    data: {
      ...(cursor ? { cursor } : {}),
      limit,
    },
  });

  return normalizeTaskEventsResponse(response);
}

/**
 * Cancel an active generation task
 */
export async function cancelGenerationTask(taskId) {
  return post(`/api/v1/games/tasks/${taskId}/cancel`, {});
}

/**
 * Fork (copy) a game
 */
export async function forkGame(gameId) {
  const response = await post(
    `/api/v1/games/${gameId}/fork`,
    {}
  );
  return response.gameId;
}

/**
 * Publish a game
 */
export async function publishGame(gameId, data) {
  return post(`/api/v1/games/${gameId}/publish`, data || {});
}

/**
 * Get current user's games
 */
export async function getMyGames(page = 1, limit = 10) {
  return get('/api/v1/games/my', {
    data: { page, limit }
  });
}

/**
 * Delete a game by ID
 */
export async function deleteGame(gameId) {
  return del(`/api/v1/games/${gameId}`);
}

/**
 * Update game visibility/permission settings
 */
export async function updateGameSettings(gameId, settings) {
  return patch(`/api/v1/games/${gameId}/settings`, settings);
}

export default {
  generateGame,
  getGameTypes,
  getGame,
  getGenerationStatus,
  iterateGame,
  getGenerationTask,
  getGenerationTaskEvents,
  cancelGenerationTask,
  forkGame,
  publishGame,
  getMyGames,
  deleteGame,
  updateGameSettings,
};
