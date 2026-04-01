import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Textarea, Input } from '@tarojs/components';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import { PipelineOrbit } from '../../components/common/PipelineOrbit';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import * as gameService from '../../services/game';
import { getWebSocketManager } from '../../services/websocket';
import {
  isCompletedGameStatus,
  useGameStore,
  PIPELINE_STAGES,
} from '../../store/gameStore';
import useGamePlayerStore from '../../stores/gamePlayer';
import useQuotaStore from '../../stores/quotaStore';
import { PaywallPopup } from '../../components/common/PaywallPopup';
import {
  consumePersistedCreateEntryIntent,
  ensureCreateAccess,
  isLoggedIn,
  openForkPageWithAuth,
  openIteratePageWithAuth,
  openProfilePageWithTab,
} from '../../utils/authNavigation';
import { getGameCoverUrl } from '../../utils/media';
import { getGameOrientation } from '../../utils/gameOrientation';
import { getInputEventValue } from '../../utils/inputValue';
import { getSafeSystemInfo } from '../../utils/systemInfo';
import { isH5Runtime, isWeappRuntime } from '../../utils/runtime';
import {
  CreationSessionScene,
  buildCreationSessionActions,
  buildCreationSessionSceneProps,
} from '../../components/creation';
import './index.scss';

const TASK_STATUS_LABELS = {
  queued: '排队中',
  submitted: '执行中',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  canceled: '已取消',
  timed_out: '超时',
};

const ORIENTATION_OPTIONS = [
  { value: 'portrait', label: '竖屏' },
  { value: 'landscape', label: '横屏' },
];

const SLOT_LABEL_MAP = {
  game_type: '游戏定位',
  core_mechanic: '核心玩法',
  theme: '主题场景',
  input_method: '操作方式',
  win_condition: '胜利目标',
  difficulty: '难度节奏',
};

function formatSlotLabel(slotKey) {
  return SLOT_LABEL_MAP[slotKey] || slotKey;
}

function getUserFacingCreateError(rawError, fallbackStageLabel = 'AI 规划方案') {
  const source = typeof rawError === 'string' ? rawError.trim() : '';
  if (!source) {
    return `${fallbackStageLabel}阶段遇到问题，请稍后重试`;
  }

  if (/作品已生成完成|加载结果失败|我的作品/i.test(source)) {
    return '作品已生成完成，请到“我的作品”查看';
  }

  if (/已取消|canceled|cancelled/i.test(source)) {
    return '创作任务已取消';
  }

  if (/超时|timeout|timed out/i.test(source)) {
    return `${fallbackStageLabel}阶段处理超时，请稍后重试`;
  }

  return `${fallbackStageLabel}阶段遇到问题，请稍后重试`;
}

function buildInputChangeHandler(setter) {
  return (event) => setter(getInputEventValue(event));
}

