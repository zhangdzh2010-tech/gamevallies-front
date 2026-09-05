import CreativeStudio from '../../../components/creative-web/CreativeStudio';
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
import { sanitizeUserIdea } from '../../../utils/sanitizeIdea';
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
    return '作品已经生成完成，请到"我的作品"查看';
  }

  if (/canceled|cancelled|已取消/i.test(source)) {
    return '这次优化已取消';
  }

  if (/timeout|timed out|超时/i.test(source)) {
    return '这次优化等了太久，请稍后再试';
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
  const currentIterateSourceGameId = String(currentGame?.id || gameId || '');
  const isCurrentIterateSession = Boolean(
    creationSession?.entryMode === 'iterate'
    && (
      !currentIterateSourceGameId
      || String(creationSession.sourceGameId || '') === currentIterateSourceGameId
    )
  );
  const isIterateTaskActive = Boolean(
    isGenerating
    && (
      (
        isCurrentIterateSession
        && (creationSession?.status === 'generating' || generationProgress)
      )
      || (
        activeIterateTask
        && taskId
        && String(activeIterateTask.taskId || '') === String(taskId)
      )
    )
  );
  const isIterateSessionActive = isCurrentIterateSession && creationSession?.status !== 'generating';
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

        const activeGeneratedIterateGameId = creationSession?.entryMode === 'iterate'
          && creationSession?.status === 'generating'
          ? creationSession?.gameId
          : '';
        const hasGeneratedIterateResultLoaded = Boolean(
          activeGeneratedIterateGameId
          && String(currentGame?.id || '') === String(activeGeneratedIterateGameId)
          && isCompletedGameStatus(currentGame?.status)
        );

        if (String(currentGame?.id || '') === String(gameId) || hasGeneratedIterateResultLoaded) {
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
    currentGame?.status,
    currentTask?.status,
    creationSession?.entryMode,
    creationSession?.gameId,
    creationSession?.status,
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
      && (
        String(creationSession.sourceGameId || '') === currentCompletedGameId
        || (
          creationSession.status === 'generating'
          && String(creationSession.gameId || '') === currentCompletedGameId
        )
      );

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
      Taro.showToast({ title: '请先把这一版方向写完整', icon: 'none' });
      return;
    }

    try {
      await confirmEditedPrompt(nextPromptDraft);
    } catch (err) {
      Taro.showToast({ title: err?.message || '保存这版方向失败，请稍后重试', icon: 'none' });
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
      Taro.showToast({ title: err?.message || '使用当前这版失败，请稍后重试', icon: 'none' });
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
    ? '在这里继续改这一轮优化的方向...'
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
      ? (creationSessionError || error || terminalError?.message || '')
      : '')
    || pageError
    || ''
  );

  const renderIteratePage = (content, { workspaceLayout = false } = {}) => (
    <View className={containerClassName}>
      <AppTopBar showBack rightText="我的创作" onRightClick={() => openProfilePageWithTab('tasks')} />
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

  if (isH5) {
    const readyToGenerate = isIterateSessionActive && !hasIteratePromptChanges
      && (canGenerateIterateSession || canConfirmCurrentIteratePrompt);
    return <CreativeStudio
      mode="iterate" title={currentGame?.title || ''}
      orientation={getGameOrientation(currentGame, 'landscape')}
      input={isIterateSessionActive ? sessionPromptDraft : iterateFeedback}
      onInputChange={value => isIterateSessionActive ? setSessionPromptDraft(value) : setIterateFeedback(value)}
      session={isCurrentIterateSession ? creationSession : null} work={currentGame}
      generating={isGenerating} progress={generationProgress}
      loading={isBootstrapping || creationSessionSubmitting || resumeDecisionSubmitting}
      error={iterateWorkspaceError}
      primary={{
        label: readyToGenerate ? '按此方向继续创作' : isIterateSessionActive ? '确认修改方向' : '整理创意方向',
        onClick: readyToGenerate ? handleIterateWorkspaceGenerate : handleIterateWorkspacePrimaryAction,
        disabled: Boolean(resumeCandidate) || !currentGame?.id || (readyToGenerate ? false : isIterateSessionActive ? !canEditIteratePrompt || !hasIteratePromptChanges : !canStartIterateSession),
      }}
      secondary={isIterateSessionActive ? [{ key: 'restart', label: '重新整理方向', onClick: handleRestartIterateSession }] : []}
      canPlay={currentGame?.canPlay !== false} onUnlock={handleLockedPlay}
      onCancel={currentTask?.taskId ? handleCancelTask : null}
      supplemental={resumeCandidate ? <div className="cw-ready"><strong>发现未完成的创作方向</strong><p>继续上次的思路，或开始一轮新的调整。</p><button className="cw-button cw-outline" disabled={resumeDecisionSubmitting} onClick={handleContinueIterateSession}>继续上次创作</button><button className="cw-button cw-outline" disabled={resumeDecisionSubmitting} onClick={handleStartFreshIterateSession}>开启新一轮</button></div> : null}
    />;
  }

  if (isBootstrapping) {
    return renderIteratePage(
      <CreationSessionShell
        eyebrow="正在准备"
        title="正在加载优化页面"
        subtitle="马上带你回到这件作品的当前版本。"
        statusLabel="当前状态"
        statusValue="正在准备"
        sections={[
          {
            key: 'iterate-bootstrapping',
            node: (
              <CreationStateCard
                eyebrow="稍等一下"
                title="正在准备作品数据"
                description="我们会先把这款作品的当前版本和你没做完的创作一起拿回来。"
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
      stageLabel: PIPELINE_STAGES[0]?.label || '收到想法',
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
                modeLabel="AI 正在优化"
                coreLabel="AI 优化"
              />
            ),
          },
          currentTask?.taskId ? {
            key: 'iterate-progress-actions',
            node: (
              <CreationSessionActions
                title="本轮操作"
                hint="如果这次方向跑偏，可以先停掉，再说一次你想怎么改。"
                actions={[
                  {
                    key: 'cancel-iterate-task',
                    label: '先停下',
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
                eyebrow="小贴士"
                title="这次优化会自动保存到个人中心"
                description="完成后你可以先试玩新版本，再看要不要再改一版。"
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
        statusValue="没有选作品"
        sections={[
          {
            key: 'iterate-missing-game',
            node: (
              <CreationStateCard
                tone="danger"
                eyebrow="需要先选作品"
                title="这次进来没带上具体作品"
                description={pageError || '请从"我的作品"里选择一款已生成完成的游戏，再继续优化。'}
              />
            ),
          },
          {
            key: 'iterate-missing-actions',
            node: (
              <CreationSessionActions
                title="下一步"
                hint='回到作品列表，点你想修改的那款作品上的"优化"按钮。'
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
      eyebrow="基于这一版"
      title={currentGame?.title || '未命名作品'}
      badge="这次优化会基于这一版继续生成"
      description={sanitizeUserIdea(currentGame?.description) || '这一版作品会作为本轮优化的起点。'}
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
        label: '直接用这一版',
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
      primaryActionLabel={isIterateSessionActive ? '确认这版方向' : '让 AI 整理一下方向'}
      primaryActionDisabled={
        creationSessionSubmitting
        || (isIterateSessionActive ? !canEditIteratePrompt || !hasIteratePromptChanges : !canStartIterateSession)
      }
      secondaryActions={iterateWorkspaceSecondaryActions}
      errorMessage={iterateWorkspaceError}
      isSubmitting={creationSessionSubmitting}
      workspaceTitle={isIterateSessionActive ? '确认这一版要改的方向' : '说说这轮想怎么改'}
      workspaceHint={isIterateSessionActive
        ? 'AI 根据你说的，整理出下面这段方向。你可以改改，觉得合适就开始。'
        : '先描述这一轮最想改的地方，AI 会帮你补成一版完整方向，你改改就能开始。'}
      introMessage="先告诉我这轮最想改哪里，我会整理出一版完整方向。"
      helperText={isIterateSessionActive
        ? (creationSession?.currentQuestion?.prompt || creationSession?.currentQuestion?.content || '请确认或修改这一版方向。')
        : ''}
      loadingTitle="AI 正在把你说的想法补成完整方向"
      loadingDescription="通常只要几秒，AI 会整理出一版你可以改的方向。"
      initialLabel="这轮想改的方向"
      initialHint="可以描述你想调整的节奏、手感、美术或想让它更适合谁探索。"
      draftLabel="AI 整理出的方向"
      draftHint={creationSession?.status === 'ready'
        ? '这版方向已经确认。你仍然可以继续改，再次保存。'
        : '你可以继续改这段方向，也可以直接用现在这一版。'}
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
                eyebrow={canPlay ? '搞定' : '待解锁'}
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
                hint="如果这版已经接近你想要的效果，可以先试玩；如果还想继续改，可以直接再改一版。"
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

