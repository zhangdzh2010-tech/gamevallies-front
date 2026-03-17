import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, ScrollView, Input } from '@tarojs/components';
import { useRoute, useNavigation } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import * as gameService from '../../../services/game';
import * as socialService from '../../../services/social';
import { GlobalGamePlayer } from '../../../components/common/GamePlayer';
import useGamePlayerStore from '../../../stores/gamePlayer';
import { Storage } from '../../../utils/storage';
import './index.scss';

function formatTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function formatNumber(num) {
  const n = Number(num) || 0;
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

// Single comment row (used for both top-level and replies)
function CommentRow({ comment, currentUserId, isReply, likedIds, onLike, onReply, onDelete }) {
  const isLiked = likedIds.has(comment.id);
  const isOwn = currentUserId && comment.authorId === currentUserId;
  const avatar = comment.author?.avatar || '';

  return (
    <View className={`comment-item ${isReply ? 'is-reply' : ''}`}>
      <View className="comment-avatar-wrap">
        {avatar.startsWith('http') ? (
          <Image className="comment-avatar-img" src={avatar} mode="aspectFill" />
        ) : (
          <Text className="comment-avatar-emoji">{avatar || '👤'}</Text>
        )}
      </View>
      <View className="comment-body">
        <View className="comment-header">
          <Text className="comment-name">{comment.author?.username || '用户'}</Text>
          <Text className="comment-time">{formatTime(comment.createdAt)}</Text>
        </View>
        <Text className="comment-content">{comment.content}</Text>
        <View className="comment-actions">
          <View className={`comment-action ${isLiked ? 'liked' : ''}`} onClick={() => onLike(comment.id)}>
            <Text className="comment-action-icon">♥</Text>
            <Text className="comment-action-count">{comment.likes > 0 ? comment.likes : ''}</Text>
          </View>
          {!isReply && (
            <View className="comment-action" onClick={() => onReply(comment)}>
              <Text className="comment-action-icon">💬</Text>
              <Text className="comment-action-label">回复</Text>
            </View>
          )}
          {isOwn && (
            <View className="comment-action danger" onClick={() => onDelete(comment.id)}>
              <Text className="comment-action-icon">🗑</Text>
              <Text className="comment-action-label">删除</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function GameDetail() {
  const route = useRoute();
  const navigation = useNavigation();
  const gameId = route.params?.id;
  const { windowHeight = 750 } = Taro.getSystemInfoSync();
  const scrollViewHeight = windowHeight - 96; // minus input bar height

  const openGame = useGamePlayerStore((s) => s.openGame);
  const currentUser = Storage.getUser();
  const currentUserId = currentUser?.id;

  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);

  // Comments state
  const [comments, setComments] = useState([]);
  const [totalComments, setTotalComments] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentPage, setCommentPage] = useState(1);

  // Reply state: { id, username } or null
  const [replyingTo, setReplyingTo] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Like tracking for comments
  const [likedCommentIds, setLikedCommentIds] = useState(new Set());

  // Expanded replies: { [commentId]: allReplies[] }
  const [expandedReplies, setExpandedReplies] = useState({});
  const [loadingReplies, setLoadingReplies] = useState({});

  useEffect(() => {
    if (!gameId) { setLoading(false); return; }
    const load = async () => {
      try {
        const gameData = await gameService.getGame(gameId);
        setGame(gameData);
        setLikeCount(gameData?.likes || 0);
      } catch {
        Taro.showToast({ title: '加载失败', icon: 'none' });
      } finally {
        setLoading(false);
      }
    };
    load();
    loadComments(1, false);
  }, [gameId]);

  const loadComments = async (pg, append) => {
    setLoadingComments(true);
    try {
      const result = await socialService.getComments(gameId, pg, 20);
      const items = result?.items || [];
      setComments((prev) => append ? [...prev, ...items] : items);
      setTotalComments(result?.total || 0);
      setHasMore(result?.hasMore || false);
      setCommentPage(pg);
    } catch {
      // ignore
    } finally {
      setLoadingComments(false);
    }
  };

  const handleLoadMore = () => {
    if (!hasMore || loadingComments) return;
    loadComments(commentPage + 1, true);
  };

  const handleExpandReplies = async (comment) => {
    if (expandedReplies[comment.id]) {
      // Collapse
      setExpandedReplies((prev) => { const n = { ...prev }; delete n[comment.id]; return n; });
      return;
    }
    setLoadingReplies((prev) => ({ ...prev, [comment.id]: true }));
    try {
      const result = await socialService.getCommentReplies(comment.id, 1, 50);
      setExpandedReplies((prev) => ({ ...prev, [comment.id]: result?.items || [] }));
    } catch {
      Taro.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      setLoadingReplies((prev) => ({ ...prev, [comment.id]: false }));
    }
  };

  const handleSend = async () => {
    const text = commentText.trim();
    if (!text) return;
    if (!Storage.getToken()) {
      Taro.showToast({ title: '请先登录后再评论', icon: 'none' });
      return;
    }
    setSubmitting(true);
    try {
      const parentId = replyingTo?.id || null;
      const newComment = await socialService.createComment(gameId, text, parentId);
      if (parentId) {
        // Append reply under parent
        setComments((prev) => prev.map((c) =>
          c.id === parentId
            ? { ...c, replyCount: (c.replyCount || 0) + 1, replies: [...(c.replies || []), newComment] }
            : c
        ));
        // Also update expanded replies if open
        setExpandedReplies((prev) =>
          prev[parentId] ? { ...prev, [parentId]: [...prev[parentId], newComment] } : prev
        );
      } else {
        setComments((prev) => [newComment, ...prev]);
        setTotalComments((prev) => prev + 1);
      }
      setCommentText('');
      setReplyingTo(null);
    } catch {
      Taro.showToast({ title: '发布失败，请重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCommentLike = async (commentId) => {
    const isCurrentlyLiked = likedCommentIds.has(commentId);
    const delta = isCurrentlyLiked ? -1 : 1;
    // Optimistic
    setLikedCommentIds((prev) => {
      const next = new Set(prev);
      isCurrentlyLiked ? next.delete(commentId) : next.add(commentId);
      return next;
    });
    const applyDelta = (list) => (list || []).map((c) => {
      if (c.id === commentId) return { ...c, likes: Math.max(0, (c.likes || 0) + delta) };
      return { ...c, replies: applyDelta(c.replies) };
    });
    setComments((prev) => applyDelta(prev));
    setExpandedReplies((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { next[k] = applyDelta(next[k]); });
      return next;
    });
    try {
      const result = await socialService.likeComment(commentId);
      setLikedCommentIds((prev) => {
        const next = new Set(prev);
        result?.liked ? next.add(commentId) : next.delete(commentId);
        return next;
      });
    } catch {
      // rollback
      setLikedCommentIds((prev) => {
        const next = new Set(prev);
        isCurrentlyLiked ? next.add(commentId) : next.delete(commentId);
        return next;
      });
      setComments((prev) => applyDelta(prev)); // re-apply original
    }
  };

  const handleDelete = (commentId) => {
    Taro.showModal({
      title: '删除评论',
      content: '确定要删除这条评论吗？',
      confirmColor: '#ff5c8a',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await socialService.deleteComment(commentId);
          setComments((prev) =>
            prev
              .filter((c) => c.id !== commentId)
              .map((c) => ({
                ...c,
                replies: (c.replies || []).filter((r) => r.id !== commentId),
              }))
          );
          setExpandedReplies((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((k) => { next[k] = next[k].filter((r) => r.id !== commentId); });
            return next;
          });
          setTotalComments((prev) => Math.max(0, prev - 1));
          Taro.showToast({ title: '已删除', icon: 'success' });
        } catch {
          Taro.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  };

  const handleReply = (comment) => {
    setReplyingTo({ id: comment.id, username: comment.author?.username || '用户' });
    setCommentText('');
  };

  const handleLikeGame = async () => {
    try {
      await socialService.likeGame('game', gameId);
      setIsLiked((prev) => {
        setLikeCount((c) => prev ? c - 1 : c + 1);
        return !prev;
      });
    } catch {
      Taro.showToast({ title: '操作失败', icon: 'none' });
    }
  };

  const handleFork = async () => {
    try {
      await gameService.forkGame(gameId);
      Taro.showToast({ title: '已复制到创作区', icon: 'success' });
    } catch {
      Taro.showToast({ title: 'Fork 失败', icon: 'none' });
    }
  };

  const handleFollow = async () => {
    if (!game?.author?.id) return;
    try {
      await socialService.followUser(game.author.id);
      Taro.showToast({ title: '已关注创作者', icon: 'success' });
    } catch {
      Taro.showToast({ title: '关注失败', icon: 'none' });
    }
  };

  const renderReplies = (comment) => {
    const expanded = expandedReplies[comment.id];
    const inlineReplies = expanded || comment.replies || [];
    const replyCount = comment.replyCount || 0;
    const isExpanded = !!expanded;
    const isLoadingR = loadingReplies[comment.id];

    return (
      <View className="replies-container">
        {inlineReplies.map((reply) => (
          <CommentRow
            key={reply.id}
            comment={reply}
            currentUserId={currentUserId}
            isReply
            likedIds={likedCommentIds}
            onLike={handleCommentLike}
            onReply={handleReply}
            onDelete={handleDelete}
          />
        ))}
        {replyCount > 3 && !isExpanded && (
          <View className="expand-replies" onClick={() => handleExpandReplies(comment)}>
            <Text>{isLoadingR ? '加载中...' : `查看全部 ${replyCount} 条回复 ›`}</Text>
          </View>
        )}
        {isExpanded && replyCount > 3 && (
          <View className="expand-replies" onClick={() => handleExpandReplies(comment)}>
            <Text>收起回复 ›</Text>
          </View>
        )}
        <View className="reply-shortcut" onClick={() => handleReply(comment)}>
          <Text>回复</Text>
        </View>
      </View>
    );
  };

  if (loading || !game) {
    return (
      <View className="game-detail">
        <View style={{ padding: '40px', textAlign: 'center' }}>
          <Text style={{ color: '#8b87a3', fontSize: '28px' }}>{loading ? '加载中...' : '游戏不存在'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="game-detail">
      <ScrollView className="detail-scroll" style={{ height: `${scrollViewHeight}px` }} scrollY>
        {/* Preview Banner */}
        <View className="preview-banner" style={{ background: 'linear-gradient(135deg, #6e56ff30 0%, #6e56ff50 100%)' }}>
          <Text className="preview-emoji">{game.emoji || '🎮'}</Text>
        </View>

        {/* Back Button */}
        <View className="back-btn" onClick={() => navigation.back()}>←</View>

        <View className="detail-content">
          {/* Title and Description */}
          <View className="title-section">
            <Text className="title">{game.title}</Text>
            <Text className="description">{game.description}</Text>
          </View>

          {/* Author Row */}
          <View className="author-row">
            <View className="author-info">
              {(game.author?.avatar || '').startsWith('http') ? (
                <Image style={{ width: '60px', height: '60px', borderRadius: '50%' }} src={game.author.avatar} mode="aspectFill" />
              ) : (
                <Text className="author-emoji">{game.author?.avatar || '👤'}</Text>
              )}
              <View className="author-details">
                <Text className="author-name">{game.author?.username || game.author || '未知'}</Text>
                <Text className="author-desc">{game.author?.bio || ''}</Text>
              </View>
            </View>
            <View className="follow-btn" onClick={handleFollow}>关注</View>
          </View>

          {/* Stats Row */}
          <View className="stats-row">
            {[
              { icon: '▶', value: formatNumber(game.plays), label: '次游玩' },
              { icon: '♥', value: formatNumber(game.likes), label: '次点赞' },
              { icon: '🔀', value: formatNumber(game.forks), label: '次复制' },
              { icon: '⏱', value: game.avgPlayTime || '--', label: '平均时长' },
            ].map((s) => (
              <View key={s.label} className="stat-item">
                <Text className="stat-label">{s.icon}</Text>
                <Text className="stat-value">{s.value}</Text>
                <Text className="stat-text">{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Action Buttons */}
          <View className="action-buttons">
            <View className="play-btn" onClick={() => game?.gameUrl ? openGame(game.gameUrl, game.title) : Taro.showToast({ title: '游戏暂不可用', icon: 'none' })}>
              <Text className="btn-icon">▶</Text>
              <Text className="btn-text">试玩</Text>
            </View>
            <View className={`icon-btn like-btn ${isLiked ? 'liked' : ''}`} onClick={handleLikeGame}>
              <Text>♥</Text>
              <Text className="count">{formatNumber(likeCount)}</Text>
            </View>
            <View className="icon-btn fork-btn" onClick={handleFork}>
              <Text>🔀</Text>
              <Text className="count">Fork</Text>
            </View>
          </View>

          {/* Tags */}
          {(game.tags || []).length > 0 && (
            <View className="tags-section">
              {game.tags.map((tag) => <View key={tag} className="tag">{tag}</View>)}
            </View>
          )}

          {/* Comments Section */}
          <View className="comments-section">
            <Text className="comments-title">
              💬 评论 {totalComments > 0 ? `(${formatNumber(totalComments)})` : ''}
            </Text>

            {loadingComments && comments.length === 0 && (
              <View className="comments-loading"><Text>加载评论中...</Text></View>
            )}

            {!loadingComments && comments.length === 0 && (
              <View className="comments-empty">
                <Text className="comments-empty-icon">💬</Text>
                <Text className="comments-empty-text">还没有评论，来说点什么吧</Text>
              </View>
            )}

            <View className="comment-list">
              {comments.map((c) => (
                <View key={c.id} className="comment-thread">
                  <CommentRow
                    comment={c}
                    currentUserId={currentUserId}
                    isReply={false}
                    likedIds={likedCommentIds}
                    onLike={handleCommentLike}
                    onReply={handleReply}
                    onDelete={handleDelete}
                  />
                  {renderReplies(c)}
                </View>
              ))}
            </View>

            {hasMore && (
              <View className="load-more" onClick={handleLoadMore}>
                <Text>{loadingComments ? '加载中...' : '加载更多评论'}</Text>
              </View>
            )}
          </View>

          <View className="bottom-spacer" />
        </View>
      </ScrollView>

      {/* Comment Input Bar */}
      <View className="comment-input-bar">
        {replyingTo && (
          <View className="reply-hint">
            <Text className="reply-hint-text">回复 @{replyingTo.username}</Text>
            <View className="reply-cancel" onClick={() => { setReplyingTo(null); setCommentText(''); }}>
              <Text>×</Text>
            </View>
          </View>
        )}
        <View className="comment-input-row">
          <Input
            className="comment-input"
            type="text"
            placeholder={replyingTo ? `回复 @${replyingTo.username}...` : '写下你的想法...'}
            placeholderStyle="color: #55516e"
            value={commentText}
            onInput={(e) => setCommentText(e.detail.value)}
            confirmType="send"
            onConfirm={handleSend}
          />
          <View
            className={`comment-send ${(!commentText.trim() || submitting) ? 'disabled' : ''}`}
            onClick={handleSend}
          >
            <Text>{submitting ? '...' : '发送'}</Text>
          </View>
        </View>
      </View>

      <GlobalGamePlayer />
    </View>
  );
}