export default function Create() {
  const isH5 = isH5Runtime();
  const isWeapp = isWeappRuntime();
  const {
    generateFromCreationSession,
    restorePersistedTask,
    cancelCurrentTask,
    isGenerating,
    generationProgress,
    currentGame,
    currentTask,
    error,
    terminalError,
    clearError,
    canPlay,
    createEntryIntent,
    consumeCreateEntryIntent,
    getMatchingActiveCreationSession,
    resetCreateSession,
    setCurrentGame,
  } = useGameStore();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const openPaywall = useQuotaStore((s) => s.openPaywall);
  const [gameName, setGameName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [creationSession, setCreationSession] = useState(null);
  const [sessionAnswer, setSessionAnswer] = useState('');
  const [sessionBusy, setSessionBusy] = useState(false);
  const [orientation, setOrientation] = useState('portrait');
  const [isRestoringEntry, setIsRestoringEntry] = useState(false);
  const authRedirectingRef = useRef(false);
  const handleGameNameChange = buildInputChangeHandler(setGameName);
  const handlePromptChange = buildInputChangeHandler(setPrompt);
  const handleSessionAnswerChange = buildInputChangeHandler(setSessionAnswer);
  // Tracks the polling interval used while a creation session is initializing.
  const sessionPollingRef = useRef(null);

  const stopSessionPolling = () => {
    if (sessionPollingRef.current) {
      clearInterval(sessionPollingRef.current);
      sessionPollingRef.current = null;
    }
  };
  const { windowHeight = 720 } = getSafeSystemInfo();
  const scrollViewHeight = Math.max(windowHeight - 120, 400);
  const containerClassName = `create-container${isH5 ? ' create-container--h5' : ''}${isWeapp ? ' create-container--weapp' : ''}`;
  const creationSessionId = creationSession?.sessionId || creationSession?.id || '';

  const normalizeCreatePageSession = (snapshot) => {
    const normalized = gameService.normalizeCreationSessionSnapshot(snapshot);
    if (!normalized) {
      return null;
    }

    const rawSlotFillPct = Number(snapshot?.slotFillPct ?? snapshot?.slotCompletionPct ?? 0);
    const slotFillPct = Number.isFinite(rawSlotFillPct) ? rawSlotFillPct : 0;
    const currentQuestion = normalized.currentQuestion
      ? {
          ...normalized.currentQuestion,
          label: normalized.currentQuestion.title || formatSlotLabel(normalized.currentQuestion.key),
          prompt: normalized.currentQuestion.content || normalized.currentQuestion.title || '',
          skippable: snapshot?.currentQuestion?.skippable !== false && normalized.currentQuestion.required !== true,
        }
      : null;

    return {
      ...normalized,
      id: normalized.sessionId,
      titleDraft: normalized.title,
      initialPrompt: normalized.prompt,
      conversation: normalized.messages,
      currentQuestion,
      readyToGenerate: typeof snapshot?.readyToGenerate === 'boolean'
        ? snapshot.readyToGenerate
        : ['ready', 'ready_to_generate'].includes(normalized.status),
      generationTaskId: normalized.generationTask?.taskId || '',
      generatedGameId: normalized.gameId || normalized.generationTask?.gameId || '',
      slotFillPct,
    };
  };

  const openTaskCenter = () => {
    openProfilePageWithTab('tasks');
  };

  // ── C4 + C5: handle session `initializing` state ─────────────────────────
  // After POST /creation-sessions the backend returns immediately with
  // status=initializing while AI analysis runs for 2–5 s.  We must wait for
  // the session to reach `collecting` before showing the first question.
  //
  // Fast path: listen for the `session:updated` Socket.IO push.
  // Fallback:  poll GET /creation-sessions/:id every 2 s (up to 30 s).
  useEffect(() => {
    if (!creationSessionId || creationSession?.status !== 'initializing') {
      stopSessionPolling();
      return undefined;
    }

    const sessionId = creationSessionId;
    let cancelled = false;

    const ws = getWebSocketManager();

    const wsUpdatedHandler = (payload) => {
      if (payload?.sessionId !== sessionId || cancelled) return;
      stopSessionPolling();
      applyCreationSessionSnapshot(payload?.session || null);
    };

    const wsErrorHandler = (payload) => {
      if (payload?.sessionId !== sessionId || cancelled) return;
      stopSessionPolling();
      applyCreationSessionSnapshot(null);
      Taro.showToast({ title: '创作会话初始化失败，请重试', icon: 'none' });
    };

    ws.onMessage('session:updated', wsUpdatedHandler);
    ws.onMessage('session:error', wsErrorHandler);

    // Polling fallback — max 15 polls × 2 s = 30 s (matches backend timeout)
    let pollCount = 0;
    sessionPollingRef.current = setInterval(() => {
      pollCount += 1;
      if (pollCount > 15) {
        stopSessionPolling();
        if (!cancelled) {
          applyCreationSessionSnapshot(null);
          Taro.showToast({ title: '创作会话初始化超时，请重试', icon: 'none' });
        }
        return;
      }

      gameService.getCreationSession(sessionId)
        .then((snapshot) => {
          if (cancelled || !snapshot) return;
          if (snapshot.status !== 'initializing') {
            stopSessionPolling();
            applyCreationSessionSnapshot(snapshot);
          }
        })
        .catch(() => {});
    }, 2000);

    return () => {
      cancelled = true;
      stopSessionPolling();
      ws.offMessage('session:updated', wsUpdatedHandler);
      ws.offMessage('session:error', wsErrorHandler);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creationSession?.status, creationSessionId]);
  // ─────────────────────────────────────────────────────────────────────────

  useDidShow(() => {
    if (isLoggedIn()) {
      authRedirectingRef.current = false;
      return;
    }

    if (authRedirectingRef.current) {
      return;
    }

    authRedirectingRef.current = true;
    ensureCreateAccess();
  });

  useDidHide(() => {
    authRedirectingRef.current = false;
  });

  useEffect(() => {
    if (!isGenerating || currentTask?.taskType !== 'pipeline_iterate' || !currentTask?.taskId) {
      return;
    }

    openIteratePageWithAuth(currentGame, currentTask.gameId || currentGame?.id || null, {
      taskId: currentTask.taskId,
    });
  }, [
    currentGame,
    currentTask?.gameId,
    currentTask?.taskId,
    currentTask?.taskType,
    isGenerating,
  ]);

  useDidShow(() => {
    if (!isLoggedIn() || createEntryIntent || isGenerating || currentTask?.taskId || isRestoringEntry) {
      return;
    }

    getMatchingActiveCreationSession({
      entryMode: 'create',
    })
      .then(async (snapshot) => {
        if (!snapshot) {
          applyCreationSessionSnapshot(null);
          return;
        }

        if (snapshot.status === 'generating' && (snapshot.generationTaskId || snapshot.generationTask?.taskId)) {
          setIsRestoringEntry(true);
          try {
            await restorePersistedTask({
              taskId: snapshot.generationTaskId || snapshot.generationTask?.taskId,
              gameId: snapshot.generatedGameId || snapshot.gameId || snapshot.generationTask?.gameId || '',
            });
          } finally {
            setIsRestoringEntry(false);
          }
          return;
        }

        applyCreationSessionSnapshot(snapshot);
      })
      .catch(() => undefined);
  });

  const resetLocalCreateState = () => {
    setPrompt('');
    setSessionAnswer('');
    setCreationSession(null);
    setGameName('');
    setOrientation('portrait');
  };

  const applyCreationSessionSnapshot = (snapshot) => {
    const normalizedSnapshot = normalizeCreatePageSession(snapshot);
    setCreationSession(normalizedSnapshot);
    if (!normalizedSnapshot) {
      return;
    }

    if (normalizedSnapshot.titleDraft) {
      setGameName(normalizedSnapshot.titleDraft);
    }
    if (normalizedSnapshot.orientation) {
      setOrientation(normalizedSnapshot.orientation);
    }
  };

  useEffect(() => {
    if (!createEntryIntent) {
      return;
    }

    let cancelled = false;

    const applyCreateEntryIntent = async () => {
      const { mode = 'fresh', gameId = null, taskId = null, sourceGameId = null } = createEntryIntent;

      resetLocalCreateState();
      clearError();
      resetCreateSession({ clearPersistedTask: mode === 'fresh' });

      if (mode === 'resume' && gameId) {
        if (!cancelled) {
          openIteratePageWithAuth(null, gameId);
        }
        consumeCreateEntryIntent();
        consumePersistedCreateEntryIntent();
        return;
      }

      if (mode === 'fork' && sourceGameId) {
        if (!cancelled) {
          openForkPageWithAuth(sourceGameId);
        }
        consumeCreateEntryIntent();
        consumePersistedCreateEntryIntent();
        return;
      }

      if (mode === 'task') {
        setIsRestoringEntry(true);
        try {
          const restored = await restorePersistedTask({ taskId, gameId });
          if (!restored && !cancelled) {
            Taro.showToast({ title: '恢复创作任务失败，请重试', icon: 'none' });
          }
        } finally {
          if (!cancelled) {
            setIsRestoringEntry(false);
          }
        }
      }

      if (mode === 'resume' && gameId && String(currentGame?.id || '') !== String(gameId)) {
        setIsRestoringEntry(true);
        try {
          const game = await gameService.getGame(gameId);
          if (!cancelled) {
            setCurrentGame(game);
          }
        } catch (error) {
          if (!cancelled) {
            Taro.showToast({ title: '恢复作品失败，请重试', icon: 'none' });
          }
        } finally {
          if (!cancelled) {
            setIsRestoringEntry(false);
          }
        }
      }

      if (mode === 'fork' && sourceGameId) {
        setIsRestoringEntry(true);
        try {
          const forkedGameId = await gameService.forkGame(sourceGameId);
          const forkedGame = await gameService.getGame(forkedGameId);
          if (!cancelled) {
            setCurrentGame(forkedGame);
            Taro.showToast({ title: '已加入我的创作', icon: 'success' });
          }
        } catch (error) {
          if (!cancelled) {
            Taro.showToast({ title: error?.message || '复刻失败，请重试', icon: 'none' });
            resetCreateSession({ clearPersistedTask: false });
          }
        } finally {
          if (!cancelled) {
            setIsRestoringEntry(false);
          }
        }
      }

      if (!cancelled) {
        consumeCreateEntryIntent();
        consumePersistedCreateEntryIntent();
      }
    };

    applyCreateEntryIntent();

    return () => {
      cancelled = true;
    };
  }, [
    clearError,
    consumeCreateEntryIntent,
    createEntryIntent,
    currentGame?.id,
    resetCreateSession,
    restorePersistedTask,
    setCurrentGame,
  ]);

  const handleCancelTask = () => {
    if (!currentTask?.taskId) {
      return;
    }

    Taro.showModal({
      title: '取消创作任务',
      content: '确认取消当前创作任务吗？已经生成的结果不会继续更新。',
      confirmColor: '#ff5c8a',
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        try {
          await cancelCurrentTask();
          Taro.showToast({ title: '任务已取消', icon: 'success' });
        } catch (err) {
          Taro.showToast({ title: err?.message || '取消失败，请重试', icon: 'none' });
        }
      },
    });
  };
  const handleSubmit = async () => {
    if (sessionBusy) {
      return;
    }

    if (!creationSession) {
      if (!prompt.trim() || prompt.trim().length < 5) {
        Taro.showToast({ title: '请输入游戏描述', icon: 'none' });
        return;
      }

      clearError();
      setSessionBusy(true);
      try {
        const snapshot = await gameService.createCreationSession(prompt.trim(), gameName, {
          orientation,
        });
        applyCreationSessionSnapshot(snapshot);
        setSessionAnswer('');
      } catch (err) {
        Taro.showToast({ title: getUserFacingCreateError(err?.message, '创作会话'), icon: 'none' });
      } finally {
        setSessionBusy(false);
      }
      return;
    }

    if (!sessionAnswer.trim()) {
      Taro.showToast({ title: '请先回答当前问题', icon: 'none' });
      return;
    }

    clearError();
    setSessionBusy(true);
    try {
      const snapshot = await gameService.appendCreationSessionMessage(
        creationSessionId,
        sessionAnswer.trim(),
        creationSession.revision,
      );
      applyCreationSessionSnapshot(snapshot);
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '创作会话'), icon: 'none' });
    } finally {
      setSessionBusy(false);
    }
  };

  async function handleGenerateFromSession() {
    if (!creationSession || sessionBusy) {
      return;
    }

    clearError();
    setSessionBusy(true);
    try {
      await generateFromCreationSession(creationSessionId, {
        revision: creationSession.revision,
        title: creationSession.title || creationSession.titleDraft || gameName,
        promptPreview: creationSession.prompt || creationSession.initialPrompt,
      });
      applyCreationSessionSnapshot(null);
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '创建游戏'), icon: 'none' });
    } finally {
      setSessionBusy(false);
    }
  }

  async function handleSkipQuestion() {
    if (!creationSession?.currentQuestion || sessionBusy) {
      return;
    }

    clearError();
    setSessionBusy(true);
    try {
      const snapshot = await gameService.skipCreationSessionQuestion(
        creationSessionId,
        creationSession.revision,
      );
      applyCreationSessionSnapshot(snapshot);
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '创作会话'), icon: 'none' });
    } finally {
      setSessionBusy(false);
    }
  }

  async function handleRestartSession() {
    if (!creationSession || sessionBusy) {
      applyCreationSessionSnapshot(null);
      setSessionAnswer('');
      return;
    }

    setSessionBusy(true);
    try {
      await gameService.abandonCreationSession(creationSessionId);
    } catch (_error) {
      // Ignore abandon failures and let the next session replace the old one.
    } finally {
      applyCreationSessionSnapshot(null);
      setSessionAnswer('');
      setSessionBusy(false);
    }
  }

  const handlePlayGame = () => {
    if (currentGame?.gameUrl) {
      openGame(currentGame.gameUrl, currentGame.title || gameName, getGameCoverUrl(currentGame), {
        canPlay,
        isOwnGame: true,
        gameId: currentGame.id,
        orientation: getGameOrientation(currentGame, orientation),
      });
    }
  };

  const handleLockedPlay = () => {
    openPaywall({
      gameId: currentGame?.id,
      gameUrl: currentGame?.gameUrl,
      gameTitle: currentGame?.title || gameName,
      gameCover: getGameCoverUrl(currentGame),
      gameOrientation: getGameOrientation(currentGame, orientation),
      resumePlay: true,
    });
  };

  const handleNewGame = () => {
    resetCreateSession();
    resetLocalCreateState();
  };

  if (isRestoringEntry) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
        <View className="create-header create-header--restoring">
          <View className="create-header__copy">
            <Text className="create-header__eyebrow">正在恢复</Text>
            <Text className="header-title">正在恢复创作</Text>
            <Text className="header-subtitle">马上回到当前作品或进行中的创作任务</Text>
          </View>
          <View className="create-header__meta">
            <Text className="create-header__meta-label">状态</Text>
            <Text className="create-header__meta-value">恢复中</Text>
          </View>
        </View>
        <View className="expanding-panel">
          <View className="expanding-spinner" />
          <Text className="expanding-text">正在加载作品和任务数据...</Text>
        </View>
        <CustomTabBar activeIndex={2} />
      </View>
    );
  }

  // Generating progress view
  if (isGenerating) {
    const progress = generationProgress || { stageIndex: 0, pct: 5, stageLabel: '准备中...' };
    const taskStatusLabel = TASK_STATUS_LABELS[currentTask?.status] || '执行中';
    const currentStageLabel = progress.stageLabel || '正在生成游戏';
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
        <PageScrollContainer
          className="create-scroll create-scroll--progress"
          style={isH5 ? undefined : { height: `${scrollViewHeight}px` }}
        >
          <View className="progress-panel">
            <View className="progress-panel__intro">
              <View className="progress-panel__intro-copy">
                <Text className="progress-panel__intro-label">当前焦点</Text>
                <Text className="progress-panel__intro-title">{currentStageLabel}</Text>
                <Text className="progress-panel__intro-desc">
                  系统会自动完成创意拆解、规则编排和运行时装配，你也可以稍后去“我的-任务”继续查看。
                </Text>
              </View>
              <View className="progress-panel__intro-chip">
                <Text className="progress-panel__intro-chip-label">任务状态</Text>
                <Text className="progress-panel__intro-chip-value">{taskStatusLabel}</Text>
              </View>
            </View>

            <PipelineOrbit
              stages={PIPELINE_STAGES}
              currentIndex={progress.stageIndex}
              progressPct={progress.pct}
              title="生成进度"
              stageLabel={currentStageLabel}
              progressMessage="请稍候"
              statusLabel={taskStatusLabel}
              modeLabel="创作流程"
              coreLabel="AI 创作"
            />

            {currentTask?.taskId ? (
              <View className="task-actions">
                <View className="task-cancel-btn" onClick={handleCancelTask}>
                  <Text>取消任务</Text>
                </View>
              </View>
            ) : null}

            <View className="progress-panel__footnote">
              <Text className="progress-panel__footnote-text">
                任务记录会自动同步到个人中心，完成后可以继续试玩、优化或发布作品。
              </Text>
            </View>
          </View>

          <View className="bottom-spacer" />
        </PageScrollContainer>

        <CustomTabBar activeIndex={2} />
      </View>
    );
  }

  // Completion view
  if (currentGame && !isGenerating && isCompletedGameStatus(currentGame?.status)) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
        <View className="create-header create-header--completion">
          <View className="create-header__copy">
            <Text className="create-header__eyebrow">创作完成</Text>
            <Text className="header-title">创作完成！</Text>
            <Text className="header-subtitle">{currentGame.title || gameName || '你的游戏'}已经准备好了</Text>
          </View>
          <View className="create-header__meta">
            <Text className="create-header__meta-label">{canPlay ? 'Ready' : 'Locked'}</Text>
            <Text className="create-header__meta-value">{canPlay ? '试玩' : '订阅'}</Text>
          </View>
        </View>

        <PageScrollContainer
          className="create-scroll"
          style={isH5 ? undefined : { height: `${scrollViewHeight}px` }}
        >
        <View className="completion-panel">
          <View className="completion-badge">
            <Text>{canPlay ? '已就绪' : '待解锁'}</Text>
          </View>
          <Text className="completion-emoji">OK</Text>
          <Text className="completion-title">{currentGame.title || gameName || '新游戏'}</Text>
          <Text className="completion-subtitle">
            {canPlay ? '可以直接试玩这款作品，也可以继续进入优化流程补全细节。' : '当前作品已经生成完成，订阅后即可继续试玩与验证体验。'}
          </Text>

          {error ? (
            <View className="completion-error-banner">
              <Text className="completion-error-text">
                {getUserFacingCreateError(terminalError?.message || error, 'AI 创作')}
              </Text>
            </View>
          ) : null}

          <View className="completion-actions">
            {canPlay ? (
              <View className="action-btn play-btn" onClick={handlePlayGame}>
                <Text>试玩游戏</Text>
              </View>
            ) : (
              <View className="action-btn locked-play-btn" onClick={handleLockedPlay}>
                <Text>订阅后试玩</Text>
              </View>
            )}
            <View className="action-btn new-btn" onClick={() => openIteratePageWithAuth(currentGame, currentGame?.id)}>
              <Text>继续优化</Text>
            </View>
            <View className="action-btn new-btn" onClick={handleNewGame}>
              <Text>再创一个</Text>
            </View>
          </View>

        </View>
        <View style={{ height: '80px' }} />
        </PageScrollContainer>

        <CustomTabBar activeIndex={2} />
        <GlobalGamePlayer />
        <PaywallPopup />
      </View>
    );
  }

  // Main create form (step 1)
  return (
    <View className={containerClassName}>
      <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />

      <PageScrollContainer className="create-scroll">
        <View className="create-entry">
          {!creationSession ? (
            <>
              <View className="create-entry__topbar">
                <View className="create-entry__name">
                  <Input
                    className="create-entry__name-input"
                    placeholder="游戏名称（可选）"
                    placeholderStyle="color: #67627d"
                    value={gameName}
                    onInput={handleGameNameChange}
                    onChange={handleGameNameChange}
                    maxlength={30}
                  />
                </View>
                <View className="create-entry__orientation">
                  {ORIENTATION_OPTIONS.map((option) => {
                    const isActive = orientation === option.value;
                    return (
                      <View
                        key={option.value}
                        className={`create-entry__orientation-option${isActive ? ' is-active' : ''}`}
                        onClick={() => setOrientation(option.value)}
                      >
                        <Text className="create-entry__orientation-text">{option.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View className="create-entry__composer">
                <Textarea
                  className="create-entry__textarea"
                  placeholder="先说一句你想做什么游戏"
                  placeholderStyle="color: #67627d"
                  value={prompt}
                  onInput={handlePromptChange}
                  onChange={handlePromptChange}
                  maxlength={2000}
                  autoHeight
                />
                <View className="create-entry__footer">
                  <Text className="create-entry__count">{prompt.length}/2000</Text>
                  <View
                    className={`create-entry__submit${sessionBusy || !prompt.trim() ? ' is-disabled' : ''}`}
                    onClick={handleSubmit}
                  >
                    <Text>{sessionBusy ? '分析中...' : '开始创作'}</Text>
                  </View>
                </View>
              </View>
            </>
          ) : (
            <CreationSessionScene
              {...buildCreationSessionSceneProps({
                entryMode: 'create',
                session: creationSession,
                answerValue: sessionAnswer,
                onAnswerChange: handleSessionAnswerChange,
                answerPlaceholder: creationSession?.currentQuestion?.placeholder || creationSession?.currentQuestion?.prompt,
                answerSuggestions: creationSession?.currentQuestion?.options || [],
                submitting: sessionBusy,
                actions: buildCreationSessionActions({
                  submitting: sessionBusy,
                  answerValue: sessionAnswer,
                  generateLabel: '开始创作',
                  onSubmit: handleSubmit,
                  onSkip: handleSkipQuestion,
                  onGenerate: handleGenerateFromSession,
                  onRestart: handleRestartSession,
                }),
                errorMessage: error ? getUserFacingCreateError(terminalError?.message || error, '创建游戏') : '',
              })}
            />
          )}

          {!creationSession && error && (
            <View className="error-banner">
              <Text className="error-text">{getUserFacingCreateError(terminalError?.message || error, '创建游戏')}</Text>
              <Text className="error-dismiss" onClick={clearError}>×</Text>
            </View>
          )}
        </View>

        <View className="bottom-spacer" />
      </PageScrollContainer>

      <CustomTabBar activeIndex={2} />
    </View>
  );
}
