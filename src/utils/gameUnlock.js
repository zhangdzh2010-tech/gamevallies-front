import Taro from '@tarojs/taro';

const GAME_UNLOCKED_EVENT = 'gamevallies:game-unlocked';

function getEventCenter() {
  const eventCenter = Taro?.eventCenter;
  if (!eventCenter || typeof eventCenter.on !== 'function') {
    return null;
  }

  return eventCenter;
}

function normalizeUnlockPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const rawGameId = payload.gameId || payload.game?.id || payload.id;
  if (!rawGameId) {
    return null;
  }

  return {
    ...payload,
    gameId: String(rawGameId),
  };
}

export function emitGameUnlocked(payload = {}) {
  const eventCenter = getEventCenter();
  const nextPayload = normalizeUnlockPayload(payload);

  if (!eventCenter || !nextPayload || typeof eventCenter.trigger !== 'function') {
    return;
  }

  eventCenter.trigger(GAME_UNLOCKED_EVENT, nextPayload);
}

export function subscribeGameUnlocked(handler) {
  const eventCenter = getEventCenter();
  if (!eventCenter || typeof handler !== 'function') {
    return () => {};
  }

  eventCenter.on(GAME_UNLOCKED_EVENT, handler);

  return () => {
    if (typeof eventCenter.off === 'function') {
      eventCenter.off(GAME_UNLOCKED_EVENT, handler);
    }
  };
}
