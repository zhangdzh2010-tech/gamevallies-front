import Taro from '@tarojs/taro';
import { ENV } from '../config/env';












class Storage {
  prefix = 'gamevallies_';

  getKey(key) {
    return `${this.prefix}${key}`;
  }

  isExpired(item) {
    if (!item.ttl) return false;
    return Date.now() - item.timestamp > item.ttl;
  }

  async getItem(key, options = {}) {
    try {
      const fullKey = this.getKey(key);
      const itemStr = Taro.getStorageSync(fullKey);

      if (!itemStr) {
        return null;
      }

      const item = JSON.parse(itemStr);

      if (this.isExpired(item)) {
        this.removeItem(key);
        return null;
      }

      return item.data;
    } catch (error) {
      console.error(`Failed to get storage item: ${key}`, error);
      return null;
    }
  }

  async setItem(key, value, options = {}) {
    try {
      const fullKey = this.getKey(key);
      const item = {
        data: value,
        timestamp: Date.now(),
        ttl: options.ttl
      };

      Taro.setStorageSync(fullKey, JSON.stringify(item));
    } catch (error) {
      console.error(`Failed to set storage item: ${key}`, error);
      throw error;
    }
  }

  async removeItem(key) {
    try {
      const fullKey = this.getKey(key);
      Taro.removeStorageSync(fullKey);
    } catch (error) {
      console.error(`Failed to remove storage item: ${key}`, error);
    }
  }

  async clear() {
    try {
      const allKeys = Taro.getStorageSync('');
      const keyArray = Object.keys(allKeys);

      for (const key of keyArray) {
        if (key.startsWith(this.prefix)) {
          Taro.removeStorageSync(key);
        }
      }
    } catch (error) {
      console.error('Failed to clear storage', error);
    }
  }

  async getAllKeys() {
    try {
      const allKeys = Taro.getStorageSync('');
      return Object.keys(allKeys).filter((key) => key.startsWith(this.prefix));
    } catch (error) {
      console.error('Failed to get all keys', error);
      return [];
    }
  }

  async getStorageInfo() {
    try {
      return Taro.getStorageInfoSync();
    } catch (error) {
      console.error('Failed to get storage info', error);
      return null;
    }
  }

  // ============================================================
  // Static convenience methods for token management
  // Used by services/api.ts for auth token handling
  // ============================================================

  static getToken() {
    try {
      const key = ENV.STORAGE_KEYS.ACCESS_TOKEN;
      const itemStr = Taro.getStorageSync(key);
      if (!itemStr) return null;
      try {
        const item = JSON.parse(itemStr);
        if (item.ttl && Date.now() - item.timestamp > item.ttl) {
          Taro.removeStorageSync(key);
          return null;
        }
        return item.data;
      } catch {
        // If it's not JSON-wrapped, return raw value
        return itemStr;
      }
    } catch (error) {
      console.error('Failed to get token', error);
      return null;
    }
  }

  static getRefreshToken() {
    try {
      const key = ENV.STORAGE_KEYS.REFRESH_TOKEN;
      const itemStr = Taro.getStorageSync(key);
      if (!itemStr) return null;
      try {
        const item = JSON.parse(itemStr);
        if (item.ttl && Date.now() - item.timestamp > item.ttl) {
          Taro.removeStorageSync(key);
          return null;
        }
        return item.data;
      } catch {
        return itemStr;
      }
    } catch (error) {
      console.error('Failed to get refresh token', error);
      return null;
    }
  }

  static setToken(token) {
    try {
      const key = ENV.STORAGE_KEYS.ACCESS_TOKEN;
      const item = {
        data: token,
        timestamp: Date.now()
      };
      Taro.setStorageSync(key, JSON.stringify(item));
    } catch (error) {
      console.error('Failed to set token', error);
    }
  }

  static setRefreshToken(token) {
    try {
      const key = ENV.STORAGE_KEYS.REFRESH_TOKEN;
      const item = {
        data: token,
        timestamp: Date.now()
      };
      Taro.setStorageSync(key, JSON.stringify(item));
    } catch (error) {
      console.error('Failed to set refresh token', error);
    }
  }

  static removeToken() {
    try {
      Taro.removeStorageSync(ENV.STORAGE_KEYS.ACCESS_TOKEN);
    } catch (error) {
      console.error('Failed to remove token', error);
    }
  }

  static removeRefreshToken() {
    try {
      Taro.removeStorageSync(ENV.STORAGE_KEYS.REFRESH_TOKEN);
    } catch (error) {
      console.error('Failed to remove refresh token', error);
    }
  }

  static getUser() {
    try {
      const key = ENV.STORAGE_KEYS.USER;
      const itemStr = Taro.getStorageSync(key);
      if (!itemStr) return null;
      try {
        const item = JSON.parse(itemStr);
        if (item.ttl && Date.now() - item.timestamp > item.ttl) {
          Taro.removeStorageSync(key);
          return null;
        }
        return item.data;
      } catch {
        return itemStr;
      }
    } catch (error) {
      console.error('Failed to get user', error);
      return null;
    }
  }

  static setUser(user) {
    try {
      const key = ENV.STORAGE_KEYS.USER;
      const item = {
        data: user,
        timestamp: Date.now()
      };
      Taro.setStorageSync(key, JSON.stringify(item));
    } catch (error) {
      console.error('Failed to set user', error);
    }
  }

  static removeUser() {
    try {
      Taro.removeStorageSync(ENV.STORAGE_KEYS.USER);
    } catch (error) {
      console.error('Failed to remove user', error);
    }
  }
}

export { Storage };
export const storage = new Storage();
export default storage;