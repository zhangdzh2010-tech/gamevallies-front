import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from '@tarojs/components';
import { useRoute } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import { AppTopBar } from '../../../components/common/AppTopBar';
import { GlobalGamePlayer } from '../../../components/common/GamePlayer';
import { PageScrollContainer } from '../../../components/common/PageScrollContainer';
import { PipelineOrbit } from '../../../components/common/PipelineOrbit';
import { PaywallPopup } from '../../../components/common/PaywallPopup';
import {
  CreationAnswerComposer,
  CreationEntryErrorCard,
  CreationQuestionCard,
  CreationReferenceCard,
  CreationResumeScene,
  CreationSessionActions,
  CreationSessionScene,
  CreationSessionShell,
  CreationStateCard,
  buildCreationSessionActions,
  buildCreationSessionSceneProps,
} from '../../../components/creation';
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
import { getGameOrientation } from '../../../utils/gameOrientation';
import { getGameTypeLabel } from '../../../utils/gameTypes';
import { getGameCoverUrl } from '../../../utils/media';
import { isH5Runtime } from '../../../utils/runtime';
import { buildGameDetailPath } from '../../../utils/share';
import { getSafeSystemInfo } from '../../../utils/systemInfo';
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

const ITERATE_SESSION_STATUS_LABELS = {
  initializing: '初始化中',
  collecting: '继续补充',
  ready: '可直接生成',
  failed: '需要重开',
  expired: '会话过期',
  abandoned: '已结束',
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
    refreshCreationSession,
    startCreationSession,
    answerCreationSessionQuestion,
    skipCreationSessionQuestion,
    generateFromCreationSession,
    abandonCreationSession,
    resetCreationSessionState,
    setCurrentGame,
  } = useGameStore();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const openPaywall = useQuotaStore((s) => s.openPaywall);
  const [iterateFeedback, setIterateFeedback] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [pageError, setPageError] = useState('');
  const [authorTaskMetadata, setAuthorTaskMetadata] = useState(null);
  const [resumeCandidate, setResumeCandidate] = useState(null);
  const [resumeDecisionSubmitting, setResumeDecisionSubmitting] = useState(false);
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
  const iterateSessionStatusValue = ITERATE_SESSION_STATUS_LABELS[creationSession?.status] || (
    creationFlowStage === 'ready' ? '可直接生成' : '继续补充'
  );

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

    gameService.getActiveCreationSession()
      .then((restoredSession) => {
        const restoredMatches = restoredSession
          && restoredSession.entryMode === 'iterate'
          && String(restoredSession.sourceGameId || '') === currentCompletedGameId;

        if (restoredMatches) {
          resetCreationSessionState();
          setResumeCandidate(restoredSession);
          return restoredSession;
        }

        resetCreationSessionState();
        setResumeCandidate(null);
        return null;
      })
      .catch((err) => {
        if (err?.statusCode === 404) {
          setResumeCandidate(null);
          return;
        }
        setPageError(err?.message || '初始化优化会话失败，请稍后重试');
        iterateSessionBootstrappedGameIdRef.current = '';
      });
  }, [
    creationSession,
    currentGame,
    isBootstrapping,
    isIterateTaskActive,
    resetCreationSessionState,
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
      Taro.showToast({ title: '请先输入这轮优化说明', icon: 'none' });
      return;
    }

    try {
      await answerCreationSessionQuestion(iterateFeedback.trim());
      setIterateFeedback('');
    } catch (err) {
      Taro.showToast({ title: err?.message || '提交回答失败，请稍后重试', icon: 'none' });
    }
  };

  const handleStartIterateSession = async () => {
    if (!currentGame?.id) {
      return;
    }

    if (!iterateFeedback.trim()) {
      Taro.showToast({ title: '请先说说这次最想优化的部分', icon: 'none' });
      return;
    }

    try {
      setResumeCandidate(null);
      await startCreationSession(
        iterateFeedback.trim(),
        currentGame?.title || '',
        {
          entryMode: 'iterate',
          sourceGameId: currentGame.id,
          orientation: getGameOrientation(currentGame),
          generationTier: 'standard',
        }
      );
      iterateSessionBootstrappedGameIdRef.current = String(currentGame.id);
      setIterateFeedback('');
    } catch (err) {
      Taro.showToast({ title: err?.message || '开启优化对话失败，请稍后重试', icon: 'none' });
    }
  };

  const handleContinueIterateSession = async () => {
    if (!resumeCandidate?.sessionId) {
      return;
    }

    setResumeDecisionSubmitting(true);
    try {
      await refreshCreationSession(resumeCandidate.sessionId);
      setResumeCandidate(null);
    } catch (err) {
      Taro.showToast({ title: err?.message || '恢复上次优化失败，请稍后重试', icon: 'none' });
    } finally {
      setResumeDecisionSubmitting(false);
    }
  };

  const handleStartFreshIterateSession = async () => {
    if (!resumeCandidate?.sessionId) {
      setResumeCandidate(null);
      return;
    }

    setResumeDecisionSubmitting(true);
    try {
      await abandonCreationSession(resumeCandidate.sessionId);
      resetCreationSessionState();
      setResumeCandidate(null);
      iterateSessionBootstrappedGameIdRef.current = '';
    } catch (err) {
      Taro.showToast({ title: err?.message || '开始新一轮优化失败，请稍后重试', icon: 'none' });
    } finally {
      setResumeDecisionSubmitting(false);
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
    try {
      if (creationSession?.sessionId) {
        await abandonCreationSession(creationSession.sessionId);
      }
      resetCreationSessionState();
      iterateSessionBootstrappedGameIdRef.current = '';
      setIterateFeedback('');
    } catch (err) {
      Taro.showToast({ title: err?.message || '重新开始优化会话失败', icon: 'none' });
    }
  };

  const iterateSessionSceneProps = creationSession?.entryMode === 'iterate'
    ? buildCreationSessionSceneProps({
        entryMode: 'iterate',
        session: creationSession,
        statusValue: iterateSessionStatusValue,
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
      })
    : null;
  const isIterateSessionCompleted = Boolean(
    !isGenerating
    && creationSession?.entryMode === 'iterate'
    && creationSession?.status === 'generating'
    && currentGame
    && String(creationSession?.gameId || currentGame?.id || '') === String(currentGame?.id || '')
    && isCompletedGameStatus(currentGame?.status)
  );

  const pagePrimaryError = getUserFacingIterateError(terminalError?.message || error || pageError || '');

  const renderIteratePage = (content) => (
    <View className={containerClassName}>
      <AppTopBar showBack rightText="任务" onRightClick={() => openProfilePageWithTab('tasks')} />
      <PageScrollContainer className="iterate-scroll" style={scrollContainerStyle} scrollY>
        <View className="creation-page-shell">
          {content}
          <View className="creation-page-spacer" />
        </View>
      </PageScrollContainer>
      <GlobalGamePlayer />
      <PaywallPopup />
    </View>
  );

  if (isBootstrapping) {
    return renderIteratePage(
      <CreationSessionShell
        eyebrow="加载优化上下文"
        title="正在加载优化页面"
        subtitle="马上带你回到这款游戏的当前版本。"
        statusLabel="当前状态"
        statusValue="准备中"
        sections={[
          {
            key: 'iterate-bootstrapping',
            node: (
              <CreationStateCard
                eyebrow="稍等一下"
                title="正在准备作品和任务数据"
                description="系统会先同步当前作品、版本信息和可能存在的进行中任务。"
                loading
              />
            ),
          },
        ]}
      />,
    );
  }

  if (isIterateTaskActive) {
    const progress = generationProgress || { stageIndex: 0, pct: 5, stageLabel: '准备中...' };
    const taskStatusLabel = TASK_STATUS_LABELS[currentTask?.status] || '执行中';
    const currentStageLabel = progress.stageLabel || '正在优化作品';

    return renderIteratePage(
      <CreationSessionShell
        eyebrow="AI 优化中"
        title="AI 正在优化这款作品"
        subtitle="系统会沿着当前方向继续打磨玩法、节奏和体验细节。"
        statusLabel={taskStatusLabel}
        statusValue={`${progress.pct}%`}
        sections={[
          {
            key: 'iterate-progress-focus',
            node: (
              <CreationStateCard
                eyebrow="当前焦点"
                title={currentStageLabel}
                description="完成这一轮后，你就可以试玩新的版本或继续追改。"
              />
            ),
          },
          {
            key: 'iterate-progress-orbit',
            node: (
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
            ),
          },
          currentTask?.taskId ? {
            key: 'iterate-progress-actions',
            node: (
              <CreationSessionActions
                title="任务操作"
                hint="如果这轮方向不对，可以先取消任务，再重新发起新的优化会话。"
                actions={[
                  {
                    key: 'cancel-iterate-task',
                    label: '取消任务',
                    tone: 'danger',
                    onClick: handleCancelTask,
                  },
                ]}
              />
            ),
          } : null,
        ].filter(Boolean)}
      />,
    );
  }

  if (!currentGame || !isCompletedGameStatus(currentGame?.status)) {
    return renderIteratePage(
      <CreationSessionShell
        eyebrow="无法开始优化"
        title="还没有可优化的作品"
        subtitle="请从“我的作品”里选择一款已经生成完成的游戏进入优化。"
        statusLabel="当前状态"
        statusValue="缺少底稿"
        sections={[
          {
            key: 'iterate-missing-game',
            node: (
              <CreationStateCard
                tone="danger"
                eyebrow="需要先选作品"
                title="当前入口没有挂上作品数据"
                description={pageError || '请从“我的作品”里选择一款已生成完成的游戏，再继续优化。'}
              />
            ),
          },
          {
            key: 'iterate-missing-actions',
            node: (
              <CreationSessionActions
                title="下一步"
                hint="回到作品列表后，从目标作品的优化入口重新进入。"
                actions={[
                  {
                    key: 'go-profile-works',
                    label: '返回我的作品',
                    tone: 'primary',
                    onClick: () => openProfilePageWithTab('works'),
                  },
                ]}
              />
            ),
          },
        ]}
      />,
    );
  }

  if (resumeCandidate?.entryMode === 'iterate' && !creationSession) {
    return renderIteratePage(
      <CreationResumeScene
        entryMode="iterate"
        session={resumeCandidate}
        subjectTitle={resumeCandidate?.title || currentGame?.title || '未命名作品'}
        submitting={resumeDecisionSubmitting}
        onContinue={handleContinueIterateSession}
        onRestart={handleStartFreshIterateSession}
      />,
    );
  }

  const actionCards = (
    <>
      <CreationReferenceCard
        eyebrow="当前底稿"
        title={currentGame?.title || '未命名作品'}
        badge="这次优化会基于这一版继续生成"
        description={currentGame?.description || '这版作品会作为本轮优化的起点。'}
        metadata={metadataItems}
      />
      <CreationSessionActions
        title="作品操作"
        hint="你可以先试玩当前版本，再决定是否继续追加一轮新的优化。"
        actions={[
          canPlay
            ? {
                key: 'play-current-game',
                label: '试玩当前版本',
                tone: 'primary',
                onClick: handlePlayGame,
              }
            : {
                key: 'unlock-current-game',
                label: '订阅后试玩',
                tone: 'primary',
                onClick: handleLockedPlay,
              },
          {
            key: 'open-current-detail',
            label: '查看作品详情',
            tone: 'ghost',
            onClick: handleOpenDetail,
          },
        ]}
      />
    </>
  );

  if (isIterateSessionCompleted) {
    return renderIteratePage(
      <CreationSessionShell
        eyebrow="优化完成"
        title="这轮优化已经准备好了"
        subtitle="新的版本已经生成完成，你可以先试玩验证，再决定要不要继续下一轮打磨。"
        statusLabel="当前状态"
        statusValue={canPlay ? '可试玩' : '待解锁'}
        sections={[
          {
            key: 'iterate-result-summary',
            node: (
              <CreationStateCard
                tone={canPlay ? 'success' : 'warning'}
                centered
                eyebrow={canPlay ? '已就绪' : '待解锁'}
                title={currentGame?.title || '优化后的作品'}
                description={canPlay ? '现在可以直接试玩这版结果，也可以继续追加新的优化方向。' : '这版结果已经生成完成，订阅后即可试玩并继续验证体验。'}
              />
            ),
          },
          {
            key: 'iterate-result-actions',
            node: (
              <CreationSessionActions
                title="下一步"
                hint="如果这版已经接近你想要的效果，可以先试玩；如果还想继续改，可以直接开始下一轮。"
                actions={[
                  canPlay
                    ? {
                        key: 'play-iterate-result',
                        label: '试玩这一版',
                        tone: 'primary',
                        onClick: handlePlayGame,
                      }
                    : {
                        key: 'unlock-iterate-result',
                        label: '订阅后试玩',
                        tone: 'primary',
                        onClick: handleLockedPlay,
                      },
                  {
                    key: 'open-iterate-result-detail',
                    label: '查看作品详情',
                    tone: 'ghost',
                    onClick: handleOpenDetail,
                  },
                  {
                    key: 'restart-iterate-after-result',
                    label: '开始下一轮优化',
                    tone: 'ghost',
                    onClick: handleRestartIterateSession,
                  },
                ]}
              />
            ),
          },
          {
            key: 'iterate-result-reference',
            node: actionCards,
          },
        ]}
      />,
    );
  }

  if (creationSession?.entryMode === 'iterate' && iterateSessionSceneProps) {
    return renderIteratePage(
      <>
        <CreationSessionScene {...iterateSessionSceneProps} />
        {actionCards}
      </>,
    );
  }

  return renderIteratePage(
    <>
      <CreationSessionShell
        eyebrow="继续打磨"
        title="先说这次最想优化哪里"
        subtitle="先用一句话告诉 AI 这次要改什么，它会据此整理方向，再继续追问。"
        statusLabel="进行中"
        statusValue="等待你的方向"
        sections={[
          (error || pageError) ? {
            key: 'iterate-entry-error',
            node: <CreationEntryErrorCard entryMode="iterate" error={pagePrimaryError} />,
          } : null,
          {
            key: 'iterate-first-prompt',
            node: (
              <>
                <CreationQuestionCard
                  title="这次想重点优化什么？"
                  hint="你可以直接说节奏、手感、视觉、角色反馈，或者你觉得现在最不满意的地方。"
                  question={{
                    content: '这次你最想先把哪部分变得更好？',
                    description: '比如更爽快、更紧张、更清晰，或者更换题材和视觉风格。',
                  }}
                />
                <CreationAnswerComposer
                  value={iterateFeedback}
                  onChange={(e) => setIterateFeedback(e?.detail?.value || '')}
                  placeholder="例如：保留贪吃蛇核心玩法，但节奏更快一点，吃到食物时的反馈更爽。"
                  suggestions={[
                    '保留核心玩法，但把节奏做得更快一点。',
                    '我想重点优化视觉表现和吃到食物时的反馈。',
                    '想让难度爬升更平滑，前期更轻松，后期更刺激。',
                  ]}
                  disabled={creationSessionSubmitting}
                />
                <CreationSessionActions
                  title="开始优化"
                  hint="发起会话后，系统会先整理优化方向，再进入统一的追问和生成流程。"
                  actions={[
                    {
                      key: 'start-iterate-session',
                      label: creationSessionSubmitting ? 'AI 正在整理你的方向...' : '开始这轮优化会话',
                      tone: 'primary',
                      disabled: creationSessionSubmitting || !iterateFeedback.trim(),
                      onClick: handleStartIterateSession,
                    },
                    ...(creationSessionError
                      ? [{
                          key: 'retry-iterate-session',
                          label: creationSessionSubmitting ? '重试中...' : '重新提交这段方向',
                          tone: 'ghost',
                          disabled: creationSessionSubmitting || !iterateFeedback.trim(),
                          onClick: handleStartIterateSession,
                        }]
                      : []),
                  ]}
                />
              </>
            ),
          },
        ].filter(Boolean)}
      />
      {actionCards}
    </>,
  );
}
