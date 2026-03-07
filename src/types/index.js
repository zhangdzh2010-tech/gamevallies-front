// User Types





















































// Game Types
































































// Comment Types






















// Notification Types
















// Feed Types











// Pagination Types











// Alias for compatibility


// WebSocket Types













// API Response Types
















// Search Types












// File Upload Types













// Genre Types











// Auth Status


// App Store Types







// Message Types (for direct messages)



















// Analytics Types












// Trending Types













// Game Generation Types














// Publish Data Type






// API Response DTO (used by api.ts)






// API Configuration









// Dynamic API configuration based on environment
const isProd = process.env.NODE_ENV === 'production';

function getApiBaseUrl() {
  if (process.env.TARO_ENV === 'weapp') {
    return isProd ? 'https://api.playforge.com' : 'https://dev-api.playforge.com';
  } else if (process.env.TARO_ENV === 'h5') {
    return isProd ? 'https://api.playforge.com' : 'http://localhost:3000';
  }
  return isProd ? 'https://api.playforge.com' : 'http://localhost:3000';
}

function getWsUrl() {
  if (process.env.TARO_ENV === 'weapp') {
    return isProd ? 'wss://ws.playforge.com' : 'wss://dev-ws.playforge.com';
  } else if (process.env.TARO_ENV === 'h5') {
    return isProd ? 'wss://ws.playforge.com' : 'ws://localhost:3000';
  }
  return isProd ? 'wss://ws.playforge.com' : 'ws://localhost:3000';
}

export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  API_BASE: getApiBaseUrl(),
  WS_URL: getWsUrl(),
  TIMEOUT: 30000,
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000
};