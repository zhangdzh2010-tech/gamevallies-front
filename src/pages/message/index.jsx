import React, { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { useNavigation } from '@tarojs/hooks';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import './index.scss';












export default function Message() {
  const navigation = useNavigation();
  const [messages, setMessages] = useState([
  {
    id: '1',
    type: 'like',
    avatar: '👨‍💻',
    name: '用户A',
    content: '赞了你的游戏《2048数字游戏》',
    timestamp: '2小时前',
    read: false,
    gameId: '1'
  },
  {
    id: '2',
    type: 'comment',
    avatar: '👩‍🎨',
    name: '用户B',
    content: '在《太空防御》评论: "很棒的游戏！"',
    timestamp: '4小时前',
    read: false,
    gameId: '2'
  },
  {
    id: '3',
    type: 'follow',
    avatar: '🧑‍🚀',
    name: '用户C',
    content: '关注了你',
    timestamp: '昨天',
    read: true
  },
  {
    id: '4',
    type: 'fork',
    avatar: '👨‍🎓',
    name: '用户D',
    content: '复制了你的游戏《消消乐》',
    timestamp: '3天前',
    read: true,
    gameId: '4'
  },
  {
    id: '5',
    type: 'system',
    avatar: '🎮',
    name: '系统消息',
    content: '您的游戏《2048数字游戏》已通过审核，现已上线',
    timestamp: '5天前',
    read: true
  }]
  );

  const handleMessageClick = (message) => {
    // Mark as read
    setMessages(
      messages.map((m) =>
      m.id === message.id ? { ...m, read: true } : m
      )
    );

    // Navigate if there's a game
    if (message.gameId) {
      navigation.push({
        url: `/pages/game/detail/index?id=${message.gameId}`
      });
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'like':
        return '♥';
      case 'comment':
        return '💬';
      case 'follow':
        return '👥';
      case 'fork':
        return '🔀';
      case 'system':
        return '📢';
      default:
        return '📬';
    }
  };

  const unreadCount = messages.filter((m) => !m.read).length;

  return (
    <View className="message-container">
      {/* Header */}
      <View className="message-header">
        <Text className="header-title">🔔 消息</Text>
        {unreadCount > 0 &&
        <View className="unread-badge">{unreadCount}</View>
        }
      </View>

      <ScrollView className="message-scroll" scrollY>
        {messages.length > 0 ?
        <View className="message-list">
            {messages.map((message) =>
          <View
            key={message.id}
            className={`message-item ${!message.read ? 'unread' : ''}`}
            onClick={() => handleMessageClick(message)}>
            
                <View className="message-avatar">{message.avatar}</View>
                <View className="message-content">
                  <View className="message-header-row">
                    <Text className="message-name">{message.name}</Text>
                    <Text className="message-time">{message.timestamp}</Text>
                  </View>
                  <Text className="message-text">{message.content}</Text>
                </View>
                <View className="message-icon">
                  {getIcon(message.type)}
                </View>
                {!message.read &&
            <View className="unread-dot" />
            }
              </View>
          )}
          </View> :

        <View className="empty-state">
            <Text className="empty-icon">📭</Text>
            <Text className="empty-text">暂无消息</Text>
            <Text className="empty-desc">
              当有人赞、评论或关注你时，会在这里显示
            </Text>
          </View>
        }

        <View className="bottom-spacer" />
      </ScrollView>

      {/* Custom TabBar */}
      <CustomTabBar activeIndex={3} />
    </View>);

}