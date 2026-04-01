import { ENV } from '../config/env';

export const API_CONFIG = {
  BASE_URL: ENV.API_BASE_URL || process.env.TARO_APP_AUTH_SERVICE_URL || '',
  API_BASE: ENV.API_BASE_URL || process.env.TARO_APP_AUTH_SERVICE_URL || '',
  SERVICE_URLS: ENV.SERVICE_URLS,
  WS_URL: ENV.WS_URL || process.env.TARO_APP_WS_URL || '',
  TIMEOUT: ENV.API_TIMEOUT || 30000,
  RETRY_COUNT: 3,
  RETRY_DELAY: 1000,
};

export default API_CONFIG;
