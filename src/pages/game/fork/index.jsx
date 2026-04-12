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
  CreationCreateWorkspace,
  CreationReferenceCard,
  CreationResumeScene,
  CreationSessionActions,
  CreationSessionShell,
  CreationStateCard,
  canGenerateCreationSession,
  isCreationSessionQuestioning,
} from '../../../components/creation';
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
import { isH5Runtime } from '../../../utils/runtime';
import { Storage } from '../../../utils/storage';
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

function getUserFacingForkError(rawError) {
  const source = typeof rawError === 'string' ? rawError.trim() : '';

  if (!source) {
    return '';
  }

  if (/已取消|canceled|cancelled/i.test(source)) {
    return '复刻任务已取消';
  }

  if (/超时|timeout|timed out/i.test(source)) {
    return '复刻阶段处理超时，请稍后重试';
  }

  return source;
}

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
    error,
    terminalError,
    creationSession,
    creationSessionError,
    creationSessionSubmitting,
    creationSessionStreamingReply,
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
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
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
          setPageError('加载作品失败，请返回详情页后重试');
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
  const isForkSessionActive = isCurrentForkSession && creationSession?.status !== 'generating';
  const canStartForkSession = Boolean(forkAnswer.trim());
  const canSkipForkQuestion = isForkSessionActive
    && isCreationSessionQuestioning(creationSession?.status)
    && Boolean(creationSession?.currentQuestion)
    && creationSession?.currentQuestion?.skippable !== false;
  const canGenerateForkSession = isForkSessionActive
    && canGenerateCreationSession(creationSession?.status);

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

  const activeForkInputPlaceholder = isForkSessionActive
    ? (creationSession?.currentQuestion?.placeholder || creationSession?.currentQuestion?.prompt || '继续补充你想保留和改变的部分...')
    : '继续补充你想保留和改变的部分...';
  const ensureForkConversation = async () => {
    if (isForkSessionActive && creationSession?.sessionId) {
      return creationSession;
    }

    if (!canStartForkSession) {
      Taro.showToast({ title: '请先说说你想保留和改变的部分', icon: 'none' });
      return null;
    }

    const nextSession = await startCreationSession(
      forkAnswer.trim(),
      sourceGame?.title || '',
      {
        entryMode: 'fork',
        sourceGameId,
        orientation: sourceGame?.orientation || 'portrait',
        generationTier: 'standard',
      },
    );

    forkSessionBootstrappedSourceIdRef.current = sourceGameId;
    setResumeCandidate(null);
    setForkAnswer('');
    return nextSession;
  };
  const handleForkWorkspaceSend = async () => {
    if (isForkSessionActive) {
      await handleSubmitForkAnswer();
      return;
    }

    setIsPreviewExpanded(false);
    await handleStartForkSession();
  };
  const handleForkWorkspacePreview = async () => {
    if (isForkSessionActive) {
      setIsPreviewExpanded((currentValue) => !currentValue);
      return;
    }

    try {
      const nextSession = await ensureForkConversation();
      if (nextSession) {
        setIsPreviewExpanded(true);
      }
    } catch (error) {
      Taro.showToast({ title: error?.message || '预览新版本方案失败，请重试', icon: 'none' });
    }
  };
  const handleForkWorkspaceGenerate = async () => {
    if (isForkSessionActive) {
      await handleGenerateFork();
      setIsPreviewExpanded(false);
      return;
    }

    try {
      const nextSession = await ensureForkConversation();
      if (!nextSession?.sessionId) {
        return;
      }

      await generateFromCreationSession(nextSession.sessionId, {
        orientation: sourceGame?.orientation || 'portrait',
        generationTier: nextSession?.generationTier || 'standard',
      });
      setIsPreviewExpanded(false);
    } catch (error) {
      Taro.showToast({ title: error?.message || '生成阶段遇到问题，可稍后重试', icon: 'none' });
    }
  };

  const renderForkPage = (content, { workspaceLayout = false } = {}) => (
    <View className={containerClassName}>
      <AppTopBar showBack />
      <PageScrollContainer
        className={`fork-scroll${workspaceLayout ? ' fork-scroll--workspace' : ''}`}
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

  if (isLoading) {
    return renderForkPage(
      <CreationSessionShell
        eyebrow="加载复刻上下文"
        title="正在准备复刻页面"
        subtitle="马上展示这款作品的当前信息。"
        statusLabel="当前状态"
        statusValue="准备中"
        sections={[
          {
            key: 'fork-loading',
            node: (
              <CreationStateCard
                eyebrow="稍等一下"
                title="正在加载作品详情"
                description="系统会先确认原作品信息、作者权限和可复刻状态。"
                loading
              />
            ),
          },
        ]}
      />,
    );
  }

  if (!sourceGame) {
    return renderForkPage(
      <CreationSessionShell
        eyebrow="暂时无法继续"
        title="暂时无法复刻这款作品"
        subtitle="请返回详情页后重新进入，或稍后再试。"
        statusLabel="当前状态"
        statusValue="加载失败"
        sections={[
          {
            key: 'fork-missing-source',
            node: (
              <CreationStateCard
                tone="danger"
                eyebrow="原作缺失"
                title="没有拿到作品数据"
                description={pageError || '请返回作品详情页后重试。'}
              />
            ),
          },
        ]}
      />,
    );
  }

  if (isCurrentForkGenerating) {
    const progress = generationProgress || { stageIndex: 0, pct: 5, stageLabel: '准备中...' };
    const taskStatusLabel = TASK_STATUS_LABELS[currentTask?.status] || '执行中';
    const currentStageLabel = progress.stageLabel || '正在生成复刻作品';

    return renderForkPage(
      <CreationSessionShell
        hideHero
        sections={[
          {
            key: 'fork-progress-orbit',
            node: (
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
            ),
          },
          currentTask?.taskId ? {
            key: 'fork-progress-actions',
            node: (
              <CreationSessionActions
                title="任务操作"
                hint="如果这轮方向不对，可以先取消任务，再重新发起新的复刻会话。"
                actions={[
                  {
                    key: 'cancel-fork-task',
                    label: '取消任务',
                    tone: 'danger',
                    onClick: handleCancelTask,
                  },
                ]}
              />
            ),
          } : null,
          {
            key: 'fork-progress-notice',
            node: (
              <CreationStateCard
                eyebrow="同步说明"
                title="新的版本生成后会自动进入你的创作链路"
                description="完成后你可以继续优化这版新作品，或者回到详情页查看结果。"
              />
            ),
          },
        ].filter(Boolean)}
      />,
    );
  }

  if (isCurrentForkCompleted) {
    return renderForkPage(
      <CreationSessionShell
        hideHero
        sections={[
          {
            key: 'fork-complete-summary',
            node: (
              <CreationStateCard
                tone="success"
                centered
                eyebrow="已就绪"
                title={currentGame?.title || '新版本作品'}
                description="现在可以继续打磨、验证玩法，或进入详情页查看。"
              />
            ),
          },
          {
            key: 'fork-complete-reference',
            node: (
              <CreationReferenceCard
                eyebrow="新版本"
                title={currentGame?.title || '未命名作品'}
                badge="已加入你的创作链路"
                description={currentGame?.description || '新的版本已经生成完成。'}
                metadata={[
                  { label: '下一步', value: '继续优化这版作品，或回到详情页查看结果' },
                ]}
              />
            ),
          },
          {
            key: 'fork-complete-actions',
            node: (
              <CreationSessionActions
                title="下一步"
                hint="你可以继续把这版作品迭代下去。"
                actions={[
                  {
                    key: 'continue-iterate-fork-result',
                    label: '继续优化这版作品',
                    tone: 'primary',
                    onClick: () => openIteratePageWithAuth(currentGame, currentGame?.id),
                  },
                ]}
              />
            ),
          },
        ]}
      />,
    );
  }

  if (resumeCandidate?.entryMode === 'fork' && !creationSession) {
    return renderForkPage(
      <CreationResumeScene
        entryMode="fork"
        session={resumeCandidate}
        subjectTitle={resumeCandidate?.title || sourceGame?.title || '原作品'}
        submitting={resumeDecisionSubmitting}
        onContinue={handleContinueForkSession}
        onRestart={handleStartFreshForkSession}
      />,
    );
  }

  const sourceReferenceCard = (
    <CreationReferenceCard
      eyebrow="原作品参考"
      title={sourceGame?.title || '未命名游戏'}
      badge={authorName}
      description={sourceGame?.description || '你可以基于这版作品做出全新的方向。'}
      metadata={[
        { label: '题材归属', value: isOwnGame ? '这是你的作品' : '来自社区作品' },
        { label: '复刻权限', value: canForkGame ? '允许复刻' : '当前不可复刻' },
      ]}
      metrics={statItems}
    />
  );
  const forkWorkspace = (
    <CreationCreateWorkspace
      showSettings={false}
      topContent={sourceReferenceCard}
      session={isForkSessionActive ? creationSession : null}
      streamingMessage={isForkSessionActive ? creationSessionStreamingReply : null}
      inputValue={forkAnswer}
      onInputChange={(e) => setForkAnswer(e?.detail?.value || '')}
      inputPlaceholder={activeForkInputPlaceholder}
      onSend={handleForkWorkspaceSend}
      onSkip={handleSkipForkQuestion}
      onGenerate={handleForkWorkspaceGenerate}
      onPreview={handleForkWorkspacePreview}
      sendDisabled={creationSessionSubmitting || !(isForkSessionActive ? forkAnswer.trim() : canStartForkSession)}
      skipDisabled={creationSessionSubmitting || !canSkipForkQuestion}
      generateDisabled={creationSessionSubmitting || !(isForkSessionActive ? canGenerateForkSession : canStartForkSession)}
      previewDisabled={creationSessionSubmitting || !(isForkSessionActive || canStartForkSession)}
      previewExpanded={isPreviewExpanded}
      previewLabel={isPreviewExpanded ? '收起预览' : '预览'}
      generateLabel="直接开始复刻"
      errorMessage={getUserFacingForkError(
        (creationSession?.entryMode === 'fork'
          ? (creationSessionError || terminalError?.message || error || '')
          : '')
        || pageError
        || ''
      )}
      isSubmitting={creationSessionSubmitting}
      threadTitle="说说这次想怎么改"
      threadHint="像聊天一样往下说，AI 会继续追问或直接整理这版新版本方案。"
      introMessage="先告诉我你想保留什么、改变什么，我会帮你整理新版本方向。"
    />
  );

  if (!canForkGame && !isCurrentForkSession) {
    return renderForkPage(
      <>
        <CreationSessionShell
          eyebrow="当前不可复刻"
          title={isOwnGame ? '这是你自己的作品' : '作者暂未开放复刻'}
          subtitle={isOwnGame ? '对自己的作品直接走优化链路会更合适。' : '这款作品目前不能基于原作生成新版本。'}
          statusLabel="当前状态"
          statusValue="不可开始"
          sections={[
            {
              key: 'fork-blocked',
              node: (
                <CreationStateCard
                  tone="danger"
                  eyebrow="无法发起"
                  title={isOwnGame ? '请直接去优化你的作品' : '当前没有复刻权限'}
                  description={isOwnGame ? '你已经拥有这款作品，直接优化会更顺手，也能保留完整的创作链路。' : pageError || '如需开放复刻，需要原作者允许该作品被复刻。'}
                />
              ),
            },
            isOwnGame ? {
              key: 'fork-own-game-actions',
              node: (
                <CreationSessionActions
                  title="下一步"
                  hint="直接去优化这款作品，会更符合你的创作链路。"
                  actions={[
                    {
                      key: 'go-iterate-own-game',
                      label: '去优化这款作品',
                      tone: 'primary',
                      onClick: () => openIteratePageWithAuth(sourceGame, sourceGame?.id),
                    },
                  ]}
                />
              ),
            } : null,
          ].filter(Boolean)}
        />
        {sourceReferenceCard}
      </>,
    );
  }

  return renderForkPage(forkWorkspace, { workspaceLayout: true });
}
