import React, { useState, useRef } from 'react';
import { View, Text, ScrollView, Textarea, Input } from '@tarojs/components';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import Taro from '@tarojs/taro';
import { useGameStore, PIPELINE_STAGES } from '../../store/gameStore';
import useGamePlayerStore from '../../stores/gamePlayer';
import { Storage } from '../../utils/storage';
import * as gameService from '../../services/game';
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
  { emoji: '🐍', text: '做一个贪吃蛇游戏，触屏滑动控制方向，吃到食物变长，撞墙或撞自己游戏结束' },
  { emoji: '🎯', text: '打地鼠小游戏，9宫格随机出现地鼠，点击得分，30秒计时挑战' },
  { emoji: '🧩', text: '2048数字合并益智游戏，上下左右滑动合并相同数字，目标达到2048' },
  { emoji: '🚀', text: '太空飞船躲避陨石游戏，左右移动躲避从上方掉落的陨石，存活越久分数越高' },
  { emoji: '🎵', text: '音乐节奏游戏，彩色圆圈出现并缩小，在圆圈消失前点击它得分，连击加成' },
  { emoji: '🏃', text: '无尽跑酷游戏，点击屏幕跳跃躲避障碍，速度越来越快，收集金币加分' },
];

export default function Create() {
  const { createGame, iterateGame, isGenerating, generationProgress, currentGame, error, clearError } = useGameStore();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const [gameName, setGameName] = useState('');
  const [prompt, setPrompt] = useState('');

  // 3-step flow state
  const [step, setStep] = useState('input'); // 'input' | 'confirm' | 'generating' | 'done'
  const [expandedPrompt, setExpandedPrompt] = useState('');
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
  const scrollRef = useRef(null);
  const scrollViewHeight = typeof window !== 'undefined' ? window.innerHeight - 120 : 600;


  const handleExampleClick = (text) => {
    setPrompt(text);
  };

  // Step 1: Submit prompt — enter chat clarification or create directly
  const handleSubmit = async () => {
    const token = Storage.getToken();
    if (!token) {
      Taro.showToast({ title: '请先登录后再创作', icon: 'none', duration: 2000 });
      setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 1000);
      return;
    }
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
        mkMsg('ai', `好的，我来帮你创作${gameName ? `「${gameName}」` : '这个游戏'}！为了让游戏更符合你的期待，我想确认几个细节：`),
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
      // All questions answered — build enhanced prompt and create
      setCurrentQuestion(null);
      const enhanced = buildEnhancedPrompt(finalPrompt, newDetails);
      const finalMsgs = [
        ...newMsgs,
        mkMsg('ai', '明白了！开始为你创作游戏...'),
      ];
      setMessages(finalMsgs);
      setTimeout(() => doCreate(enhanced, gameName), 600);
    }
  };

  // Skip remaining clarifications
  const handleSkipClarify = () => {
    setCurrentQuestion(null);
    setPendingQuestions([]);
    const skipMsgs = [...messages, mkMsg('ai', '好的，直接开始创作！')];
    setMessages(skipMsgs);
    const enhanced = buildEnhancedPrompt(finalPrompt, extraDetails);
    setTimeout(() => doCreate(enhanced, gameName), 400);
  };

  function buildEnhancedPrompt(base, details) {
    let extra = '';
    if (details.style && details.style !== '不限，AI决定') extra += `，画面风格：${details.style}`;
    if (details.difficulty && details.difficulty !== '不限') extra += `，难度：${details.difficulty}`;
    if (details.scoring) extra += `，${details.scoring}`;
    return base + extra;
  }

  async function doCreate(description, name) {
    setChatMode(false);
    setIsExpanding(false);
    const title = (name || gameName).trim(); // empty → backend generates "Game [id]"
    try {
      await createGame(description, title);
    } catch (err) {
      Taro.showToast({ title: (err && err.message) || '创建失败，请重试', icon: 'none' });
    }
  };

  // Step 2 → Step 3: Confirm and generate
  const handleConfirmGenerate = async () => {
    setStep('generating');
    try {
      await createGame(expandedPrompt);
    } catch (err) {
      Taro.showToast({ title: (err && err.message) || '创建失败', icon: 'none' });
    }
  };

  // Back to editing
  const handleBackToEdit = () => {
    setStep('input');
    setExpandedPrompt('');
  };

  const handlePlayGame = () => {
    if (currentGame?.gameUrl) {
      openGame(currentGame.gameUrl, currentGame.title || gameName);
    }
  };

  const handleNewGame = () => {
    setPrompt('');
    setGameName('');
    setStep('input');
    setExpandedPrompt('');
    setChatMode(false);
    setMessages([]);
    setCurrentQuestion(null);
    setPendingQuestions([]);
    setIterateFeedback('');
    setIsIterating(false);
    clearError();
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
      Taro.showToast({ title: err.message || '优化失败，请重试', icon: 'none' });
    } finally {
      setIsIterating(false);
    }
  };

  // ── Chat clarification view ──
  if (chatMode && !isGenerating) {
    return (
      <View className="create-container">
        <View className="create-header">
          <Text className="header-title">✨ 完善游戏方案</Text>
          <Text className="header-subtitle">回答几个小问题，让 AI 更准确地理解你的想法</Text>
        </View>

        <ScrollView className="create-scroll" scrollY>
          <View className="chat-messages">
            {messages.map(msg => (
              <View key={msg.id} className={`chat-msg chat-msg--${msg.role}`}>
                {msg.role === 'ai' && <Text className="chat-avatar">🤖</Text>}
                <View className="chat-bubble">
                  <Text className="chat-text">{msg.text}</Text>
                </View>
                {msg.role === 'user' && <Text className="chat-avatar">🧑</Text>}
              </View>
            ))}

            {currentQuestion && (
              <View className="clarify-block">
                <View className="chat-msg chat-msg--ai">
                  <Text className="chat-avatar">🤖</Text>
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

  // ── Expanding / submitting view ──
  if (isExpanding) {
    return (
      <View className="create-container">
        <View className="create-header">
          <Text className="header-title">AI 正在构思...</Text>
          <Text className="header-subtitle">根据你的想法设计详细的游戏方案</Text>
        </View>
        <View className="expanding-panel">
          <View className="expanding-spinner" />
          <Text className="expanding-text">AI 策划师正在分析你的创意并扩展为详细方案...</Text>
        </View>
        <CustomTabBar activeIndex={2} />
      </View>
    );
  }

  // ── Confirm expanded prompt view ──
  if (step === 'confirm') {
    return (
      <View className="create-container">
        <View className="create-header">
          <Text className="header-title">确认游戏方案</Text>
          <Text className="header-subtitle">AI 已为你扩展了详细的游戏设计，可以编辑调整</Text>
        </View>

        <ScrollView className="create-scroll" scrollY>
          <View className="confirm-section">
            <View className="original-prompt">
              <Text className="section-label">你的原始想法</Text>
              <Text className="original-text">{prompt}</Text>
            </View>

            <View className="expanded-prompt">
              <Text className="section-label">AI 扩展方案</Text>
              <Textarea
                className="expanded-textarea"
                value={expandedPrompt}
                onInput={(e) => setExpandedPrompt(e.detail.value)}
                autoHeight
                maxLength={1000}
              />
              <Text className="char-count">{expandedPrompt.length}/1000</Text>
            </View>

            <View className="confirm-actions">
              <View className="confirm-btn" onClick={handleConfirmGenerate}>
                <Text>🚀 确认生成游戏</Text>
              </View>
              <View className="back-btn" onClick={handleBackToEdit}>
                <Text>← 返回修改</Text>
              </View>
            </View>
          </View>
          <View className="bottom-spacer" />
        </ScrollView>

        <CustomTabBar activeIndex={2} />
      </View>
    );
  }

  // ── Generating progress view ──
  if (isGenerating || step === 'generating') {
    const progress = generationProgress || { stageIndex: 0, pct: 5, stageLabel: '准备中...' };
    return (
      <View className="create-container">
        <View className="create-header">
          <Text className="header-title">AI 创作中</Text>
          <Text className="header-subtitle">正在生成游戏，预计需要3-10分钟</Text>
        </View>

        <View className="progress-panel">
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
        </View>

        <CustomTabBar activeIndex={2} />
      </View>
    );
  }

  // ── Completion view ──
  if (currentGame && !error) {
    return (
      <View className="create-container">
        <View className="create-header">
          <Text className="header-title">创作完成！</Text>
          <Text className="header-subtitle">{currentGame.title || gameName || '你的游戏'}已经准备好了</Text>
        </View>

        <ScrollView className="create-scroll" style={{ height: `${scrollViewHeight}px` }} scrollY>
        <View className="completion-panel">
          <Text className="completion-emoji">🎉</Text>
          <Text className="completion-title">{currentGame.title || gameName || '新游戏'}</Text>

          <View className="completion-actions">
            <View className="action-btn play-btn" onClick={handlePlayGame}>
              <Text>▶ 试玩游戏</Text>
            </View>
            <View className="action-btn new-btn" onClick={handleNewGame}>
              <Text>✨ 再创一个</Text>
            </View>
          </View>

          {/* 优化面板 */}
          <View className="iterate-panel">
            <Text className="iterate-title">🔧 优化游戏</Text>
            <Text className="iterate-hint">描述你想改进的地方，越详细效果越好</Text>
            <Textarea
              className="iterate-textarea"
              placeholder="例如：把游戏速度调快一些，增加双跳功能，改成红色主题，增加音效..."
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
              <Text>{isIterating ? '优化中...' : '🚀 提交优化'}</Text>
            </View>
          </View>
        </View>
        <View style={{ height: '80px' }} />
        </ScrollView>

        <CustomTabBar activeIndex={2} />
        <GlobalGamePlayer />
      </View>
    );
  }

  // ── Main create form (Step 1) ──
  return (
    <View className="create-container">
      <View className="create-header">
        <Text className="header-title">✨ 创作新游戏</Text>
        <Text className="header-subtitle">描述你的游戏想法，AI 帮你设计并生成</Text>
      </View>

      <ScrollView className="create-scroll" scrollY>
        <View className="form-section">
          <View className="form-group">
            <Text className="form-label">游戏名称</Text>
            <Input
              className="form-input"
              placeholder="给你的游戏起个名字（可选）"
              placeholderStyle="color: #55516e"
              value={gameName}
              onInput={(e) => setGameName(e.detail.value)}
              maxlength={30}
            />
          </View>

          <View className="form-group">
            <Text className="form-label">描述你的游戏创意</Text>
            <Textarea
              className="form-textarea"
              placeholder="简单描述你想要的游戏，AI 会帮你扩展为详细方案..."
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
              <Text className="error-text">{error}</Text>
              <Text className="error-dismiss" onClick={clearError}>✕</Text>
            </View>
          )}

          <View className="form-actions">
            <View className="submit-btn" onClick={handleSubmit}>
              <Text>🚀 AI 策划方案</Text>
            </View>
          </View>
        </View>

        <View className="examples-section">
          <Text className="section-title">💡 创意样例 <Text className="section-hint">点击直接使用</Text></Text>
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
          <Text className="tips-title">📝 创作流程</Text>
          <View className="tip-item"><Text className="tip-text">1. 描述你的游戏想法（可以很简短）</Text></View>
          <View className="tip-item"><Text className="tip-text">2. AI 策划师会扩展为详细的游戏方案</Text></View>
          <View className="tip-item"><Text className="tip-text">3. 确认方案后，AI 自动生成可玩的游戏</Text></View>
        </View>

        <View className="bottom-spacer" />
      </ScrollView>

      <CustomTabBar activeIndex={2} />
    </View>
  );
}
