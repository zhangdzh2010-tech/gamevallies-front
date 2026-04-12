import { post, get, del, patch } from './api';
import { API_CONFIG } from '../types';
import { normalizeGameOrientation } from '../utils/gameOrientation';
import { isH5Runtime } from '../utils/runtime';
import { Storage } from '../utils/storage';

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
    progressMessage: task.progressMessage || task.message || '',
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
    coverUrl: task.coverUrl || null,
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
    createdAt: event.createdAt || event.timestamp || null,
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

function normalizeCreationSessionMessage(message, index = 0) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  return {
    id: message.id || message.messageId || `message-${index}`,
    role: message.role || message.senderRole || message.type || 'assistant',
    content: message.content || message.text || message.message || '',
    kind: message.kind || message.messageKind || null,
    createdAt: message.createdAt || message.timestamp || null,
    revision: message.revision ?? null,
    meta: message.meta || null,
  };
}

function normalizeCreationQuestion(question) {
  if (!question || typeof question !== 'object') {
    return null;
  }

  return {
    id: question.id || question.questionId || '',
    key: question.key || question.slotKey || question.id || '',
    slotKey: question.slotKey || question.key || question.id || '',
    title: question.title || question.label || '',
    content: question.content || question.text || question.prompt || '',
    description: question.description || question.hint || '',
    answerType: question.answerType || question.inputType || 'text',
    required: question.required !== false,
    skippable: question.skippable !== false,
    options: Array.isArray(question.options) ? question.options : [],
    placeholder: question.placeholder || '',
    metadata: question.metadata || null,
  };
}

function normalizeCreationSessionStreamTimestamp(rawTimestamp) {
  const numericTimestamp = Number(rawTimestamp);
  if (Number.isFinite(numericTimestamp) && numericTimestamp > 0) {
    return numericTimestamp;
  }

  if (typeof rawTimestamp === 'string') {
    const parsedTimestamp = Date.parse(rawTimestamp);
    if (Number.isFinite(parsedTimestamp)) {
      return parsedTimestamp;
    }
  }

  return Date.now();
}

function getCreationSessionStreamPath(sessionOrPath) {
  if (typeof sessionOrPath === 'string') {
    return sessionOrPath;
  }

  if (!sessionOrPath || typeof sessionOrPath !== 'object') {
    return '';
  }

  if (sessionOrPath.streamPath) {
    return sessionOrPath.streamPath;
  }

  if (sessionOrPath.sessionId) {
    return `/api/v1/games/creation-sessions/${sessionOrPath.sessionId}/events`;
  }

  return '';
}

function getCreationSessionStreamBaseUrl() {
  return API_CONFIG.SERVICE_URLS?.GAME || API_CONFIG.BASE_URL || '';
}

