import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import Taro from '@tarojs/taro';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import * as socialService from '../../services/social';
import './index.scss';

export default function Message() {
  const navigation = useNavigation();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await socialService.getNotifications(1, 50);
        const items = result?.items || result || [];
        setMessages(items);
      } catch (e) {
        Taro.showToast({ title: '加载消息失败', icon: 'none' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleMessageClick = async (message) => {
    if (!message.read) {
      try {
        await socialService.markNotificationsAsRead([message.id]);
        setMessages(messages.map((m) => m.id === message.id ? { ...m, read: true } : m));
      } catch (e) {
        // best-effort mark-read
      }
    }
    if (message.gameId || message.targetId) {
      navigation.push({
        url: `/pages/game/detail/index?id=${message.gameId || message.targetId}`
      });
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'like': return '♥';
      case 'comment': return '💬';
      case 'follow': return '👥';
      case 'fork': return '🔀';
      case 'system': return '📢';
      default: return '📬';
    }
  };

  const unreadCount = messages.filter((m) => !m.read).length;

  return (
    <View className="message-container">
      <View className="message-header">
        <Text className="header-title">🔔 消息</Text>
        {unreadCount > 0 && <View className="unread-badge">{unreadCount}</View>}
      </View>

      <ScrollView className="message-scroll" scrollY>
        {loading ? (
          <View className="empty-state">
            <Text className="empty-text">加载中...</Text>
          </View>
        ) : messages.length > 0 ? (
          <View className="message-list">
            {messages.map((message) => (
              <View
                key={message.id}
                className={`message-item ${!message.read ? 'unread' : ''}`}
                onClick={() => handleMessageClick(message)}
              >
                <View className="message-avatar">{message.senderAvatar || message.avatar || '👤'}</View>
                <View className="message-content">
                  <View className="message-header-row">
                    <Text className="message-name">{message.senderName || message.name || '用户'}</Text>
                    <Text className="message-time">{message.createdAt || message.timestamp || ''}</Text>
                  </View>
                  <Text className="message-text">{message.body || message.content || ''}</Text>
                </View>
                <View className="message-icon">{getIcon(message.type)}</View>
                {!message.read && <View className="unread-dot" />}
              </View>
            ))}
          </View>
        ) : (
          <View className="empty-state">
            <Text className="empty-icon">📭</Text>
            <Text className="empty-text">暂无消息</Text>
            <Text className="empty-desc">当有人赞、评论或关注你时，会在这里显示</Text>
          </View>
        )}

        <View className="bottom-spacer" />
      </ScrollView>

      <CustomTabBar activeIndex={3} />
    </View>
  );
}
