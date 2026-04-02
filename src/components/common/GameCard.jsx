import { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, Image } from '@tarojs/components';
import { getSafeGameImage } from '../../utils/media';
import './GameCard.scss';

const HOT_LABEL = '热门';

function formatNumber(value) {
  const num = Number(value) || 0;

  if (num >= 10000) {
    return `${(num / 10000).toFixed(1)}w`;
  }

  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }

  return String(num);
}

function getBookmarkCount(game) {
  return Number(
    game.bookmarks
    || game.bookmarkCount
    || game.favoriteCount
    || game.favorites
    || 0
  ) || 0;
}

export const GameCard = ({
  game,
  onPlay,
  onComment,
  onOpenDetail,
  onToggleLike,
  onToggleBookmark,
  variant = 'default',
  showDetailEntry = false,
  badgeLabel,
}) => {
  const [isLiked, setIsLiked] = useState(Boolean(game.viewerHasLiked));
  const [isBookmarked, setIsBookmarked] = useState(Boolean(game.viewerHasBookmarked));
  const [likeCount, setLikeCount] = useState(Number(game.likes) || 0);
  const [bookmarkCount, setBookmarkCount] = useState(getBookmarkCount(game));
  const [likeLoading, setLikeLoading] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const isPlayOnlyVariant = variant === 'play-only';
  const isHomeShowcaseVariant = variant === 'home-showcase';
  const isCompactStatsVariant = isPlayOnlyVariant || isHomeShowcaseVariant;
  const showTopMetricBadge = isHomeShowcaseVariant;
  const topMetricBadgeLabel = badgeLabel || (game.isHot ? HOT_LABEL : '推荐');
  const isHotMetricBadge = !badgeLabel && game.isHot;

  useEffect(() => {
    setIsLiked(Boolean(game.viewerHasLiked));
    setIsBookmarked(Boolean(game.viewerHasBookmarked));
    setLikeCount(Number(game.likes) || 0);
    setBookmarkCount(getBookmarkCount(game));
  }, [game]);

  const thumbnailUrl = getSafeGameImage(game);
  const hasThumbnail = Boolean(thumbnailUrl);
  const rootClassName = [
    'game-card',
    hasThumbnail ? 'game-card--with-thumbnail' : '',
    isHomeShowcaseVariant ? 'game-card--home-showcase' : '',
  ].filter(Boolean).join(' ');

  const handlePlay = () => {
    if (onPlay) {
      onPlay(game);
      return;
    }

    Taro.navigateTo({ url: `/pages/game/detail/index?id=${game.id}` });
  };

  const handleLike = async (e) => {
    e.stopPropagation();

    if (likeLoading) {
      return;
    }

    if (!onToggleLike) {
      const nextLiked = !isLiked;
      setIsLiked(nextLiked);
      setLikeCount((prev) => Math.max(0, prev + (nextLiked ? 1 : -1)));
      return;
    }

    setLikeLoading(true);
    try {
      const result = await onToggleLike(game);
      const nextLiked = typeof result?.liked === 'boolean' ? result.liked : !isLiked;
      const nextLikes = Number.isFinite(Number(result?.likes))
        ? Number(result.likes)
        : Math.max(0, likeCount + (nextLiked ? 1 : -1));

      setIsLiked(nextLiked);
      setLikeCount(nextLikes);
    } finally {
      setLikeLoading(false);
    }
  };

  const handleBookmark = async (e) => {
    e.stopPropagation();

    if (bookmarkLoading) {
      return;
    }

    if (!onToggleBookmark) {
      const nextBookmarked = !isBookmarked;
      setIsBookmarked(nextBookmarked);
      setBookmarkCount((prev) => Math.max(0, prev + (nextBookmarked ? 1 : -1)));
      return;
    }

    setBookmarkLoading(true);
    try {
      const result = await onToggleBookmark(game);
      const nextBookmarked = typeof result?.bookmarked === 'boolean'
        ? result.bookmarked
        : !isBookmarked;
      const nextBookmarks = Number.isFinite(Number(result?.bookmarks))
        ? Number(result.bookmarks)
        : Math.max(0, bookmarkCount + (nextBookmarked ? 1 : -1));
      setIsBookmarked(nextBookmarked);
      setBookmarkCount(nextBookmarks);
    } finally {
      setBookmarkLoading(false);
    }
  };

  const handleComment = (e) => {
    e.stopPropagation();

    if (onComment) {
      onComment(game);
      return;
    }

    Taro.navigateTo({ url: `/pages/game/detail/index?id=${game.id}&openComment=1` });
  };

  const handleOpenDetail = (e) => {
    e.stopPropagation();

    if (onOpenDetail) {
      onOpenDetail(game);
      return;
    }

    Taro.navigateTo({ url: `/pages/game/detail/index?id=${game.id}` });
  };

  return (
    <View className={rootClassName} onClick={handlePlay}>
      <View className="game-preview">
        <Text className="game-emoji">{game.emoji}</Text>
        {hasThumbnail && <Image className="game-thumbnail" src={thumbnailUrl} mode="aspectFill" />}

        {showTopMetricBadge ? (
          <View className={`top-metric-badge top-metric-badge--minimal${isHotMetricBadge ? ' is-hot' : ''}`}>
            <Text className="top-metric-badge__tag-text">{topMetricBadgeLabel}</Text>
          </View>
        ) : (
          game.isHot ? <View className="hot-badge">{HOT_LABEL}</View> : null
        )}

        {showDetailEntry ? (
          <View className="detail-entry-btn" onClick={handleOpenDetail}>
            <Text className="detail-entry-dots">...</Text>
          </View>
        ) : null}

        <View className="preview-overlay">
          <View className={`preview-footer${isCompactStatsVariant ? ' preview-footer--play-only' : ''}`}>
            {!isCompactStatsVariant ? (
              <View className="author-row">
                <Text className="author-name">{game.author}</Text>
              </View>
            ) : null}
            <View className={`stats-row${isCompactStatsVariant ? ' stats-row--play-only' : ''}`}>
              <View className="stat-text play-text">
                <View className="stat-icon stat-icon--play" />
                <Text className="stat-value">{formatNumber(game.plays || 0)}</Text>
              </View>
              {!isCompactStatsVariant ? (
                <>
                  <View className="stat-text comment-text" onClick={handleComment}>
                    <View className="stat-icon stat-icon--comment" />
                    <Text className="stat-value">{formatNumber(game.comments || game.commentCount || 0)}</Text>
                  </View>
                  <View
                    className={`stat-text like-text ${isLiked ? 'liked' : ''} ${likeLoading ? 'pending' : ''}`}
                    onClick={handleLike}
                  >
                    <View className={`stat-icon stat-icon--like${isLiked ? ' is-active' : ''}`} />
                    <Text className="stat-value">{formatNumber(likeCount)}</Text>
                  </View>
                  <View
                    className={`stat-text bookmark-text ${isBookmarked ? 'bookmarked' : ''} ${bookmarkLoading ? 'pending' : ''}`}
                    onClick={handleBookmark}
                  >
                    <View className={`stat-icon stat-icon--bookmark${isBookmarked ? ' is-active' : ''}`} />
                    <Text className="stat-value">{formatNumber(bookmarkCount)}</Text>
                  </View>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      <View className="game-info">
        <Text className="game-title">{game.title}</Text>
      </View>
    </View>
  );
};
