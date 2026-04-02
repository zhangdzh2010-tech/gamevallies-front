/* eslint-disable react/prop-types */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Textarea, Image, Input } from '@tarojs/components';
import { AppTopBar } from '../../components/common/AppTopBar';
import { GameCard } from '../../components/common/GameCard';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { PageScrollContainer } from '../../components/common/PageScrollContainer';
import { Storage } from '../../utils/storage';
import { ENV } from '../../config/env';
import {
  consumePersistedProfileActiveTab,
  openCreatePageWithAuth,
  openIteratePageWithAuth,
  openTaskCreatePageWithAuth,
} from '../../utils/authNavigation';
import * as authService from '../../services/auth';
import * as gameService from '../../services/game';
import * as socialService from '../../services/social';
import { isTerminalTaskStatus, useGameStore } from '../../store/gameStore';
import useGamePlayerStore from '../../stores/gamePlayer';
import useQuotaStore from '../../stores/quotaStore';
import { PaywallPopup } from '../../components/common/PaywallPopup';
import { buildGameDetailPath } from '../../utils/share';
import Taro, { useDidShow } from '@tarojs/taro';
import { getBookmarkedGames, mergeBookmarkedFlags, setGameBookmarked } from '../../utils/bookmarks';
import { subscribeGameUnlocked } from '../../utils/gameUnlock';
import { getGameCoverUrl } from '../../utils/media';
import { getGameOrientation } from '../../utils/gameOrientation';
import { isH5Runtime, isWeappRuntime } from '../../utils/runtime';
import './index.scss';

const GAME_COLORS = ['#6e56ff', '#2dd4a8', '#fbbf24', '#ff5c8a'];
const GAME_EMOJIS = ['🎮', '🕹️', '✨', '🚀', '🎯', '🎲', '🌟', '⚡'];
const PUBLISHED_STATUSES = ['published', 'review'];
// 'ready' is how the API presents 'draft' games.
const DRAFT_STATUSES = ['ready', 'draft', 'generating', 'failed', 'banned'];

function normalizeGame(game, index) {
  return {
    ...game,
    title: game.title || `游戏 ${String(game.id || '').slice(0, 6)}`,
    plays: game.plays || game.playCount || 0,
    likes: game.likes || game.likeCount || 0,
    comments: game.comments || game.commentCount || 0,
    bookmarks: game.bookmarks || game.bookmarkCount || 0,
    viewerHasLiked: game.viewerHasLiked === true || game.liked === true,
    viewerHasBookmarked: game.viewerHasBookmarked === true || game.bookmarked === true,
    emoji: game.emoji || GAME_EMOJIS[index % GAME_EMOJIS.length],
    color: game.color || GAME_COLORS[index % GAME_COLORS.length],
    author: game.author?.username || game.author || '创作者',
    authorEmoji: game.authorEmoji || '👤',
    isHot: (game.plays || 0) > 10000,
  };
}

function mergeUnlockedProfileGame(game, payload) {
  const unlockedGame = payload?.game || {};

  return {
    ...game,
    ...unlockedGame,
    canPlay: true,
    requireSubscription: false,
    quotaRemaining: payload?.quotaRemaining ?? unlockedGame.quotaRemaining ?? game?.quotaRemaining ?? null,
  };
}

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return String(num);
}

function normalizeAvatarSource(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (
    /^https?:\/\//i.test(trimmed) ||
    /^data:image\//i.test(trimmed) ||
    /^blob:/i.test(trimmed) ||
    /^wxfile:\/\//i.test(trimmed) ||
    /^file:\/\//i.test(trimmed)
  ) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    return `${ENV.API_BASE_URL.replace(/\/$/, '')}${trimmed}`;
  }

  return '';
}

function isPersistableAvatarUrl(value) {
  return /^https?:\/\//i.test(value || '');
}

function getAvatarFallback(value, name) {
  const avatarText = typeof value === 'string' ? value.trim() : '';

  if (avatarText && Array.from(avatarText).length <= 2 && !/[/:.]/.test(avatarText)) {
    return avatarText;
  }

  const safeName = typeof name === 'string' ? name.trim() : '';
  const firstChar = safeName ? Array.from(safeName)[0] : '';

  if (!firstChar) {
    return '👤';
  }

  return /^[a-z]$/i.test(firstChar) ? firstChar.toUpperCase() : firstChar;
}

function resolveAvatarValue({ avatar, avatarUrl, name, fallbackAvatar = '👤' }) {
  const avatarSrc = normalizeAvatarSource(avatarUrl) || normalizeAvatarSource(avatar);
  if (avatarSrc) {
    return avatarSrc;
  }

  return getAvatarFallback(avatar || fallbackAvatar, name);
}

const GAME_STATUS_BADGE_LABELS = {
  generating: '生成中',
  review: '审核中',
  failed: '失败',
  banned: '已下架',
  draft: '草稿',
  ready: '待发布',
  published: '已发布',
};

const TASK_TYPE_LABELS = {
  pipeline_run: '新建作品',
  pipeline_iterate: '优化作品',
};

const TASK_STATUS_LABELS = {
  queued: '排队中',
  submitted: '执行中',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  canceled: '已取消',
  timed_out: '超时',
};

const ACTIVE_TASK_STATUSES = new Set(['queued', 'submitted', 'running']);
const FAILED_TASK_STATUSES = new Set(['failed', 'timed_out', 'canceled']);

function isActiveTaskStatus(status) {
  return ACTIVE_TASK_STATUSES.has(status);
}

function isFailedTaskStatus(status) {
  return FAILED_TASK_STATUSES.has(status);
}

