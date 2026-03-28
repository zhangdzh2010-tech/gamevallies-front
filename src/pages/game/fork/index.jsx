import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { useRoute } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import { AppTopBar } from '../../../components/common/AppTopBar';
import { GlobalGamePlayer } from '../../../components/common/GamePlayer';
import { PaywallPopup } from '../../../components/common/PaywallPopup';
import * as gameService from '../../../services/game';
import { useGameStore } from '../../../store/gameStore';
import {
  LOGIN_PAGE_URL,
  buildForkPageUrl,
  isLoggedIn,
  openIteratePageWithAuth,
  setPostLoginRedirect,
} from '../../../utils/authNavigation';
import { Storage } from '../../../utils/storage';
import { getSafeSystemInfo } from '../../../utils/systemInfo';
import './index.scss';

function formatNumber(num) {
  const n = Number(num) || 0;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function getAuthorName(game) {
  return game?.author?.displayName
    || game?.author?.nickname
    || game?.author?.username
    || game?.authorName
    || game?.creatorName
    || (typeof game?.author === 'string' ? game.author : '')
    || '创作者';
}

export default function GameForkPage() {
  const route = useRoute();
  const sourceGameId = route?.params?.sourceGameId || '';
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const { setCurrentGame } = useGameStore();
  const [sourceGame, setSourceGame] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pageError, setPageError] = useState('');
  const currentUser = Storage.getUser() || {};
  const currentUserId = currentUser?.id || '';
  const { windowHeight = 720 } = getSafeSystemInfo();
  const scrollViewHeight = Math.max(windowHeight - 120, 420);
  const containerClassName = `fork-page${isWeapp ? ' fork-page--weapp' : ''}`;

  useEffect(() => {
    if (isLoggedIn()) {
      return;
    }

    const targetUrl = buildForkPageUrl(sourceGameId);
    setPostLoginRedirect(targetUrl);
    Taro.navigateTo({ url: LOGIN_PAGE_URL }).catch(() => {});
  }, [sourceGameId]);

  useEffect(() => {
    if (!sourceGameId) {
      setIsLoading(false);
      setPageError('缺少作品信息');
      return;
    }

    let cancelled = false;

    const loadGame = async () => {
      setIsLoading(true);
      setPageError('');

      try {
        const game = await gameService.getGame(sourceGameId);
        if (!cancelled) {
          setSourceGame(game);
        }
      } catch (_error) {
        if (!cancelled) {
          setPageError('加载作品失败，请返回详情页重试');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadGame();

    return () => {
      cancelled = true;
    };
  }, [sourceGameId]);

  const isOwnGame = Boolean(currentUserId && String(sourceGame?.author?.id || sourceGame?.authorId || '') === String(currentUserId));
  const canForkGame = Boolean(sourceGame && !isOwnGame && sourceGame.allowFork !== false);
  const authorName = getAuthorName(sourceGame);

  const statItems = useMemo(() => ([
    { label: '试玩', value: formatNumber(sourceGame?.plays) },
    { label: '点赞', value: formatNumber(sourceGame?.likes) },
    { label: '复刻', value: formatNumber(sourceGame?.forks) },
  ]), [sourceGame?.forks, sourceGame?.likes, sourceGame?.plays]);

  const handleFork = async () => {
    if (!sourceGameId) {
      Taro.showToast({ title: '缺少作品信息', icon: 'none' });
      return;
    }

    if (isOwnGame) {
      Taro.showToast({ title: '不能复刻自己的作品', icon: 'none' });
      return;
    }

    if (!canForkGame) {
      Taro.showToast({ title: '作者未开放复刻权限', icon: 'none' });
      return;
    }

    setIsSubmitting(true);

    try {
      const newGameId = await gameService.forkGame(sourceGameId);
      let forkedGame = null;

      try {
        forkedGame = await gameService.getGame(newGameId);
      } catch (_error) {
        const fallbackAuthorName = currentUser?.displayName
          || currentUser?.nickname
          || currentUser?.username
          || '我';

        forkedGame = {
          ...(sourceGame || {}),
          id: newGameId,
          status: 'draft',
          title: sourceGame?.title || '未命名游戏',
          description: sourceGame?.description || '',
          author: {
            ...(typeof sourceGame?.author === 'object' ? sourceGame.author : {}),
            id: currentUserId || sourceGame?.author?.id || sourceGame?.authorId || '',
            username: fallbackAuthorName,
            displayName: fallbackAuthorName,
          },
          authorId: currentUserId || sourceGame?.authorId || '',
          viewerHasLiked: false,
          viewerHasBookmarked: false,
        };
      }

      setCurrentGame(forkedGame);
      Taro.showToast({ title: '已加入我的创作', icon: 'success' });
      setTimeout(() => {
        openIteratePageWithAuth(forkedGame, newGameId);
      }, 220);
    } catch (error) {
      Taro.showToast({ title: error?.message || '复刻失败，请重试', icon: 'none' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack />
        <View className="fork-hero">
          <Text className="fork-hero__title">正在准备复刻页面</Text>
          <Text className="fork-hero__subtitle">马上展示这款作品的当前信息</Text>
        </View>
        <View className="fork-loading-card">
          <View className="fork-loading-card__spinner" />
          <Text className="fork-loading-card__text">正在加载作品详情...</Text>
        </View>
      </View>
    );
  }

  if (!sourceGame) {
    return (
      <View className={containerClassName}>
        <AppTopBar showBack />
        <View className="fork-hero">
          <Text className="fork-hero__title">暂时无法复刻这款作品</Text>
          <Text className="fork-hero__subtitle">{pageError || '请返回详情页后重试'}</Text>
        </View>
        <View className="fork-empty-card">
          <Text className="fork-empty-card__icon">⎇</Text>
          <Text className="fork-empty-card__title">没有拿到作品数据</Text>
          <Text className="fork-empty-card__text">请返回作品详情页后重试。</Text>
        </View>
      </View>
    );
  }

  return (
    <View className={containerClassName}>
      <AppTopBar showBack />
      <View className="fork-hero">
        <Text className="fork-hero__title">复刻这款游戏</Text>
        <Text className="fork-hero__subtitle">先将当前版本加入你的创作，再进入专属优化页面继续完善</Text>
      </View>

      <ScrollView className="fork-scroll" style={{ height: `${scrollViewHeight}px` }} scrollY>
        <View className="fork-panel">
          <View className="fork-source-card">
            <View className="fork-source-card__preview">
              <Text className="fork-source-card__emoji">{sourceGame.emoji || '🎮'}</Text>
            </View>
            <View className="fork-source-card__copy">
              <Text className="fork-source-card__title">{sourceGame.title || '未命名游戏'}</Text>
              <Text className="fork-source-card__meta">{authorName}</Text>
              {sourceGame.description ? (
                <Text className="fork-source-card__desc">{sourceGame.description}</Text>
              ) : null}
            </View>
          </View>

          <View className="fork-stat-grid">
            {statItems.map((item) => (
              <View key={item.label} className="fork-stat-item">
                <Text className="fork-stat-item__value">{item.value}</Text>
                <Text className="fork-stat-item__label">{item.label}</Text>
              </View>
            ))}
          </View>

          <View className="fork-guide-card">
            <Text className="fork-guide-card__title">复刻后会发生什么？</Text>
            <Text className="fork-guide-card__text">1. 将当前版本加入你的创作</Text>
            <Text className="fork-guide-card__text">2. 自动进入专属优化页面</Text>
            <Text className="fork-guide-card__text">3. 再由你提交优化想法继续创作</Text>
          </View>

          {!canForkGame ? (
            <View className="fork-warning-card">
              <Text className="fork-warning-card__text">
                {isOwnGame ? '这是你自己的作品，直接去优化即可。' : '作者未开放复刻权限，当前不能复刻这款作品。'}
              </Text>
            </View>
          ) : null}

          <View className="fork-actions">
            <View
              className={`fork-submit-btn ${(!canForkGame || isSubmitting) ? 'disabled' : ''}`}
              onClick={(!canForkGame || isSubmitting) ? undefined : handleFork}
            >
              <Text>{isSubmitting ? '复刻中...' : '立即复刻'}</Text>
            </View>
          </View>
        </View>

        <View style={{ height: '80px' }} />
      </ScrollView>

      <GlobalGamePlayer />
      <PaywallPopup />
    </View>
  );
}
