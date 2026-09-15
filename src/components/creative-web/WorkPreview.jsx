import WorkSandbox from './WorkSandbox';
import React, { useEffect, useRef, useState } from 'react';
import { get } from '../../services/api';
import { getWorkPlayGuide } from '../../utils/workPlayGuide';
import { CreativeIcon } from './CreativeShell';
import { PlayerLetterbox } from './coverLetterbox';
import { getGameCoverUrl } from '../../utils/media';
import { PlayGuideButton, PlayGuideSheet } from './PlayGuidePanel';

export default function WorkPreview({ work, canPlay = true, onUnlock, busy = false, conversation = false, onEdit }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [playMeta, setPlayMeta] = useState(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const panel = useRef(null);
  const request = useRef(0);
  const dialog = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const guide = getWorkPlayGuide(work, playMeta);
  const expand = () => {
    if (!html) return;
    setGuideOpen(true);
    setExpanded(true);
    dialog.current?.showModal();
  };
  useEffect(() => {
    request.current++;
    setHtml('');
    setError('');
    setLoading(false);
    setPlayMeta(null);
    setGuideOpen(false);
    return () => { request.current++; };
  }, [work?.id, work?.version]);
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
      setPlayMeta(result);
      setGuideOpen(true);
    } catch (err) { if (request.current === serial) setError(err?.message || '加载作品失败，请重试。'); }
    finally { if (request.current === serial) setLoading(false); }
  }
  if (conversation) {
    const player = html
      ? (
        <PlayerLetterbox>
          <WorkSandbox
            workId={work.id}
            className="work-player"
            key={`${work.id}:${work.version}:${reload}`}
            title={work.title || '交互作品'}
            html={html}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            allow="fullscreen"
          />
        </PlayerLetterbox>
      )
      : (
        <div className="preview-placeholder">
          {getGameCoverUrl(work) && <img src={getGameCoverUrl(work)} alt="作品封面" />}
          <div className="eyebrow">作品预览</div>
          <h2>{work?.title || '作品正在准备中'}</h2>
          <p>动手体验，发现变化，再继续完善。</p>
          <button className="btn primary" onClick={start} disabled={loading || busy}>
            {loading ? '正在加载…' : canPlay ? '开始体验' : '查看解锁方式'}
          </button>
        </div>
      );
    const content = html
      ? (
        <div className="work-stage">
          {guideOpen && (
            <PlayGuideSheet
              title={work?.title || '交互作品'}
              text={guide.text}
              onDismiss={() => setGuideOpen(false)}
            />
          )}
          {player}
        </div>
      )
      : player;
    return (
      <article className="work-card">
        <div className="work-top">
          <div className="work-title">
            <CreativeIcon name="spark" className="icon" style={{ width: 14, height: 14 }} />
            交互作品
            {work?.version && <span className="version">V{work.version}</span>}
          </div>
          <div className="work-top-actions">
            {html ? <PlayGuideButton open={guideOpen} onClick={() => setGuideOpen(value => !value)} /> : null}
            <button className="iconbtn" aria-label="放大" disabled={!html} onClick={expand}>
              <CreativeIcon className="icon" name="expand" style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
        {expanded ? <div className="preview-placeholder"><p>作品已在体验窗口中打开。</p></div> : content}
        {error && (
          <div className="alert" role="alert">
            {error}
            <button className="btn" disabled={loading} onClick={start}>重试</button>
          </div>
        )}
        <div className="work-footer">
          <div>
            <strong>{work?.title || '交互作品'}</strong>
            <small>交互作品 · 键盘 / 鼠标 · {work?.version ? `V${work.version}` : '当前版本'}</small>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {onEdit && <button className="btn" onClick={onEdit} disabled={busy}>继续调整</button>}
          </div>
        </div>
        <dialog ref={dialog} onClose={() => setExpanded(false)}>
          <div className="dialog-head">
            <strong>{work?.title || '作品体验'}</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              {html && expanded ? <PlayGuideButton open={guideOpen} onClick={() => setGuideOpen(value => !value)} /> : null}
              <button className="btn" disabled={!html} onClick={() => setReload(value => value + 1)}>重新体验</button>
              <button className="iconbtn" aria-label="关闭预览" onClick={() => dialog.current?.close()}>
                <CreativeIcon className="icon" name="close" />
              </button>
            </div>
          </div>
          <div className="dialog-content">
            {expanded && content}
            {error && <p role="alert">{error}</p>}
          </div>
        </dialog>
      </article>
    );
  }
  return <div className="cw-preview-panel" ref={panel}>
    <div className="cw-stagebar"><strong>作品预览</strong><div className="cw-row"><span>桌面浏览器</span><button className="cw-icon-button" aria-label="重新体验" disabled={!html} onClick={() => setReload(value => value + 1)}><CreativeIcon name="refresh" /></button><button className="cw-icon-button" aria-label="全屏体验" disabled={!html} onClick={() => { const action = document.fullscreenElement ? document.exitFullscreen?.() : panel.current?.requestFullscreen?.(); action?.catch?.(() => setError('浏览器未允许全屏，请直接在预览区体验。')); }}><CreativeIcon name="expand" /></button></div></div>
    <div className="cw-preview-wrap"><PlayerLetterbox className="cw-preview-frame">{html ? <WorkSandbox workId={work.id} key={`${work.id}:${work.version}:${reload}`} title={work.title || '交互作品'} html={html} sandbox="allow-scripts" referrerPolicy="no-referrer" allow="fullscreen" /> : <div className="cw-preview-empty"><CreativeIcon name="spark" /><div className="cw-eyebrow">作品预览</div><h2>{work?.title || '你的创意，即将在这里发生。'}</h2><p>{work?.id ? '动手体验，发现变化，再继续完善。' : '确认创作方向后，作品将在这里呈现。'}</p>{work?.id && <button className="cw-button cw-primary" onClick={start} disabled={loading || busy}><CreativeIcon name="play" />{loading ? '正在加载…' : canPlay ? '开始体验' : '查看解锁方式'}</button>}</div>}</PlayerLetterbox></div>
    {error && <div className="cw-error" role="alert">{error}{!html && <button disabled={loading} onClick={start}>重试</button>}</div>}
    <div className="cw-preview-foot"><span>{work?.version ? `当前保存版本 · v${work.version}` : '等待创意成形'}</span><span>键盘 / 鼠标</span></div>
  </div>;
}
