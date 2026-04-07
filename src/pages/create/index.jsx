import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import { PipelineOrbit } from '../../components/common/PipelineOrbit';
import { PaywallPopup } from '../../components/common/PaywallPopup';
import {
  CreationAnswerComposer,
  CreationEntryErrorCard,
  CreationReferenceCard,
  CreationSessionActions,
  CreationSessionScene,
  CreationSessionShell,
  CreationStateCard,
  buildCreationSessionActions,
  buildCreationSessionSceneProps,
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

const CREATE_SESSION_STATUS_LABELS = {
  initializing: '初始化中',
  collecting: '继续补充',
  ready: '可直接生成',
  failed: '需要重开',
  expired: '会话过期',
  abandoned: '已结束',
};

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

function getCreateSessionStatusValue(status) {
  return CREATE_SESSION_STATUS_LABELS[status] || '等待你的方向';
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
    abandonCreationSession,
    restoreActiveCreationSession,
    resetCreationSessionState,
  } = useGameStore();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const openPaywall = useQuotaStore((s) => s.openPaywall);
  const [gameName, setGameName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [sessionAnswer, setSessionAnswer] = useState('');
  const [orientation, setOrientation] = useState('portrait');
  const [isRestoringEntry, setIsRestoringEntry] = useState(false);
  const authRedirectingRef = useRef(false);
  const { windowHeight = 720 } = getSafeSystemInfo();
  const scrollViewHeight = Math.max(windowHeight - 120, 400);
  const scrollContainerStyle = isH5 ? undefined : { height: `${scrollViewHeight}px` };
  const containerClassName = `create-container${isH5 ? ' create-container--h5' : ''}${isWeapp ? ' create-container--weapp' : ''}`;
  const createIdeaSuggestions = EXAMPLE_PROMPTS.map((item) => ({
    label: `${item.emoji} ${item.text.split('，')[0]}`,
    value: item.text,
  }));
  const createSessionStatusValue = getCreateSessionStatusValue(creationSession?.status);
  const entryErrorMessage = creationSessionError || terminalError?.message || error || '';

  const openTaskCenter = () => {
    openProfilePageWithTab('tasks');
  };

  const resetLocalCreateState = () => {
    setPrompt('');
    setSessionAnswer('');
    setGameName('');
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

  const handleGenerateFromSession = async () => {
    if (!creationSession?.sessionId) {
      return;
    }

    clearError();

    try {
      await generateFromCreationSession({
        orientation,
        generationTier: creationSession?.generationTier || 'standard',
      });
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '创建游戏'), icon: 'none' });
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

  const handleRestartSession = async () => {
    try {
      if (creationSession?.sessionId) {
        await abandonCreationSession(creationSession.sessionId);
      }
      resetCreationSessionState();
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '创作会话'), icon: 'none' });
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
    { withGamePlayer = false, withPaywall = false } = {},
  ) => (
    <View className={containerClassName}>
      <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
      <PageScrollContainer className="create-scroll" style={scrollContainerStyle} scrollY>
        <View className="creation-page-shell">
          {content}
          <View className="creation-page-spacer creation-page-spacer--tabbar" />
        </View>
      </PageScrollContainer>
      <CustomTabBar activeIndex={2} />
      {withGamePlayer ? <GlobalGamePlayer /> : null}
      {withPaywall ? <PaywallPopup /> : null}
    </View>
  );

  const createSessionSceneProps = creationSession?.entryMode === 'create'
    ? buildCreationSessionSceneProps({
        entryMode: 'create',
        session: creationSession,
        statusValue: createSessionStatusValue,
        answerValue: sessionAnswer,
        onAnswerChange: (e) => setSessionAnswer(e?.detail?.value || ''),
        answerPlaceholder: creationSession?.currentQuestion?.placeholder || creationSession?.currentQuestion?.prompt,
        answerSuggestions: creationSession?.currentQuestion?.options || [],
        submitting: creationSessionSubmitting,
        actions: buildCreationSessionActions({
          submitting: creationSessionSubmitting,
          answerValue: sessionAnswer,
          submitLabel: '提交补充',
          generateLabel: creationSession?.readyToGenerate ? '开始创作' : '直接生成初稿',
          restartLabel: '重新开始',
          onSubmit: handleSubmitSessionAnswer,
          onSkip: handleSkipQuestion,
          onGenerate: handleGenerateFromSession,
          onRestart: handleRestartSession,
        }),
        errorMessage: creationSessionError || (error ? getUserFacingCreateError(terminalError?.message || error, '创建游戏') : ''),
      })
    : null;

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
    const taskStatusLabel = TASK_STATUS_LABELS[currentTask?.status] || '执行中';
    const currentStageLabel = progress.stageLabel || '正在生成游戏';

    return renderCreatePage(
      <CreationSessionShell
        eyebrow="AI 创作中"
        title="AI 正在为你生成游戏"
        subtitle="系统会自动完成玩法拆解、规则编排和运行时装配，你也可以稍后去任务中心继续查看。"
        statusLabel={taskStatusLabel}
        statusValue={`${progress.pct}%`}
        sections={[
          {
            key: 'create-progress-focus',
            node: (
              <CreationStateCard
                eyebrow="当前焦点"
                title={currentStageLabel}
                description="这一步完成后会自动进入下一阶段，无需手动操作。"
              />
            ),
          },
          {
            key: 'create-progress-orbit',
            node: (
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
    && createSessionSceneProps
  ) {
    return renderCreatePage(
      <CreationSessionScene {...createSessionSceneProps} />,
    );
  }

  if (currentGame && !isGenerating && isCompletedGameStatus(currentGame?.status)) {
    const resultActions = canPlay
      ? [
          {
            key: 'play-created-game',
            label: '试玩游戏',
            tone: 'primary',
            onClick: handlePlayGame,
          },
          {
            key: 'iterate-created-game',
            label: '继续优化',
            tone: 'ghost',
            onClick: () => openIteratePageWithAuth(currentGame, currentGame?.id),
          },
          {
            key: 'create-new-game',
            label: '再创一个',
            tone: 'ghost',
            onClick: handleNewGame,
          },
        ]
      : [
          {
            key: 'unlock-created-game',
            label: '订阅后试玩',
            tone: 'primary',
            onClick: handleLockedPlay,
          },
          {
            key: 'iterate-created-game',
            label: '继续优化',
            tone: 'ghost',
            onClick: () => openIteratePageWithAuth(currentGame, currentGame?.id),
          },
          {
            key: 'create-new-game',
            label: '再创一个',
            tone: 'ghost',
            onClick: handleNewGame,
          },
        ];

    return renderCreatePage(
      <CreationSessionShell
        eyebrow="Creation Completed"
        title="创作完成"
        subtitle="这版作品已经准备好了，你可以现在试玩，也可以继续优化下一版。"
        statusLabel="当前状态"
        statusValue={canPlay ? '可试玩' : '待解锁'}
        sections={[
          {
            key: 'create-result-summary',
            node: (
              <CreationStateCard
                tone={canPlay ? 'success' : 'warning'}
                centered
                eyebrow={canPlay ? '已就绪' : '待解锁'}
                title={currentGame.title || gameName || '新游戏'}
                description={canPlay ? '现在可以直接试玩，也可以继续打磨体验细节。' : '当前作品已经生成完成，订阅后即可继续试玩与验证体验。'}
                hint={error ? getUserFacingCreateError(terminalError?.message || error, 'AI 创作') : '生成完成后，任务记录也会保留在“我的-任务”里。'}
              />
            ),
          },
          {
            key: 'create-result-reference',
            node: (
              <CreationReferenceCard
                eyebrow="生成结果"
                title={currentGame.title || gameName || '未命名作品'}
                badge={getGameOrientation(currentGame, orientation) === 'landscape' ? '横屏作品' : '竖屏作品'}
                description={currentGame.description || '这版作品已经准备好进入试玩、优化或发布。'}
                metadata={[
                  { label: '试玩权限', value: canPlay ? '可直接试玩' : '订阅后试玩' },
                  { label: '下一步', value: '继续优化、试玩验证，或重新开始一轮创作' },
                ]}
              />
            ),
          },
          {
            key: 'create-result-actions',
            node: (
              <CreationSessionActions
                title="下一步"
                hint="你可以立刻验证这版作品，也可以继续打磨下一轮。"
                actions={resultActions}
              />
            ),
          },
        ]}
      />,
      { withGamePlayer: true, withPaywall: true },
    );
  }

  return renderCreatePage(
    <CreationSessionShell
      eyebrow="AI Game Atelier"
      title="创作新游戏"
      subtitle="先把玩法方向说清楚，AI 会先整理第一版方案，再只追问最关键的细节。"
      statusLabel="创作模式"
      statusValue={orientation === 'landscape' ? '横屏' : '竖屏'}
      sections={[
        {
          key: 'create-settings',
          node: (
            <View className="creation-session-card creation-config-card">
              <View className="creation-config-grid">
                <View className="creation-config-field">
                  <Text className="creation-config-label">展示方向</Text>
                  <View className="creation-mode-toggle">
                    {ORIENTATION_OPTIONS.map((option) => {
                      const isActive = orientation === option.value;
                      return (
                        <View
                          key={option.value}
                          className={`creation-mode-toggle__option${isActive ? ' is-active' : ''}`}
                          onClick={() => setOrientation(option.value)}
                        >
                          <Text className="creation-mode-toggle__text">{option.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                <View className="creation-config-field creation-config-field--full">
                  <Text className="creation-config-label">游戏名称</Text>
                  <View className="creation-config-input-wrap">
                    <Input
                      className="creation-config-input"
                      placeholder="给你的游戏起个名字（可选）"
                      placeholderStyle="color: #55516e"
                      value={gameName}
                      onInput={(e) => setGameName(e.detail.value)}
                      maxlength={30}
                    />
                  </View>
                </View>
              </View>
            </View>
          ),
        },
        entryErrorMessage ? {
          key: 'create-entry-error',
          node: <CreationEntryErrorCard entryMode="create" error={entryErrorMessage} />,
        } : null,
        {
          key: 'create-entry-answer',
          node: (
            <CreationAnswerComposer
              value={prompt}
              onChange={(e) => setPrompt(e?.detail?.value || '')}
              placeholder="先说一句核心想法，系统会帮你拆成可生成方案..."
              suggestions={createIdeaSuggestions}
              onSuggestionSelect={setPrompt}
              disabled={creationSessionSubmitting}
              maxLength={2000}
            />
          ),
        },
        {
          key: 'create-start-actions',
          node: (
            <CreationSessionActions
              title="开始创作"
              hint="发起会话后，系统会先整理第一版方案，再进入共享的追问与生成流程。"
              actions={[
                {
                  key: 'start-create-session',
                  label: creationSessionSubmitting ? 'AI 正在整理...' : '开始创作会话',
                  tone: 'primary',
                  disabled: creationSessionSubmitting || prompt.trim().length < 5,
                  onClick: handleStartCreateSession,
                },
              ]}
            />
          ),
        },
      ].filter(Boolean)}
    />,
  );
}
