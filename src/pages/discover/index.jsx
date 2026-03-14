import { useState, useEffect } from 'react';
import { View, Text, Image, Input, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import * as feedService from '../../services/feed';
import useGamePlayerStore from '../../stores/gamePlayer';
import './index.scss';

const GAME_COLORS = ['#6e56ff', '#2dd4a8', '#fbbf24', '#ff5c8a'];
const GAME_EMOJIS = ['🎮', '🚀', '🎵', '💎', '🐦', '🎣', '🧩', '🎯'];

function normalizeGame(game, index) {
  return {
    ...game,
    emoji: game.emoji || GAME_EMOJIS[index % GAME_EMOJIS.length],
    color: game.color || GAME_COLORS[index % GAME_COLORS.length],
    author: game.author?.username || game.author || '未知创作者',
    authorEmoji: game.authorEmoji || '👤',
    isHot: (game.plays || 0) > 10000,
  };
}

export default function DiscoverPage() {
  const [searchValue, setSearchValue] = useState('');
  const [selectedTag, setSelectedTag] = useState('全部');
  const [topCreators, setTopCreators] = useState([]);
  const [recommendedGames, setRecommendedGames] = useState([]);
  const openGame = useGamePlayerStore((s) => s.openGame);
  const { windowHeight = 750 } = Taro.getSystemInfoSync();
  const scrollViewHeight = windowHeight - 96 - 120;

  const trendingTags = ['全部', '太空冒险', '休闲益智', '射击游戏', '跑酷', '卡牌', '竞速', '恐怖'];

  useEffect(() => {
    feedService.getTrendingCreators(8).then((data) => {
      setTopCreators(Array.isArray(data) ? data : (data?.items || []));
    }).catch(() => {});

    feedService.getFeaturedGames(10).then((data) => {
      const raw = Array.isArray(data) ? data : (data?.items || []);
      setRecommendedGames(raw.map(normalizeGame));
    }).catch(() => {});
  }, []);

  const handleGamePlay = (game) => {
    if (game.gameUrl) {
      openGame(game.gameUrl, game.title);
    } else {
      Taro.navigateTo({ url: `/pages/game/detail/index?id=${game.id}` });
    }
  };

  const handleFork = (gameId) => {
    console.log('Fork game:', gameId);
  };

  const handleCreatorClick = (_creatorId) => {
    Taro.switchTab({ url: '/pages/profile/index' });
  };

  return (
    <View className="discover-page">
      <View className="discover-header">
        <Text className="header-title">发现</Text>
      </View>

      <ScrollView className="discover-content" style={{ height: `${scrollViewHeight}px` }} scrollY>
        {/* Search Bar */}
        <View className="search-section">
          <View className="search-bar">
            <Text className="search-icon">🔍</Text>
            <Input
              className="search-input"
              placeholder="搜索游戏或创作者..."
              value={searchValue}
              onInput={(e) => setSearchValue(e.detail.value)}
            />
          </View>
        </View>

        {/* Trending Tags */}
        <View className="tags-section">
          <Text className="section-label">📌 热门标签</Text>
          <ScrollView className="tags-scroll" scrollX scrollWithAnimation>
            <View className="tags-container">
              {trendingTags.map((tag) => (
                <View
                  key={tag}
                  className={`tag-chip ${selectedTag === tag ? 'active' : ''}`}
                  onClick={() => setSelectedTag(tag)}
                >
                  <Text>{tag}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Top Creators */}
        <View className="creators-section">
          <View className="section-header">
            <Text className="section-label">👑 热门创作者</Text>
            <Text
              className="view-all"
              onClick={() => Taro.showToast({ title: '敬请期待', icon: 'none' })}
            >
              全部 →
            </Text>
          </View>
          <ScrollView className="creators-scroll" scrollX scrollWithAnimation>
            <View className="creators-container">
              {topCreators.map((creator) => (
                <View
                  key={creator.id}
                  className="creator-card"
                  onClick={() => handleCreatorClick(creator.id)}
                >
                  <View className="creator-avatar">
                    {(creator.avatar || '').startsWith('http') ? (
                      <Image className="creator-avatar-img" src={creator.avatar} mode="aspectFill" />
                    ) : (
                      creator.avatar || creator.emoji || '👤'
                    )}
                  </View>
                  <Text className="creator-name">
                    {creator.username || creator.name || '创作者'}
                  </Text>
                  <View className="creator-stats">
                    <Text className="stat-item">
                      {creator.gameCount || creator.works || 0} 作品
                    </Text>
                    <Text className="stat-item">
                      {creator.followerCount || creator.followers || 0}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Recommended Games — 2-column grid like home page */}
        <View className="recommended-section">
          <View className="section-header">
            <Text className="section-label">🎮 推荐游戏</Text>
            <Text
              className="view-all"
              onClick={() => Taro.showToast({ title: '敬请期待', icon: 'none' })}
            >
              更多 →
            </Text>
          </View>
          <View className="games-grid">
            {recommendedGames.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                onPlay={handleGamePlay}
                onFork={handleFork}
              />
            ))}
          </View>
        </View>

        <View style={{ height: '80px' }} />
      </ScrollView>

      <CustomTabBar activeIndex={1} />
      <GlobalGamePlayer />
    </View>
  );
}
