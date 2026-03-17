import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Textarea } from '@tarojs/components';
import { CustomTabBar } from '../../components/common/CustomTabBar';
import { GlobalGamePlayer } from '../../components/common/GamePlayer';
import { Storage } from '../../utils/storage';
import * as authService from '../../services/auth';
import * as gameService from '../../services/game';
import * as socialService from '../../services/social';
import useGamePlayerStore from '../../stores/gamePlayer';
import Taro from '@tarojs/taro';
import './index.scss';

const BOOKMARK_KEY = 'gv_bookmarks';

const GAME_COLORS = ['#6e56ff', '#2dd4a8', '#fbbf24', '#ff5c8a'];
const GAME_EMOJIS = ['🎮', '🚀', '🎵', '💎', '🐦', '🎣', '🧩', '🎯'];
const PUBLISHED_STATUSES = ['published', 'review'];
// 'ready' is how the API presents 'draft' games (presenter mapping: draft → ready)
const DRAFT_STATUSES = ['ready', 'draft', 'generating', 'failed', 'banned'];

function normalizeGame(game, index) {
  return {
    ...game,
    title: game.title || `游戏 ${String(game.id || '').slice(0, 6)}`,
    emoji: game.emoji || GAME_EMOJIS[index % GAME_EMOJIS.length],
    color: game.color || GAME_COLORS[index % GAME_COLORS.length],
    author: game.author?.username || game.author || '我',
    authorEmoji: game.authorEmoji || '👤',
    isHot: (game.plays || 0) > 10000,
  };
}

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return String(num);
}

const STATUS_CONFIG = {
  generating: { label: 'AI生成中', color: '#fbbf24' },
  review:     { label: '审核中',   color: '#6e56ff' },
  failed:     { label: '生成失败', color: '#ff5c8a' },
  banned:     { label: '已封禁',   color: '#ff5c8a' },
  draft:      { label: '草稿',     color: '#8b87a3' },
  ready:      { label: '待发布',   color: '#2dd4a8' },
  published:  { label: '已发布',   color: '#2dd4a8' },
};

function StatusBadge({ status }) {
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <View className="status-badge" style={{ background: `${s.color}22`, border: `1px solid ${s.color}55` }}>
      <Text style={{ color: s.color }}>{s.label}</Text>
    </View>
  );
}

