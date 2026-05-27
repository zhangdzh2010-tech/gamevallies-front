import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { AppTopBar } from '../../components/common/AppTopBar';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { FloatingPlayer } from '../../components/common/FloatingPlayer';
import { PaywallPopup } from '../../components/common/PaywallPopup';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import { IcpFooter } from '../../components/common/IcpFooter';
import { SkeletonListRow } from '../../components/common/Skeleton';
import * as feedService from '../../services/feed';
import * as socialService from '../../services/social';
import useGamePlayerStore from '../../stores/gamePlayer';
import useQuotaStore from '../../stores/quotaStore';
import { LOGIN_PAGE_URL, isLoggedIn, setPostLoginRedirect } from '../../utils/authNavigation';
import { mergeBookmarkedFlags, setGameBookmarked, syncBookmarkWithBackend } from '../../utils/bookmarks';
import { getGameCoverUrl } from '../../utils/media';
import { getGameOrientation } from '../../utils/gameOrientation';
import { getSafeDisplayText } from '../../utils/profileDisplay';
import { buildGameDetailPath } from '../../utils/share';
import { getH5PageScrollContainer, resetH5PageScrollTop } from '../../utils/h5Scroll';
import { isH5Runtime, isWeappRuntime } from '../../utils/runtime';
import './index.scss';

const GAME_COLORS = ['#6e56ff', '#2dd4a8', '#fbbf24', '#ff5c8a', '#f97316', '#8b5cf6'];
const GAME_EMOJIS = ['🎮', '🚀', '🎲', '🎯', '🌟', '⚡', '🧩', '🕹️'];
const PAGE_LIMIT = 10;
const POSTER_COLUMN_COUNT = 2;
const HOME_PAGE_URL = '/pages/index/index';
const FRIENDS_REDIRECT_URL = '/pages/discover/index';

function normalizeGame(game, index) {
  return {
    ...game,
    plays: game.plays || game.playCount || 0,
    likes: game.likes || game.likeCount || 0,
    comments: game.comments || game.commentCount || 0,
    bookmarks: game.bookmarks || game.bookmarkCount || game.favoriteCount || game.favorites || 0,
    viewerHasLiked: game.viewerHasLiked === true || game.liked === true,
    viewerHasBookmarked: game.viewerHasBookmarked === true,
    canPlay: game.canPlay !== false,
    requireSubscription: game.requireSubscription === true || game.canPlay === false,
    emoji: game.emoji || GAME_EMOJIS[index % GAME_EMOJIS.length],
    color: game.color || GAME_COLORS[index % GAME_COLORS.length],
    author: getSafeDisplayText([
      game.authorDisplayName,
      game.author?.displayName,
      game.author?.nickname,
      game.author?.username,
      game.authorName,
      game.creatorName,
      typeof game.author === 'string' ? game.author : '',
    ], '创作者'),
  };
}

function buildPosterColumns(games, desiredColumnCount = POSTER_COLUMN_COUNT) {
  const columnCount = Math.min(desiredColumnCount, Math.max(games.length, 1));
  const columns = Array.from({ length: columnCount }, () => []);

  games.forEach((game, index) => {
    columns[index % columnCount].push(game);
  });

  return columns;
}

