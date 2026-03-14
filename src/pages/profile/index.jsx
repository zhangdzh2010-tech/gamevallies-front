import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { Storage } from '../../utils/storage';
import * as authService from '../../services/auth';
import * as gameService from '../../services/game';
import useGamePlayerStore from '../../stores/gamePlayer';
import Taro from '@tarojs/taro';
import './index.scss';

const GAME_COLORS = ['#6e56ff', '#2dd4a8', '#fbbf24', '#ff5c8a'];
const GAME_EMOJIS = ['🎮', '🚀', '🎵', '💎', '🐦', '🎣', '🧩', '🎯'];

function normalizeGame(game, index) {
  return {
    ...game,
    emoji: game.emoji || GAME_EMOJIS[index % GAME_EMOJIS.length],
    color: game.color || GAME_COLORS[index % GAME_COLORS.length],
    author: game.author?.username || game.author || '我',
    authorEmoji: game.authorEmoji || '👤',
    isHot: (game.plays || 0) > 10000,
  };
}

export default function Profile() {
  const openGame = useGamePlayerStore((s) => s.openGame);
  const [activeTab, setActiveTab] = useState('created');
  const [profile, setProfile] = useState({
    name: '',
    avatar: '👤',
    bio: '',
    followers: 0,
    following: 0,
    totalGames: 0,
    totalPlays: 0,
  });
  const [myGames, setMyGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const { windowHeight = 750 } = Taro.getSystemInfoSync();
  const scrollViewHeight = windowHeight - 400 - 120;

  useEffect(() => {
    const token = Storage.getToken();
    if (!token) {
      Taro.showToast({ title: '请先登录', icon: 'none', duration: 1500 });
      setTimeout(() => {
        Taro.navigateTo({ url: '/pages/login/index' });
      }, 500);
      return;
    }

    // Load cached user
    const storedUser = Storage.getUser();
    if (storedUser) {
      setProfile((prev) => ({
        ...prev,
        name: storedUser.username || storedUser.displayName || '用户',
        bio: storedUser.bio || '这个人很懒，什么都没写',
      }));
    }

    // Fetch fresh profile
    authService.getMe().then((user) => {
      if (user) {
        setProfile((prev) => ({
          ...prev,
          name: user.username || user.displayName || prev.name,
          bio: user.bio || prev.bio,
          followers: user.followerCount || 0,
          following: user.followingCount || 0,
        }));
      }
    }).catch(() => {});

    fetchMyGames();
  }, []);

  const fetchMyGames = async () => {
    setLoadingGames(true);
    try {
      const result = await gameService.getMyGames(1, 20);
      const items = (result?.items || []).map(normalizeGame);
      setMyGames(items);
      setProfile((prev) => ({
        ...prev,
        totalGames: result?.total || items.length,
        totalPlays: items.reduce((sum, g) => sum + (g.plays || 0), 0),
      }));
    } catch (e) {
      console.error('fetchMyGames error:', e);
    } finally {
      setLoadingGames(false);
    }
  };

  const handleLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          Storage.removeToken();
          Storage.removeRefreshToken();
          Storage.removeUser();
          Taro.showToast({ title: '已退出登录', icon: 'success' });
          setTimeout(() => {
            Taro.navigateTo({ url: '/pages/login/index' });
          }, 1000);
        }
      }
    });
  };

  const handleEditProfile = () => {
    Taro.showToast({ title: '编辑功能开发中', icon: 'none' });
  };

  const handlePlay = (game) => {
    if (game.gameUrl) {
      openGame(game.gameUrl, game.title);
    }
  };

  const handleFork = (gameId) => {
    console.log('Fork game:', gameId);
  };

  const formatNumber = (num) => {
    if (num >= 10000) return (num / 10000).toFixed(1) + '万';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return String(num);
  };

  return (
    <View className="profile-container">
      <View className="profile-header">
        <View className="header-top">
          <Text className="avatar">{profile.avatar || '👤'}</Text>
          <View className="header-actions">
            <View className="edit-btn" onClick={handleEditProfile}>编辑资料</View>
            <View className="logout-btn" onClick={handleLogout}>退出</View>
          </View>
        </View>

        <View className="user-info">
          <Text className="user-name">{profile.name || '用户'}</Text>
          <Text className="user-bio">{profile.bio || '这个人很懒，什么都没写'}</Text>
        </View>

        <View className="stats-row">
          <View className="stat">
            <Text className="stat-value">{formatNumber(profile.followers)}</Text>
            <Text className="stat-label">粉丝</Text>
          </View>
          <View className="stat">
            <Text className="stat-value">{formatNumber(profile.following)}</Text>
            <Text className="stat-label">关注</Text>
          </View>
          <View className="stat">
            <Text className="stat-value">{profile.totalGames}</Text>
            <Text className="stat-label">游戏</Text>
          </View>
          <View className="stat">
            <Text className="stat-value">{formatNumber(profile.totalPlays)}</Text>
            <Text className="stat-label">总玩数</Text>
          </View>
        </View>
      </View>

      <ScrollView className="profile-scroll" style={{ height: `${scrollViewHeight}px` }} scrollY>
        <View className="tabs-container">
          <View
            className={`tab-item ${activeTab === 'created' ? 'active' : ''}`}
            onClick={() => setActiveTab('created')}
          >
            <Text>创建的游戏 ({profile.totalGames})</Text>
          </View>
          <View
            className={`tab-item ${activeTab === 'liked' ? 'active' : ''}`}
            onClick={() => setActiveTab('liked')}
          >
            <Text>赞过的游戏</Text>
          </View>
        </View>

        {activeTab === 'created' && (
          <View className="games-section">
            {loadingGames ? (
              <View className="empty-state">
                <Text className="empty-text">加载中...</Text>
              </View>
            ) : myGames.length > 0 ? (
              <View className="games-grid">
                {myGames.map((game) => (
                  <GameCard key={game.id} game={game} onPlay={handlePlay} onFork={handleFork} />
                ))}
              </View>
            ) : (
              <View className="empty-state">
                <Text className="empty-icon">🎮</Text>
                <Text className="empty-text">还没有创建游戏</Text>
                <View className="empty-action" onClick={() => Taro.switchTab({ url: '/pages/create/index' })}>
                  <Text>去创作</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {activeTab === 'liked' && (
          <View className="games-section">
            <View className="empty-state">
              <Text className="empty-icon">♥</Text>
              <Text className="empty-text">暂无赞过的游戏</Text>
            </View>
          </View>
        )}

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
          </View>
        </View>

        <View className="bottom-spacer" />
      </ScrollView>

      <CustomTabBar activeIndex={4} />
      <GlobalGamePlayer />
    </View>
  );
}
