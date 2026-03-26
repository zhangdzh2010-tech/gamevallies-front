import { useState, useCallback, useEffect } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { View, Text, ScrollView } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import { AppTopBar } from '../../components/common/AppTopBar';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { FloatingPlayer } from '../../components/common/FloatingPlayer';
import { openCreatePageWithAuth } from '../../utils/authNavigation';
import * as feedService from '../../services/feed';
import * as socialService from '../../services/social';
import useGamePlayerStore from '../../stores/gamePlayer';
import useQuotaStore from '../../stores/quotaStore';
import { Storage } from '../../utils/storage';
import { PaywallPopup } from '../../components/common/PaywallPopup';
import { mergeBookmarkedFlags, setGameBookmarked } from '../../utils/bookmarks';
import {
  buildGameTypeTabs,
  fetchGameTypeOptions,
  normalizeGameTypeKey,
} from '../../utils/gameTypes';
import { buildGameDetailPath } from '../../utils/share';
import { getSafeDisplayText } from '../../utils/profileDisplay';
import './index.scss';

const GAME_COLORS = ['#6e56ff', '#2dd4a8', '#fbbf24', '#ff5c8a', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899'];
const GAME_EMOJIS = ['🎮', '🕹️', '🎲', '🎯', '🚀', '🌟', '⚡', '🧩', '🎨', '🎉'];

function normalizeGame(game, index) {
  return {
    ...game,
    plays: game.plays || game.playCount || 0,
    likes: game.likes || game.likeCount || 0,
    comments: game.comments || game.commentCount || 0,
    bookmarks: game.bookmarks || game.bookmarkCount || game.favoriteCount || game.favorites || 0,
    gameType: normalizeGameTypeKey(game.type || game.gameType || game.category || ''),
    viewerHasLiked: game.viewerHasLiked === true || game.liked === true,
    viewerHasBookmarked: game.viewerHasBookmarked === true,
    emoji: game.emoji || GAME_EMOJIS[index % GAME_EMOJIS.length],
    color: game.color || GAME_COLORS[index % GAME_COLORS.length],
    author: getSafeDisplayText([
      game.author?.displayName,
      game.author?.nickname,
      game.author?.username,
      game.authorName,
      game.creatorName,
      typeof game.author === 'string' ? game.author : '',
    ], '创作者'),
    isHot: (game.plays || game.playCount || 0) > 5000,
  };
}

export default function Home() {
  const isH5 = process.env.TARO_ENV === 'h5';
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const navigation = useNavigation();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [games, setGames] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingGames, setLoadingGames] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeType, setActiveType] = useState('all');
  const [gameTypeTabs, setGameTypeTabs] = useState(() => buildGameTypeTabs());

  const fetchGames = useCallback(async (pageNum, append = false, typeKey = 'all') => {
    if (!append) {
      setLoadingGames(true);
    }
    setLoadError(false);

    try {
      const result = typeKey === 'all'
        ? await feedService.getTrending(pageNum, 10)
        : await feedService.getGamesByType(typeKey, pageNum, 10);
      const items = mergeBookmarkedFlags((result?.items || []).map(normalizeGame));
      setGames((prev) => (append ? [...prev, ...items] : items));
      setHasMore(result?.hasMore ?? items.length >= 10);
    } catch (error) {
      console.error('fetchGames error:', error);
      setLoadError(true);
      Taro.showToast({
        title: '加载失败，请下拉刷新重试',
        icon: 'none',
        duration: 3000,
      });
    } finally {
      setLoadingGames(false);
    }
  }, []);

  useEffect(() => {
    fetchGames(1, false, 'all');
    if (Storage.getToken()) {
      useQuotaStore.getState().fetchQuota();
    }
  }, [fetchGames]);

  useEffect(() => {
    let active = true;

    fetchGameTypeOptions().then((options) => {
      if (!active) {
        return;
      }

      setGameTypeTabs(buildGameTypeTabs(options));
    });

    return () => {
      active = false;
    };
  }, []);

  useDidShow(() => {
    setGames((prev) => mergeBookmarkedFlags(prev));
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await fetchGames(1, false, activeType);
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);
    const nextPage = page + 1;
    await fetchGames(nextPage, true, activeType);
    setPage(nextPage);
    setIsLoadingMore(false);
  };

  const handleTypeChange = async (typeKey) => {
    if (typeKey === activeType) {
      return;
    }

    setActiveType(typeKey);
    setPage(1);
    setHasMore(true);
    await fetchGames(1, false, typeKey);
  };

  const handlePlay = (game) => {
    if (game.gameUrl) {
      openGame(game.gameUrl, game.title, game.coverUrl || game.thumbnailUrl || '', {
        gameId: game.id,
      });
      return;
    }

    navigation.push({ url: `/pages/game/detail/index?id=${game.id}` });
  };

  const handleComment = (game) => {
    navigation.push({ url: buildGameDetailPath(game.id, { openComment: 1 }) });
  };

  const handleOpenDetail = (game) => {
    navigation.push({ url: buildGameDetailPath(game.id) });
  };

  const handleToggleLike = async (targetGame) => {
    try {
      const result = await socialService.likeGame('game', targetGame.id);
      const nextLiked = typeof result?.liked === 'boolean'
        ? result.liked
        : !targetGame.viewerHasLiked;
      const nextLikes = Number.isFinite(Number(result?.likes))
        ? Number(result.likes)
        : Math.max(0, (Number(targetGame.likes) || 0) + (nextLiked ? 1 : -1));

      setGames((prev) => prev.map((game) => (
        game.id === targetGame.id
          ? { ...game, likes: nextLikes, viewerHasLiked: nextLiked }
          : game
      )));

      return { liked: nextLiked, likes: nextLikes };
    } catch (error) {
      Taro.showToast({
        title: error?.message || '点赞失败，请重试',
        icon: 'none',
      });
      throw error;
    }
  };

  const handleToggleBookmark = async (targetGame) => {
    const nextBookmarked = !targetGame.viewerHasBookmarked;
    const nextBookmarks = Math.max(0, (Number(targetGame.bookmarks) || 0) + (nextBookmarked ? 1 : -1));
    setGameBookmarked(targetGame, nextBookmarked);
    setGames((prev) => prev.map((game) => (
      game.id === targetGame.id
        ? { ...game, viewerHasBookmarked: nextBookmarked, bookmarks: nextBookmarks }
        : game
    )));
    Taro.showToast({
      title: nextBookmarked ? '已加入收藏' : '已取消收藏',
      icon: 'none',
    });
    return { bookmarked: nextBookmarked, bookmarks: nextBookmarks };
  };

  const handleCreateClick = () => {
    openCreatePageWithAuth();
  };

  const leftCol = [];
  const rightCol = [];

  games.forEach((game, index) => {
    if (index % 2 === 0) {
      leftCol.push(game);
    } else {
      rightCol.push(game);
    }
  });

  return (
    <View className={`home-container${isH5 ? ' home-container--h5' : ''}${isWeapp ? ' home-container--weapp' : ''}`}>
      <AppTopBar />

      <ScrollView
        className="scroll-view"
        scrollY
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={handleRefresh}
        onScrollToLower={handleLoadMore}
        lowerThreshold={300}
      >
        <View className="challenge-banner" onClick={handleCreateClick}>
          <View className="challenge-header-row">
            <Text className="challenge-kicker">AI创作</Text>
            <View className="challenge-action">现在开始</View>
          </View>
          <View className="challenge-content">
            <Text className="challenge-title">把脑海里的想法，马上做出来</Text>
            <Text className="challenge-desc">AI帮你把灵感变成现实</Text>
          </View>
        </View>

        <ScrollView className="type-tabs-scroll" scrollX showScrollbar={false}>
          <View className="type-tabs">
            {gameTypeTabs.map((tab) => (
              <View
                key={tab.key}
                className={`type-tab ${activeType === tab.key ? 'active' : ''}`}
                onClick={() => handleTypeChange(tab.key)}
              >
                <Text className={`type-tab__label ${activeType === tab.key ? 'active' : ''}`}>
                  {tab.label}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        {loadingGames ? (
          <View className="loading-state">
            <Text className="loading-text">加载中...</Text>
          </View>
        ) : loadError ? (
          <View className="loading-state">
            <Text className="loading-text">加载失败</Text>
            <View className="retry-btn" onClick={() => fetchGames(1, false, activeType)}>
              <Text className="retry-text">重试</Text>
            </View>
          </View>
        ) : (
          <View className="waterfall">
            <View className="waterfall-col">
              {leftCol.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  variant="play-only"
                  onPlay={handlePlay}
                  onComment={handleComment}
                  onOpenDetail={handleOpenDetail}
                  showDetailEntry
                  onToggleLike={handleToggleLike}
                  onToggleBookmark={handleToggleBookmark}
                />
              ))}
            </View>
            <View className="waterfall-col">
              {rightCol.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  variant="play-only"
                  onPlay={handlePlay}
                  onComment={handleComment}
                  onOpenDetail={handleOpenDetail}
                  showDetailEntry
                  onToggleLike={handleToggleLike}
                  onToggleBookmark={handleToggleBookmark}
                />
              ))}
            </View>
          </View>
        )}

        {isLoadingMore && (
          <View className="loading-indicator">
            <Text className="loading-text">加载中...</Text>
          </View>
        )}

        {!hasMore && games.length > 0 && (
          <View className="loading-indicator">
            <Text className="end-text">- 已经到底了 -</Text>
          </View>
        )}

        <View className="bottom-spacer" />
      </ScrollView>

      <CustomTabBar activeIndex={0} />
      <GlobalGamePlayer />
      <FloatingPlayer />
      <PaywallPopup />
    </View>
  );
}
