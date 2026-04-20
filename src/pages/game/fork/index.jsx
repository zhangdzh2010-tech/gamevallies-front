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
import {
  LOGIN_PAGE_URL,
  buildForkPageUrl,
  isLoggedIn,
  openIteratePageWithAuth,
  setPostLoginRedirect,
} from '../../../utils/authNavigation';
import { isH5Runtime } from '../../../utils/runtime';
import { sanitizeUserIdea } from '../../../utils/sanitizeIdea';
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
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
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

  if (/canceled|cancelled|已取消/i.test(source)) {
    return '这次复刻已取消';
  }

  if (/timeout|timed out|超时/i.test(source)) {
    return '这次复刻等了太久，请稍后再试';
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
  } = useGameStore();
  const [sourceGame, setSourceGame] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [forkInstruction, setForkInstruction] = useState('');
  const [sessionPromptDraft, setSessionPromptDraft] = useState('');
  const [pageError, setPageError] = useState('');
  const [resumeCandidate, setResumeCandidate] = useState(null);
  const [resumeDecisionSubmitting, setResumeDecisionSubmitting] = useState(false);
  const forkSessionBootstrappedSourceIdRef = useRef('');
  const promptDraftSyncKeyRef = useRef('');
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
  const canStartForkSession = Boolean(forkInstruction.trim());

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
          return;
        }

        resetCreationSessionState();
        setResumeCandidate(null);
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

  useEffect(() => {
    if (!creationSession || creationSession.entryMode !== 'fork') {
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

  const handleConfirmEditedForkPrompt = async () => {
    const nextPromptDraft = sessionPromptDraft.trim();
    if (!nextPromptDraft) {
      Taro.showToast({ title: '请先把这一版方向写完整', icon: 'none' });
      return;
    }

    try {
      await confirmEditedPrompt(nextPromptDraft);
    } catch (error) {
      Taro.showToast({ title: error?.message || '保存这版方向失败，请重试', icon: 'none' });
    }
  };

  const handleStartForkSession = async () => {
    if (!sourceGameId) {
      return;
    }

    if (!forkInstruction.trim()) {
      Taro.showToast({ title: '请先说说你想保留和改变的部分', icon: 'none' });
      return;
    }

    try {
      setResumeCandidate(null);
      await startCreationSession(
        forkInstruction.trim(),
        sourceGame?.title || '',
        {
          entryMode: 'fork',
          sourceGameId,
          orientation: sourceGame?.orientation || 'portrait',
          generationTier: 'standard',
        },
      );
      forkSessionBootstrappedSourceIdRef.current = sourceGameId;
      setForkInstruction('');
      setSessionPromptDraft('');
      promptDraftSyncKeyRef.current = '';
    } catch (error) {
      Taro.showToast({ title: error?.message || '开启新版本会话失败，请重试', icon: 'none' });
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
      setSessionPromptDraft('');
      promptDraftSyncKeyRef.current = '';
    } catch (error) {
      Taro.showToast({ title: error?.message || '开始新一轮复刻失败，请重试', icon: 'none' });
    } finally {
      setResumeDecisionSubmitting(false);
    }
  };

  const handleConfirmCurrentForkPrompt = async () => {
    try {
      await confirmCurrentPrompt();
    } catch (error) {
      Taro.showToast({ title: error?.message || '使用当前这版失败，请重试', icon: 'none' });
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

  const normalizedForkExpandedPrompt = String(creationSession?.expandedPrompt || '').trim();
  const normalizedForkPromptDraft = sessionPromptDraft.trim();
  const hasForkPromptChanges = Boolean(
    normalizedForkPromptDraft
    && normalizedForkPromptDraft !== normalizedForkExpandedPrompt
  );
  const canConfirmCurrentForkPrompt = Boolean(
    isForkSessionActive && creationSession?.status === 'collecting'
  );
  const canEditForkPrompt = Boolean(isForkSessionActive && creationSessionUiState?.canEditPrompt);
  const canGenerateForkSession = Boolean(isForkSessionActive && creationSessionUiState?.canGenerate);
  const activeForkInputPlaceholder = isForkSessionActive
    ? '在这里继续改这次复刻的方向...'
    : '继续补充你想保留和改变的部分...';

  const ensureForkSession = async () => {
    if (isForkSessionActive && creationSession?.sessionId) {
      return creationSession;
    }

    if (!canStartForkSession) {
      Taro.showToast({ title: '请先说说你想保留和改变的部分', icon: 'none' });
      return null;
    }

    const nextSession = await startCreationSession(
      forkInstruction.trim(),
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
    setForkInstruction('');
    setSessionPromptDraft('');
    promptDraftSyncKeyRef.current = '';
    return nextSession;
  };

  const handleForkWorkspacePrimaryAction = async () => {
    if (isForkSessionActive) {
      await handleConfirmEditedForkPrompt();
      return;
    }

    await handleStartForkSession();
  };

  const handleForkWorkspaceGenerate = async () => {
    try {
      const nextSession = await ensureForkSession();
      if (!nextSession?.sessionId) {
        return;
      }

      await confirmAndGenerate({
        editedPrompt: isForkSessionActive ? sessionPromptDraft : '',
        orientation: sourceGame?.orientation || 'portrait',
        generationTier: nextSession?.generationTier || 'standard',
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
      setForkInstruction('');
      setSessionPromptDraft('');
      promptDraftSyncKeyRef.current = '';
      forkSessionBootstrappedSourceIdRef.current = '';
    } catch (error) {
      Taro.showToast({ title: error?.message || '重新开始复刻会话失败', icon: 'none' });
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
        eyebrow="正在准备"
        title="正在准备复刻页面"
        subtitle="马上展示这款作品的当前信息。"
        statusLabel="当前状态"
        statusValue="正在准备"
        sections={[
          {
            key: 'fork-loading',
            node: (
              <CreationStateCard
                eyebrow="稍等一下"
                title="正在加载作品详情"
                description="我们先确认一下原作品的信息和作者是否开放了复刻。"
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
        eyebrow="没找到这款作品"
        title="没找到这款作品"
        subtitle="可能链接过期了，或者这款作品暂时下线了。"
        statusLabel="当前状态"
        statusValue="没找到"
        sections={[
          {
            key: 'fork-missing-source',
            node: (
              <CreationStateCard
                tone="danger"
                eyebrow="没找到这款作品"
                title="原作品信息没拿到"
                description={pageError || '可以回到作品列表，或者从你自己的"我的作品"里选一款继续改。'}
              />
            ),
          },
          {
            key: 'fork-missing-actions',
            node: (
              <CreationSessionActions
                title="下一步"
                actions={[
                  {
                    key: 'fork-missing-go-home',
                    label: '回到首页',
                    tone: 'primary',
                    onClick: () => Taro.switchTab({ url: '/pages/index/index' }).catch(() => Taro.redirectTo({ url: '/pages/index/index' })),
                  },
                  {
                    key: 'fork-missing-go-profile',
                    label: '去我的作品',
                    onClick: () => Taro.switchTab({ url: '/pages/profile/index' }).catch(() => Taro.redirectTo({ url: '/pages/profile/index' })),
                  },
                ]}
              />
            ),
          },
        ]}
      />,
    );
  }

  if (isCurrentForkGenerating) {
    const progress = generationProgress || {
      stages: PIPELINE_STAGES,
      stageIndex: 0,
      pct: 5,
      stageLabel: PIPELINE_STAGES[0]?.label || '收到想法',
      message: '正在接收你的复刻需求',
    };
    const taskStatusLabel = TASK_STATUS_LABELS[currentTask?.status] || '执行中';
    const currentStageLabel = progress.stageLabel || '正在生成复刻作品';

    return renderForkPage(
      <CreationSessionShell
        hideHero
        sections={[
          {
            key: 'fork-progress-panel',
            node: (
              <GenerationProgressPanel
                stages={progress.stages || PIPELINE_STAGES}
                currentIndex={progress.stageIndex}
                progressPct={progress.pct}
                stageLabel={currentStageLabel}
                progressMessage={progress.message}
                statusLabel={taskStatusLabel}
                modeLabel="AI 正在复刻"
                coreLabel="AI 复刻"
              />
            ),
          },
          currentTask?.taskId ? {
            key: 'fork-progress-actions',
            node: (
              <CreationSessionActions
                title="本轮操作"
                hint="如果这次方向跑偏，可以先停掉，再说一遍你想怎么改。"
                actions={[
                  {
                    key: 'cancel-fork-task',
                    label: '先停下',
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
                eyebrow="小贴士"
                title="复刻出来的新版本会自动放进你的作品里"
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
                eyebrow="搞定"
                title={currentGame?.title || '新版本作品'}
                description="现在可以继续打磨、验证玩法，或者进入详情页查看。"
              />
            ),
          },
          {
            key: 'fork-complete-actions',
            node: (
              <CreationSessionActions
                title="下一步"
                hint="你可以继续在这版上接着改。"
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
      eyebrow="基于这款作品"
      title={sourceGame?.title || '未命名游戏'}
      badge={authorName}
      description={sanitizeUserIdea(sourceGame?.description) || '你可以基于这版作品做出全新的方向。'}
      metadata={[
        { label: '来源', value: isOwnGame ? '这是你的作品' : '社区作品' },
        { label: '作者设置', value: canForkGame ? '可以复刻' : '暂不开放' },
      ]}
      metrics={statItems}
    />
  );

  const forkWorkspaceSecondaryActions = (() => {
    if (!isForkSessionActive) {
      return [
        {
          key: 'generate-fork-directly',
          label: '直接生成',
          tone: 'primary',
          onClick: handleForkWorkspaceGenerate,
          disabled: creationSessionSubmitting || !canStartForkSession,
        },
      ];
    }

    const actions = [];

    if (canConfirmCurrentForkPrompt) {
      actions.push({
        key: 'confirm-current-fork-prompt',
        label: '直接用这一版',
        onClick: handleConfirmCurrentForkPrompt,
        disabled: creationSessionSubmitting,
      });
    }

    if (canGenerateForkSession) {
      actions.push({
        key: 'generate-fork-session',
        label: creationSession?.status === 'ready' ? '开始生成' : '直接生成',
        tone: 'primary',
        onClick: handleForkWorkspaceGenerate,
        disabled: creationSessionSubmitting,
      });
    }

    actions.push({
      key: 'restart-fork-session',
      label: '重新开始',
      tone: 'danger',
      onClick: handleRestartForkSession,
      disabled: creationSessionSubmitting,
    });

    return actions;
  })();

  const forkWorkspace = (
    <CreationCreateWorkspace
      showSettings={false}
      topContent={sourceReferenceCard}
      session={isForkSessionActive ? creationSession : null}
      inputValue={isForkSessionActive ? sessionPromptDraft : forkInstruction}
      onInputChange={(e) => {
        const nextValue = e?.detail?.value || '';
        if (isForkSessionActive) {
          setSessionPromptDraft(nextValue);
          return;
        }
        setForkInstruction(nextValue);
      }}
      inputPlaceholder={activeForkInputPlaceholder}
      onPrimaryAction={handleForkWorkspacePrimaryAction}
      primaryActionLabel={isForkSessionActive ? '确认这版方向' : '让 AI 整理一下方向'}
      primaryActionDisabled={
        creationSessionSubmitting
        || (isForkSessionActive ? !canEditForkPrompt || !hasForkPromptChanges : !canStartForkSession)
      }
      secondaryActions={forkWorkspaceSecondaryActions}
      errorMessage={getUserFacingForkError(
        (creationSession?.entryMode === 'fork'
          ? (creationSessionError || error || terminalError?.message || '')
          : '')
        || pageError
        || ''
      )}
      isSubmitting={creationSessionSubmitting}
      workspaceTitle={isForkSessionActive ? '确认这次复刻的方向' : '说说这次想怎么改'}
      workspaceHint={isForkSessionActive
        ? 'AI 根据你说的，整理出下面这段方向。你可以改改，觉得合适就开始。'
        : '先说说你想保留什么、改掉什么，AI 会帮你补成一版完整方向，你改改就能开始。'}
      introMessage="先告诉我你想保留什么、改掉什么，我会整理出一版完整方向。"
      helperText={isForkSessionActive
        ? (creationSession?.currentQuestion?.prompt || creationSession?.currentQuestion?.content || '请确认或修改这一版方向。')
        : ''}
      loadingTitle="AI 正在把你说的想法补成完整方向"
      loadingDescription="通常只要几秒，AI 会整理出一版你可以改的方向。"
      initialLabel="复刻方向"
      initialHint="可以描述你想保留的核心、想改变的体验、风格或想让它更适合谁玩。"
      draftLabel="AI 整理出的复刻方向"
      draftHint={creationSession?.status === 'ready'
        ? '这版方向已经确认。你仍然可以继续改，再次保存。'
        : '你可以继续改这段方向，也可以直接用现在这一版。'}
    />
  );

  if (!canForkGame && !isCurrentForkSession) {
    return renderForkPage(
      <>
        <CreationSessionShell
          eyebrow={isOwnGame ? '这是你的作品' : '暂时无法开始'}
          title={isOwnGame ? '直接去优化这款作品就好' : '作者暂未开放复刻'}
          subtitle={isOwnGame ? '自己的作品不需要复刻，直接优化就能改。' : '这款作品目前不能基于原作生成新版本。'}
          statusLabel="当前状态"
          statusValue="暂时无法开始"
          sections={[
            {
              key: 'fork-blocked',
              node: (
                <CreationStateCard
                  tone="danger"
                  eyebrow="暂时无法开始"
                  title={isOwnGame ? '去"我的作品"里直接优化' : '作者暂时没开放复刻'}
                  description={isOwnGame
                    ? '你已经拥有这款作品，直接"优化"就可以继续改，更顺手。'
                    : pageError || '这款作品的作者暂时没有开放复刻，你可以试试别的作品。'}
                />
              ),
            },
            isOwnGame ? {
              key: 'fork-own-game-actions',
              node: (
                <CreationSessionActions
                  title="下一步"
                  hint='对自己的作品来说，直接去"优化"会更合适。'
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
