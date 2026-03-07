import Taro from '@tarojs/taro';
import { ENV } from '@/config/env';








class Request {
  baseURL = ENV.API_BASE_URL;
  timeout = ENV.API_TIMEOUT;
  token = null;

  constructor() {
    this.loadToken();
  }

  loadToken() {
    try {
      const tokenStr = Taro.getStorageSync(ENV.STORAGE_KEYS.ACCESS_TOKEN);
      if (tokenStr) {
        this.token = tokenStr;
      }
    } catch (error) {
      console.error('Failed to load token from storage:', error);
    }
  }

  setToken(token) {
    this.token = token;
    try {
      Taro.setStorageSync(ENV.STORAGE_KEYS.ACCESS_TOKEN, token);
    } catch (error) {
      console.error('Failed to save token to storage:', error);
    }
  }

  clearToken() {
    this.token = null;
    try {
      Taro.removeStorageSync(ENV.STORAGE_KEYS.ACCESS_TOKEN);
    } catch (error) {
      console.error('Failed to clear token from storage:', error);
    }
  }

  getHeaders(skipAuth) {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (!skipAuth && this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  async handleResponse(response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      const data = response.data;
      if (data.success) {
        return data.data;
      } else {
        throw {
          code: data.error?.code || 'UNKNOWN_ERROR',
          message: data.error?.message || 'Unknown error occurred'
        };
      }
    } else if (response.statusCode === 401) {
      this.clearToken();
      // Trigger re-authentication
      Taro.navigateTo({ url: '/pages/login/index' }).catch(() => {});
      throw {
        code: 'UNAUTHORIZED',
        message: 'Session expired, please login again'
      };
    } else {
      const data = response.data;
      throw {
        code: data.error?.code || `HTTP_${response.statusCode}`,
        message: data.error?.message || `HTTP Error ${response.statusCode}`
      };
    }
  }

  async request(url, config = {}) {
    const {
      method = 'GET',
      data,
      skipAuth = false,
      showError = true,
      timeout = this.timeout,
      ...rest
    } = config;

    const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;

    try {
      const response = await Taro.request({
        url: fullUrl,
        method: method,
        data,
        header: this.getHeaders(skipAuth),
        timeout,
        ...rest
      });

      return this.handleResponse(response);
    } catch (error) {
      if (ENV.FEATURES.DEBUG_MODE) {
        console.error(`Request failed: ${method} ${fullUrl}`, error);
      }

      const apiError = error;
      if (showError) {
        Taro.showToast({
          title: apiError.message || 'Request failed',
          icon: 'error',
          duration: 2
        });
      }

      throw apiError;
    }
  }

  get(url, config) {
    return this.request(url, { ...config, method: 'GET' });
  }

  post(url, data, config) {
    return this.request(url, { ...config, method: 'POST', data });
  }

  put(url, data, config) {
    return this.request(url, { ...config, method: 'PUT', data });
  }

  patch(url, data, config) {
    return this.request(url, { ...config, method: 'PATCH', data });
  }

  delete(url, config) {
    return this.request(url, { ...config, method: 'DELETE' });
  }

  async upload(url, filePath, formData) {
    const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;

    try {
      const response = await Taro.uploadFile({
        url: fullUrl,
        filePath,
        name: 'file',
        formData: {
          ...formData
        },
        header: {
          Authorization: this.token ? `Bearer ${this.token}` : ''
        }
      });

      return this.handleResponse(response);
    } catch (error) {
      if (ENV.FEATURES.DEBUG_MODE) {
        console.error(`Upload failed: ${fullUrl}`, error);
      }
      throw error;
    }
  }

  download(url, fileName) {
    return Taro.downloadFile({
      url
    });
  }
}

export const request = new Request();

export default request;