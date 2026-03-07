import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView } from


'@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import './index.scss';

// Mock data matching JSX demo
const GAMES = [
{
  id: '1',
  title: '2048 数字游戏',
  description: '合并相同数字达到2048',
  emoji: '🎮',
  color: '#6e56ff',
  plays: 23400,
  likes: 5600,
  author: '创意工厂',
  authorEmoji: '🎨',
  isHot: true,
  forks: 234
},
{
  id: '2',
  title: '太空防御',
  description: '击落来临的陨石',
  emoji: '🚀',
  color: '#2dd4a8',
  plays: 18900,
  likes: 4200,
  author: '星空开发',
  authorEmoji: '⭐',
  isHot: true,
  forks: 189
},
{
  id: '3',
  title: '音乐节奏',
  description: '跟随节奏点击',
  emoji: '🎵',
  color: '#fbbf24',
  plays: 15600,
  likes: 3800,
  author: '音乐工坊',
  authorEmoji: '🎼',
  isHot: false,
  forks: 156
},
{
  id: '4',
  title: '消消乐',
  description: '消除相同元素',
  emoji: '💎',
  color: '#ff5c8a',
  plays: 32100,
  likes: 7900,
  author: '益智游戏',
  authorEmoji: '🧩',
  isHot: false,
  forks: 312
},
{
  id: '5',
  title: '飞翔小鸟',
  description: '躲避障碍飞翔',
  emoji: '🐦',
  color: '#6e56ff',
  plays: 28700,
  likes: 6100,
  author: '经典重现',
  authorEmoji: '🎭',
  isHot: false,
  forks: 287
},
{
  id: '6',
  title: '捕鱼大师',
  description: '点击捕获更多鱼',
  emoji: '🎣',
  color: '#2dd4a8',
  plays: 19400,
  likes: 4100,
  author: '渔业大师',
  authorEmoji: '⛵',
  isHot: false,
  forks: 194
}];


const CREATORS = [
{
  id: '1',
  name: '创意工厂',
  emoji: '🎨',
  plays: 156000,
  description: '专注游戏创作'
},
{
  id: '2',
  name: '星空开发',
  emoji: '⭐',
  plays: 98000,
  description: '科幻游戏达人'
},
{
  id: '3',
  name: '音乐工坊',
  emoji: '🎼',
  plays: 76000,
  description: '音乐游戏专家'
},
{
  id: '4',
  name: '益智游戏',
  emoji: '🧩',
  plays: 134000,
  description: '益智内容创作'
},
{
  id: '5',
  name: '经典重现',
  emoji: '🎭',
  plays: 102000,
  description: '经典游戏改编'
}];




export default function Home() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('🔥 热门');
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const scrollViewRef = useRef(null);

  const CATEGORY_TABS = ['🔥 热门', '✨ 最新', '🚀 太空', '🎵 音乐'];

  const filteredGames = useCallback(() => {
    switch (activeTab) {
      case '🚀 太空':
        return GAMES.filter((g) => g.emoji === '🚀');
      case '🎵 音乐':
        return GAMES.filter((g) => g.emoji === '🎵');
      case '✨ 最新':
        return GAMES.slice().reverse();
      case '🔥 热门':
      default:
        return GAMES.sort((a, b) => b.plays - a.plays);
    }
  }, [activeTab]);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Simulate refresh
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    // Simulate loading more
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsLoadingMore(false);
  };

  const handlePlay = (gameId) => {
    navigation.push({
      url: `/pages/game/detail/index?id=${gameId}`
    });
  };

  const handleFork = (gameId) => {
    // Toast or modal for fork
    console.log('Fork game:', gameId);
  };

  const handleCreateClick = () => {
    navigation.switchTab({
      url: '/pages/create/index'
    });
  };

  const handleAvatarClick = () => {
    navigation.switchTab({
      url: '/pages/profile/index'
    });
  };

  const formatNumber = (num) => {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  return (
    <View className="home-container">
      {/* Header */}
      <View className="header">
        <Text className="logo">PlayForge</Text>
        <View className="header-actions">
          <View className="create-btn" onClick={handleCreateClick}>
            <Text className="create-icon">＋</Text>
            <Text className="create-text">创作</Text>
          </View>
          <View className="avatar" onClick={handleAvatarClick}>
            👤
          </View>
        </View>
      </View>

      <ScrollView
        className="scroll-view"
        scrollY
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={handleRefresh}
        onScrollToLower={handleLoadMore}
        lowerThreshold={200}>
        
        {/* Weekly Challenge Banner */}
        <View className="challenge-banner">
          <View className="challenge-content">
            <Text className="challenge-title">🏆 本周挑战：超级跳跃王</Text>
            <View className="challenge-meta">
              <Text className="meta-item">👥 45人参加</Text>
              <Text className="meta-item">⏰ 剩余3天</Text>
            </View>
          </View>
          <View className="challenge-action">参加→</View>
        </View>

        {/* Category Tabs */}
        <ScrollView className="tabs-container" scrollX>
          {CATEGORY_TABS.map((tab) =>
          <View
            key={tab}
            className={`tab-item ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}>
            
              <Text>{tab}</Text>
            </View>
          )}
        </ScrollView>

        {/* Games Grid */}
        <View className="games-grid">
          {filteredGames().map((game) =>
          <GameCard
            key={game.id}
            game={game}
            onPlay={handlePlay}
            onFork={handleFork} />

          )}
        </View>

        {/* Trending Creators Section */}
        <View className="creators-section">
          <Text className="section-title">🌟 热门创作者</Text>
          <ScrollView className="creators-scroll" scrollX>
            {CREATORS.map((creator) =>
            <View key={creator.id} className="creator-card">
                <View className="creator-emoji">{creator.emoji}</View>
                <Text className="creator-name">{creator.name}</Text>
                <Text className="creator-plays">
                  {formatNumber(creator.plays)} 次游玩
                </Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Loading indicator */}
        {isLoadingMore &&
        <View className="loading-indicator">
            <Text>加载中...</Text>
          </View>
        }

        <View className="bottom-spacer" />
      </ScrollView>

      {/* Custom TabBar */}
      <CustomTabBar activeIndex={0} />
    </View>);

}