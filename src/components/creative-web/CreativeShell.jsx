import React from 'react';
import Taro from '@tarojs/taro';
import { Storage } from '../../utils/storage';
import { isLoggedIn, openCreatePageWithAuth, openProfilePageWithTab } from '../../utils/authNavigation';
import useQuotaStore from '../../stores/quotaStore';
import { getQuotaSummary } from '../../utils/quotaSummary';
import { setCreativeView } from './creativeModel';
import './creative-web.scss';

const paths = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  folder: <path d="M3 7V5h7l3 3h8v12H3Z" />,
  spark: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  play: <path d="m8 5 11 7-11 7Z" />,
  back: <path d="M19 12H5m5-5-5 5 5 5" />,
  refresh: <path d="M20 9a8 8 0 1 0 0 6M20 4v5h-5" />,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  expand: <path d="M9 4H4v5m11-5h5v5M4 15v5h5m6 0h5v-5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
};
export function CreativeIcon({ name, ...props }) { return <svg className="cw-icon" viewBox="0 0 24 24" aria-hidden="true" {...props}>{paths[name] || paths.spark}</svg>; }
export function creativeNavigate(view) {
  if (view === 'friends') {
    Taro.switchTab({ url: '/pages/discover/index' });
    return;
  }
  if (view === 'messages') {
    Taro.switchTab({ url: '/pages/message/index' });
    return;
  }
  setCreativeView(view);
  Taro.switchTab({ url: '/pages/index/index' });
}
export default function CreativeShell({ children, active = 'home', title = '工作台', studio = false, actions, onNavigate }) {
  const user = Storage.getUser() || {};
  const quota = useQuotaStore() || {};
  const summary = getQuotaSummary({ freeQuota: quota.freeQuota, totalFreeQuota: quota.totalFreeQuota, subscription: quota.subscription });
  const navigate = onNavigate || creativeNavigate;
  const name = user.displayName || user.nickname || user.username || '创作者';
  return <div className={`creative-web${studio ? ' cw-studio-shell' : ''}`}>
    <aside className="cw-sidebar">
      <button className="cw-brand" onClick={() => navigate('home')} aria-label="返回创意工作台"><span className="cw-mark">G</span><span>GameVallies</span></button>
      <button className="cw-button cw-primary cw-new" onClick={() => openCreatePageWithAuth({ mode: 'fresh' })}><CreativeIcon name="plus" /><span>新建创意</span></button>
      <div className="cw-nav-label">创作空间</div>
      {[['home', 'grid', '工作台'], ['works', 'folder', '我的作品'], ['ideas', 'spark', '创意灵感']].map(([id, icon, label]) => <button className={`cw-nav ${active === id ? 'active' : ''}`} key={id} onClick={() => navigate(id)} title={label}><CreativeIcon name={icon} /><span>{label}</span></button>)}
      <div className="cw-nav-label">社区</div>
      {[['friends', 'users', '朋友作品'], ['messages', 'bell', '消息通知']].map(([id, icon, label]) => <button className={`cw-nav ${active === id ? 'active' : ''}`} key={id} onClick={() => navigate(id)} title={label}><CreativeIcon name={icon} /><span>{label}</span></button>)}
      <div className="cw-sidebar-bottom">
        {isLoggedIn() && <div className="cw-quota"><div className="cw-between"><span>创作额度</span><span className="cw-badge">{quota.subscription?.active ? '会员' : '免费'}</span></div><strong>{quota.loading ? '…' : summary.totalRemaining}<small> 次可用</small></strong><p>按当前账户额度展示</p><button onClick={() => Taro.navigateTo({ url: '/pages/subscription/index' })}>查看用量与订阅 →</button></div>}
        <button className={`cw-nav ${active === 'tasks' ? 'active' : ''}`} onClick={() => openProfilePageWithTab('tasks')} title="任务中心"><CreativeIcon name="refresh" /><span>任务中心</span></button>
        <button className="cw-account" onClick={() => isLoggedIn() ? openProfilePageWithTab('works') : Taro.navigateTo({ url: '/pages/login/index' })}><span className="cw-avatar">{isLoggedIn() ? name.slice(0, 1) : '访'}</span><span><strong>{isLoggedIn() ? name : '登录 / 注册'}</strong><small>{isLoggedIn() ? '我的创作空间' : '保存并延续你的创意'}</small></span></button>
      </div>
    </aside>
    <div className="cw-content"><header className="cw-topbar"><div className="cw-row">{studio && <button className="cw-icon-button" onClick={() => navigate('home')} aria-label="返回工作台"><CreativeIcon name="back" /></button>}<span className="cw-breadcrumb">创作空间 <b>/</b> <strong>{title}</strong></span></div><div className="cw-row">{actions || <span className="cw-desktop-label">CREATIVE STUDIO / WEB</span>}</div></header>{children}</div>
  </div>;
}
