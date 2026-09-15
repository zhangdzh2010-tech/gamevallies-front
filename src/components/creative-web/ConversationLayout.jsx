import React, { useEffect, useState } from 'react';
import Taro from '@tarojs/taro';
import { getMyGames } from '../../services/game';
import { Storage } from '../../utils/storage';
import { isLoggedIn, openCreatePageWithAuth, openIteratePageWithAuth, openTaskCreatePageWithAuth, openProfilePageWithTab } from '../../utils/authNavigation';
import useQuotaStore from '../../stores/quotaStore';
import { getQuotaSummary } from '../../utils/quotaSummary';
import { creativeNavigate, CreativeIcon } from './CreativeShell';
import { normalizeWorks } from './creativeModel';
import styles from './conversationStyles';
import FailedWorkDialog, { isFailedWork } from './FailedWorkDialog';
import { BrandMarkImg } from '../common/BrandMark';

export function ConversationIcon({ name, ...props }) { return <CreativeIcon name={name} className="icon" {...props} />; }
export default function ConversationLayout({ children, title, actions, workId, onNew, onOpenWork, navigation, active = 'home' }) {
  const loggedIn = isLoggedIn();
  const user = loggedIn ? Storage.getUser() || {} : {};
  const userId = user.id || user.userId || user.username || '';
  const [history, setHistory] = useState([]);
  const [failedWork, setFailedWork] = useState(null);
  const [historyError, setHistoryError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const quota = useQuotaStore((state) => state) || {};
  const summary = getQuotaSummary(quota);
  useEffect(() => {
    let activeRequest = true;
    if (!loggedIn) {
      setHistory([]);
      setHistoryError(false);
      return () => { activeRequest = false; };
    }

    getMyGames(1, 12)
      .then(result => { if (activeRequest) { setHistory(normalizeWorks(result)); setHistoryError(false); } })
      .catch(() => { if (activeRequest) setHistoryError(true); });
    useQuotaStore.getState().fetchQuota(false).catch(() => {});
    return () => { activeRequest = false; };
  }, [loggedIn, userId, refresh]);
  const navigate = navigation || creativeNavigate;
  const name = user.displayName || user.nickname || user.username || '创作者';
  const open = item => {
    if (isFailedWork(item)) { setFailedWork(item); return; }
    if (item.id === workId) return;
    if (onOpenWork) { onOpenWork(item); return; }
    // In-shell Creative Home always passes onOpenWork. Do not fall through to
    // iterate/create routes while the shell is hosting navigation.
    if (navigation) return;
    const task = item.generationTaskId || item.taskId;
    if (task && ['generating', 'failed', 'canceled', 'cancelled'].includes(item.status)) openTaskCreatePageWithAuth(task, item.id, item.taskType || 'pipeline_run');
    else openIteratePageWithAuth(item, item.id);
  };
  const openTasks = () => {
    if (navigation) navigation('tasks');
    else openProfilePageWithTab('tasks');
  };
  const openAccount = () => {
    if (!loggedIn) {
      Taro.navigateTo({ url: '/pages/login/index' });
      return;
    }
    if (navigation) navigation('works');
    else openProfilePageWithTab('works');
  };
  return <div className="conversation-app">
    <div className="creative-web" style={{minHeight:0}}><FailedWorkDialog work={failedWork} onClose={() => setFailedWork(null)} /></div>
    <style>{styles}</style>
    <style>{`.conversation-app{min-height:100vh}.conversation-app .conversation-embed-actions{display:flex;justify-content:flex-end;gap:10px;padding:12px 40px 0}.conversation-app .main{width:auto}.conversation-app .icon{fill:none;stroke:currentColor}.conversation-app .feed{padding-top:26px}.conversation-app .composer-caption{min-height:15px}.conversation-app .composer-tools{flex-wrap:wrap}.conversation-app .secondary-actions{display:flex;gap:12px;font-size:11px;align-items:center}.conversation-app .secondary-actions button{font-size:11px;color:var(--green)}.conversation-app .composer-tools .tools-left{flex-wrap:wrap}.conversation-app .composer-title{width:160px;border:0;background:var(--soft);border-radius:6px;font-size:11px;padding:5px 8px;color:var(--ink)}.conversation-app .composer-message{font-size:10px;color:var(--muted);padding-bottom:7px}.conversation-app .dialog-input{display:block;width:100%;border:1px solid var(--line);border-radius:8px;padding:10px;margin:10px 0 20px;background:#F5F7F8;color:var(--ink)}.conversation-app .cw-player-letterbox{width:100%;max-height:min(55vh,560px);max-height:min(55dvh,560px)}.conversation-app .work-player{width:100%;height:100%;border:0;background:#F0F2F5;display:block}.conversation-app .preview-placeholder{min-height:250px;display:grid;place-content:center;text-align:center;padding:25px;background:#f4f5f3;overflow:hidden}.conversation-app .preview-placeholder h2{font:600 22px/1.35 Inter,'PingFang SC','Microsoft YaHei',sans-serif;margin:10px;color:#233a34}.conversation-app .preview-placeholder p{color:#7b8880;font-size:12px}.conversation-app .preview-placeholder img{max-width:100%;max-height:min(36vh,280px);width:auto;height:auto;object-fit:contain;object-position:center;margin:auto;display:block}.conversation-app .preview-placeholder .btn{margin:15px auto 0;width:max-content}.conversation-app dialog .cw-player-letterbox{max-height:min(70vh,720px);max-height:min(70dvh,720px)}.conversation-app .alert{padding:15px;background:#FFF5F2;color:#e07a5f;border-radius:9px;font-size:12px;margin:10px 0}.conversation-app .history-empty{font-size:11px;color:var(--muted);padding:8px 12px}.conversation-app .secondary-actions .primary-label{color:var(--muted)}.conversation-app .session-label{overflow:hidden;text-overflow:ellipsis}.conversation-app .supplemental{font-size:12px;padding:15px;border:1px solid var(--line);border-radius:10px;margin:15px 0}.conversation-app .supplemental button{border:1px solid var(--line);border-radius:6px;padding:6px 10px;margin:5px;background:#FFFFFF}.conversation-app .state-note{color:var(--muted);font-size:11px}.conversation-app .session-date{font-size:10px;color:var(--muted);margin-left:auto}.conversation-app .work-placeholder-note{font-size:10px;color:var(--muted)}.conversation-app .confirm-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:6px 0 18px}.conversation-app .confirm-actions .btn.primary{min-width:156px;padding:10px 18px;font-size:13px;font-weight:650}.conversation-app .send.send-labeled{width:auto;min-width:auto;padding:0 12px;font-size:12px;font-weight:650;white-space:nowrap}@media(min-width:761px) and (max-height:900px){.conversation-app .feed{padding-top:26px}.conversation-app .cw-player-letterbox{max-height:min(42vh,420px);max-height:min(42dvh,420px)}.conversation-app .preview-placeholder{min-height:0}}.conversation-app .work-top-actions{display:flex;align-items:center;gap:6px}.conversation-app .work-stage{padding:12px 16px 14px;background:#f4f5f3}.conversation-app .play-guide-btn{display:inline-flex;align-items:center;padding:6px 10px;border:1px solid rgba(29,33,41,.08);border-radius:8px;background:#FFFFFF;color:#1D2129;font-size:11px}.conversation-app .play-guide-btn:hover,.conversation-app .play-guide-btn[aria-expanded="true"]{background:#F5F7F8}.conversation-app .play-guide-sheet{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:0 0 10px;padding:12px 14px;background:#FFFFFF;border:1px solid rgba(29,33,41,.08);border-radius:10px;box-shadow:0 1px 2px rgba(29,33,41,.04)}.conversation-app .play-guide-sheet strong{display:block;font-size:13px;font-weight:650;color:#1D2129}.conversation-app .play-guide-sheet p{margin:6px 0 0;font-size:12px;line-height:1.7;color:#86909C;white-space:pre-wrap}.conversation-app .play-guide-dismiss{padding:2px 6px;border-radius:6px;color:#86909C;font-size:16px;line-height:1}.conversation-app .play-guide-dismiss:hover{background:#F5F7F8;color:#1D2129}`}</style>
    <aside className="sidebar"><button className="brand" onClick={() => navigate('home')} aria-label="返回智了空间工作台"><BrandMarkImg className="brand-mark" />智了空间</button>
      <button className="new" onClick={onNew || (() => openCreatePageWithAuth({ mode: 'fresh' }))}><ConversationIcon name="plus" />开启新的创意</button>
      <nav aria-label="主导航">{[['home','spark','创作空间'],['ideas','grid','发现灵感'],['square','users','创意广场'],['works','folder','我的作品']].map(([id, icon, label]) => <button key={id} className={`nav${active===id?' active':''}`} onClick={() => navigate(id)}><ConversationIcon name={icon}/>{label}</button>)}</nav>
      <div className="section-label">创作会话<button onClick={() => setRefresh(v => v+1)} aria-label="刷新创作会话">↻</button></div>
      {history.map(item => <button className={`session${item.id===workId?' selected':''}`} key={item.id} onClick={() => open(item)}><span className="thumb"><ConversationIcon name="spark" style={{width:14,height:14}}/></span><span className="session-label">{item.title || '未命名作品'}</span><small>{item.status==='generating'?'进行中':item.status==='failed'?'失败':''}</small></button>)}
      {!history.length && <p className="history-empty">{historyError?'会话暂时无法加载，请刷新重试。':loggedIn?'你的创作会话将保存在这里。':'登录后，继续你的创作会话。'}</p>}
      <div className="sidebar-bottom"><div className="quota">{loggedIn ? <><span>可用创作额度</span><strong style={{float:'right'}}>{quota.loading?'…':summary.totalRemaining}<small style={{fontSize:10,fontWeight:400}}> 次</small></strong><p>让下一个想法，继续发生。</p><button onClick={() => Taro.navigateTo({url:'/pages/subscription/index'})}>查看用量与订阅 ↗</button></> : <span>登录后保存并延续你的创意。</span>}</div><button className={`nav${active==='tasks'?' active':''}`} onClick={openTasks}><ConversationIcon name="refresh"/>任务中心</button><button className="account" onClick={openAccount}><span className="avatar">{loggedIn?name.slice(0,1):'访'}</span><span>{loggedIn?name:'登录 / 注册'}<small>我的创作空间</small></span></button></div>
    </aside><div className="main"><header className="topbar"><div><div className="breadcrumb">创作空间<span>/</span>会话</div><div className="title">{title || '新的创意'}</div></div><div className="top-actions">{actions}</div></header>{children}</div>
  </div>;
}

