const isProd = process.env.NODE_ENV === 'production';

// Determine base URL based on environment
const getApiBaseUrl = () => {
  if (process.env.TARO_ENV === 'weapp') {
    // WeChat Mini Program
    return isProd ?
    'https://api.playforge.com' :
    'https://dev-api.playforge.com';
  } else if (process.env.TARO_ENV === 'h5') {
    // Web (H5)
    return isProd ?
    'https://api.playforge.com' :
    'http://localhost:3000';
  }

  return 'https://api.playforge.com';
};

// Determine WebSocket URL based on environment
const getWsUrl = () => {
  if (process.env.TARO_ENV === 'weapp') {
    // WeChat Mini Program
    return isProd ?
    'wss://ws.playforge.com' :
    'wss://dev-ws.playforge.com';
  } else if (process.env.TARO_ENV === 'h5') {
    // Web (H5)
    return isProd ?
    'wss://ws.playforge.com' :
    'ws://localhost:3000';
  }

  return 'wss://ws.playforge.com';
};

export const ENV = {
  // API Configuration
  API_BASE_URL: getApiBaseUrl(),
  WS_URL: getWsUrl(),
  API_TIMEOUT: 30000,

  // Storage Keys
  STORAGE_KEYS: {
    USER: 'playforge_user',
    ACCESS_TOKEN: 'playforge_access_token',
    REFRESH_TOKEN: 'playforge_refresh_token',
    THEME: 'playforge_theme',
    LANGUAGE: 'playforge_language',
    LAST_GAME_ID: 'playforge_last_game_id',
    DRAFT_GAMES: 'playforge_draft_games'
  },

  // Feature Flags
  FEATURES: {
    WS_ENABLED: true,
    ANALYTICS_ENABLED: isProd,
    DEBUG_MODE: !isProd
  },

  // Pagination
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100
  },

  // Upload Configuration
  UPLOAD: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
    ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm'],
    CHUNK_SIZE: 1024 * 1024 // 1MB
  },

  // Game Configuration
  GAME: {
    MIN_TITLE_LENGTH: 3,
    MAX_TITLE_LENGTH: 100,
    MIN_DESCRIPTION_LENGTH: 10,
    MAX_DESCRIPTION_LENGTH: 5000,
    MAX_TAGS: 10,
    MAX_TAG_LENGTH: 20,
    MAX_PREVIEW_IMAGES: 5
  },

  // Comment Configuration
  COMMENT: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 500,
    MAX_REPLIES: 3
  },

  // Timeouts
  TIMEOUTS: {
    SLOW_NETWORK: 10000,
    NORMAL_NETWORK: 5000,
    FAST_NETWORK: 2000
  },

  // Cache Configuration
  CACHE: {
    USER_TTL: 3600000, // 1 hour
    GAME_TTL: 1800000, // 30 minutes
    FEED_TTL: 600000 // 10 minutes
  },

  // Environment
  ENVIRONMENT: process.env.TARO_ENV || 'h5',
  IS_PROD: isProd,
  IS_DEV: !isProd,

  // Social Media
  SOCIAL: {
    WX_SHARE_ENABLED: process.env.TARO_ENV === 'weapp'
  },

  // Analytics
  ANALYTICS: {
    SENTRY_DSN: process.env.SENTRY_DSN || '',
    SEGMENT_WRITE_KEY: process.env.SEGMENT_WRITE_KEY || ''
  }
};

export default ENV;