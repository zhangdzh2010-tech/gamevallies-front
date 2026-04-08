import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import { PipelineOrbit } from '../../components/common/PipelineOrbit';
import { PaywallPopup } from '../../components/common/PaywallPopup';
import {
  CreationCreateWorkspace,
  CreationResultCoverCard,
  CreationSessionActions,
  CreationSessionShell,
  CreationStateCard,
  canGenerateCreationSession,
  isCreationSessionQuestioning,
} from '../../components/creation';
import {
  getPersistedGenerationTaskSnapshot,
  isCompletedGameStatus,
  useGameStore,
  PIPELINE_STAGES,
} from '../../store/gameStore';
import useGamePlayerStore from '../../stores/gamePlayer';
import useQuotaStore from '../../stores/quotaStore';
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
import './index.scss';

const ORIENTATION_OPTIONS = [
  { value: 'portrait', label: '竖屏' },
  { value: 'landscape', label: '横屏' },
];

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
    creationSessionError,
    creationSessionSubmitting,
    startCreationSession,
    answerCreationSessionQuestion,
    skipCreationSessionQuestion,
    generateFromCreationSession,
    restoreActiveCreationSession,
    resetCreationSessionState,
  } = useGameStore();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const openPaywall = useQuotaStore((s) => s.openPaywall);
  const [gameName, setGameName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [sessionAnswer, setSessionAnswer] = useState('');
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [orientation, setOrientation] = useState('portrait');
  const [isRestoringEntry, setIsRestoringEntry] = useState(false);
  const authRedirectingRef = useRef(false);
  const { windowHeight = 720 } = getSafeSystemInfo();
  const scrollViewHeight = Math.max(windowHeight - 120, 400);
  const scrollContainerStyle = isH5 ? undefined : { height: `${scrollViewHeight}px` };
  const containerClassName = `create-container${isH5 ? ' create-container--h5' : ''}${isWeapp ? ' create-container--weapp' : ''}`;
  const entryErrorMessage = creationSessionError || terminalError?.message || error || '';

  const openTaskCenter = () => {
    openProfilePageWithTab('tasks');
  };

  const resetLocalCreateState = () => {
    setPrompt('');
    setSessionAnswer('');
    setGameName('');
    setIsPreviewExpanded(false);
    setOrientation('portrait');
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

    if (creationSession.prompt && !prompt) {
      setPrompt(creationSession.prompt);
    }
  }, [
    creationSession?.entryMode,
    creationSession?.orientation,
    creationSession?.prompt,
    creationSession?.title,
    creationSession?.titleDraft,
    prompt,
  ]);

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
            Taro.showToast({ title: '恢复创作任务失败，请重试', icon: 'none' });
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
          Taro.showToast({ title: err?.message || '取消失败，请重试', icon: 'none' });
        }
      },
    });
  };

  const handleStartCreateSession = async () => {
    if (!prompt.trim() || prompt.trim().length < 5) {
      Taro.showToast({ title: '请输入更完整的游戏描述', icon: 'none' });
      return;
    }

    clearError();

    try {
      await startCreationSession(
        prompt.trim(),
        gameName.trim(),
        {
          entryMode: 'create',
          orientation,
          generationTier: 'standard',
        }
      );
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '创作会话'), icon: 'none' });
    }
  };

  const handleSubmitSessionAnswer = async () => {
    if (!sessionAnswer.trim()) {
      Taro.showToast({ title: '请先回答当前问题', icon: 'none' });
      return;
    }

    clearError();

    try {
      await answerCreationSessionQuestion(sessionAnswer.trim());
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '创作会话'), icon: 'none' });
    }
  };

  const handleSkipQuestion = async () => {
    try {
      await skipCreationSessionQuestion();
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '创作会话'), icon: 'none' });
    }
  };

  const canSendEntryPrompt = prompt.trim().length >= 5;
  const isCreateSessionActive = creationSession?.entryMode === 'create' && creationSession?.status !== 'generating';
  const canSkipCreateQuestion = isCreateSessionActive
    && isCreationSessionQuestioning(creationSession?.status)
    && Boolean(creationSession?.currentQuestion);
  const canGenerateCreateSession = isCreateSessionActive
    && canGenerateCreationSession(creationSession?.status);
  const activeCreateInputValue = isCreateSessionActive ? sessionAnswer : prompt;
  const activeCreateInputPlaceholder = isCreateSessionActive
    ? (creationSession?.currentQuestion?.placeholder || creationSession?.currentQuestion?.prompt || '继续补充你的想法...')
    : '继续补充你的想法...';

  const ensureCreateConversation = async () => {
    if (isCreateSessionActive && creationSession?.sessionId) {
      return creationSession;
    }

    if (!canSendEntryPrompt) {
      Taro.showToast({ title: '请先把想法说完整一点', icon: 'none' });
      return null;
    }

    const nextSession = await startCreationSession(
      prompt.trim(),
      gameName.trim(),
      {
        entryMode: 'create',
        orientation,
        generationTier: 'standard',
      },
    );

    setSessionAnswer('');
    return nextSession;
  };

  const handleCreateWorkspaceSend = async () => {
    if (isCreateSessionActive) {
      await handleSubmitSessionAnswer();
      return;
    }

    setIsPreviewExpanded(false);
    await handleStartCreateSession();
  };

  const handleCreateWorkspacePreview = async () => {
    if (isCreateSessionActive) {
      setIsPreviewExpanded((currentValue) => !currentValue);
      return;
    }

    try {
      const nextSession = await ensureCreateConversation();
      if (nextSession) {
        setIsPreviewExpanded(true);
      }
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '创作会话'), icon: 'none' });
    }
  };

  const handleCreateWorkspaceGenerate = async () => {
    if (isCreateSessionActive) {
      clearError();

      try {
        await generateFromCreationSession({
          orientation,
          generationTier: creationSession?.generationTier || 'standard',
          ...(gameName.trim() ? { title: gameName.trim() } : {}),
        });
        setSessionAnswer('');
        setIsPreviewExpanded(false);
      } catch (err) {
        Taro.showToast({ title: getUserFacingCreateError(err?.message, '创建游戏'), icon: 'none' });
      }
      return;
    }

    try {
      const nextSession = await ensureCreateConversation();
      if (!nextSession?.sessionId) {
        return;
      }

      clearError();

      await generateFromCreationSession(nextSession.sessionId, {
        orientation,
        generationTier: nextSession?.generationTier || 'standard',
        ...(gameName.trim() ? { title: gameName.trim() } : {}),
      });
      setIsPreviewExpanded(false);
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '创建游戏'), icon: 'none' });
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
    setIsPreviewExpanded(false);
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
  const createWorkspace = (
    <CreationCreateWorkspace
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
          setSessionAnswer(nextValue);
          return;
        }
        setPrompt(nextValue);
      }}
      inputPlaceholder={activeCreateInputPlaceholder}
      onSend={handleCreateWorkspaceSend}
      onSkip={handleSkipQuestion}
      onGenerate={handleCreateWorkspaceGenerate}
      onPreview={handleCreateWorkspacePreview}
      sendDisabled={creationSessionSubmitting || (isCreateSessionActive ? !sessionAnswer.trim() : !canSendEntryPrompt)}
      skipDisabled={creationSessionSubmitting || !canSkipCreateQuestion}
      generateDisabled={creationSessionSubmitting || !(isCreateSessionActive ? canGenerateCreateSession : canSendEntryPrompt)}
      previewDisabled={creationSessionSubmitting || !(isCreateSessionActive || canSendEntryPrompt)}
      previewExpanded={isPreviewExpanded}
      previewLabel={isPreviewExpanded ? '收起预览' : '预览'}
      errorMessage={entryErrorMessage}
      isSubmitting={creationSessionSubmitting}
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
    const progress = generationProgress || { stageIndex: 0, pct: 5, stageLabel: '准备中...' };

    return renderCreatePage(
      <CreationSessionShell
        hideHero
        sections={[
          {
            key: 'create-progress-orbit',
            node: (
              <PipelineOrbit
                stages={PIPELINE_STAGES}
                currentIndex={progress.stageIndex}
                progressPct={progress.pct}
                title="生成进度"
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

  if (
    creationSession?.entryMode === 'create'
    && creationSession?.status !== 'generating'
  ) {
    return renderCreatePage(
      createWorkspace,
      { workspaceLayout: true },
    );
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
