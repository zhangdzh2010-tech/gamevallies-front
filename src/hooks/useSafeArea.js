import { useState, useEffect } from 'react';
import Taro from '@tarojs/taro';








/**
 * Hook for getting safe area insets
 */
export function useSafeArea() {
  const [safeArea, setSafeArea] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0
  });

  useEffect(() => {
    try {
      const systemInfo = Taro.getSystemInfoSync();

      // Get safe area (notch, status bar, etc.)
      const safeAreaInsets = systemInfo.safeArea || {
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: systemInfo.windowWidth,
        height: systemInfo.windowHeight
      };

      setSafeArea({
        top: safeAreaInsets.top || 0,
        bottom: (systemInfo.screenHeight || 0) - (safeAreaInsets.bottom || 0),
        left: safeAreaInsets.left || 0,
        right: (systemInfo.screenWidth || 0) - (safeAreaInsets.right || 0)
      });
    } catch (error) {
      console.error('Failed to get system info:', error);
    }
  }, []);

  return safeArea;
}

/**
 * Hook for getting system info
 */
export function useSystemInfo() {
  const [systemInfo, setSystemInfo] = useState(null);

  useEffect(() => {
    try {
      const info = Taro.getSystemInfoSync();
      setSystemInfo(info);
    } catch (error) {
      console.error('Failed to get system info:', error);
    }
  }, []);

  return systemInfo;
}

export default useSafeArea;