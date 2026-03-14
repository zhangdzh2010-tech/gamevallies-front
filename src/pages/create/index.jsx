import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Textarea, Input } from '@tarojs/components';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import ChatInterface from './components/ChatInterface';
import Taro from '@tarojs/taro';
import { useGameStore, PIPELINE_STAGES } from '../../store/gameStore';
import useGamePlayerStore from '../../stores/gamePlayer';
import './index.scss';

const EXAMPLE_PROMPTS = [
  { emoji: '🐍', text: '做一个贪吃蛇游戏，触屏滑动控制方向，吃到食物变长，撞墙或撞自己游戏结束' },
  { emoji: '🎯', text: '打地鼠小游戏，9宫格随机出现地鼠，点击得分，30秒计时挑战' },
  { emoji: '🧩', text: '2048数字合并益智游戏，上下左右滑动合并相同数字，目标达到2048' },
  { emoji: '🚀', text: '太空飞船躲避陨石游戏，左右移动躲避从上方掉落的陨石，存活越久分数越高' },
  { emoji: '🎵', text: '音乐节奏游戏，彩色圆圈出现并缩小，在圆圈消失前点击它得分，连击加成' },
  { emoji: '🏃', text: '无尽跑酷游戏，点击屏幕跳跃躲避障碍，速度越来越快，收集金币加分' },
];

// AI clarification questions based on missing details
function generateClarifications(prompt) {
  const questions = [];
  const lower = prompt.toLowerCase();

  if (!lower.match(/风格|美术|画面|像素|卡通|3d|2d|写实/)) {
    questions.push({
      id: 'style',
      text: '你希望游戏是什么画面风格？',
      options: ['像素复古', '卡通可爱', '简约扁平', '炫酷霓虹', '不限，AI决定'],
    });
  }
  if (!lower.match(/难度|简单|困难|容易|挑战/)) {
    questions.push({
      id: 'difficulty',
      text: '游戏难度偏好？',
      options: ['轻松休闲', '适中', '有挑战性', '不限'],
    });
  }
  if (!lower.match(/计分|得分|分数|排行|成绩/)) {
    questions.push({
      id: 'scoring',
      text: '需要计分系统吗？',
      options: ['需要，有分数排行', '简单计分就好', '不需要计分'],
    });
  }
  return questions;
}

let msgIdCounter = 0;
function mkMsg(type, content) {
  return { id: ++msgIdCounter, type, content };
}

