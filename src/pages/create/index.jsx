import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Textarea, Input } from '@tarojs/components';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import { PipelineOrbit } from '../../components/common/PipelineOrbit';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import * as gameService from '../../services/game';
import { getWebSocketManager } from '../../services/websocket';
import {
  getPersistedGenerationTaskSnapshot,
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
  getPersistedCreateEntryIntent,
  isLoggedIn,
  openForkPageWithAuth,
  openIteratePageWithAuth,
  openProfilePageWithTab,
} from '../../utils/authNavigation';
import { getGameCoverUrl } from '../../utils/media';
import { getGameOrientation } from '../../utils/gameOrientation';
import { getSafeSystemInfo } from '../../utils/systemInfo';
import { isH5Runtime, isWeappRuntime } from '../../utils/runtime';
import './index.scss';

const EXAMPLE_PROMPTS = [
  { emoji: '🐍', text: '做一个贪吃蛇游戏，触屏滑动控制方向，吃到食物会变长，撞墙或撞到自己游戏结束。' },
  { emoji: '🐹', text: '做一个打地鼠小游戏，九宫格随机出现地鼠，点击得分，30 秒倒计时挑战。' },
  { emoji: '🔢', text: '做一个 2048 益智游戏，上下左右滑动合并相同数字，目标达到 2048。' },
  { emoji: '🚀', text: '做一个太空飞船躲避陨石游戏，左右移动躲避掉落障碍，存活越久分数越高。' },
  { emoji: '🎵', text: '做一个音乐节奏点击游戏，彩色圆点出现后及时点击，连续命中可以加分。' },
  { emoji: '🏃', text: '做一个无尽跑酷游戏，点击屏幕跳跃躲避障碍，速度会越来越快。' },
];

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
    resetCreateSession,
    setCreateEntryIntent,
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
  const confidenceSummary = creationSession?.confidenceSummary || null;
  const questionStrategy = creationSession?.questionStrategy || null;
  const planDraft = creationSession?.planDraft || null;

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
    if (!creationSession?.id || creationSession.status !== 'initializing') {
      stopSessionPolling();
      return undefined;
    }

    const sessionId = creationSession.id;
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
  }, [creationSession?.id, creationSession?.status]);
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

    const persistedCreateEntryIntent = getPersistedCreateEntryIntent();
    if (persistedCreateEntryIntent) {
      setCreateEntryIntent(persistedCreateEntryIntent);
      return;
    }

    const activeTaskSnapshot = getPersistedGenerationTaskSnapshot();
    if (!activeTaskSnapshot?.taskId || activeTaskSnapshot?.taskType === 'pipeline_iterate') {
      return;
    }

    setIsRestoringEntry(true);
    restorePersistedTask(activeTaskSnapshot)
      .then((restored) => {
        if (!restored) {
          Taro.showToast({ title: '恢复创作任务失败', icon: 'none' });
        }
      })
      .finally(() => {
        setIsRestoringEntry(false);
      });
  });

  useDidShow(() => {
    if (!isLoggedIn() || createEntryIntent || isGenerating || currentTask?.taskId || isRestoringEntry) {
      return;
    }

    gameService.getActiveCreationSession()
      .then(async (snapshot) => {
        if (!snapshot) {
          applyCreationSessionSnapshot(null);
          return;
        }

        if (snapshot.status === 'generating' && snapshot.generationTaskId) {
          setIsRestoringEntry(true);
          try {
            await restorePersistedTask({
              taskId: snapshot.generationTaskId,
              gameId: snapshot.generatedGameId || '',
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
    setCreationSession(snapshot);
    if (!snapshot) {
      return;
    }

    if (snapshot.titleDraft) {
      setGameName(snapshot.titleDraft);
    }
    if (snapshot.orientation) {
      setOrientation(snapshot.orientation);
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


  const handleExampleClick = (text) => {
    setPrompt(text);
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
        creationSession.id,
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
      await generateFromCreationSession(creationSession.id, {
        revision: creationSession.revision,
        title: creationSession.titleDraft || gameName,
        promptPreview: creationSession.initialPrompt,
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
        creationSession.id,
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
      await gameService.abandonCreationSession(creationSession.id);
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

  // Session initializing view (C4) — shown while backend AI analysis runs (2–5 s)
  // The useEffect above polls / listens for WS until status reaches `collecting`.
  if (creationSession?.status === 'initializing') {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
        <View className="create-header create-header--restoring">
          <View className="create-header__copy">
            <Text className="create-header__eyebrow">AI Creation Pipeline</Text>
            <Text className="header-title">AI 正在分析</Text>
            <Text className="header-subtitle">正在解析你的游戏想法，即将开始对话</Text>
          </View>
          <View className="create-header__meta">
            <Text className="create-header__meta-label">Session</Text>
            <Text className="create-header__meta-value">初始化中</Text>
          </View>
        </View>
        <View className="expanding-panel">
          <View className="expanding-spinner" />
          <Text className="expanding-text">AI 正在拆解你的想法，马上就好...</Text>
        </View>
        <CustomTabBar activeIndex={2} />
      </View>
    );
  }

  // Chat clarification view
  if (isRestoringEntry) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
        <View className="create-header create-header--restoring">
          <View className="create-header__copy">
            <Text className="create-header__eyebrow">AI Creation Pipeline</Text>
            <Text className="header-title">正在恢复创作</Text>
            <Text className="header-subtitle">马上回到当前作品或进行中的创作任务</Text>
          </View>
          <View className="create-header__meta">
            <Text className="create-header__meta-label">Session</Text>
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
        <View className="create-header create-header--progress">
          <View className="create-header__copy">
            <Text className="create-header__eyebrow">AI Creation Pipeline</Text>
            <Text className="header-title">AI 创作中</Text>
            <Text className="header-subtitle">AI 正在为你生成游戏，请稍候</Text>
          </View>
          <View className="create-header__meta">
            <Text className="create-header__meta-label">{taskStatusLabel}</Text>
            <Text className="create-header__meta-value">{`${progress.pct}%`}</Text>
          </View>
        </View>

        <PageScrollContainer
          className="create-scroll"
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
            <Text className="create-header__eyebrow">Creation Completed</Text>
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
      <View className="create-header create-header--editor">
        <View className="create-header__copy">
          <Text className="create-header__eyebrow">AI Game Atelier</Text>
          <Text className="header-title">创作新游戏</Text>
          <Text className="header-subtitle">描述你的游戏想法，AI 会帮你设计并生成</Text>
        </View>
        <View className="create-header-top">
          <View className="orientation-switch">
            {ORIENTATION_OPTIONS.map((option) => {
              const isActive = orientation === option.value;
              return (
                <View
                  key={option.value}
                  className={`orientation-option${isActive ? ' is-active' : ''}`}
                  onClick={() => setOrientation(option.value)}
                >
                  <Text className="orientation-option__text">{option.label}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      <PageScrollContainer className="create-scroll">
        <View className="create-intro-card">
          <Text className="create-intro-card__eyebrow">Quick Prompt</Text>
          <Text className="create-intro-card__title">一句话说清玩法，剩下的交给 AI。</Text>
          <Text className="create-intro-card__desc">
            你可以先描述核心规则、胜负条件和想要的视觉气质，系统会自动扩展成完整的可玩作品。
          </Text>
        </View>

        <View className="form-section">
          {!creationSession ? (
            <>
              <View className="form-group">
                <Text className="form-label">游戏名称</Text>
                <View className="form-input-wrap">
                  <Input
                    className="form-input"
                    placeholder="给你的游戏起个名字（可选）"
                    placeholderStyle="color: #55516e"
                    value={gameName}
                    onInput={(e) => setGameName(e.detail.value)}
                    maxlength={30}
                  />
                </View>
              </View>

              <View className="form-group">
                <Text className="form-label">描述你的游戏创意</Text>
                <View className="form-input-wrap form-input-wrap--textarea">
                  <Textarea
                    className="form-textarea"
                    placeholder="先说一句核心想法，系统会帮你拆成可生成方案..."
                    placeholderStyle="color: #55516e"
                    value={prompt}
                    onInput={(e) => setPrompt(e.detail.value)}
                    maxlength={2000}
                    autoHeight
                  />
                </View>
                <Text className="input-count">{prompt.length}/2000</Text>
              </View>
            </>
          ) : (
            <>
              <View className="create-intro-card">
                <Text className="create-intro-card__eyebrow">Creation Session</Text>
                <Text className="create-intro-card__title">AI 正在帮你补全关键设定</Text>
                <Text className="create-intro-card__desc">
                  当前信息完整度约 {Math.round((creationSession.slotFillPct || 0) * 100)}%。如果方向已经满意，你也可以直接开始创作。
                </Text>
              </View>

              {planDraft ? (
                <View className="form-group">
                  <Text className="form-label">系统整理出的方案草案</Text>
                  <View className="create-plan-card">
                    <Text className="create-plan-card__eyebrow">Plan Draft</Text>
                    <Text className="create-plan-card__title">{planDraft.title || '未命名方案'}</Text>
                    <Text className="create-plan-card__summary">{planDraft.summary}</Text>
                    <View className="create-plan-grid">
                      {planDraft.concept ? (
                        <View className="create-plan-item">
                          <Text className="create-plan-item__label">玩法定位</Text>
                          <Text className="create-plan-item__value">{planDraft.concept}</Text>
                        </View>
                      ) : null}
                      {planDraft.interaction ? (
                        <View className="create-plan-item">
                          <Text className="create-plan-item__label">核心交互</Text>
                          <Text className="create-plan-item__value">{planDraft.interaction}</Text>
                        </View>
                      ) : null}
                      {planDraft.objective ? (
                        <View className="create-plan-item">
                          <Text className="create-plan-item__label">目标设计</Text>
                          <Text className="create-plan-item__value">{planDraft.objective}</Text>
                        </View>
                      ) : null}
                      {planDraft.pacing ? (
                        <View className="create-plan-item">
                          <Text className="create-plan-item__label">节奏结构</Text>
                          <Text className="create-plan-item__value">{planDraft.pacing}</Text>
                        </View>
                      ) : null}
                      {planDraft.visualDirection ? (
                        <View className="create-plan-item">
                          <Text className="create-plan-item__label">视觉方向</Text>
                          <Text className="create-plan-item__value">{planDraft.visualDirection}</Text>
                        </View>
                      ) : null}
                      {planDraft.signatureMoment ? (
                        <View className="create-plan-item">
                          <Text className="create-plan-item__label">记忆点</Text>
                          <Text className="create-plan-item__value">{planDraft.signatureMoment}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              ) : null}

              {confidenceSummary || questionStrategy ? (
                <View className="form-group">
                  <Text className="form-label">本轮追问策略</Text>
                  <View className="create-quality-card">
                    <Text className="create-quality-card__eyebrow">Quality Guidance</Text>
                    {questionStrategy?.reason ? (
                      <Text className="create-quality-card__title">{questionStrategy.reason}</Text>
                    ) : null}
                    {confidenceSummary ? (
                      <Text className="create-quality-card__desc">
                        当前整体理解把握度约 {Math.round((confidenceSummary.overallConfidence || 0) * 100)}%。
                      </Text>
                    ) : null}
                    <View className="create-chip-row">
                      {(confidenceSummary?.strongestSlots || []).slice(0, 2).map((slotKey) => (
                        <View key={`strong-${slotKey}`} className="create-chip create-chip--good">
                          <Text className="create-chip__text">已较明确：{formatSlotLabel(slotKey)}</Text>
                        </View>
                      ))}
                      {(confidenceSummary?.weakestSlots || []).slice(0, 2).map((slotKey) => (
                        <View key={`weak-${slotKey}`} className="create-chip create-chip--warn">
                          <Text className="create-chip__text">仍需确认：{formatSlotLabel(slotKey)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              ) : null}

              <View className="form-group">
                <Text className="form-label">当前对话</Text>
                <View className="example-list">
                  {creationSession.conversation.slice(-6).map((message, index) => (
                    <View key={`${message.role}-${index}`} className="example-card">
                      <Text className="example-emoji">{message.role === 'assistant' ? 'AI' : '你'}</Text>
                      <Text className="example-text">{message.content}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {creationSession.currentQuestion ? (
                <View className="form-group">
                  <Text className="form-label">当前问题</Text>
                  <View className="create-intro-card">
                    <Text className="create-intro-card__eyebrow">{creationSession.currentQuestion.label}</Text>
                    <Text className="create-intro-card__title">{creationSession.currentQuestion.prompt}</Text>
                  </View>
                </View>
              ) : null}

              <View className="form-group">
                <Text className="form-label">你的补充回答</Text>
                <View className="form-input-wrap form-input-wrap--textarea">
                  <Textarea
                    className="form-textarea"
                    placeholder={creationSession.currentQuestion?.prompt || '如果你想补充更多细节，可以继续输入...'}
                    placeholderStyle="color: #55516e"
                    value={sessionAnswer}
                    onInput={(e) => setSessionAnswer(e.detail.value)}
                    maxlength={1000}
                    autoHeight
                  />
                </View>
                <Text className="input-count">{sessionAnswer.length}/1000</Text>
              </View>
            </>
          )}

          {error && (
            <View className="error-banner">
              <Text className="error-text">{getUserFacingCreateError(terminalError?.message || error, '创建游戏')}</Text>
              <Text className="error-dismiss" onClick={clearError}>×</Text>
            </View>
          )}

          <View className="form-actions">
            {!creationSession ? (
              <View className="submit-btn" onClick={handleSubmit}>
                <Text>{sessionBusy ? '分析中...' : '开始创作会话'}</Text>
              </View>
            ) : (
              <>
                <View className="submit-btn" onClick={handleSubmit}>
                  <Text>{sessionBusy ? '处理中...' : '提交回答'}</Text>
                </View>
                {creationSession.currentQuestion?.skippable ? (
                  <View className="action-btn new-btn" onClick={handleSkipQuestion}>
                    <Text>跳过此题</Text>
                  </View>
                ) : null}
                <View className="action-btn play-btn" onClick={handleGenerateFromSession}>
                  <Text>{creationSession.readyToGenerate ? '开始创作' : '直接生成初稿'}</Text>
                </View>
                <View className="action-btn new-btn" onClick={handleRestartSession}>
                  <Text>重新开始</Text>
                </View>
              </>
            )}
          </View>
        </View>

        <View className="examples-section">
          <Text className="section-title">创意样例 <Text className="section-hint">点击即可直接使用</Text></Text>
          <View className="example-list">
            {EXAMPLE_PROMPTS.map((ex, idx) => (
              <View key={idx} className="example-card" onClick={() => handleExampleClick(ex.text)}>
                <Text className="example-emoji">{ex.emoji}</Text>
                <Text className="example-text">{ex.text}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="tips-section">
          <Text className="tips-title">创作流程</Text>
          <View className="tip-item"><Text className="tip-text">1. 先输入一句核心创意，系统会自动整理方向</Text></View>
          <View className="tip-item"><Text className="tip-text">2. AI 每次只追问一个关键问题，你可以回答或跳过</Text></View>
          <View className="tip-item"><Text className="tip-text">3. 信息足够后即可开始创作，完成后还能继续试玩、优化和 fork</Text></View>
        </View>

        <View className="bottom-spacer" />
      </PageScrollContainer>

      <CustomTabBar activeIndex={2} />
    </View>
  );
}





