/* eslint-disable react/prop-types */
import { View, Text, Image } from '@tarojs/components';
import { useState, useEffect } from 'react';
import Taro from '@tarojs/taro';
import useGamePlayerStore from '../../stores/gamePlayer';
import './FloatingPlayer.scss';

export function FloatingPlayer() {
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const minimized = useGamePlayerStore((s) => s.minimized);
  const gameTitle = useGamePlayerStore((s) => s.gameTitle);
  const gameCover = useGamePlayerStore((s) => s.gameCover);
  const gameUrl = useGamePlayerStore((s) => s.gameUrl);
  const restoreGame = useGamePlayerStore((s) => s.restoreGame);
  const closeGame = useGamePlayerStore((s) => s.closeGame);
  const [expanded, setExpanded] = useState(false);

  // 页面显示时，如果没有 gameUrl 则清除状态
  useEffect(() => {
    if (!gameUrl) {
      useGamePlayerStore.setState({ minimized: false });
    }
  }, [gameUrl]);

  if (!isWeapp || !minimized || !gameUrl) return null;

  const handleBallClick = () => {
    setExpanded(true);
  };

  const handleCollapse = () => {
    setExpanded(false);
  };

  const handlePlay = () => {
    setExpanded(false);
    restoreGame();
  };

  const handleClose = () => {
    setExpanded(false);
    closeGame();
    Taro.showToast({ title: '已退出试玩', icon: 'none' });
  };

  if (!expanded) {
    // 悬浮球模式
    return (
      <View className="floating-player">
        <View className="floating-ball" onClick={handleBallClick}>
          <View className="ball-icon" />
          <View className="ball-pulse" />
        </View>
      </View>
    );
  }

  // 展开卡片模式
  return (
    <View className="floating-player">
      <View className="floating-card">
        <View className="card-header">
          <View className="card-title-row" onClick={handlePlay}>
            <View className="card-icon" />
            <Text className="card-title">{gameTitle || '游戏试玩中'}</Text>
            <View className="card-play-hint">
              <Text>点击继续</Text>
              <View className="card-play-hint-icon" />
            </View>
          </View>
          <View className="card-actions">
            <View className="card-action-btn" onClick={handleCollapse}>
              <View className="action-icon action-icon--minus" />
            </View>
            <View className="card-action-btn close" onClick={handleClose}>
              <View className="action-icon action-icon--close" />
            </View>
          </View>
        </View>
        {gameCover && (
          <View className="card-cover-row" onClick={handlePlay}>
            <Image className="card-cover" src={gameCover} mode="aspectFill" />
          </View>
        )}
        <View className="card-footer" onClick={handlePlay}>
          <View className="card-play-btn">
            <View className="card-play-btn-icon" />
            <Text>继续试玩</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default FloatingPlayer;