export default function Create() {
  const { createGame, isGenerating, generationProgress, currentGame, error, clearError } = useGameStore();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const { windowHeight = 750 } = Taro.getSystemInfoSync();
  const scrollViewHeight = windowHeight - 140 - 120;
  const [gameName, setGameName] = useState('');
  const [prompt, setPrompt] = useState('');

  // Chat-based clarification state
  const [chatMode, setChatMode] = useState(false);
  const [messages, setMessages] = useState([]);
  const [pendingQuestions, setPendingQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [finalPrompt, setFinalPrompt] = useState('');
  const [extraDetails, setExtraDetails] = useState({});
  const scrollRef = useRef(null);

  const handleExampleClick = (text) => {
    setPrompt(text);
  };

  // Start the creation flow: check if we need clarification
  const handleSubmit = () => {
    if (!prompt.trim()) {
      Taro.showToast({ title: '请输入游戏描述', icon: 'none' });
      return;
    }
    if (prompt.trim().length < 10) {
      Taro.showToast({ title: '描述太短了，请详细一些', icon: 'none' });
      return;
    }
    clearError();

    const clarifications = generateClarifications(prompt.trim());
    if (clarifications.length > 0) {
      // Enter chat mode for clarification
      setChatMode(true);
      const initialMsgs = [
        mkMsg('user', prompt.trim()),
        mkMsg('ai', `好的，我来帮你创作${gameName ? `「${gameName}」` : '这个游戏'}！为了让游戏更符合你的期待，我想确认几个细节：`),
      ];
      setMessages(initialMsgs);
      setPendingQuestions(clarifications.slice(1));
      setCurrentQuestion(clarifications[0]);
      setFinalPrompt(prompt.trim());
      setExtraDetails({});
    } else {
      // Prompt is detailed enough, go directly
      doCreate(prompt.trim());
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
      setTimeout(() => doCreate(enhanced), 600);
    }
  };

  // Skip remaining clarifications
  const handleSkipClarify = () => {
    setCurrentQuestion(null);
    setPendingQuestions([]);
    const skipMsgs = [...messages, mkMsg('ai', '好的，直接开始创作！')];
    setMessages(skipMsgs);
    const enhanced = buildEnhancedPrompt(finalPrompt, extraDetails);
    setTimeout(() => doCreate(enhanced), 400);
  };

  function buildEnhancedPrompt(base, details) {
    let extra = '';
    if (details.style && details.style !== '不限，AI决定') extra += `，画面风格：${details.style}`;
    if (details.difficulty && details.difficulty !== '不限') extra += `，难度：${details.difficulty}`;
    if (details.scoring) extra += `，${details.scoring}`;
    return base + extra;
  }

  async function doCreate(description) {
    setChatMode(false);
    try {
      await createGame(description);
    } catch (err) {
      Taro.showToast({ title: err.message || '创建失败', icon: 'none' });
    }
  }

  const handlePlayGame = () => {
    if (currentGame?.gameUrl) {
      openGame(currentGame.gameUrl, currentGame.title || gameName);
    }
  };

  const handleNewGame = () => {
    setPrompt('');
    setGameName('');
    setChatMode(false);
    setMessages([]);
    setCurrentQuestion(null);
    setPendingQuestions([]);
    clearError();
  };

  // ── Chat clarification view ──
  if (chatMode && !isGenerating) {
    return (
      <View className="create-container">
        <View className="create-header">
          <Text className="header-title">AI 助手确认</Text>
          <Text className="header-subtitle">完善你的创作需求</Text>
        </View>

        <ScrollView className="chat-scroll" style={{ height: `${scrollViewHeight}px` }} scrollY scrollIntoView="chat-bottom">
          <ChatInterface messages={messages} isGenerating={false} />

          {/* Current question with options */}
          {currentQuestion && (
            <View className="clarify-block">
              <Text className="clarify-question">{currentQuestion.text}</Text>
              <View className="clarify-options">
                {currentQuestion.options.map((opt) => (
                  <View key={opt} className="clarify-option" onClick={() => handleOptionSelect(opt)}>
                    <Text>{opt}</Text>
                  </View>
                ))}
              </View>
              <View className="clarify-skip" onClick={handleSkipClarify}>
                <Text className="skip-text">跳过，直接创作</Text>
              </View>
            </View>
          )}
          <View id="chat-bottom" />
        </ScrollView>

        <CustomTabBar activeIndex={2} />
      </View>
    );
  }

  // ── Generating progress view ──
  if (isGenerating) {
    const progress = generationProgress || { stageIndex: 0, pct: 5, stageLabel: '准备中...' };
    return (
      <View className="create-container">
        <View className="create-header">
          <Text className="header-title">AI 创作中</Text>
          <Text className="header-subtitle">正在为你生成{gameName ? `「${gameName}」` : '游戏'}，请耐心等待</Text>
        </View>

        <View className="progress-panel">
          {/* Progress bar */}
          <View className="progress-bar-wrapper">
            <View className="progress-bar-bg">
              <View className="progress-bar-fill" style={{ width: `${progress.pct}%` }} />
            </View>
            <Text className="progress-pct">{progress.pct}%</Text>
          </View>

          {/* Stage list */}
          <View className="stage-list">
            {PIPELINE_STAGES.map((stage, idx) => {
              const isDone = idx < progress.stageIndex;
              const isCurrent = idx === progress.stageIndex;
              const isPending = idx > progress.stageIndex;
              return (
                <View key={stage.key} className={`stage-item ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}`}>
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
          <Text className="header-subtitle">你的游戏已经准备好了</Text>
        </View>

        <View className="completion-panel">
          <Text className="completion-emoji">🎉</Text>
          <Text className="completion-title">{currentGame.title || gameName || '新游戏'}</Text>
          {currentGame.qualityScore && (
            <Text className="completion-score">质量评分: {currentGame.qualityScore}/10</Text>
          )}

          <View className="completion-actions">
            <View className="action-btn play-btn" onClick={handlePlayGame}>
              <Text>▶ 试玩游戏</Text>
            </View>
            <View className="action-btn new-btn" onClick={handleNewGame}>
              <Text>✨ 再创一个</Text>
            </View>
          </View>
        </View>

        <CustomTabBar activeIndex={2} />
        <GlobalGamePlayer />
      </View>
    );
  }

  // ── Main create form ──
  return (
    <View className="create-container">
      <View className="create-header">
        <Text className="header-title">✨ 创作新游戏</Text>
        <Text className="header-subtitle">用自然语言描述你想要的游戏，AI 帮你生成</Text>
      </View>

      <ScrollView className="create-scroll" style={{ height: `${scrollViewHeight}px` }} scrollY>
        {/* Form inputs */}
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
              placeholder="详细描述你想要的游戏玩法、操作方式、画面风格等..."
              placeholderStyle="color: #55516e"
              value={prompt}
              onInput={(e) => setPrompt(e.detail.value)}
              maxLength={500}
              autoHeight
            />
            <Text className="input-count">{prompt.length}/500</Text>
          </View>

          {error && (
            <View className="error-banner">
              <Text className="error-text">{error}</Text>
              <Text className="error-dismiss" onClick={clearError}>✕</Text>
            </View>
          )}

          <View className="form-actions">
            <View className="submit-btn" onClick={handleSubmit}>
              <Text>🚀 开始创作</Text>
            </View>
          </View>
        </View>

        {/* Example prompts */}
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

        {/* Tips */}
        <View className="tips-section">
          <Text className="tips-title">📝 创作技巧</Text>
          <View className="tip-item">
            <Text className="tip-text">描述越详细，AI 生成的游戏越贴合你的想法</Text>
          </View>
          <View className="tip-item">
            <Text className="tip-text">可以指定玩法、操控方式、美术风格、难度等</Text>
          </View>
          <View className="tip-item">
            <Text className="tip-text">所有游戏自动适配触屏操作，无需物理键盘</Text>
          </View>
        </View>

        <View className="bottom-spacer" />
      </ScrollView>

      <CustomTabBar activeIndex={2} />
    </View>
  );
}
