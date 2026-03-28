const isProd = process.env.NODE_ENV === 'production';

export const ENV = {
  // API Configuration — read from .env / .env.development
  API_BASE_URL: process.env.TARO_APP_AUTH_SERVICE_URL || 'https://gamevallies.com',
  SERVICE_URLS: {
    AUTH: process.env.TARO_APP_AUTH_SERVICE_URL,
    GAME: process.env.TARO_APP_GAME_SERVICE_URL,
    SOCIAL: process.env.TARO_APP_SOCIAL_SERVICE_URL,
    FEED: process.env.TARO_APP_FEED_SERVICE_URL,
    AI: process.env.TARO_APP_AI_SERVICE_URL,
  },
  WS_URL: process.env.TARO_APP_WS_URL,
  GAME_CONTENT_URL: process.env.TARO_APP_GAME_CONTENT_URL,
  GAME_SHELL_URL: process.env.TARO_APP_GAME_SHELL_URL || '',
  API_TIMEOUT: 30000,

  // Storage Keys
  STORAGE_KEYS: {
    USER: 'gamevallies_user',
    ACCESS_TOKEN: 'gamevallies_access_token',
    REFRESH_TOKEN: 'gamevallies_refresh_token',
    POST_LOGIN_REDIRECT: 'gamevallies_post_login_redirect',
    CREATE_ENTRY_INTENT: 'gamevallies_create_entry_intent',
    PROFILE_ACTIVE_TAB: 'gamevallies_profile_active_tab',
    THEME: 'gamevallies_theme',
    LANGUAGE: 'gamevallies_language',
    LAST_GAME_ID: 'gamevallies_last_game_id',
    DRAFT_GAMES: 'gamevallies_draft_games'
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

  WECHAT: {
    H5_OAUTH_APP_ID: process.env.TARO_APP_WECHAT_OAUTH_APP_ID || '',
    H5_OAUTH_SCOPE: process.env.TARO_APP_WECHAT_OAUTH_SCOPE || 'snsapi_base',
    H5_OAUTH_AUTHORIZE_URL:
      process.env.TARO_APP_WECHAT_OAUTH_AUTHORIZE_URL || 'https://open.weixin.qq.com/connect/oauth2/authorize',
  },

  // Analytics
  ANALYTICS: {
    SENTRY_DSN: process.env.SENTRY_DSN || '',
    SEGMENT_WRITE_KEY: process.env.SEGMENT_WRITE_KEY || ''
  }
};

export default ENV;
