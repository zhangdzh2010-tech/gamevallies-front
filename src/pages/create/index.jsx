import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Textarea, Input } from '@tarojs/components';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
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
  openProfilePageWithTab,
} from '../../utils/authNavigation';
import './index.scss';

function mkMsg(role, text) {
  return { role, text, id: Date.now() + Math.random() };
}

function generateClarifications(prompt) {
  const questions = [];
  const lower = prompt.toLowerCase();
  const hasStyle = /风格|画面|像素|卡通|写实|简约|霓虹/.test(lower);
  const hasDifficulty = /难度|简单|困难|容易|hard|easy/.test(lower);
  const hasScoring = /计分|得分|积分|分数/.test(lower);

  if (!hasStyle) {
    questions.push({
      id: 'style',
      text: '你希望游戏的画面风格是？',
      options: ['像素风', '卡通风', '简约几何', '霓虹科技', '不限，AI决定'],
    });
  }

  if (!hasDifficulty) {
    questions.push({
      id: 'difficulty',
      text: '希望游戏难度如何？',
      options: ['简单（休闲）', '中等', '困难（挑战）', '不限'],
    });
  }

  if (!hasScoring) {
    questions.push({
      id: 'scoring',
      text: '计分方式偏好？',
      options: ['时间越长分越高', '击败敌人得分', '收集物品得分', 'AI决定'],
    });
  }

  return questions;
}

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
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  canceled: '已取消',
  timed_out: '超时',
};

const PIPELINE_MESSAGE_PATTERNS = [
  { pattern: /(started|queued|submitting|提交|request)/i, stageKey: 'submitting' },
  { pattern: /(slot extraction|slot_extract|dialogue|intent parsing|intent_parse|json|解析意图|意图解析)/i, stageKey: 'intent_parsing' },
  { pattern: /(design|parameter|参数|设计方案)/i, stageKey: 'designing' },
  { pattern: /(template|模板)/i, stageKey: 'template_matching' },
  { pattern: /(code|代码生成|生成代码)/i, stageKey: 'code_generating' },
  { pattern: /(qa|quality|质量检查)/i, stageKey: 'qa_checking' },
  { pattern: /(runtime|运行时)/i, stageKey: 'runtime_qa' },
  { pattern: /(review|审查|审阅)/i, stageKey: 'code_review' },
  { pattern: /(complete|completed|succeeded|完成)/i, stageKey: 'completed' },
];

function getPipelineStageLabel(stageKey, fallback = '处理中') {
  const stage = PIPELINE_STAGES.find((item) => item.key === stageKey);
  return stage?.label || fallback;
}

function inferPipelineStageLabel(rawMessage = '', explicitStageKey = '', fallback = '处理中') {
  if (explicitStageKey) {
    return getPipelineStageLabel(explicitStageKey, fallback);
  }

  const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  if (!message) {
    return fallback;
  }

  const matchedStage = PIPELINE_MESSAGE_PATTERNS.find((item) => item.pattern.test(message));
  if (matchedStage) {
    return getPipelineStageLabel(matchedStage.stageKey, fallback);
  }

  return fallback;
}

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

  const stageLabel = inferPipelineStageLabel(source, '', fallbackStageLabel);
  if (/超时|timeout|timed out/i.test(source)) {
    return `${stageLabel}阶段处理超时，请稍后重试`;
  }

  if (stageLabel === '解析游戏意图') {
    return '解析游戏意图阶段遇到问题，请换一种更直接的描述后重试';
  }

  return `${stageLabel}阶段遇到问题，请稍后重试`;
}

