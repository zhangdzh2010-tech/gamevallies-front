import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import * as socialService from '../../services/social';
import './index.scss';

export default function Message() {
  const isWeapp = process.env.TARO_ENV === 'weapp';
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadMessages = useCallback(async (pageNum, isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      const result = await socialService.getNotifications(pageNum, 50);
      const items = result?.items || result || [];
      if (pageNum === 1) {
        setMessages(items);
      } else {
        setMessages((prev) => [...prev, ...items]);
      }
      setHasMore(result?.hasMore || false);
      setPage(pageNum);
    } catch (e) {
      if (pageNum === 1) {
        Taro.showToast({ title: '加载消息失败', icon: 'none' });
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMessages(1);
  }, [loadMessages]);

  // 每次页面显示时刷新（从其他页面切回来时更新未读状态）
  useDidShow(() => {
    if (!loading) {
      loadMessages(1, true);
    }
  });

  const handleLoadMore = () => {
    if (loadingMore || !hasMore || refreshing) return;
    setLoadingMore(true);
    loadMessages(page + 1);
  };

  const handlePullDownRefresh = async () => {
    await loadMessages(1, true);
  };

  const handleMarkAllRead = async () => {
    try {
      await socialService.markAllNotificationsAsRead();
      setMessages((prev) =>
        prev.map((m) => ({ ...m, read: true, isRead: true }))
      );
      Taro.showToast({ title: '已全部标为已读', icon: 'success' });
    } catch (e) {
      Taro.showToast({ title: '操作失败', icon: 'none' });
    }
  };

  const handleMessageClick = async (message) => {
    const isRead = message.isRead || message.read;
    if (!isRead) {
      try {
        await socialService.markNotificationsAsRead([message.id]);
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...m, read: true, isRead: true } : m))
        );
      } catch (e) {
        // best-effort mark-read
      }
    }
    const gameId = message.gameId || message.targetId;
    if (gameId) {
      Taro.navigateTo({
        url: `/pages/game/detail/index?id=${gameId}`,
      }).catch(() => {});
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'like': return '❤️';
      case 'comment': return '💬';
      case 'follow': return '👥';
      case 'fork': return '🔀';
      case 'system': return '📢';
      case 'award': return '🏆';
      case 'earning': return '💰';
      default: return '📬';
    }
  };

  const getActorName = (message) => {
    return message.senderName || message.actorName || message.name || '用户';
  };

  const getActionText = (message) => {
    return message.body || message.content || message.action || '';
  };

  const getTimeText = (message) => {
    const time = message.createdAt || message.timestamp || message.time || '';
    if (!time) return '';
    // 已经是相对时间字符串则直接返回
    if (typeof time === 'string' && !time.includes('T') && !time.includes('-')) return time;
    try {
      const date = new Date(time);
      if (isNaN(date.getTime())) return time;
      const now = new Date();
      const diff = now - date;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      if (minutes < 1) return '刚刚';
      if (minutes < 60) return `${minutes}分钟前`;
      if (hours < 24) return `${hours}小时前`;
      if (days < 7) return `${days}天前`;
      return time.slice(0, 10);
    } catch {
      return time;
    }
  };

  const isUnread = (message) => !(message.isRead || message.read);
  const unreadCount = messages.filter(isUnread).length;

  return (
    <View className={`messages-page${isWeapp ? ' messages-page--weapp' : ''}`}>
      <AppTopBar />
      <View className="messages-header">
        <View className="header-content">
          <Text className="header-title">消息</Text>
          {unreadCount > 0 && <View className="unread-badge">{unreadCount}</View>}
        </View>
        {unreadCount > 0 && (
          <View className="mark-all-read" onClick={handleMarkAllRead}>
            <Text className="mark-all-read-text">全部已读</Text>
          </View>
        )}
      </View>

      <ScrollView
        className="messages-list"
        scrollY
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={handlePullDownRefresh}
        lowerThreshold={100}
        onScrollToLower={handleLoadMore}
      >
        {loading ? (
          <View className="empty-state">
            <Text className="empty-text">加载中...</Text>
          </View>
        ) : messages.length === 0 ? (
          <View className="empty-state">
            <Text className="empty-icon">📭</Text>
            <Text className="empty-text">暂无消息</Text>
            <Text className="empty-desc">当有人赞、评论或关注你时，会在这里显示</Text>
          </View>
        ) : (
          <View className="notifications">
            {messages.map((message) => (
              <View
                key={message.id}
                className={`notification-item ${isUnread(message) ? 'unread' : ''}`}
                onClick={() => handleMessageClick(message)}
              >
                <View className="notification-left">
                  <View className="notification-icon">
                    {getIcon(message.type)}
                  </View>
                  {isUnread(message) && <View className="unread-dot" />}
                </View>

                <View className="notification-content">
                  <View className="notification-header">
                    <Text className="actor-name">{getActorName(message)}</Text>
                    <Text className="notification-time">{getTimeText(message)}</Text>
                  </View>
                  <Text className="notification-action">{getActionText(message)}</Text>
                </View>

                <Text className="notification-arrow">→</Text>
              </View>
            ))}

            {loadingMore && (
              <View className="load-more-container">
                <Text className="load-more-btn">加载中...</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <CustomTabBar activeIndex={3} />
    </View>
  );
}
