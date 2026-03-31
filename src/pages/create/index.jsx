import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Input } from '@tarojs/components';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import { PipelineOrbit } from '../../components/common/PipelineOrbit';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import * as gameService from '../../services/game';
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
import {
  CreationAnswerComposer,
  CreationQuestionCard,
  CreationSessionActions,
  CreationSessionShell,
  CreationSessionScene,
  buildCreationSessionActions,
  buildCreationSessionSceneProps,
} from '../../components/creation';
import './index.scss';

const EXAMPLE_PROMPTS = [
  { emoji: '🐍', text: '做一个贪吃蛇游戏，触屏滑动控制方向，吃到食物会变长，撞墙或撞到自己游戏结束。' },
  { emoji: '🐹', text: '做一个打地鼠小游戏，九宫格随机出现地鼠，点击得分，30 秒倒计时挑战。' },
  { emoji: '🔢', text: '做一个 2048 益智游戏，上下左右滑动合并相同数字，目标达到 2048。' },
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

const GENERATION_TIER_OPTIONS = [
  { value: 'safe', label: '安全生成', description: '更稳，生成更快，适合快速出稿' },
  { value: 'standard', label: '标准生成', description: '平衡稳定性和丰富度' },
  { value: 'showcase', label: '精品生成', description: '更有层次和风格，耗时更长' },
];

const CREATION_SESSION_STATUS_LABELS = {
  collecting: '继续补充',
  ready: '可以生成',
  generating: '生成中',
  completed: '已完成',
  abandoned: '已结束',
  expired: '已过期',
  failed: '会话异常',
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
  const [orientation, setOrientation] = useState('portrait');
  const [generationTier, setGenerationTier] = useState('standard');
  const [sessionAnswer, setSessionAnswer] = useState('');
  const [isRestoringEntry, setIsRestoringEntry] = useState(false);
  const authRedirectingRef = useRef(false);
  const { windowHeight = 720 } = getSafeSystemInfo();
  const scrollViewHeight = Math.max(windowHeight - 120, 400);
  const containerClassName = `create-container${isH5 ? ' create-container--h5' : ''}${isWeapp ? ' create-container--weapp' : ''}`;

  const openTaskCenter = () => {
    openProfilePageWithTab('tasks');
  };

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
      restoreActiveCreationSession({ silentIfMissing: true }).catch(() => {});
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

  const resetLocalCreateState = () => {
    setPrompt('');
    setGameName('');
    setOrientation('portrait');
    setGenerationTier('standard');
    setSessionAnswer('');
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
      resetCreationSessionState();

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
    resetCreationSessionState,
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


  const handleSessionAnswerInput = (event) => {
    setSessionAnswer(event?.detail?.value || '');
  };

  const handleSubmitSessionAnswer = async () => {
    if (!sessionAnswer.trim()) {
      Taro.showToast({ title: '先写下这轮补充内容', icon: 'none' });
      return;
    }

    try {
      await answerCreationSessionQuestion(sessionAnswer.trim());
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: err?.message || '提交回答失败，请稍后重试', icon: 'none' });
    }
  };

  const handleSkipSessionQuestion = async () => {
    try {
      await skipCreationSessionQuestion();
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: err?.message || '跳过问题失败，请稍后重试', icon: 'none' });
    }
  };

  const handleGenerateFromSession = async () => {
    try {
      await generateFromCreationSession({
        orientation,
        generationTier,
      });
    } catch (err) {
      Taro.showToast({ title: err?.message || '生成阶段遇到问题，可稍后重试', icon: 'none' });
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || prompt.trim().length < 5) {
      Taro.showToast({ title: '请输入游戏描述', icon: 'none' });
      return;
    }

    clearError();
    try {
      await startCreationSession(prompt.trim(), gameName.trim(), {
        entryMode: 'create',
        orientation,
        generationTier,
      });
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: err?.message || '创建创作会话失败，请稍后重试', icon: 'none' });
    }
  };

  const initialCreateActions = [
    {
      key: 'start-session',
      label: creationSessionSubmitting ? 'AI 正在整理你的想法...' : '先看 AI 怎么理解',
      tone: 'primary',
      disabled: creationSessionSubmitting || !prompt.trim() || prompt.trim().length < 5,
      onClick: handleSubmit,
    },
  ];

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
    resetCreationSessionState();
    resetLocalCreateState();
  };

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
  if (
    currentGame
    && !creationSession
    && !isGenerating
    && isCompletedGameStatus(currentGame?.status)
  ) {
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

  const creationFlowStage = getCreationFlowStage ? getCreationFlowStage() : 'idle';

  if (
    creationSession?.entryMode === 'create'
    && ['collecting', 'ready', 'failed', 'expired', 'abandoned'].includes(creationFlowStage)
  ) {
    const statusValue = CREATION_SESSION_STATUS_LABELS[creationSession?.status] || '创作会话';
    const sessionActions = buildCreationSessionActions({
      submitting: creationSessionSubmitting,
      answerValue: sessionAnswer,
      generateLabel: '直接开始创作',
      onSubmit: handleSubmitSessionAnswer,
      onSkip: handleSkipSessionQuestion,
      onGenerate: handleGenerateFromSession,
      onRestart: handleNewGame,
    });

    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
        <PageScrollContainer className="create-scroll">
          <CreationSessionScene
            {...buildCreationSessionSceneProps({
              entryMode: 'create',
              session: creationSession,
              statusValue,
              answerValue: sessionAnswer,
              onAnswerChange: handleSessionAnswerInput,
              answerPlaceholder: creationSession?.currentQuestion?.placeholder,
              answerSuggestions: creationSession?.currentQuestion?.options || [],
              submitting: creationSessionSubmitting,
              actions: sessionActions,
              errorMessage: creationSessionError,
            })}
          />
          <View className="bottom-spacer" />
        </PageScrollContainer>

        <CustomTabBar activeIndex={2} />
      </View>
    );
  }

  return (
    <View className={containerClassName}>
      <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
      <PageScrollContainer className="create-scroll">
        <CreationSessionShell
          eyebrow="开始新创作"
          title="先把脑海里的想法说出来"
          subtitle="不用一开始就想得特别完整。先告诉 AI 你想做什么，它会帮你把方向慢慢整理清楚。"
          statusLabel="进行到"
          statusValue="等待你的想法"
          sections={[
            {
              key: 'create-setup',
              node: (
                <View className="creation-session-card">
                  <View className="creation-session-card__header">
                    <View>
                      <Text className="creation-session-card__title">创作偏好</Text>
                      <Text className="creation-session-card__hint">这些设置会帮助 AI 更快贴近你想要的节奏和呈现方式。</Text>
                    </View>
                  </View>
                  <View className="form-section">
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
                      <Text className="form-label">屏幕方向</Text>
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

                    <View className="form-group">
                      <Text className="form-label">生成档位</Text>
                      <View className="tier-grid">
                        {GENERATION_TIER_OPTIONS.map((option) => {
                          const isActive = generationTier === option.value;
                          return (
                            <View
                              key={option.value}
                              className={`tier-card${isActive ? ' is-active' : ''}`}
                              onClick={() => setGenerationTier(option.value)}
                            >
                              <Text className="tier-card__title">{option.label}</Text>
                              <Text className="tier-card__desc">{option.description}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                </View>
              ),
            },
            {
              key: 'create-first-prompt',
              node: (
                <>
                  <CreationQuestionCard
                    title="先说说你的灵感"
                    hint="把玩法、氛围、节奏，或者你脑海里的一个瞬间说出来都可以。AI 会先整理出一版理解，再继续追问。"
                    question={{
                      content: '你这次最想做一个什么样的游戏？',
                      description: '写得越具体，AI 越容易整理出贴近你预期的方案。',
                    }}
                  />
                  <CreationAnswerComposer
                    value={prompt}
                    onChange={(e) => setPrompt(e?.detail?.value || '')}
                    placeholder="例如：做一个像素风横版闯关游戏，主角能二段跳，节奏偏爽快，Boss 战要有阶段变化。"
                    suggestions={EXAMPLE_PROMPTS.map((item) => item.text)}
                    disabled={creationSessionSubmitting}
                  />
                  <Text className="input-count">{prompt.length}/2000</Text>

                  {error ? (
                    <View className="error-banner">
                      <Text className="error-text">{getUserFacingCreateError(terminalError?.message || error, '创建游戏')}</Text>
                      <Text className="error-dismiss" onClick={clearError}>×</Text>
                    </View>
                  ) : null}

                  {creationSessionError ? (
                    <View className="error-banner">
                      <Text className="error-text">{creationSessionError}</Text>
                      <Text className="error-dismiss" onClick={clearError}>×</Text>
                    </View>
                  ) : null}

                  <CreationSessionActions actions={initialCreateActions} />
                </>
              ),
            },
          ]}
        />

        <View className="bottom-spacer" />
      </PageScrollContainer>

      <CustomTabBar activeIndex={2} />
    </View>
  );
}
