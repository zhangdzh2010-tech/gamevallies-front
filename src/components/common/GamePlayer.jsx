import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import useGamePlayerStore from '../../stores/gamePlayer';
import { getSafeStatusBarHeight } from '../../utils/systemInfo';
import { isH5Runtime } from '../../utils/runtime';
import './GamePlayer.scss';

function requestElementFullscreen(element) {
  if (!element || typeof document === 'undefined') {
    return Promise.resolve(false);
  }

  const requestFullscreen = element.requestFullscreen
    || element.webkitRequestFullscreen
    || element.msRequestFullscreen;

  if (!requestFullscreen) {
    return Promise.resolve(false);
  }

  try {
    const result = requestFullscreen.call(element);
    if (result && typeof result.then === 'function') {
      return result.then(() => true).catch(() => false);
    }
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

function exitAnyFullscreen() {
  if (typeof document === 'undefined') {
    return Promise.resolve(false);
  }

  const exitFullscreen = document.exitFullscreen
    || document.webkitExitFullscreen
    || document.msExitFullscreen;

  if (!getActiveFullscreenElement() || !exitFullscreen) {
    return Promise.resolve(false);
  }

  try {
    const result = exitFullscreen.call(document);
    if (result && typeof result.then === 'function') {
      return result.then(() => true).catch(() => false);
    }
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}

function getActiveFullscreenElement() {
  if (typeof document === 'undefined') {
    return null;
  }

  return document.fullscreenElement
    || document.webkitFullscreenElement
    || document.msFullscreenElement
    || null;
}

async function lockLandscapeOrientation() {
  if (typeof screen === 'undefined' || !screen.orientation?.lock) {
    return false;
  }

  try {
    await screen.orientation.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

function unlockScreenOrientation() {
  try {
    screen.orientation?.unlock?.();
  } catch {
    // Ignore unlock failures in unsupported browsers.
  }
}

export function GamePlayer({ gameUrl, gameTitle, gameOrientation = 'portrait', minimized = false, onClose, onMinimize }) {
  const isH5 = isH5Runtime();
  const statusBarHeight = process.env.TARO_ENV === 'weapp' ? getSafeStatusBarHeight() : 0;
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [displayUrl, setDisplayUrl] = useState('');
  const [displayTitle, setDisplayTitle] = useState('');
  const exitTimer = useRef(null);
  const iframeRef = useRef(null);
  const panelRef = useRef(null);
  const requestedFullscreenRef = useRef(false);
  const isLandscapeGame = gameOrientation === 'landscape';

  useEffect(() => {
    if (gameUrl) {
      if (exitTimer.current) clearTimeout(exitTimer.current);
      setDisplayUrl(gameUrl);
      setDisplayTitle(gameTitle || '作品体验');
      setLoading(true);
      setFullscreen(isLandscapeGame);
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
  }, [gameUrl, gameTitle, isLandscapeGame]);

  useEffect(() => {
    if (process.env.TARO_ENV !== 'h5' || typeof document === 'undefined') {
      return undefined;
    }

    const handleFullscreenChange = () => {
      const currentFullscreenElement = getActiveFullscreenElement();
      if (currentFullscreenElement !== panelRef.current) {
        requestedFullscreenRef.current = false;
        unlockScreenOrientation();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      unlockScreenOrientation();
      if (requestedFullscreenRef.current || getActiveFullscreenElement() === panelRef.current) {
        exitAnyFullscreen().catch(() => {});
        requestedFullscreenRef.current = false;
      }
    };
  }, []);

  const handleToggleFullscreen = async () => {
    const nextFullscreen = !fullscreen;
    setFullscreen(nextFullscreen);

    if (process.env.TARO_ENV !== 'h5') {
      return;
    }

    if (nextFullscreen) {
      const enteredFullscreen = await requestElementFullscreen(panelRef.current);
      if (enteredFullscreen) {
        requestedFullscreenRef.current = true;
        if (isLandscapeGame) {
          await lockLandscapeOrientation();
        }
      }
      return;
    }

    unlockScreenOrientation();
    if (requestedFullscreenRef.current || getActiveFullscreenElement() === panelRef.current) {
      await exitAnyFullscreen();
      requestedFullscreenRef.current = false;
    }
  };

  if (!displayUrl) return null;

  const overlayStyle = minimized
    ? { display: 'none', pointerEvents: 'none' }
    : undefined;

  return (
    <View
      className={`game-player-overlay${isH5 ? ' game-player-overlay--h5' : ''}${visible ? ' visible' : ''}${minimized ? ' minimized' : ''}`}
      style={overlayStyle}
    >
      <View className="game-player-backdrop" onClick={onClose} />
      <View
        ref={panelRef}
        className={`game-player-panel${visible ? ' visible' : ''}${fullscreen ? ' fullscreen' : ''}${isLandscapeGame ? ' landscape' : ''}`}
      >
        <View className="player-header" style={{ paddingTop: `${statusBarHeight}px` }}>
          <View className="player-btn back-btn" onClick={onClose}>
            <View className="back-arrow" />
            <Text className="back-text">关闭</Text>
          </View>
          <Text className="player-title">{displayTitle}</Text>
          <View className="player-header-actions">
            {onMinimize ? (
              <View
                className="player-btn minimize-btn"
                onClick={onMinimize}
              >
                <Text className="fs-icon">收起</Text>
              </View>
            ) : null}
            <View
              className="player-btn fullscreen-btn"
              onClick={handleToggleFullscreen}
            >
              <Text className="fs-icon">{fullscreen ? '退出' : '全屏'}</Text>
            </View>
          </View>
        </View>

        {loading && (
          <View className="player-loading">
            <Text className="loading-text">作品加载中...</Text>
          </View>
        )}

        <View className="player-iframe-wrapper">
          <iframe
            ref={iframeRef}
            className="player-iframe"
            src={displayUrl}
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            allow="autoplay; fullscreen"
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
  const gameOrientation = useGamePlayerStore((s) => s.gameOrientation);
  const minimized = useGamePlayerStore((s) => s.minimized);
  const closeGame = useGamePlayerStore((s) => s.closeGame);
  const minimizeGame = useGamePlayerStore((s) => s.minimizeGame);
  return (
    <GamePlayer
      gameUrl={gameUrl}
      gameTitle={gameTitle}
      gameOrientation={gameOrientation}
      minimized={minimized}
      onClose={closeGame}
      onMinimize={minimizeGame}
    />
  );
}