export default function Create() {
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const {
    createGame,
    iterateGame,
    restorePersistedTask,
    cancelCurrentTask,
    isGenerating,
    generationProgress,
    currentGame,
    currentTask,
    currentTaskEvents,
    error,
    terminalError,
    latestTaskMessage,
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
  const [isExpanding, setIsExpanding] = useState(false);

  // Chat-based clarification state
  const [chatMode, setChatMode] = useState(false);
  const [messages, setMessages] = useState([]);
  const [pendingQuestions, setPendingQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [finalPrompt, setFinalPrompt] = useState('');
  const [extraDetails, setExtraDetails] = useState({});
  const [iterateFeedback, setIterateFeedback] = useState('');
  const [isIterating, setIsIterating] = useState(false);
  const [isRestoringEntry, setIsRestoringEntry] = useState(false);
  const authRedirectingRef = useRef(false);
  const { windowHeight = 720 } = Taro.getSystemInfoSync();
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
    if (!activeTaskSnapshot?.taskId) {
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
    setIsExpanding(false);
    setChatMode(false);
    setMessages([]);
    setPendingQuestions([]);
    setCurrentQuestion(null);
    setFinalPrompt('');
    setExtraDetails({});
    setIterateFeedback('');
    setIsIterating(false);
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
            Taro.showToast({ title: '已 Fork 到你的创作区', icon: 'success' });
          }
        } catch (error) {
          if (!cancelled) {
            Taro.showToast({ title: error?.message || 'Fork 失败，请重试', icon: 'none' });
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

    const clarifications = generateClarifications(prompt.trim());
    if (clarifications.length > 0) {
      setChatMode(true);
      setFinalPrompt(prompt.trim());
      setExtraDetails({});
      setMessages([
        mkMsg('user', prompt.trim()),
        mkMsg('ai', `好的，我来帮你创作${gameName ? `《${gameName}》` : '这个游戏'}！为了让结果更符合你的预期，我想先确认几个细节。`),
      ]);
      setCurrentQuestion(clarifications[0]);
      setPendingQuestions(clarifications.slice(1));
    } else {
      setIsExpanding(true);
      doCreate(prompt.trim(), gameName);
    }
  };

  // Handle user selecting a clarification option
  const handleOptionSelect = (option) => {
    if (!currentQuestion) return;

    const newMsgs = [
      ...messages,
      mkMsg('ai', currentQuestion.text),
      mkMsg('user', option),
    ];
    const newDetails = { ...extraDetails, [currentQuestion.id]: option };
    setExtraDetails(newDetails);
    setMessages(newMsgs);

    if (pendingQuestions.length > 0) {
      setCurrentQuestion(pendingQuestions[0]);
      setPendingQuestions(pendingQuestions.slice(1));
    } else {
      // All questions answered, build the enhanced prompt and start creating.
      setCurrentQuestion(null);
      const enhanced = buildEnhancedPrompt(finalPrompt, newDetails);
      const finalMsgs = [
        ...newMsgs,
        mkMsg('ai', '明白了，开始为你创作游戏。'),
      ];
      setMessages(finalMsgs);
      setTimeout(() => doCreate(enhanced, gameName), 600);
    }
  };

  // Skip remaining clarifications
  const handleSkipClarify = () => {
    setCurrentQuestion(null);
    setPendingQuestions([]);
    const skipMsgs = [...messages, mkMsg('ai', '好的，直接开始创作。')];
    setMessages(skipMsgs);
    const enhanced = buildEnhancedPrompt(finalPrompt, extraDetails);
    setTimeout(() => doCreate(enhanced, gameName), 400);
  };

  function buildEnhancedPrompt(base, details) {
    let extra = '';

    if (details.style && details.style !== '不限，AI决定') extra += `，画面风格：${details.style}`;
    if (details.difficulty && details.difficulty !== '不限') extra += `，难度：${details.difficulty}`;
    if (details.scoring) extra += `，计分方式：${details.scoring}`;
    return base + extra;
  }

  async function doCreate(description, name) {
    setChatMode(false);
    setIsExpanding(false);
    const title = (name || gameName).trim(); // Empty title lets the backend generate one.
    try {
      await createGame(description, title);
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, 'AI 规划方案'), icon: 'none' });
    }
  }

  const handlePlayGame = () => {
    if (currentGame?.gameUrl) {
      openGame(currentGame.gameUrl, currentGame.title || gameName, '', {
        canPlay,
        isOwnGame: true,
        gameId: currentGame.id,
      });
    }
  };

  const handleLockedPlay = () => {
    openPaywall(currentGame?.id);
  };

  const handleNewGame = () => {
    resetCreateSession();
    resetLocalCreateState();
  };

  const handleIterate = async () => {
    if (!iterateFeedback.trim()) {
      Taro.showToast({ title: '请输入优化说明', icon: 'none' });
      return;
    }
    if (!currentGame?.id) return;
    setIsIterating(true);
    try {
      await iterateGame(currentGame.id, iterateFeedback.trim());
      setIterateFeedback('');
    } catch (err) {
      Taro.showToast({ title: getUserFacingCreateError(err?.message, '优化游戏'), icon: 'none' });
    } finally {
      setIsIterating(false);
    }
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

  if (chatMode && !isGenerating) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
        <View className="create-header">
          <Text className="header-title">完善游戏方案</Text>
          <Text className="header-subtitle">回答几个小问题，让 AI 更准确地理解你的想法</Text>
        </View>

        <ScrollView className="create-scroll" scrollY>
          <View className="chat-messages">
            {messages.map(msg => (
              <View key={msg.id} className={`chat-msg chat-msg--${msg.role}`}>
                {msg.role === 'ai' && <Text className="chat-avatar">AI</Text>}
                <View className="chat-bubble">
                  <Text className="chat-text">{msg.text}</Text>
                </View>
                {msg.role === 'user' && <Text className="chat-avatar">我</Text>}
              </View>
            ))}

            {currentQuestion && (
              <View className="clarify-block">
                <View className="chat-msg chat-msg--ai">
                  <Text className="chat-avatar">AI</Text>
                  <View className="chat-bubble">
                    <Text className="chat-text">{currentQuestion.text}</Text>
                  </View>
                </View>
                <View className="options-list">
                  {currentQuestion.options.map((opt, i) => (
                    <View key={i} className="option-btn" onClick={() => handleOptionSelect(opt)}>
                      <Text className="option-text">{opt}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
          <View className="bottom-spacer" />
        </ScrollView>

        <View className="chat-footer">
          <View className="skip-btn" onClick={handleSkipClarify}>
            <Text className="skip-text">跳过，直接开始创作 →</Text>
          </View>
        </View>

        <CustomTabBar activeIndex={2} />
      </View>
    );
  }

  // Expanding / submitting view
  if (isExpanding) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
        <View className="create-header">
          <Text className="header-title">AI 正在整理方案</Text>
          <Text className="header-subtitle">根据你的想法整理更完整的游戏方案</Text>
        </View>
        <View className="expanding-panel">
          <View className="expanding-spinner" />
          <Text className="expanding-text">AI 正在分析你的创意，并整理成完整的游戏方案...</Text>
        </View>
        <CustomTabBar activeIndex={2} />
      </View>
    );
  }

  // Generating progress view
  if (isGenerating) {
    const progress = generationProgress || { stageIndex: 0, pct: 5, stageLabel: '准备中...' };
    const taskEventList = currentTaskEvents.slice(-3);
    const taskTypeLabel = currentTask?.taskType === 'pipeline_iterate' ? '优化任务' : '创建任务';
    const taskIdSuffix = currentTask?.taskId ? String(currentTask.taskId).slice(-8) : '';
    const taskStatusLabel = TASK_STATUS_LABELS[currentTask?.status] || '执行中';
    const currentStageLabel = inferPipelineStageLabel(
      latestTaskMessage,
      progress.stageKey,
      getPipelineStageLabel(progress.stageKey, '正在生成游戏')
    );
    return (
      <View className={containerClassName}>
        <AppTopBar showBack rightText="任务" onRightClick={openTaskCenter} />
        <View className="create-header">
          <Text className="header-title">AI 创作中</Text>
          <Text className="header-subtitle">{`当前阶段：${currentStageLabel}`}</Text>
        </View>

        <View className="progress-panel">
          <View className="task-meta-card">
            <View className="task-meta-row">
              <Text className="task-meta-label">当前任务</Text>
              <Text className="task-meta-value">{taskTypeLabel}</Text>
            </View>
            {taskIdSuffix ? (
              <View className="task-meta-row">
                <Text className="task-meta-label">任务 ID</Text>
                <Text className="task-meta-value">...{taskIdSuffix}</Text>
              </View>
            ) : null}
            {currentTask?.status ? (
              <View className="task-meta-row">
                <Text className="task-meta-label">状态</Text>
                <Text className="task-meta-value">{taskStatusLabel}</Text>
              </View>
            ) : null}
          </View>

          <View className="progress-bar-wrapper">
            <View className="progress-bar-bg">
              <View className="progress-bar-fill" style={{ width: `${progress.pct}%` }} />
            </View>
            <Text className="progress-pct">{progress.pct}%</Text>
          </View>

          <View className="stage-list">
            {PIPELINE_STAGES.map((stage, idx) => {
              const isDone = idx < progress.stageIndex;
              const isCurrent = idx === progress.stageIndex;
              return (
                <View key={stage.key} className={`stage-item ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''} ${!isDone && !isCurrent ? 'pending' : ''}`}>
                  <View className="stage-indicator">
                    {isDone ? <Text className="stage-check">✓</Text> : isCurrent ? <View className="stage-pulse" /> : <View className="stage-dot" />}
                  </View>
                  <Text className="stage-label">{stage.label}</Text>
                  {isCurrent && <Text className="stage-active-hint">进行中...</Text>}
                </View>
              );
            })}
          </View>

          {taskEventList.length ? (
            <View className="task-events-card">
              <Text className="task-events-title">最新进展</Text>
              {taskEventList.map((event, index) => (
                <View
                  key={event.id || event.seqNo || `${event.createdAt || 'event'}-${index}`}
                  className="task-event-item"
                >
                  <Text className="task-event-dot" />
                  <Text className="task-event-text">
                    {inferPipelineStageLabel(
                      event.message,
                      event.stepKey || event.stage,
                      currentStageLabel
                    )}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {currentTask?.taskId ? (
            <View className="task-actions">
              <View className="task-cancel-btn" onClick={handleCancelTask}>
                <Text>取消任务</Text>
              </View>
            </View>
          ) : null}
        </View>

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
            <View className="action-btn new-btn" onClick={handleNewGame}>
              <Text>再创一个</Text>
            </View>
          </View>

          {/* 优化面板 */}
          <View className="iterate-panel">
            <Text className="iterate-title">优化游戏</Text>
            <Text className="iterate-hint">描述你想改进的地方，越详细效果越好</Text>
            <Textarea
              className="iterate-textarea"
              placeholder="例如：把游戏速度调快一些，增加二段跳能力，改成红色主题，增加音效..."
              placeholderStyle="color: #55516e"
              value={iterateFeedback}
              onInput={(e) => setIterateFeedback(e.detail.value)}
              maxLength={500}
              autoHeight
            />
            <Text className="input-count">{iterateFeedback.length}/500</Text>
            <View
              className={`iterate-btn ${isIterating ? 'disabled' : ''}`}
              onClick={isIterating ? undefined : handleIterate}
            >
              <Text>{isIterating ? '优化中...' : '提交优化'}</Text>
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
        <Text className="header-title">创作新游戏</Text>
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
              maxLength={2000}
              autoHeight
            />
            <Text className="input-count">{prompt.length}/2000</Text>
          </View>

          {error && (
            <View className="error-banner">
              <Text className="error-text">{getUserFacingCreateError(terminalError?.message || error, 'AI 规划方案')}</Text>
              <Text className="error-dismiss" onClick={clearError}>×</Text>
            </View>
          )}

          <View className="form-actions">
            <View className="submit-btn" onClick={handleSubmit}>
              <Text>AI 规划方案</Text>
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
          <View className="tip-item"><Text className="tip-text">2. AI 会通过几个小问题补充关键细节</Text></View>
          <View className="tip-item"><Text className="tip-text">3. 确认信息后，AI 会自动生成可玩的游戏</Text></View>
        </View>

        <View className="bottom-spacer" />
      </ScrollView>

      <CustomTabBar activeIndex={2} />
    </View>
  );
}





