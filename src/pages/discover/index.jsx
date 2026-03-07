import { useState, useEffect } from 'react';
import { View, Text, Input, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import * as feedService from '../../services/feed';
import useGamePlayerStore from '../../stores/gamePlayer';
import './index.scss';
















export default function DiscoverPage() {
  const [searchValue, setSearchValue] = useState('');
  const [selectedTag, setSelectedTag] = useState('全部');
  const [topCreators, setTopCreators] = useState([]);
  const [recommendedGames, setRecommendedGames] = useState([]);
  const openGame = useGamePlayerStore((s) => s.openGame);

  const trendingTags = ['全部', '太空冒险', '休闲益智', '射击游戏', '跑酷', '卡牌', '竞速', '恐怖'];

  useEffect(() => {
    feedService.getTrendingCreators(8).then((data) => {
      setTopCreators(Array.isArray(data) ? data : (data?.items || []));
    }).catch(() => {});

    feedService.getFeaturedGames(10).then((data) => {
      setRecommendedGames(Array.isArray(data) ? data : (data?.items || []));
    }).catch(() => {});
  }, []);


  const handleGameClick = (game) => {
    if (game.gameUrl) {
      openGame(game.gameUrl, game.title);
    } else {
      Taro.navigateTo({ url: `/pages/game/detail/index?id=${game.id}` });
    }
  };

  const handleCreatorClick = (creatorId) => {
    Taro.navigateTo({ url: `/pages/profile/index?id=${creatorId}` });
  };

  return (
    <View className="discover-page">
      {/* Header */}
      <View className="discover-header">
        <Text className="header-title">发现</Text>
      </View>

      {/* Scrollable Content */}
      <ScrollView className="discover-content" scrollY>
        {/* Search Bar */}
        <View className="search-section">
          <View className="search-bar">
            <Text className="search-icon">🔍</Text>
            <Input
              className="search-input"
              placeholder="搜索游戏或创作者..."
              value={searchValue}
              onInput={(e) => setSearchValue(e.detail.value)} />
            
          </View>
        </View>

        {/* Trending Tags */}
        <View className="tags-section">
          <Text className="section-label">📌 热门标签</Text>
          <ScrollView
            className="tags-scroll"
            scrollX
            scrollWithAnimation>
            
            <View className="tags-container">
              {trendingTags.map((tag) =>
              <View
                key={tag}
                className={`tag-chip ${
                selectedTag === tag ? 'active' : ''}`
                }
                onClick={() => setSelectedTag(tag)}>
                
                  <Text>{tag}</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>

        {/* Top Creators */}
        <View className="creators-section">
          <View className="section-header">
            <Text className="section-label">👑 热门创作者</Text>
            <Text
              className="view-all"
              onClick={() => Taro.navigateTo({ url: '/pages/creators' })}>
              
              全部 →
            </Text>
          </View>
          <ScrollView
            className="creators-scroll"
            scrollX
            scrollWithAnimation>
            
            <View className="creators-container">
              {topCreators.map((creator) =>
              <View
                key={creator.id}
                className="creator-card"
                onClick={() => handleCreatorClick(creator.id)}>

                  <View className="creator-avatar">
                    {creator.avatar || creator.emoji || '👤'}
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
              )}
            </View>
          </ScrollView>
        </View>

        {/* Recommended Games by Category */}
        <View className="recommended-section">
          <View className="section-header">
            <Text className="section-label">
              🎮 推荐游戏
            </Text>
            <Text
              className="view-all"
              onClick={() => Taro.navigateTo({ url: '/pages/games' })}>
              
              更多 →
            </Text>
          </View>
          <View className="games-list">
            {recommendedGames.map((game) =>
            <View
              key={game.id}
              className="game-card"
              onClick={() => handleGameClick(game)}>

                <View className="game-icon-area">
                  {game.emoji || '🎮'}
                </View>
                <View className="game-info">
                  <Text className="game-title">
                    {game.title}
                  </Text>
                  <Text className="game-creator">
                    {game.author?.username || game.creator || ''}
                  </Text>
                  <View className="game-footer">
                    <Text className="game-plays">
                      ▶ {game.plays || game.playCount || 0}
                    </Text>
                    <Text className="game-category">
                      {game.category || game.tags?.[0] || ''}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={{ height: '80px' }}></View>
      </ScrollView>

      <CustomTabBar activeIndex={1} />
    </View>);

}