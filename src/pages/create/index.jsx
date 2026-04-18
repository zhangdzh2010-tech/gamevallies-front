import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import { GenerationProgressPanel } from '../../components/common/GenerationProgressPanel';
import { PaywallPopup } from '../../components/common/PaywallPopup';
import {
  CreationCreateWorkspace,
  CreationResultCoverCard,
  CreationSessionActions,
  CreationSessionShell,
  CreationStateCard,
} from '../../components/creation';
import {
  getPersistedGenerationTaskSnapshot,
  isCompletedGameStatus,
  useGameStore,
  PIPELINE_STAGES,
} from '../../store/gameStore';
import useGamePlayerStore from '../../stores/gamePlayer';
import useQuotaStore from '../../stores/quotaStore';
import { getQuotaSummary } from '../../utils/quotaSummary';
import {
  consumePersistedCreateEntryIntent,
  ensureCreateAccess,
  getPersistedCreateEntryIntent,
  isLoggedIn,
  openForkPageWithAuth,
  openIteratePageWithAuth,
  openProfilePageWithTab,
} from '../../utils/authNavigation';
import { getGameOrientation } from '../../utils/gameOrientation';
import { getGameCoverUrl } from '../../utils/media';
import { isH5Runtime, isWeappRuntime } from '../../utils/runtime';
import { getSafeSystemInfo } from '../../utils/systemInfo';
import { toastError, toastInfo } from '../../utils/feedback';
import './index.scss';

const ORIENTATION_OPTIONS = [
  { value: 'portrait', label: '竖屏' },
  { value: 'landscape', label: '横屏' },
];

function getUserFacingCreateError(rawError, fallbackStageLabel = 'AI 整理提示词') {
  const source = typeof rawError === 'string' ? rawError.trim() : '';
  if (!source) {
    return `${fallbackStageLabel}时遇到问题，请稍后重试`;
  }

  if (/作品已经生成完成|加载结果失败|我的作品/i.test(source)) {
    return '作品已经生成完成，请到“我的作品”查看';
  }

  if (/canceled|cancelled|已取消/i.test(source)) {
    return '创作任务已取消';
  }

  if (/timeout|timed out|超时/i.test(source)) {
    return `${fallbackStageLabel}处理超时，请稍后重试`;
  }

  return `${fallbackStageLabel}时遇到问题，请稍后重试`;
}

