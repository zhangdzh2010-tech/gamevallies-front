import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Textarea } from '@tarojs/components';
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
  CreationEntryErrorCard,
  CreationResumeScene,
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
    refreshCreationSession,
    startCreationSession,
    answerCreationSessionQuestion,
    skipCreationSessionQuestion,
    generateFromCreationSession,
    abandonCreationSession,
    resetCreationSessionState,
  } = useGameStore();
  const [sourceGame, setSourceGame] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [forkAnswer, setForkAnswer] = useState('');
  const [pageError, setPageError] = useState('');
  const [resumeCandidate, setResumeCandidate] = useState(null);
  const [resumeDecisionSubmitting, setResumeDecisionSubmitting] = useState(false);
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

    gameService.getActiveCreationSession()
      .then((restoredSession) => {
        const restoredMatches = restoredSession
          && restoredSession.entryMode === 'fork'
          && String(restoredSession.sourceGameId || '') === String(sourceGameId);

        if (restoredMatches) {
          resetCreationSessionState();
          setResumeCandidate(restoredSession);
          return restoredSession;
        }

        resetCreationSessionState();
        setResumeCandidate(null);
        return null;
      })
      .catch((error) => {
        if (error?.statusCode === 404) {
          setResumeCandidate(null);
          return;
        }
        setPageError(error?.message || '初始化复刻会话失败，请重试');
        forkSessionBootstrappedSourceIdRef.current = '';
      });
  }, [
    canForkGame,
    isCurrentForkSession,
    isLoading,
    resetCreationSessionState,
    sourceGame,
    sourceGameId,
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

  const handleStartForkSession = async () => {
    if (!sourceGameId) {
      return;
    }

    if (!forkAnswer.trim()) {
      Taro.showToast({ title: '请先说说你想保留和改变的部分', icon: 'none' });
      return;
    }

    try {
      setResumeCandidate(null);
      await startCreationSession(
        forkAnswer.trim(),
        sourceGame?.title || '',
        {
          entryMode: 'fork',
          sourceGameId,
          orientation: sourceGame?.orientation || 'portrait',
          generationTier: 'standard',
        }
      );
      forkSessionBootstrappedSourceIdRef.current = sourceGameId;
      setForkAnswer('');
    } catch (error) {
      Taro.showToast({ title: error?.message || '开启新版本对话失败，请重试', icon: 'none' });
    }
  };

  const handleContinueForkSession = async () => {
    if (!resumeCandidate?.sessionId) {
      return;
    }

    setResumeDecisionSubmitting(true);
    try {
      await refreshCreationSession(resumeCandidate.sessionId);
      setResumeCandidate(null);
    } catch (error) {
      Taro.showToast({ title: error?.message || '恢复上次复刻失败，请重试', icon: 'none' });
    } finally {
      setResumeDecisionSubmitting(false);
    }
  };

  const handleStartFreshForkSession = async () => {
    if (!resumeCandidate?.sessionId) {
      setResumeCandidate(null);
      return;
    }

    setResumeDecisionSubmitting(true);
    try {
      await abandonCreationSession(resumeCandidate.sessionId);
      resetCreationSessionState();
      setResumeCandidate(null);
      forkSessionBootstrappedSourceIdRef.current = '';
    } catch (error) {
      Taro.showToast({ title: error?.message || '开始新一轮复刻失败，请重试', icon: 'none' });
    } finally {
      setResumeDecisionSubmitting(false);
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
    try {
      if (creationSession?.sessionId) {
        await abandonCreationSession(creationSession.sessionId);
      }
      resetCreationSessionState();
      forkSessionBootstrappedSourceIdRef.current = '';
      setForkAnswer('');
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
        <View className="fork-empty-card">
          <Text className="fork-empty-card__icon">⎇</Text>
          <Text className="fork-empty-card__title">{pageError || '没有拿到作品数据'}</Text>
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

  if (resumeCandidate?.entryMode === 'fork' && !creationSession) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack />
        <PageScrollContainer className="fork-scroll" style={scrollContainerStyle} scrollY>
          <View className="fork-panel">
            <CreationResumeScene
              entryMode="fork"
              session={resumeCandidate}
              subjectTitle={resumeCandidate?.title || sourceGame?.title || '原作品'}
              submitting={resumeDecisionSubmitting}
              onContinue={handleContinueForkSession}
              onRestart={handleStartFreshForkSession}
            />
          </View>
        </PageScrollContainer>
      </View>
    );
  }

  return (
    <View className={containerClassName}>
      <AppTopBar showBack />
      <PageScrollContainer className="fork-scroll" style={scrollContainerStyle} scrollY>
        <View className="fork-panel">
          <View className="fork-source-card fork-source-card--top">
            <View className="fork-source-card__preview">
              <Text className="fork-source-card__emoji">{sourceGame.emoji || '🎮'}</Text>
            </View>
            <View className="fork-source-card__copy">
              <Text className="fork-source-card__title">{sourceGame.title || '未命名游戏'}</Text>
              <Text className="fork-source-card__meta">{authorName} · {statItems.map((s) => `${s.label} ${s.value}`).join(' · ')}</Text>
            </View>
          </View>

          {!canForkGame ? (
            <View className="fork-warning-card">
              <Text className="fork-warning-card__text">
                {isOwnGame ? '这是你自己的作品，直接去优化会更合适。' : '作者暂未开放复刻权限，目前还不能基于这款作品生成新版本。'}
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
                  generateLabel: '开始复刻',
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
                <CreationEntryErrorCard entryMode="fork" error={creationSessionError} />
              ) : null}
              {canForkGame ? (
                <View className="fork-form-section">
                  <Textarea
                    aria-label="fork-initial-answer"
                    className="fork-textarea"
                    placeholder="说说你想保留什么、改变什么"
                    placeholderStyle="color: #67627d"
                    value={forkAnswer}
                    onInput={(e) => setForkAnswer(e?.detail?.value || '')}
                    maxlength={1000}
                    autoHeight
                    disabled={creationSessionSubmitting}
                  />
                  <Text className="fork-count">{forkAnswer.length}/1000</Text>
                  <View
                    className={`fork-submit-btn${creationSessionSubmitting || !forkAnswer.trim() ? ' disabled' : ''}`}
                    onClick={handleStartForkSession}
                  >
                    <Text>{creationSessionSubmitting ? '处理中...' : '开始复刻'}</Text>
                  </View>
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
