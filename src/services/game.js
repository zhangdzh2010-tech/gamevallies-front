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
export async function publishGame(
gameId,
data)
{
  return post(`/api/v1/games/${gameId}/publish`, data || {});
}

/**
 * Get current user's games
 */
export async function getMyGames(
page = 1,
limit = 10)
{
  return get('/api/v1/games/my', {
    data: { page, limit }
  });
}

/**
 * Get single game by ID
 */
export async function getGame(id) {
  return get(`/api/v1/games/${id}`);
}

export default {
  generateGame,
  iterateGame,
  forkGame,
  publishGame,
  getMyGames,
  getGame
};