export default function Create() {
  const isH5 = isH5Runtime();
  const isWeapp = isWeappRuntime();
  const {
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
    creationSession,
    creationSessionUiState,
    creationSessionError,
    creationSessionSubmitting,
    startCreationSession,
    confirmEditedPrompt,
    confirmCurrentPrompt,
    confirmAndGenerate,
    abandonCreationSession,
    restoreActiveCreationSession,
    resetCreationSessionState,
  } = useGameStore();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const openPaywall = useQuotaStore((s) => s.openPaywall);
  const freeQuota = useQuotaStore((s) => s.freeQuota);
  const totalFreeQuota = useQuotaStore((s) => s.totalFreeQuota);
  const quotaSubscription = useQuotaStore((s) => s.subscription);
  const fetchQuota = useQuotaStore((s) => s.fetchQuota);
  const quotaLoading = useQuotaStore((s) => s.loading);
  const [gameName, setGameName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [sessionPromptDraft, setSessionPromptDraft] = useState('');
  const [orientation, setOrientation] = useState('portrait');
  const [isRestoringEntry, setIsRestoringEntry] = useState(false);
  const authRedirectingRef = useRef(false);
  const promptDraftSyncKeyRef = useRef('');
  const { windowHeight = 720 } = getSafeSystemInfo();
  const scrollViewHeight = Math.max(windowHeight - 120, 400);
  const scrollContainerStyle = isH5 ? undefined : { height: `${scrollViewHeight}px` };
  const containerClassName = `create-container${isH5 ? ' create-container--h5' : ''}${isWeapp ? ' create-container--weapp' : ''}`;
  const entryErrorMessage = creationSessionError || error || terminalError?.message || '';

  const openTaskCenter = () => {
    openProfilePageWithTab('tasks');
  };

  const resetLocalCreateState = () => {
    setPrompt('');
    setSessionPromptDraft('');
    setGameName('');
    setOrientation('portrait');
    promptDraftSyncKeyRef.current = '';
  };

  useEffect(() => {
    if (!creationSession || creationSession.entryMode !== 'create') {
      return;
    }

    if (creationSession.titleDraft || creationSession.title) {
      setGameName(creationSession.titleDraft || creationSession.title || '');
    }

    if (creationSession.orientation) {
      setOrientation(creationSession.orientation);
    }

    const nextInitialPrompt = creationSession.initialPrompt || creationSession.prompt || '';
    if (nextInitialPrompt) {
      setPrompt(nextInitialPrompt);
    }

    const nextDraftKey = `${creationSession.sessionId || ''}:${creationSession.revision ?? ''}`;
    if (promptDraftSyncKeyRef.current !== nextDraftKey) {
      setSessionPromptDraft(creationSession.expandedPrompt || '');
      promptDraftSyncKeyRef.current = nextDraftKey;
    }
  }, [
    creationSession?.entryMode,
    creationSession?.expandedPrompt,
    creationSession?.initialPrompt,
    creationSession?.orientation,
    creationSession?.prompt,
    creationSession?.revision,
    creationSession?.sessionId,
    creationSession?.title,
    creationSession?.titleDraft,
  ]);

  useDidShow(() => {
    if (isLoggedIn()) {
      authRedirectingRef.current = false;
      // Refresh quota on page enter so the banner and gate reflect latest state.
      try {
        fetchQuota(false)?.catch?.(() => {});
      } catch (err) {
        // Non-fatal; banner will simply fall back to zero state.
      }
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

  // NOTE: pipeline_iterate tasks are routed directly by openTaskCreatePageWithAuth /
  // openIteratePageWithAuth at the entry points (profile task center, iterate entry, etc.),
  // so we no longer need a mid-flight redirect on the create page. If an iterate task is
  // still detected after restoration we simply hand it off once via useDidShow below.
  const iterateRedirectGuardRef = useRef(false);

  useDidShow(() => {
    if (iterateRedirectGuardRef.current) {
      return;
    }
    if (currentTask?.taskType !== 'pipeline_iterate' || !currentTask?.taskId) {
      return;
    }

    iterateRedirectGuardRef.current = true;
    openIteratePageWithAuth(currentGame, currentTask.gameId || currentGame?.id || null, {
      taskId: currentTask.taskId,
    });
  });

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
          toastError('恢复创作任务失败', '恢复创作任务失败');
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

    restoreActiveCreationSession({ silentIfMissing: true })
      .then((session) => {
        if (session?.entryMode && session.entryMode !== 'create') {
          resetCreationSessionState();
        }
      })
      .catch(() => undefined);
  });

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
            toastError('恢复创作任务失败，请重试', '恢复创作任务失败，请重试');
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
    resetCreateSession,
    restorePersistedTask,
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
          toastError(err, '取消失败，请重试');
        }
      },
    });
  };

  const handleStartCreateSession = async () => {
    if (!prompt.trim() || prompt.trim().length < 5) {
      toastInfo('请输入更完整的游戏描述');
      return;
    }

    clearError();
    setSessionPromptDraft('');

    try {
      await startCreationSession(
        prompt.trim(),
        gameName.trim(),
        {
          entryMode: 'create',
          orientation,
          generationTier: 'standard',
        },
      );
    } catch (err) {
      toastError(getUserFacingCreateError(err?.message, '创作会话'), '创作会话启动失败');
    }
  };

  const handleConfirmEditedCreatePrompt = async () => {
    const nextPromptDraft = sessionPromptDraft.trim();
    if (!nextPromptDraft) {
      toastInfo('请先完善提示词');
      return;
    }

    clearError();

    try {
      await confirmEditedPrompt(nextPromptDraft);
    } catch (err) {
      toastError(getUserFacingCreateError(err?.message, '创作会话'), '保存提示词失败');
    }
  };

  const handleConfirmCurrentCreatePrompt = async () => {
    try {
      await confirmCurrentPrompt();
    } catch (err) {
      toastError(getUserFacingCreateError(err?.message, '创作会话'), '保存提示词失败');
    }
  };

  const canSendEntryPrompt = prompt.trim().length >= 5;
  const isCreateSessionActive = creationSession?.entryMode === 'create' && creationSession?.status !== 'generating';
  const normalizedExpandedPrompt = String(creationSession?.expandedPrompt || '').trim();
  const normalizedDraftPrompt = sessionPromptDraft.trim();
  const hasCreatePromptChanges = Boolean(
    normalizedDraftPrompt && normalizedDraftPrompt !== normalizedExpandedPrompt
  );
  const canEditCreatePrompt = Boolean(isCreateSessionActive && creationSessionUiState?.canEditPrompt);
  const canGenerateCreateSession = Boolean(isCreateSessionActive && creationSessionUiState?.canGenerate);
  const canConfirmCurrentCreatePrompt = Boolean(
    isCreateSessionActive && creationSession?.status === 'collecting'
  );
  const activeCreateInputValue = isCreateSessionActive ? sessionPromptDraft : prompt;
  const activeCreateInputPlaceholder = isCreateSessionActive
    ? '在这里修改 AI 整理后的提示词...'
    : '先说一句你想做的游戏...';

  const ensureCreateSession = async () => {
    if (isCreateSessionActive && creationSession?.sessionId) {
      return creationSession;
    }

    if (!canSendEntryPrompt) {
      toastInfo('请先把想法说完整一点');
      return null;
    }

    return startCreationSession(
      prompt.trim(),
      gameName.trim(),
      {
        entryMode: 'create',
        orientation,
        generationTier: 'standard',
      },
    );
  };

  const handleCreateWorkspaceGenerate = async () => {
    try {
      const nextSession = await ensureCreateSession();
      if (!nextSession?.sessionId) {
        return;
      }

      clearError();

      await confirmAndGenerate({
        editedPrompt: isCreateSessionActive ? sessionPromptDraft : '',
        orientation,
        generationTier: nextSession?.generationTier || 'standard',
        ...(gameName.trim() ? { title: gameName.trim() } : {}),
      });
    } catch (err) {
      toastError(getUserFacingCreateError(err?.message, '创建游戏'), '创建游戏失败');
    }
  };

  const handleRestartCreateSession = async () => {
    try {
      if (creationSession?.sessionId) {
        await abandonCreationSession(creationSession.sessionId);
      }
      resetCreateSession();
      resetLocalCreateState();
    } catch (err) {
      toastError(getUserFacingCreateError(err?.message, '创作会话'), '重置创作会话失败');
    }
  };

  const handlePlayGame = () => {
    if (!currentGame?.gameUrl) {
      return;
    }

    openGame(currentGame.gameUrl, currentGame.title || gameName, getGameCoverUrl(currentGame), {
      canPlay,
      isOwnGame: true,
      gameId: currentGame.id,
      orientation: getGameOrientation(currentGame, orientation),
    });
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

  const renderCreatePage = (
    content,
    { withGamePlayer = false, withPaywall = false, workspaceLayout = false } = {},
  ) => (
    <View className={containerClassName}>
      <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
      <PageScrollContainer
        className={`create-scroll${workspaceLayout ? ' create-scroll--workspace' : ''}`}
        style={scrollContainerStyle}
        scrollY
      >
        <View className={`creation-page-shell${workspaceLayout ? ' creation-page-shell--workspace' : ''}`}>
          {content}
          {!workspaceLayout ? <View className="creation-page-spacer creation-page-spacer--tabbar" /> : null}
        </View>
      </PageScrollContainer>
      <CustomTabBar activeIndex={2} />
      {withGamePlayer ? <GlobalGamePlayer /> : null}
      {withPaywall ? <PaywallPopup /> : null}
    </View>
  );

  // ------- Primary-button state machine -------
  // A. No session            → Primary: 开始整理     Secondary: [直接生成]
  // B. Session + hasChanges  → Primary: 确认修改     Secondary: [保存并生成, 重新开始]
  // C. Session + noChanges   → Primary: 开始生成     Secondary: [重新开始]
  const createFlowState = (() => {
    if (!isCreateSessionActive) return 'entry';
    if (hasCreatePromptChanges) return 'draft-editing';
    return 'ready-to-generate';
  })();

  const quotaSummary = getQuotaSummary({
    freeQuota,
    totalFreeQuota,
    subscription: quotaSubscription,
  });
  const hasActiveSubscription = Boolean(quotaSubscription?.active);
  const isOutOfQuota = !hasActiveSubscription && quotaSummary.totalRemaining <= 0;
  const openCreationPaywall = () => openPaywall({});

  const createPrimaryConfig = (() => {
    if (createFlowState === 'entry') {
      if (isOutOfQuota) {
        return {
          label: '订阅后解锁创作',
          onClick: openCreationPaywall,
          disabled: false,
        };
      }

      return {
        label: '开始整理提示词',
        onClick: handleStartCreateSession,
        disabled: creationSessionSubmitting || !canSendEntryPrompt,
      };
    }

    if (createFlowState === 'draft-editing') {
      return {
        label: '确认修改并保存提示词',
        onClick: handleConfirmEditedCreatePrompt,
        disabled: creationSessionSubmitting || !canEditCreatePrompt,
      };
    }

    if (isOutOfQuota) {
      return {
        label: '订阅后解锁生成',
        onClick: openCreationPaywall,
        disabled: false,
      };
    }

    return {
      label: '开始生成',
      onClick: handleCreateWorkspaceGenerate,
      disabled: creationSessionSubmitting
        || (!canGenerateCreateSession && !canConfirmCurrentCreatePrompt),
    };
  })();

  const createWorkspaceSecondaryActions = (() => {
    if (createFlowState === 'entry') {
      return [
        {
          key: 'generate-create-directly',
          label: '直接生成',
          tone: 'ghost',
          onClick: handleCreateWorkspaceGenerate,
          disabled: creationSessionSubmitting || !canSendEntryPrompt,
        },
      ];
    }

    if (createFlowState === 'draft-editing') {
      return [
        {
          key: 'save-and-generate',
          label: '保存并开始生成',
          tone: 'primary',
          onClick: handleCreateWorkspaceGenerate,
          disabled: creationSessionSubmitting,
        },
        {
          key: 'restart-create-session',
          label: '重新开始',
          tone: 'danger',
          onClick: handleRestartCreateSession,
          disabled: creationSessionSubmitting,
        },
      ];
    }

    return [
      {
        key: 'restart-create-session',
        label: '重新开始',
        tone: 'danger',
        onClick: handleRestartCreateSession,
        disabled: creationSessionSubmitting,
      },
    ];
  })();

  const quotaBannerCopy = (() => {
    if (quotaLoading && !hasActiveSubscription && quotaSummary.totalRemaining === 0) {
      return { tone: 'neutral', text: '正在核对你的创作额度…' };
    }

    if (hasActiveSubscription) {
      const remaining = Number.isFinite(quotaSummary.subscriptionRemaining)
        ? quotaSummary.subscriptionRemaining
        : 0;
      return {
        tone: 'success',
        text: `会员创作额度：本周期还可创作 ${remaining} 次`,
      };
    }

    if (quotaSummary.freeRemaining > 0) {
      return {
        tone: 'neutral',
        text: `还有 ${quotaSummary.freeRemaining} 次免费创作，生成后自动扣减`,
      };
    }

    return {
      tone: 'warning',
      text: '免费额度已用完，订阅后即可继续创作',
    };
  })();

  const quotaBanner = (
    <View className={`create-quota-banner create-quota-banner--${quotaBannerCopy.tone}`}>
      <Text className="create-quota-banner__text">{quotaBannerCopy.text}</Text>
      {isOutOfQuota ? (
        <View
          className="create-quota-banner__action"
          onClick={openCreationPaywall}
        >
          <Text className="create-quota-banner__action-text">查看订阅</Text>
        </View>
      ) : null}
    </View>
  );

  const createWorkspace = (
    <CreationCreateWorkspace
      showSettings={!isCreateSessionActive}
      topContent={quotaBanner}
      gameName={gameName}
      onGameNameChange={(e) => setGameName(e?.detail?.value || '')}
      orientation={orientation}
      onOrientationChange={setOrientation}
      orientationOptions={ORIENTATION_OPTIONS}
      session={isCreateSessionActive ? creationSession : null}
      inputValue={activeCreateInputValue}
      onInputChange={(e) => {
        const nextValue = e?.detail?.value || '';
        if (isCreateSessionActive) {
          setSessionPromptDraft(nextValue);
          return;
        }
        setPrompt(nextValue);
      }}
      inputPlaceholder={activeCreateInputPlaceholder}
      onPrimaryAction={createPrimaryConfig.onClick}
      primaryActionLabel={createPrimaryConfig.label}
      primaryActionDisabled={createPrimaryConfig.disabled}
      secondaryActions={createWorkspaceSecondaryActions}
      errorMessage={entryErrorMessage}
      isSubmitting={creationSessionSubmitting}
      workspaceTitle={isCreateSessionActive ? '确认你的生成提示词' : '说说你的想法'}
      workspaceHint={isCreateSessionActive
        ? 'AI 已经整理出一版完整提示词。你可以先修改确认，再开始真正生成。'
        : '先输入一句话描述你的游戏，AI 会先扩写成一版提示词，再由你确认。'}
      introMessage="先告诉我你想做什么，我会先帮你整理出一版完整提示词。"
      helperText={isCreateSessionActive
        ? (creationSession?.currentQuestion?.prompt || creationSession?.currentQuestion?.content || '请确认或修改这版提示词。')
        : ''}
      loadingTitle="正在整理并扩写你的游戏想法"
      loadingDescription="完成后你会先看到一版可编辑提示词，确认后才会真正开始生成。"
      initialLabel="你的游戏方向"
      initialHint="先描述题材、核心玩法或你想要的体验，越自然越好。"
      draftLabel="游戏生成提示词"
      draftHint={creationSession?.status === 'ready'
        ? '这版提示词已经确认。你仍然可以继续修改并再次保存。'
        : '你可以直接修改这段提示词，也可以直接使用当前版本。'}
    />
  );

  if (isRestoringEntry) {
    return renderCreatePage(
      <CreationSessionShell
        eyebrow="恢复创作"
        title="正在回到你刚刚的创作流程"
        subtitle="系统会优先恢复进行中的任务或最近一轮会话，你不需要重新输入。"
        statusLabel="当前状态"
        statusValue="恢复中"
        sections={[
          {
            key: 'create-restoring',
            node: (
              <CreationStateCard
                eyebrow="正在同步"
                title="马上回到当前作品或进行中的任务"
                description="如果刚才已经进入生成阶段，任务中心里的记录也会自动接上。"
                loading
              />
            ),
          },
        ]}
      />,
    );
  }

  if (isGenerating) {
    const progress = generationProgress || {
      stages: PIPELINE_STAGES,
      stageIndex: 0,
      pct: 5,
      stageLabel: PIPELINE_STAGES[0]?.label || '提交需求',
      message: '正在接收你的创作需求',
    };

    return renderCreatePage(
      <CreationSessionShell
        hideHero
        sections={[
          {
            key: 'create-progress-panel',
            node: (
              <GenerationProgressPanel
                stages={progress.stages || PIPELINE_STAGES}
                currentIndex={progress.stageIndex}
                progressPct={progress.pct}
                stageLabel={progress.stageLabel}
                progressMessage={progress.message}
                modeLabel="创作流程"
                coreLabel="AI 创作"
              />
            ),
          },
          currentTask?.taskId ? {
            key: 'create-progress-actions',
            node: (
              <CreationSessionActions
                title="任务操作"
                hint="如果这轮方向不对，可以先取消，稍后再重新发起。"
                actions={[
                  {
                    key: 'cancel-create-task',
                    label: '取消任务',
                    tone: 'danger',
                    onClick: handleCancelTask,
                  },
                ]}
              />
            ),
          } : null,
          {
            key: 'create-progress-notice',
            node: (
              <CreationStateCard
                eyebrow="同步说明"
                title="任务记录会自动同步到个人中心"
                description="完成后你可以继续试玩、优化，或者直接发布到作品区。"
              />
            ),
          },
        ].filter(Boolean)}
      />,
      { withGamePlayer: true, withPaywall: true },
    );
  }

  if (creationSession?.entryMode === 'create' && creationSession?.status !== 'generating') {
    return renderCreatePage(createWorkspace, { workspaceLayout: true });
  }

  if (currentGame && !isGenerating && isCompletedGameStatus(currentGame?.status)) {
    const resultTitle = currentGame.title || gameName || '新游戏';
    const resultCoverUrl = getGameCoverUrl(currentGame);
    const resultDescription = canPlay
      ? '现在可以直接试玩，也可以继续打磨。'
      : '作品已经生成完成，订阅后即可试玩。';
    const playActionLabel = canPlay ? '试玩游戏' : '订阅后试玩';

    return renderCreatePage(
      <CreationSessionShell
        hideHero
        sections={[
          {
            key: 'create-result-cover',
            node: (
              <CreationResultCoverCard
                badge="已就绪"
                title={resultTitle}
                description={resultDescription}
                coverUrl={resultCoverUrl}
                actionLabel={playActionLabel}
                onAction={canPlay ? handlePlayGame : handleLockedPlay}
              />
            ),
          },
          {
            key: 'create-result-actions',
            node: (
              <View className="creation-session-card creation-result-next-steps">
                <Text className="creation-session-card__title">下一步</Text>
                <View className="creation-result-next-steps__actions">
                  <View
                    className="creation-result-next-steps__action creation-result-next-steps__action--primary"
                    onClick={() => openIteratePageWithAuth(currentGame, currentGame?.id)}
                  >
                    <Text className="creation-result-next-steps__action-text">继续优化</Text>
                  </View>
                  <View
                    className="creation-result-next-steps__action"
                    onClick={handleNewGame}
                  >
                    <Text className="creation-result-next-steps__action-text">再创一个</Text>
                  </View>
                </View>
              </View>
            ),
          },
        ]}
      />,
      { withGamePlayer: true, withPaywall: true },
    );
  }

  return renderCreatePage(createWorkspace, { workspaceLayout: true });
}