function appendTokenQuery(url, token) {
  if (!url || !token) {
    return url;
  }

  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}token=${encodeURIComponent(token)}`;
}

function getEventSourceConstructor() {
  if (typeof window !== 'undefined' && typeof window.EventSource === 'function') {
    return window.EventSource;
  }

  if (typeof globalThis !== 'undefined' && typeof globalThis.EventSource === 'function') {
    return globalThis.EventSource;
  }

  return null;
}

function parseCreationSessionStreamPayload(rawData) {
  if (rawData == null || rawData === '') {
    return null;
  }

  if (typeof rawData === 'object') {
    return rawData;
  }

  try {
    return JSON.parse(rawData);
  } catch (_error) {
    return null;
  }
}

export function supportsCreationSessionEventStream() {
  return isH5Runtime() && Boolean(getEventSourceConstructor());
}

export function buildCreationSessionStreamUrl(sessionOrPath) {
  const rawPath = getCreationSessionStreamPath(sessionOrPath);
  if (!rawPath) {
    return '';
  }

  const absoluteUrl = rawPath.startsWith('http')
    ? rawPath
    : `${getCreationSessionStreamBaseUrl()}${rawPath}`;
  const token = Storage.getToken();

  return appendTokenQuery(absoluteUrl, token);
}

export function normalizeCreationSessionStreamEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return null;
  }

  const type = rawEvent.type || 'message';
  const timestamp = normalizeCreationSessionStreamTimestamp(rawEvent.timestamp);
  const baseEvent = {
    type,
    sessionId: rawEvent.sessionId || '',
    timestamp,
  };

  if (type === 'bootstrap' || type === 'snapshot') {
    const session = normalizeCreationSessionSnapshot(rawEvent.session || rawEvent.snapshot || null);
    if (!session?.sessionId) {
      return null;
    }

    return {
      ...baseEvent,
      sessionId: baseEvent.sessionId || session.sessionId,
      session,
    };
  }

  if (type === 'delta') {
    return {
      ...baseEvent,
      messageId: rawEvent.messageId || '',
      kind: rawEvent.kind || 'question',
      delta: String(rawEvent.delta || ''),
      accumulated: String(rawEvent.accumulated || rawEvent.delta || ''),
    };
  }

  if (type === 'done') {
    return {
      ...baseEvent,
      messageId: rawEvent.messageId || '',
      kind: rawEvent.kind || 'question',
      message: String(rawEvent.message || ''),
    };
  }

  if (type === 'error') {
    return {
      ...baseEvent,
      code: rawEvent.code || 'session_error',
      message: String(rawEvent.message || ''),
      retryable: rawEvent.retryable === true,
      details: rawEvent.details || null,
    };
  }

  return {
    ...baseEvent,
    payload: rawEvent,
  };
}

export function subscribeCreationSessionStream(sessionOrPath, handlers = {}) {
  if (!supportsCreationSessionEventStream()) {
    handlers.onUnsupported?.();
    return () => {};
  }

  const streamUrl = buildCreationSessionStreamUrl(sessionOrPath);
  const EventSourceCtor = getEventSourceConstructor();
  if (!streamUrl || !EventSourceCtor) {
    handlers.onUnsupported?.();
    return () => {};
  }

  const eventSource = new EventSourceCtor(streamUrl, { withCredentials: true });
  const removeListeners = [];
  const bindNamedEvent = (eventName, callbackName) => {
    const listener = (nativeEvent) => {
      const payload = parseCreationSessionStreamPayload(nativeEvent?.data);
      const normalizedEvent = normalizeCreationSessionStreamEvent({
        ...(payload || {}),
        type: payload?.type || eventName,
      });

      if (!normalizedEvent) {
        return;
      }

      handlers[callbackName]?.(normalizedEvent, nativeEvent);
    };

    eventSource.addEventListener(eventName, listener);
    removeListeners.push(() => eventSource.removeEventListener(eventName, listener));
  };

  bindNamedEvent('bootstrap', 'onBootstrap');
  bindNamedEvent('snapshot', 'onSnapshot');
  bindNamedEvent('delta', 'onDelta');
  bindNamedEvent('done', 'onDone');
  bindNamedEvent('error', 'onError');

  eventSource.onopen = (nativeEvent) => {
    handlers.onOpen?.(nativeEvent);
  };

  eventSource.onerror = (nativeEvent) => {
    handlers.onTransportError?.(nativeEvent);
  };

  return () => {
    eventSource.onopen = null;
    eventSource.onerror = null;
    removeListeners.forEach((removeListener) => removeListener());
    eventSource.close();
  };
}

export function normalizeCreationSessionSnapshot(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const rawGenerationTask = raw.generationTask && typeof raw.generationTask === 'object'
    ? raw.generationTask
    : raw.generationTaskId
      ? {
          taskId: raw.generationTaskId,
          gameId: raw.generatedGameId || raw.gameId || raw.resultGameId || '',
        }
    : raw.task && typeof raw.task === 'object'
      ? raw.task
      : null;
  const generationTask = rawGenerationTask ? mergeTaskPayload(rawGenerationTask) : null;
  const messages = Array.isArray(raw.messages)
    ? raw.messages
    : Array.isArray(raw.conversation)
      ? raw.conversation
      : Array.isArray(raw.dialogue)
        ? raw.dialogue
        : [];

  const revision = Number(raw.revision ?? raw.version ?? raw.snapshotRevision ?? 0);

  return {
    sessionId: raw.sessionId || raw.id || raw.creationSessionId || '',
    revision: Number.isFinite(revision) ? revision : 0,
    status: raw.status || 'collecting',
    entryMode: raw.entryMode || raw.mode || 'create',
    streamPath: raw.streamPath || raw.eventsPath || '',
    initialPrompt: raw.initialPrompt || raw.prompt || raw.description || '',
    titleDraft: raw.titleDraft || raw.title || raw.sessionTitle || '',
    title: raw.title || raw.titleDraft || raw.sessionTitle || '',
    prompt: raw.prompt || raw.description || raw.initialPrompt || '',
    orientation: normalizeGameOrientation(raw.orientation || raw.gameOrientation),
    generationTier: raw.generationTier || raw.tier || 'standard',
    sourceGameId: raw.sourceGameId || raw.baseGameId || raw.parentGameId || '',
    gameId: raw.gameId || raw.generatedGameId || raw.resultGameId || '',
    slotState: raw.slotState && typeof raw.slotState === 'object' ? raw.slotState : {},
    missingRequired: Array.isArray(raw.missingRequired) ? raw.missingRequired : [],
    skippedSlots: Array.isArray(raw.skippedSlots) ? raw.skippedSlots : [],
    slotFillPct: Number(raw.slotFillPct ?? raw.slotCoverage ?? 0) || 0,
    readyToGenerate: raw.readyToGenerate === true || raw.ready === true || raw.status === 'ready',
    questionBudget: Number(raw.questionBudget ?? 0) || 0,
    planDraft: raw.planDraft || raw.plan || raw.specDraft || null,
    confidenceSummary: raw.confidenceSummary || raw.confidence || null,
    questionStrategy: raw.questionStrategy || raw.strategy || null,
    intentBuild: raw.intentBuild || null,
    currentQuestion: normalizeCreationQuestion(raw.currentQuestion || raw.question || null),
    messages: messages.map((message, index) => normalizeCreationSessionMessage(message, index)).filter(Boolean),
    generationTask: normalizeGenerationTask(generationTask),
    metadata: raw.metadata || null,
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
    expiresAt: raw.expiresAt || raw.expiredAt || null,
    completedAt: raw.completedAt || null,
  };
}

export async function createCreationSession(prompt, title, options = {}) {
  const normalizedOptions = options && typeof options === 'object' ? options : {};
  const orientation = normalizeGameOrientation(normalizedOptions.orientation);

  const response = await post(
    '/api/v1/games/creation-sessions',
    {
      prompt,
      ...(title ? { title } : {}),
      ...(normalizedOptions.entryMode ? { entryMode: normalizedOptions.entryMode } : {}),
      ...(orientation ? { orientation } : {}),
      ...(normalizedOptions.generationTier ? { generationTier: normalizedOptions.generationTier } : {}),
      ...(normalizedOptions.sourceGameId ? { sourceGameId: normalizedOptions.sourceGameId } : {}),
    },
    {
      timeout: 90000,
    }
  );

  return normalizeCreationSessionSnapshot(response);
}

export async function getActiveCreationSession() {
  const response = await get('/api/v1/games/creation-sessions/active');
  return normalizeCreationSessionSnapshot(response);
}

export async function getCreationSession(sessionId) {
  const response = await get(`/api/v1/games/creation-sessions/${sessionId}`);
  return normalizeCreationSessionSnapshot(response);
}

export async function appendCreationSessionMessage(sessionId, content, revision) {
  const response = await post(
    `/api/v1/games/creation-sessions/${sessionId}/messages`,
    {
      content,
      ...(revision != null ? { revision } : {}),
    },
    {
      timeout: 90000,
    }
  );

  return normalizeCreationSessionSnapshot(response);
}

export async function skipCreationSessionQuestion(sessionId, revision) {
  const response = await post(
    `/api/v1/games/creation-sessions/${sessionId}/skip`,
    {
      ...(revision != null ? { revision } : {}),
    },
    {
      timeout: 90000,
    }
  );

  return normalizeCreationSessionSnapshot(response);
}

export async function generateFromCreationSession(sessionId, options = {}) {
  const response = await post(
    `/api/v1/games/creation-sessions/${sessionId}/generate`,
    {
      ...(options.revision ? { revision: options.revision } : {}),
      ...(options.timeoutS ? { timeoutS: options.timeoutS } : {}),
    },
    {
      timeout: 90000,
    }
  );

  // Response is a CreationSessionSnapshot — NOT a game-task response.
  // The relevant IDs live in dedicated fields:
  //   generatedGameId  → the newly created game's ID
  //   generationTaskId → the background task ID to track
  const gameId = response?.generatedGameId || response?.gameId || '';
  const taskId = response?.generationTaskId || response?.taskId || '';

  const generationTask = taskId
    ? normalizeGenerationTask({ taskId, gameId, status: 'queued', taskType: 'pipeline_run' })
    : null;

  return {
    gameId,
    title: response?.titleDraft || response?.title || '',
    description: response?.initialPrompt || response?.prompt || '',
    status: response?.status || 'generating',
    canPlay: true,
    quotaRemaining: null,
    requireSubscription: false,
    generationTask,
  };
}

export async function abandonCreationSession(sessionId) {
  const response = await post(`/api/v1/games/creation-sessions/${sessionId}/abandon`, {});
  return normalizeCreationSessionSnapshot(response);
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
  normalizeCreationSessionSnapshot,
  normalizeCreationSessionStreamEvent,
  supportsCreationSessionEventStream,
  buildCreationSessionStreamUrl,
  subscribeCreationSessionStream,
  createCreationSession,
  getActiveCreationSession,
  getCreationSession,
  appendCreationSessionMessage,
  skipCreationSessionQuestion,
  generateFromCreationSession,
  abandonCreationSession,
  getGameTypes,
  getGame,
  getGenerationStatus,
  getGenerationTask,
  getGenerationTaskEvents,
  cancelGenerationTask,
  publishGame,
  getMyGames,
  deleteGame,
  updateGameSettings,
};
