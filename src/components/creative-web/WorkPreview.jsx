import React, { useEffect, useRef, useState } from 'react';
import { get } from '../../services/api';
import { CreativeIcon } from './CreativeShell';

export default function WorkPreview({ work, canPlay = true, onUnlock, busy = false }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const panel = useRef(null);
  const request = useRef(0);
  useEffect(() => { request.current++; setHtml(''); setError(''); setLoading(false); return () => { request.current++; }; }, [work?.id, work?.version]);
  async function start() {
    if (!canPlay) { onUnlock?.(); return; }
    if (!work?.id || busy || loading) return;
    const serial = ++request.current;
    setLoading(true); setError('');
    try {
      // Authenticated endpoint checks ownership, visibility and subscription server-side.
      const result = await get(`/api/v1/games/${encodeURIComponent(work.id)}/play`);
      if (request.current !== serial) return;
      if (typeof result?.htmlCode !== 'string' || !result.htmlCode.trim()) throw new Error('当前版本还没有可体验的内容。');
      setHtml(result.htmlCode);
    } catch (err) { if (request.current === serial) setError(err?.message || '加载作品失败，请重试。'); }
    finally { if (request.current === serial) setLoading(false); }
  }
  return <div className="cw-preview-panel" ref={panel}>
    <div className="cw-stagebar"><strong>作品预览</strong><div className="cw-row"><span>桌面浏览器</span><button className="cw-icon-button" aria-label="重新体验" disabled={!html} onClick={() => setReload(value => value + 1)}><CreativeIcon name="refresh" /></button><button className="cw-icon-button" aria-label="全屏体验" disabled={!html} onClick={() => { const action = document.fullscreenElement ? document.exitFullscreen?.() : panel.current?.requestFullscreen?.(); action?.catch?.(() => setError('浏览器未允许全屏，请直接在预览区体验。')); }}><CreativeIcon name="expand" /></button></div></div>
    <div className="cw-preview-wrap"><div className="cw-preview-frame">{html ? <iframe key={`${work.id}:${work.version}:${reload}`} title={work.title || '交互作品'} srcDoc={html} sandbox="allow-scripts" referrerPolicy="no-referrer" allow="fullscreen" /> : <div className="cw-preview-empty"><CreativeIcon name="spark" /><div className="cw-eyebrow">A NEW WAY TO EXPLORE</div><h2>{work?.title || '你的创意，即将在这里发生。'}</h2><p>{work?.id ? '动手体验，发现变化，再继续完善。' : '确认创作方向后，作品将在这里呈现。'}</p>{work?.id && <button className="cw-button cw-lime" onClick={start} disabled={loading || busy}><CreativeIcon name="play" />{loading ? '正在加载…' : canPlay ? '开始体验' : '查看解锁方式'}</button>}</div>}</div></div>
    {error && <div className="cw-error" role="alert">{error}{!html && <button disabled={loading} onClick={start}>重试</button>}</div>}
    <div className="cw-preview-foot"><span>{work?.version ? `当前保存版本 · v${work.version}` : '等待创意成形'}</span><span>键盘 / 鼠标</span></div>
  </div>;
}
