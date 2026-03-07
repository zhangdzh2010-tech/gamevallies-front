import React, { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import Taro from '@tarojs/taro';
import './index.scss';











const USER_PROFILE = {
  name: '游戏创作者',
  avatar: '👤',
  bio: '热爱游戏创作的开发者',
  followers: 2345,
  following: 567,
  totalGames: 12,
  totalPlays: 156000
};

const USER_GAMES = [
{
  id: '1',
  title: '2048 数字游戏',
  description: '合并相同数字达到2048',
  emoji: '🎮',
  color: '#6e56ff',
  plays: 23400,
  likes: 5600,
  author: 'Me',
  authorEmoji: '👤',
  isHot: true,
  forks: 234
},
{
  id: '2',
  title: '太空防御',
  description: '击落来临的陨石',
  emoji: '🚀',
  color: '#2dd4a8',
  plays: 18900,
  likes: 4200,
  author: 'Me',
  authorEmoji: '👤',
  isHot: true,
  forks: 189
},
{
  id: '3',
  title: '音乐节奏',
  description: '跟随节奏点击',
  emoji: '🎵',
  color: '#fbbf24',
  plays: 15600,
  likes: 3800,
  author: 'Me',
  authorEmoji: '👤',
  isHot: false,
  forks: 156
}];




export default function Profile() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('created');
  const [profile, setProfile] = useState(USER_PROFILE);

  const handleLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          Taro.removeStorage({
            key: 'authToken'
          });
          Taro.showToast({
            title: '已退出登录',
            icon: 'success'
          });
          setTimeout(() => {
            navigation.push({
              url: '/pages/login/index'
            });
          }, 1000);
        }
      }
    });
  };

  const handleEditProfile = () => {
    Taro.showToast({
      title: '编辑功能开发中',
      icon: 'none'
    });
  };

  const handlePlay = (game) => {
    navigation.push({
      url: `/pages/game/detail/index?id=${game.id}`
    });
  };

  const handleFork = (gameId) => {
    console.log('Fork game:', gameId);
  };

  const formatNumber = (num) => {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  return (
    <View className="profile-container">
      {/* Header */}
      <View className="profile-header">
        <View className="header-top">
          <Text className="avatar">{profile.avatar}</Text>
          <View className="header-actions">
            <View className="edit-btn" onClick={handleEditProfile}>
              编辑资料
            </View>
            <View className="logout-btn" onClick={handleLogout}>
              退出
            </View>
          </View>
        </View>

        <View className="user-info">
          <Text className="user-name">{profile.name}</Text>
          <Text className="user-bio">{profile.bio}</Text>
        </View>

        <View className="stats-row">
          <View className="stat">
            <Text className="stat-value">
              {formatNumber(profile.followers)}
            </Text>
            <Text className="stat-label">粉丝</Text>
          </View>
          <View className="stat">
            <Text className="stat-value">
              {formatNumber(profile.following)}
            </Text>
            <Text className="stat-label">关注</Text>
          </View>
          <View className="stat">
            <Text className="stat-value">{profile.totalGames}</Text>
            <Text className="stat-label">游戏</Text>
          </View>
          <View className="stat">
            <Text className="stat-value">
              {formatNumber(profile.totalPlays)}
            </Text>
            <Text className="stat-label">总玩数</Text>
          </View>
        </View>
      </View>

      <ScrollView className="profile-scroll" scrollY>
        {/* Tabs */}
        <View className="tabs-container">
          <View
            className={`tab-item ${activeTab === 'created' ? 'active' : ''}`}
            onClick={() => setActiveTab('created')}>
            
            <Text>创建的游戏 ({profile.totalGames})</Text>
          </View>
          <View
            className={`tab-item ${activeTab === 'liked' ? 'active' : ''}`}
            onClick={() => setActiveTab('liked')}>
            
            <Text>赞过的游戏</Text>
          </View>
          <View
            className={`tab-item ${activeTab === 'forked' ? 'active' : ''}`}
            onClick={() => setActiveTab('forked')}>
            
            <Text>复制的游戏</Text>
          </View>
        </View>

        {/* Games Grid */}
        {activeTab === 'created' &&
        <View className="games-section">
            <View className="games-grid">
              {USER_GAMES.map((game) =>
            <GameCard
              key={game.id}
              game={game}
              onPlay={handlePlay}
              onFork={handleFork} />

            )}
            </View>
          </View>
        }

        {activeTab === 'liked' &&
        <View className="games-section">
            <View className="empty-state">
              <Text className="empty-icon">♥</Text>
              <Text className="empty-text">暂无赞过的游戏</Text>
            </View>
          </View>
        }

        {activeTab === 'forked' &&
        <View className="games-section">
            <View className="empty-state">
              <Text className="empty-icon">🔀</Text>
              <Text className="empty-text">暂无复制的游戏</Text>
            </View>
          </View>
        }

        {/* Additional Info */}
        <View className="additional-info">
          <View className="info-section">
            <Text className="section-title">设置</Text>
            <View className="info-item">
              <Text className="info-label">推送通知</Text>
              <Text className="info-value">已启用</Text>
            </View>
            <View className="info-item">
              <Text className="info-label">暗黑主题</Text>
              <Text className="info-value">已启用</Text>
            </View>
          </View>

          <View className="info-section">
            <Text className="section-title">关于</Text>
            <View className="info-item">
              <Text className="info-label">版本</Text>
              <Text className="info-value">1.0.0</Text>
            </View>
            <View className="info-item">
              <Text className="info-label">隐私政策</Text>
            </View>
          </View>
        </View>

        <View className="bottom-spacer" />
      </ScrollView>

      {/* Custom TabBar */}
      <CustomTabBar activeIndex={4} />
    </View>);

}