import { post, get, del, patch } from './api';

/**
 * Expand a short description into a detailed game design prompt
 */
export async function expandPrompt(description) {
  const response = await post('/api/v1/games/expand-prompt', { description });
  return response?.expanded_prompt || description;
}

/**
 * Generate a new game from a prompt
 */
export async function generateGame(prompt, title) {
  const response = await post('/api/v1/games/generate', {
    prompt,
    ...(title ? { title } : {}),
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

/**
 * Delete a game by ID
 */
export async function deleteGame(gameId) {
  return del(`/api/v1/games/${gameId}`);
}

/**
 * Update game visibility/permission settings
 */
export async function updateGameSettings(gameId, settings) {
  return patch(`/api/v1/games/${gameId}/settings`, settings);
}

export default {
  expandPrompt,
  generateGame,
  getGame,
  iterateGame,
  forkGame,
  publishGame,
  getMyGames,
  deleteGame,
  updateGameSettings,
};
