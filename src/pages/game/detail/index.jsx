import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Input } from '@tarojs/components';
import { useRoute, useNavigation } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import * as gameService from '../../../services/game';
import * as socialService from '../../../services/social';
import { GamePlayer } from '../../../components/common/GamePlayer';
import useGamePlayerStore, { resolveGameUrl } from '../../../stores/gamePlayer';
import './index.scss';








export default function GameDetail() {
  const route = useRoute();
  const navigation = useNavigation();
  const gameId = route.params?.id || '1';

  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [liked, setLiked] = useState(0);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState([]);
  const [playingUrl, setPlayingUrl] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [gameData, commentsData] = await Promise.all([
          gameService.getGame(gameId),
          socialService.getComments(gameId, 1, 20),
        ]);
        setGame(gameData);
        setLiked(gameData.likes || 0);
        setComments(commentsData?.items || []);
      } catch (e) {
        Taro.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [gameId]);

  const handlePlayClick = () => {
    if (game?.gameUrl) {
      setPlayingUrl(resolveGameUrl(game.gameUrl));
    } else {
      Taro.showToast({ title: '游戏暂不可用', icon: 'none' });
    }
  };

  const handleLike = async () => {
    try {
      await socialService.likeGame('game', gameId);
      setIsLiked(!isLiked);
      setLiked((prev) => isLiked ? prev - 1 : prev + 1);
    } catch (e) {
      Taro.showToast({ title: '操作失败', icon: 'none' });
    }
  };

  const handleFork = async () => {
    try {
      await gameService.forkGame(gameId);
      Taro.showToast({ title: '已复制到创作区', icon: 'success' });
    } catch (e) {
      Taro.showToast({ title: 'Fork 失败', icon: 'none' });
    }
  };

  const handleFollow = async () => {
    if (!game?.author?.id) return;
    try {
      await socialService.followUser(game.author.id);
      Taro.showToast({ title: '已关注创作者', icon: 'success' });
    } catch (e) {
      Taro.showToast({ title: '关注失败', icon: 'none' });
    }
  };

  const handleComment = async () => {
    if (!comment.trim()) {
      Taro.showToast({ title: '请输入评论内容', icon: 'none' });
      return;
    }
    try {
      const newComment = await socialService.createComment(gameId, comment, null);
      setComments([newComment, ...comments]);
      setComment('');
      Taro.showToast({ title: '评论发布成功', icon: 'success' });
    } catch (e) {
      Taro.showToast({ title: '评论失败', icon: 'none' });
    }
  };

  const handleCommentLike = async (commentId) => {
    try {
      await socialService.likeGame('comment', commentId);
      setComments(comments.map((c) =>
        c.id === commentId ? { ...c, likes: (c.likes || 0) + 1 } : c
      ));
    } catch (e) {
      // silent
    }
  };

  const formatNumber = (num) => {
    const n = Number(num) || 0;
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toString();
  };

  if (loading || !game) {
    return (
      <View className="game-detail">
        <View style={{ padding: '40px', textAlign: 'center' }}>
          <Text>{loading ? '加载中...' : '游戏不存在'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="game-detail">
      <ScrollView className="detail-scroll" scrollY>
        {/* Preview Banner */}
        <View
          className="preview-banner"
          style={{
            background: `linear-gradient(135deg, #6e56ff30 0%, #6e56ff50 100%)`
          }}>

          <Text className="preview-emoji">{game.emoji || '🎮'}</Text>
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
              <Text className="author-emoji">{game.author?.avatar || '👤'}</Text>
              <View className="author-details">
                <Text className="author-name">{game.author?.username || game.author || '未知'}</Text>
                <Text className="author-desc">{game.author?.bio || ''}</Text>
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
              <Text className="stat-value">{game.avgPlayTime || '--'}</Text>
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
            {(game.tags || []).map((tag) =>
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
                  <Text className="comment-avatar">{c.author?.avatar || '👤'}</Text>
                  <View className="comment-body">
                    <View className="comment-header">
                      <Text className="comment-name">{c.author?.username || c.username || '用户'}</Text>
                      <Text className="comment-time">{c.timestamp || c.createdAt || ''}</Text>
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

      <GamePlayer
        gameUrl={playingUrl}
        gameTitle={game?.title}
        onClose={() => setPlayingUrl('')}
      />
    </View>);

}