import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView } from
'@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import * as feedService from '../../services/feed';
import useGamePlayerStore from '../../stores/gamePlayer';
import './index.scss';

const GAME_COLORS = ['#6e56ff', '#2dd4a8', '#fbbf24', '#ff5c8a', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899'];
const GAME_EMOJIS = ['🎮', '🚀', '🎵', '💎', '🐦', '🎣', '🧩', '🎯', '⚔️', '🏰'];

function normalizeGame(game, index) {
  return {
    ...game,
    plays: game.plays || game.playCount || 0,
    likes: game.likes || game.likeCount || 0,
    forks: game.forks || game.forkCount || 0,
    emoji: game.emoji || GAME_EMOJIS[index % GAME_EMOJIS.length],
    color: game.color || GAME_COLORS[index % GAME_COLORS.length],
    author: game.author?.displayName || game.author?.username || game.author || '创作者',
    authorEmoji: game.authorEmoji || '👤',
    isHot: (game.plays || game.playCount || 0) > 5000,
  };
}

export default function Home() {
  const navigation = useNavigation();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const [activeTab, setActiveTab] = useState('推荐');
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [games, setGames] = useState([]);
  const [creators, setCreators] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const scrollViewRef = useRef(null);

  const CATEGORY_TABS = ['推荐', '✨ 最新', '🧩 益智', '🎯 动作', '🎲 休闲'];

  const fetchGames = useCallback(async (tab, pageNum, append = false) => {
    try {
      let result;
      if (tab === '推荐') result = await feedService.getTrending(pageNum, 10);
      else if (tab === '✨ 最新') result = await feedService.getLatest(pageNum, 10);
      else if (tab === '🧩 益智') result = await feedService.searchGames('', { gameType: 'puzzle', page: pageNum, limit: 10 });
      else if (tab === '🎯 动作') result = await feedService.searchGames('', { gameType: 'action', page: pageNum, limit: 10 });
      else if (tab === '🎲 休闲') result = await feedService.searchGames('', { gameType: 'casual', page: pageNum, limit: 10 });
      const items = (result?.items || []).map(normalizeGame);
      setGames((prev) => append ? [...prev, ...items] : items);
      setHasMore(result?.hasMore ?? items.length >= 10);
    } catch (e) {
      console.error('fetchGames error:', e);
    }
  }, []);

  const fetchCreators = useCallback(async () => {
    try {
      const result = await feedService.getTrendingCreators(5);
      setCreators(result?.items || []);
    } catch (e) {
      console.error('fetchCreators error:', e);
    }
  }, []);

  useEffect(() => {
    fetchGames(activeTab, 1);
    fetchCreators();
  }, []);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1);
    setHasMore(true);
    setGames([]);
    fetchGames(tab, 1);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await fetchGames(activeTab, 1);
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    await fetchGames(activeTab, nextPage, true);
    setPage(nextPage);
    setIsLoadingMore(false);
  };

  const handlePlay = (game) => {
    if (game.gameUrl) {
      openGame(game.gameUrl, game.title);
    } else {
      navigation.push({ url: `/pages/game/detail/index?id=${game.id}` });
    }
  };

  const handleFork = (gameId) => {
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

  // Split into two columns for waterfall
  const leftCol = [];
  const rightCol = [];
  games.forEach((g, i) => {
    if (i % 2 === 0) leftCol.push(g);
    else rightCol.push(g);
  });

  return (
    <View className="home-container">
      {/* Header */}
      <View className="header">
        <Text className="logo">创游谷</Text>
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
        lowerThreshold={300}>

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
            onClick={() => handleTabChange(tab)}>

              <Text>{tab}</Text>
            </View>
          )}
        </ScrollView>

        {/* Waterfall Layout */}
        <View className="waterfall">
          <View className="waterfall-col">
            {leftCol.map((game) =>
              <GameCard key={game.id} game={game} onPlay={handlePlay} onFork={handleFork} />
            )}
          </View>
          <View className="waterfall-col">
            {rightCol.map((game) =>
              <GameCard key={game.id} game={game} onPlay={handlePlay} onFork={handleFork} />
            )}
          </View>
        </View>

        {/* Trending Creators Section */}
        <View className="creators-section">
          <Text className="section-title">🌟 热门创作者</Text>
          <ScrollView className="creators-scroll" scrollX>
            {creators.map((creator) =>
            <View key={creator.id} className="creator-card">
                <View className="creator-emoji">{creator.avatar || '👤'}</View>
                <Text className="creator-name">{creator.username || creator.name}</Text>
                <Text className="creator-plays">
                  {formatNumber(creator.gamesCount || creator.plays || 0)} 次游玩
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
        {!hasMore && games.length > 0 &&
        <View className="loading-indicator">
            <Text style={{color: '#555'}}>— 已经到底了 —</Text>
          </View>
        }

        <View className="bottom-spacer" />
      </ScrollView>

      {/* Custom TabBar */}
      <CustomTabBar activeIndex={0} />
    </View>);

}
