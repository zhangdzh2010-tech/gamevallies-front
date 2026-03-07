import React, { useState, useEffect, useRef } from 'react';
import { View, Text, WebView } from '@tarojs/components';
import './GamePlayer.scss';

export function GamePlayer({ gameUrl, gameTitle, onClose }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  // Keep display url/title alive during exit animation
  const [displayUrl, setDisplayUrl] = useState('');
  const [displayTitle, setDisplayTitle] = useState('');
  const exitTimer = useRef(null);

  useEffect(() => {
    if (gameUrl) {
      // Cancel any pending exit cleanup
      if (exitTimer.current) clearTimeout(exitTimer.current);
      setDisplayUrl(gameUrl);
      setDisplayTitle(gameTitle || '游戏');
      setLoading(true);
      setFullscreen(false);
      // Small delay so CSS transition fires after mount
      setTimeout(() => setVisible(true), 20);
    } else {
      // Start exit animation, then unmount
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
        <View className="player-header">
          <View className="player-btn close-btn" onClick={onClose}>✕</View>
          <Text className="player-title">{displayTitle}</Text>
          <View
            className="player-btn fullscreen-btn"
            onClick={() => setFullscreen(!fullscreen)}
          >
            {fullscreen ? '⊡' : '⊞'}
          </View>
        </View>

        {loading && (
          <View className="player-loading">
            <Text className="loading-text">正在加载游戏...</Text>
          </View>
        )}

        <WebView
          className="player-webview"
          src={displayUrl}
          onLoad={() => setLoading(false)}
          onError={() => setLoading(false)}
        />
      </View>
    </View>
  );
}
