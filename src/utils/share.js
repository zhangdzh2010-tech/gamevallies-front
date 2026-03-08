

/**
 * Generate share config for WeChat share
 */
export function getShareConfig(game, score) {
  const title = score ?
  `我在创游谷玩《${game.title}》得分${score}分，快来挑战！` :
  `来玩我制作的游戏《${game.title}》on 创游谷`;

  const path = `/pages/game/index?id=${game.id}${score ? `&score=${score}` : ''}`;

  const imageUrl = game.coverImage || game.thumbnail || '/assets/default-share.png';

  return {
    title,
    path,
    imageUrl,
    query: {
      id: game.id,
      ...(score && { score: score.toString() })
    }
  };
}

/**
 * Generate shareable game link
 */
export function getGameShareLink(gameId, baseUrl = 'https://gamevallies.local') {
  return `${baseUrl}/game/${gameId}`;
}

/**
 * Generate creator profile link
 */
export function getCreatorShareLink(creatorId, baseUrl = 'https://gamevallies.local') {
  return `${baseUrl}/creator/${creatorId}`;
}

/**
 * Generate short share text
 */
export function generateShareText(game, includeAuthor = true) {
  let text = `《${game.title}》`;

  if (includeAuthor) {
    text += ` by ${game.creator?.username || 'Unknown'}`;
  }

  text += ` | 创游谷`;

  return text;
}

/**
 * Generate poster data for canvas rendering
 * This is a placeholder that returns the structure needed
 */
export function generateSharePosterData(game, score) {
  return {
    width: 750,
    height: 1334,
    backgroundColor: '#FFFFFF',
    elements: [
    {
      type: 'image',
      x: 0,
      y: 0,
      width: 750,
      height: 400,
      src: game.coverImage || game.thumbnail || '/assets/default-cover.png'
    },
    {
      type: 'text',
      x: 40,
      y: 430,
      width: 670,
      text: game.title,
      fontSize: 36,
      fontWeight: 'bold',
      color: '#000000',
      lineHeight: 1.2,
      maxLines: 2
    },
    {
      type: 'text',
      x: 40,
      y: 530,
      width: 670,
      text: `by ${game.creator?.username || 'Unknown Creator'}`,
      fontSize: 18,
      color: '#666666'
    },
    ...(score ?
    [
    {
      type: 'text',
      x: 40,
      y: 600,
      width: 670,
      text: `我的得分: ${score}分`,
      fontSize: 24,
      color: '#FF6B6B',
      fontWeight: 'bold'
    }] :

    []),
    {
      type: 'text',
      x: 40,
      y: 1100,
      width: 670,
      text: '创游谷',
      fontSize: 20,
      color: '#999999'
    },
    {
      type: 'qrcode',
      x: 600,
      y: 1150,
      width: 100,
      height: 100,
      content: `https://gamevallies.local/game/${game.id}`
    }]

  };
}

/**
 * Canvas-based poster generation (actual implementation would use Canvas API)
 * For now, returns the data structure needed for rendering
 */
export async function generateSharePoster(game, score) {
  const posterData = generateSharePosterData(game, score);

  // In a real implementation, this would:
  // 1. Create a canvas element
  // 2. Draw all elements (background, texts, images, QR code)
  // 3. Convert to image blob/data URL

  // Placeholder: return a mock URL
  return Promise.resolve(`data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`);
}

/**
 * Format share statistics
 */
export function formatShareStats(game) {
  return {
    likes: game.likeCount,
    comments: game.commentCount,
    plays: game.playCount,
    shares: game.shareCount,
    forks: game.forkCount
  };
}

/**
 * Generate hashtags for social media sharing
 */
export function generateHashtags(game) {
  const hashtags = ['#创游谷', '#GameDev', `#${game.gameType}`];

  if (game.tags && game.tags.length > 0) {
    hashtags.push(...game.tags.slice(0, 3).map((tag) => `#${tag}`));
  }

  return hashtags;
}