import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { useRoute } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import { AppTopBar } from '../../../components/common/AppTopBar';
import { GlobalGamePlayer } from '../../../components/common/GamePlayer';
import { PageScrollContainer } from '../../../components/common/PageScrollContainer';
import { PipelineOrbit } from '../../../components/common/PipelineOrbit';
import { PaywallPopup } from '../../../components/common/PaywallPopup';
import * as gameService from '../../../services/game';
import {
  PIPELINE_STAGES,
  isCompletedGameStatus,
  useGameStore,
} from '../../../store/gameStore';
import useGamePlayerStore from '../../../stores/gamePlayer';
import useQuotaStore from '../../../stores/quotaStore';
import {
  LOGIN_PAGE_URL,
  buildIteratePageUrl,
  isLoggedIn,
  openProfilePageWithTab,
  setPostLoginRedirect,
} from '../../../utils/authNavigation';
import { formatDate } from '../../../utils/date';
import { getGameTypeLabel } from '../../../utils/gameTypes';
import { getGameCoverUrl } from '../../../utils/media';
import { getGameOrientation } from '../../../utils/gameOrientation';
import { isH5Runtime } from '../../../utils/runtime';
import { getSafeSystemInfo } from '../../../utils/systemInfo';
import { buildGameDetailPath } from '../../../utils/share';
import {
  CreationSessionScene,
  buildCreationSessionActions,
  buildCreationSessionSceneProps,
} from '../../../components/creation';
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

const GAME_STATUS_LABELS = {
  ready: '可继续编辑',
  draft: '草稿',
  published: '已发布',
  review: '审核中',
  generating: '生成中',
  failed: '失败',
  banned: '不可用',
};

function getUserFacingIterateError(rawError) {
  const source = typeof rawError === 'string' ? rawError.trim() : '';
  if (!source) {
    return '优化阶段遇到问题，请稍后重试';
  }

  if (/作品已生成完成|加载结果失败|我的作品/i.test(source)) {
    return '作品已生成完成，请到“我的作品”查看';
  }

  if (/已取消|canceled|cancelled/i.test(source)) {
    return '优化任务已取消';
  }

  if (/超时|timeout|timed out/i.test(source)) {
    return '优化阶段处理超时，请稍后重试';
  }

  return '优化阶段遇到问题，请稍后重试';
}

function formatVersionLabel(version) {
  const numericVersion = Number(version);
  if (Number.isFinite(numericVersion) && numericVersion > 0) {
    return `v${numericVersion}`;
  }

  return '待获取';
}