function getTaskStatusDetail(task) {
  if (!task) {
    return '';
  }

  if (task.terminalErrorMessage) {
    return task.terminalErrorMessage;
  }

  if (task.status === 'timed_out') {
    return '任务处理超时，请稍后查看作品结果或重新发起。';
  }

  if (task.status === 'canceled') {
    return '任务已被取消，本次生成不会继续执行。';
  }

  if (task.status === 'failed') {
    if (task.latestMessage && task.latestMessage !== '等待任务状态更新') {
      return task.latestMessage;
    }

    return '任务执行失败，请稍后重试。';
  }

  if (task.status === 'succeeded') {
    return '任务已完成，可以继续查看作品结果。';
  }

  return '';
}

function getTaskCardMessage(task) {
  if (!task) {
    return '等待任务状态更新';
  }

  if (isFailedTaskStatus(task.status)) {
    return '任务执行未完成，请查看下方详情。';
  }

  if (task.status === 'succeeded') {
    return '任务已完成，可以继续查看作品结果。';
  }

  if (isActiveTaskStatus(task.status)) {
    return task.taskType === 'pipeline_iterate'
      ? 'AI 正在优化作品，请稍候'
      : 'AI 正在生成作品，请稍候';
  }

  return '等待任务状态更新';
}

function getDisplayGameStatusFromTask(task) {
  if (!task) {
    return '';
  }

  if (isActiveTaskStatus(task.status)) {
    return 'generating';
  }

  if (isFailedTaskStatus(task.status)) {
    return 'failed';
  }

  return '';
}

function mergeTrackedTaskStatusIntoGames(games, trackedTasks) {
  if (!Array.isArray(games) || !games.length || !Array.isArray(trackedTasks) || !trackedTasks.length) {
    return games;
  }

  const latestTaskByGameId = new Map();

  [...trackedTasks]
    .sort((a, b) => (b?.updatedAt || 0) - (a?.updatedAt || 0))
    .forEach((task) => {
      const gameId = String(task?.gameId || '').trim();
      if (!gameId || latestTaskByGameId.has(gameId)) {
        return;
      }

      latestTaskByGameId.set(gameId, task);
    });

  return games.map((game) => {
    const gameId = String(game?.id || '').trim();
    if (!gameId || PUBLISHED_STATUSES.includes(game?.status)) {
      return game;
    }

    const latestTask = latestTaskByGameId.get(gameId);
    const displayStatus = getDisplayGameStatusFromTask(latestTask);

    if (!displayStatus || displayStatus === game.status) {
      return game;
    }

    return {
      ...game,
      status: displayStatus,
    };
  });
}

function getGameBadgeLabel(game) {
  return GAME_STATUS_BADGE_LABELS[game?.status] || (game?.isHot ? '热门' : '推荐');
}

