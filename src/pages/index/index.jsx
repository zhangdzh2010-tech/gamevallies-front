import CreativeHome from '../../components/creative-web/CreativeHome';
import { useState, useCallback, useEffect, useRef } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { View, Text, ScrollView } from '@tarojs/components';
import { AppTopBar } from '../../components/common/AppTopBar';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { FloatingPlayer } from '../../components/common/FloatingPlayer';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import { IcpFooter } from '../../components/common/IcpFooter';
import { SkeletonFeedGrid } from '../../components/common/Skeleton';
import { openCreatePageWithAuth } from '../../utils/authNavigation';
import * as feedService from '../../services/feed';
import * as socialService from '../../services/social';
import useGamePlayerStore from '../../stores/gamePlayer';
import useQuotaStore from '../../stores/quotaStore';
import { Storage } from '../../utils/storage';
import { PaywallPopup } from '../../components/common/PaywallPopup';
import { mergeBookmarkedFlags, setGameBookmarked, syncBookmarkWithBackend } from '../../utils/bookmarks';
import {
  buildGameTypeTabs,
  fetchGameTypeOptions,
  normalizeGameTypeKey,
} from '../../utils/gameTypes';
import { getGameCoverUrl } from '../../utils/media';
import { getGameOrientation } from '../../utils/gameOrientation';
import { buildGameDetailPath } from '../../utils/share';
import { getSafeDisplayText } from '../../utils/profileDisplay';
import { getH5PageScrollContainer, resetH5PageScrollTop } from '../../utils/h5Scroll';
import { isH5Runtime, isWeappRuntime } from '../../utils/runtime';
import './index.scss';

const GAME_COLORS = ['#6e56ff', '#2dd4a8', '#fbbf24', '#ff5c8a', '#f97316', '#8b5cf6', '#06b6d4', '#ec4899'];
const GAME_EMOJIS = ['🎮', '🧩', '✨', '🚀', '🎯', '🎨', '🤖', '🪐', '🏆', '🔥'];
const PAGE_LIMIT = 10;
const FEED_CACHE_TTL_MS = 60 * 1000;

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
    canPlay: game.canPlay !== false,
    requireSubscription: game.requireSubscription === true || game.canPlay === false,
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

