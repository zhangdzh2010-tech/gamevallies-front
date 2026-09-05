// Completed and unlocked game projections.


export function buildFallbackCompletedGame(task, state) {
  const gameId = task?.gameId || state.generatingGameId || state.currentGame?.id || '';
  const previewUrl = task?.previewUrl || state.currentGame?.previewUrl || '';
  const gameUrl = task?.gameUrl || state.currentGame?.gameUrl || '';

  if (!gameId || (!previewUrl && !gameUrl)) {
    return null;
  }

  const trackedTask = state.trackedTasks.find((item) => item.taskId === task?.taskId);

  return {
    ...(state.currentGame || {}),
    id: gameId,
    title: trackedTask?.gameTitle || state.currentGame?.title || '',
    status: state.currentGame?.status || 'draft',
    gameUrl: gameUrl || state.currentGame?.gameUrl || '',
    previewUrl: previewUrl || state.currentGame?.previewUrl || '',
    coverUrl: task?.coverUrl || state.currentGame?.coverUrl || '',
    canPlay: state.canPlay !== false,
    requireSubscription: state.canPlay === false,
  };
}


export function buildUnlockedCurrentGame(currentGame, payload) {
  const unlockedGame = payload?.game || {};

  return {
    ...(currentGame || {}),
    ...unlockedGame,
    id: unlockedGame.id || currentGame?.id || payload?.gameId || '',
    canPlay: true,
    requireSubscription: false,
    quotaRemaining: payload?.quotaRemaining ?? unlockedGame.quotaRemaining ?? currentGame?.quotaRemaining ?? null,
  };
}
