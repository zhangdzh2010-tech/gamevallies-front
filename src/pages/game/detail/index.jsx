import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Input } from

'@tarojs/components';
import { useRoute, useNavigation } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import './index.scss';











// Mock game data
const GAMES_MAP = {
  '1': {
    id: '1',
    title: '2048 数字游戏',
    description: '通过滑动合并相同的数字，最终达到2048的目标。这是一个考验策略和反应速度的经典益智游戏。',
    emoji: '🎮',
    color: '#6e56ff',
    plays: 23400,
    likes: 5600,
    forks: 234,
    avgPlayTime: '8分钟',
    author: '创意工厂',
    authorEmoji: '🎨',
    authorDesc: '专注于创意游戏开发的团队',
    tags: ['益智', '休闲', '数字'],
    comments: [
    {
      id: '1',
      avatar: '👨‍💻',
      username: '用户A',
      content: '很有意思的游戏，美术风格很喜欢！',
      timestamp: '2小时前',
      likes: 12
    },
    {
      id: '2',
      avatar: '👩‍🎨',
      username: '用户B',
      content: '难度不错，玩了好久还没过关',
      timestamp: '4小时前',
      likes: 8
    },
    {
      id: '3',
      avatar: '🧑‍🚀',
      username: '用户C',
      content: '建议加入排行榜功能',
      timestamp: '6小时前',
      likes: 5
    }]

  },
  '2': {
    id: '2',
    title: '太空防御',
    description: '击落来临的陨石和敌舰，保护地球安全。支持多种武器和升级，提供丰富的游戏体验。',
    emoji: '🚀',
    color: '#2dd4a8',
    plays: 18900,
    likes: 4200,
    forks: 189,
    avgPlayTime: '15分钟',
    author: '星空开发',
    authorEmoji: '⭐',
    authorDesc: '科幻游戏开发团队',
    tags: ['射击', '动作', '科幻'],
    comments: [
    {
      id: '1',
      avatar: '🎮',
      username: '游戏爱好者',
      content: '爽到爆！特别喜欢爆炸效果',
      timestamp: '1小时前',
      likes: 20
    }]

  }
};

export default function GameDetail() {
  const route = useRoute();
  const navigation = useNavigation();
  const gameId = route.params?.id || '1';

  const game = GAMES_MAP[gameId] || GAMES_MAP['1'];

  const [isLiked, setIsLiked] = useState(false);
  const [liked, setLiked] = useState(game.likes);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState(game.comments || []);

  const handlePlayClick = () => {
    navigation.push({
      url: `/pages/game/play/index?id=${gameId}`
    });
  };

  const handleLike = () => {
    setIsLiked(!isLiked);
    setLiked(isLiked ? liked - 1 : liked + 1);
  };

  const handleFork = () => {
    Taro.showToast({
      title: '已复制到创作区',
      icon: 'success'
    });
  };

  const handleFollow = () => {
    Taro.showToast({
      title: '已关注创作者',
      icon: 'success'
    });
  };

  const handleComment = () => {
    if (!comment.trim()) {
      Taro.showToast({
        title: '请输入评论内容',
        icon: 'none'
      });
      return;
    }

    const newComment = {
      id: Date.now().toString(),
      avatar: '👤',
      username: '你',
      content: comment,
      timestamp: '刚刚',
      likes: 0
    };

    setComments([newComment, ...comments]);
    setComment('');
    Taro.showToast({
      title: '评论发布成功',
      icon: 'success'
    });
  };

  const handleCommentLike = (commentId) => {
    setComments(
      comments.map((c) =>
      c.id === commentId ? { ...c, likes: c.likes + 1 } : c
      )
    );
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
    <View className="game-detail">
      <ScrollView className="detail-scroll" scrollY>
        {/* Preview Banner */}
        <View
          className="preview-banner"
          style={{
            background: `linear-gradient(135deg, ${game.color}30 0%, ${game.color}50 100%)`
          }}>
          
          <Text className="preview-emoji">{game.emoji}</Text>
        </View>

        {/* Back Button */}
        <View
          className="back-btn"
          onClick={() => navigation.back()}>
          
          ←
        </View>

        <View className="detail-content">
          {/* Title and Description */}
          <View className="title-section">
            <Text className="title">{game.title}</Text>
            <Text className="description">{game.description}</Text>
          </View>

          {/* Author Row */}
          <View className="author-row">
            <View className="author-info">
              <Text className="author-emoji">{game.authorEmoji}</Text>
              <View className="author-details">
                <Text className="author-name">{game.author}</Text>
                <Text className="author-desc">{game.authorDesc}</Text>
              </View>
            </View>
            <View className="follow-btn" onClick={handleFollow}>
              关注
            </View>
          </View>

          {/* Stats Row */}
          <View className="stats-row">
            <View className="stat-item">
              <Text className="stat-label">▶</Text>
              <Text className="stat-value">{formatNumber(game.plays)}</Text>
              <Text className="stat-text">次游玩</Text>
            </View>
            <View className="stat-item">
              <Text className="stat-label">♥</Text>
              <Text className="stat-value">{formatNumber(game.likes)}</Text>
              <Text className="stat-text">次点赞</Text>
            </View>
            <View className="stat-item">
              <Text className="stat-label">🔀</Text>
              <Text className="stat-value">{formatNumber(game.forks)}</Text>
              <Text className="stat-text">次复制</Text>
            </View>
            <View className="stat-item">
              <Text className="stat-label">⏱</Text>
              <Text className="stat-value">{game.avgPlayTime}</Text>
              <Text className="stat-text">平均时长</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="action-buttons">
            <View className="play-btn" onClick={handlePlayClick}>
              <Text className="btn-icon">▶</Text>
              <Text className="btn-text">试玩</Text>
            </View>
            <View
              className={`icon-btn like-btn ${isLiked ? 'liked' : ''}`}
              onClick={handleLike}>
              
              <Text>♥</Text>
              <Text className="count">{formatNumber(liked)}</Text>
            </View>
            <View className="icon-btn fork-btn" onClick={handleFork}>
              <Text>🔀</Text>
              <Text className="count">Fork</Text>
            </View>
          </View>

          {/* Tags */}
          <View className="tags-section">
            {game.tags.map((tag) =>
            <View key={tag} className="tag">
                {tag}
              </View>
            )}
          </View>

          {/* Comments Section */}
          <View className="comments-section">
            <Text className="comments-title">
              💬 评论 ({formatNumber(comments.length)})
            </Text>

            <View className="comment-list">
              {comments.map((c) =>
              <View key={c.id} className="comment-item">
                  <Text className="comment-avatar">{c.avatar}</Text>
                  <View className="comment-body">
                    <View className="comment-header">
                      <Text className="comment-name">{c.username}</Text>
                      <Text className="comment-time">{c.timestamp}</Text>
                    </View>
                    <Text className="comment-content">{c.content}</Text>
                    <View
                    className="comment-like"
                    onClick={() => handleCommentLike(c.id)}>
                    
                      <Text>♥ {c.likes}</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </View>

          <View className="bottom-spacer" />
        </View>
      </ScrollView>

      {/* Comment Input */}
      <View className="comment-input-box">
        <Input
          className="comment-input"
          type="text"
          placeholder="写下你的想法..."
          placeholderStyle="color: #55516e"
          value={comment}
          onInput={(e) => setComment(e.detail.value)} />
        
        <View className="comment-send" onClick={handleComment}>
          发送
        </View>
      </View>
    </View>);

}