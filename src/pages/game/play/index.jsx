import { useEffect } from 'react';
import { View, WebView, CoverView } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import useGamePlayerStore from '../../../stores/gamePlayer';
import './index.scss';

export default function GamePlay() {
  const navigation = useNavigation();
  const gameUrl = useGamePlayerStore((s) => s.gameUrl);
  const gameTitle = useGamePlayerStore((s) => s.gameTitle);
  const closeGame = useGamePlayerStore((s) => s.closeGame);
  const { statusBarHeight = 44 } = Taro.getSystemInfoSync();

  // Guard: if store was never set (direct navigation), go back immediately
  useEffect(() => {
    if (!gameUrl) navigation.back();
  }, []);

  const handleClose = () => {
    navigation.back();
    // Clear store after navigation to avoid flicker on previous page
    setTimeout(() => closeGame(), 100);
  };

  if (!gameUrl) return null;

  return (
    <View className="game-play-page">
      <WebView className="game-webview" src={gameUrl} />
      {/* CoverView can overlay on top of WebView in WeChat */}
      <CoverView
        className="game-header-cover"
        style={{ paddingTop: `${statusBarHeight}px` }}
      >
        <CoverView className="close-btn" onClick={handleClose}>✕</CoverView>
        <CoverView className="game-title-text">{gameTitle}</CoverView>
        <CoverView className="header-spacer" />
      </CoverView>
    </View>
  );
}
