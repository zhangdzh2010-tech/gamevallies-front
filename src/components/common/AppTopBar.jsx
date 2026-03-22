/* eslint-disable react/prop-types */
import Taro from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import './AppTopBar.scss';

export function AppTopBar({
  title = '智了空间',
  showBack = false,
  onBack,
  rightText = '',
  onRightClick,
}) {
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const menuButtonRect =
    isWeapp && typeof Taro.getMenuButtonBoundingClientRect === 'function'
      ? Taro.getMenuButtonBoundingClientRect()
      : null;
  const statusBarHeight =
    isWeapp && typeof Taro.getSystemInfoSync === 'function'
      ? Taro.getSystemInfoSync().statusBarHeight || 0
      : 0;
  const menuTopInset = menuButtonRect
    ? Math.max(Math.round((menuButtonRect.top - statusBarHeight) * 0.92), 6)
    : 8;
  const bottomInset = isWeapp ? 14 : 15;
  const sideStyle =
    isWeapp && menuButtonRect
      ? { width: `${menuButtonRect.width + 16}px`, height: `${menuButtonRect.height}px` }
      : undefined;
  const barStyle =
    isWeapp && menuButtonRect
      ? {
          paddingTop: `${statusBarHeight + menuTopInset}px`,
          paddingBottom: `${bottomInset}px`,
          minHeight: `${menuButtonRect.bottom + bottomInset}px`,
        }
      : undefined;
  const barClassName = `app-top-bar${isWeapp ? ' app-top-bar--weapp' : ''}`;

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    const pages = Taro.getCurrentPages();
    if (pages.length > 1) {
      Taro.navigateBack();
      return;
    }

    Taro.switchTab({ url: '/pages/index/index' });
  };

  return (
    <View className={barClassName} style={barStyle}>
      <View className="app-top-bar__side" style={sideStyle}>
        {showBack ? (
          <View className="app-top-bar__back" onClick={handleBack}>
            <Text className="app-top-bar__back-icon">←</Text>
            <Text className="app-top-bar__back-text">返回</Text>
          </View>
        ) : null}
      </View>
      <Text className="app-top-bar__title">{title}</Text>
      <View className="app-top-bar__side app-top-bar__side--right" style={sideStyle}>
        {rightText ? (
          <View className="app-top-bar__action" onClick={onRightClick}>
            <Text className="app-top-bar__action-text">{rightText}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default AppTopBar;
