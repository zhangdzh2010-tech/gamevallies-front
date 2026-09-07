import React, { useRef, useState } from 'react';
import ConversationLayout, { ConversationIcon } from './ConversationLayout';
import WorkPreview from './WorkPreview';
import { openIteratePageWithAuth } from '../../utils/authNavigation';
import { CREATIVE_DOMAINS, saveIterationDraft } from './creativeModel';

export default function ConversationStudioBody({ mode, displayTitle, onTitleChange, orientation, onOrientationChange, input, onInputChange, session, work, previewWork, generating, progress, loading, error, primary, secondary, onCancel, onNew, canPlay, onUnlock, quotaText, supplemental, inputAriaLabel, completed, publishing, published, publishError, shareUrl, publish, children, home = false, navigation, format: selectedFormat, onFormatChange }) {
  const publishDialog = useRef(null), settingsDialog = useRef(null), inputRef = useRef(null);
  const [submitted, setSubmitted] = useState('');
  const [followup, setFollowup] = useState('');
  const [draftError, setDraftError] = useState('');
  const [localFormat, setLocalFormat] = useState('experiment');
  const format = selectedFormat || localFormat;
  const setFormat = next => {
    setLocalFormat(next);
    if (onFormatChange) onFormatChange(next);
    else update((value || '').replace(/\n呈现方式：[^\n]*/, '') + '\n呈现方式：' + ({experiment:'交互实验',exploration:'自由创意',explanation:'动态演示'}[next]));
  };
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const continueCreate = mode==='create' && completed;
  const busy = generating || loading || submitting;
  const value = continueCreate ? followup : input;
  const prompt = session?.initialPrompt || session?.prompt || submitted || (completed ? work?.description : '') || '';
  const empty = !prompt && !session && !previewWork && !generating && !loading && !error;
  const status = generating?'正在创作':loading?'正在恢复':error?'未完成':completed?'已完成':session?'等待确认':'新的创意';
  const pct = Number(progress?.pct);
  const update = next => { if (continueCreate) setFollowup(next); else onInputChange?.(next); };
  const focus = () => inputRef.current?.focus();
  function iterate(text = '') {
    if (text && !saveIterationDraft(work.id, text)) { setDraftError('无法保存调整描述，请检查浏览器存储权限。'); return; }
    openIteratePageWithAuth(work, work.id);
  }
  async function submit(e) {
    e?.preventDefault();
    if (busy || submitLock.current) return;
    if (continueCreate) { if(value.trim()) iterate(value.trim()); return; }
    if (!primary || primary.disabled) return;
    submitLock.current=true; setSubmitting(true); setDraftError('');
    if (value.trim()) setSubmitted(value.trim());
    try { await primary.onClick?.(); } catch(err) { setDraftError(err.message || '提交失败，请重试。'); }
    finally { submitLock.current=false; setSubmitting(false); }
  }
  const edit = () => { if(continueCreate){iterate();return;} if(prompt) update(prompt); focus(); };
  const actionLabel = continueCreate?'继续调整':primary?.label || '确认创作描述';
  const shownError=error || draftError;
  return <ConversationLayout title={displayTitle} workId={work?.id} onNew={onNew} navigation={navigation} actions={<><span className="tag">{published?'已公开':'仅自己可见'}</span><button className="btn" disabled={!published || busy} onClick={() => publishDialog.current?.showModal()}><ConversationIcon name="arrow" style={{width:14,height:14}}/>分享</button><button className="btn primary" disabled={!completed || busy} onClick={() => publishDialog.current?.showModal()}>{published?'分享作品':'发布作品'} ↗</button></>}>
    <main className="feed">{empty && supplemental && <div className="supplemental">{supplemental}</div>}
      {empty ? <section className="empty"><div className="assistant-icon">智</div><h1>让一个想法，变得可以探索。</h1><p>描述一个现象、一条规律，或者一个天马行空的想法。</p><div className="empty-options">{[CREATIVE_DOMAINS[2],CREATIVE_DOMAINS[1],CREATIVE_DOMAINS[4]].map(item => <button key={item.id} onClick={() => {update(item.prompt);focus();}}>{item.title}</button>)}</div></section> : <section className="conversation">
        {prompt && <div className="user-row"><div><div className="user-bubble" style={{whiteSpace:'pre-wrap'}}>{prompt}</div><div className="user-meta"><span>交互作品</span><span>{orientation==='portrait'?'纵向展示':'横向 · 桌面'}</span><button onClick={edit} disabled={busy} aria-label="编辑输入">重新编辑 ↗</button></div></div><div className="avatar" style={{width:28,height:28,fontSize:11}}>我</div></div>}
        <div className="reply"><div className="assistant-icon">智</div><div><div className="reply-title">智了空间<span className="status"><span className="status-dot"/><span>{status}</span></span></div>
        <p className="reply-text">{generating?'创作方向已确认。正在将你的描述转化为可交互的作品，最新进度会保存在当前会话。':loading?'正在恢复会话和作品数据，请稍候。':shownError?'这一轮创作尚未完成。你的输入已保留，可以调整描述或重新尝试。':completed?'一个可体验的版本已经就绪。你可以直接体验，观察交互结果，再继续描述想调整的地方。':session?.currentQuestion?.prompt || session?.currentQuestion?.content || (mode==='fork'?'以原作为起点，确认你想保留和改变的内容。':'创作描述已保存。请确认或修改方向，准备好后开始生成。')}</p>
        <details className="prompt-details"><summary>查看创作方向与执行记录</summary><div className="prompt-body">{session?.expandedPrompt && <p style={{whiteSpace:'pre-wrap'}}>{session.expandedPrompt}</p>}<p>当前状态：{status}</p>{progress?.stageLabel && <p>执行阶段：{progress.stageLabel}</p>}{progress?.message && <p>{progress.message}</p>}{work?.version && <p>当前版本：V{work.version}</p>}{!session?.expandedPrompt && !progress?.message && <p>后续执行状态会随任务更新。</p>}</div></details>
        {generating && <div className="running-box" role="status"><div className="running-head"><strong>{progress?.stageLabel || '正在构建交互作品'}</strong>{Number.isFinite(pct) && <span>{Math.round(Math.max(0,Math.min(100,pct)))}%</span>}</div>{Number.isFinite(pct) ? <div className="progress" role="progressbar" aria-valuenow={Math.max(0,Math.min(100,pct))} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${Math.max(0,Math.min(100,pct))}%`}}/></div> : <p className="state-note">等待任务更新进度…</p>}<p className="state-note">{progress?.message || '正在等待生成服务返回结果。'}</p><div className="running-foot"><span>可以离开此页，稍后从会话或任务中心继续。</span>{onCancel && <button className="btn" onClick={onCancel}>停止本轮创作</button>}</div></div>}
        {shownError && <div className="error-box" role="alert"><strong>这次创作暂时没有完成</strong><p>{shownError}</p><button className="btn" disabled={busy} onClick={edit}>修改描述</button> {primary && <button className="btn primary" disabled={busy || primary.disabled} onClick={submit}>重新尝试</button>}</div>}
        {supplemental && <div className="supplemental">{supplemental}</div>}
        {previewWork?.id && <div style={{marginTop:generating || shownError?18:0}}>{!completed && <p className="work-placeholder-note">{mode==='fork'?'原作参考':'上一保存版本'} · 本轮完成后展示新作品</p>}<WorkPreview conversation work={previewWork} canPlay={canPlay} onUnlock={onUnlock} busy={loading || generating} onEdit={completed ? edit : null}/><div className="postmeta">AI 生成作品{previewWork.version?` · V${previewWork.version}`:''} · {published?'已公开':'仅自己可见'}</div>{completed && !generating && <><div className="response-actions"><button className="btn" onClick={() => {if(continueCreate)iterate('基于当前作品重新生成，保留原有创作方向。');else{update('基于当前作品重新生成，保留原有创作方向。');focus();}}}>↻ 重新生成</button><button className="btn" onClick={() => {update(prompt || work.description || '');focus();}}>引用描述</button></div><div className="suggestions">{['优化交互与操作反馈','调整视觉呈现','补充模型与使用说明'].map(text => <button key={text} onClick={() => {update(text);focus();}}>{text}</button>)}</div></>}</div>}
        </div></div></section>}
    </main>
    <div className="composer-dock"><form className="composer" onSubmit={submit}>{session && !continueCreate && <div className="composer-message">{busy?'正在处理当前创作…':'确认或修改创作方向，然后开始生成。'}</div>}<textarea ref={inputRef} className="composer-input" id="creative-description" aria-label={inputAriaLabel} value={value} onChange={e => update(e.target.value)} disabled={loading || submitting || (generating && !continueCreate)} maxLength={4000} placeholder={empty?'描述你想探索的现象，或一个天马行空的想法…':'继续描述你的想法，让这个作品再生长一点…'} onKeyDown={e => {if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}}/><div className="composer-tools"><div className="tools-left"><button type="button" className="iconbtn" aria-label="作品设置" onClick={() => settingsDialog.current?.showModal()}><ConversationIcon name="plus"/></button><select aria-label="创作类型" value={format} disabled={Boolean(session) || busy} onChange={e => setFormat(e.target.value)}><option value="experiment">✧ 交互实验</option><option value="exploration">自由创意</option><option value="explanation">动态演示</option></select><select aria-label="呈现比例" value={orientation} disabled={!onOrientationChange || Boolean(session?.sessionId) || busy} onChange={e=>onOrientationChange?.(e.target.value)}><option value="landscape">▭ 横向 · 桌面</option><option value="portrait">▯ 纵向展示</option></select></div><div style={{display:'flex',alignItems:'center'}}><span className="keyboard">Enter 发送 · Shift + Enter 换行</span><button className="send" data-testid="workspace-primary" title={actionLabel} aria-label={actionLabel} type="submit" disabled={busy || (continueCreate?!value.trim():!primary || primary.disabled)}><ConversationIcon name="arrow" style={{transform:'rotate(-90deg)'}}/></button></div></div><div className="secondary-actions"><span className="primary-label">{actionLabel}</span>{secondary.map(action => <button type="button" key={action.key} data-testid={`secondary-${action.key}`} disabled={busy || action.disabled} onClick={action.onClick}>{action.label}</button>)}</div></form><div className="composer-caption"><span>{quotaText || '每一次调整，都会保留为一个新版本。'}</span><span>智了空间 · 让创意成为可交互的作品</span></div></div>
    <dialog ref={settingsDialog}><div className="dialog-head"><strong>作品设置</strong><button className="iconbtn" aria-label="关闭设置" onClick={()=>settingsDialog.current?.close()}><ConversationIcon name="close"/></button></div><div className="dialog-content"><label htmlFor="creative-title">作品名称</label><input className="dialog-input" id="creative-title" value={displayTitle==='新的创意'?'':displayTitle} onChange={e=>onTitleChange?.(e.target.value)} disabled={!onTitleChange || Boolean(session?.sessionId) || busy} placeholder="为创意取个名字"/><p className="state-note">先说明你关注的现象、可调整的参数和希望观察的结果。涉及科学规律时，请标注模型、单位与简化假设。</p><button className="btn primary" onClick={()=>settingsDialog.current?.close()}>完成</button></div></dialog>
    <dialog ref={publishDialog}><div className="dialog-head"><strong>{published?'分享作品':'让更多人，走进你的创意。'}</strong><button className="iconbtn" aria-label="关闭" disabled={publishing} onClick={()=>publishDialog.current?.close()}><ConversationIcon name="close"/></button></div><div className="dialog-content"><h3>{work?.title || displayTitle}</h3><p>公开发布后，作品会按平台的访问与审核规则展示。</p>{publishError && <div className="alert" role="status">{publishError}</div>}{shareUrl && <label>作品分享地址<input className="dialog-input" value={shareUrl} readOnly onFocus={e=>e.target.select()}/></label>}<button className="btn primary" disabled={publishing || Boolean(shareUrl)} onClick={publish}>{publishing?'正在发布…':shareUrl?'已发布':'确认公开发布'}</button></div></dialog>{children}
  </ConversationLayout>;
}
