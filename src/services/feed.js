import { get } from './api';


/**
 * Get trending games
 */
export async function getTrending(
page = 1,
limit = 10)
{
  return get('/api/v1/feed/trending', {
    data: { page, limit }
  });
}

/**
 * Get latest games
 */
export async function getLatest(
page = 1,
limit = 10)
{
  return get('/api/v1/feed/latest', {
    data: { page, limit }
  });
}

/**
 * Get following user's games feed
 */
export async function getFollowingFeed(
page = 1,
limit = 10)
{
  return get('/api/v1/feed/following', {
    data: { page, limit }
  });
}

/**
 * Search games
 */
export async function searchGames(
query,
filters)






{
  const { page = 1, limit = 10, ...otherFilters } = filters || {};

  return get('/api/v1/feed/search', {
    data: {
      q: query,
      page,
      limit,
      ...otherFilters
    }
  });
}

/**
 * Get games by type
 */
export async function getGamesByType(
type,
page = 1,
limit = 10)
{
  return get(`/api/v1/feed/by-type/${encodeURIComponent(type)}`, {
    data: { page, limit }
  });
}

/**
 * Get games by tag
 */
export async function getGamesByTag(
tag,
page = 1,
limit = 10)
{
  return get('/api/v1/games/by-tag', {
    data: { tag, page, limit }
  });
}

/**
 * Get trending tags
 */
export async function getTrendingTags(limit = 10)




{
  return get('/api/v1/tags/trending', {
    data: { limit }
  });
}

/**
 * Get trending creators
 */
export async function getTrendingCreators(limit = 10) {
  return get('/api/v1/creators/trending', {
    data: { limit }
  });
}

/**
 * Get challenge games
 */
export async function getChallengeGames(
challengeId,
page = 1,
limit = 10)
{
  return get(`/api/v1/challenges/${challengeId}/games`, {
    data: { page, limit }
  });
}

/**
 * Get featured games (curated)
 */
export async function getFeaturedGames(limit = 6) {
  return get('/api/v1/feed/featured', {
    data: { limit }
  });
}

/**
 * Get games by creator
 */
export async function getCreatorGames(
creatorId,
page = 1,
limit = 10)
{
  return get(`/api/v1/creators/${creatorId}/games`, {
    data: { page, limit }
  });
}

export default {
  getTrending,
  getLatest,
  getFollowingFeed,
  searchGames,
  getGamesByType,
  getGamesByTag,
  getTrendingTags,
  getTrendingCreators,
  getChallengeGames,
  getFeaturedGames,
  getCreatorGames
};