function formatQualityScore(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return '-';
  }

  const rounded = Math.round(numericValue * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatMetadataTime(value) {
  if (!value) {
    return '-';
  }

  try {
    return formatDate(value, 'YYYY-MM-DD HH:mm');
  } catch (_error) {
    return '-';
  }
}

export default function GameIteratePage() {
  const route = useRoute();
  const gameId = route?.params?.gameId || '';
  const taskId = route?.params?.taskId || '';
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const isH5 = isH5Runtime();
  const {
    restorePersistedTask,
    cancelCurrentTask,
    isGenerating,
    generationProgress,
    currentGame,
    currentTask,
    error,
    terminalError,
    canPlay,
    creationSession,
    creationSessionError,
    creationSessionSubmitting,
    getCreationFlowStage,
    restoreActiveCreationSession,
    startCreationSession,
    answerCreationSessionQuestion,
    skipCreationSessionQuestion,
    generateFromCreationSession,
    resetCreationSessionState,
    setCurrentGame,
  } = useGameStore();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const openPaywall = useQuotaStore((s) => s.openPaywall);
  const [iterateFeedback, setIterateFeedback] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [pageError, setPageError] = useState('');
  const [authorTaskMetadata, setAuthorTaskMetadata] = useState(null);
  const iterateSessionBootstrappedGameIdRef = useRef('');
  const { windowHeight = 720 } = getSafeSystemInfo();
  const scrollViewHeight = Math.max(windowHeight - 120, 420);
  const scrollContainerStyle = isH5 ? undefined : { height: `${scrollViewHeight}px` };
  const containerClassName = `iterate-page${isWeapp ? ' iterate-page--weapp' : ''}${isH5 ? ' iterate-page--h5' : ''}`;

  const activeIterateTask = currentTask?.taskType === 'pipeline_iterate' ? currentTask : null;
  const isIterateTaskActive = Boolean(
    isGenerating
    && activeIterateTask
    && (!gameId || !activeIterateTask.gameId || String(activeIterateTask.gameId) === String(gameId))
  );
  const creationFlowStage = getCreationFlowStage ? getCreationFlowStage() : 'idle';

  useEffect(() => {
    if (isLoggedIn()) {
      return;
    }

    const targetUrl = buildIteratePageUrl(gameId, taskId);
    setPostLoginRedirect(targetUrl);
    Taro.navigateTo({ url: LOGIN_PAGE_URL }).catch(() => {});
  }, [gameId, taskId]);

  useEffect(() => {
    if (!isLoggedIn()) {
      return undefined;
    }

    let cancelled = false;

    const bootstrap = async () => {
      setPageError('');
      setIsBootstrapping(true);

      try {
        if (taskId) {
          const restored = await restorePersistedTask({
            taskId,
            taskType: 'pipeline_iterate',
            gameId: gameId || currentGame?.id || '',
            status: currentTask?.status || 'running',
          });

          if (!restored && !cancelled) {
            setPageError('恢复优化任务失败，请稍后重试');
          }
          return;
        }

        if (!gameId) {
          if (!cancelled) {
            setPageError('缺少作品信息，无法继续优化');
          }
          return;
        }

        if (String(currentGame?.id || '') === String(gameId)) {
          return;
        }

        const game = await gameService.getGame(gameId);
        if (!cancelled) {
          setCurrentGame(game);
        }
      } catch (_error) {
        if (!cancelled) {
          setPageError('加载要优化的作品失败，请从“我的作品”重新进入');
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    currentGame?.id,
    currentTask?.status,
    gameId,
    restorePersistedTask,
    setCurrentGame,
    taskId,
  ]);

  useEffect(() => {
    const currentGameId = currentGame?.id || gameId;

    if (!currentGameId || isIterateTaskActive || !isCompletedGameStatus(currentGame?.status)) {
      setAuthorTaskMetadata(null);
      return undefined;
    }

    let cancelled = false;
    const taskForCurrentGame = activeIterateTask?.gameId === currentGameId ? activeIterateTask : null;
    setAuthorTaskMetadata(taskForCurrentGame);

    gameService.getGenerationStatus(currentGameId)
      .then((taskMeta) => {
        if (!cancelled && taskMeta?.gameId === currentGameId) {
          setAuthorTaskMetadata((previous) => ({
            ...(previous || {}),
            ...taskMeta,
          }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    activeIterateTask,
    currentGame?.id,
    currentGame?.status,
    gameId,
    isIterateTaskActive,
  ]);

  useEffect(() => {
    const currentCompletedGameId = String(currentGame?.id || '');
    if (
      !currentCompletedGameId
      || isBootstrapping
      || taskId
      || isIterateTaskActive
      || !isCompletedGameStatus(currentGame?.status)
    ) {
      return;
    }

    const matchesCurrentIterateSession = creationSession
      && creationSession.entryMode === 'iterate'
      && String(creationSession.sourceGameId || '') === currentCompletedGameId;

    if (matchesCurrentIterateSession) {
      iterateSessionBootstrappedGameIdRef.current = currentCompletedGameId;
      return;
    }

    if (iterateSessionBootstrappedGameIdRef.current === currentCompletedGameId) {
      return;
    }

    iterateSessionBootstrappedGameIdRef.current = currentCompletedGameId;

    const bootstrapPrompt = currentGame?.description
      || `继续优化《${currentGame?.title || '当前作品'}》`;

    restoreActiveCreationSession({ silentIfMissing: true })
      .then((restoredSession) => {
        const restoredMatches = restoredSession
          && restoredSession.entryMode === 'iterate'
          && String(restoredSession.sourceGameId || '') === currentCompletedGameId;

        if (restoredMatches) {
          return restoredSession;
        }

        return startCreationSession(bootstrapPrompt, currentGame?.title || '', {
          entryMode: 'iterate',
          sourceGameId: currentCompletedGameId,
          orientation: getGameOrientation(currentGame),
          generationTier: 'standard',
        });
      })
      .catch((err) => {
        setPageError(err?.message || '初始化优化会话失败，请稍后重试');
        iterateSessionBootstrappedGameIdRef.current = '';
      });
  }, [
    creationSession,
    currentGame,
    isBootstrapping,
    isIterateTaskActive,
    restoreActiveCreationSession,
    startCreationSession,
    taskId,
  ]);

  const taskMetadata = useMemo(() => {
    if (!currentGame?.id) {
      return null;
    }

    if (authorTaskMetadata?.gameId === currentGame.id) {
      return authorTaskMetadata;
    }

    if (activeIterateTask?.gameId === currentGame.id) {
      return activeIterateTask;
    }

    return null;
  }, [activeIterateTask, authorTaskMetadata, currentGame?.id]);

  const metadataItems = useMemo(() => {
    const gameTypeValue = getGameTypeLabel(currentGame?.type || currentGame?.gameType || '')
      || currentGame?.type
      || '未分类';

    return [
      { label: '当前标题', value: currentGame?.title || '-' },
      { label: '当前版本', value: formatVersionLabel(taskMetadata?.version) },
      { label: '作品状态', value: GAME_STATUS_LABELS[currentGame?.status] || currentGame?.status || '-' },
      { label: '游戏类型', value: gameTypeValue },
      { label: '质量分', value: formatQualityScore(currentGame?.qualityScore) },
      {
        label: '最近更新',
        value: formatMetadataTime(currentGame?.updatedAt || taskMetadata?.completedAt || taskMetadata?.startedAt),
      },
    ];
  }, [
    currentGame?.gameType,
    currentGame?.qualityScore,
    currentGame?.status,
    currentGame?.title,
    currentGame?.type,
    currentGame?.updatedAt,
    taskMetadata?.completedAt,
    taskMetadata?.startedAt,
    taskMetadata?.version,
  ]);

  const handlePlayGame = () => {
    if (currentGame?.gameUrl) {
      openGame(currentGame.gameUrl, currentGame.title || '游戏', getGameCoverUrl(currentGame), {
        canPlay,
        isOwnGame: true,
        gameId: currentGame.id,
        orientation: getGameOrientation(currentGame),
      });
      return;
    }

    if (currentGame?.id) {
      Taro.navigateTo({ url: buildGameDetailPath(currentGame.id) }).catch(() => {});
    }
  };

  const handleOpenDetail = () => {
    if (!currentGame?.id) {
      return;
    }

    const needsAuthorView = !['published', 'review'].includes(String(currentGame?.status || ''));
    Taro.navigateTo({
      url: buildGameDetailPath(currentGame.id, needsAuthorView ? { authorView: 1 } : {}),
    }).catch(() => {});
  };

  const handleLockedPlay = () => {
    openPaywall({
      gameId: currentGame?.id,
      gameUrl: currentGame?.gameUrl,
      gameTitle: currentGame?.title || '游戏',
      gameCover: getGameCoverUrl(currentGame),
      gameOrientation: getGameOrientation(currentGame),
      resumePlay: true,
    });
  };

  const handleCancelTask = () => {
    if (!currentTask?.taskId) {
      return;
    }

    Taro.showModal({
      title: '取消优化任务',
      content: '确认取消当前优化任务吗？已经生成的结果不会继续更新。',
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

  const handleSubmitSessionAnswer = async () => {
    if (!iterateFeedback.trim()) {
      Taro.showToast({ title: '请输入本轮优化说明', icon: 'none' });
      return;
    }

    try {
      await answerCreationSessionQuestion(iterateFeedback.trim());
      setIterateFeedback('');
    } catch (err) {
      Taro.showToast({ title: err?.message || '提交回答失败，请稍后重试', icon: 'none' });
    }
  };

  const handleSkipSessionQuestion = async () => {
    try {
      await skipCreationSessionQuestion();
      setIterateFeedback('');
    } catch (err) {
      Taro.showToast({ title: err?.message || '跳过问题失败，请稍后重试', icon: 'none' });
    }
  };

  const handleGenerateFromSession = async () => {
    try {
      await generateFromCreationSession({
        orientation: getGameOrientation(currentGame),
        generationTier: creationSession?.generationTier || 'standard',
      });
    } catch (err) {
      Taro.showToast({ title: err?.message || '生成阶段遇到问题，可稍后重试', icon: 'none' });
    }
  };

  const handleRestartIterateSession = async () => {
    if (!currentGame?.id) {
      return;
    }

    resetCreationSessionState();
    iterateSessionBootstrappedGameIdRef.current = '';
    setIterateFeedback('');

    try {
      await startCreationSession(
        currentGame?.description || `继续优化《${currentGame?.title || '当前作品'}》`,
        currentGame?.title || '',
        {
          entryMode: 'iterate',
          sourceGameId: currentGame.id,
          orientation: getGameOrientation(currentGame),
          generationTier: 'standard',
        }
      );
    } catch (err) {
      Taro.showToast({ title: err?.message || '重新开始优化会话失败', icon: 'none' });
    }
  };

  if (isBootstrapping) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={() => openProfilePageWithTab('tasks')} />
        <View className="iterate-hero">
          <Text className="iterate-hero__title">正在加载优化页面</Text>
          <Text className="iterate-hero__subtitle">马上带你回到这款游戏的当前版本</Text>
        </View>
        <View className="iterate-loading-card">
          <View className="iterate-loading-card__spinner" />
          <Text className="iterate-loading-card__text">正在准备作品和任务数据...</Text>
        </View>
      </View>
    );
  }

  if (isIterateTaskActive) {
    const progress = generationProgress || { stageIndex: 0, pct: 5, stageLabel: '准备中...' };
    const taskStatusLabel = TASK_STATUS_LABELS[currentTask?.status] || '执行中';
    const currentStageLabel = progress.stageLabel || '正在优化作品';

    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={() => openProfilePageWithTab('tasks')} />
        <View className="iterate-hero">
          <Text className="iterate-hero__title">AI 正在优化</Text>
          <Text className="iterate-hero__subtitle">AI 正在基于当前版本优化，请稍候</Text>
        </View>

        <PageScrollContainer className="iterate-scroll" style={scrollContainerStyle} scrollY>
          <View className="progress-panel">
            <PipelineOrbit
              stages={PIPELINE_STAGES}
              currentIndex={progress.stageIndex}
              progressPct={progress.pct}
              title="优化进度"
              stageLabel={currentStageLabel}
              statusLabel={taskStatusLabel}
              modeLabel="优化流程"
              coreLabel="AI 优化"
            />

            <View className="progress-bar-wrapper">
              <View className="progress-bar-bg">
                <View className="progress-bar-fill" style={{ width: `${progress.pct}%` }} />
              </View>
              <Text className="progress-pct">{progress.pct}%</Text>
            </View>

            <View className="stage-list">
              {PIPELINE_STAGES.map((stage, idx) => {
                const isDone = idx < progress.stageIndex;
                const isCurrent = idx === progress.stageIndex;

                return (
                  <View
                    key={stage.key}
                    className={`stage-item ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''} ${!isDone && !isCurrent ? 'pending' : ''}`}
                  >
                    <View className="stage-indicator">
                      {isDone
                        ? <Text className="stage-check">✓</Text>
                        : isCurrent
                          ? <View className="stage-pulse" />
                          : <View className="stage-dot" />}
                    </View>
                    <Text className="stage-label">{stage.label}</Text>
                    {isCurrent ? <Text className="stage-active-hint">进行中...</Text> : null}
                  </View>
                );
              })}
            </View>

            {currentTask?.taskId ? (
              <View className="task-actions">
                <View className="task-cancel-btn" onClick={handleCancelTask}>
                  <Text>取消任务</Text>
                </View>
              </View>
            ) : null}
          </View>
        </PageScrollContainer>

        <GlobalGamePlayer />
        <PaywallPopup />
      </View>
    );
  }

  if (!currentGame || !isCompletedGameStatus(currentGame?.status)) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={() => openProfilePageWithTab('tasks')} />
        <View className="iterate-hero">
          <Text className="iterate-hero__title">还没有可优化的作品</Text>
          <Text className="iterate-hero__subtitle">{pageError || '请从“我的作品”里选择一款游戏进入优化'}</Text>
        </View>
        <View className="iterate-empty-card">
          <Text className="iterate-empty-card__icon">!</Text>
          <Text className="iterate-empty-card__title">当前入口没有挂上作品数据</Text>
          <Text className="iterate-empty-card__text">
            请从“我的作品”里选择一款已生成的游戏，再继续优化。
          </Text>
          <View className="iterate-empty-card__action" onClick={() => openProfilePageWithTab('works')}>
            <Text>返回我的作品</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className={containerClassName}>
      <AppTopBar showBack rightText="任务" onRightClick={() => openProfilePageWithTab('tasks')} />
      <View className="iterate-hero">
        <Text className="iterate-hero__title">优化游戏</Text>
        <Text className="iterate-hero__subtitle">基于当前版本继续优化玩法、文案和体验</Text>
      </View>

      <PageScrollContainer className="iterate-scroll" style={scrollContainerStyle} scrollY>
        <View className="iterate-panel">
          <View className="iterate-metadata-card">
            <Text className="iterate-metadata-card__title">当前版本信息</Text>
            <Text className="iterate-metadata-card__hint">
              优化会基于这个版本继续生成
            </Text>
            {currentGame?.description ? (
              <Text className="iterate-metadata-card__summary">{currentGame.description}</Text>
            ) : null}
            <View className="iterate-metadata-grid">
              {metadataItems.map((item) => (
                <View key={item.label} className="iterate-metadata-item">
                  <Text className="iterate-metadata-item__label">{item.label}</Text>
                  <Text className="iterate-metadata-item__value">{item.value}</Text>
                </View>
              ))}
            </View>
          </View>

          {(error || pageError) ? (
            <View className="iterate-error-banner">
              <Text className="iterate-error-banner__text">
                {getUserFacingIterateError(terminalError?.message || error || pageError)}
              </Text>
            </View>
          ) : null}

          <View className="iterate-actions">
            {canPlay ? (
              <View className="iterate-action-btn iterate-action-btn--primary" onClick={handlePlayGame}>
                <Text>试玩当前版本</Text>
              </View>
            ) : (
              <View className="iterate-action-btn iterate-action-btn--secondary" onClick={handleLockedPlay}>
                <Text>订阅后试玩</Text>
              </View>
            )}
            <View className="iterate-action-btn iterate-action-btn--ghost" onClick={handleOpenDetail}>
              <Text>查看作品详情</Text>
            </View>
          </View>

          {creationSession?.entryMode === 'iterate' && ['collecting', 'ready', 'failed', 'expired', 'abandoned'].includes(creationFlowStage) ? (
            <CreationSessionScene
              {...buildCreationSessionSceneProps({
                entryMode: 'iterate',
                session: creationSession,
                answerValue: iterateFeedback,
                onAnswerChange: (e) => setIterateFeedback(e?.detail?.value || ''),
                answerPlaceholder: creationSession?.currentQuestion?.placeholder,
                answerSuggestions: creationSession?.currentQuestion?.options || [],
                submitting: creationSessionSubmitting,
                actions: buildCreationSessionActions({
                  submitting: creationSessionSubmitting,
                  answerValue: iterateFeedback,
                  generateLabel: '直接开始优化',
                  onSubmit: handleSubmitSessionAnswer,
                  onSkip: handleSkipSessionQuestion,
                  onGenerate: handleGenerateFromSession,
                  onRestart: handleRestartIterateSession,
                }),
                errorMessage: creationSessionError,
              })}
            />
          ) : (
            <>
              {!creationSession && creationSessionError ? (
                <View className="iterate-error-banner">
                  <Text className="iterate-error-banner__text">{getUserFacingIterateError(creationSessionError || pageError)}</Text>
                </View>
              ) : null}
              <View className="iterate-error-banner">
                <Text className="iterate-error-banner__text">
                  {creationSessionSubmitting
                    ? '正在整理这次优化方向，请稍候...'
                    : '正在准备优化会话，请稍候。'}
                </Text>
              </View>
            </>
          )}
        </View>

        <View style={{ height: '80px' }} />
      </PageScrollContainer>

      <GlobalGamePlayer />
      <PaywallPopup />
    </View>
  );
}
