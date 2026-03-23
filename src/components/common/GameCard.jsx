import { useEffect, useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import { getSafeGameImage } from '../../utils/media';
import './GameCard.scss';

const HOT_LABEL = '\u70ed\u95e8';
const HOW_TO_PLAY_TITLE = '\u73a9\u6cd5\u8bf4\u660e';
const HOW_TO_PLAY_FALLBACK = '\u6682\u65f6\u8fd8\u6ca1\u6709\u73a9\u6cd5\u8bf4\u660e';
const HOW_TO_PLAY_CONFIRM = '\u77e5\u9053\u4e86';
const PLAY_ICON = '\u25b6';
const COMMENT_ICON = '\ud83d\udcac';
const LIKE_ICON = '\u2665';
const LIKE_OUTLINE_ICON = '\u2661';
const BOOKMARK_ICON = '\u2605';
const BOOKMARK_OUTLINE_ICON = '\u2606';
const CLOSE_ICON = '\u00d7';

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
    game.bookmarks ||
    game.bookmarkCount ||
    game.favoriteCount ||
    game.favorites ||
    0
  ) || 0;
}

export const GameCard = ({
  game,
  onPlay,
  onComment,
  onToggleLike,
  onToggleBookmark,
  variant = 'default',
}) => {
  const [isLiked, setIsLiked] = useState(Boolean(game.viewerHasLiked));
  const [isBookmarked, setIsBookmarked] = useState(Boolean(game.viewerHasBookmarked));
  const [likeCount, setLikeCount] = useState(Number(game.likes) || 0);
  const [bookmarkCount, setBookmarkCount] = useState(getBookmarkCount(game));
  const [likeLoading, setLikeLoading] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const navigation = useNavigation();
  const isPlayOnlyVariant = variant === 'play-only';

  useEffect(() => {
    setIsLiked(Boolean(game.viewerHasLiked));
    setIsBookmarked(Boolean(game.viewerHasBookmarked));
    setLikeCount(Number(game.likes) || 0);
    setBookmarkCount(getBookmarkCount(game));
  }, [game]);

  const thumbnailUrl = getSafeGameImage(game);
  const hasThumbnail = Boolean(thumbnailUrl);
  const howToPlayText = game.howToPlay || game.instructions || game.rules || '';

  const handlePlay = () => {
    if (showHowToPlay) return;

    if (onPlay) {
      onPlay(game);
      return;
    }

    navigation.push({
      url: `/pages/game/detail/index?id=${game.id}`,
    });
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

  const handleHowToPlay = (e) => {
    e.stopPropagation();
    setShowHowToPlay(true);
  };

  const handleComment = (e) => {
    e.stopPropagation();

    if (onComment) {
      onComment(game);
      return;
    }

    navigation.push({
      url: `/pages/game/detail/index?id=${game.id}&openComment=1`,
    });
  };

  const handleCloseHowToPlay = (e) => {
    e.stopPropagation();
    setShowHowToPlay(false);
  };

  return (
    <View className="game-card" onClick={handlePlay}>
      <View className="game-preview">
        <Text className="game-emoji">{game.emoji}</Text>
        {hasThumbnail && <Image className="game-thumbnail" src={thumbnailUrl} mode="aspectFill" />}

        {game.isHot && <View className="hot-badge">{HOT_LABEL}</View>}

        <View className="how-to-play-btn" onClick={handleHowToPlay}>
          <Text className="how-to-play-icon">ⓘ</Text>
        </View>

        <View className="preview-overlay">
          <View className={`preview-footer${isPlayOnlyVariant ? ' preview-footer--play-only' : ''}`}>
            {!isPlayOnlyVariant ? (
              <View className="author-row">
                <Text className="author-name">{game.author}</Text>
              </View>
            ) : null}
            <View className={`stats-row${isPlayOnlyVariant ? ' stats-row--play-only' : ''}`}>
              <Text className="stat-text">
                <Text className="stat-icon">{PLAY_ICON}</Text>
                <Text className="stat-value">{formatNumber(game.plays || 0)}</Text>
              </Text>
              {!isPlayOnlyVariant ? (
                <>
                  <Text className="stat-text comment-text" onClick={handleComment}>
                    <Text className="stat-icon">{COMMENT_ICON}</Text>
                    <Text className="stat-value">{formatNumber(game.comments || game.commentCount || 0)}</Text>
                  </Text>
                  <Text
                    className={`stat-text like-text ${isLiked ? 'liked' : ''} ${likeLoading ? 'pending' : ''}`}
                    onClick={handleLike}
                  >
                    <Text className="stat-icon">{isLiked ? LIKE_ICON : LIKE_OUTLINE_ICON}</Text>
                    <Text className="stat-value">{formatNumber(likeCount)}</Text>
                  </Text>
                  <Text
                    className={`stat-text bookmark-text ${isBookmarked ? 'bookmarked' : ''} ${bookmarkLoading ? 'pending' : ''}`}
                    onClick={handleBookmark}
                  >
                    <Text className="stat-icon">{isBookmarked ? BOOKMARK_ICON : BOOKMARK_OUTLINE_ICON}</Text>
                    <Text className="stat-value">{formatNumber(bookmarkCount)}</Text>
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      <View className="game-info">
        <Text className="game-title">{game.title}</Text>
      </View>

      {showHowToPlay && (
        <View className="how-to-play-popup" onClick={handleCloseHowToPlay}>
          <View className="how-to-play-content" onClick={(e) => e.stopPropagation()}>
            <View className="how-to-play-header">
              <Text className="how-to-play-title">{HOW_TO_PLAY_TITLE}</Text>
              <View className="how-to-play-close" onClick={handleCloseHowToPlay}>
                <Text className="how-to-play-close-text">{CLOSE_ICON}</Text>
              </View>
            </View>
            <View className="how-to-play-body">
              <Text className="how-to-play-text">{howToPlayText || game.description || HOW_TO_PLAY_FALLBACK}</Text>
            </View>
            <View className="how-to-play-footer">
              <View className="how-to-play-start-btn" onClick={handleCloseHowToPlay}>
                <Text>{HOW_TO_PLAY_CONFIRM}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};
