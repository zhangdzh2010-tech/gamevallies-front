import { useEffect, useRef, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import { useRoute } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import { ENV } from '../../../config/env';
import { buildGameDetailPath } from '../../../utils/share';
import {
  buildGameWebShellHash,
  parseGameWebShellParams,
} from '../../../utils/gameWebShell';
import { isGameBookmarked, setGameBookmarked } from '../../../utils/bookmarks';
import { getGameOrientation } from '../../../utils/gameOrientation';
import { getAvatarFallback, getSafeDisplayText, normalizeAvatarSource } from '../../../utils/profileDisplay';
import './index.scss';

const WX_JSSDK_URL = 'https://res.wx.qq.com/open/js/jweixin-1.3.2.js';

function formatNumber(value) {
  const num = Number(value) || 0;

  if (num >= 10000) {
    return `${(num / 10000).toFixed(1)}w`;
  }

  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }

  return String(num);
}

function getLikeCount(game) {
  return Number(game?.likes || game?.likeCount || 0);
}

function getCommentCount(game) {
  return Number(game?.comments || game?.commentCount || 0);
}

function getBookmarkCount(game) {
  return Number(game?.bookmarks || game?.bookmarkCount || game?.favoriteCount || game?.favorites || 0);
}

function getAuthorId(game) {
  return game?.author?.id || game?.authorId || '';
}

function getAuthorName(game) {
  return getSafeDisplayText([
    game?.author?.displayName,
    game?.author?.nickname,
    game?.author?.username,
    game?.authorName,
    game?.creatorName,
    typeof game?.author === 'string' ? game.author : '',
  ], '创作者');
}

function getAuthorAvatar(game) {
  return normalizeAvatarSource(game?.author?.avatarUrl || game?.author?.avatar);
}

function getAuthorAvatarRaw(game) {
  return game?.author?.avatar || game?.author?.avatarUrl || '';
}

function normalizeApiMessage(payload, fallback) {
  if (Array.isArray(payload?.message)) {
    return payload.message.filter(Boolean).join(' ');
  }

  return payload?.message || payload?.error?.message || fallback;
}

function resolveApiBaseUrl(url) {
  const services = ENV.SERVICE_URLS || {};
  const fallbackBaseUrl = ENV.API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

  if (url.startsWith('/api/v1/auth') || url.startsWith('/api/v1/users')) {
    return services.AUTH || fallbackBaseUrl;
  }

  if (url.startsWith('/api/v1/games')) {
    return services.GAME || fallbackBaseUrl;
  }

  if (url.startsWith('/api/v1/social') || url.startsWith('/api/v1/comments') || url.startsWith('/api/v1/notifications')) {
    return services.SOCIAL || fallbackBaseUrl;
  }

  if (url.startsWith('/api/v1/feed') || url.startsWith('/api/v1/tags') || url.startsWith('/api/v1/challenges') || url.startsWith('/api/v1/creators')) {
    return services.FEED || fallbackBaseUrl;
  }

  return fallbackBaseUrl;
}

