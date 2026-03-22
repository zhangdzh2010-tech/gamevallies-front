import Taro from '@tarojs/taro';

const BOOKMARK_STORAGE_KEY = 'gamevallies_bookmarked_games';

function readBookmarkedGames() {
  try {
    const raw = Taro.getStorageSync(BOOKMARK_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => item && item.id);
  } catch (error) {
    console.warn('Failed to read bookmarked games', error);
    return [];
  }
}

function writeBookmarkedGames(games) {
  try {
    Taro.setStorageSync(BOOKMARK_STORAGE_KEY, JSON.stringify(games));
  } catch (error) {
    console.warn('Failed to write bookmarked games', error);
  }
}

function normalizeBookmarkedGame(game = {}) {
  return {
    id: game.id,
    title: game.title || '未命名游戏',
    description: game.description || '',
    status: game.status || 'published',
    gameUrl: game.gameUrl || '',
    coverUrl: game.coverUrl || '',
    thumbnailUrl: game.thumbnailUrl || game.coverUrl || '',
    emoji: game.emoji || '🎮',
    color: game.color || '#6e56ff',
    plays: Number(game.plays || game.playCount || 0),
    likes: Number(game.likes || game.likeCount || 0),
    comments: Number(game.comments || game.commentCount || 0),
    canPlay: game.canPlay !== false,
    authorId: game.authorId || game.author?.id || '',
    author: game.author || null,
    viewerHasBookmarked: true,
    bookmarkedAt: Date.now(),
  };
}

export function getBookmarkedGames() {
  return readBookmarkedGames();
}

export function getBookmarkedIds() {
  return readBookmarkedGames().map((game) => String(game.id));
}

export function isGameBookmarked(gameId) {
  if (!gameId) {
    return false;
  }

  const targetId = String(gameId);
  return readBookmarkedGames().some((game) => String(game.id) === targetId);
}

export function mergeBookmarkedFlags(games = []) {
  const bookmarkedIds = new Set(getBookmarkedIds());

  return games.map((game) => ({
    ...game,
    viewerHasBookmarked: bookmarkedIds.has(String(game.id)) || game.viewerHasBookmarked === true,
  }));
}

export function setGameBookmarked(game, shouldBookmark = true) {
  const gameId = game?.id ? String(game.id) : '';
  if (!gameId) {
    return readBookmarkedGames();
  }

  const currentGames = readBookmarkedGames();
  const remainingGames = currentGames.filter((item) => String(item.id) !== gameId);

  if (!shouldBookmark) {
    writeBookmarkedGames(remainingGames);
    return remainingGames;
  }

  const nextGames = [normalizeBookmarkedGame(game), ...remainingGames];
  writeBookmarkedGames(nextGames);
  return nextGames;
}

export function toggleGameBookmarked(game) {
  const bookmarked = !isGameBookmarked(game?.id);
  const games = setGameBookmarked(game, bookmarked);
  return { bookmarked, games };
}

export default {
  getBookmarkedGames,
  getBookmarkedIds,
  isGameBookmarked,
  mergeBookmarkedFlags,
  setGameBookmarked,
  toggleGameBookmarked,
};
