import { post, get } from './api';

/**
 * Generate a new game from a prompt
 */
export async function generateGame(prompt) {
  const response = await post('/api/v1/games/generate', {
    prompt
  });
  return response.gameId;
}

/**
 * Get single game by ID (used for polling generation status)
 */
export async function getGame(id) {
  return get(`/api/v1/games/${id}`);
}

/**
 * Iterate (improve) an existing game with feedback
 */
export async function iterateGame(gameId, feedback) {
  const response = await post(
    `/api/v1/games/${gameId}/iterate`,
    { feedback }
  );
  return response.iterationId;
}

/**
 * Fork (copy) a game
 */
export async function forkGame(gameId) {
  const response = await post(
    `/api/v1/games/${gameId}/fork`,
    {}
  );
  return response.gameId;
}

/**
 * Publish a game
 */
export async function publishGame(gameId, data) {
  return post(`/api/v1/games/${gameId}/publish`, data || {});
}

/**
 * Get current user's games
 */
export async function getMyGames(page = 1, limit = 10) {
  return get('/api/v1/games/my', {
    data: { page, limit }
  });
}

export default {
  generateGame,
  getGame,
  iterateGame,
  forkGame,
  publishGame,
  getMyGames,
};