async function sendShellRequest(url, options = {}) {
  const {
    method = 'GET',
    data,
    accessToken = '',
    skipAuth = false,
  } = options;

  const response = await Taro.request({
    url: `${resolveApiBaseUrl(url)}${url}`,
    method,
    data,
    header: {
      'Content-Type': 'application/json',
      ...(!skipAuth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  return response;
}

async function refreshShellToken(refreshToken) {
  if (!refreshToken) {
    throw new Error('Missing refresh token');
  }

  const response = await sendShellRequest('/api/v1/auth/refresh', {
    method: 'POST',
    data: { refreshToken },
    skipAuth: true,
  });

  const payload = response?.data?.data || response?.data || {};
  const accessToken = payload?.accessToken || payload?.token || '';

  if (response.statusCode >= 400 || !accessToken) {
    throw new Error(normalizeApiMessage(response?.data, '刷新登录态失败'));
  }

  return {
    accessToken,
    refreshToken: payload?.refreshToken || refreshToken,
  };
}

function ensureWxJssdk(setMiniProgramReady) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  let cancelled = false;

  const detectMiniProgram = () => {
    if (cancelled) {
      return;
    }

    if (window.__wxjs_environment === 'miniprogram') {
      setMiniProgramReady(true);
      return;
    }

    if (window.wx?.miniProgram?.getEnv) {
      window.wx.miniProgram.getEnv((res) => {
        if (!cancelled) {
          setMiniProgramReady(Boolean(res?.miniprogram));
        }
      });
    }
  };

  let script = document.querySelector('script[data-game-shell-wx-sdk="1"]');

  if (!script) {
    script = document.createElement('script');
    script.src = WX_JSSDK_URL;
    script.async = true;
    script.setAttribute('data-game-shell-wx-sdk', '1');
    document.head.appendChild(script);
  }

  script.addEventListener('load', detectMiniProgram);
  document.addEventListener('WeixinJSBridgeReady', detectMiniProgram, false);
  detectMiniProgram();

  return () => {
    cancelled = true;
    script.removeEventListener('load', detectMiniProgram);
    document.removeEventListener('WeixinJSBridgeReady', detectMiniProgram, false);
  };
}

export default function GameWebShellPage() {
  const route = useRoute();
  const shellParams = parseGameWebShellParams(route.params || {});
  const authRef = useRef({
    accessToken: shellParams.accessToken,
    refreshToken: shellParams.refreshToken,
  });
  const latestStateRef = useRef({
    gameId: shellParams.gameId,
    bookmarked: shellParams.bookmarked,
    bookmarkCount: 0,
    liked: false,
    likeCount: 0,
    commentCount: 0,
    following: false,
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [gameMeta, setGameMeta] = useState(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(Boolean(shellParams.bookmarked));
  const [isFollowing, setIsFollowing] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [miniProgramReady, setMiniProgramReady] = useState(false);

  useEffect(() => {
    authRef.current = {
      accessToken: shellParams.accessToken,
      refreshToken: shellParams.refreshToken,
    };
  }, [shellParams.accessToken, shellParams.refreshToken]);

  useEffect(() => {
    latestStateRef.current = {
      gameId: shellParams.gameId,
      bookmarked: isBookmarked,
      bookmarkCount,
      liked: isLiked,
      likeCount,
      commentCount,
      following: isFollowing,
    };
  }, [bookmarkCount, commentCount, isBookmarked, isFollowing, isLiked, likeCount, shellParams.gameId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    if (!shellParams.accessToken && !shellParams.refreshToken) {
      return undefined;
    }

    const sanitizedHash = buildGameWebShellHash(
      {
        gameId: shellParams.gameId,
        gameUrl: shellParams.gameUrl,
        title: shellParams.title,
        coverUrl: shellParams.coverUrl,
        orientation: shellParams.orientation,
        bookmarked: shellParams.bookmarked,
      },
      { includeAuth: false },
    );

    window.history.replaceState(
      window.history.state,
      document.title,
      `${window.location.pathname}${window.location.search}${sanitizedHash}`,
    );

    return undefined;
  }, [
    shellParams.accessToken,
    shellParams.bookmarked,
    shellParams.coverUrl,
    shellParams.gameId,
    shellParams.gameUrl,
    shellParams.orientation,
    shellParams.refreshToken,
    shellParams.title,
  ]);

  useEffect(() => ensureWxJssdk(setMiniProgramReady), []);

  const requestWithAuth = async (url, options = {}) => {
    const authRequired = options.skipAuth !== true;
    let response = await sendShellRequest(url, {
      ...options,
      accessToken: authRequired ? authRef.current.accessToken : '',
      skipAuth: !authRequired,
    });

    if (authRequired && response.statusCode === 401 && authRef.current.refreshToken) {
      const refreshedAuth = await refreshShellToken(authRef.current.refreshToken);
      authRef.current = refreshedAuth;
      response = await sendShellRequest(url, {
        ...options,
        accessToken: refreshedAuth.accessToken,
      });
    }

    if (response.statusCode === 401) {
      authRef.current = {
        accessToken: '',
        refreshToken: authRef.current.refreshToken,
      };
      throw new Error('请先登录');
    }

    if (response.statusCode >= 400) {
      throw new Error(normalizeApiMessage(response?.data, '请求失败'));
    }

    const payload = response?.data;

    if (payload?.code !== undefined && payload.code !== 0 && payload.code !== 200) {
      throw new Error(normalizeApiMessage(payload, '请求失败'));
    }

    return payload?.data ?? payload ?? null;
  };

  const postHostSync = () => {
    if (!miniProgramReady || typeof window === 'undefined' || !window.wx?.miniProgram?.postMessage) {
      return;
    }

    try {
      window.wx.miniProgram.postMessage({
        data: {
          kind: 'game-shell-sync',
          ...latestStateRef.current,
        },
      });
    } catch (error) {
      console.warn('Failed to sync game shell state to mini program:', error);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }

    const handlePageHide = () => {
      postHostSync();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        postHostSync();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      handlePageHide();
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [miniProgramReady]);

  useEffect(() => {
    let cancelled = false;

    const hydrateShell = async () => {
      if (!shellParams.gameUrl) {
        setErrorMessage('游戏地址无效');
        setLoading(false);
        return;
      }

      if (!shellParams.gameId) {
        setLoading(false);
        return;
      }

      try {
        const gameData = await requestWithAuth(`/api/v1/games/${shellParams.gameId}`, {
          method: 'GET',
          skipAuth: true,
        });

        if (cancelled) {
          return;
        }

        const bookmarked = shellParams.bookmarked
          || Boolean(gameData?.viewerHasBookmarked)
          || isGameBookmarked(gameData?.id || shellParams.gameId);

        setGameMeta(gameData);
        setLikeCount(getLikeCount(gameData));
        setCommentCount(getCommentCount(gameData));
        setBookmarkCount(getBookmarkCount(gameData));
        setIsLiked(Boolean(gameData?.viewerHasLiked));
        setIsBookmarked(bookmarked);

        if (bookmarked) {
          setGameBookmarked({ ...gameData, viewerHasBookmarked: true }, true);
        }

        const authorId = getAuthorId(gameData);

        if (authRef.current.accessToken) {
          const requests = [
            requestWithAuth('/api/v1/users/me', { method: 'GET' }).catch(() => null),
            requestWithAuth(`/api/v1/social/like-status/game/${shellParams.gameId}`, { method: 'GET' }).catch(() => null),
          ];

          if (authorId) {
            requests.push(
              requestWithAuth(`/api/v1/social/follow-status/${authorId}`, { method: 'GET' }).catch(() => null),
            );
          } else {
            requests.push(Promise.resolve(null));
          }

          const [currentUser, likedResult, followResult] = await Promise.all(requests);

          if (cancelled) {
            return;
          }

          if (currentUser?.id) {
            setCurrentUserId(String(currentUser.id));
          }

          if (typeof likedResult?.liked === 'boolean') {
            setIsLiked(Boolean(likedResult.liked));
          }

          if (typeof followResult?.isFollowing === 'boolean' || typeof followResult?.following === 'boolean') {
            setIsFollowing(Boolean(followResult?.isFollowing ?? followResult?.following));
          }
        } else {
          setCurrentUserId('');
          setIsFollowing(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to hydrate game web shell:', error);
          setErrorMessage(error?.message || '互动层加载失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    hydrateShell();

    return () => {
      cancelled = true;
    };
  }, [
    shellParams.bookmarked,
    shellParams.gameId,
    shellParams.gameUrl,
  ]);

  const openMiniPage = (url) => {
    if (miniProgramReady && typeof window !== 'undefined' && window.wx?.miniProgram?.navigateTo) {
      postHostSync();
      window.wx.miniProgram.navigateTo({ url });
      return true;
    }

    return false;
  };

  const openLoginPage = () => {
    if (openMiniPage('/pages/login/index')) {
      return;
    }

    Taro.navigateTo({ url: '/pages/login/index' }).catch(() => {});
  };

  const handleLike = async () => {
    if (!shellParams.gameId || likeLoading) {
      return;
    }

    if (!authRef.current.accessToken) {
      Taro.showToast({ title: '请先登录后再点赞', icon: 'none' });
      openLoginPage();
      return;
    }

    try {
      setLikeLoading(true);
      const result = await requestWithAuth('/api/v1/social/like', {
        method: 'POST',
        data: {
          targetType: 'game',
          targetId: shellParams.gameId,
        },
      });
      const nextLiked = typeof result?.liked === 'boolean' ? result.liked : !isLiked;
      const nextLikes = Number.isFinite(Number(result?.likes))
        ? Number(result.likes)
        : Math.max(0, likeCount + (nextLiked ? 1 : -1));

      setIsLiked(nextLiked);
      setLikeCount(nextLikes);
    } catch (error) {
      Taro.showToast({ title: error?.message || '点赞失败，请重试', icon: 'none' });
      if (error?.message === '请先登录') {
        openLoginPage();
      }
    } finally {
      setLikeLoading(false);
    }
  };

  const handleBookmark = () => {
    if (!shellParams.gameId) {
      return;
    }

    const nextBookmarked = !isBookmarked;
    const baseGame = gameMeta || {
      id: shellParams.gameId,
      title: shellParams.title || '游戏',
      coverUrl: shellParams.coverUrl,
      thumbnailUrl: shellParams.coverUrl,
      bookmarks: bookmarkCount,
      comments: commentCount,
      likes: likeCount,
      author: gameMeta?.author,
      authorId: getAuthorId(gameMeta),
    };
    const nextBookmarkCount = Math.max(0, bookmarkCount + (nextBookmarked ? 1 : -1));

    setGameBookmarked(baseGame, nextBookmarked);
    setIsBookmarked(nextBookmarked);
    setBookmarkCount(nextBookmarkCount);
    setGameMeta((prev) => (
      prev
        ? {
            ...prev,
            viewerHasBookmarked: nextBookmarked,
            bookmarks: nextBookmarkCount,
          }
        : prev
    ));
    Taro.showToast({
      title: nextBookmarked ? '已加入收藏' : '已取消收藏',
      icon: 'none',
    });
    setTimeout(() => {
      postHostSync();
    }, 0);
  };

  const handleComment = () => {
    if (!shellParams.gameId) {
      return;
    }

    const targetUrl = buildGameDetailPath(shellParams.gameId, { openComment: 1 });

    if (openMiniPage(targetUrl)) {
      return;
    }

    Taro.navigateTo({ url: targetUrl }).catch(() => {});
  };

  const handleFollow = async () => {
    const authorId = getAuthorId(gameMeta);
    const isOwnGame = Boolean(currentUserId && authorId && String(currentUserId) === String(authorId));

    if (!authorId || followLoading || isOwnGame) {
      return;
    }

    if (!authRef.current.accessToken) {
      Taro.showToast({ title: '请先登录后再关注', icon: 'none' });
      openLoginPage();
      return;
    }

    try {
      setFollowLoading(true);
      if (isFollowing) {
        await requestWithAuth(`/api/v1/social/follow/${authorId}`, {
          method: 'DELETE',
        });
        setIsFollowing(false);
        Taro.showToast({ title: '已取消关注', icon: 'success' });
      } else {
        await requestWithAuth('/api/v1/social/follow', {
          method: 'POST',
          data: {
            targetId: authorId,
          },
        });
        setIsFollowing(true);
        Taro.showToast({ title: '已关注创作者', icon: 'success' });
      }
    } catch (error) {
      Taro.showToast({ title: error?.message || (isFollowing ? '取消关注失败' : '关注失败'), icon: 'none' });
      if (error?.message === '请先登录') {
        openLoginPage();
      }
    } finally {
      setFollowLoading(false);
    }
  };

  const authorId = getAuthorId(gameMeta);
  const authorName = getAuthorName(gameMeta);
  const authorAvatar = getAuthorAvatar(gameMeta);
  const authorAvatarFallback = getAvatarFallback(getAuthorAvatarRaw(gameMeta), authorName, '创');
  const displayTitle = gameMeta?.title || shellParams.title || '游戏';
  const isOwnGame = Boolean(currentUserId && authorId && String(currentUserId) === String(authorId));
  const activeOrientation = getGameOrientation(gameMeta || shellParams.orientation, shellParams.orientation);

  return (
    <View className={`game-web-shell-page${activeOrientation === 'landscape' ? ' is-landscape' : ''}`}>
      <View className="game-web-shell-page__player">
        {shellParams.gameUrl ? (
          <iframe
            className="game-web-shell-page__iframe"
            src={shellParams.gameUrl}
            title={displayTitle}
            sandbox="allow-scripts allow-same-origin allow-popups"
            allow="autoplay; fullscreen"
          />
        ) : null}
      </View>

      {errorMessage ? (
        <View className="game-web-shell-page__error">
          <Text>{errorMessage}</Text>
        </View>
      ) : null}

      <View className="game-web-shell-page__bottom-gradient" />

      <View className="game-web-shell-author">
        <View className="game-web-shell-author__card">
          {authorAvatar ? (
            <Image className="game-web-shell-author__avatar" src={authorAvatar} mode="aspectFill" />
          ) : (
            <View className="game-web-shell-author__avatar game-web-shell-author__avatar--fallback">
              <Text className="game-web-shell-author__avatar-text">{authorAvatarFallback}</Text>
            </View>
          )}

          <View className="game-web-shell-author__body">
            <Text className="game-web-shell-author__name">{authorName}</Text>
            <Text className="game-web-shell-author__title">{displayTitle}</Text>
          </View>

          {authorId && !isOwnGame ? (
            <View
              className={`game-web-shell-author__follow${isFollowing ? ' is-following' : ''}${followLoading ? ' is-loading' : ''}`}
              onClick={handleFollow}
            >
              <Text>{followLoading ? '...' : (isFollowing ? '已关注' : '关注')}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View className="game-web-shell-actions">
        <View className="game-web-shell-action" onClick={handleLike}>
          <View className="game-web-shell-action__button">
            <View className={`game-web-shell-action__icon game-web-shell-action__icon--like${isLiked ? ' is-active' : ''}`} />
          </View>
          <View className="game-web-shell-action__meta">
            <Text className="game-web-shell-action__count">
              {likeLoading ? '...' : formatNumber(likeCount)}
            </Text>
            <Text className="game-web-shell-action__label">点赞</Text>
          </View>
        </View>

        <View className="game-web-shell-action" onClick={handleBookmark}>
          <View className="game-web-shell-action__button">
            <View className={`game-web-shell-action__icon game-web-shell-action__icon--bookmark${isBookmarked ? ' is-bookmarked' : ''}`} />
          </View>
          <View className="game-web-shell-action__meta">
            <Text className="game-web-shell-action__count">{formatNumber(bookmarkCount)}</Text>
            <Text className="game-web-shell-action__label">收藏</Text>
          </View>
        </View>

        <View className="game-web-shell-action" onClick={handleComment}>
          <View className="game-web-shell-action__button">
            <View className="game-web-shell-action__icon game-web-shell-action__icon--comment" />
          </View>
          <View className="game-web-shell-action__meta">
            <Text className="game-web-shell-action__count">{formatNumber(commentCount)}</Text>
            <Text className="game-web-shell-action__label">评论</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View className="game-web-shell-page__status">
          <Text>正在加载互动层...</Text>
        </View>
      ) : null}
    </View>
  );
}



