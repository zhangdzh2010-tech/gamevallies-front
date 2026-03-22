import { getSafeGameImage } from './media';
import { normalizeGameTypeKey } from './gameTypes';

const DEFAULT_BASE_URL = 'https://gamevallies.local';
const DEFAULT_SHARE_IMAGE = '';
const DEFAULT_SHARE_TITLE = 'Try this game on GameVallies';

function normalizeId(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function buildQueryString(params = {}) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

function buildMiniProgramPath(pagePath, params = {}) {
  const query = buildQueryString(params);
  return query ? `${pagePath}?${query}` : pagePath;
}

export function buildGameDetailPath(gameId, extraQuery = {}) {
  return buildMiniProgramPath('/pages/game/detail/index', {
    id: normalizeId(gameId),
    ...extraQuery,
  });
}

export function buildGamePlayPath(gameId, extraQuery = {}) {
  return buildMiniProgramPath('/pages/game/play/index', {
    id: normalizeId(gameId),
    ...extraQuery,
  });
}

export function getShareImageUrl(game = {}) {
  return getSafeGameImage(game) || DEFAULT_SHARE_IMAGE;
}

export function generateShareText(game = {}, includeAuthor = true) {
  const title = game.title || 'this game';
  const author = game.creator?.username || game.author?.username || game.author || '';

  if (includeAuthor && author) {
    return `${title} by ${author} | GameVallies`;
  }

  return `${title} | GameVallies`;
}

export function getShareConfig(game = {}, score, options = {}) {
  const target = options.target === 'play' ? 'play' : 'detail';
  const extraQuery = options.extraQuery || {};
  const title = options.title || (
    score !== undefined && score !== null && score !== ''
      ? `I scored ${score} in ${game.title || 'this game'}`
      : generateShareText(game, true) || DEFAULT_SHARE_TITLE
  );

  const query = buildQueryString({
    id: normalizeId(game.id),
    ...(score !== undefined && score !== null && score !== '' ? { score: String(score) } : {}),
    ...extraQuery,
  });

  const path = target === 'play'
    ? buildGamePlayPath(game.id, {
      ...(score !== undefined && score !== null && score !== '' ? { score: String(score) } : {}),
      ...extraQuery,
    })
    : buildGameDetailPath(game.id, {
      ...(score !== undefined && score !== null && score !== '' ? { score: String(score) } : {}),
      ...extraQuery,
    });

  return {
    title: title || DEFAULT_SHARE_TITLE,
    path,
    imageUrl: options.imageUrl || getShareImageUrl(game),
    query,
  };
}

export function getGameShareLink(gameId, baseUrl = DEFAULT_BASE_URL) {
  return `${baseUrl}${buildGameDetailPath(gameId)}`;
}

export function getCreatorShareLink(creatorId, baseUrl = DEFAULT_BASE_URL) {
  return `${baseUrl}/creator/${normalizeId(creatorId)}`;
}

export function generateSharePosterData(game = {}, score) {
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
        src: getShareImageUrl(game),
      },
      {
        type: 'text',
        x: 40,
        y: 430,
        width: 670,
        text: game.title || 'Untitled game',
        fontSize: 36,
        fontWeight: 'bold',
        color: '#000000',
        lineHeight: 1.2,
        maxLines: 2,
      },
      {
        type: 'text',
        x: 40,
        y: 530,
        width: 670,
        text: `by ${game.creator?.username || game.author?.username || game.author || 'Unknown creator'}`,
        fontSize: 18,
        color: '#666666',
      },
      ...(score !== undefined && score !== null && score !== ''
        ? [
          {
            type: 'text',
            x: 40,
            y: 600,
            width: 670,
            text: `Score: ${score}`,
            fontSize: 24,
            color: '#FF6B6B',
            fontWeight: 'bold',
          },
        ]
        : []),
      {
        type: 'text',
        x: 40,
        y: 1100,
        width: 670,
        text: 'GameVallies',
        fontSize: 20,
        color: '#999999',
      },
      {
        type: 'qrcode',
        x: 600,
        y: 1150,
        width: 100,
        height: 100,
        content: getGameShareLink(game.id),
      },
    ],
  };
}

export async function generateSharePoster(game, score) {
  const posterData = generateSharePosterData(game, score);
  void posterData;

  return Promise.resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
}

export function formatShareStats(game = {}) {
  return {
    likes: game.likes || game.likeCount || 0,
    comments: game.comments || game.commentCount || 0,
    plays: game.plays || game.playCount || 0,
    shares: game.shares || game.shareCount || 0,
    forks: game.forks || game.forkCount || 0,
  };
}

export function generateHashtags(game = {}) {
  const hashtags = ['#GameVallies', '#GameDev'];
  const gameType = normalizeGameTypeKey(game.type || game.gameType);

  if (gameType) {
    hashtags.push(`#${gameType}`);
  }

  if (Array.isArray(game.tags) && game.tags.length > 0) {
    hashtags.push(...game.tags.slice(0, 3).map((tag) => `#${tag}`));
  }

  return hashtags;
}
