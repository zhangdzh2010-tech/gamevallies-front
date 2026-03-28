import { useCallback, useEffect, useState } from 'react';
import { View, WebView, Text } from '@tarojs/components';
import { useRoute } from '@tarojs/hooks';
import Taro, { useDidShow, useShareAppMessage, useShareTimeline } from '@tarojs/taro';
import * as gameService from '../../../services/game';
import * as socialService from '../../../services/social';
import useGamePlayerStore, { resolveGameUrl } from '../../../stores/gamePlayer';
import { isGameBookmarked, setGameBookmarked } from '../../../utils/bookmarks';
import { buildGameWebShellUrl } from '../../../utils/gameWebShell';
import { getGameCoverUrl } from '../../../utils/media';
import { navigateBackOrHome } from '../../../utils/navigation';
import { buildGameDetailPath } from '../../../utils/share';
import { Storage } from '../../../utils/storage';
import { getShareConfig } from '../../../utils/share';
import { getGameOrientation } from '../../../utils/gameOrientation';
import { isLandscapePlayPagePath } from '../../../utils/gamePlayRoute';
import './index.scss';

function validateGameUrl(url) {
  const suspiciousChars = /[<>{}|\\^`]/;
  return Boolean(url) && !suspiciousChars.test(url);
}

function getBookmarkCount(game) {
  return Number(game?.bookmarks || game?.bookmarkCount || game?.favoriteCount || game?.favorites || 0);
}

function getAuthSignature() {
  return `${Storage.getToken() || ''}:${Storage.getRefreshToken() || ''}`;
}

function getRoutePagePath(route) {
  if (route?.path) {
    return String(route.path);
  }

  const pages = Taro.getCurrentPages();
  const currentPage = pages[pages.length - 1];
  return currentPage?.route ? `/${currentPage.route}` : '';
}

export default function GamePlay() {
  const route = useRoute();
  const gameUrl = useGamePlayerStore((s) => s.gameUrl);
  const gameTitle = useGamePlayerStore((s) => s.gameTitle);
  const gameCover = useGamePlayerStore((s) => s.gameCover);
  const gameOrientation = useGamePlayerStore((s) => s.gameOrientation);
  const gameId = useGamePlayerStore((s) => s.gameId);
  const setGameContext = useGamePlayerStore((s) => s.setGameContext);
  const [sourceGameUrl, setSourceGameUrl] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [gameMeta, setGameMeta] = useState(null);
  const [bookmarkCount, setBookmarkCount] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [authSignature, setAuthSignature] = useState(getAuthSignature());
  const routePagePath = getRoutePagePath(route);
  const routeDefaultOrientation = isLandscapePlayPagePath(routePagePath) ? 'landscape' : 'portrait';
  const routeGameId = route.params?.id || '';
  const activeGameId = gameId || routeGameId;
  const activeGameCover = getGameCoverUrl(gameMeta || {}, gameCover);
  const activeGameOrientation = gameMeta
    ? getGameOrientation(gameMeta, routeDefaultOrientation)
    : getGameOrientation(
        route.params?.orientation || (routeDefaultOrientation === 'landscape' ? routeDefaultOrientation : gameOrientation),
        routeDefaultOrientation,
      );
  const shareConfig = getShareConfig(
    {
      id: activeGameId,
      title: gameMeta?.title || gameTitle || '游戏',
      coverUrl: activeGameCover,
      orientation: activeGameOrientation,
    },
    undefined,
    { target: 'detail' },
  );

  const syncGameMeta = useCallback((gameData) => {
    if (!gameData) {
      return;
    }

    const resolvedGameId = gameData.id || activeGameId;
    const bookmarked = Boolean(gameData.viewerHasBookmarked) || isGameBookmarked(resolvedGameId);

    setGameMeta(gameData);
    setBookmarkCount(getBookmarkCount(gameData));
    setIsBookmarked(bookmarked);

    if (bookmarked) {
      setGameBookmarked({ ...gameData, viewerHasBookmarked: true }, true);
    }
  }, [activeGameId]);

  const loadGameMeta = useCallback(async () => {
    if (!activeGameId) {
      return;
    }

    try {
      const gameData = await gameService.getGame(activeGameId);
      syncGameMeta(gameData);
    } catch (error) {
      console.error('Failed to load game metadata for play page:', error);
    }
  }, [activeGameId, syncGameMeta]);

  const reportShare = (platform) => {
    if (!activeGameId) {
      return;
    }

    socialService.recordShare(activeGameId, platform).catch(() => {});
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
    if (process.env.TARO_ENV !== 'weapp') {
      return;
    }

    Taro.showShareMenu({
      withShareTicket: true,
      showShareItems: ['shareAppMessage', 'shareTimeline'],
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const setupGame = async () => {
      if (validateGameUrl(gameUrl)) {
        setSourceGameUrl(gameUrl);
        setLoading(false);
        return;
      }

      if (!routeGameId) {
        navigateBackOrHome();
        return;
      }

      const pages = Taro.getCurrentPages();
      const isDirectLaunchToPlay = process.env.TARO_ENV === 'weapp' && pages.length <= 1;

      if (isDirectLaunchToPlay) {
        navigateBackOrHome(buildGameDetailPath(routeGameId));
        return;
      }

      try {
        const game = await gameService.getGame(routeGameId);
        const resolvedUrl = resolveGameUrl(game?.gameUrl || '');

        if (cancelled) {
          return;
        }

        if (!validateGameUrl(resolvedUrl)) {
          throw new Error('Invalid game URL');
        }

        setGameContext({
          gameUrl: resolvedUrl,
          gameTitle: game?.title || '游戏',
          gameCover: getGameCoverUrl(game),
          gameOrientation: getGameOrientation(game, routeDefaultOrientation),
          gameId: game?.id || routeGameId,
          minimized: false,
        });
        syncGameMeta(game);
        setSourceGameUrl(resolvedUrl);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error('Failed to load game for play page:', error);
        Taro.showToast({
          title: '游戏加载失败',
          icon: 'none',
          duration: 2000,
        });
        setTimeout(() => navigateBackOrHome(buildGameDetailPath(routeGameId)), 200);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    setupGame();

    return () => {
      cancelled = true;
    };
  }, [gameUrl, routeDefaultOrientation, routeGameId, setGameContext, syncGameMeta]);

  useEffect(() => {
    if (!sourceGameUrl) {
      setCurrentUrl('');
      return;
    }

    const shellUrl = buildGameWebShellUrl({
      gameId: activeGameId,
      gameUrl: sourceGameUrl,
      title: gameMeta?.title || gameTitle || '游戏',
      coverUrl: activeGameCover,
      orientation: activeGameOrientation,
      accessToken: Storage.getToken(),
      refreshToken: Storage.getRefreshToken(),
      bookmarked: isBookmarked,
    });

    setCurrentUrl(shellUrl || sourceGameUrl);
  }, [activeGameCover, activeGameId, activeGameOrientation, authSignature, gameMeta, gameTitle, isBookmarked, sourceGameUrl]);

  useEffect(() => {
    loadGameMeta();
  }, [loadGameMeta]);

  useDidShow(() => {
    setAuthSignature(getAuthSignature());
    loadGameMeta();
  });

  const handleError = (error) => {
    console.error('WebView loading error:', error);

    if (!currentUrl) {
      return;
    }

    Taro.hideLoading({ fail() {} });
    Taro.showToast({
      title: '游戏加载失败，请重试',
      icon: 'none',
      duration: 2000,
    });
  };

  const handleShellMessage = (event) => {
    const payloads = Array.isArray(event?.detail?.data) ? event.detail.data : [];
    const syncPayload = [...payloads].reverse().find((item) => (
      item
      && item.kind === 'game-shell-sync'
      && (!item.gameId || String(item.gameId) === String(activeGameId || ''))
    ));

    if (!syncPayload || typeof syncPayload.bookmarked !== 'boolean' || !activeGameId) {
      return;
    }

    const nextBookmarkCount = Number.isFinite(Number(syncPayload.bookmarkCount))
      ? Number(syncPayload.bookmarkCount)
      : bookmarkCount;
    const baseGame = gameMeta || {
      id: activeGameId,
      title: gameTitle || '游戏',
      coverUrl: gameCover || '',
      thumbnailUrl: gameCover || '',
      bookmarks: nextBookmarkCount,
      viewerHasBookmarked: syncPayload.bookmarked,
    };

    setGameBookmarked(
      {
        ...baseGame,
        viewerHasBookmarked: syncPayload.bookmarked,
        bookmarks: nextBookmarkCount,
      },
      syncPayload.bookmarked,
    );
    setIsBookmarked(syncPayload.bookmarked);
    setBookmarkCount(nextBookmarkCount);
    setGameMeta((prev) => (
      prev
        ? {
            ...prev,
            viewerHasBookmarked: syncPayload.bookmarked,
            bookmarks: nextBookmarkCount,
          }
        : prev
    ));
  };

  return (
    <View className={`game-play-page${activeGameOrientation === 'landscape' ? ' is-landscape' : ''}`}>
      {currentUrl ? (
        <WebView
          className="game-webview"
          src={currentUrl}
          onMessage={handleShellMessage}
          onError={handleError}
          enableShareAppMessage
          enableShareTimeline
        />
      ) : (
        <View className="game-loading">
          <Text className="game-loading-text">
            {loading ? '游戏加载中...' : '游戏地址无效'}
          </Text>
        </View>
      )}
    </View>
  );
}