function formatTaskTime(timestamp) {
  if (!timestamp) {
    return '';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}


function ProfileTaskCard({ task, onResume, onCancel, onDelete }) {
  const isActive = isActiveTaskStatus(task.status);
  const isFailed = isFailedTaskStatus(task.status);
  const isTerminal = isTerminalTaskStatus(task.status);
  const failureDetail = isFailed ? getTaskStatusDetail(task) : '';
  const detailMessage = !isFailed && isTerminal ? getTaskStatusDetail(task) : '';
  const taskCardMessage = getTaskCardMessage(task);

  return (
    <View className="profile-task-card">
      <View className="profile-task-card__top">
        <View className="profile-task-card__meta">
          <Text className="profile-task-card__type">{TASK_TYPE_LABELS[task.taskType] || '创作任务'}</Text>
          <Text className={`profile-task-card__status profile-task-card__status--${task.status}`}>
            {TASK_STATUS_LABELS[task.status] || task.status}
          </Text>
        </View>
        <Text className="profile-task-card__time">{formatTaskTime(task.updatedAt)}</Text>
      </View>

      <Text className="profile-task-card__title">
        {task.gameTitle || task.promptPreview || TASK_TYPE_LABELS[task.taskType] || '创作任务'}
      </Text>
      <Text className="profile-task-card__message">{taskCardMessage}</Text>

      {failureDetail ? (
        <View className="profile-task-card__detail profile-task-card__detail--failure">
          <Text className="profile-task-card__detail-label">失败详情</Text>
          <Text className="profile-task-card__detail-text">{failureDetail}</Text>
        </View>
      ) : null}

      {detailMessage ? (
        <View className="profile-task-card__detail">
          <Text className="profile-task-card__detail-text">{detailMessage}</Text>
        </View>
      ) : null}

      {isActive ? (
        <View className="profile-task-card__progress">
          <View className="profile-task-card__progress-bg">
            <View className="profile-task-card__progress-fill" style={{ width: `${task.progressPct || 0}%` }} />
          </View>
          <Text className="profile-task-card__progress-text">{task.progressPct || 0}%</Text>
        </View>
      ) : null}

      <View className="profile-task-card__actions">
        <View className="profile-task-card__btn profile-task-card__btn--primary" onClick={() => onResume(task)}>
          <Text>继续查看</Text>
        </View>
        {isActive ? (
          <View className="profile-task-card__btn profile-task-card__btn--danger" onClick={() => onCancel(task)}>
            <Text>取消任务</Text>
          </View>
        ) : (
          <View className="profile-task-card__btn profile-task-card__btn--ghost" onClick={() => onDelete(task)}>
            <Text>删除记录</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function MoreMenu({ game, onClose, onShare, onPublish, onOptimize, onDelete, onSettings }) {
  const canPublish = ['ready', 'draft'].includes(game?.status);
  const actions = [
    ...(canPublish
      ? [
          {
            key: 'publish',
            iconKey: 'publish',
            tone: 'publish',
            label: '发布作品',
            desc: '发布后会进入作品区，对外展示给其他用户',
            onClick: onPublish,
          },
        ]
      : []),
    {
      key: 'share',
      iconKey: 'share',
      tone: 'share',
      label: '分享作品',
      desc: '发送给好友或分享到社交平台',
      onClick: onShare,
    },
    {
      key: 'optimize',
      iconKey: 'optimize',
      tone: 'optimize',
      label: '优化游戏',
      desc: '继续完善玩法、文案和交互体验',
      onClick: onOptimize,
    },
    {
      key: 'settings',
      iconKey: 'settings',
      tone: 'settings',
      label: '权限设置',
      desc: '管理可见范围、评论和复刻权限',
      onClick: onSettings,
    },
    {
      key: 'delete',
      iconKey: 'delete',
      tone: 'danger',
      label: '删除游戏',
      desc: '删除后不可恢复，请谨慎操作',
      onClick: onDelete,
      danger: true,
    },
  ];

  return (
    <View className="more-overlay" onClick={onClose}>
      <View className="more-menu" onClick={(e) => e.stopPropagation()}>
        <View className="more-header">
          <View className="more-header-copy">
            <Text className="more-title">作品操作</Text>
            <Text className="more-game-name">{game.title}</Text>
          </View>
          <View className="more-close" onClick={onClose}>
            <Text>×</Text>
          </View>
        </View>
        <View className="more-list">
          {actions.map((action) => (
            <View
              key={action.key}
              className={`more-item ${action.danger ? 'danger' : ''}`}
              onClick={action.onClick}
            >
              <View className={`more-icon-badge more-icon-badge--${action.tone}`}>
                <View className={`more-icon more-icon--${action.iconKey}`} />
              </View>
              <View className="more-copy">
                <Text className="more-label">{action.label}</Text>
                <Text className="more-desc">{action.desc}</Text>
              </View>
              <View className="more-arrow" />
            </View>
          ))}
        </View>
        <View className="more-cancel" onClick={onClose}>
          <Text>取消</Text>
        </View>
      </View>
    </View>
  );
}

function VisibilityModal({ game, onClose, onSave }) {
  const [visibility, setVisibility] = useState(game?.visibility || 'public');
  const [allowComments, setAllowComments] = useState(game?.allowComments !== false);
  const [allowFork, setAllowFork] = useState(game?.allowFork !== false);

  const visibilityOptions = [
    { value: 'public',  icon: '公开', label: '公开', desc: '所有人都可以查看' },
    { value: 'friends', icon: '好友', label: '好友可见', desc: '仅互相关注的好友可查看' },
    { value: 'private', icon: '私密', label: '仅自己可见', desc: '只有你自己可以查看' },
  ];

  return (
    <View className="modal-overlay" onClick={onClose}>
      <View className="visibility-modal" onClick={(e) => e.stopPropagation()}>
        <View className="visibility-modal__header">
          <View className="visibility-modal__copy">
            <Text className="modal-title">权限设置</Text>
            <Text className="modal-subtitle">管理谁可以看到这款作品，以及评论和复刻权限。</Text>
          </View>
          <View className="modal-close-btn" onClick={onClose}>
            <Text>×</Text>
          </View>
        </View>

        <View className="setting-group">
          <Text className="setting-section-label">可见范围</Text>
          {visibilityOptions.map((opt) => (
            <View
              key={opt.value}
              className={`vis-option ${visibility === opt.value ? 'selected' : ''}`}
              onClick={() => setVisibility(opt.value)}
            >
              <Text className="vis-icon">{opt.icon}</Text>
              <View className="vis-text">
                <Text className="vis-label">{opt.label}</Text>
                <Text className="vis-desc">{opt.desc}</Text>
              </View>
              <View className={`vis-radio ${visibility === opt.value ? 'active' : ''}`} />
            </View>
          ))}
        </View>

        <View className="setting-group">
          <Text className="setting-section-label">互动权限</Text>
          <View className="toggle-row" onClick={() => setAllowComments(!allowComments)}>
            <View className="toggle-info">
              <Text className="toggle-label">允许评论</Text>
              <Text className="toggle-desc">其他用户可以评论你的游戏</Text>
            </View>
            <View className={`toggle-switch ${allowComments ? 'on' : ''}`}>
              <View className="toggle-thumb" />
            </View>
          </View>
          <View className="toggle-row" onClick={() => setAllowFork(!allowFork)}>
            <View className="toggle-info">
              <Text className="toggle-label">允许复刻</Text>
              <Text className="toggle-desc">其他用户可以基于你的游戏进行二次创作</Text>
            </View>
            <View className={`toggle-switch ${allowFork ? 'on' : ''}`}>
              <View className="toggle-thumb" />
            </View>
          </View>
        </View>

        <View className="modal-actions">
          <View className="modal-btn cancel" onClick={onClose}><Text>取消</Text></View>
          <View className="modal-btn confirm" onClick={() => onSave({ visibility, allowComments, allowFork })}>
            <Text>保存</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/* 编辑资料弹窗 */
const MAX_NAME_LEN = 30;
const MAX_BIO_LEN = 200;

function EditProfileModal({ profile, onClose, onSave }) {
  const [name, setName] = useState(profile.name || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [avatar, setAvatar] = useState(() => (
    resolveAvatarValue({
      avatar: profile.avatar,
      avatarUrl: profile.avatarUrl,
      name: profile.name,
    })
  ));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleChooseAvatar = () => {
    Taro.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempPath = res.tempFilePaths[0];
        setAvatar(tempPath);
        setUploading(true);
        try {
          const token = Storage.getToken();
          const uploadRes = await new Promise((resolve, reject) => {
            Taro.uploadFile({
              url: `${ENV.API_BASE_URL}/api/v1/users/avatar`,
              filePath: tempPath,
              name: 'avatar',
              header: { Authorization: `Bearer ${token}` },
              success: resolve,
              fail: reject,
            });
          });
          const data = JSON.parse(uploadRes.data);
          if (data.code === 0 && data.data?.url) {
            setAvatar(data.data.url);
          }
        } catch (e) {
          console.error('Avatar upload failed:', e);
          Taro.showToast({ title: '头像上传失败', icon: 'none' });
          setAvatar(resolveAvatarValue({
            avatar: profile.avatar,
            avatarUrl: profile.avatarUrl,
            name: profile.name,
          }));
        } finally {
          setUploading(false);
        }
      },
    });
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Taro.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    setSaving(true);
    try {
      const currentUser = Storage.getUser() || {};
      const existingAvatarUrl = normalizeAvatarSource(currentUser.avatarUrl) || normalizeAvatarSource(profile.avatarUrl);
      const nextAvatarSource = normalizeAvatarSource(avatar);
      const persistedAvatarUrl = isPersistableAvatarUrl(nextAvatarSource) ? nextAvatarSource : existingAvatarUrl;
      const nextAvatarValue = persistedAvatarUrl || getAvatarFallback(avatar, trimmedName);
      const updateData = {
        displayName: trimmedName,
        bio: bio.trim(),
      };
      if (persistedAvatarUrl) {
        updateData.avatarUrl = persistedAvatarUrl;
      }
      await authService.updateProfile(updateData);
      Storage.setUser({
        ...currentUser,
        displayName: trimmedName,
        name: trimmedName,
        bio: bio.trim(),
        avatar: nextAvatarValue,
        avatarUrl: persistedAvatarUrl || '',
      });
      onSave({
        name: trimmedName,
        bio: bio.trim(),
        avatar: nextAvatarValue,
        avatarUrl: persistedAvatarUrl || '',
      });
      Taro.showToast({ title: '保存成功', icon: 'success' });
    } catch (e) {
      console.error('updateProfile failed:', e);
      Taro.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="modal-overlay" onClick={onClose}>
      <View className="edit-profile-modal" onClick={(e) => e.stopPropagation()}>
        <View className="edit-modal-header">
          <Text className="edit-modal-title">编辑资料</Text>
          <View className="edit-modal-close" onClick={onClose}>
            <Text>x</Text>
          </View>
        </View>

        <ScrollView scrollY className="edit-modal-body">
          {/* 头像 */}
          <View className="edit-avatar-section">
            <View className="edit-avatar-bg" />
            <View className="edit-avatar-preview" onClick={handleChooseAvatar}>
              {normalizeAvatarSource(avatar) ? (
                <Image className="edit-avatar-img" src={normalizeAvatarSource(avatar)} mode="aspectFill" />
              ) : (
                <Text className="edit-avatar-emoji">{getAvatarFallback(avatar, name)}</Text>
              )}
              <View className="edit-avatar-badge">
                <Text>{uploading ? '上传中' : '上传'}</Text>
              </View>
            </View>
            <Text className="edit-avatar-hint">点击更换头像</Text>
          </View>

          {/* 昵称 */}
          <View className="edit-field">
            <Text className="edit-label">昵称</Text>
            <View className="edit-input-wrap">
              <Input
                className="edit-input"
                value={name}
                onInput={(e) => setName(e.detail.value.slice(0, MAX_NAME_LEN))}
                placeholder="取一个好听的名字"
                placeholderStyle="color: #55516e"
                maxlength={MAX_NAME_LEN}
              />
            </View>
            <Text className="edit-counter">{name.length}/{MAX_NAME_LEN}</Text>
          </View>

          {/* 简介 */}
          <View className="edit-field">
            <Text className="edit-label">个人简介</Text>
            <View className="edit-input-wrap">
              <Textarea
                className="edit-textarea"
                value={bio}
                onInput={(e) => setBio(e.detail.value.slice(0, MAX_BIO_LEN))}
                placeholder="介绍一下自己吧"
                placeholderStyle="color: #55516e"
                maxlength={MAX_BIO_LEN}
                autoHeight
              />
            </View>
            <Text className="edit-counter">{bio.length}/{MAX_BIO_LEN}</Text>
          </View>
        </ScrollView>

        <View className="edit-modal-footer">
          <View className="edit-save-btn" onClick={handleSave}>
            <Text>{saving ? '保存中...' : '保存修改'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function Profile() {
  const isH5 = isH5Runtime();
  const isWeapp = isWeappRuntime();
  const openGame = useGamePlayerStore((s) => s.openGame);
  const trackedTasks = useGameStore((state) => state.trackedTasks);
  const hydrateTrackedTasks = useGameStore((state) => state.hydrateTrackedTasks);
  const refreshTrackedTasks = useGameStore((state) => state.refreshTrackedTasks);
  const cancelTaskById = useGameStore((state) => state.cancelTaskById);
  const removeTrackedTask = useGameStore((state) => state.removeTrackedTask);
  const currentUserId = Storage.getUser()?.id;
  const freeQuota = useQuotaStore((s) => s.freeQuota);
  const totalFreeQuota = useQuotaStore((s) => s.totalFreeQuota);
  const subscription = useQuotaStore((s) => s.subscription);
  const fetchQuota = useQuotaStore((s) => s.fetchQuota);
  const [activeTab, setActiveTab] = useState('works');
  const [profile, setProfile] = useState({
    name: '', avatar: '👤', avatarUrl: '', bio: '',
    followers: 0, following: 0, totalLikes: 0, mutualFollows: 0,
  });

  const [allGames, setAllGames] = useState([]);
  const [bookmarkedGames, setBookmarkedGames] = useState(() => getBookmarkedGames());
  const [loadingGames, setLoadingGames] = useState(false);
  const [moreGame, setMoreGame] = useState(null);
  const [settingsGame, setSettingsGame] = useState(null);
  const [editProfile, setEditProfile] = useState(false);

  const displayGames = useMemo(
    () => mergeTrackedTaskStatusIntoGames(allGames, trackedTasks),
    [allGames, trackedTasks]
  );
  const normalizedBookmarkedGames = useMemo(
    () => mergeBookmarkedFlags(bookmarkedGames.map((game, index) => normalizeGame(game, index))),
    [bookmarkedGames]
  );
  const publishedGames = displayGames.filter((g) => PUBLISHED_STATUSES.includes(g.status));
  const draftGames = displayGames.filter((g) => DRAFT_STATUSES.includes(g.status));
  const likedGames = displayGames.filter((g) => g.viewerHasLiked);

  const refreshBookmarkedGames = () => {
    setBookmarkedGames(getBookmarkedGames());
    setAllGames((prev) => mergeBookmarkedFlags(prev));
  };

  const syncStoredProfile = () => {
    const storedUser = Storage.getUser();
    if (storedUser) {
      const nextName = storedUser.displayName || storedUser.nickname || storedUser.name || storedUser.username || '用户';
      const nextAvatarUrl = normalizeAvatarSource(storedUser.avatarUrl) || normalizeAvatarSource(storedUser.avatar);
      setProfile((prev) => ({
        ...prev,
        name: nextName,
        avatar: nextAvatarUrl || getAvatarFallback(storedUser.avatar, nextName),
        avatarUrl: nextAvatarUrl || prev.avatarUrl,
        bio: storedUser.bio || '这个人很懒，还没有介绍自己',
      }));
    }
  };

  const syncRemoteProfile = () => {
    authService.getMe().then((user) => {
      if (user) {
        setProfile((prev) => {
          const nextName = user.displayName || user.nickname || user.name || prev.name || user.username || '用户';
          const nextAvatarUrl = normalizeAvatarSource(user.avatarUrl) || normalizeAvatarSource(user.avatar);

          return {
            ...prev,
            name: nextName,
            avatar: nextAvatarUrl || getAvatarFallback(user.avatar, nextName),
            avatarUrl: nextAvatarUrl || prev.avatarUrl,
            bio: user.bio || prev.bio,
            followers: user.followerCount || 0,
            following: user.followingCount || 0,
            mutualFollows: user.mutualFollowCount || 0,
          };
        });

        const currentStoredUser = Storage.getUser() || {};
        Storage.setUser({
          ...currentStoredUser,
          ...user,
        });
      }
    }).catch(() => {});
  };

  const redirectToLogin = () => {
    Taro.showToast({ title: '请先登录', icon: 'none', duration: 1500 });
    // #18 先跳到首页再跳登录，避免用户取消登录后被困在Profile循环跳转
    setTimeout(() => {
      Taro.switchTab({ url: '/pages/index/index' }).then(() => {
        Taro.navigateTo({ url: '/pages/login/index' });
      }).catch(() => {
        Taro.navigateTo({ url: '/pages/login/index' }).catch(() => {});
      });
    }, 500);
  };

  const refreshProfilePage = ({ redirectOnMissingToken = false } = {}) => {
    const token = Storage.getToken();
    if (!token) {
      setAllGames([]);
      setLoadingGames(false);
      if (redirectOnMissingToken) {
        redirectToLogin();
      }
      return false;
    }

    syncStoredProfile();
    syncRemoteProfile();
    fetchQuota(true);
    fetchMyGames();
    return true;
  };

  useEffect(() => {
    refreshProfilePage({ redirectOnMissingToken: true });
  }, []);

  useDidShow(() => {
    refreshBookmarkedGames();
    hydrateTrackedTasks();
    refreshTrackedTasks().catch(() => {});
    refreshProfilePage();

    const nextActiveTab = consumePersistedProfileActiveTab();
    if (nextActiveTab) {
      setActiveTab(nextActiveTab);
    }
  });

  useEffect(() => subscribeGameUnlocked((payload) => {
    const payloadGameId = String(payload?.gameId || '');
    if (!payloadGameId) {
      return;
    }

    setAllGames((prev) => prev.map((game) => (
      String(game?.id || '') === payloadGameId
        ? mergeUnlockedProfileGame(game, payload)
        : game
    )));
  }), []);

  const fetchMyGames = async () => {
    setLoadingGames(true);
    try {
      const result = await gameService.getMyGames(1, 50);
      const items = mergeBookmarkedFlags((result?.items || []).map(normalizeGame));
      setAllGames(items);
      const totalLikes = items.reduce((sum, g) => sum + (g.likes || 0), 0);
      setProfile((prev) => ({ ...prev, totalLikes }));
    } catch (e) {
      console.error('fetchMyGames error:', e);
    } finally {
      setLoadingGames(false);
    }
  };

  const handlePlay = (game) => {
    if (game.gameUrl) {
      openGame(game.gameUrl, game.title, getGameCoverUrl(game), {
        gameId: game.id,
        canPlay: game.canPlay !== false,
        orientation: getGameOrientation(game),
        isOwnGame: Boolean(currentUserId && String(game.authorId || game.author?.id || '') === String(currentUserId)),
      });
      return;
    }

    Taro.navigateTo({ url: buildGameDetailPath(game.id) }).catch(() => {});
  };

  const handleLike = async (targetGame) => {
    try {
      const result = await socialService.likeGame('game', targetGame.id);
      const nextLiked = typeof result?.liked === 'boolean'
        ? result.liked
        : !targetGame.viewerHasLiked;
      const nextLikes = Number.isFinite(Number(result?.likes))
        ? Number(result.likes)
        : Math.max(0, (Number(targetGame.likes) || 0) + (nextLiked ? 1 : -1));

      const nextGames = allGames.map((game) => (
        game.id === targetGame.id
          ? { ...game, likes: nextLikes, viewerHasLiked: nextLiked }
          : game
      ));

      setAllGames(nextGames);

      setProfile((prev) => ({
        ...prev,
        totalLikes: nextGames.reduce((sum, game) => sum + (Number(game.likes) || 0), 0),
      }));

      return { liked: nextLiked, likes: nextLikes };
    } catch (error) {
      Taro.showToast({ title: error?.message || '点赞失败，请重试', icon: 'none' });
      throw error;
    }
  };

  const handleComment = (game) => {
    if (!game?.id) {
      return;
    }

    Taro.navigateTo({ url: buildGameDetailPath(game.id, { openComment: 1 }) }).catch(() => {});
  };

  const handleToggleBookmark = async (targetGame) => {
    const nextBookmarked = !targetGame.viewerHasBookmarked;
    const nextBookmarks = Math.max(0, (Number(targetGame.bookmarks) || 0) + (nextBookmarked ? 1 : -1));
    const nextBookmarkedGames = setGameBookmarked(targetGame, nextBookmarked);

    setBookmarkedGames(nextBookmarkedGames);
    setAllGames((prev) => prev.map((item) => (
      item.id === targetGame.id
        ? { ...item, viewerHasBookmarked: nextBookmarked, bookmarks: nextBookmarks }
        : item
    )));

    Taro.showToast({ title: nextBookmarked ? '已加入收藏' : '已取消收藏', icon: 'none' });
    return { bookmarked: nextBookmarked, bookmarks: nextBookmarks };
  };

  const handleOptimize = (game) => {
    setMoreGame(null);
    openIteratePageWithAuth(game, game?.id);
  };

  const handleShare = async (game) => {
    const sharePath = buildGameDetailPath(game.id);
    const shareUrl = process.env.TARO_ENV === 'h5'
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}${sharePath}`
      : sharePath;

    try {
      if (process.env.TARO_ENV === 'weapp') {
        await Taro.navigateTo({
          url: buildGameDetailPath(game.id, { openShare: 1 }),
        });
      } else if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: game.title, url: shareUrl });
        socialService.recordShare(game.id, 'h5_share').catch(() => {});
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        socialService.recordShare(game.id, 'copy_link').catch(() => {});
        Taro.showToast({ title: '链接已复制', icon: 'success' });
      } else {
        Taro.showModal({ title: '分享链接', content: shareUrl, showCancel: false });
      }
    } catch {
      Taro.showModal({ title: '分享链接', content: shareUrl, showCancel: false });
    }
    setMoreGame(null);
  };

  const handlePublish = async (game) => {
    setMoreGame(null);

    try {
      const result = await gameService.publishGame(game.id);
      const nextStatus = result?.status || 'published';

      setAllGames((prev) => prev.map((item) => (
        item.id === game.id
          ? normalizeGame({ ...item, ...(result || {}), status: nextStatus })
          : item
      )));

      Taro.showToast({ title: nextStatus === 'review' ? '已提交审核' : '发布成功', icon: 'success' });
    } catch (error) {
      Taro.showToast({ title: error?.message || '发布失败，请重试', icon: 'none' });
    }
  };

  const handleDelete = (game) => {
    setMoreGame(null);
    Taro.showModal({
      title: '删除游戏',
      content: `确定删除《${game.title}》吗？此操作不可撤销。`,
      confirmColor: '#ff5c8a',
      success: async (res) => {
        if (res.confirm) {
          try {
            await gameService.deleteGame(game.id);
            setAllGames((prev) => prev.filter((g) => g.id !== game.id));
            Taro.showToast({ title: '删除成功', icon: 'success' });
          } catch {
            Taro.showToast({ title: '删除失败，请重试', icon: 'none' });
          }
        }
      },
    });
  };

  const handleSettings = (game) => {
    setMoreGame(null);
    setSettingsGame(game);
  };

  const handleSaveSettings = async (settings) => {
    try {
      await gameService.updateGameSettings(settingsGame.id, settings);
      setAllGames((prev) => prev.map((g) => g.id === settingsGame.id ? { ...g, ...settings } : g));
      Taro.showToast({ title: '设置已保存', icon: 'success' });
    } catch {
      Taro.showToast({ title: '保存失败', icon: 'none' });
    }
    setSettingsGame(null);
  };

  const handleLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (res.confirm) {
          Storage.removeToken();
          Storage.removeRefreshToken();
          Storage.removeUser();
          Taro.showToast({ title: '已退出登录', icon: 'success' });
          setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 1000);
        }
      },
    });
  };

  const handleResumeTask = (task) => {
    openTaskCreatePageWithAuth(task.taskId, task.gameId || null, task.taskType || 'pipeline_run');
  };

  const handleCancelTask = (task) => {
    Taro.showModal({
      title: '取消任务',
      content: '确认取消这个正在执行中的创作任务吗？',
      confirmColor: '#ff5c8a',
      success: async (res) => {
        if (!res.confirm) {
          return;
        }

        try {
          await cancelTaskById(task.taskId);
          Taro.showToast({ title: '任务已取消', icon: 'success' });
          refreshTrackedTasks().catch(() => {});
        } catch (error) {
          Taro.showToast({ title: error?.message || '取消失败，请重试', icon: 'none' });
        }
      },
    });
  };

  const handleDeleteTask = (task) => {
    Taro.showModal({
      title: '删除任务记录',
      content: '确认从任务列表中删除这条记录吗？删除后不会影响已经生成的作品。',
      confirmColor: '#ff5c8a',
      success: (res) => {
        if (!res.confirm) {
          return;
        }

        removeTrackedTask(task.taskId);
        Taro.showToast({ title: '已删除任务记录', icon: 'success' });
      },
    });
  };

  const handleTabClick = (tab) => {
    setActiveTab(tab.key);
  };

  const canShowPublishButton = (game) => ['ready', 'draft'].includes(game?.status);

  const renderGameList = (games, emptyIconClass, emptyText, showCreate = true, showMore = true) => {
    if (loadingGames) {
      return <View className="empty-state"><Text className="empty-text">加载中...</Text></View>;
    }
    if (!games.length) {
      return (
        <View className="empty-state">
          <View className={`empty-icon ${emptyIconClass}`} />
          <Text className="empty-text">{emptyText}</Text>
          {showCreate && (
            <View className="empty-action" onClick={openCreatePageWithAuth}>
              <Text>开始创作</Text>
            </View>
          )}
        </View>
      );
    }

    return (
      <View className="games-list">
        {games.map((game) => (
          <View key={game.id} className="games-list__item">
            <GameCard
              game={game}
              variant="home-showcase"
              badgeLabel={getGameBadgeLabel(game)}
              onPlay={handlePlay}
              onComment={handleComment}
              onOpenDetail={showMore ? setMoreGame : undefined}
              showDetailEntry={showMore}
              onToggleLike={handleLike}
              onToggleBookmark={handleToggleBookmark}
            />
            {showMore && canShowPublishButton(game) ? (
              <View
                className="game-publish-primary-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePublish(game);
                }}
              >
                <Text>发布作品</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  const renderTaskPanel = () => {
    const activeTasks = trackedTasks.filter((task) => isActiveTaskStatus(task.status));
    const failedTasks = trackedTasks.filter((task) => isFailedTaskStatus(task.status));
    const succeededTasks = trackedTasks.filter((task) => task.status === 'succeeded');
    const primaryTask = activeTasks[0] || succeededTasks[0] || failedTasks[0] || null;

    const renderTaskSection = (title, tasks, emptyText) => (
      <View className="tasks-panel__section">
        <View className="tasks-panel__header">
          <Text className="tasks-panel__title">{title}</Text>
          <Text className="tasks-panel__count">{tasks.length}</Text>
        </View>

        {tasks.length ? (
          <View className="tasks-panel__list">
            {tasks.map((task) => (
              <ProfileTaskCard
                key={task.taskId}
                task={task}
                onResume={handleResumeTask}
                onCancel={handleCancelTask}
                onDelete={handleDeleteTask}
              />
            ))}
          </View>
        ) : (
          <View className="tasks-panel__empty tasks-panel__empty--compact">
            <Text className="tasks-panel__empty-text">{emptyText}</Text>
          </View>
        )}
      </View>
    );

    return (
      <View className="tasks-panel">
        <View className="tasks-panel__hero">
          <Text className="tasks-panel__hero-title">任务管理</Text>
          <Text className="tasks-panel__hero-desc">
            这里会保留进行中、已完成和失败/取消的任务记录；失败任务会显示失败详情，终态任务也可以手动删除。
          </Text>
        </View>

        {!trackedTasks.length ? (
          <View className="tasks-panel__empty">
            <View className="tasks-panel__empty-icon" />
            <Text className="tasks-panel__empty-text">当前还没有任务记录</Text>
            <View className="tasks-panel__empty-action" onClick={openCreatePageWithAuth}>
              <Text>开始创作</Text>
            </View>
          </View>
        ) : (
          <View className="tasks-panel__groups">
            {renderTaskSection('进行中', activeTasks, '当前没有进行中的任务')}
            {renderTaskSection('已完成', succeededTasks, '当前没有已完成任务')}
            {renderTaskSection('失败 / 已取消', failedTasks, '当前没有失败或取消的任务')}
          </View>
        )}

        {primaryTask ? (
          <View className="tasks-panel__footer">
            <View
              className="tasks-panel__primary-btn"
              onClick={() => handleResumeTask(primaryTask)}
            >
              <Text>继续查看最近任务</Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const TABS = [
    { key: 'works',     label: '作品', count: publishedGames.length },
    { key: 'drafts',    label: '草稿', count: draftGames.length },
    { key: 'liked',     label: '点赞', count: likedGames.length || null },
    { key: 'bookmarks', label: '收藏', count: normalizedBookmarkedGames.length || null },
    { key: 'tasks',     label: '任务', count: trackedTasks.length || null },
  ];

  const stats = [
    { value: formatNumber(profile.totalLikes), label: '获赞' },
    { value: formatNumber(profile.following), label: '关注' },
    { value: formatNumber(trackedTasks.length), label: '粉丝' },
    { value: formatNumber(normalizedBookmarkedGames.length), label: '收藏' },
  ];
  const quotaUsed = Math.max(0, totalFreeQuota - freeQuota);
  const subscriptionActive = Boolean(subscription?.active);
  const subscriptionTotal = Number(subscription?.quotaThisPeriod ?? 0) || 0;
  const subscriptionUsed = Number(subscription?.usedThisPeriod ?? 0) || 0;
  const subscriptionRemaining = Number(subscription?.remaining ?? Math.max(0, subscriptionTotal - subscriptionUsed)) || 0;
  const membershipPlanLabel = subscriptionActive ? (subscription?.planName || '会员卡') : '免费卡';
  const membershipQuotaText = subscriptionActive
    ? `订阅剩余 ${subscriptionRemaining}/${subscriptionTotal} 次`
    : `免费剩余 ${freeQuota}/${totalFreeQuota} 次`;
  const membershipQuotaSub = subscriptionActive
    ? `免费剩余 ${freeQuota}/${totalFreeQuota} 次`
    : `已使用 ${quotaUsed}/${totalFreeQuota}`;
  const profileAvatarSrc = normalizeAvatarSource(profile.avatarUrl) || normalizeAvatarSource(profile.avatar);
  const profileAvatarFallback = getAvatarFallback(profile.avatar, profile.name);

  return (
    <View className={`profile-container${isH5 ? ' profile-container--h5' : ''}${isWeapp ? ' profile-container--weapp' : ''}`}>
      <AppTopBar />
      <View className="profile-header">
        <View className="profile-summary-card">
          <View className="header-top">
            <View className="header-avatar">
              {profileAvatarSrc ? (
                <Image className="avatar-img" src={profileAvatarSrc} mode="aspectFill" />
              ) : (
                <Text className="avatar">{profileAvatarFallback}</Text>
              )}
            </View>
            <View className="header-main">
              <View className="profile-head-row">
                <View className="profile-head-copy">
                  <View className="profile-topline">
                    <View className="profile-inline-meta">
                      <Text className="profile-inline-meta__pill">{subscriptionActive ? '会员中' : '免费'}</Text>
                      <Text className="profile-inline-meta__pill profile-inline-meta__pill--ghost">创作者空间</Text>
                    </View>
                    <Text className="user-name">{profile.name || '用户'}</Text>
                  </View>

                  <Text className="user-bio">{profile.bio || '这个人很懒，还没有介绍自己'}</Text>

                  <View className="profile-membership-row">
                    <Text className="profile-membership-plan">{membershipPlanLabel}</Text>
                    <View className="profile-membership-copy">
                      <Text className="profile-membership-text">{membershipQuotaText}</Text>
                      <Text className="profile-membership-sub">{membershipQuotaSub}</Text>
                    </View>
                    <View
                      className="profile-membership-btn"
                      onClick={() => Taro.navigateTo({ url: '/pages/subscription/index' })}
                    >
                      <Text className="profile-membership-btn__text">{subscriptionActive ? '查看' : '订阅'}</Text>
                    </View>
                  </View>
                </View>

                <View className="header-actions">
                  <View className="settings-btn" onClick={() => setEditProfile(true)}>
                    <View className="settings-icon" />
                  </View>
                  <View className="logout-btn" onClick={handleLogout}>
                    <Text className="logout-text">退出</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          <View className="stats-row">
            {stats.map((s) => (
              <View key={s.label} className="stat">
                <Text className="stat-value">{s.value}</Text>
                <Text className="stat-label">{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Tab 切换区 */}
      <PageScrollContainer className="profile-scroll">
        <View className="tabs-container">
          {TABS.map((tab) => (
            <View
              key={tab.key}
              className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => handleTabClick(tab)}
            >
              <Text>
                {tab.label}
                {tab.count !== null ? <Text className="tab-count"> {tab.count}</Text> : null}
              </Text>
            </View>
          ))}
        </View>

        <View className="games-section">
          {activeTab === 'works'     && renderGameList(publishedGames, 'empty-icon--works', '还没有发布的游戏作品')}
          {activeTab === 'drafts'    && renderGameList(draftGames, 'empty-icon--drafts', '还没有草稿作品')}
          {activeTab === 'liked'     && renderGameList(likedGames, 'empty-icon--liked', '你还没有点赞过游戏', false, false)}
          {activeTab === 'bookmarks' && renderGameList(normalizedBookmarkedGames, 'empty-icon--bookmarks', '还没有收藏的游戏', false, false)}
          {activeTab === 'tasks'     && renderTaskPanel()}
        </View>

        <View className="bottom-spacer" />
      </PageScrollContainer>

      {moreGame && (
        <MoreMenu
          game={moreGame}
          onClose={() => setMoreGame(null)}
          onShare={() => handleShare(moreGame)}
          onPublish={() => handlePublish(moreGame)}
          onOptimize={() => handleOptimize(moreGame)}
          onDelete={() => handleDelete(moreGame)}
          onSettings={() => handleSettings(moreGame)}
        />
      )}

      {settingsGame && (
        <VisibilityModal
          game={settingsGame}
          onClose={() => setSettingsGame(null)}
          onSave={handleSaveSettings}
        />
      )}

      {editProfile && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditProfile(false)}
          onSave={(updated) => {
            setProfile((prev) => ({ ...prev, ...updated }));
            setEditProfile(false);
          }}
        />
      )}

      <CustomTabBar activeIndex={4} />
      <GlobalGamePlayer />
      <PaywallPopup />
    </View>
  );
}
