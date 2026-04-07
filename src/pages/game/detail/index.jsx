import React, { useState, useEffect } from 'react';
import { View, Text, Image, Input } from '@tarojs/components';
import { useRoute } from '@tarojs/hooks';
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro';
import * as gameService from '../../../services/game';
import * as socialService from '../../../services/social';
import { GlobalGamePlayer } from '../../../components/common/GamePlayer';
import { PageScrollContainer } from '../../../components/common/PageScrollContainer';
import { PaywallPopup } from '../../../components/common/PaywallPopup';
import { SharePanel } from '../../../components/common/SharePanel';
import useGamePlayerStore from '../../../stores/gamePlayer';
import useQuotaStore from '../../../stores/quotaStore';
import { useGameStore } from '../../../store/gameStore';
import {
  LOGIN_PAGE_URL,
  openForkPageWithAuth,
  openIteratePageWithAuth,
  setPostLoginRedirect,
} from '../../../utils/authNavigation';
import { isGameBookmarked, setGameBookmarked } from '../../../utils/bookmarks';
import { subscribeGameUnlocked } from '../../../utils/gameUnlock';
import { getGameCoverUrl } from '../../../utils/media';
import { getGameOrientation } from '../../../utils/gameOrientation';
import { navigateBackOrHome } from '../../../utils/navigation';
import { Storage } from '../../../utils/storage';
import { getSafeSystemInfo } from '../../../utils/systemInfo';
import { buildGameDetailPath, getShareConfig } from '../../../utils/share';
import { isH5Runtime } from '../../../utils/runtime';
import { ENV } from '../../../config/env';
import './index.scss';

const COMMENTS_SECTION_ID = 'game-comments-section';

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
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function normalizeAvatarSource(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed) || /^wxfile:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    return `${ENV.API_BASE_URL.replace(/\/$/, '')}${trimmed}`;
  }

  return '';
}

function isSuspiciousProfileText(value) {
  if (typeof value !== 'string') {
    return true;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  if (normalizeAvatarSource(trimmed)) {
    return true;
  }

  if (/[\\/]/.test(trimmed) || /\.(png|jpe?g|gif|webp|svg)$/i.test(trimmed)) {
    return true;
  }

  if (trimmed.length > 24 && /^[a-f0-9_.-]+$/i.test(trimmed)) {
    return true;
  }

  return false;
}

function getSafeDisplayText(candidates, fallback) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const trimmed = candidate.trim();
    if (!trimmed || isSuspiciousProfileText(trimmed)) {
      continue;
    }

    return trimmed;
  }

  return fallback;
}

function getAvatarFallback(value, name, fallback = '👤') {
  const avatarText = typeof value === 'string' ? value.trim() : '';
  if (avatarText && Array.from(avatarText).length <= 2 && !isSuspiciousProfileText(avatarText) && !/[/:.]/.test(avatarText)) {
    return avatarText;
  }

  const safeName = getSafeDisplayText([name], '');
  const firstChar = safeName ? Array.from(safeName)[0] : '';

  if (!firstChar) {
    return fallback;
  }

  return /^[a-z]$/i.test(firstChar) ? firstChar.toUpperCase() : firstChar;
}

function mergeUnlockedGame(game, payload) {
  const unlockedGame = payload?.game || {};

  return {
    ...(game || {}),
    ...unlockedGame,
    id: unlockedGame.id || game?.id || payload?.gameId || '',
    canPlay: true,
    requireSubscription: false,
    quotaRemaining: payload?.quotaRemaining ?? unlockedGame.quotaRemaining ?? game?.quotaRemaining ?? null,
  };
}

function applyCommentLikeDelta(list, commentId, delta) {
  return (list || []).map((comment) => {
    if (comment.id === commentId) {
      return {
        ...comment,
        likes: Math.max(0, (comment.likes || 0) + delta),
      };
    }

    return {
      ...comment,
      replies: applyCommentLikeDelta(comment.replies, commentId, delta),
    };
  });
}