export default function FriendsPage() {
  const isH5 = isH5Runtime();
  const isWeapp = isWeappRuntime();
  const loggedIn = isLoggedIn();
  const [friendGames, setFriendGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(loggedIn);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const openGame = useGamePlayerStore((s) => s.openGame);
  const prevLoggedInRef = useRef(loggedIn);

  const fetchData = useCallback(async (pageNum = 1, append = false) => {
    if (!append) {
      setLoading(true);
    }

    try {
      if (!loggedIn) {
        setFriendGames([]);
        setHasMore(false);
        return;
      }

      const gamesRes = await feedService.getFollowingFeed(pageNum, PAGE_LIMIT);
      const items = mergeBookmarkedFlags((gamesRes?.items || []).map(normalizeGame));
      setFriendGames((prev) => (append ? [...prev, ...items] : items));
      setHasMore(gamesRes?.hasMore ?? items.length >= PAGE_LIMIT);
    } catch (error) {
      console.error('fetch friends feed error:', error);
      Taro.showToast({
        title: '加载朋友作品失败，请重试',
        icon: 'none',
      });
    } finally {
      setLoading(false);
    }
  }, [loggedIn]);

  useEffect(() => {
    setPage(1);
    setHasMore(loggedIn);
    void fetchData(1);
  }, [fetchData, loggedIn]);

  useDidShow(() => {
    setFriendGames((prev) => mergeBookmarkedFlags(prev));

    const nowLoggedIn = isLoggedIn();
    if (!prevLoggedInRef.current && nowLoggedIn) {
      void fetchData(1);
    }
    prevLoggedInRef.current = nowLoggedIn;
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await fetchData(1);
    setRefreshing(false);
  };

  const getH5ScrollContainer = useCallback(() => {
    return isH5 ? getH5PageScrollContainer() : null;
  }, [isH5]);

  const handleLoadMore = useCallback(async () => {
    if (!loggedIn || isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);
    const nextPage = page + 1;
    await fetchData(nextPage, true);
    setPage(nextPage);
    setIsLoadingMore(false);
  }, [fetchData, hasMore, isLoadingMore, loggedIn, page]);

  useEffect(() => {
    if (!isH5) {
      return undefined;
    }

    let ticking = false;
    const threshold = 320;

    const maybeLoadMore = () => {
      if (ticking) {
        return;
      }

      ticking = true;
      const runCheck = () => {
        ticking = false;
        const scrollContainer = getH5ScrollContainer();
        if (!scrollContainer) {
          return;
        }

        const remaining = scrollContainer.scrollHeight - (scrollContainer.scrollTop + scrollContainer.clientHeight);
        if (remaining <= threshold) {
          void handleLoadMore();
        }
      };

      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(runCheck);
      } else {
        runCheck();
      }
    };

    window.addEventListener('scroll', maybeLoadMore, { passive: true });
    document.addEventListener('scroll', maybeLoadMore, true);
    maybeLoadMore();

    return () => {
      window.removeEventListener('scroll', maybeLoadMore);
      document.removeEventListener('scroll', maybeLoadMore, true);
    };
  }, [getH5ScrollContainer, handleLoadMore, isH5]);

  useEffect(() => {
    if (!isH5 || typeof window === 'undefined') {
      return;
    }

    resetH5PageScrollTop();
  }, [isH5, loggedIn]);

  const handlePlay = (game) => {
    if (game.gameUrl) {
      const orientation = getGameOrientation(game);
      if (game.canPlay === false) {
        useQuotaStore.getState().openPaywall({
          gameId: game.id,
          gameUrl: game.gameUrl,
          gameTitle: game.title,
          gameCover: getGameCoverUrl(game),
          gameOrientation: orientation,
          resumePlay: true,
        });
        return;
      }

      openGame(game.gameUrl, game.title, getGameCoverUrl(game), {
        gameId: game.id,
        canPlay: game.canPlay !== false,
        orientation,
      });
      return;
    }

    Taro.navigateTo({ url: `/pages/game/detail/index?id=${game.id}` }).catch(() => {});
  };

  const handleComment = (game) => {
    Taro.navigateTo({ url: buildGameDetailPath(game.id, { openComment: 1 }) }).catch(() => {});
  };

  const handleOpenDetail = (game) => {
    Taro.navigateTo({ url: buildGameDetailPath(game.id) }).catch(() => {});
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

      setFriendGames((prev) => prev.map((game) => (
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
    setFriendGames((prev) => prev.map((game) => (
      game.id === targetGame.id
        ? { ...game, viewerHasBookmarked: nextBookmarked, bookmarks: nextBookmarks }
        : game
    )));
    Taro.showToast({
      title: nextBookmarked ? '已收藏' : '已取消收藏',
      icon: 'none',
    });
    syncBookmarkWithBackend(targetGame, nextBookmarked).catch(() => {});
    return { bookmarked: nextBookmarked, bookmarks: nextBookmarks };
  };

  const openLogin = () => {
    setPostLoginRedirect(FRIENDS_REDIRECT_URL);
    Taro.navigateTo({ url: LOGIN_PAGE_URL }).catch(() => {});
  };

  const openHome = () => {
    Taro.switchTab({ url: HOME_PAGE_URL }).catch(() => {
      Taro.navigateTo({ url: HOME_PAGE_URL }).catch(() => {});
    });
  };

  const posterColumns = buildPosterColumns(friendGames);

  return (
    <View className={`follow-page${isH5 ? ' follow-page--h5' : ''}${isWeapp ? ' follow-page--weapp' : ''}`}>
      <AppTopBar />
      <View className="follow-shell">
        <PageScrollContainer
          className="follow-content"
          refresherEnabled
          refresherTriggered={refreshing}
          onRefresherRefresh={handleRefresh}
          onScrollToLower={handleLoadMore}
          lowerThreshold={300}
        >
          <View className="friends-feed">
            <Text className="friends-feed__title">朋友作品</Text>

            {loading ? (
              <SkeletonListRow rows={4} />
            ) : !loggedIn ? (
              <View className="empty-state">
                <Text className="empty-icon">👋</Text>
                <Text className="empty-title">登录后查看朋友作品</Text>
                <Text className="empty-text">
                  这里只展示你已关注创作者最近发布和更新的作品。
                </Text>
                <View className="empty-action" onClick={openLogin}>
                  <Text>去登录</Text>
                </View>
              </View>
            ) : friendGames.length === 0 ? (
              <View className="empty-state">
                <Text className="empty-icon">✨</Text>
                <Text className="empty-title">还没有朋友作品</Text>
                <Text className="empty-text">
                  先去首页关注你感兴趣的创作者，这里就会自动展示他们的作品。
                </Text>
                <View className="empty-action" onClick={openHome}>
                  <Text>去首页看看</Text>
                </View>
              </View>
            ) : (
              <View className="waterfall">
                {posterColumns.map((column, columnIndex) => (
                  <View key={`friends-col-${columnIndex}`} className="waterfall-col">
                    {column.map((game) => (
                      <View key={game.id} className="waterfall-item">
                        <GameCard
                          game={game}
                          variant="home-showcase"
                          showAuthorInInfo
                          onPlay={handlePlay}
                          onComment={handleComment}
                          onOpenDetail={handleOpenDetail}
                          showDetailEntry
                          onToggleLike={handleToggleLike}
                          onToggleBookmark={handleToggleBookmark}
                        />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </View>

          {isLoadingMore && (
            <View className="load-more">
              <Text className="load-more-text">加载中...</Text>
            </View>
          )}

          {!hasMore && friendGames.length > 0 && (
            <View className="load-more">
              <Text className="load-more-end">- 已经到底了 -</Text>
            </View>
          )}

          <IcpFooter />
          <View className="bottom-spacer" />
        </PageScrollContainer>
      </View>

      <CustomTabBar activeIndex={1} />
      <GlobalGamePlayer />
      <FloatingPlayer />
      <PaywallPopup />
    </View>
  );
}
