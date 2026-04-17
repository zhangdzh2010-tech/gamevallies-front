import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from '@tarojs/components';
import { useRoute } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import { AppTopBar } from '../../../components/common/AppTopBar';
import { GlobalGamePlayer } from '../../../components/common/GamePlayer';
import { PageScrollContainer } from '../../../components/common/PageScrollContainer';
import { GenerationProgressPanel } from '../../../components/common/GenerationProgressPanel';
import { PaywallPopup } from '../../../components/common/PaywallPopup';
import {
  CreationCreateWorkspace,
  CreationReferenceCard,
  CreationResumeScene,
  CreationSessionActions,
  CreationSessionShell,
  CreationStateCard,
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

function getUserFacingIterateError(rawError) {
  const source = typeof rawError === 'string' ? rawError.trim() : '';
  if (!source) {
    return '';
  }

  if (/作品已经生成完成|加载结果失败|我的作品/i.test(source)) {
    return '作品已经生成完成，请到“我的作品”查看';
  }

  if (/canceled|cancelled|已取消/i.test(source)) {
    return '优化任务已取消';
  }

  if (/timeout|timed out|超时/i.test(source)) {
    return '优化阶段处理超时，请稍后重试';
  }

  return source;
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
    creationSessionUiState,
    creationSessionError,
    creationSessionSubmitting,
    refreshCreationSession,
    startCreationSession,
    confirmEditedPrompt,
    confirmCurrentPrompt,
    confirmAndGenerate,
    abandonCreationSession,
    resetCreationSessionState,
    setCurrentGame,
  } = useGameStore();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const openPaywall = useQuotaStore((s) => s.openPaywall);
  const [iterateFeedback, setIterateFeedback] = useState('');
  const [sessionPromptDraft, setSessionPromptDraft] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [pageError, setPageError] = useState('');
  const [authorTaskMetadata, setAuthorTaskMetadata] = useState(null);
  const [resumeCandidate, setResumeCandidate] = useState(null);
  const [resumeDecisionSubmitting, setResumeDecisionSubmitting] = useState(false);
  const iterateSessionBootstrappedGameIdRef = useRef('');
  const promptDraftSyncKeyRef = useRef('');
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
  const isIterateSessionActive = creationSession?.entryMode === 'iterate' && creationSession?.status !== 'generating';
  const canStartIterateSession = Boolean(iterateFeedback.trim());

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
          return;
        }

        resetCreationSessionState();
        setResumeCandidate(null);
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

  useEffect(() => {
    if (!creationSession || creationSession.entryMode !== 'iterate') {
      return;
    }

    const nextDraftKey = `${creationSession.sessionId || ''}:${creationSession.revision ?? ''}`;
    if (promptDraftSyncKeyRef.current !== nextDraftKey) {
      setSessionPromptDraft(creationSession.expandedPrompt || '');
      promptDraftSyncKeyRef.current = nextDraftKey;
    }
  }, [
    creationSession?.entryMode,
    creationSession?.expandedPrompt,
    creationSession?.revision,
    creationSession?.sessionId,
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

  const handleConfirmEditedIteratePrompt = async () => {
    const nextPromptDraft = sessionPromptDraft.trim();
    if (!nextPromptDraft) {
      Taro.showToast({ title: '请先完善提示词', icon: 'none' });
      return;
    }

    try {
      await confirmEditedPrompt(nextPromptDraft);
    } catch (err) {
      Taro.showToast({ title: err?.message || '确认提示词失败，请稍后重试', icon: 'none' });
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
        },
      );
      iterateSessionBootstrappedGameIdRef.current = String(currentGame.id);
      setIterateFeedback('');
      setSessionPromptDraft('');
      promptDraftSyncKeyRef.current = '';
    } catch (err) {
      Taro.showToast({ title: err?.message || '开启优化会话失败，请稍后重试', icon: 'none' });
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
      setSessionPromptDraft('');
      promptDraftSyncKeyRef.current = '';
    } catch (err) {
      Taro.showToast({ title: err?.message || '开始新一轮优化失败，请稍后重试', icon: 'none' });
    } finally {
      setResumeDecisionSubmitting(false);
    }
  };

  const handleConfirmCurrentIteratePrompt = async () => {
    try {
      await confirmCurrentPrompt();
    } catch (err) {
      Taro.showToast({ title: err?.message || '确认当前提示词失败，请稍后重试', icon: 'none' });
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
      setSessionPromptDraft('');
      promptDraftSyncKeyRef.current = '';
    } catch (err) {
      Taro.showToast({ title: err?.message || '重新开始优化会话失败', icon: 'none' });
    }
  };

  const normalizedIterateExpandedPrompt = String(creationSession?.expandedPrompt || '').trim();
  const normalizedIteratePromptDraft = sessionPromptDraft.trim();
  const hasIteratePromptChanges = Boolean(
    normalizedIteratePromptDraft
    && normalizedIteratePromptDraft !== normalizedIterateExpandedPrompt
  );
  const canConfirmCurrentIteratePrompt = Boolean(
    isIterateSessionActive && creationSession?.status === 'collecting'
  );
  const canEditIteratePrompt = Boolean(isIterateSessionActive && creationSessionUiState?.canEditPrompt);
  const canGenerateIterateSession = Boolean(isIterateSessionActive && creationSessionUiState?.canGenerate);
  const activeIterateInputPlaceholder = isIterateSessionActive
    ? '在这里修改这一轮优化提示词...'
    : '继续补充你这轮最想优化的部分...';

  const ensureIterateSession = async () => {
    if (isIterateSessionActive && creationSession?.sessionId) {
      return creationSession;
    }

    if (!canStartIterateSession) {
      Taro.showToast({ title: '请先说说这次最想优化的部分', icon: 'none' });
      return null;
    }

    const nextSession = await startCreationSession(
      iterateFeedback.trim(),
      currentGame?.title || '',
      {
        entryMode: 'iterate',
        sourceGameId: currentGame?.id,
        orientation: getGameOrientation(currentGame),
        generationTier: 'standard',
      },
    );

    iterateSessionBootstrappedGameIdRef.current = String(currentGame?.id || '');
    setResumeCandidate(null);
    setIterateFeedback('');
    setSessionPromptDraft('');
    promptDraftSyncKeyRef.current = '';
    return nextSession;
  };

  const handleIterateWorkspacePrimaryAction = async () => {
    if (isIterateSessionActive) {
      await handleConfirmEditedIteratePrompt();
      return;
    }

    await handleStartIterateSession();
  };

  const handleIterateWorkspaceGenerate = async () => {
    try {
      const nextSession = await ensureIterateSession();
      if (!nextSession?.sessionId) {
        return;
      }

      await confirmAndGenerate({
        editedPrompt: isIterateSessionActive ? sessionPromptDraft : '',
        orientation: getGameOrientation(currentGame),
        generationTier: nextSession?.generationTier || 'standard',
      });
    } catch (err) {
      Taro.showToast({ title: err?.message || '生成阶段遇到问题，可稍后重试', icon: 'none' });
    }
  };

  const isIterateSessionCompleted = Boolean(
    !isGenerating
    && creationSession?.entryMode === 'iterate'
    && creationSession?.status === 'generating'
    && currentGame
    && String(creationSession?.gameId || currentGame?.id || '') === String(currentGame?.id || '')
    && isCompletedGameStatus(currentGame?.status)
  );

  const iterateWorkspaceError = getUserFacingIterateError(
    (creationSession?.entryMode === 'iterate'
      ? (creationSessionError || terminalError?.message || error || '')
      : '')
    || pageError
    || ''
  );

  const renderIteratePage = (content, { workspaceLayout = false } = {}) => (
    <View className={containerClassName}>
      <AppTopBar showBack rightText="任务" onRightClick={() => openProfilePageWithTab('tasks')} />
      <PageScrollContainer
        className={`iterate-scroll${workspaceLayout ? ' iterate-scroll--workspace' : ''}`}
        style={scrollContainerStyle}
        scrollY
      >
        <View className={`creation-page-shell${workspaceLayout ? ' creation-page-shell--workspace' : ''}`}>
          {content}
          {!workspaceLayout ? <View className="creation-page-spacer" /> : null}
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
    const progress = generationProgress || {
      stages: PIPELINE_STAGES,
      stageIndex: 0,
      pct: 5,
      stageLabel: PIPELINE_STAGES[0]?.label || '提交需求',
      message: '正在接收你的优化需求',
    };
    const taskStatusLabel = TASK_STATUS_LABELS[currentTask?.status] || '执行中';
    const currentStageLabel = progress.stageLabel || '正在优化作品';

    return renderIteratePage(
      <CreationSessionShell
        hideHero
        sections={[
          {
            key: 'iterate-progress-panel',
            node: (
              <GenerationProgressPanel
                stages={progress.stages || PIPELINE_STAGES}
                currentIndex={progress.stageIndex}
                progressPct={progress.pct}
                stageLabel={currentStageLabel}
                progressMessage={progress.message}
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
          {
            key: 'iterate-progress-notice',
            node: (
              <CreationStateCard
                eyebrow="同步说明"
                title="任务记录会自动同步到个人中心"
                description="完成后你可以先试玩新版本，再决定是否继续下一轮优化。"
              />
            ),
          },
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

  const iterateReferenceCard = (
    <CreationReferenceCard
      eyebrow="当前底稿"
      title={currentGame?.title || '未命名作品'}
      badge="这次优化会基于这一版继续生成"
      description={currentGame?.description || '这一版作品会作为本轮优化的起点。'}
      metadata={metadataItems}
    />
  );

  const iterateWorkspaceSecondaryActions = (() => {
    if (!isIterateSessionActive) {
      return [
        {
          key: 'generate-iterate-directly',
          label: '直接生成',
          tone: 'primary',
          onClick: handleIterateWorkspaceGenerate,
          disabled: creationSessionSubmitting || !canStartIterateSession,
        },
      ];
    }

    const actions = [];

    if (canConfirmCurrentIteratePrompt) {
      actions.push({
        key: 'confirm-current-iterate-prompt',
        label: '直接使用当前提示词',
        onClick: handleConfirmCurrentIteratePrompt,
        disabled: creationSessionSubmitting,
      });
    }

    if (canGenerateIterateSession) {
      actions.push({
        key: 'generate-iterate-session',
        label: creationSession?.status === 'ready' ? '开始生成' : '直接生成',
        tone: 'primary',
        onClick: handleIterateWorkspaceGenerate,
        disabled: creationSessionSubmitting,
      });
    }

    actions.push({
      key: 'restart-iterate-session',
      label: '重新开始',
      tone: 'danger',
      onClick: handleRestartIterateSession,
      disabled: creationSessionSubmitting,
    });

    return actions;
  })();

  const iterateWorkspace = (
    <CreationCreateWorkspace
      showSettings={false}
      topContent={iterateReferenceCard}
      session={isIterateSessionActive ? creationSession : null}
      inputValue={isIterateSessionActive ? sessionPromptDraft : iterateFeedback}
      onInputChange={(e) => {
        const nextValue = e?.detail?.value || '';
        if (isIterateSessionActive) {
          setSessionPromptDraft(nextValue);
          return;
        }
        setIterateFeedback(nextValue);
      }}
      inputPlaceholder={activeIterateInputPlaceholder}
      onPrimaryAction={handleIterateWorkspacePrimaryAction}
      primaryActionLabel={isIterateSessionActive ? '确认并保存提示词' : '开始整理优化提示词'}
      primaryActionDisabled={
        creationSessionSubmitting
        || (isIterateSessionActive ? !canEditIteratePrompt || !hasIteratePromptChanges : !canStartIterateSession)
      }
      secondaryActions={iterateWorkspaceSecondaryActions}
      errorMessage={iterateWorkspaceError}
      isSubmitting={creationSessionSubmitting}
      workspaceTitle={isIterateSessionActive ? '确认这轮优化提示词' : '说说这轮想怎么优化'}
      workspaceHint={isIterateSessionActive
        ? 'AI 已经整理出一版优化提示词。你可以先修改确认，再开始真正生成。'
        : '先描述这一轮最想优化的地方，AI 会先扩写成一版提示词，再由你确认。'}
      introMessage="先告诉我这轮最想优化哪里，我会先帮你整理出一版完整提示词。"
      helperText={isIterateSessionActive
        ? (creationSession?.currentQuestion?.prompt || creationSession?.currentQuestion?.content || '请确认或修改这版优化提示词。')
        : ''}
      loadingTitle="正在整理并扩写这一轮优化方向"
      loadingDescription="完成后你会先看到一版可编辑提示词，确认后才会真正开始优化生成。"
      initialLabel="这轮优化方向"
      initialHint="可以描述你想调整的节奏、手感、美术或目标用户体验。"
      draftLabel="优化提示词"
      draftHint={creationSession?.status === 'ready'
        ? '这版提示词已经确认。你仍然可以继续修改并再次保存。'
        : '你可以直接修改这段提示词，也可以直接使用当前版本。'}
    />
  );

  if (isIterateSessionCompleted) {
    return renderIteratePage(
      <CreationSessionShell
        hideHero
        sections={[
          {
            key: 'iterate-result-summary',
            node: (
              <CreationStateCard
                tone={canPlay ? 'success' : 'warning'}
                centered
                eyebrow={canPlay ? '已就绪' : '待解锁'}
                title={currentGame?.title || '优化后的作品'}
                description={canPlay
                  ? '现在可以直接试玩这版结果，也可以继续追加新的优化方向。'
                  : '这版结果已经生成完成，订阅后即可试玩并继续验证体验。'}
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
                    key: 'iterate-open-detail',
                    label: '查看详情',
                    onClick: handleOpenDetail,
                  },
                  {
                    key: 'iterate-again',
                    label: '继续优化',
                    onClick: handleRestartIterateSession,
                  },
                ]}
              />
            ),
          },
        ]}
      />,
    );
  }

  return renderIteratePage(iterateWorkspace, { workspaceLayout: true });
}
