import { useState, useRef } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import './index.scss';










export default function MessagesPage() {
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const [notifications, setNotifications] = useState([
  {
    id: '1',
    icon: '❤️',
    actor: '太空游戏设计师',
    action: '赞了你的作品',
    time: '5分钟前',
    isRead: false
  },
  {
    id: '2',
    icon: '🔀',
    actor: '创意鬼才',
    action: '复刻了你的游戏',
    time: '1小时前',
    isRead: false
  },
  {
    id: '3',
    icon: '💬',
    actor: '像素艺术师',
    action: '评论了你的作品',
    time: '3小时前',
    isRead: true
  },
  {
    id: '4',
    icon: '👥',
    actor: '休闲游戏大师',
    action: '关注了你',
    time: '昨天',
    isRead: true
  },
  {
    id: '5',
    icon: '🏆',
    actor: '创作广场',
    action: '你的作品入选本周最佳',
    time: '2天前',
    isRead: true
  },
  {
    id: '6',
    icon: '💰',
    actor: '收益中心',
    action: '你的收益已结算',
    time: '3天前',
    isRead: true
  }]
  );

  const scrollViewRef = useRef(null);

  const handleMarkAsRead = (notificationId) => {
    setNotifications((prev) =>
    prev.map((n) =>
    n.id === notificationId ? { ...n, isRead: true } : n
    )
    );
  };

  const handleLoadMore = () => {
    Taro.showToast({
      title: '加载更多',
      icon: 'loading',
      duration: 1000
    });
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <View className={`messages-page${isWeapp ? ' messages-page--weapp' : ''}`}>
      <AppTopBar />
      {/* Header */}
      <View className="messages-header">
        <View className="header-content">
          <Text className="header-title">消息</Text>
          {unreadCount > 0 &&
          <View className="unread-badge">{unreadCount}</View>
          }
        </View>
      </View>

      {/* Notification List */}
      <ScrollView
        className="messages-list"
        scrollY
        ref={scrollViewRef}
        onScroll={() => {}}>
        
        {notifications.length === 0 ?
        <View className="empty-state">
            <Text className="empty-icon">📭</Text>
            <Text className="empty-text">暂无消息</Text>
          </View> :

        <View className="notifications">
            {notifications.map((notification) =>
          <View
            key={notification.id}
            className={`notification-item ${
            !notification.isRead ? 'unread' : ''}`
            }
            onClick={() =>
            handleMarkAsRead(notification.id)
            }>
            
                <View className="notification-left">
                  <View className="notification-icon">
                    {notification.icon}
                  </View>
                  {!notification.isRead &&
              <View className="unread-dot"></View>
              }
                </View>

                <View className="notification-content">
                  <View className="notification-header">
                    <Text className="actor-name">
                      {notification.actor}
                    </Text>
                    <Text className="notification-time">
                      {notification.time}
                    </Text>
                  </View>
                  <Text className="notification-action">
                    {notification.action}
                  </Text>
                </View>

                <Text className="notification-arrow">
                  →
                </Text>
              </View>
          )}

            <View className="load-more-container">
              <Text
              className="load-more-btn"
              onClick={handleLoadMore}>
              
                加载更多
              </Text>
            </View>
          </View>
        }
      </ScrollView>

      <CustomTabBar activeIndex={3} />
    </View>);

}
