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
import {
  LOGIN_PAGE_URL,
  buildForkPageUrl,
  isLoggedIn,
  openIteratePageWithAuth,
  setPostLoginRedirect,
} from '../../../utils/authNavigation';
import { Storage } from '../../../utils/storage';
import { isH5Runtime } from '../../../utils/runtime';
import { getSafeSystemInfo } from '../../../utils/systemInfo';
import {
  CreationSessionScene,
  buildCreationSessionActions,
  buildCreationSessionSceneProps,
} from '../../../components/creation';
import './index.scss';

function formatNumber(num) {
  const n = Number(num) || 0;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function getAuthorName(game) {
  return game?.author?.displayName
    || game?.author?.nickname
    || game?.author?.username
    || game?.authorName
    || game?.creatorName
    || (typeof game?.author === 'string' ? game.author : '')
    || '创作者';
}

const TASK_STATUS_LABELS = {
  queued: '排队中',
  submitted: '执行中',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  canceled: '已取消',
  timed_out: '超时',
};

export default function GameForkPage() {
  const route = useRoute();
  const sourceGameId = route?.params?.sourceGameId || '';
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const isH5 = isH5Runtime();
  const {
    cancelCurrentTask,
    currentGame,
    currentTask,
    isGenerating,
    generationProgress,
    creationSession,
    creationSessionError,
    creationSessionSubmitting,
    restoreActiveCreationSession,
    startCreationSession,
    answerCreationSessionQuestion,
    skipCreationSessionQuestion,
    generateFromCreationSession,
    resetCreationSessionState,
  } = useGameStore();
  const [sourceGame, setSourceGame] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [forkAnswer, setForkAnswer] = useState('');
  const [pageError, setPageError] = useState('');
  const forkSessionBootstrappedSourceIdRef = useRef('');
  const currentUser = Storage.getUser() || {};
  const currentUserId = currentUser?.id || '';
  const { windowHeight = 720 } = getSafeSystemInfo();
  const scrollViewHeight = Math.max(windowHeight - 120, 420);
  const scrollContainerStyle = isH5 ? undefined : { height: `${scrollViewHeight}px` };
  const containerClassName = `fork-page${isWeapp ? ' fork-page--weapp' : ''}${isH5 ? ' fork-page--h5' : ''}`;

  useEffect(() => {
    if (isLoggedIn()) {
      return;
    }

    const targetUrl = buildForkPageUrl(sourceGameId);
    setPostLoginRedirect(targetUrl);
    Taro.navigateTo({ url: LOGIN_PAGE_URL }).catch(() => {});
  }, [sourceGameId]);

  useEffect(() => {
    if (!sourceGameId) {
      setIsLoading(false);
      setPageError('缺少作品信息');
      return;
    }

    let cancelled = false;

    const loadGame = async () => {
      setIsLoading(true);
      setPageError('');

      try {
        const game = await gameService.getGame(sourceGameId);
        if (!cancelled) {
          setSourceGame(game);
        }
      } catch (_error) {
        if (!cancelled) {
          setPageError('加载作品失败，请返回详情页重试');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadGame();

    return () => {
      cancelled = true;
    };
  }, [sourceGameId]);

  const isOwnGame = Boolean(currentUserId && String(sourceGame?.author?.id || sourceGame?.authorId || '') === String(currentUserId));
  const canForkGame = Boolean(sourceGame && !isOwnGame && sourceGame.allowFork !== false);
  const authorName = getAuthorName(sourceGame);

  const statItems = useMemo(() => ([
    { label: '试玩', value: formatNumber(sourceGame?.plays) },
    { label: '点赞', value: formatNumber(sourceGame?.likes) },
    { label: '复刻', value: formatNumber(sourceGame?.forks) },
  ]), [sourceGame?.forks, sourceGame?.likes, sourceGame?.plays]);
  const isCurrentForkSession = Boolean(
    creationSession
    && creationSession.entryMode === 'fork'
    && String(creationSession.sourceGameId || '') === String(sourceGameId)
  );
  const isCurrentForkGenerating = Boolean(
    isGenerating
    && isCurrentForkSession
    && (creationSession?.status === 'generating' || currentTask?.taskId)
  );
  const isCurrentForkCompleted = Boolean(
    isCurrentForkSession
    && currentGame
    && String(currentGame?.id || '') !== String(sourceGameId)
    && String(creationSession?.gameId || currentGame?.id || '') === String(currentGame?.id || '')
    && isCompletedGameStatus(currentGame?.status)
  );

  useEffect(() => {
    if (!sourceGameId || !sourceGame || isLoading || !canForkGame) {
      return;
    }

    if (isCurrentForkSession) {
      forkSessionBootstrappedSourceIdRef.current = sourceGameId;
      return;
    }

    if (forkSessionBootstrappedSourceIdRef.current === sourceGameId) {
      return;
    }

    forkSessionBootstrappedSourceIdRef.current = sourceGameId;

    restoreActiveCreationSession({ silentIfMissing: true })
      .then((restoredSession) => {
        const restoredMatches = restoredSession
          && restoredSession.entryMode === 'fork'
          && String(restoredSession.sourceGameId || '') === String(sourceGameId);

        if (restoredMatches) {
          return restoredSession;
        }

        return startCreationSession(
          sourceGame?.description || `基于《${sourceGame?.title || '当前作品'}》继续创作`,
          sourceGame?.title || '',
          {
            entryMode: 'fork',
            sourceGameId,
            orientation: sourceGame?.orientation || 'portrait',
            generationTier: 'standard',
          }
        );
      })
      .catch((error) => {
        setPageError(error?.message || '初始化复刻会话失败，请重试');
        forkSessionBootstrappedSourceIdRef.current = '';
      });
  }, [
    canForkGame,
    isCurrentForkSession,
    isLoading,
    restoreActiveCreationSession,
    sourceGame?.description,
    sourceGame?.orientation,
    sourceGame?.title,
    sourceGame,
    sourceGameId,
    startCreationSession,
  ]);

  const handleSubmitForkAnswer = async () => {
    if (!forkAnswer.trim()) {
      Taro.showToast({ title: '请先补充你想修改的方向', icon: 'none' });
      return;
    }

    try {
      await answerCreationSessionQuestion(forkAnswer.trim());
      setForkAnswer('');
    } catch (error) {
      Taro.showToast({ title: error?.message || '提交回答失败，请重试', icon: 'none' });
    }
  };

  const handleSkipForkQuestion = async () => {
    try {
      await skipCreationSessionQuestion();
      setForkAnswer('');
    } catch (error) {
      Taro.showToast({ title: error?.message || '跳过问题失败，请重试', icon: 'none' });
    }
  };

  const handleGenerateFork = async () => {
    try {
      await generateFromCreationSession({
        orientation: sourceGame?.orientation || 'portrait',
        generationTier: creationSession?.generationTier || 'standard',
      });
    } catch (error) {
      Taro.showToast({ title: error?.message || '生成阶段遇到问题，可稍后重试', icon: 'none' });
    }
  };

  const handleRestartForkSession = async () => {
    if (!sourceGameId) {
      return;
    }

    resetCreationSessionState();
    forkSessionBootstrappedSourceIdRef.current = '';
    setForkAnswer('');

    try {
      await startCreationSession(
        sourceGame?.description || `基于《${sourceGame?.title || '当前作品'}》继续创作`,
        sourceGame?.title || '',
        {
          entryMode: 'fork',
          sourceGameId,
          orientation: sourceGame?.orientation || 'portrait',
          generationTier: 'standard',
        }
      );
    } catch (error) {
      Taro.showToast({ title: error?.message || '重新开始复刻会话失败，请重试', icon: 'none' });
    }
  };

  const handleCancelTask = () => {
    if (!currentTask?.taskId) {
      return;
    }

    Taro.showModal({
      title: '取消复刻任务',
      content: '确认取消当前复刻任务吗？已经生成的结果不会继续更新。',
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

  if (isLoading) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack />
        <View className="fork-hero">
          <Text className="fork-hero__title">正在准备复刻页面</Text>
          <Text className="fork-hero__subtitle">马上展示这款作品的当前信息</Text>
        </View>
        <View className="fork-loading-card">
          <View className="fork-loading-card__spinner" />
          <Text className="fork-loading-card__text">正在加载作品详情...</Text>
        </View>
      </View>
    );
  }

  if (!sourceGame) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack />
        <View className="fork-hero">
          <Text className="fork-hero__title">暂时无法复刻这款作品</Text>
          <Text className="fork-hero__subtitle">{pageError || '请返回详情页后重试'}</Text>
        </View>
        <View className="fork-empty-card">
          <Text className="fork-empty-card__icon">⎇</Text>
          <Text className="fork-empty-card__title">没有拿到作品数据</Text>
          <Text className="fork-empty-card__text">请返回作品详情页后重试。</Text>
        </View>
      </View>
    );
  }

  if (isCurrentForkGenerating) {
    const progress = generationProgress || { stageIndex: 0, pct: 5, stageLabel: '准备中...' };
    const taskStatusLabel = TASK_STATUS_LABELS[currentTask?.status] || '执行中';
    const currentStageLabel = progress.stageLabel || '正在生成复刻作品';

    return (
      <View className={containerClassName}>
        <AppTopBar showBack />
        <View className="fork-hero">
          <Text className="fork-hero__title">AI 正在生成复刻作品</Text>
          <Text className="fork-hero__subtitle">系统正在根据你的调整方向生成新版本，请稍候</Text>
        </View>

        <PageScrollContainer className="fork-scroll" style={scrollContainerStyle} scrollY>
          <View className="fork-panel">
            <PipelineOrbit
              stages={PIPELINE_STAGES}
              currentIndex={progress.stageIndex}
              progressPct={progress.pct}
              title="复刻进度"
              stageLabel={currentStageLabel}
              statusLabel={taskStatusLabel}
              modeLabel="复刻流程"
              coreLabel="AI 复刻"
            />

            {currentTask?.taskId ? (
              <View className="fork-actions">
                <View className="fork-submit-btn" onClick={handleCancelTask}>
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

  if (isCurrentForkCompleted) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack />
        <View className="fork-hero">
          <Text className="fork-hero__title">复刻完成</Text>
          <Text className="fork-hero__subtitle">新的创作版本已经准备好了，你可以继续优化它。</Text>
        </View>

        <PageScrollContainer className="fork-scroll" style={scrollContainerStyle} scrollY>
          <View className="fork-panel">
            <View className="fork-source-card">
              <View className="fork-source-card__preview">
                <Text className="fork-source-card__emoji">{currentGame?.emoji || '🎮'}</Text>
              </View>
              <View className="fork-source-card__copy">
                <Text className="fork-source-card__title">{currentGame?.title || '未命名游戏'}</Text>
                <Text className="fork-source-card__meta">已加入我的创作</Text>
                {currentGame?.description ? (
                  <Text className="fork-source-card__desc">{currentGame.description}</Text>
                ) : null}
              </View>
            </View>

            <View className="fork-actions">
              <View className="fork-submit-btn" onClick={() => openIteratePageWithAuth(currentGame, currentGame?.id)}>
                <Text>继续优化这版作品</Text>
              </View>
            </View>
          </View>
        </PageScrollContainer>

        <GlobalGamePlayer />
        <PaywallPopup />
      </View>
    );
  }

  return (
    <View className={containerClassName}>
      <AppTopBar showBack />
      <View className="fork-hero">
        <Text className="fork-hero__title">复刻这款游戏</Text>
        <Text className="fork-hero__subtitle">先确认复刻方案，再决定继续补充还是直接生成新的创作版本</Text>
      </View>

      <PageScrollContainer className="fork-scroll" style={scrollContainerStyle} scrollY>
        <View className="fork-panel">
          <View className="fork-source-card">
            <View className="fork-source-card__preview">
              <Text className="fork-source-card__emoji">{sourceGame.emoji || '🎮'}</Text>
            </View>
            <View className="fork-source-card__copy">
              <Text className="fork-source-card__title">{sourceGame.title || '未命名游戏'}</Text>
              <Text className="fork-source-card__meta">{authorName}</Text>
              {sourceGame.description ? (
                <Text className="fork-source-card__desc">{sourceGame.description}</Text>
              ) : null}
            </View>
          </View>

          <View className="fork-stat-grid">
            {statItems.map((item) => (
              <View key={item.label} className="fork-stat-item">
                <Text className="fork-stat-item__value">{item.value}</Text>
                <Text className="fork-stat-item__label">{item.label}</Text>
              </View>
            ))}
          </View>

          <View className="fork-guide-card">
            <Text className="fork-guide-card__title">复刻后会发生什么？</Text>
            <Text className="fork-guide-card__text">1. 先基于原作品生成一份复刻方案草案</Text>
            <Text className="fork-guide-card__text">2. 系统只追问最关键的差异化问题</Text>
            <Text className="fork-guide-card__text">3. 你确认后会直接生成新的创作版本</Text>
          </View>

          {!canForkGame ? (
            <View className="fork-warning-card">
              <Text className="fork-warning-card__text">
                {isOwnGame ? '这是你自己的作品，直接去优化即可。' : '作者未开放复刻权限，当前不能复刻这款作品。'}
              </Text>
            </View>
          ) : null}

          {isCurrentForkSession ? (
            <CreationSessionScene
              {...buildCreationSessionSceneProps({
                entryMode: 'fork',
                session: creationSession,
                answerValue: forkAnswer,
                onAnswerChange: (e) => setForkAnswer(e?.detail?.value || ''),
                answerPlaceholder: creationSession?.currentQuestion?.placeholder,
                answerSuggestions: creationSession?.currentQuestion?.options || [],
                submitting: creationSessionSubmitting,
                actions: buildCreationSessionActions({
                  submitting: creationSessionSubmitting,
                  answerValue: forkAnswer,
                  generateLabel: '直接开始复刻',
                  onSubmit: handleSubmitForkAnswer,
                  onSkip: handleSkipForkQuestion,
                  onGenerate: handleGenerateFork,
                  onRestart: handleRestartForkSession,
                }),
                errorMessage: creationSessionError,
              })}
            />
          ) : (
            <>
              {!creationSession && creationSessionError ? (
                <View className="fork-warning-card">
                  <Text className="fork-warning-card__text">{creationSessionError}</Text>
                </View>
              ) : null}
              {canForkGame ? (
                <View className="fork-warning-card">
                  <Text className="fork-warning-card__text">
                    {creationSessionSubmitting
                      ? '正在为这款作品建立动态复刻会话...'
                      : '正在准备动态复刻会话，请稍候。'}
                  </Text>
                </View>
              ) : null}
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