function ProfileGameCard({ game, onPlay, onMore, onLike, onComment, onBookmark, initialBookmarked }) {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(game.likes || 0);
  const [isBookmarked, setIsBookmarked] = useState(!!initialBookmarked);

  const handleLike = (e) => {
    e.stopPropagation();
    setIsLiked(!isLiked);
    setLikeCount(isLiked ? likeCount - 1 : likeCount + 1);
    onLike && onLike(game.id);
  };

  const handleBookmark = (e) => {
    e.stopPropagation();
    const next = !isBookmarked;
    setIsBookmarked(next);
    onBookmark && onBookmark(game.id, next);
  };

  return (
    <View className="profile-game-card">
      <View
        className="pgc-preview"
        onClick={() => onPlay && onPlay(game)}
        style={{ background: `linear-gradient(135deg, ${game.color}20 0%, ${game.color}40 100%)` }}
      >
        <Text className="pgc-emoji">{game.emoji}</Text>
        {game.isHot && <View className="hot-badge">🔥 热门</View>}
        <View className="pgc-status-wrap">
          <StatusBadge status={game.status} />
        </View>
      </View>

      <View className="pgc-body">
        <Text className="pgc-title" onClick={() => onPlay && onPlay(game)}>{game.title}</Text>
        <View className="pgc-actions">
          <View className="pgc-action" onClick={handleLike}>
            <Text className={`pgc-action-icon ${isLiked ? 'liked' : ''}`}>👍</Text>
            <Text className={`pgc-action-count ${isLiked ? 'liked' : ''}`}>{formatNumber(likeCount)}</Text>
          </View>
          <View className="pgc-action" onClick={(e) => { e.stopPropagation(); onComment && onComment(game); }}>
            <Text className="pgc-action-icon">💬</Text>
            <Text className="pgc-action-count">{formatNumber(game.comments || 0)}</Text>
          </View>
          <View className="pgc-action" onClick={handleBookmark}>
            <Text className={`pgc-action-icon ${isBookmarked ? 'bookmarked' : ''}`}>{isBookmarked ? '⭐' : '☆'}</Text>
          </View>
          <View className="pgc-action pgc-more-btn" onClick={(e) => { e.stopPropagation(); onMore && onMore(game); }}>
            <Text className="pgc-more-dots">•••</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function MoreMenu({ game, onClose, onShare, onOptimize, onDelete, onSettings }) {
  return (
    <View className="more-overlay" onClick={onClose}>
      <View className="more-menu" onClick={(e) => e.stopPropagation()}>
        <View className="more-header">
          <Text className="more-game-name">{game.title}</Text>
        </View>
        <View className="more-item" onClick={onShare}>
          <Text className="more-icon">🔗</Text>
          <Text className="more-label">分享游戏</Text>
          <Text className="more-arrow">›</Text>
        </View>
        <View className="more-divider" />
        <View className="more-item" onClick={onOptimize}>
          <Text className="more-icon">🎯</Text>
          <Text className="more-label">优化游戏</Text>
          <Text className="more-arrow">›</Text>
        </View>
        <View className="more-divider" />
        <View className="more-item" onClick={onSettings}>
          <Text className="more-icon">🔒</Text>
          <Text className="more-label">权限设置</Text>
          <Text className="more-arrow">›</Text>
        </View>
        <View className="more-divider" />
        <View className="more-item danger" onClick={onDelete}>
          <Text className="more-icon">🗑️</Text>
          <Text className="more-label">删除游戏</Text>
          <Text className="more-arrow">›</Text>
        </View>
        <View className="more-cancel" onClick={onClose}>
          <Text>取消</Text>
        </View>
      </View>
    </View>
  );
}

const OPTIMIZE_HINTS = ['增加音效', '优化关卡设计', '增加障碍物', '改进视觉效果', '增加难度曲线', '优化操控手感'];

function OptimizeModal({ game, onClose, onSubmit }) {
  const [feedback, setFeedback] = useState('');
  const maxLen = 500;

  const handleHint = (hint) => {
    setFeedback((prev) => {
      const joined = prev ? `${prev}，${hint}` : hint;
      return joined.slice(0, maxLen);
    });
  };

  return (
    <View className="modal-overlay" onClick={onClose}>
      <View className="optimize-modal" onClick={(e) => e.stopPropagation()}>
        <Text className="modal-title">优化游戏</Text>
        <Text className="optimize-game-name">{game.title}</Text>

        <Text className="optimize-hint-label">快捷选项</Text>
        <View className="optimize-hints">
          {OPTIMIZE_HINTS.map((h) => (
            <View key={h} className="hint-chip" onClick={() => handleHint(h)}>
              <Text>{h}</Text>
            </View>
          ))}
        </View>

        <Text className="optimize-hint-label">描述你的优化想法</Text>
        <Textarea
          className="optimize-textarea"
          value={feedback}
          onInput={(e) => setFeedback(e.detail.value.slice(0, maxLen))}
          placeholder="例如：增加背景音乐、改变游戏速度、添加新关卡..."
          maxlength={maxLen}
          autoHeight
        />
        <Text className="optimize-counter">{feedback.length}/{maxLen}</Text>

        <View className="modal-actions">
          <View className="modal-btn cancel" onClick={onClose}><Text>取消</Text></View>
          <View
            className={`modal-btn confirm ${!feedback.trim() ? 'disabled' : ''}`}
            onClick={() => feedback.trim() && onSubmit(feedback.trim())}
          >
            <Text>开始优化</Text>
          </View>
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
    { value: 'public',  icon: '🌐', label: '公开',   desc: '所有人均可查看' },
    { value: 'friends', icon: '👥', label: '好友可见', desc: '仅互关好友可查看' },
    { value: 'private', icon: '🔒', label: '仅自己',  desc: '只有自己可以看到' },
  ];

  return (
    <View className="modal-overlay" onClick={onClose}>
      <View className="visibility-modal" onClick={(e) => e.stopPropagation()}>
        <Text className="modal-title">权限设置</Text>

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
              <Text className="toggle-desc">其他用户可以复刻并修改你的游戏</Text>
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

export default function Profile() {
  const openGame = useGamePlayerStore((s) => s.openGame);
  const [activeTab, setActiveTab] = useState('works');
  const [profile, setProfile] = useState({
    name: '', avatar: '👤', bio: '',
    followers: 0, following: 0, totalLikes: 0, mutualFollows: 0,
  });
  const [allGames, setAllGames] = useState([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [moreGame, setMoreGame] = useState(null);
  const [settingsGame, setSettingsGame] = useState(null);
  const [optimizeGame, setOptimizeGame] = useState(null);
  const [bookmarkedIds, setBookmarkedIds] = useState(() => {
    try { return JSON.parse(Taro.getStorageSync(BOOKMARK_KEY) || '[]'); } catch { return []; }
  });

  const { windowHeight = 750 } = Taro.getSystemInfoSync();
  const scrollViewHeight = windowHeight - 340 - 120;

  const publishedGames = allGames.filter((g) => PUBLISHED_STATUSES.includes(g.status));
  const draftGames = allGames.filter((g) => DRAFT_STATUSES.includes(g.status));

  useEffect(() => {
    const token = Storage.getToken();
    if (!token) {
      Taro.showToast({ title: '请先登录', icon: 'none', duration: 1500 });
      setTimeout(() => Taro.navigateTo({ url: '/pages/login/index' }), 500);
      return;
    }

    const storedUser = Storage.getUser();
    if (storedUser) {
      setProfile((prev) => ({
        ...prev,
        name: storedUser.username || storedUser.displayName || '用户',
        bio: storedUser.bio || '这个人很懒，什么都没写',
      }));
    }

    authService.getMe().then((user) => {
      if (user) {
        setProfile((prev) => ({
          ...prev,
          name: user.username || user.displayName || prev.name,
          bio: user.bio || prev.bio,
          followers: user.followerCount || 0,
          following: user.followingCount || 0,
          mutualFollows: user.mutualFollowCount || 0,
        }));
      }
    }).catch(() => {});

    fetchMyGames();
  }, []);

  const fetchMyGames = async () => {
    setLoadingGames(true);
    try {
      const result = await gameService.getMyGames(1, 50);
      const items = (result?.items || []).map(normalizeGame);
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
    if (game.gameUrl) openGame(game.gameUrl, game.title);
  };

  const handleLike = (gameId) => {
    socialService.likeGame('game', gameId).catch(() => {});
  };

  const handleCommentLike = (commentId) => {
    socialService.likeComment(commentId).catch(() => {});
  };

  const handleComment = (game) => {
    Taro.showToast({ title: '评论功能开发中', icon: 'none' });
  };

  const handleBookmark = (gameId, isNowBookmarked) => {
    setBookmarkedIds((prev) => {
      const next = isNowBookmarked
        ? [...new Set([...prev, gameId])]
        : prev.filter((id) => id !== gameId);
      try { Taro.setStorageSync(BOOKMARK_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const handleOptimize = (game) => {
    setMoreGame(null);
    setOptimizeGame(game);
  };

  const handleOptimizeSubmit = async (feedback) => {
    const game = optimizeGame;
    setOptimizeGame(null);
    Taro.showToast({ title: 'AI 优化中...', icon: 'loading', duration: 3000 });
    try {
      await gameService.iterateGame(game.id, feedback);
      Taro.showToast({ title: '优化任务已提交，请稍后查看草稿箱', icon: 'success', duration: 2500 });
      setTimeout(() => { setActiveTab('drafts'); fetchMyGames(); }, 2600);
    } catch {
      Taro.showToast({ title: '提交失败，请重试', icon: 'none' });
    }
  };

  const handleShare = async (game) => {
    const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/pages/game/play/index?id=${game.id}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: game.title, url: shareUrl });
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        Taro.showToast({ title: '链接已复制到剪贴板', icon: 'success' });
      } else {
        Taro.showModal({ title: '分享链接', content: shareUrl, showCancel: false });
      }
    } catch {
      Taro.showModal({ title: '分享链接', content: shareUrl, showCancel: false });
    }
    setMoreGame(null);
  };

  const handleDelete = (game) => {
    setMoreGame(null);
    Taro.showModal({
      title: '删除游戏',
      content: `确定要删除「${game.title}」吗？删除后无法恢复。`,
      confirmColor: '#ff5c8a',
      success: async (res) => {
        if (res.confirm) {
          try {
            await gameService.deleteGame(game.id);
            setAllGames((prev) => prev.filter((g) => g.id !== game.id));
            Taro.showToast({ title: '已删除', icon: 'success' });
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
      content: '确定要退出登录吗？',
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

  const renderGameList = (games, emptyIcon, emptyText, showCreate = true) => {
    if (loadingGames) {
      return <View className="empty-state"><Text className="empty-text">加载中...</Text></View>;
    }
    if (!games.length) {
      return (
        <View className="empty-state">
          <Text className="empty-icon">{emptyIcon}</Text>
          <Text className="empty-text">{emptyText}</Text>
          {showCreate && (
            <View className="empty-action" onClick={() => Taro.switchTab({ url: '/pages/create/index' })}>
              <Text>去创作</Text>
            </View>
          )}
        </View>
      );
    }
    return (
      <View className="games-list">
        {games.map((game) => (
          <ProfileGameCard
            key={game.id}
            game={game}
            onPlay={handlePlay}
            onMore={setMoreGame}
            onLike={handleLike}
            onComment={handleComment}
            onBookmark={handleBookmark}
            initialBookmarked={bookmarkedIds.includes(game.id)}
          />
        ))}
      </View>
    );
  };

  const bookmarkedGames = allGames.filter((g) => bookmarkedIds.includes(g.id));

  const TABS = [
    { key: 'works',     label: '游戏作品', count: publishedGames.length },
    { key: 'drafts',    label: '草稿箱',   count: draftGames.length },
    { key: 'liked',     label: '赞过',     count: null },
    { key: 'bookmarks', label: '收藏',     count: bookmarkedGames.length || null },
  ];

  const stats = [
    { value: formatNumber(profile.totalLikes),   label: '获赞' },
    { value: formatNumber(profile.following),     label: '关注' },
    { value: formatNumber(profile.followers),     label: '粉丝' },
    { value: formatNumber(profile.mutualFollows), label: '互关' },
  ];

  return (
    <View className="profile-container">
      <View className="profile-header">
        <View className="header-top">
          <Text className="avatar">{profile.avatar || '👤'}</Text>
          <View className="header-actions">
            <View className="edit-btn" onClick={() => Taro.showToast({ title: '编辑功能开发中', icon: 'none' })}>
              编辑资料
            </View>
            <View className="logout-btn" onClick={handleLogout}>退出</View>
          </View>
        </View>

        <View className="user-info">
          <Text className="user-name">{profile.name || '用户'}</Text>
          <Text className="user-bio">{profile.bio || '这个人很懒，什么都没写'}</Text>
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

      <ScrollView className="profile-scroll" style={{ height: `${scrollViewHeight}px` }} scrollY>
        <View className="tabs-container">
          {TABS.map((tab) => (
            <View
              key={tab.key}
              className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Text>
                {tab.label}
                {tab.count !== null ? <Text className="tab-count"> {tab.count}</Text> : null}
              </Text>
            </View>
          ))}
        </View>

        <View className="games-section">
          {activeTab === 'works'     && renderGameList(publishedGames, '🎮', '还没有发布的游戏作品')}
          {activeTab === 'drafts'    && renderGameList(draftGames, '📝', '草稿箱空空如也')}
          {activeTab === 'liked'     && (
            <View className="empty-state">
              <Text className="empty-icon">♥</Text>
              <Text className="empty-text">暂无赞过的游戏</Text>
            </View>
          )}
          {activeTab === 'bookmarks' && renderGameList(bookmarkedGames, '⭐', '还没有收藏任何游戏', false)}
        </View>

        <View className="additional-info">
          <View className="info-section">
            <Text className="section-title">设置</Text>
            <View className="info-item">
              <Text className="info-label">推送通知</Text>
              <Text className="info-value">已启用</Text>
            </View>
            <View className="info-item">
              <Text className="info-label">暗黑主题</Text>
              <Text className="info-value">已启用</Text>
            </View>
          </View>
          <View className="info-section">
            <Text className="section-title">关于</Text>
            <View className="info-item">
              <Text className="info-label">版本</Text>
              <Text className="info-value">1.0.0</Text>
            </View>
          </View>
        </View>

        <View className="bottom-spacer" />
      </ScrollView>

      {moreGame && (
        <MoreMenu
          game={moreGame}
          onClose={() => setMoreGame(null)}
          onShare={() => handleShare(moreGame)}
          onOptimize={() => handleOptimize(moreGame)}
          onDelete={() => handleDelete(moreGame)}
          onSettings={() => handleSettings(moreGame)}
        />
      )}

      {optimizeGame && (
        <OptimizeModal
          game={optimizeGame}
          onClose={() => setOptimizeGame(null)}
          onSubmit={handleOptimizeSubmit}
        />
      )}

      {settingsGame && (
        <VisibilityModal
          game={settingsGame}
          onClose={() => setSettingsGame(null)}
          onSave={handleSaveSettings}
        />
      )}

      <CustomTabBar activeIndex={4} />
      <GlobalGamePlayer />
    </View>
  );
}
