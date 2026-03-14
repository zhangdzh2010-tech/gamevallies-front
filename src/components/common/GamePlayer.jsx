import React, { useState, useEffect, useRef } from 'react';
import Taro from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import useGamePlayerStore from '../../stores/gamePlayer';
import './GamePlayer.scss';

export function GamePlayer({ gameUrl, gameTitle, onClose }) {
  const statusBarHeight = Taro.getSystemInfoSync().statusBarHeight || 44;
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [displayUrl, setDisplayUrl] = useState('');
  const [displayTitle, setDisplayTitle] = useState('');
  const exitTimer = useRef(null);
  const iframeRef = useRef(null);

  useEffect(() => {
    if (gameUrl) {
      if (exitTimer.current) clearTimeout(exitTimer.current);
      setDisplayUrl(gameUrl);
      setDisplayTitle(gameTitle || '游戏');
      setLoading(true);
      setFullscreen(false);
      setTimeout(() => setVisible(true), 20);
    } else {
      setVisible(false);
      exitTimer.current = setTimeout(() => {
        setDisplayUrl('');
        setDisplayTitle('');
      }, 380);
    }
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, [gameUrl, gameTitle]);

  if (!displayUrl) return null;

  return (
    <View className={`game-player-overlay${visible ? ' visible' : ''}`}>
      <View className="game-player-backdrop" onClick={onClose} />
      <View className={`game-player-panel${visible ? ' visible' : ''}${fullscreen ? ' fullscreen' : ''}`}>
        {/* Header with close/back and fullscreen */}
        <View className="player-header" style={{ paddingTop: `${statusBarHeight}px` }}>
          <View className="player-btn back-btn" onClick={onClose}>
            <Text className="back-arrow">✕</Text>
            <Text className="back-text">关闭</Text>
          </View>
          <Text className="player-title">{displayTitle}</Text>
          <View
            className="player-btn fullscreen-btn"
            onClick={() => setFullscreen(!fullscreen)}
          >
            <Text className="fs-icon">{fullscreen ? '退出全屏' : '全屏'}</Text>
          </View>
        </View>

        {loading && (
          <View className="player-loading">
            <Text className="loading-text">正在加载游戏...</Text>
          </View>
        )}

        {/* Use raw iframe instead of Taro WebView for proper z-index control */}
        <View className="player-iframe-wrapper">
          <iframe
            ref={iframeRef}
            className="player-iframe"
            src={displayUrl}
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
            sandbox="allow-scripts allow-same-origin allow-popups"
            allow="autoplay"
          />
        </View>
      </View>
    </View>
  );
}

export function GlobalGamePlayer() {
  if (process.env.TARO_ENV === 'weapp') return null;
  const gameUrl = useGamePlayerStore((s) => s.gameUrl);
  const gameTitle = useGamePlayerStore((s) => s.gameTitle);
  const closeGame = useGamePlayerStore((s) => s.closeGame);
  return <GamePlayer gameUrl={gameUrl} gameTitle={gameTitle} onClose={closeGame} />;
}
