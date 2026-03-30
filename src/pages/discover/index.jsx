import { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { AppTopBar } from '../../components/common/AppTopBar';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { FloatingPlayer } from '../../components/common/FloatingPlayer';
import { PaywallPopup } from '../../components/common/PaywallPopup';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import * as feedService from '../../services/feed';
import * as socialService from '../../services/social';
import useGamePlayerStore from '../../stores/gamePlayer';
import { LOGIN_PAGE_URL, isLoggedIn, setPostLoginRedirect } from '../../utils/authNavigation';
import { mergeBookmarkedFlags, setGameBookmarked } from '../../utils/bookmarks';
import { getGameCoverUrl } from '../../utils/media';
import { getGameOrientation } from '../../utils/gameOrientation';
import { buildGameDetailPath } from '../../utils/share';
import { Storage } from '../../utils/storage';
import { getAvatarFallback, getSafeDisplayText, normalizeAvatarSource } from '../../utils/profileDisplay';
import { getH5PageScrollContainer, resetH5PageScrollTop } from '../../utils/h5Scroll';
import { isH5Runtime, isWeappRuntime } from '../../utils/runtime';
import './index.scss';

const GAME_COLORS = ['#6e56ff', '#2dd4a8', '#fbbf24', '#ff5c8a', '#f97316', '#8b5cf6'];
const GAME_EMOJIS = ['\ud83c\udfae', '\ud83d\ude80', '\ud83c\udfb2', '\ud83c\udfaf', '\ud83c\udf1f', '\u26a1', '\ud83e\udde9', '\ud83d\udd79\ufe0f'];
const TAB_RECOMMENDED = '\u63a8\u8350\u5173\u6ce8';
const TAB_LATEST = '\u6700\u65b0\u52a8\u6001';

function formatMetric(value) {
  const num = Number(value) || 0;

  if (num >= 100000) {
    return `${Math.round(num / 10000)}w+`;
  }

  if (num >= 10000) {
    return `${(num / 10000).toFixed(1)}w`;
  }

  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }

  return String(num);
}

function normalizeGame(game, index) {
  return {
    ...game,
    plays: game.plays || game.playCount || 0,
    likes: game.likes || game.likeCount || 0,
    comments: game.comments || game.commentCount || 0,
    bookmarks: game.bookmarks || game.bookmarkCount || game.favoriteCount || game.favorites || 0,
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
    ], '\u521b\u4f5c\u8005'),
    isHot: (game.plays || game.playCount || 0) > 5000,
  };
}

function buildPosterColumns(games, desiredColumnCount = 3) {
  const columnCount = Math.min(desiredColumnCount, Math.max(games.length, 1));
  const columns = Array.from({ length: columnCount }, () => []);

  games.forEach((game, index) => {
    columns[index % columnCount].push(game);
  });

  return columns;
}

