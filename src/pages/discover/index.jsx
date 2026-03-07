import { useState } from 'react';
import { View, Text, Input, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import './index.scss';


















export default function DiscoverPage() {
  const [searchValue, setSearchValue] = useState('');
  const [selectedTag, setSelectedTag] = useState('all');

  const trendingTags = [
  '全部',
  '太空冒险',
  '休闲益智',
  '射击游戏',
  '跑酷',
  '卡牌',
  '竞速',
  '恐怖'];


  const topCreators = [
  {
    id: '1',
    name: '太空游戏设计师',
    avatar: '👨',
    works: 24,
    followers: '2.3万'
  },
  {
    id: '2',
    name: '休闲游戏大师',
    avatar: '👩',
    works: 18,
    followers: '1.8万'
  },
  {
    id: '3',
    name: '创意鬼才',
    avatar: '🧑',
    works: 32,
    followers: '3.1万'
  },
  {
    id: '4',
    name: '像素艺术师',
    avatar: '👨',
    works: 15,
    followers: '1.2万'
  }];


  const recommendedGames = [
  {
    id: '1',
    title: '太空躲避游戏',
    emoji: '🚀',
    creator: '太空游戏设计师',
    plays: '2.3万',
    category: '射击'
  },
  {
    id: '2',
    title: '接水果游戏',
    emoji: '🍎',
    creator: '休闲游戏大师',
    plays: '1.8万',
    category: '休闲'
  },
  {
    id: '3',
    title: '贪吃蛇进化',
    emoji: '🐍',
    creator: '创意鬼才',
    plays: '1.5万',
    category: '经典'
  },
  {
    id: '4',
    title: '弹跳小球',
    emoji: '🧱',
    creator: '像素艺术师',
    plays: '1.2万',
    category: '益智'
  }];


  const handleGameClick = (gameId) => {
    Taro.navigateTo({ url: `/pages/game/detail?id=${gameId}` });
  };

  const handleCreatorClick = (creatorId) => {
    Taro.navigateTo({ url: `/pages/profile?id=${creatorId}` });
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
                    {creator.avatar}
                  </View>
                  <Text className="creator-name">
                    {creator.name}
                  </Text>
                  <View className="creator-stats">
                    <Text className="stat-item">
                      {creator.works} 作品
                    </Text>
                    <Text className="stat-item">
                      {creator.followers}
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
              onClick={() => handleGameClick(game.id)}>
              
                <View className="game-icon-area">
                  {game.emoji}
                </View>
                <View className="game-info">
                  <Text className="game-title">
                    {game.title}
                  </Text>
                  <Text className="game-creator">
                    {game.creator}
                  </Text>
                  <View className="game-footer">
                    <Text className="game-plays">
                      ▶ {game.plays}
                    </Text>
                    <Text className="game-category">
                      {game.category}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={{ height: '32px' }}></View>
      </ScrollView>
    </View>);

}