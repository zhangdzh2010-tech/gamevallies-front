import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Input, Textarea } from '@tarojs/components';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import { PipelineOrbit } from '../../components/common/PipelineOrbit';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import * as gameService from '../../services/game';
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
  CreationResumeScene,
  canGenerateCreationSession,
  getCreationSessionNotice,
  isCreationSessionQuestioning,
} from '../../components/creation';
import ChatInterface from './components/ChatInterface';
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

const GENERATION_TIER_OPTIONS = [
  { value: 'safe', label: '安全生成', description: '更稳，生成更快，适合快速出稿' },
  { value: 'standard', label: '标准生成', description: '平衡稳定性和丰富度' },
  { value: 'showcase', label: '精品生成', description: '更有层次和风格，耗时更长' },
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

  if (/aborted a request|aborterror|aborted|取消了请求|中断了请求/i.test(source)) {
    return `${fallbackStageLabel}请求被中断了，请再试一次`;
  }

  if (/network|request:fail|econn|enotfound|enetunreach|网络/i.test(source)) {
    return '当前网络不稳定，请稍后重试';
  }

  return `${fallbackStageLabel}阶段遇到问题，请稍后重试`;
}

function getFieldValue(event) {
  if (typeof event?.detail?.value === 'string') {
    return event.detail.value;
  }

  if (typeof event?.target?.value === 'string') {
    return event.target.value;
  }

  return '';
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
    refreshCreationSession,
    startCreationSession,
    answerCreationSessionQuestion,
    skipCreationSessionQuestion,
    generateFromCreationSession,
    abandonCreationSession,
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
  const [resumeCandidate, setResumeCandidate] = useState(null);
  const [resumeDecisionSubmitting, setResumeDecisionSubmitting] = useState(false);
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
    if (!isLoggedIn() || createEntryIntent || isRestoringEntry) {
      return;
    }

    if (creationSession?.entryMode === 'create') {
      return;
    }

    if (creationSession && creationSession.entryMode !== 'create') {
      resetCreationSessionState();
    }

    const persistedCreateEntryIntent = getPersistedCreateEntryIntent();
    if (persistedCreateEntryIntent) {
      setCreateEntryIntent(persistedCreateEntryIntent);
      return;
    }

    // Opening the create tab should prioritize starting a new creation round.
    // Old generation tasks stay in the task center instead of hijacking the page.
    if (isGenerating || currentTask?.taskId || currentGame) {
      resetCreateSession({ clearPersistedTask: false });
    }

    gameService.getActiveCreationSession()
      .then((session) => {
        if (session?.entryMode === 'create') {
          setResumeCandidate(session);
        } else {
          setResumeCandidate(null);
        }
      })
      .catch(() => {
        setResumeCandidate(null);
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
    setSessionAnswer(getFieldValue(event));
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
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '回答问题'), icon: 'none' });
    }
  };

  const handleSkipSessionQuestion = async () => {
    try {
      await skipCreationSessionQuestion();
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '跳过问题'), icon: 'none' });
    }
  };

  const handleGenerateFromSession = async () => {
    try {
      await generateFromCreationSession({
        orientation,
        generationTier,
      });
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '生成游戏'), icon: 'none' });
    }
  };

  const handleSubmit = async () => {
    if (!prompt.trim() || prompt.trim().length < 5) {
      Taro.showToast({ title: '先写一句游戏想法', icon: 'none' });
      return;
    }

    clearError();
    try {
      setResumeCandidate(null);
      await startCreationSession(prompt.trim(), gameName.trim(), {
        entryMode: 'create',
        orientation,
        generationTier,
      });
      setSessionAnswer('');
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '创建游戏'), icon: 'none' });
    }
  };

  const handleContinuePreviousSession = async () => {
    if (!resumeCandidate?.sessionId) {
      return;
    }

    setResumeDecisionSubmitting(true);
    try {
      await refreshCreationSession(resumeCandidate.sessionId);
      setResumeCandidate(null);
    } catch (err) {
      Taro.showToast({ title: err?.message || '恢复上次创作失败，请重试', icon: 'none' });
    } finally {
      setResumeDecisionSubmitting(false);
    }
  };

  const handleStartFreshSession = async () => {
    if (!resumeCandidate?.sessionId) {
      setResumeCandidate(null);
      return;
    }

    setResumeDecisionSubmitting(true);
    try {
      await abandonCreationSession(resumeCandidate.sessionId);
      resetCreationSessionState();
      setResumeCandidate(null);
    } catch (err) {
      Taro.showToast({ title: err?.message || '开始新的创作失败，请重试', icon: 'none' });
    } finally {
      setResumeDecisionSubmitting(false);
    }
  };

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

  const creationFlowStage = getCreationFlowStage ? getCreationFlowStage() : 'idle';
  const isCreateSessionActive = creationSession?.entryMode === 'create'
    && ['initializing', 'collecting', 'ready', 'failed', 'expired', 'abandoned'].includes(creationFlowStage);
  const sessionStatus = creationSession?.status || '';
  const allowDirectGenerate = canGenerateCreationSession(sessionStatus);
  const allowSessionReply = isCreateSessionActive
    && (isCreationSessionQuestioning(sessionStatus) || Boolean(creationSession?.currentQuestion));
  const isSessionInitializing = sessionStatus === 'initializing';
  const sessionNotice = creationSession ? getCreationSessionNotice(sessionStatus, 'create', creationSession) : '';
  const composerValue = isCreateSessionActive ? sessionAnswer : prompt;
  const composerPlaceholder = isCreateSessionActive
    ? (isSessionInitializing
      ? 'AI 正在整理第一轮问题...'
      : (creationSession?.currentQuestion?.placeholder || '继续补充你的想法'))
    : '例如：做一个像 Temple Run 那样的跑酷游戏，滑动切换路线，跳跃躲障碍。';
  const composerMinLength = isCreateSessionActive ? 1 : 5;
  const createThreadMessages = (() => {
    if (!isCreateSessionActive) {
      return [];
    }

    const messages = Array.isArray(creationSession?.messages) ? [...creationSession.messages] : [];
    const hasUserMessage = messages.some((message) => message?.role === 'user');
    const questionContent = creationSession?.currentQuestion?.content;
    const lastAssistantMessage = [...messages].reverse().find((message) => message?.role === 'assistant');

    if (!hasUserMessage && creationSession?.prompt) {
      messages.unshift({
        id: `initial-user-${creationSession?.sessionId || 'create'}`,
        role: 'user',
        content: creationSession.prompt,
      });
    }

    if (
      questionContent
      && (!lastAssistantMessage?.content || !lastAssistantMessage.content.includes(questionContent))
    ) {
      messages.push({
        id: `question-${creationSession?.currentQuestion?.key || messages.length}`,
        role: 'assistant',
        content: questionContent,
      });
    }

    if (!questionContent && sessionNotice && !isSessionInitializing) {
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage?.content || !lastMessage.content.includes(sessionNotice)) {
        messages.push({
          id: `notice-${creationSession?.sessionId || 'create'}`,
          role: 'assistant',
          content: sessionNotice,
        });
      }
    }

    return messages;
  })();

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
  if (resumeCandidate?.entryMode === 'create') {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
        <PageScrollContainer className="create-scroll">
          <CreationResumeScene
            entryMode="create"
            session={resumeCandidate}
            subjectTitle={resumeCandidate?.title || '上一轮创作'}
            submitting={resumeDecisionSubmitting}
            onContinue={handleContinuePreviousSession}
            onRestart={handleStartFreshSession}
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
      <View className="create-chat-toolbar">
        <View className="create-chat-toolbar__name">
          <Input
            className="create-chat-toolbar__name-input"
            placeholder="游戏名（可选）"
            placeholderStyle="color: #67627d"
            value={gameName}
            onInput={(e) => setGameName(getFieldValue(e))}
            onChange={(e) => setGameName(getFieldValue(e))}
            maxlength={30}
          />
        </View>
        <View className="create-chat-toolbar__orientation">
          {ORIENTATION_OPTIONS.map((option) => {
            const isActive = orientation === option.value;
            return (
              <View
                key={option.value}
                className={`create-chat-toolbar__orientation-option${isActive ? ' is-active' : ''}`}
                onClick={() => setOrientation(option.value)}
              >
                <Text className="create-chat-toolbar__orientation-text">{option.label}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <PageScrollContainer className="create-chat-scroll">
        <View className="create-chat-thread">
          <ChatInterface
            messages={createThreadMessages}
            isGenerating={creationSessionSubmitting || isSessionInitializing}
            emptyTitle="开始新创作"
            emptyHint="先发一句想法，AI 会接着问。"
          />
        </View>
      </PageScrollContainer>

      <View className="create-chat-footer">
        {(error || creationSessionError) ? (
          <View className="create-chat-footer__error">
            <Text className="create-chat-footer__error-text">
              {creationSessionError
                ? getUserFacingCreateError(creationSessionError, '创建游戏')
                : getUserFacingCreateError(terminalError?.message || error, '创建游戏')}
            </Text>
          </View>
        ) : null}

        <View className="create-chat-footer__composer">
          <Textarea
            aria-label="create-initial-answer"
            className="create-chat-footer__textarea"
            placeholder={composerPlaceholder}
            placeholderStyle="color: #67627d"
            value={composerValue}
            onInput={isCreateSessionActive ? handleSessionAnswerInput : (e) => setPrompt(getFieldValue(e))}
            onChange={isCreateSessionActive ? handleSessionAnswerInput : (e) => setPrompt(getFieldValue(e))}
            maxlength={2000}
            autoHeight
            disabled={creationSessionSubmitting || isSessionInitializing}
          />
        </View>

        <View className="create-chat-footer__meta">
          <Text className="create-chat-footer__count">{composerValue.length}/2000</Text>
          {sessionNotice && isCreateSessionActive ? (
            <Text className="create-chat-footer__hint">{sessionNotice}</Text>
          ) : null}
        </View>

        <View className="create-chat-footer__actions">
          {isCreateSessionActive && creationSession?.currentQuestion?.skippable !== false ? (
            <View
              className={`create-chat-footer__action-btn create-chat-footer__action-btn--secondary${creationSessionSubmitting || !creationSession?.currentQuestion ? ' is-disabled' : ''}`}
              onClick={creationSessionSubmitting || !creationSession?.currentQuestion ? undefined : handleSkipSessionQuestion}
            >
              <Text className="create-chat-footer__action-btn-text">确认跳过</Text>
            </View>
          ) : null}

          {isCreateSessionActive && allowDirectGenerate ? (
            <View
              className={`create-chat-footer__action-btn create-chat-footer__action-btn--ghost${creationSessionSubmitting ? ' is-disabled' : ''}`}
              onClick={creationSessionSubmitting ? undefined : handleGenerateFromSession}
            >
              <Text className="create-chat-footer__action-btn-text">生成</Text>
            </View>
          ) : null}

          <View
            className={[
              'create-chat-footer__action-btn',
              'create-chat-footer__action-btn--primary',
              (
                creationSessionSubmitting
                || composerValue.trim().length < composerMinLength
                || (isCreateSessionActive && !allowSessionReply && !allowDirectGenerate)
              ) ? 'is-disabled' : '',
            ].filter(Boolean).join(' ')}
            onClick={
              creationSessionSubmitting
              || composerValue.trim().length < composerMinLength
              || (isCreateSessionActive && !allowSessionReply && !allowDirectGenerate)
                ? undefined
                : (isCreateSessionActive
                  ? (allowSessionReply ? handleSubmitSessionAnswer : handleGenerateFromSession)
                  : handleSubmit)
            }
          >
            <Text className="create-chat-footer__action-btn-text create-chat-footer__action-btn-text--primary">
              {creationSessionSubmitting
                ? '发送中...'
                : isCreateSessionActive
                  ? (isSessionInitializing ? '整理中...' : (allowSessionReply ? '发送' : '开始生成'))
                  : '发送'}
            </Text>
          </View>
        </View>
      </View>

      <CustomTabBar activeIndex={2} />
    </View>
  );
}
