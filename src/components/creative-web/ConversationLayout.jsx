import React, { useEffect, useState } from 'react';
import Taro, { useDidShow } from '@tarojs/taro';
import { getMyGames } from '../../services/game';
import { Storage } from '../../utils/storage';
import { isLoggedIn, openCreatePageWithAuth, openIteratePageWithAuth, openTaskCreatePageWithAuth, openProfilePageWithTab } from '../../utils/authNavigation';
import useQuotaStore from '../../stores/quotaStore';
import { getQuotaSummary } from '../../utils/quotaSummary';
import { creativeNavigate, CreativeIcon } from './CreativeShell';
import { normalizeWorks } from './creativeModel';
import styles from './conversationStyles';
import FailedWorkDialog, { isFailedWork } from './FailedWorkDialog';

export function ConversationIcon({ name, ...props }) { return <CreativeIcon name={name} className="icon" {...props} />; }
export default function ConversationLayout({ children, title, actions, workId, onNew, onOpenWork, navigation, active = 'home' }) {
  const loggedIn = isLoggedIn();
  const user = loggedIn ? Storage.getUser() || {} : {};
  const userId = user.id || user.userId || user.username || '';
  const [history, setHistory] = useState([]);
  const [failedWork, setFailedWork] = useState(null);
  const [historyError, setHistoryError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const quota = useQuotaStore();
  const summary = getQuotaSummary(quota);
  useDidShow(() => { setRefresh(v => v + 1); });
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
    const task = item.generationTaskId || item.taskId;
    if (task && ['generating', 'failed', 'canceled', 'cancelled'].includes(item.status)) openTaskCreatePageWithAuth(task, item.id, item.taskType || 'pipeline_run');
    else openIteratePageWithAuth(item, item.id);
  };
  return <div className="conversation-app">
    <div className="creative-web" style={{minHeight:0}}><FailedWorkDialog work={failedWork} onClose={() => setFailedWork(null)} /></div>
    <style>{styles}</style>
    <style>{`.conversation-app{min-height:100vh}.conversation-app .main{width:auto}.conversation-app .icon{fill:none;stroke:currentColor}.conversation-app .feed{padding-top:26px}.conversation-app .composer-caption{min-height:15px}.conversation-app .composer-tools{flex-wrap:wrap}.conversation-app .secondary-actions{display:flex;gap:12px;font-size:11px;align-items:center}.conversation-app .secondary-actions button{font-size:11px;color:var(--green)}.conversation-app .composer-tools .tools-left{flex-wrap:wrap}.conversation-app .composer-title{width:160px;border:0;background:var(--soft);border-radius:6px;font-size:11px;padding:5px 8px;color:var(--ink)}.conversation-app .composer-message{font-size:10px;color:var(--muted);padding-bottom:7px}.conversation-app .dialog-input{display:block;width:100%;border:1px solid var(--line);border-radius:8px;padding:10px;margin:10px 0 20px}.conversation-app .work-player{width:100%;height:330px;border:0;background:white;display:block}.conversation-app .preview-placeholder{min-height:250px;display:grid;place-content:center;text-align:center;padding:25px;background:#f6f8ee}.conversation-app .preview-placeholder h2{font:26px/1.4 Georgia,'Songti SC',serif;margin:10px}.conversation-app .preview-placeholder p{color:var(--muted);font-size:12px}.conversation-app .preview-placeholder img{max-width:100%;max-height:200px;object-fit:contain;margin:auto}.conversation-app .preview-placeholder .btn{margin:15px auto 0;width:max-content}.conversation-app dialog .work-player{height:min(65vh,640px)}.conversation-app .alert{padding:15px;background:#fff5eb;color:#916a42;border-radius:9px;font-size:12px;margin:10px 0}.conversation-app .history-empty{font-size:11px;color:var(--muted);padding:8px 12px}.conversation-app .secondary-actions .primary-label{color:var(--muted)}.conversation-app .session-label{overflow:hidden;text-overflow:ellipsis}.conversation-app .supplemental{font-size:12px;padding:15px;border:1px solid var(--line);border-radius:10px;margin:15px 0}.conversation-app .supplemental button{border:1px solid var(--line);border-radius:6px;padding:6px 10px;margin:5px;background:white}.conversation-app .state-note{color:var(--muted);font-size:11px}.conversation-app .session-date{font-size:10px;color:var(--muted);margin-left:auto}.conversation-app .work-placeholder-note{font-size:10px;color:var(--muted)}@media(min-width:761px) and (max-height:900px){.conversation-app .feed{padding-top:26px}.conversation-app .work-player{height:240px}.conversation-app .preview-placeholder{min-height:220px}}`}</style>
    <aside className="sidebar"><button className="brand" onClick={() => navigate('home')} aria-label="返回智了空间工作台"><span className="brand-mark">智</span>智了空间</button>
      <button className="new" onClick={onNew || (() => openCreatePageWithAuth({ mode: 'fresh' }))}><ConversationIcon name="plus" />开启新的创意</button>
      <nav aria-label="主导航">{[['home','spark','创作空间'],['ideas','grid','发现灵感'],['square','users','创意广场'],['works','folder','我的作品']].map(([id, icon, label]) => <button key={id} className={`nav${active===id?' active':''}`} onClick={() => navigate(id)}><ConversationIcon name={icon}/>{label}</button>)}</nav>
      <div className="section-label">创作会话<button onClick={() => setRefresh(v => v+1)} aria-label="刷新创作会话">↻</button></div>
      {history.map(item => <button className={`session${item.id===workId?' selected':''}`} key={item.id} onClick={() => open(item)}><span className="thumb"><ConversationIcon name="spark" style={{width:14,height:14}}/></span><span className="session-label">{item.title || '未命名作品'}</span><small>{item.status==='generating'?'进行中':item.status==='failed'?'失败':''}</small></button>)}
      {!history.length && <p className="history-empty">{historyError?'会话暂时无法加载，请刷新重试。':loggedIn?'你的创作会话将保存在这里。':'登录后，继续你的创作会话。'}</p>}
      <div className="sidebar-bottom"><div className="quota">{loggedIn ? <><span>可用创作额度</span><strong style={{float:'right'}}>{quota.loading?'…':summary.totalRemaining}<small style={{fontSize:10,fontWeight:400}}> 次</small></strong><p>让下一个想法，继续发生。</p><button onClick={() => Taro.navigateTo({url:'/pages/subscription/index'})}>查看用量与订阅 ↗</button></> : <span>登录后保存并延续你的创意。</span>}</div><button className="nav" onClick={() => openProfilePageWithTab('tasks')}><ConversationIcon name="refresh"/>任务中心</button><button className="account" onClick={() => loggedIn ? openProfilePageWithTab('works') : Taro.navigateTo({url:'/pages/login/index'})}><span className="avatar">{loggedIn?name.slice(0,1):'访'}</span><span>{loggedIn?name:'登录 / 注册'}<small>我的创作空间</small></span></button></div>
    </aside><div className="main"><header className="topbar"><div><div className="breadcrumb">创作空间<span>/</span>会话</div><div className="title">{title || '新的创意'}</div></div><div className="top-actions">{actions}</div></header>{children}</div>
  </div>;
}