function LegacyHome() {
  const isH5 = isH5Runtime();
  const isWeapp = isWeappRuntime();
  const homeRef = useRef(null);
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
  // Per-type in-memory cache keeps user-switched feeds instant. Entries older than
  // FEED_CACHE_TTL_MS are treated as stale and refreshed in the background while
  // the cached items are rendered immediately to avoid the snap-to-loading flicker.
  const feedCacheRef = useRef(new Map());

  const setCachedFeed = useCallback((typeKey, data) => {
    feedCacheRef.current.set(typeKey, {
      ...data,
      timestamp: Date.now(),
    });
  }, []);

  const getCachedFeed = useCallback((typeKey) => {
    const entry = feedCacheRef.current.get(typeKey);
    if (!entry) return null;
    return entry;
  }, []);

  const fetchGames = useCallback(async (pageNum, append = false, typeKey = 'all') => {
    if (!append) {
      setLoadingGames(true);
    }
    setLoadError(false);

    try {
      const result = typeKey === 'all'
        ? await feedService.getTrending(pageNum, PAGE_LIMIT)
        : await feedService.getGamesByType(typeKey, pageNum, PAGE_LIMIT);
      const items = mergeBookmarkedFlags((result?.items || []).map(normalizeGame));
      const nextHasMore = result?.hasMore ?? items.length >= PAGE_LIMIT;
      setGames((prev) => {
        const nextItems = append ? [...prev, ...items] : items;
        setCachedFeed(typeKey, {
          items: nextItems,
          page: pageNum,
          hasMore: nextHasMore,
        });
        return nextItems;
      });
      setHasMore(nextHasMore);
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
  }, [setCachedFeed]);

  useEffect(() => {
    fetchGames(1, false, 'all');
    if (Storage.getToken()) {
      useQuotaStore.getState().fetchQuota();
    }
  }, [fetchGames]);

  const getH5ScrollContainer = useCallback(() => {
    return isH5 ? getH5PageScrollContainer() : null;
  }, [isH5]);

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

  useEffect(() => {
    if (!isH5 || typeof document === 'undefined') {
      return undefined;
    }

    const home = homeRef.current;
    const pageElement = home?.closest?.('.taro_page') || document.querySelector('.taro_page.taro_page_show');
    const panel = pageElement?.closest?.('.taro-tabbar__panel');
    const container = panel?.closest?.('.taro-tabbar__container');
    const html = document.documentElement;
    const body = document.body;

    const previousStyles = new Map();
    [
      [html, { overflow: html.style.overflow }],
      [body, { overflow: body.style.overflow }],
      [container, { overflow: container?.style.overflow }],
      [panel, { overflow: panel?.style.overflow }],
      [pageElement, { overflow: pageElement?.style.overflow, height: pageElement?.style.height, minHeight: pageElement?.style.minHeight }],
      [home, { height: home?.style.height, minHeight: home?.style.minHeight, overflow: home?.style.overflow }],
    ].forEach(([element, styles]) => {
      if (element) {
        previousStyles.set(element, styles);
      }
    });

    html.style.overflow = 'auto';
    body.style.overflow = 'auto';
    if (container) {
      container.style.overflow = 'visible';
    }
    if (panel) {
      panel.style.overflow = 'visible';
    }
    if (pageElement) {
      pageElement.style.overflow = 'visible';
      pageElement.style.height = 'auto';
      pageElement.style.minHeight = '100vh';
    }
    if (home) {
      home.style.height = 'auto';
      home.style.minHeight = '100vh';
      home.style.overflow = 'visible';
    }

    return () => {
      previousStyles.forEach((styles, element) => {
        Object.entries(styles).forEach(([key, value]) => {
          element.style[key] = value || '';
        });
      });
    };
  }, [isH5]);

  useEffect(() => {
    if (!isH5) {
      return undefined;
    }

    const scrollContainer = getH5ScrollContainer();
    if (!scrollContainer) {
      return undefined;
    }

    resetH5PageScrollTop();
    return undefined;
  }, [getH5ScrollContainer, isH5]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await fetchGames(1, false, activeType);
    setRefreshing(false);
  };

  const handleLoadMore = useCallback(async () => {
    if (loadingGames || isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);
    const nextPage = page + 1;
    await fetchGames(nextPage, true, activeType);
    setPage(nextPage);
    setIsLoadingMore(false);
  }, [activeType, fetchGames, hasMore, isLoadingMore, loadingGames, page]);

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
          handleLoadMore();
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

  const handleTypeChange = async (typeKey) => {
    if (typeKey === activeType) {
      return;
    }

    setActiveType(typeKey);

    // #1 切换类型时滚回顶部
    if (isH5) {
      resetH5PageScrollTop();
    } else {
      Taro.pageScrollTo({ scrollTop: 0, duration: 200 }).catch(() => {});
    }

    const cached = getCachedFeed(typeKey);
    const isFresh = cached && Date.now() - cached.timestamp < FEED_CACHE_TTL_MS;

    if (cached) {
      // Render cached items immediately so the tab switch feels instant even on slow networks.
      setGames(mergeBookmarkedFlags(cached.items || []));
      setPage(cached.page || 1);
      setHasMore(Boolean(cached.hasMore));
      setLoadingGames(false);
      setLoadError(false);

      if (isFresh) {
        return;
      }

      // Stale cache: revalidate in the background without flashing the loading state.
      fetchGames(1, false, typeKey).catch(() => {});
      return;
    }

    setPage(1);
    setHasMore(true);
    await fetchGames(1, false, typeKey);
  };

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

    Taro.navigateTo({ url: `/pages/game/detail/index?id=${game.id}` });
  };

  const handleComment = (game) => {
    Taro.navigateTo({ url: buildGameDetailPath(game.id, { openComment: 1 }) });
  };

  const handleOpenDetail = (game) => {
    Taro.navigateTo({ url: buildGameDetailPath(game.id) });
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
    syncBookmarkWithBackend(targetGame, nextBookmarked).catch(() => {});
    return { bookmarked: nextBookmarked, bookmarks: nextBookmarks };
  };

  const handleCreateClick = () => {
    openCreatePageWithAuth();
  };

  const activeTypeLabel = gameTypeTabs.find((tab) => tab.key === activeType)?.label || '全部';
  const feedSectionEyebrow = activeType === 'all' ? '精选推荐' : activeTypeLabel;
  const feedSectionTitle = activeType === 'all'
    ? '这一批值得一玩'
    : `${activeTypeLabel}里的精选作品`;
  const heroGames = games.slice(0, 3);
  // Real masonry distribution: greedily place each card into the currently shortest
  // column using an estimated pixel height. Falls back to round-robin when items
  // have identical weight so output stays deterministic.
  const posterColumns = [[], [], []];
  const posterColumnHeights = [0, 0, 0];
  const estimateCardHeight = (game) => {
    // Image area is fixed aspect-ratio (11:15) relative to column width; using a
    // nominal column width of 100 so the relative ordering is what matters.
    const imageHeight = Math.round(100 * (15 / 11));
    const titleChars = (game?.title || '').length;
    // Chinese characters wrap faster than latin glyphs; cap to 2 visible lines.
    const titleLines = Math.min(2, Math.max(1, Math.ceil(titleChars / 12)));
    const titleHeight = titleLines * 22 + 28; // line-height + info padding
    const subtitleHeight = game?.author?.username ? 20 : 0;
    return imageHeight + titleHeight + subtitleHeight;
  };
  games.forEach((game) => {
    const weight = estimateCardHeight(game);
    let targetIndex = 0;
    let shortest = posterColumnHeights[0];
    for (let i = 1; i < posterColumnHeights.length; i += 1) {
      if (posterColumnHeights[i] < shortest) {
        shortest = posterColumnHeights[i];
        targetIndex = i;
      }
    }
    posterColumns[targetIndex].push(game);
    posterColumnHeights[targetIndex] += weight;
  });
  const [leftPosterGames, middlePosterGames, rightPosterGames] = posterColumns;
  const heroBadges = heroGames.map((game, index) => ({
    id: game.id,
    tag: index === 0 ? '灵感推荐' : index === 1 ? '轻量上手' : '正在升温',
    title: game.title,
  }));

  const feedContent = (
    <>
      <View className="home-stage">
        <View className="home-ribbon">
          <View className="home-ribbon__brand">
            <View className="home-ribbon__brand-icon" />
          </View>
          <View className="home-ribbon__center">
            <Text className="home-ribbon__eyebrow">AI 游戏工坊</Text>
            <Text className="home-ribbon__title">{activeType === 'all' ? '灵感剧场' : activeTypeLabel}</Text>
          </View>
          <View className="home-ribbon__pulse">
            <View className="home-ribbon__pulse-dot" />
            <Text className="home-ribbon__pulse-text">在创作</Text>
          </View>
        </View>

        <View className="challenge-banner" onClick={handleCreateClick}>
          <View className="challenge-noise" />
          <View className="challenge-content">
            <View className="challenge-header-row">
              <View className="challenge-kicker-wrap">
                <View className="challenge-kicker-dot" />
                <Text className="challenge-kicker">AI 创作</Text>
              </View>
              <View className="challenge-floating-tag">
                <Text className="challenge-floating-tag__text">新想法</Text>
              </View>
            </View>

            <Text className="challenge-title">把脑海里的想法，马上做出来</Text>
            <Text className="challenge-desc">
              用 AI 把脑子里的点子、玩法和画面一起做成游戏，几分钟就能做出能玩的第一版。
            </Text>

            <View className="challenge-footer-row">
              <View className="challenge-action">
                <Text className="challenge-action__text">现在开始</Text>
              </View>
              <View className="challenge-subcopy">
                <Text className="challenge-subcopy__label">当前焦点</Text>
                <Text className="challenge-subcopy__value">{activeTypeLabel}</Text>
              </View>
            </View>
          </View>

          <View className="challenge-visual">
            <View className="challenge-planet">
              <View className="challenge-planet__ring" />
              <View className="challenge-planet__core">
                <View className="challenge-planet__icon" />
              </View>
            </View>

            {heroBadges.length > 0 ? (
              <View className="challenge-mini-stack">
                {heroBadges.map((badge, index) => (
                  <View
                    key={badge.id}
                    className={`challenge-mini-card challenge-mini-card--${index === 0 ? 'primary' : 'secondary'}`}
                  >
                    <Text className="challenge-mini-card__tag">{badge.tag}</Text>
                    <Text className="challenge-mini-card__title">{badge.title}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
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

      <View className="feed-section-header">
        <View className="feed-section-header__copy">
          <Text className="feed-section-header__eyebrow">{feedSectionEyebrow}</Text>
          <Text className="feed-section-header__title">{feedSectionTitle}</Text>
        </View>
        <View className="feed-section-header__meta" onClick={handleRefresh}>
          <Text className="feed-section-header__meta-value">{games.length > 0 ? `共 ${games.length} 款` : '刷新'}</Text>
          <Text className="feed-section-header__meta-label">{games.length > 0 ? '点击刷新' : '重新加载'}</Text>
        </View>
      </View>

      {loadingGames ? (
        <SkeletonFeedGrid rows={4} columns={3} />
      ) : loadError ? (
        <View className="loading-state">
          <Text className="loading-text">加载失败</Text>
          <View className="retry-btn" onClick={() => fetchGames(1, false, activeType)}>
            <Text className="retry-text">重试</Text>
          </View>
        </View>
      ) : games.length === 0 ? (
        <View className="loading-state loading-state--empty">
          <Text className="loading-text">还没有作品。点击上方“现在开始”，做你的第一款作品。</Text>
        </View>
      ) : (
        <View className="poster-waterfall">
          <View className="poster-waterfall__col">
            {leftPosterGames.map((game) => (
              <View key={game.id} className="poster-waterfall__item">
                <GameCard
                  game={game}
                  variant="home-showcase"
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
          <View className="poster-waterfall__col">
            {middlePosterGames.map((game) => (
              <View key={game.id} className="poster-waterfall__item">
                <GameCard
                  game={game}
                  variant="home-showcase"
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
          <View className="poster-waterfall__col">
            {rightPosterGames.map((game) => (
              <View key={game.id} className="poster-waterfall__item">
                <GameCard
                  game={game}
                  variant="home-showcase"
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

      <IcpFooter />
      <View className="bottom-spacer" />
    </>
  );

  return (
    <View
      ref={homeRef}
      className={`home-container${isH5 ? ' home-container--h5' : ''}${isWeapp ? ' home-container--weapp' : ''}`}
    >
      <AppTopBar />

      <PageScrollContainer
        className={isH5 ? 'home-content home-content--h5' : 'scroll-view'}
        scrollY
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={handleRefresh}
        onScrollToLower={handleLoadMore}
        lowerThreshold={300}
      >
        {feedContent}
      </PageScrollContainer>

      <CustomTabBar activeIndex={0} />
      <GlobalGamePlayer />
      <FloatingPlayer />
      <PaywallPopup />
    </View>
  );
}


export default function Home() {
  return isH5Runtime() ? <CreativeHome /> : <LegacyHome />;
}
