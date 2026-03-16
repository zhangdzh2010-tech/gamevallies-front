import { useState, useEffect, useCallback } from 'react';
import { View, Text, Image, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import * as feedService from '../../services/feed';
import useGamePlayerStore from '../../stores/gamePlayer';
import './index.scss';

const GAME_COLORS = ['#6e56ff', '#2dd4a8', '#fbbf24', '#ff5c8a', '#f97316', '#8b5cf6'];
const GAME_EMOJIS = ['🎮', '🚀', '🎵', '💎', '🐦', '🎣', '🧩', '🎯'];

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

export default function FollowPage() {
  const [activeTab, setActiveTab] = useState('推荐关注');
  const [topCreators, setTopCreators] = useState([]);
  const [followedGames, setFollowedGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const openGame = useGamePlayerStore((s) => s.openGame);

  const tabs = ['推荐关注', '最新动态'];

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

      const items = (gamesRes?.items || []).map(normalizeGame);
      setFollowedGames(prev => append ? [...prev, ...items] : items);
      setHasMore(gamesRes?.hasMore ?? items.length >= 10);
    } catch (e) {
      console.error('fetchData error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(1);
  }, []);

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
      openGame(game.gameUrl, game.title);
    } else {
      Taro.navigateTo({ url: `/pages/game/detail/index?id=${game.id}` });
    }
  };

  const leftCol = [];
  const rightCol = [];
  followedGames.forEach((g, i) => {
    if (i % 2 === 0) leftCol.push(g);
    else rightCol.push(g);
  });

  return (
    <View className="follow-page">
      {/* Header */}
      <View className="follow-header">
        <Text className="header-title">关注</Text>
        <View className="header-tabs">
          {tabs.map(tab => (
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
        {activeTab === '推荐关注' && (
          <>
            {/* Recommended Creators */}
            <View className="section">
              <View className="section-head">
                <Text className="section-title">热门创作者</Text>
              </View>
              <ScrollView className="creators-scroll" scrollX>
                <View className="creators-list">
                  {topCreators.map((creator) => (
                    <View key={creator.id} className="creator-card">
                      <View className="creator-avatar">
                        {(creator.avatar || '').startsWith('http') ? (
                          <Image className="avatar-img" src={creator.avatar} mode="aspectFill" />
                        ) : (
                          <Text className="avatar-text">{(creator.username || '?')[0]}</Text>
                        )}
                      </View>
                      <Text className="creator-name">
                        {creator.username || creator.name || '创作者'}
                      </Text>
                      <Text className="creator-meta">
                        {creator.gameCount || creator.works || 0} 作品
                      </Text>
                      <View className="follow-btn">
                        <Text className="follow-btn-text">关注</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>

            {/* Recommended games */}
            <View className="section">
              <View className="section-head">
                <Text className="section-title">你可能喜欢</Text>
              </View>
              {loading ? (
                <View className="empty-state">
                  <Text className="empty-text">加载中...</Text>
                </View>
              ) : (
                <View className="waterfall">
                  <View className="waterfall-col">
                    {leftCol.map(game =>
                      <GameCard key={game.id} game={game} onPlay={handlePlay} />
                    )}
                  </View>
                  <View className="waterfall-col">
                    {rightCol.map(game =>
                      <GameCard key={game.id} game={game} onPlay={handlePlay} />
                    )}
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {activeTab === '最新动态' && (
          <View className="section">
            {loading ? (
              <View className="empty-state">
                <Text className="empty-text">加载中...</Text>
              </View>
            ) : followedGames.length === 0 ? (
              <View className="empty-state">
                <Text className="empty-icon">⭐</Text>
                <Text className="empty-title">还没有关注的创作者</Text>
                <Text className="empty-text">关注创作者后，这里会显示他们的最新作品</Text>
              </View>
            ) : (
              <View className="waterfall">
                <View className="waterfall-col">
                  {leftCol.map(game =>
                    <GameCard key={game.id} game={game} onPlay={handlePlay} />
                  )}
                </View>
                <View className="waterfall-col">
                  {rightCol.map(game =>
                    <GameCard key={game.id} game={game} onPlay={handlePlay} />
                  )}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Loading more */}
        {isLoadingMore && (
          <View className="load-more">
            <Text className="load-more-text">加载中...</Text>
          </View>
        )}
        {!hasMore && followedGames.length > 0 && (
          <View className="load-more">
            <Text className="load-more-end">— 已经到底了 —</Text>
          </View>
        )}

        <View className="bottom-spacer" />
      </ScrollView>

      <CustomTabBar activeIndex={1} />
      <GlobalGamePlayer />
    </View>
  );
}
