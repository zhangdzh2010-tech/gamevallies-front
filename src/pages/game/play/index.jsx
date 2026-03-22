import { useEffect, useState } from 'react';
import { View, WebView, CoverView, Text } from '@tarojs/components';
import { useNavigation, useRoute } from '@tarojs/hooks';
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro';
import * as gameService from '../../../services/game';
import * as socialService from '../../../services/social';
import useGamePlayerStore, { resolveGameUrl } from '../../../stores/gamePlayer';
import { getShareConfig } from '../../../utils/share';
import './index.scss';

export default function GamePlay() {
  const navigation = useNavigation();
  const route = useRoute();
  const gameUrl = useGamePlayerStore((s) => s.gameUrl);
  const gameTitle = useGamePlayerStore((s) => s.gameTitle);
  const gameCover = useGamePlayerStore((s) => s.gameCover);
  const gameId = useGamePlayerStore((s) => s.gameId);
  const closeGame = useGamePlayerStore((s) => s.closeGame);
  const minimizeGame = useGamePlayerStore((s) => s.minimizeGame);
  const setGameContext = useGamePlayerStore((s) => s.setGameContext);
  const { statusBarHeight = 44 } = Taro.getSystemInfoSync();
  const [currentUrl, setCurrentUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const routeGameId = route.params?.id || '';
  const shareConfig = getShareConfig(
    {
      id: gameId || routeGameId,
      title: gameTitle || '游戏',
      coverUrl: gameCover,
    },
    undefined,
    { target: 'play' },
  );

  const reportShare = (platform) => {
    const targetId = gameId || routeGameId;
    if (!targetId) {
      return;
    }

    socialService.recordShare(targetId, platform).catch(() => {});
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
    if (process.env.TARO_ENV !== 'weapp') return;

    Taro.showShareMenu({
      withShareTicket: true,
      showShareItems: ['shareAppMessage', 'shareTimeline'],
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const validateGameUrl = (url) => {
      const suspiciousChars = /[<>{}|\\^`]/;
      return Boolean(url) && !suspiciousChars.test(url);
    };

    const setupGame = async () => {
      if (validateGameUrl(gameUrl)) {
        setCurrentUrl(gameUrl);
        setLoading(false);
        return;
      }

      if (!routeGameId) {
        navigation.back();
        return;
      }

      try {
        const game = await gameService.getGame(routeGameId);
        const resolvedUrl = resolveGameUrl(game?.gameUrl || '');

        if (cancelled) return;

        if (!validateGameUrl(resolvedUrl)) {
          throw new Error('Invalid game URL');
        }

        setGameContext({
          gameUrl: resolvedUrl,
          gameTitle: game?.title || '游戏',
          gameCover: game?.coverUrl || game?.thumbnailUrl || '',
          gameId: game?.id || routeGameId,
          minimized: false,
        });
        setCurrentUrl(resolvedUrl);
      } catch (error) {
        if (cancelled) return;

        console.error('Failed to load game for play page:', error);
        Taro.showToast({
          title: '游戏加载失败',
          icon: 'none',
          duration: 2000,
        });
        setTimeout(() => navigation.back(), 200);
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
  }, [gameUrl, navigation, routeGameId, setGameContext]);

  const handleClose = () => {
    navigation.back();
    setTimeout(() => closeGame(), 100);
  };

  const handleMinimize = () => {
    minimizeGame();
    navigation.back();
  };

  const handleError = (error) => {
    console.error('WebView loading error:', error);
    if (!currentUrl) return;

    Taro.hideLoading({ fail() {} });
    Taro.showToast({
      title: '游戏加载失败，请重试',
      icon: 'none',
      duration: 2000,
    });
  };

  return (
    <View className="game-play-page">
      {currentUrl ? (
        <WebView
          className="game-webview"
          src={currentUrl}
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

      <CoverView
        className="game-header-cover"
        style={{ paddingTop: `${statusBarHeight}px` }}
      >
        <CoverView className="close-btn" onClick={handleClose}>关闭</CoverView>
        <CoverView className="game-title-text">{gameTitle || '游戏'}</CoverView>
        <CoverView className="minimize-btn" onClick={handleMinimize}>最小化</CoverView>
      </CoverView>
    </View>
  );
}
