import { View, Text } from '@tarojs/components';
import { useNavigation, useRoute } from '@tarojs/hooks';
import './CustomTabBar.scss';

const TABS = [
  { label: '首页', path: '/pages/index/index' },
  { label: '关注', path: '/pages/discover/index' },
  { label: '', path: '/pages/create/index', isCreate: true },
  { label: '消息', path: '/pages/messages/index' },
  { label: '我的', path: '/pages/profile/index' },
];

export const CustomTabBar = ({ activeIndex: propActiveIndex, onTabChange }) => {
  const navigation = useNavigation();
  const route = useRoute();

  const activeIndex = propActiveIndex !== undefined
    ? propActiveIndex
    : TABS.findIndex((tab) => tab.path === (route.path || '/pages/index/index'));

  const handleTabClick = (index, tab) => {
    if (onTabChange) onTabChange(index);
    navigation.switchTab({ url: tab.path });
  };

  return (
    <View className="custom-tab-bar">
      <View className="tab-container">
        {TABS.map((tab, index) => (
          <View
            key={index}
            className={`tab-item ${index === activeIndex ? 'active' : ''} ${tab.isCreate ? 'create' : ''}`}
            onClick={() => handleTabClick(index, tab)}
          >
            {tab.isCreate ? (
              <View className="create-btn">
                <Text className="create-icon">＋</Text>
              </View>
            ) : (
              <Text className="tab-label">{tab.label}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
};
