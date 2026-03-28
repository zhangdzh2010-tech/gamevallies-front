import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Textarea, Input } from '@tarojs/components';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
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
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const {
    createGame,
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
    setCurrentGame,
  } = useGameStore();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const openPaywall = useQuotaStore((s) => s.openPaywall);
  const [gameName, setGameName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [orientation, setOrientation] = useState('portrait');
  const [isRestoringEntry, setIsRestoringEntry] = useState(false);
  const authRedirectingRef = useRef(false);
  const { windowHeight = 720 } = getSafeSystemInfo();
  const scrollViewHeight = Math.max(windowHeight - 120, 400);
  const containerClassName = `create-container${isWeapp ? ' create-container--weapp' : ''}`;

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


  const handleExampleClick = (text) => {
    setPrompt(text);
  };

  // Step 1: submit prompt, then enter clarification flow or create directly
  const handleSubmit = async () => {
    if (!prompt.trim() || prompt.trim().length < 5) {
      Taro.showToast({ title: '请输入游戏描述', icon: 'none' });
      return;
    }
    clearError();
    await doCreate(prompt.trim(), gameName, orientation);
  };

  async function doCreate(description, name, nextOrientation) {
    const title = (name || gameName).trim(); // Empty title lets the backend generate one.
    try {
      await createGame(description, title, {
        orientation: nextOrientation || orientation,
      });
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '创建游戏'), icon: 'none' });
    }
  }

  const handlePlayGame = () => {
    if (currentGame?.gameUrl) {
      openGame(currentGame.gameUrl, currentGame.title || gameName, getGameCoverUrl(currentGame), {
        canPlay,
        isOwnGame: true,
        gameId: currentGame.id,
      });
    }
  };

  const handleLockedPlay = () => {
    openPaywall({
      gameId: currentGame?.id,
      gameUrl: currentGame?.gameUrl,
      gameTitle: currentGame?.title || gameName,
      gameCover: getGameCoverUrl(currentGame),
      resumePlay: true,
    });
  };

  const handleNewGame = () => {
    resetCreateSession();
    resetLocalCreateState();
  };

  // Chat clarification view
  if (isRestoringEntry) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
        <View className="create-header">
          <Text className="header-title">正在恢复创作</Text>
          <Text className="header-subtitle">马上回到当前作品或进行中的创作任务</Text>
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
        <View className="create-header">
          <Text className="header-title">AI 创作中</Text>
          <Text className="header-subtitle">AI 正在为你生成游戏，请稍候</Text>
        </View>

        <ScrollView className="create-scroll" style={{ height: `${scrollViewHeight}px` }} scrollY>
          <View className="progress-panel">
            <PipelineOrbit
              stages={PIPELINE_STAGES}
              currentIndex={progress.stageIndex}
              progressPct={progress.pct}
              title="生成进度"
              stageLabel={currentStageLabel}
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
          </View>

          <View className="bottom-spacer" />
        </ScrollView>

        <CustomTabBar activeIndex={2} />
      </View>
    );
  }

  // Completion view
  if (currentGame && !isGenerating && isCompletedGameStatus(currentGame?.status)) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
        <View className="create-header">
          <Text className="header-title">创作完成！</Text>
          <Text className="header-subtitle">{currentGame.title || gameName || '你的游戏'}已经准备好了</Text>
        </View>

        <ScrollView className="create-scroll" style={{ height: `${scrollViewHeight}px` }} scrollY>
        <View className="completion-panel">
          <Text className="completion-emoji">OK</Text>
          <Text className="completion-title">{currentGame.title || gameName || '新游戏'}</Text>

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
        </ScrollView>

        <CustomTabBar activeIndex={2} />
        <GlobalGamePlayer />
        <PaywallPopup />
      </View>
    );
  }

  // Main create form (step 1)
  return (
    <View className={containerClassName}>
      <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
      <View className="create-header">
        <View className="create-header-top">
          <Text className="header-title">创作新游戏</Text>
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
        <Text className="header-subtitle">描述你的游戏想法，AI 会帮你设计并生成</Text>
      </View>

      <ScrollView className="create-scroll" scrollY>
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
            <Text className="form-label">描述你的游戏创意</Text>
            <Textarea
              className="form-textarea"
              placeholder="简单描述你想要的游戏，AI 会帮你扩展成完整方案..."
              placeholderStyle="color: #55516e"
              value={prompt}
              onInput={(e) => setPrompt(e.detail.value)}
              maxlength={2000}
              autoHeight
            />
            <Text className="input-count">{prompt.length}/2000</Text>
          </View>

          {error && (
            <View className="error-banner">
              <Text className="error-text">{getUserFacingCreateError(terminalError?.message || error, '创建游戏')}</Text>
              <Text className="error-dismiss" onClick={clearError}>×</Text>
            </View>
          )}

          <View className="form-actions">
            <View className="submit-btn" onClick={handleSubmit}>
              <Text>开始创作</Text>
            </View>
          </View>
        </View>

        <View className="examples-section">
          <Text className="section-title">创意样例 <Text className="section-hint">点击即可直接使用</Text></Text>
          <View className="example-list">
            {EXAMPLE_PROMPTS.map((ex, idx) => (
              <View key={idx} className="example-card" onClick={() => handleExampleClick(ex.text)}>
                <Text className="example-emoji">{ex.emoji}</Text>
                <Text className="example-text">{ex.text}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="tips-section">
          <Text className="tips-title">创作流程</Text>
          <View className="tip-item"><Text className="tip-text">1. 描述你的游戏想法（可以很简短）</Text></View>
          <View className="tip-item"><Text className="tip-text">2. 提交后会直接进入 AI 创作任务</Text></View>
          <View className="tip-item"><Text className="tip-text">3. 生成完成后即可在“我的作品”继续编辑或试玩</Text></View>
        </View>

        <View className="bottom-spacer" />
      </ScrollView>

      <CustomTabBar activeIndex={2} />
    </View>
  );
}





