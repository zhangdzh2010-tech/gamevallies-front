// API endpoints
export const API_ENDPOINTS = {
  // Auth
  AUTH_LOGIN: '/api/v1/auth/login',
  AUTH_REGISTER: '/api/v1/auth/register',
  AUTH_REFRESH: '/api/v1/auth/refresh',
  AUTH_LOGOUT: '/api/v1/auth/logout',

  // Users
  USERS_ME: '/api/v1/users/me',
  USERS_PROFILE: '/api/v1/users/:userId',

  // Games
  GAMES_LIST: '/api/v1/games',
  GAMES_DETAIL: '/api/v1/games/:gameId',
  GAMES_MY: '/api/v1/games/my',
  GAMES_TYPES: '/api/v1/games/types',
  GAMES_PUBLISH: '/api/v1/games/:gameId/publish',
  GAMES_DELETE: '/api/v1/games/:gameId',

  // Feed
  FEED_TRENDING: '/api/v1/feed/trending',
  FEED_LATEST: '/api/v1/feed/latest',
  FEED_FOLLOWING: '/api/v1/feed/following',
  FEED_FEATURED: '/api/v1/feed/featured',
  GAMES_SEARCH: '/api/v1/games/search',

  // Social
  SOCIAL_LIKE: '/api/v1/social/like',
  SOCIAL_FOLLOW: '/api/v1/social/follow',
  SOCIAL_FOLLOWERS: '/api/v1/social/followers/:userId',
  SOCIAL_FOLLOWING: '/api/v1/social/following/:userId',

  // Comments
  COMMENTS_LIST: '/api/v1/games/:gameId/comments',
  COMMENTS_CREATE: '/api/v1/comments',
  COMMENTS_DELETE: '/api/v1/comments/:commentId',

  // Notifications
  NOTIFICATIONS_LIST: '/api/v1/notifications',
  NOTIFICATIONS_MARK_READ: '/api/v1/notifications/mark-read',
  NOTIFICATIONS_UNREAD: '/api/v1/notifications/unread-count'
};

// Game types
export const GAME_TYPES = {
  CASUAL: 'casual',
  PUZZLE: 'puzzle',
  EDUCATION: 'education'
};

// Notification types
export const NOTIFICATION_TYPES = {
  LIKE: 'like',
  COMMENT: 'comment',
  FOLLOW: 'follow',
  FORK: 'fork',
  MENTION: 'mention',
  SYSTEM: 'system'
};

// Game status
export const GAME_STATUS = {
  DRAFT: 'draft',
  GENERATING: 'generating',
  READY: 'ready',
  PUBLISHED: 'published'
};

// Feed tabs
export const FEED_TABS = {
  HOT: 'hot',
  NEW: 'new',
  CASUAL: 'casual',
  PUZZLE: 'puzzle',
  EDUCATION: 'education'
};

// Pagination
export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 10,
  MAX_LIMIT: 100
};

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network connection failed',
  TIMEOUT: 'Request timeout',
  UNAUTHORIZED: 'Please login again',
  FORBIDDEN: 'You do not have permission',
  NOT_FOUND: 'Resource not found',
  SERVER_ERROR: 'Server error',
  UNKNOWN_ERROR: 'Unknown error occurred'
};

// Success messages
export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Login successful',
  REGISTER_SUCCESS: 'Registration successful',
  LOGOUT_SUCCESS: 'Logout successful',
  GAME_CREATED: 'Game created successfully',
  GAME_PUBLISHED: 'Game published successfully',
  GAME_DELETED: 'Game deleted successfully',
  COMMENT_POSTED: 'Comment posted successfully',
  FOLLOW_SUCCESS: 'User followed successfully',
  UNFOLLOW_SUCCESS: 'User unfollowed successfully'
};

// Delays and timeouts (in milliseconds)
export const TIMINGS = {
  SHORT: 300,
  MEDIUM: 500,
  LONG: 1000,
  EXTRA_LONG: 2000,
  HEARTBEAT: 30000,
  NOTIFICATION_REFRESH: 30000
};

// Regular expressions
export const REGEX = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_CN: /^1[3-9]\d{9}$/,
  PHONE_INTL: /^\+?[1-9]\d{1,14}$/,
  USERNAME: /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,19}$/,
  URL: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
  HEX_COLOR: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/
};

// Platform-specific
export const PLATFORM = {
  WEIXIN: 'weixin',
  ALIPAY: 'alipay',
  BAIDU: 'baidu',
  TOUTIAO: 'toutiao'
};
