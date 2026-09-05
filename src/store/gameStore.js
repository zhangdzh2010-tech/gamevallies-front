import {
  ACTIVE_TASK_TIMEOUT_MS,
  STAGE_STALE_WARN_MS,
  SESSION_INIT_POLL_INTERVAL_MS,
  SESSION_INIT_MAX_POLLS,
  SESSION_READY_WAIT_INTERVAL_MS,
  SESSION_READY_WAIT_TIMEOUT_MS,
  PIPELINE_STAGES,
  PIPELINE_STAGE_SUMMARIES,
} from './game/constants';
import {
  getCreationSessionRuntimePhase,
  getCreationSessionRuntimeBindingKey,
  deriveCreationSessionErrorMessage,
  normalizeSessionMessageContent,
  buildPendingCreationSessionUserMessage,
  getCreationSessionExpandedPrompt,
  buildCreationSessionUiState,
  isCreationSessionRevisionConflictError,
  isStaleCreationSessionSnapshot,
  resolveCreationSessionStreamingReply,
  resolveCreationSessionPendingUserMessage,
  countPromptCharacters,
  buildCreationSessionContext,
  getCreationFlowStageFromState,
} from './game/creationSessionModel';
import {
  buildFallbackCompletedGame,
  buildUnlockedCurrentGame,
} from './game/gameResultModel';
import {
  loadTrackedTaskItems,
  mergeTrackedTaskItems,
  removeTrackedTaskItem,
  buildTrackedTaskItem,
  persistActiveGenerationTask,
  clearPersistedGenerationTaskSnapshot,
  getPersistedGenerationTaskSnapshot,
} from './game/taskPersistence';
import {
  normalizeTaskStatus,
  getLatestTaskMessage,
  buildProgressFromTask,
  mergeTaskEvents,
  deriveTaskErrorMessage,
  isTerminalTaskStatus,
} from './game/taskProgress';
import Taro from '@tarojs/taro';
import {
  create,
} from 'zustand';
import * as gameService from '../services/game';
import {
  getWebSocketManager,
} from '../services/websocket';
import {
  decideTaskPollIntervals,
} from '../utils/taskPollingPolicy';
import useQuotaStore from '../stores/quotaStore';
import {
  Storage,
} from '../utils/storage';
import {
  subscribeGameUnlocked,
} from '../utils/gameUnlock';

// 自适应轮询:setTimeout 链式调度,每个周期按 WS 健康状态重新决定间隔
let activeTaskPollTimer = null;
let activeEventPollTimer = null;
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
  if (activeTaskPollTimer) {
    clearTimeout(activeTaskPollTimer);
    activeTaskPollTimer = null;
  }

  if (activeEventPollTimer) {
    clearTimeout(activeEventPollTimer);
    activeEventPollTimer = null;
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      throw new Error('请先把这一版方向写完整');
    }

    if (session.status === 'initializing') {
      set({
        creationSessionSubmitting: true,
        creationSessionError: null,
      });

      session = await waitForCreationSessionReady(session.sessionId);
    }

    if (session?.status === 'initializing') {
      const message = 'AI 还在整理方向，请稍等';
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
        : deriveCreationSessionErrorMessage(error, '保存这版方向失败，请稍后重试');

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
      const message = 'AI 还在整理方向，请稍等';
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
        : deriveCreationSessionErrorMessage(error, '使用当前这版失败，请稍后重试');

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
      const message = 'AI 还在整理方向，请稍等';
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
      const message = '请先确认这版方向，再开始生成';
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

    // 自适应轮询:WS 健康时放缓到慢间隔(仅兜底对账),断开/未连接时用快间隔。
    // 每个周期调度时重新读取健康状态,恢复健康后下个周期自然放缓。
    const resolvePollIntervals = () => {
      const ws = getWebSocketManager();
      const wsHealthy = Boolean(ws && typeof ws.isHealthy === 'function' && ws.isHealthy());
      return decideTaskPollIntervals(wsHealthy);
    };

    const scheduleTaskStatusPoll = () => {
      if (activeTaskPollTimer) {
        clearTimeout(activeTaskPollTimer);
      }
      activeTaskPollTimer = setTimeout(() => {
        scheduleTaskStatusPoll();
        taskPollTick();
      }, resolvePollIntervals().taskMs);
    };

    const scheduleTaskEventsPoll = () => {
      if (activeEventPollTimer) {
        clearTimeout(activeEventPollTimer);
      }
      activeEventPollTimer = setTimeout(() => {
        scheduleTaskEventsPoll();
        eventsPollTick();
      }, resolvePollIntervals().eventsMs);
    };

    const taskPollTick = () => {
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
    };

    const eventsPollTick = () => {
      const currentTask = useGameStore.getState().currentTask;
      if (!currentTask?.taskId || currentTask.taskId !== task.taskId) {
        return;
      }
      void useGameStore.getState()._syncTaskEvents(task.taskId);
    };

    scheduleTaskStatusPoll();
    scheduleTaskEventsPoll();

    // WS 从健康变断开:立即对账一次,并把待触发的轮询重排为快间隔
    const wsForStatus = getWebSocketManager();
    if (wsForStatus && typeof wsForStatus.onStatusChange === 'function') {
      const wsStatusHandler = (connected) => {
        if (connected) {
          return;
        }
        const store = useGameStore.getState();
        if (store.currentTask?.taskId !== task.taskId) {
          return;
        }
        void store._syncTask(task.taskId);
        void store._syncTaskEvents(task.taskId);
        scheduleTaskStatusPoll();
        scheduleTaskEventsPoll();
      };
      wsForStatus.onStatusChange(wsStatusHandler);
      activeWebSocketUnsubscribers.push(() => wsForStatus.offStatusChange(wsStatusHandler));
    }

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
    const taskStatus = normalizeTaskStatus(task?.status);

    if (taskStatus === 'succeeded') {
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
      const nextStatus = normalizeTaskStatus(response?.status, 'canceled');
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


export { clearPersistedGenerationTaskSnapshot, setPersistedGenerationTaskSnapshot, getPersistedGenerationTaskSnapshot } from './game/taskPersistence';
export { isCompletedGameStatus, isTerminalTaskStatus } from './game/taskProgress';