export default function FollowPage() {
  const isH5 = isH5Runtime();
  const isWeapp = isWeappRuntime();
  const currentUser = Storage.getUser() || {};
  const currentUserId = currentUser?.id ? String(currentUser.id) : '';
  const loggedIn = isLoggedIn();
  const [activeTab, setActiveTab] = useState(TAB_RECOMMENDED);
  const [topCreators, setTopCreators] = useState([]);
  const [followedGames, setFollowedGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const openGame = useGamePlayerStore((s) => s.openGame);

  const tabs = [TAB_RECOMMENDED, TAB_LATEST];
  const topCreatorIdsSignature = topCreators.map((creator) => String(creator?.id || '')).join(',');

  const updateCreatorFollowState = useCallback((creatorId, nextState) => {
    const normalizedCreatorId = creatorId ? String(creatorId) : '';
    if (!normalizedCreatorId) {
      return;
    }

    setTopCreators((prev) => prev.map((creator) => (
      String(creator.id) === normalizedCreatorId
        ? { ...creator, ...nextState }
        : creator
    )));
  }, []);

  const fetchData = useCallback(async (pageNum = 1, append = false) => {
    if (!append) setLoading(true);
    try {
      const shouldLoadFollowingFeed = activeTab === TAB_LATEST;
      const [creatorsRes, gamesRes] = await Promise.all([
        pageNum === 1 && activeTab === TAB_RECOMMENDED ? feedService.getTrendingCreators(10) : Promise.resolve(null),
        shouldLoadFollowingFeed
          ? (loggedIn ? feedService.getFollowingFeed(pageNum, 10) : Promise.resolve({ items: [], hasMore: false }))
          : feedService.getLatest(pageNum, 10),
      ]);

      if (creatorsRes) {
        const creators = Array.isArray(creatorsRes) ? creatorsRes : (creatorsRes?.items || []);
        setTopCreators(creators.map((creator) => ({
          ...creator,
          isFollowing: creator.isFollowing === true || creator.following === true || creator.viewerHasFollowed === true,
          followLoading: false,
        })));
      }

      const items = mergeBookmarkedFlags((gamesRes?.items || []).map(normalizeGame));
      setFollowedGames((prev) => (append ? [...prev, ...items] : items));
      setHasMore(gamesRes?.hasMore ?? items.length >= 10);
    } catch (error) {
      console.error('fetchData error:', error);
      Taro.showToast({
        title: '\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
        icon: 'none',
      });
    } finally {
      setLoading(false);
    }
  }, [activeTab, loggedIn]);

  useEffect(() => {
    setPage(1);
    setHasMore(true);
    fetchData(1);
  }, [fetchData]);

  useDidShow(() => {
    setFollowedGames((prev) => mergeBookmarkedFlags(prev));
  });

  useEffect(() => {
    if (!isLoggedIn() || topCreators.length === 0) {
      return undefined;
    }

    let cancelled = false;

    const syncFollowStates = async () => {
      const results = await Promise.all(topCreators.map(async (creator) => {
        const creatorId = creator?.id ? String(creator.id) : '';
        if (!creatorId || creatorId === currentUserId) {
          return [creatorId, false];
        }

        try {
          const following = await socialService.checkFollowStatus(creatorId);
          return [creatorId, Boolean(following)];
        } catch {
          return [creatorId, creator.isFollowing === true];
        }
      }));

      if (cancelled) {
        return;
      }

      const followMap = new Map(results.filter(([creatorId]) => creatorId));
      setTopCreators((prev) => prev.map((creator) => {
        const creatorId = creator?.id ? String(creator.id) : '';
        if (!followMap.has(creatorId)) {
          return creator;
        }

        return {
          ...creator,
          isFollowing: followMap.get(creatorId) === true,
          followLoading: false,
        };
      }));
    };

    syncFollowStates();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, topCreatorIdsSignature]);

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
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    await fetchData(nextPage, true);
    setPage(nextPage);
    setIsLoadingMore(false);
  }, [fetchData, hasMore, isLoadingMore, page]);

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

  useEffect(() => {
    if (!isH5 || typeof window === 'undefined') {
      return;
    }

    resetH5PageScrollTop();
  }, [activeTab, isH5]);

  const handleTabChange = (tab) => {
    if (tab === activeTab) {
      return;
    }

    setActiveTab(tab);
  };

  const handlePlay = (game) => {
    if (game.gameUrl) {
      openGame(game.gameUrl, game.title, getGameCoverUrl(game), {
        gameId: game.id,
        orientation: getGameOrientation(game),
      });
      return;
    }

    Taro.navigateTo({ url: `/pages/game/detail/index?id=${game.id}` });
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

      setFollowedGames((prev) => prev.map((game) => (
        game.id === targetGame.id
          ? { ...game, likes: nextLikes, viewerHasLiked: nextLiked }
          : game
      )));

      return { liked: nextLiked, likes: nextLikes };
    } catch (error) {
      Taro.showToast({
        title: error?.message || '\u70b9\u8d5e\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5',
        icon: 'none',
      });
      throw error;
    }
  };

  const handleToggleBookmark = async (targetGame) => {
    const nextBookmarked = !targetGame.viewerHasBookmarked;
    const nextBookmarks = Math.max(0, (Number(targetGame.bookmarks) || 0) + (nextBookmarked ? 1 : -1));
    setGameBookmarked(targetGame, nextBookmarked);
    setFollowedGames((prev) => prev.map((game) => (
      game.id === targetGame.id
        ? { ...game, viewerHasBookmarked: nextBookmarked, bookmarks: nextBookmarks }
        : game
    )));
    Taro.showToast({
      title: nextBookmarked ? '\u5df2\u6536\u85cf' : '\u5df2\u53d6\u6d88\u6536\u85cf',
      icon: 'none',
    });
    return { bookmarked: nextBookmarked, bookmarks: nextBookmarks };
  };

  const handleToggleCreatorFollow = async (creator, event) => {
    event?.stopPropagation?.();

    const creatorId = creator?.id ? String(creator.id) : '';
    if (!creatorId) {
      return;
    }

    if (creatorId === currentUserId) {
      Taro.showToast({
        title: '不能关注自己',
        icon: 'none',
      });
      return;
    }

    if (creator.followLoading) {
      return;
    }

    if (!isLoggedIn()) {
      setPostLoginRedirect('/pages/discover/index');
      Taro.navigateTo({ url: LOGIN_PAGE_URL }).catch(() => {});
      return;
    }

    const nextFollowing = !creator.isFollowing;
    updateCreatorFollowState(creatorId, { followLoading: true });

    try {
      if (creator.isFollowing) {
        await socialService.unfollowUser(creatorId);
      } else {
        await socialService.followUser(creatorId);
      }

      updateCreatorFollowState(creatorId, {
        isFollowing: nextFollowing,
        followLoading: false,
      });
      Taro.showToast({
        title: nextFollowing ? '已关注创作者' : '已取消关注',
        icon: 'none',
      });
    } catch (error) {
      updateCreatorFollowState(creatorId, { followLoading: false });
      Taro.showToast({
        title: error?.message || (creator.isFollowing ? '取消关注失败' : '关注失败'),
        icon: 'none',
      });
    }
  };

  const posterColumns = buildPosterColumns(followedGames);

  const heroTitle = activeTab === TAB_RECOMMENDED
    ? '发现下一批值得关注的创作者'
    : (loggedIn ? '追踪你关注创作者的最新作品' : '登录后建立你的专属关注流');
  const heroDesc = activeTab === TAB_RECOMMENDED
    ? '从热门创作者和最新灵感里快速找到更适合你的风格方向。'
    : (loggedIn
      ? '这里会持续更新你关注创作者的新作品、迭代和动态。'
      : '登录后就能在这里看到关注创作者的最新发布与更新。');
  const discoverStats = [
    {
      key: 'creators',
      label: activeTab === TAB_RECOMMENDED ? '推荐创作者' : '关注作者',
      value: activeTab === TAB_RECOMMENDED ? `${topCreators.length}` : (loggedIn ? 'Live' : '--'),
    },
    {
      key: 'games',
      label: activeTab === TAB_RECOMMENDED ? '灵感作品' : '最新动态',
      value: `${followedGames.length}`,
    },
    {
      key: 'status',
      label: '浏览状态',
      value: activeTab === TAB_RECOMMENDED ? '探索中' : (loggedIn ? '已同步' : '待登录'),
    },
  ];

  return (
    <View className={`follow-page${isH5 ? ' follow-page--h5' : ''}${isWeapp ? ' follow-page--weapp' : ''}`}>
      <AppTopBar />

      <View className="follow-stage">
        <View className="follow-stage__copy">
          <Text className="follow-stage__eyebrow">Creator Radar</Text>
          <Text className="follow-stage__title">{heroTitle}</Text>
          <Text className="follow-stage__desc">{heroDesc}</Text>
        </View>
        <View className="follow-stage__metrics">
          {discoverStats.map((stat) => (
            <View key={stat.key} className="follow-stage__metric">
              <Text className="follow-stage__metric-label">{stat.label}</Text>
              <Text className="follow-stage__metric-value">{stat.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="follow-header">
        <View className="follow-header__copy">
          <Text className="header-kicker">Discover</Text>
          <Text className="header-title">{'\u5173\u6ce8'}</Text>
        </View>
        <View className="header-tabs">
          {tabs.map((tab) => (
            <Text
              key={tab}
              className={`header-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => handleTabChange(tab)}
            >
              {tab}
            </Text>
          ))}
        </View>
      </View>

      <PageScrollContainer
        className="follow-content"
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={handleRefresh}
        onScrollToLower={handleLoadMore}
        lowerThreshold={300}
      >
        {activeTab === TAB_RECOMMENDED && (
          <>
            <View className="section">
              <View className="section-head section-head--split">
                <View className="section-head__copy">
                  <Text className="section-kicker">Top Creators</Text>
                  <Text className="section-title">{'\u70ed\u95e8\u521b\u4f5c\u8005'}</Text>
                </View>
                <Text className="section-meta">{`${topCreators.length} 位`}</Text>
              </View>
              <ScrollView className="creators-scroll" scrollX>
                <View className="creators-list">
                  {topCreators.map((creator, index) => {
                    const creatorName = getSafeDisplayText([
                      creator.displayName,
                      creator.nickname,
                      creator.username,
                      creator.name,
                    ], '\u521b\u4f5c\u8005');
                    const creatorAvatarRaw = creator.avatarUrl || creator.avatar || '';
                    const creatorAvatarSrc = normalizeAvatarSource(creatorAvatarRaw);
                    const creatorAvatarFallback = getAvatarFallback(creatorAvatarRaw, creatorName, '\u521b');
                    const isOwnCreator = Boolean(currentUserId && String(creator.id || '') === currentUserId);
                    const followButtonText = creator.followLoading
                      ? '处理中...'
                      : creator.isFollowing
                        ? '已关注'
                        : isOwnCreator
                          ? '自己'
                          : '\u5173\u6ce8';

                    return (
                      <View key={creator.id} className="creator-card">
                        <View className="creator-rank">{String(index + 1).padStart(2, '0')}</View>
                        <View className="creator-avatar">
                          {creatorAvatarSrc ? (
                            <Image className="avatar-img" src={creatorAvatarSrc} mode="aspectFill" />
                          ) : (
                            <Text className="avatar-text">{creatorAvatarFallback}</Text>
                          )}
                        </View>
                        <Text className="creator-name">
                          {creatorName}
                        </Text>
                        <View className="creator-meta-row">
                          <Text className="creator-meta">
                            {`${creator.gameCount || creator.works || 0} \u4f5c\u54c1`}
                          </Text>
                          <Text className="creator-meta-dot" />
                          <Text className="creator-meta">
                            {`${formatMetric(creator.followerCount || creator.followers || 0)} 粉丝`}
                          </Text>
                        </View>
                        <View
                          className={`follow-btn${creator.isFollowing ? ' is-following' : ''}${creator.followLoading ? ' is-loading' : ''}${isOwnCreator ? ' disabled' : ''}`}
                          onClick={(event) => handleToggleCreatorFollow(creator, event)}
                        >
                          <Text className="follow-btn-text">{followButtonText}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            <View className="section">
              <View className="section-head section-head--split">
                <View className="section-head__copy">
                  <Text className="section-kicker">Curated Feed</Text>
                  <Text className="section-title">{'\u4f60\u53ef\u80fd\u559c\u6b22'}</Text>
                </View>
                <Text className="section-meta">{`${followedGames.length} 款`}</Text>
              </View>
              {loading ? (
                <View className="empty-state">
                  <Text className="empty-text">{'\u52a0\u8f7d\u4e2d...'}</Text>
                </View>
              ) : (
                <View className="waterfall">
                  {posterColumns.map((column, columnIndex) => (
                    <View key={`recommended-col-${columnIndex}`} className="waterfall-col">
                      {column.map((game) => (
                        <View key={game.id} className="waterfall-item">
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
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        {activeTab === TAB_LATEST && (
          <View className="section">
            <View className="section-head section-head--split">
              <View className="section-head__copy">
                <Text className="section-kicker">Following Feed</Text>
                <Text className="section-title">{loggedIn ? '关注动态' : '登录后查看关注动态'}</Text>
              </View>
              <Text className="section-meta">{loggedIn ? `${followedGames.length} 条` : '未登录'}</Text>
            </View>
            {loading ? (
              <View className="empty-state">
                <Text className="empty-text">{'\u52a0\u8f7d\u4e2d...'}</Text>
              </View>
            ) : followedGames.length === 0 ? (
              <View className="empty-state">
                <Text className="empty-icon">{'\u2728'}</Text>
                <Text className="empty-title">
                  {loggedIn ? '\u8fd8\u6ca1\u6709\u5173\u6ce8\u7684\u521b\u4f5c\u8005' : '\u767b\u5f55\u540e\u67e5\u770b\u5173\u6ce8\u52a8\u6001'}
                </Text>
                <Text className="empty-text">
                  {loggedIn
                    ? '\u5173\u6ce8\u521b\u4f5c\u8005\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u4ed6\u4eec\u7684\u6700\u65b0\u4f5c\u54c1'
                    : '\u767b\u5f55\u540e\uff0c\u8fd9\u91cc\u4f1a\u5c55\u793a\u4f60\u5173\u6ce8\u521b\u4f5c\u8005\u7684\u6700\u65b0\u4f5c\u54c1'}
                </Text>
                {!loggedIn ? (
                  <View
                    className="empty-action"
                    onClick={() => {
                      setPostLoginRedirect('/pages/discover/index');
                      Taro.navigateTo({ url: LOGIN_PAGE_URL }).catch(() => {});
                    }}
                  >
                    <Text>{'\u53bb\u767b\u5f55'}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="waterfall">
                {posterColumns.map((column, columnIndex) => (
                  <View key={`latest-col-${columnIndex}`} className="waterfall-col">
                    {column.map((game) => (
                      <View key={game.id} className="waterfall-item">
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
                ))}
              </View>
            )}
          </View>
        )}

        {isLoadingMore && (
          <View className="load-more">
            <Text className="load-more-text">{'\u52a0\u8f7d\u4e2d...'}</Text>
          </View>
        )}

        {!hasMore && followedGames.length > 0 && (
          <View className="load-more">
            <Text className="load-more-end">{'\u2014 \u5df2\u7ecf\u5230\u5e95\u4e86 \u2014'}</Text>
          </View>
        )}

        <View className="bottom-spacer" />
      </PageScrollContainer>

      <CustomTabBar activeIndex={1} />
      <GlobalGamePlayer />
      <FloatingPlayer />
      <PaywallPopup />
    </View>
  );
}
