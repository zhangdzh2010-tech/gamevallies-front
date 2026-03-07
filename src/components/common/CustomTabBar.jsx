import React from 'react';
import { View, Text } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import { useRoute } from '@tarojs/hooks';
import useGamePlayerStore from '../../stores/gamePlayer';
import { GamePlayer } from './GamePlayer';
import './CustomTabBar.scss';

const TABS = [
{ icon: '🏠', label: '广场', path: '/pages/index/index' },
{ icon: '🔍', label: '发现', path: '/pages/discover/index' },
{ icon: '➕', label: '创作', path: '/pages/create/index', isSpecial: true },
{ icon: '🔔', label: '消息', path: '/pages/messages/index' },
{ icon: '👤', label: '我的', path: '/pages/profile/index' }];

export const CustomTabBar = ({
  activeIndex: propActiveIndex,
  onTabChange
}) => {
  const navigation = useNavigation();
  const route = useRoute();
  const { gameUrl, gameTitle, closeGame } = useGamePlayerStore();

  const getActiveIndex = () => {
    if (propActiveIndex !== undefined) return propActiveIndex;
    const currentPath = route.path || '/pages/index/index';
    return TABS.findIndex((tab) => tab.path === currentPath);
  };

  const activeIndex = getActiveIndex();

  const handleTabClick = (index, tab) => {
    if (onTabChange) {
      onTabChange(index);
    }
    navigation.switchTab({
      url: tab.path
    });
  };

  return (
    <>
      <View className="custom-tab-bar">
        <View className="tab-container">
          {TABS.map((tab, index) =>
          <View
            key={index}
            className={`tab-item ${index === activeIndex ? 'active' : ''} ${
            tab.isSpecial ? 'special' : ''}`
            }
            onClick={() => handleTabClick(index, tab)}>

              {tab.isSpecial ?
            <View className="special-button">
                  <Text className="tab-icon">{tab.icon}</Text>
                </View> :
            <>
                  <Text className="tab-icon">{tab.icon}</Text>
                  <Text className="tab-label">{tab.label}</Text>
                </>
            }
            </View>
          )}
        </View>
      </View>

      <GamePlayer gameUrl={gameUrl} gameTitle={gameTitle} onClose={closeGame} />
    </>
  );
};
