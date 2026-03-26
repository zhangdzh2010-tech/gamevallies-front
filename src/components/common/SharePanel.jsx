/* eslint-disable react/prop-types */
import { Button, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { getGameTypeLabel } from '../../utils/gameTypes';
import { formatShareStats, getShareConfig } from '../../utils/share';
import * as socialService from '../../services/social';
import './SharePanel.scss';

function getShareLink(path) {
  if (process.env.TARO_ENV !== 'h5') {
    return path;
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}${path}`;
}

export function SharePanel({
  visible,
  game,
  onClose,
  onContinueCreate,
  continueLabel = '继续完善',
  continueDisabled = false,
}) {
  if (!visible) return null;

  const shareConfig = getShareConfig(game, undefined, {
    title: game?.title ? `来试试《${game.title}》` : '来试试这款游戏',
  });
  const stats = formatShareStats(game);
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const gameTypeLabel = getGameTypeLabel(game?.type || game?.gameType) || '小游戏';

  const handleShareToFriend = async () => {
    if (isWeapp) {
      return;
    }

    const shareUrl = getShareLink(shareConfig.path);

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: shareConfig.title, url: shareUrl });
        if (game?.id) {
          socialService.recordShare(game.id, 'h5_share').catch(() => {});
        }
        Taro.showToast({ title: '已调用系统分享', icon: 'success' });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        if (game?.id) {
          socialService.recordShare(game.id, 'copy_link').catch(() => {});
        }
        Taro.showToast({ title: '链接已复制', icon: 'success' });
      } else {
        await Taro.showModal({ title: '分享链接', content: shareUrl, showCancel: false });
      }
    } catch {
      await Taro.showModal({ title: '分享链接', content: shareUrl, showCancel: false });
    }

    onClose();
  };

  return (
    <View className="share-overlay" onClick={onClose}>
      <View className="share-panel" onClick={(e) => e.stopPropagation()}>
        <View className="share-panel__handle" />

        <View className="share-header">
          <Text className="share-title">分享作品</Text>
          <Text className="share-subtitle">把这款游戏发给好友，一起试玩和讨论</Text>
        </View>

        {game ? (
          <View className="share-game-card">
            <View
              className="share-game-preview"
              style={{ background: game.color ? `${game.color}30` : 'rgba(110, 86, 255, 0.2)' }}
            >
              <Text className="share-game-emoji">{game.emoji || '🎮'}</Text>
            </View>
            <View className="share-game-copy">
              <Text className="share-game-name">{game.title || '未命名游戏'}</Text>
              <Text className="share-game-meta">
                {gameTypeLabel} · {game.author?.username || game.author || '创作者'}
              </Text>
            </View>
          </View>
        ) : null}

        <View className="share-stats">
          <View className="share-stat">
            <Text className="share-stat__value">{stats.plays || 0}</Text>
            <Text className="share-stat__label">试玩</Text>
          </View>
          <View className="share-stat">
            <Text className="share-stat__value">{stats.likes || 0}</Text>
            <Text className="share-stat__label">点赞</Text>
          </View>
          <View className="share-stat">
            <Text className="share-stat__value">{stats.comments || 0}</Text>
            <Text className="share-stat__label">评论</Text>
          </View>
        </View>

        <View className="share-actions">
          {isWeapp ? (
            <Button className="share-primary-btn" openType="share">
              <Text className="share-primary-btn__icon">↗</Text>
              <View className="share-primary-btn__copy">
                <Text className="share-primary-btn__title">立即分享给好友</Text>
                <Text className="share-primary-btn__desc">微信会使用当前页面的原生分享能力</Text>
              </View>
            </Button>
          ) : (
            <View className="share-primary-btn" onClick={handleShareToFriend}>
              <Text className="share-primary-btn__icon">↗</Text>
              <View className="share-primary-btn__copy">
                <Text className="share-primary-btn__title">复制链接或系统分享</Text>
                <Text className="share-primary-btn__desc">支持浏览器原生分享，不支持时自动复制链接</Text>
              </View>
            </View>
          )}

          {isWeapp ? (
            <View className="share-tip-card">
              <Text className="share-tip-card__title">朋友圈分享说明</Text>
              <Text className="share-tip-card__text">分享到朋友圈请使用右上角菜单，当前页面已配置朋友圈分享信息。</Text>
            </View>
          ) : null}
        </View>

        {typeof onContinueCreate === 'function' ? (
          <View
            className={`share-secondary-btn${continueDisabled ? ' is-disabled' : ''}`}
            onClick={continueDisabled ? undefined : onContinueCreate}
          >
            <Text className="share-secondary-btn__title">{continueLabel}</Text>
            <Text className="share-secondary-btn__desc">前往专属创作页面，继续完善这款作品</Text>
          </View>
        ) : null}

        <View className="share-cancel" onClick={onClose}>
          <Text>收起</Text>
        </View>
      </View>
    </View>
  );
}
