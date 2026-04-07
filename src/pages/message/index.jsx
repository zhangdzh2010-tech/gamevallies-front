import React, { useState, useEffect, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { AppTopBar } from '../../components/common/AppTopBar';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import * as socialService from '../../services/social';
import { LOGIN_PAGE_URL, isLoggedIn, setPostLoginRedirect } from '../../utils/authNavigation';
import { getH5PageScrollContainer } from '../../utils/h5Scroll';
import { isH5Runtime, isWeappRuntime } from '../../utils/runtime';
import './index.scss';

function getNotificationIconType(type) {
  switch (type) {
    case 'like':
      return 'like';
    case 'comment':
      return 'comment';
    case 'follow':
      return 'follow';
    case 'fork':
      return 'fork';
    case 'system':
      return 'system';
    case 'award':
      return 'award';
    case 'earning':
      return 'earning';
    default:
      return 'default';
  }
}

function getNotificationLabel(type) {
  switch (type) {
    case 'like':
      return '点赞';
    case 'comment':
      return '评论';
    case 'follow':
      return '关注';
    case 'fork':
      return '复刻';
    case 'award':
      return '奖励';
    case 'earning':
      return '收益';
    case 'system':
      return '系统';
    default:
      return '通知';
  }
}

function getActorName(message) {
  return message.senderName || message.actorName || message.name || '用户';
}

function getActionText(message) {
  return message.body || message.content || message.action || '';
}

function getTimeText(message) {
  const time = message.createdAt || message.timestamp || message.time || '';
  if (!time) return '';

  if (typeof time === 'string' && !time.includes('T') && !time.includes('-')) {
    return time;
  }

  try {
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) {
      return time;
    }

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
}

export default function Message() {
  const isH5 = isH5Runtime();
  const isWeapp = isWeappRuntime();
  const loggedIn = isLoggedIn();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadMessages = useCallback(async (pageNum, isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      }

      const result = await socialService.getNotifications(pageNum, 50);
      const items = result?.items || result || [];

      if (pageNum === 1) {
        setMessages(items);
      } else {
        setMessages((prev) => [...prev, ...items]);
      }

      setHasMore(Boolean(result?.hasMore));
      setPage(pageNum);
    } catch {
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
    if (!loggedIn) {
      setMessages([]);
      setLoading(false);
      return;
    }

    loadMessages(1);
  }, [loadMessages, loggedIn]);

  useDidShow(() => {
    if (!loggedIn) {
      setMessages([]);
      setLoading(false);
      return;
    }

    if (!loading) {
      loadMessages(1, true);
    }
  });

  const getH5ScrollContainer = useCallback(() => {
    return isH5 ? getH5PageScrollContainer() : null;
  }, [isH5]);

  const handleLoadMore = useCallback(() => {
    if (!loggedIn || loadingMore || !hasMore || refreshing) return;
    setLoadingMore(true);
    loadMessages(page + 1);
  }, [hasMore, loadMessages, loadingMore, loggedIn, page, refreshing]);

  useEffect(() => {
    if (!isH5) {
      return undefined;
    }

    let ticking = false;
    const threshold = 280;

    const maybeLoadMore = () => {
      if (ticking) {
        return;
      }

      ticking = true;
      const runCheck = () => {
        ticking = false;
        const scrollContainer = getH5ScrollContainer();
        if (!scrollContainer) {
          return;
        }

        const remaining = scrollContainer.scrollHeight - (scrollContainer.scrollTop + scrollContainer.clientHeight);
        if (remaining <= threshold) {
          handleLoadMore();
        }
      };

      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(runCheck);
      } else {
        runCheck();
      }
    };

    window.addEventListener('scroll', maybeLoadMore, { passive: true });
    document.addEventListener('scroll', maybeLoadMore, true);
    maybeLoadMore();

    return () => {
      window.removeEventListener('scroll', maybeLoadMore);
      document.removeEventListener('scroll', maybeLoadMore, true);
    };
  }, [getH5ScrollContainer, handleLoadMore, isH5]);

  const handlePullDownRefresh = async () => {
    if (!loggedIn) {
      setRefreshing(false);
      return;
    }

    await loadMessages(1, true);
  };

  const handleMarkAllRead = async () => {
    if (!loggedIn) {
      return;
    }

    try {
      await socialService.markAllNotificationsAsRead();
      setMessages((prev) => prev.map((item) => ({ ...item, read: true, isRead: true })));
      Taro.showToast({ title: '已全部标记为已读', icon: 'success' });
    } catch {
      Taro.showToast({ title: '操作失败', icon: 'none' });
    }
  };

  const handleMessageClick = async (message) => {
    const alreadyRead = message.isRead || message.read;

    if (!alreadyRead) {
      try {
        await socialService.markNotificationsAsRead([message.id]);
        setMessages((prev) => prev.map((item) => (
          item.id === message.id
            ? { ...item, read: true, isRead: true }
            : item
        )));
      } catch {
        // #26 标记已读失败时给出轻量提示
        Taro.showToast({ title: '标记已读失败', icon: 'none', duration: 1500 });
      }
    }

    const gameId = message.gameId || message.targetId;
    if (gameId) {
      Taro.navigateTo({ url: `/pages/game/detail/index?id=${gameId}` }).catch(() => {
        // #25 导航失败时提示用户，避免死路
        Taro.showToast({ title: '该作品已不存在或暂不可用', icon: 'none' });
      });
    }
  };

  const openLogin = () => {
    setPostLoginRedirect('/pages/message/index');
    Taro.navigateTo({ url: LOGIN_PAGE_URL }).catch(() => {});
  };

  const isUnread = (message) => !(message.isRead || message.read);
  const unreadCount = messages.filter(isUnread).length;
  const messageStats = [
    { key: 'unread', label: '未读消息', value: `${unreadCount}` },
    { key: 'total', label: '全部通知', value: `${messages.length}` },
    { key: 'state', label: '收件状态', value: loggedIn ? '已同步' : '待登录' },
  ];

  return (
    <View className={`messages-page${isH5 ? ' messages-page--h5' : ''}${isWeapp ? ' messages-page--weapp' : ''}`}>
      <AppTopBar />
      <View className="messages-shell">

      <View className="messages-stage">
        <View className="messages-stage__copy">
          <Text className="messages-stage__eyebrow">Inbox Center</Text>
          <Text className="messages-stage__title">{loggedIn ? '把互动、提醒和进展都收拢在这里' : '登录后查看你的互动通知'}</Text>
          <Text className="messages-stage__desc">
            {loggedIn
              ? '点赞、评论、关注和系统提醒会持续聚合到消息中心，方便你快速处理。'
              : '登录后这里会展示别人对你的点赞、评论、关注以及系统通知。'}
          </Text>
        </View>
        <View className="messages-stage__metrics">
          {messageStats.map((stat) => (
            <View key={stat.key} className="messages-stage__metric">
              <Text className="messages-stage__metric-label">{stat.label}</Text>
              <Text className="messages-stage__metric-value">{stat.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="messages-header">
        <View className="header-content">
          <Text className="header-kicker">Notifications</Text>
          <View className="header-main">
            <Text className="header-title">消息</Text>
            {unreadCount > 0 ? <View className="unread-badge">{unreadCount}</View> : null}
          </View>
        </View>
        {loggedIn && unreadCount > 0 ? (
          <View className="mark-all-read" onClick={handleMarkAllRead}>
            <Text className="mark-all-read-text">全部已读</Text>
          </View>
        ) : null}
      </View>

      <PageScrollContainer
        className="messages-list"
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
        ) : !loggedIn ? (
          <View className="empty-state">
            <View className="empty-icon" />
            <Text className="empty-text">登录后查看消息通知</Text>
            <Text className="empty-desc">你的点赞、评论、关注提醒和系统通知会统一收纳在这里。</Text>
            <View className="empty-action" onClick={openLogin}>
              <Text>去登录</Text>
            </View>
          </View>
        ) : messages.length === 0 ? (
          <View className="empty-state">
            <View className="empty-icon" />
            <Text className="empty-text">暂无消息</Text>
            <Text className="empty-desc">当有人点赞、评论、关注你时，会在这里显示。</Text>
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
                  <View className={`notification-icon notification-icon--${getNotificationIconType(message.type)}`} />
                  {isUnread(message) ? <View className="unread-dot" /> : null}
                </View>

                <View className="notification-content">
                  <View className="notification-header">
                    <View className="notification-heading">
                      <Text className={`notification-tag notification-tag--${getNotificationIconType(message.type)}`}>
                        {getNotificationLabel(message.type)}
                      </Text>
                      <Text className="actor-name">{getActorName(message)}</Text>
                    </View>
                    <Text className="notification-time">{getTimeText(message)}</Text>
                  </View>
                  <Text className="notification-action">{getActionText(message)}</Text>
                </View>

                <View className="notification-arrow" />
              </View>
            ))}

            {loadingMore ? (
              <View className="load-more-container">
                <Text className="load-more-btn">加载中...</Text>
              </View>
            ) : null}
          </View>
        )}
      </PageScrollContainer>
      </View>

      <CustomTabBar activeIndex={3} />
    </View>
  );
}
