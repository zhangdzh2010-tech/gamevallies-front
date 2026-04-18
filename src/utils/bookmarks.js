import Taro from '@tarojs/taro';
import { getGameCoverUrl } from './media';
import * as feedService from '../services/feed';
import { Storage } from './storage';

const BOOKMARK_STORAGE_KEY = 'gamevallies_bookmarked_games';

// Backend endpoints may not be deployed in every environment. Once we observe a
// 404/network failure we remember it for the current session so subsequent calls
// skip the remote attempt and fall through to local storage without spamming errors.
let remoteBookmarkAvailable = true;

function markRemoteUnavailable(error) {
  const status = error?.response?.statusCode || error?.statusCode;
  if (status === 404 || status === 501) {
    remoteBookmarkAvailable = false;
  }
}

function hasAuthToken() {
  try {
    return Boolean(Storage.getToken && Storage.getToken());
  } catch (error) {
    return false;
  }
}

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
  const coverUrl = getGameCoverUrl(game);
  const thumbnailUrl = getGameCoverUrl({ thumbnailUrl: game.thumbnailUrl }, coverUrl);

  return {
    id: game.id,
    title: game.title || '未命名游戏',
    description: game.description || '',
    status: game.status || 'published',
    gameUrl: game.gameUrl || '',
    coverUrl,
    thumbnailUrl,
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

/**
 * Sync a bookmark change with the backend when possible. Falls back to local-only
 * storage on 404/network errors so existing behavior is preserved when the API is
 * not yet deployed. The UI should call this after the optimistic local update so
 * state stays consistent if the remote call fails.
 *
 * Returns an object `{ bookmarked, synced }` describing the final state.
 */
export async function syncBookmarkWithBackend(game, shouldBookmark) {
  const gameId = game?.id ? String(game.id) : '';
  if (!gameId) {
    return { bookmarked: false, synced: false };
  }

  if (!hasAuthToken() || !remoteBookmarkAvailable) {
    return { bookmarked: Boolean(shouldBookmark), synced: false };
  }

  try {
    if (shouldBookmark) {
      await feedService.addBookmark(gameId);
    } else {
      await feedService.removeBookmark(gameId);
    }
    return { bookmarked: Boolean(shouldBookmark), synced: true };
  } catch (error) {
    markRemoteUnavailable(error);
    if (process.env.NODE_ENV !== 'production') {
      console.warn('bookmark sync failed, falling back to local storage:', error);
    }
    return { bookmarked: Boolean(shouldBookmark), synced: false };
  }
}

/**
 * Hydrate the local bookmark cache from backend on demand, typically from the
 * Profile "bookmarks" tab. Non-fatal: returns local data if remote unreachable.
 *
 * Returns `{ items, hasMore, page, synced }` so callers can drive pagination.
 */
export async function hydrateBookmarksFromBackend(options = {}) {
  const { limit = 20, page = 1 } = options;

  if (!hasAuthToken() || !remoteBookmarkAvailable) {
    const localItems = readBookmarkedGames();
    return { items: localItems, hasMore: false, page: 1, synced: false };
  }

  try {
    const result = await feedService.getBookmarkList(page, limit);
    const items = Array.isArray(result?.items) ? result.items : [];
    const normalized = items
      .filter((item) => item && item.id)
      .map((item) => normalizeBookmarkedGame({ ...item, viewerHasBookmarked: true }));
    // Only the first page replaces the local cache so paginated fetches don't
    // accidentally overwrite earlier pages while scrolling deeper.
    if (page === 1) {
      writeBookmarkedGames(normalized);
    }
    const hasMore = typeof result?.hasMore === 'boolean'
      ? result.hasMore
      : items.length >= limit;
    return { items: normalized, hasMore, page, synced: true };
  } catch (error) {
    markRemoteUnavailable(error);
    if (process.env.NODE_ENV !== 'production') {
      console.warn('bookmark hydrate failed, using local cache:', error);
    }
    return { items: readBookmarkedGames(), hasMore: false, page: 1, synced: false };
  }
}

/**
 * Append a page of bookmarks from backend without overwriting the local cache.
 * Returns `{ items, hasMore, synced }`.
 */
export async function loadMoreBookmarksFromBackend(page, limit = 20) {
  if (!hasAuthToken() || !remoteBookmarkAvailable) {
    return { items: [], hasMore: false, synced: false };
  }

  try {
    const result = await feedService.getBookmarkList(page, limit);
    const items = Array.isArray(result?.items) ? result.items : [];
    const normalized = items
      .filter((item) => item && item.id)
      .map((item) => normalizeBookmarkedGame({ ...item, viewerHasBookmarked: true }));
    const hasMore = typeof result?.hasMore === 'boolean'
      ? result.hasMore
      : items.length >= limit;
    return { items: normalized, hasMore, synced: true };
  } catch (error) {
    markRemoteUnavailable(error);
    if (process.env.NODE_ENV !== 'production') {
      console.warn('bookmark load-more failed:', error);
    }
    return { items: [], hasMore: false, synced: false };
  }
}

export default {
  getBookmarkedGames,
  getBookmarkedIds,
  isGameBookmarked,
  mergeBookmarkedFlags,
  setGameBookmarked,
  toggleGameBookmarked,
  syncBookmarkWithBackend,
  hydrateBookmarksFromBackend,
  loadMoreBookmarksFromBackend,
};