function hydrateAuthorOwnedGame(game, currentUser) {
  if (!game || typeof game !== 'object') {
    return null;
  }

  const currentUserName = currentUser?.displayName
    || currentUser?.nickname
    || currentUser?.username
    || '我';
  const authorObject = typeof game.author === 'object' && game.author
    ? game.author
    : {
        id: game.authorId || currentUser?.id || '',
        username: typeof game.author === 'string' ? game.author : currentUserName,
        displayName: currentUserName,
      };

  return {
    ...game,
    author: authorObject,
    authorId: game.authorId || authorObject?.id || currentUser?.id || '',
    likes: Number(game.likes || game.likeCount || 0),
    plays: Number(game.plays || game.playCount || 0),
    forks: Number(game.forks || game.forkCount || 0),
    comments: Number(game.comments || game.commentCount || 0),
    viewerHasLiked: game.viewerHasLiked === true || game.liked === true,
    viewerHasBookmarked: game.viewerHasBookmarked === true || game.bookmarked === true,
    status: game.status || 'draft',
  };
}

function CommentRow({ comment, currentUserId, isReply, likedIds, onLike, onReply, onDelete }) {
  const isLiked = likedIds.has(comment.id);
  const isOwn = currentUserId && String(comment.authorId || comment.author?.id || '') === String(currentUserId);
  const avatar = comment.author?.avatar || comment.author?.avatarUrl || '';
  const avatarSrc = normalizeAvatarSource(comment.author?.avatarUrl || comment.author?.avatar);
  const displayName = getSafeDisplayText([
    comment.author?.displayName,
    comment.author?.nickname,
    comment.author?.username,
    typeof comment.author === 'string' ? comment.author : '',
  ], '用户');
  const avatarFallback = getAvatarFallback(avatar, displayName);

  return (
    <View className={`comment-item ${isReply ? 'is-reply' : ''}`}>
      <View className="comment-avatar-wrap">
        {avatarSrc ? (
          <Image className="comment-avatar-img" src={avatarSrc} mode="aspectFill" />
        ) : (
          <Text className="comment-avatar-emoji">{avatarFallback}</Text>
        )}
      </View>
      <View className="comment-body">
        <View className="comment-header">
          <Text className="comment-name">{displayName}</Text>
          <Text className="comment-time">{formatTime(comment.createdAt)}</Text>
        </View>
        <Text className="comment-content">{comment.content}</Text>
        <View className="comment-actions">
          <View className={`comment-action ${isLiked ? 'liked' : ''}`} onClick={() => onLike(comment.id)}>
            <View className="comment-action-icon comment-action-icon--like" />
            <Text className="comment-action-count">{comment.likes > 0 ? comment.likes : ''}</Text>
          </View>
          {!isReply && (
            <View className="comment-action" onClick={() => onReply(comment)}>
              <View className="comment-action-icon comment-action-icon--comment" />
              <Text className="comment-action-label">回复</Text>
            </View>
          )}
          {isOwn && (
            <View className="comment-action danger" onClick={() => onDelete(comment.id)}>
              <View className="comment-action-icon comment-action-icon--trash" />
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
  const gameId = route.params?.id;
  const authorViewRequested = route.params?.authorView === '1';
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const isH5 = isH5Runtime();
  const systemInfo = getSafeSystemInfo();
  const menuButtonRect =
    isWeapp && typeof Taro.getMenuButtonBoundingClientRect === 'function'
      ? Taro.getMenuButtonBoundingClientRect()
      : null;
  const { windowHeight = 750, safeArea, statusBarHeight = 0 } = systemInfo;
  const safeBottomInset = safeArea ? Math.max(windowHeight - safeArea.bottom, 0) : 0;
  const scrollViewHeight = windowHeight;
  const detailScrollStyle = isH5 ? undefined : { height: `${scrollViewHeight}px` };
  const menuTopInset = menuButtonRect
    ? Math.max(Math.round((menuButtonRect.top - statusBarHeight) * 0.92), 6)
    : 24;
  const topBarStyle = menuButtonRect
    ? {
        paddingTop: `${statusBarHeight + menuTopInset}px`,
        minHeight: `${menuButtonRect.bottom + 14}px`,
      }
    : isH5
      ? {
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          minHeight: 'calc(env(safe-area-inset-top, 0px) + 68px)',
        }
      : {
          paddingTop: '24px',
          minHeight: '96px',
        };
  const containerClassName = `game-detail${isH5 ? ' game-detail--h5' : ''}`;

  const openGame = useGamePlayerStore((s) => s.openGame);
  const storeCurrentGame = useGameStore((state) => state.currentGame);
  const currentUser = Storage.getUser();
  const currentUserId = currentUser?.id;

  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const [comments, setComments] = useState([]);
  const [totalComments, setTotalComments] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentPage, setCommentPage] = useState(1);

  const [replyingTo, setReplyingTo] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [likedCommentIds, setLikedCommentIds] = useState(new Set());
  const [expandedReplies, setExpandedReplies] = useState({});
  const [loadingReplies, setLoadingReplies] = useState({});
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [commentInputFocused, setCommentInputFocused] = useState(false);
  const [commentScrollTarget, setCommentScrollTarget] = useState('');

  const focusCommentComposer = (delay = 0) => setTimeout(() => {
    setCommentScrollTarget('');
    if (isH5 && typeof document !== 'undefined') {
      document.getElementById(COMMENTS_SECTION_ID)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    } else {
      setCommentScrollTarget(COMMENTS_SECTION_ID);
    }
    setCommentInputFocused(true);
  }, delay);

  const shareConfig = getShareConfig(game || { id: gameId, title: '游戏' });
  const authorId = game?.author?.id || game?.authorId;
  const isOwnGame = Boolean(currentUserId && String(currentUserId) === String(authorId || ''));
  const canForkGame = Boolean(game && !isOwnGame && game.allowFork !== false);
  const authorDisplayName = getSafeDisplayText([
    game?.author?.displayName,
    game?.author?.nickname,
    game?.author?.username,
    game?.authorName,
    game?.creatorName,
    typeof game?.author === 'string' ? game.author : '',
  ], '未知作者');
  const authorAvatar = game?.author?.avatar || game?.author?.avatarUrl || '';
  const authorAvatarSrc = normalizeAvatarSource(game?.author?.avatarUrl || game?.author?.avatar);
  const authorAvatarFallback = getAvatarFallback(authorAvatar, authorDisplayName);
  const continueCreateLabel = isOwnGame
    ? '继续优化'
    : (canForkGame ? '复刻后继续创作' : '作者未开放复刻权限');
  const continueCreateDisabled = Boolean(game) && !isOwnGame && !canForkGame;
  const requiresSubscriptionToPlay = game?.canPlay === false && !isOwnGame;
  const canPlayCurrentGame = Boolean(game?.gameUrl) && (game?.canPlay !== false || isOwnGame);
  const detailStats = [
    { key: 'plays', value: formatNumber(game?.plays), label: '次游玩' },
    { key: 'likes', value: formatNumber(game?.likes), label: '次点赞' },
    { key: 'forks', value: formatNumber(game?.forks), label: '次复刻' },
    { key: 'clock', value: game?.avgPlayTime || '--', label: '平均时长' },
  ];

  const reportShare = (platform) => {
    if (!gameId) {
      return;
    }

    socialService.recordShare(gameId, platform).catch(() => {});
  };

  useShareAppMessage(() => ({
    ...shareConfig,
    success: () => reportShare('weapp_session'),
  }));

  useShareTimeline(() => ({
    title: shareConfig.title,
    query: shareConfig.query,
    imageUrl: shareConfig.imageUrl,
    success: () => reportShare('weapp_timeline'),
  }));

  useEffect(() => {
    if (!gameId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const applyLoadedGame = (gameData) => {
      if (!gameData || cancelled) {
        return;
      }

      setGame(gameData);

      const bookmarked = Boolean(gameData?.viewerHasBookmarked) || isGameBookmarked(gameData?.id || gameId);
      setIsBookmarked(bookmarked);

      if (bookmarked) {
        setGameBookmarked({ ...gameData, viewerHasBookmarked: true }, true);
      }
    };

    const load = async () => {
      try {
        const gameData = await gameService.getGame(gameId);
        applyLoadedGame(gameData);

      } catch {
        let fallbackGame = null;

        if (authorViewRequested && String(storeCurrentGame?.id || '') === String(gameId)) {
          fallbackGame = hydrateAuthorOwnedGame(storeCurrentGame, currentUser);
        }

        if (!fallbackGame && Storage.getToken()) {
          try {
            const myGames = await gameService.getMyGames(1, 50);
            const matchedGame = (myGames?.items || []).find((item) => String(item?.id || '') === String(gameId));
            fallbackGame = hydrateAuthorOwnedGame(matchedGame, currentUser);
          } catch {
            // Ignore fallback lookup failures and keep the original error feedback.
          }
        }

        if (fallbackGame) {
          applyLoadedGame(fallbackGame);
        } else if (!cancelled) {
          Taro.showToast({ title: '加载失败', icon: 'none' });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    loadComments(1, false);

    return () => {
      cancelled = true;
    };
  }, [authorViewRequested, currentUserId, gameId, storeCurrentGame]);

  useEffect(() => {
    if (!Storage.getToken() || !authorId || isOwnGame) {
      setIsFollowing(false);
      return undefined;
    }

    let cancelled = false;
    socialService.checkFollowStatus(authorId)
      .then((following) => {
        if (!cancelled) {
          setIsFollowing(Boolean(following));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [authorId, isOwnGame]);

  useEffect(() => {
    if (!gameId) {
      return undefined;
    }

    return subscribeGameUnlocked((payload) => {
      if (String(payload?.gameId || '') !== String(gameId)) {
        return;
      }

      setGame((prev) => mergeUnlockedGame(prev, payload));
    });
  }, [gameId]);

  useEffect(() => {
    if (process.env.TARO_ENV !== 'weapp') return;

    Taro.showShareMenu({
      withShareTicket: true,
      showShareItems: ['shareAppMessage', 'shareTimeline'],
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!game || route.params?.openShare !== '1') return;
    setShowSharePanel(true);
  }, [game, route.params?.openShare]);

  useEffect(() => {
    if (route.params?.openComment !== '1' || loading) {
      return undefined;
    }

    const timer = focusCommentComposer(120);

    return () => clearTimeout(timer);
  }, [isH5, route.params?.openComment, loading]);

  const loadComments = async (page, append) => {
    if (!gameId) {
      return;
    }

    setLoadingComments(true);
    try {
      const result = await socialService.getComments(gameId, page, 20);
      const items = result?.items || [];
      setComments((prev) => (append ? [...prev, ...items] : items));
      setTotalComments(result?.total || 0);
      setHasMore(result?.hasMore || false);
      setCommentPage(page);
    } catch {
      // Ignore comments loading failures.
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
      setExpandedReplies((prev) => {
        const next = { ...prev };
        delete next[comment.id];
        return next;
      });
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
      setPostLoginRedirect(buildGameDetailPath(gameId, { openComment: 1, ...(authorViewRequested ? { authorView: 1 } : {}) }));
      Taro.navigateTo({ url: LOGIN_PAGE_URL }).catch(() => {});
      return;
    }

    setSubmitting(true);
    try {
      const parentId = replyingTo?.id || null;
      const newComment = await socialService.createComment(gameId, text, parentId);

      if (parentId) {
        setComments((prev) => prev.map((comment) => (
          comment.id === parentId
            ? { ...comment, replyCount: (comment.replyCount || 0) + 1, replies: [...(comment.replies || []), newComment] }
            : comment
        )));
        setExpandedReplies((prev) => (
          prev[parentId] ? { ...prev, [parentId]: [...prev[parentId], newComment] } : prev
        ));
      } else {
        setComments((prev) => [newComment, ...prev]);
        setTotalComments((prev) => prev + 1);
      }

      setCommentText('');
      setReplyingTo(null);
    } catch {
      Taro.showToast({ title: '评论发送失败，请重试', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCommentLike = async (commentId) => {
    const isCurrentlyLiked = likedCommentIds.has(commentId);
    const delta = isCurrentlyLiked ? -1 : 1;

    setLikedCommentIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlyLiked) {
        next.delete(commentId);
      } else {
        next.add(commentId);
      }
      return next;
    });

    setComments((prev) => applyCommentLikeDelta(prev, commentId, delta));
    setExpandedReplies((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        next[key] = applyCommentLikeDelta(next[key], commentId, delta);
      });
      return next;
    });

    try {
      const result = await socialService.likeComment(commentId);
      setLikedCommentIds((prev) => {
        const next = new Set(prev);
        if (result?.liked) {
          next.add(commentId);
        } else {
          next.delete(commentId);
        }
        return next;
      });
    } catch {
      setLikedCommentIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyLiked) {
          next.add(commentId);
        } else {
          next.delete(commentId);
        }
        return next;
      });

      setComments((prev) => applyCommentLikeDelta(prev, commentId, -delta));
      setExpandedReplies((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          next[key] = applyCommentLikeDelta(next[key], commentId, -delta);
        });
        return next;
      });
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
          setComments((prev) => prev
            .filter((comment) => comment.id !== commentId)
            .map((comment) => ({
              ...comment,
              replies: (comment.replies || []).filter((reply) => reply.id !== commentId),
            })));
          setExpandedReplies((prev) => {
            const next = { ...prev };
            Object.keys(next).forEach((key) => {
              next[key] = next[key].filter((reply) => reply.id !== commentId);
            });
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
    setReplyingTo({
      id: comment.id,
      username: getSafeDisplayText([
        comment.author?.displayName,
        comment.author?.nickname,
        comment.author?.username,
        typeof comment.author === 'string' ? comment.author : '',
      ], '用户'),
    });
    setCommentText('');
  };

  const handleBookmarkGame = () => {
    if (!game) {
      return;
    }

    const nextBookmarked = !isBookmarked;
    setGameBookmarked(game, nextBookmarked);
    setIsBookmarked(nextBookmarked);
    setGame((prev) => (prev ? { ...prev, viewerHasBookmarked: nextBookmarked } : prev));
    Taro.showToast({ title: nextBookmarked ? '已加入收藏' : '已取消收藏', icon: 'none' });
  };

  const handleOpenCommentComposer = () => {
    setCommentInputFocused(false);
    focusCommentComposer();
  };

  const handleContinueCreate = async () => {
    if (isOwnGame) {
      // #12 校验游戏是否处于可优化状态
      const gameStatus = game?.status;
      if (gameStatus === 'generating') {
        Taro.showToast({ title: '游戏还在生成中，请稍后再优化', icon: 'none' });
        return;
      }
      if (gameStatus === 'banned') {
        Taro.showToast({ title: '该游戏已被下架，无法优化', icon: 'none' });
        return;
      }
      openIteratePageWithAuth(game, game?.id);
      return;
    }

    if (!canForkGame) {
      Taro.showToast({ title: '作者未开放复刻权限', icon: 'none' });
      return;
    }

    openForkPageWithAuth(gameId);
  };

  const handleFollow = async () => {
    if (!authorId || isOwnGame || followLoading) {
      return;
    }

    if (!Storage.getToken()) {
      Taro.showToast({ title: '请先登录后再关注', icon: 'none' });
      setPostLoginRedirect(buildGameDetailPath(gameId, { ...(authorViewRequested ? { authorView: 1 } : {}) }));
      Taro.navigateTo({ url: LOGIN_PAGE_URL }).catch(() => {});
      return;
    }

    try {
      setFollowLoading(true);
      if (isFollowing) {
        await socialService.unfollowUser(authorId);
        setIsFollowing(false);
        Taro.showToast({ title: '已取消关注', icon: 'success' });
      } else {
        await socialService.followUser(authorId);
        setIsFollowing(true);
        Taro.showToast({ title: '已关注创作者', icon: 'success' });
      }
    } catch {
      Taro.showToast({ title: isFollowing ? '取消关注失败' : '关注失败', icon: 'none' });
    } finally {
      setFollowLoading(false);
    }
  };

  const renderReplies = (comment) => {
    const expanded = expandedReplies[comment.id];
    const inlineReplies = expanded || comment.replies || [];
    const replyCount = comment.replyCount || 0;
    const isExpanded = Boolean(expanded);
    const isLoadingReplies = loadingReplies[comment.id];

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
            <Text>{isLoadingReplies ? '加载中...' : `查看全部 ${replyCount} 条回复`}</Text>
          </View>
        )}
        {isExpanded && replyCount > 3 && (
          <View className="expand-replies" onClick={() => handleExpandReplies(comment)}>
            <Text>收起回复</Text>
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
      <View className={containerClassName}>
        <View style={{ padding: '40px', textAlign: 'center' }}>
          <Text style={{ color: '#8b87a3', fontSize: '28px' }}>{loading ? '加载中...' : '游戏不存在'}</Text>
        </View>
      </View>
    );
  }

  const detailCoverUrl = getGameCoverUrl(game);
  const handleBack = () => navigateBackOrHome();

  return (
    <View className={containerClassName}>
      <View className="detail-top-bar">
        <View className="detail-top-bar__inner" style={topBarStyle}>
          <View className="back-btn" onClick={handleBack}>
            <View className="back-btn__icon" />
          </View>
        </View>
      </View>
      <PageScrollContainer
        className="detail-scroll"
        style={detailScrollStyle}
        scrollY
        scrollWithAnimation
        scrollIntoView={commentScrollTarget}
      >
        <View className="detail-shell">
          <View className="preview-banner">
            {detailCoverUrl ? (
              <Image className="preview-cover" src={detailCoverUrl} mode="aspectFill" />
            ) : (
              <Text className="preview-emoji">{game.emoji || '🎮'}</Text>
            )}
          </View>

          <View className="back-btn" onClick={handleBack}>
            <View className="back-btn__icon" />
          </View>

          <View className="detail-content">
          <View className="title-section">
            <Text className="title">{game.title}</Text>
            <Text className="description">{game.description}</Text>
          </View>

          <View className="author-row">
            <View className="author-info">
              {authorAvatarSrc ? (
                <Image className="author-avatar-img" src={authorAvatarSrc} mode="aspectFill" />
              ) : (
                <View className="author-avatar author-avatar--fallback">
                  <Text className="author-avatar-text">{authorAvatarFallback}</Text>
                </View>
              )}
              <View className="author-details">
                <Text className="author-name">{authorDisplayName}</Text>
                <Text className="author-desc">{game.author?.bio || ''}</Text>
              </View>
            </View>
            {!isOwnGame ? (
              <View className={`follow-btn${isFollowing ? ' is-following' : ''}${followLoading ? ' is-loading' : ''}`} onClick={handleFollow}>
                {followLoading ? '处理中...' : (isFollowing ? '已关注' : '关注')}
              </View>
            ) : null}
          </View>

          <View className="stats-row">
            {detailStats.map((stat) => (
              <View key={stat.key} className="stat-item">
                <View className={`stat-icon stat-icon--${stat.key}`} />
                <Text className="stat-value">{stat.value}</Text>
                <Text className="stat-text">{stat.label}</Text>
              </View>
            ))}
          </View>

          <View className="action-buttons">
            <View
              className={`play-btn ${!canPlayCurrentGame ? 'locked' : ''}`}
              onClick={() => {
                if (requiresSubscriptionToPlay) {
                  useQuotaStore.getState().openPaywall({
                    gameId: game.id,
                    gameUrl: game.gameUrl,
                    gameTitle: game.title,
                    gameCover: getGameCoverUrl(game),
                    gameOrientation: getGameOrientation(game),
                    resumePlay: true,
                  });
                  return;
                }
                if (game?.gameUrl) {
                  openGame(game.gameUrl, game.title, getGameCoverUrl(game), {
                    canPlay: canPlayCurrentGame,
                    isOwnGame: currentUserId === game.author?.id,
                    gameId: game.id,
                    orientation: getGameOrientation(game),
                  });
                  return;
                }
                Taro.showToast({ title: '游戏暂不可用', icon: 'none' });
              }}
            >
              <View className={`btn-icon ${requiresSubscriptionToPlay ? 'btn-icon--lock' : 'btn-icon--play'}`} />
              <View className="btn-copy">
                <Text className="btn-text">{requiresSubscriptionToPlay ? '订阅后试玩' : '立即试玩'}</Text>
                <Text className="btn-subtext">
                  {requiresSubscriptionToPlay ? '开通后自动解锁当前作品' : '沉浸体验这个小游戏'}
                </Text>
              </View>
            </View>
            <View className="secondary-actions-row">
              <View className={`icon-btn bookmark-btn ${isBookmarked ? 'bookmarked' : ''}`} onClick={handleBookmarkGame}>
                <View className="icon-symbol icon-symbol--bookmark" />
                <View className="icon-copy">
                  <Text className="icon-value">{isBookmarked ? '已收藏' : '收藏'}</Text>
                  <Text className="icon-label">稍后再玩</Text>
                </View>
              </View>
              <View className="icon-btn share-btn" onClick={() => setShowSharePanel(true)}>
                <View className="icon-symbol icon-symbol--share" />
                <View className="icon-copy">
                  <Text className="icon-value">分享</Text>
                  <Text className="icon-label">发给朋友</Text>
                </View>
              </View>
              <View className={`icon-btn icon-btn--wide fork-btn ${continueCreateDisabled ? 'disabled' : ''}`} onClick={handleContinueCreate}>
                <View className="icon-symbol icon-symbol--fork" />
                <View className="icon-copy">
                  <Text className="icon-value">{isOwnGame ? '继续优化' : '复刻后继续创作'}</Text>
                  <Text className="icon-label">{isOwnGame ? '继续完善玩法与体验' : (canForkGame ? '基于当前玩法继续创作' : '作者未开放复刻权限')}</Text>
                </View>
              </View>
            </View>
          </View>

          {(game.tags || []).length > 0 && (
            <View className="tags-section">
              {game.tags.map((tag) => <View key={tag} className="tag">{tag}</View>)}
            </View>
          )}

          <View id={COMMENTS_SECTION_ID} className="comments-section">
            <View className="comments-title">
              <View className="comments-title-main">
                <View className="comments-title-icon" />
                <Text className="comments-title-text">
                  评论 {totalComments > 0 ? `(${formatNumber(totalComments)})` : ''}
                </Text>
              </View>
              <View className="comments-compose-btn" onClick={handleOpenCommentComposer}>
                <Text>发表评论</Text>
              </View>
            </View>

            {loadingComments && comments.length === 0 && (
              <View className="comments-loading"><Text>加载评论中...</Text></View>
            )}

            {!loadingComments && comments.length === 0 && (
              <View className="comments-empty">
                <View className="comments-empty-icon" />
                <Text className="comments-empty-text">还没有评论，来说点什么吧</Text>
              </View>
            )}

            <View className="comment-list">
              {comments.map((comment) => (
                <View key={comment.id} className="comment-thread">
                  <CommentRow
                    comment={comment}
                    currentUserId={currentUserId}
                    isReply={false}
                    likedIds={likedCommentIds}
                    onLike={handleCommentLike}
                    onReply={handleReply}
                    onDelete={handleDelete}
                  />
                  {renderReplies(comment)}
                </View>
              ))}
            </View>

            {hasMore && (
              <View className="load-more" onClick={handleLoadMore}>
                <Text>{loadingComments ? '加载中...' : '加载更多评论'}</Text>
              </View>
            )}
          </View>

            <View
              className="bottom-spacer"
              style={{
                height: `${Math.max(isH5 ? 120 : 180, (isH5 ? 92 : 132) + safeBottomInset)}px`,
              }}
            />
          </View>
        </View>
      </PageScrollContainer>

      <View className="comment-input-bar">
        <View className="comment-input-bar__inner">
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
              focus={commentInputFocused}
              value={commentText}
              onFocus={() => setCommentInputFocused(true)}
              onBlur={() => setCommentInputFocused(false)}
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
      </View>

      <GlobalGamePlayer />
      <PaywallPopup />
      <SharePanel
        visible={showSharePanel}
        game={game}
        onClose={() => setShowSharePanel(false)}
        onContinueCreate={handleContinueCreate}
        continueLabel={continueCreateLabel}
        continueDisabled={continueCreateDisabled}
      />
    </View>
  );
}
