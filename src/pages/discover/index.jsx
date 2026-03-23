import { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { AppTopBar } from '../../components/common/AppTopBar';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { FloatingPlayer } from '../../components/common/FloatingPlayer';
import { PaywallPopup } from '../../components/common/PaywallPopup';
import * as feedService from '../../services/feed';
import * as socialService from '../../services/social';
import useGamePlayerStore from '../../stores/gamePlayer';
import { mergeBookmarkedFlags, setGameBookmarked } from '../../utils/bookmarks';
import { buildGameDetailPath } from '../../utils/share';
import { getAvatarFallback, getSafeDisplayText, normalizeAvatarSource } from '../../utils/profileDisplay';
import './index.scss';

const GAME_COLORS = ['#6e56ff', '#2dd4a8', '#fbbf24', '#ff5c8a', '#f97316', '#8b5cf6'];
const GAME_EMOJIS = ['\ud83c\udfae', '\ud83d\ude80', '\ud83c\udfb2', '\ud83c\udfaf', '\ud83c\udf1f', '\u26a1', '\ud83e\udde9', '\ud83d\udd79\ufe0f'];
const TAB_RECOMMENDED = '\u63a8\u8350\u5173\u6ce8';
const TAB_LATEST = '\u6700\u65b0\u52a8\u6001';

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

export default function FollowPage() {
  const isWeapp = process.env.TARO_ENV === 'weapp';
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

  const fetchData = useCallback(async (pageNum = 1, append = false) => {
    if (!append) setLoading(true);
    try {
      const [creatorsRes, gamesRes] = await Promise.all([
        pageNum === 1 ? feedService.getTrendingCreators(10) : Promise.resolve(null),
        feedService.getLatest(pageNum, 10),
      ]);

      if (creatorsRes) {
        const creators = Array.isArray(creatorsRes) ? creatorsRes : (creatorsRes?.items || []);
        setTopCreators(creators);
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
  }, []);

  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  useDidShow(() => {
    setFollowedGames((prev) => mergeBookmarkedFlags(prev));
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await fetchData(1);
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const nextPage = page + 1;
    await fetchData(nextPage, true);
    setPage(nextPage);
    setIsLoadingMore(false);
  };

  const handlePlay = (game) => {
    if (game.gameUrl) {
      openGame(game.gameUrl, game.title, game.coverUrl || game.thumbnailUrl || '', {
        gameId: game.id,
      });
      return;
    }

    Taro.navigateTo({ url: `/pages/game/detail/index?id=${game.id}` });
  };

  const handleComment = (game) => {
    Taro.navigateTo({ url: buildGameDetailPath(game.id, { openComment: 1 }) }).catch(() => {});
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

  const leftCol = [];
  const rightCol = [];
  followedGames.forEach((game, index) => {
    if (index % 2 === 0) {
      leftCol.push(game);
    } else {
      rightCol.push(game);
    }
  });

  return (
    <View className={`follow-page${isWeapp ? ' follow-page--weapp' : ''}`}>
      <AppTopBar />

      <View className="follow-header">
        <Text className="header-title">{'\u5173\u6ce8'}</Text>
        <View className="header-tabs">
          {tabs.map((tab) => (
            <Text
              key={tab}
              className={`header-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </Text>
          ))}
        </View>
      </View>

      <ScrollView
        className="follow-content"
        scrollY
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={handleRefresh}
        onScrollToLower={handleLoadMore}
        lowerThreshold={300}
      >
        {activeTab === TAB_RECOMMENDED && (
          <>
            <View className="section">
              <View className="section-head">
                <Text className="section-title">{'\u70ed\u95e8\u521b\u4f5c\u8005'}</Text>
              </View>
              <ScrollView className="creators-scroll" scrollX>
                <View className="creators-list">
                  {topCreators.map((creator) => {
                    const creatorName = getSafeDisplayText([
                      creator.displayName,
                      creator.nickname,
                      creator.username,
                      creator.name,
                    ], '\u521b\u4f5c\u8005');
                    const creatorAvatarRaw = creator.avatarUrl || creator.avatar || '';
                    const creatorAvatarSrc = normalizeAvatarSource(creatorAvatarRaw);
                    const creatorAvatarFallback = getAvatarFallback(creatorAvatarRaw, creatorName, '\u521b');

                    return (
                      <View key={creator.id} className="creator-card">
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
                        <Text className="creator-meta">
                          {`${creator.gameCount || creator.works || 0} \u4f5c\u54c1`}
                        </Text>
                        <View className="follow-btn">
                          <Text className="follow-btn-text">{'\u5173\u6ce8'}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            <View className="section">
              <View className="section-head">
                <Text className="section-title">{'\u4f60\u53ef\u80fd\u559c\u6b22'}</Text>
              </View>
              {loading ? (
                <View className="empty-state">
                  <Text className="empty-text">{'\u52a0\u8f7d\u4e2d...'}</Text>
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
                        onToggleLike={handleToggleLike}
                        onToggleBookmark={handleToggleBookmark}
                      />
                    ))}
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {activeTab === TAB_LATEST && (
          <View className="section">
            {loading ? (
              <View className="empty-state">
                <Text className="empty-text">{'\u52a0\u8f7d\u4e2d...'}</Text>
              </View>
            ) : followedGames.length === 0 ? (
              <View className="empty-state">
                <Text className="empty-icon">{'\u2728'}</Text>
                <Text className="empty-title">{'\u8fd8\u6ca1\u6709\u5173\u6ce8\u7684\u521b\u4f5c\u8005'}</Text>
                <Text className="empty-text">{'\u5173\u6ce8\u521b\u4f5c\u8005\u540e\uff0c\u8fd9\u91cc\u4f1a\u663e\u793a\u4ed6\u4eec\u7684\u6700\u65b0\u4f5c\u54c1'}</Text>
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
                        onToggleLike={handleToggleLike}
                      onToggleBookmark={handleToggleBookmark}
                    />
                  ))}
                </View>
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
      </ScrollView>

      <CustomTabBar activeIndex={1} />
      <GlobalGamePlayer />
      <FloatingPlayer />
      <PaywallPopup />
    </View>
  );
}
