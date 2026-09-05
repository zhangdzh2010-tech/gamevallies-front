import React, { useEffect, useRef, useState } from 'react';
import { publishGame } from '../../services/game';
import { buildGameDetailPath } from '../../utils/share';
import { openIteratePageWithAuth } from '../../utils/authNavigation';
import { PaywallPopup } from '../common/PaywallPopup';
import CreativeShell, { CreativeIcon } from './CreativeShell';
import WorkPreview from './WorkPreview';

export default function CreativeStudio({
  mode = 'create', title = '', onTitleChange, orientation = 'landscape', onOrientationChange,
  input = '', onInputChange, session, work, generating = false, progress, loading = false,
  error = '', primary, secondary = [], onCancel, onNew, canPlay = true, onUnlock,
  quotaText = '', supplemental = null,
}) {
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [published, setPublished] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const dialog = useRef(null);
  const actionRef = useRef(false);
  const previousPlayable = useRef(null);
  useEffect(() => { setPublished(work?.status === 'published'); setShareUrl(work?.status === 'published' ? `${window.location.origin}${window.location.pathname}#${buildGameDetailPath(work.id)}` : ''); setPublishError(''); }, [work?.id, work?.status]);
  const editable = !generating && !loading;
  const completed = Boolean(work?.id && ['ready', 'draft', 'published', 'review', 'completed'].includes(work.status));
  if (completed) previousPlayable.current = work;
  if (previousPlayable.current?.id !== work?.id) previousPlayable.current = null;
  const previewWork = completed ? work : previousPlayable.current;
  const pct = Number(progress?.pct);
  const displayTitle = title || work?.title || '新的创意';
  async function publish() {
    if (!work?.id || actionRef.current) return;
    actionRef.current = true; setPublishing(true); setPublishError('');
    try {
      const result = await publishGame(work.id, { visibility: 'public' });
      // A successful request can enter moderation; do not invent a public result.
      const status = result?.status || result?.game?.status;
      if (status === 'published') {
        setPublished(true);
        setShareUrl(`${window.location.origin}${window.location.pathname}#${buildGameDetailPath(work.id)}`);
      } else setPublishError('发布请求已提交，请在我的作品中查看审核与发布状态。');
    } catch (err) { setPublishError(err?.message || '发布失败，请稍后重试。'); }
    finally { actionRef.current = false; setPublishing(false); }
  }
  return <CreativeShell studio title={displayTitle} active="works" actions={<><span className="cw-save-state">{generating ? '正在创作' : loading ? '正在恢复' : session?.sessionId ? '创作描述已保存' : work?.id ? '作品已保存' : '描述尚未提交'}</span><button className="cw-button cw-primary" disabled={!completed || generating || loading} onClick={() => dialog.current?.showModal()}>{published ? '分享作品' : '发布作品'}<CreativeIcon name="arrow" /></button></>}>
    <main className="cw-studio"><section className="cw-conversation"><div className="cw-panelhead"><strong>创作对话</strong><span className="cw-badge">{mode === 'iterate' ? '继续完善' : session ? '确认方向' : '新的创意'}</span></div><div className="cw-conversation-body">
      <div className="cw-assistant"><span className="cw-mark">G</span><strong>GameVallies</strong></div>
      <p className="cw-reply">{mode === 'iterate' ? '想让这件作品发生怎样的变化？描述这一轮要调整的内容，确认方向后再开始。' : '从一个现象、一条规律，或者一种想象开始。我们一起把它变成可以探索的作品。'}</p>
      {session?.initialPrompt && <div className="cw-user-message">{session.initialPrompt}</div>}
      {session?.currentQuestion && <div className="cw-reply">{session.currentQuestion.prompt || session.currentQuestion.content}</div>}
      {generating && <div className="cw-progress" role="status"><strong>{progress?.stageLabel || '正在构建你的作品'}</strong><p>{progress?.message || '任务仍在运行，最新状态会自动更新。'}</p>{Number.isFinite(pct) && <><progress max="100" value={Math.max(0, Math.min(100, pct))} /><span>{Math.round(pct)}%</span></>}<small>可以离开此页面，稍后从任务中心继续查看。</small>{onCancel && <button className="cw-button cw-outline" onClick={onCancel}>停止本轮创作</button>}</div>}
      {loading && <p role="status">正在恢复你的创作状态…</p>}
      {error && <div className="cw-error" role="alert">{error}</div>}
      {completed && !generating && <div className="cw-ready"><strong>一个可体验的版本已经就绪。</strong><p>观察它如何运作，再决定下一步要调整什么。</p>{mode === 'create' && <button className="cw-button cw-outline" onClick={() => openIteratePageWithAuth(work, work.id)}>继续完善这件作品 →</button>}</div>}
      {supplemental}
    </div><div className="cw-composer"><label htmlFor="creative-description">{session ? '确认或修改创作方向' : mode === 'iterate' ? '这一轮想改什么？' : '描述你的创意'}</label><textarea id="creative-description" value={input} onChange={e => onInputChange?.(e.target.value)} disabled={!editable} maxLength={4000} placeholder="想呈现什么现象？希望体验者可以调整什么、观察什么？" /><div className="cw-composer-actions"><span>先确认方向，再开始创作</span><button className="cw-button cw-primary" disabled={!editable || primary?.disabled || !primary} onClick={primary?.onClick}>{primary?.label || '确认方向'}</button></div><div className="cw-secondary-actions">{secondary.map(action => <button key={action.key} disabled={!editable || action.disabled} onClick={action.onClick}>{action.label}</button>)}</div></div></section>
    <section className="cw-stage"><WorkPreview work={previewWork} canPlay={canPlay} onUnlock={onUnlock} busy={loading || generating} /><div className="cw-stage-note"><span className="cw-badge">交互创意</span><div><strong>让创意继续生长</strong><p>探索、观察、调整。让每一轮创作更接近你的想法。</p></div></div></section>
    <aside className="cw-inspector"><div className="cw-panelhead"><strong>作品设置</strong></div><section><h4>基本信息</h4><label htmlFor="creative-title">作品名称</label><input id="creative-title" value={displayTitle === '新的创意' ? '' : displayTitle} placeholder="为创意取个名字" onChange={e => onTitleChange?.(e.target.value)} disabled={!onTitleChange || !editable || Boolean(session?.sessionId)} /><label htmlFor="creative-layout">呈现比例</label><select id="creative-layout" value={orientation} disabled={!onOrientationChange || !editable || Boolean(session?.sessionId)} onChange={e => onOrientationChange?.(e.target.value)}><option value="landscape">横向 · 适合桌面探索</option><option value="portrait">纵向 · 适合过程展示</option></select></section><section><h4>创作提示</h4><p>说明你关注的现象、可调整的参数和希望观察的结果。</p><p>涉及科学规律时，让作品标注模型、单位与简化假设。</p></section><section><h4>当前版本</h4><strong>{work?.version ? `v${work.version}` : '尚未生成'}</strong><p>{work?.version ? '当前保存的作品版本。' : '完成创作后显示真实版本。'}</p></section>{quotaText && <section><h4>账户额度</h4><p>{quotaText}</p></section>}{onNew && <section><button className="cw-button cw-outline" disabled={!editable} onClick={onNew}>开启新的创意</button></section>}</aside>
    </main>
    <dialog ref={dialog} className="cw-dialog cw-publish-dialog"><div className="cw-dialog-head"><div><div className="cw-eyebrow">SHARE YOUR CREATION</div><h2>让更多人，走进你的创意。</h2></div><button className="cw-icon-button" disabled={publishing} aria-label="关闭" onClick={() => dialog.current?.close()}><CreativeIcon name="close" /></button></div><div className="cw-publish-body"><h3>{work?.title || displayTitle}</h3><p>公开发布后，作品会按平台的访问与审核规则展示。</p>{publishError && <div className="cw-error" role="status">{publishError}</div>}{shareUrl && <label>作品分享地址<input value={shareUrl} readOnly onFocus={e => e.target.select()} /></label>}</div><div className="cw-dialog-foot"><span>{shareUrl ? '复制地址，即可分享作品。' : '确认后将提交真实发布请求。'}</span><button className="cw-button cw-primary" disabled={publishing || Boolean(shareUrl)} onClick={publish}>{publishing ? '正在发布…' : shareUrl ? '已发布' : '确认公开发布'}</button></div></dialog>
    <PaywallPopup />
  </CreativeShell>;
}
