import React, { useState } from 'react';
import { View, Text } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import './GameCard.scss';



















export const GameCard = ({ game, onPlay, onFork }) => {
  const [isLiked, setIsLiked] = useState(false);
  const [liked, setLiked] = useState(game.likes);
  const navigation = useNavigation();

  const handlePlay = () => {
    if (onPlay) {
      onPlay(game);
    } else {
      navigation.push({
        url: `/pages/game/detail/index?id=${game.id}`
      });
    }
  };

  const handleFork = (e) => {
    e.stopPropagation();
    if (onFork) {
      onFork(game.id);
    }
  };

  const handleLike = (e) => {
    e.stopPropagation();
    setIsLiked(!isLiked);
    setLiked(isLiked ? liked - 1 : liked + 1);
  };

  const formatNumber = (num) => {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + '万';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
  };

  return (
    <View className="game-card" onClick={handlePlay}>
      <View
        className="game-preview"
        style={{
          background: `linear-gradient(135deg, ${game.color}20 0%, ${game.color}40 100%)`
        }}>
        
        <Text className="game-emoji">{game.emoji}</Text>
        <View className="play-overlay">
          <View className="play-button">▶</View>
        </View>
        {game.isHot && <View className="hot-badge">🔥 热门</View>}
      </View>

      <View className="game-info">
        <Text className="game-title">{game.title}</Text>
        <Text className="game-description">{game.description}</Text>

        <View className="author-row">
          <Text className="author-emoji">{game.authorEmoji}</Text>
          <Text className="author-name">{game.author}</Text>
        </View>

        <View className="stats-row">
          <View className="stat">
            <Text className="stat-label">▶ {formatNumber(game.plays)}</Text>
          </View>
          <View className="stat like-stat" onClick={handleLike}>
            <Text className={`stat-label ${isLiked ? 'liked' : ''}`}>
              ♥ {formatNumber(liked)}
            </Text>
          </View>
          <View className="stat fork-stat" onClick={handleFork}>
            <Text className="stat-label">🔀 Fork</Text>
          </View>
        </View>
      </View>
    </View>);

};