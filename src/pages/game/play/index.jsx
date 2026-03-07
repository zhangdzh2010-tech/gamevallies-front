import React, { useState, useRef, useEffect } from 'react';
import { View, Text, WebView } from '@tarojs/components';
import { useRoute, useNavigation } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import './index.scss';






export default function GamePlay() {
  const route = useRoute();
  const navigation = useNavigation();
  const gameId = route.params?.id || '1';

  const webViewRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [gameTitle, setGameTitle] = useState('游戏加载中...');
  const [currentScore, setCurrentScore] = useState(0);
  const [error, setError] = useState('');

  // Mock game titles
  const GAME_TITLES = {
    '1': '2048 数字游戏',
    '2': '太空防御',
    '3': '音乐节奏',
    '4': '消消乐',
    '5': '飞翔小鸟',
    '6': '捕鱼大师'
  };

  useEffect(() => {
    setGameTitle(GAME_TITLES[gameId] || '游戏');
  }, [gameId]);

  const handleWebViewMessage = (event) => {
    try {
      const message = event.detail.data;

      switch (message.type) {
        case 'score':
          setCurrentScore(message.data?.score || 0);
          break;
        case 'game_over':
          Taro.showToast({
            title: `游戏结束！得分: ${message.data?.score || 0}`,
            icon: 'none'
          });
          break;
        case 'pause':
          console.log('Game paused');
          break;
        case 'resume':
          console.log('Game resumed');
          break;
      }
    } catch (err) {
      console.error('Error handling web view message:', err);
    }
  };

  const handleLoad = () => {
    setLoading(false);
    setError('');
  };

  const handleError = () => {
    setLoading(false);
    setError('游戏加载失败，请检查网络连接或稍后重试');
  };

  const handleShare = () => {
    Taro.showShareMenu({
      menus: ['shareAppMessage', 'shareTimeline']
    });
  };

  // Construct game URL - in a real app, this would come from a CDN
  const gameUrl = `https://playforge.example.com/games/${gameId}/index.html`;

  return (
    <View className="game-play">
      {/* Header */}
      <View className="play-header">
        <View className="header-left" onClick={() => navigation.back()}>
          ← 返回
        </View>
        <Text className="header-title">{gameTitle}</Text>
        <View className="header-right">
          <View className="score-display">得分: {currentScore}</View>
          <View className="share-btn" onClick={handleShare}>
            分享
          </View>
        </View>
      </View>

      {/* Web View Container */}
      <View className="webview-container">
        {loading &&
        <View className="loading-overlay">
            <Text className="loading-text">正在加载游戏...</Text>
          </View>
        }

        {error &&
        <View className="error-overlay">
            <Text className="error-text">{error}</Text>
            <View
            className="retry-btn"
            onClick={() => {
              setLoading(true);
              setError('');
            }}>
            
              重新加载
            </View>
          </View>
        }

        <WebView
          ref={webViewRef}
          src={gameUrl}
          onMessage={handleWebViewMessage}
          onLoad={handleLoad}
          onError={handleError} />
        
      </View>

      {/* Bottom Controls */}
      <View className="play-controls">
        <View className="control-hint">
          游戏内使用专用按钮或手势进行操作
        </View>
      </View>
    </View>);

}