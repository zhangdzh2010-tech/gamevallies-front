import { useState, useCallback, useEffect, useRef } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, ScrollView } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
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
    emoji: game.emoji || GAME_EMOJIS[index % GAME_EMOJIS.length],
    color: game.color || GAME_COLORS[index % GAME_COLORS.length],
    author: game.author?.displayName || game.author?.username || game.author || '创作者',
    isHot: (game.plays || game.playCount || 0) > 5000,
  };
}

export default function Home() {
  const navigation = useNavigation();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [games, setGames] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [challenge, setChallenge] = useState(null);

  const fetchGames = useCallback(async (pageNum, append = false) => {
    if (!append) setLoadingGames(true);
    setLoadError(false);
    try {
      const result = await feedService.getTrending(pageNum, 10);
      const items = (result?.items || []).map(normalizeGame);
      setGames((prev) => append ? [...prev, ...items] : items);
      setHasMore(result?.hasMore ?? items.length >= 10);
    } catch (e) {
      console.error('fetchGames error:', e);
      setLoadError(true);
      Taro.showToast({ title: '加载失败，请下拉刷新重试', icon: 'none', duration: 3000 });
    } finally {
      setLoadingGames(false);
    }
  }, []);

  useEffect(() => {
    fetchGames(1);
    feedService.getCurrentChallenge().then((data) => {
      if (data) setChallenge(data);
    }).catch(() => {});
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await fetchGames(1);
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    await fetchGames(nextPage, true);
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

  const handleChallengeJoin = () => {
    const targetId = challenge?.gameId || challenge?.id;
    if (targetId) {
      navigation.push({ url: `/pages/game/detail/index?id=${targetId}` });
    } else {
      Taro.showToast({ title: '挑战暂未开放，敬请期待', icon: 'none' });
    }
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
      {/* Header - logo + game count */}
      <View className="header">
        <Text className="logo">智了空间</Text>
        <View className="header-stats">
          <Text className="header-count">AI驱动的游戏创作平台</Text>
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
        <View className="challenge-banner" onClick={handleChallengeJoin}>
          <View className="challenge-content">
            <Text className="challenge-title">
              🏆 {challenge ? `本周挑战：${challenge.title || challenge.name}` : '本周挑战：超级跳跃王'}
            </Text>
            <View className="challenge-meta">
              <Text className="meta-item">👥 {challenge?.participantCount ?? 45}人参加</Text>
              <Text className="meta-item">⏰ {challenge?.daysLeft != null ? `剩余${challenge.daysLeft}天` : '剩余3天'}</Text>
            </View>
          </View>
          <View className="challenge-action">参加→</View>

        </View>

        {/* Waterfall Layout */}
        {loadingGames ? (
          <View className="loading-state">
            <Text className="loading-text">加载中...</Text>
          </View>
        ) : loadError ? (
          <View className="loading-state">
            <Text className="loading-text">加载失败</Text>
            <View className="retry-btn" onClick={() => fetchGames(1)}>
              <Text className="retry-text">重试</Text>
            </View>
          </View>
        ) : (
          <View className="waterfall">
            <View className="waterfall-col">
              {leftCol.map((game) =>
                <GameCard key={game.id} game={game} onPlay={handlePlay} />
              )}
            </View>
            <View className="waterfall-col">
              {rightCol.map((game) =>
                <GameCard key={game.id} game={game} onPlay={handlePlay} />
              )}
            </View>
          </View>
        )}

        {/* Loading more */}
        {isLoadingMore &&
          <View className="loading-indicator">
            <Text className="loading-text">加载中...</Text>
          </View>
        }
        {!hasMore && games.length > 0 &&
          <View className="loading-indicator">
            <Text className="end-text">— 已经到底了 —</Text>
          </View>
        }

        <View className="bottom-spacer" />
      </ScrollView>

      <CustomTabBar activeIndex={0} />
      <GlobalGamePlayer />
    </View>
  );
}
