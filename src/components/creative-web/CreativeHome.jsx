import React, { useEffect, useRef, useState } from 'react';
import { useDidShow } from '@tarojs/taro';
import { getMyGames, publishGame } from '../../services/game';
import { isLoggedIn, openCreatePageWithAuth, openIteratePageWithAuth, openTaskCreatePageWithAuth } from '../../utils/authNavigation';
import { getGameCoverUrl } from '../../utils/media';
import { useGameStore } from '../../store/gameStore';
import useQuotaStore from '../../stores/quotaStore';
import { CreativeIcon } from './CreativeShell';
import ConversationStudioBody from './ConversationStudioBody';
import ConversationLayout from './ConversationLayout';
import CreativeSquare from './CreativeSquare';
import FailedWorkDialog, { isFailedWork } from './FailedWorkDialog';
import PublicationFields, { publicationDraftFor, isPublicationReady } from './PublicationFields';
import { CREATIVE_DOMAINS, CREATIVE_FORMATS, buildCreativePrompt, saveCreativeDraft, consumeCreativeView, normalizeWorks } from './creativeModel';

export function CreativePlot({ domain = 'physics' }) {
  // Illustrative mathematical curves, never presented as real experimental data.
  const paths = Array.from({ length: 4 }, (_, line) => Array.from({ length: 91 }, (_, n) => {
    const x = 25 + n * 4.3;
    const y = domain === 'biology' ? 185 - 125 / (1 + Math.exp(-(n - 30 - line * 9) / 9)) : domain === 'chemistry' ? 65 + (110 - line * 30) * Math.exp(-n / (15 + line * 8)) : 120 + Math.sin(n / (7 + line * .7)) * (20 + line * 15) * Math.exp(-n / 180);
    return `${n ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' '));
  return <svg className={`cw-plot cw-plot-${domain}`} viewBox="0 0 440 240" aria-label="概念示意曲线"><path d="M25 30V205H420M25 120H420M220 30V205" fill="none" stroke="currentColor" opacity=".12" />{paths.map((d, i) => <path key={i} d={d} fill="none" stroke="currentColor" opacity={1 - i * .18} strokeWidth="2" />)}</svg>;
}
export default function CreativeHome() {
  const [view, setView] = useState('square');
  const [idea, setIdea] = useState('');
  const [orientation, setOrientation] = useState('landscape');
  const [creativeTitle, setCreativeTitle] = useState('');
  const [domain, setDomain] = useState('open');
  const [format, setFormat] = useState('experiment');
  const [choosing, setChoosing] = useState(false);
  const [works, setWorks] = useState([]);
  const [failedWork, setFailedWork] = useState(null);
  const [publishCandidate, setPublishCandidate] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publicationDraft, setPublicationDraft] = useState(() => publicationDraftFor(null));
  const publishDialog = useRef(null);
  const publishLock = useRef(false);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const requestRef = useRef(0);
  const dialogRef = useRef(null);
  const { isGenerating, currentTask } = useGameStore();
  async function loadWorks(next = 1) {
    const request = ++requestRef.current;
    if (!isLoggedIn()) { setWorks([]); setLoading(false); setError(''); setMore(false); return; }
    setLoading(true); setError('');
    try {
      const result = await getMyGames(next, 24);
      if (request !== requestRef.current) return;
      const items = normalizeWorks(result);
      setWorks(previous => next === 1 ? items : [...previous, ...items.filter(item => !previous.some(p => p.id === item.id))]);
      setPage(next); setMore(result?.total != null ? next * 24 < Number(result.total) : items.length === 24);
    } catch (err) { if (request === requestRef.current) setError(err?.message || '作品暂时无法加载，请重试。'); }
    finally { if (request === requestRef.current) setLoading(false); }
  }
  useDidShow(() => { const next = consumeCreativeView(); if (next) setView(next); void loadWorks(); if (isLoggedIn()) void useQuotaStore.getState().fetchQuota(false).catch(() => {}); });
  useEffect(() => () => { requestRef.current++; }, []);
  useEffect(() => { if (choosing) dialogRef.current?.showModal(); else dialogRef.current?.close(); }, [choosing]);
  const navigate = next => { setView(next); setFilter('all'); setSearch(''); if (next === 'works') void loadWorks(); };
  const pickIdea = item => { setIdea(item.prompt); setDomain(item.id); setView('home'); };
  const begin = () => {
    const prompt = buildCreativePrompt(idea, domain, format);
    if (!saveCreativeDraft({ prompt, domain, format, orientation, title: creativeTitle })) { setError('浏览器无法暂存创意，请检查存储权限后重试。'); return; }
    setChoosing(false); openCreatePageWithAuth({ mode: 'fresh' });
  };
  const openWork = work => {
    if (isFailedWork(work)) { setFailedWork(work); return; }
    if (work.status === 'generating' && (work.generationTaskId || work.taskId)) openTaskCreatePageWithAuth(work.generationTaskId || work.taskId, work.id, work.taskType || 'pipeline_run');
    else openIteratePageWithAuth(work, work.id);
  };
  useEffect(() => { if (publishCandidate) { setPublicationDraft(publicationDraftFor(publishCandidate)); publishDialog.current?.showModal(); } }, [publishCandidate]);
  async function publishWork() {
    if (!publishCandidate || publishLock.current || !isPublicationReady(publicationDraft)) return;
    publishLock.current = true; setPublishing(true); setError('');
    try {
      const result = await publishGame(publishCandidate.id, { visibility: 'public', title: publicationDraft.title.trim(), description: publicationDraft.description.trim() });
      const updated = result?.game || result;
      if (!updated?.status) throw new Error('未收到发布结果，请刷新作品列表确认状态。');
      setWorks(previous => previous.map(work => work.id === publishCandidate.id ? { ...work, ...updated } : work));
      setPublishCandidate(null);
    } catch (err) { setError(err?.message || '发布失败，请重试。'); }
    finally { publishLock.current = false; setPublishing(false); }
  }
  const visible = works.filter(work => (filter === 'all' || (filter === 'published' ? work.status === 'published' : work.status !== 'published')) && String(work.title || '').toLowerCase().includes(search.toLowerCase()));
  if (view === 'home') return <ConversationStudioBody mode="create" home displayTitle={creativeTitle || '新的创意'} onTitleChange={setCreativeTitle} orientation={orientation} onOrientationChange={setOrientation} input={idea} onInputChange={setIdea} format={format} onFormatChange={setFormat} navigation={navigate} onNew={() => {setIdea('');setCreativeTitle('');setError('');}} inputAriaLabel="你的创意" primary={{label:'开始创作',onClick:begin,disabled:idea.trim().length<5}} secondary={[]} error={error} supplemental={isGenerating && currentTask?.taskId ? <div><p>你的创作任务正在进行。</p><button onClick={() => openTaskCreatePageWithAuth(currentTask.taskId,currentTask.gameId,currentTask.taskType)}>查看进展</button></div> : null}/>;
  return <ConversationLayout active={view} navigation={navigate} title={{ works: '我的作品', ideas: '创意灵感', square: '创意广场' }[view]}><div className="creative-web" style={{background:'transparent',minHeight:0}}>
    <main className="cw-home"><div className="cw-eyebrow">YOUR CREATIVE PLAYGROUND</div><h1>{view === 'square' ? '让创意相遇，让作品继续生长。' : view === 'works' ? '你的创意，都在这里。' : view === 'ideas' ? '世界的规律，也是创意的起点。' : '今天，想让什么创意发生？'}</h1>{view !== 'square' && <p className="cw-intro">{view === 'square' ? null : view === 'works' ? '这里只显示当前登录账号的作品与任务。测试账号及其他创作者的公开作品请前往创意广场。' : '物理规律、生物世界、化学反应，或一个天马行空的想法。把它变成可以探索的作品。'}</p>}
    {view === 'home' && <><div className="cw-creation-row"><section className="cw-prompt-box"><div className="cw-prompt-label"><CreativeIcon name="spark" /> 你的想法，是创作的起点</div><textarea className="cw-idea-input" aria-label="你的创意" maxLength={3000} value={idea} onChange={e => setIdea(e.target.value)} placeholder="例如：让两个初始角度几乎相同的双摆开始运动，看看它们的轨迹会如何变化……" /><div className="cw-prompt-footer"><select className="cw-domain-select" aria-label="创作领域" value={domain} onChange={e => setDomain(e.target.value)}>{CREATIVE_DOMAINS.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select><button className="cw-button cw-primary" disabled={idea.trim().length < 5} onClick={() => setChoosing(true)}>构思创意<CreativeIcon name="arrow" /></button></div></section><section className="cw-continue"><small>{isGenerating ? '创意正在成形' : works[0] ? '继续上次的创作' : '从观察，到创造'}</small><h2>{isGenerating ? '你的创作任务正在进行' : works[0]?.title || '让规律变得可感知'}</h2><p>{isGenerating ? '重新打开任务，查看最新进展。' : works[0] ? '再观察一次，再调整一点。' : '改变参数，观察反馈，在亲手探索中发现新的可能。'}</p><button className="cw-button cw-lime" onClick={() => isGenerating ? (currentTask?.taskId ? openTaskCreatePageWithAuth(currentTask.taskId, currentTask.gameId, currentTask.taskType) : openCreatePageWithAuth()) : works[0] ? openWork(works[0]) : pickIdea(CREATIVE_DOMAINS[1])}>{isGenerating ? '查看进展' : works[0] ? '进入创作台' : '从一个物理创意开始'}<CreativeIcon name="arrow" /></button></section></div><div className="cw-idea-chips"><span>试试这些灵感</span>{CREATIVE_DOMAINS.slice(1).map(d => <button className="cw-chip" key={d.id} onClick={() => pickIdea(d)}>{d.title} ↗</button>)}</div></>}
    {view === 'square' ? <CreativeSquare /> : view === 'ideas' ? <div className="cw-projects cw-inspirations">{CREATIVE_DOMAINS.slice(1).map(d => <button key={d.id} className="cw-project" onClick={() => pickIdea(d)}><div className="cw-cover"><CreativePlot domain={d.id} /><span>{d.label}</span></div><div className="cw-project-body"><h3>{d.title}</h3><p>{d.description}</p><small>以此为起点，写下你的想法 →</small></div></button>)}</div> : <><div className="cw-section-head"><div className="cw-tabs">{[['all', '全部作品'], ['draft', '草稿与任务'], ['published', '已发布']].map(([id, label]) => <button key={id} className={`cw-tab${filter === id ? ' active' : ''}`} onClick={() => setFilter(id)}>{label}</button>)}</div><input className="cw-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索已加载的作品" aria-label="搜索作品" /></div>
      {error && <div className="cw-error" role="alert">{error}<button onClick={() => loadWorks()}>重新加载</button></div>}
      <div className="cw-projects">{visible.map(work => <article key={work.id} className="cw-project"><button type="button" className="cw-project-open" onClick={() => openWork(work)}><div className="cw-cover">{getGameCoverUrl(work) ? <img src={getGameCoverUrl(work)} alt="" loading="lazy" /> : <div className="cw-cover-empty"><CreativeIcon name="spark" /><span>CREATIVE WORK</span></div>}<span>{work.status === 'published' ? '已发布' : work.status === 'generating' ? '创作中' : isFailedWork(work) ? '任务未完成' : work.status === 'review' ? '审核中' : '未发布'}</span></div><div className="cw-project-body"><div className="cw-between"><h3>{work.title || '未命名作品'}</h3>{work.version && <small>v{work.version}</small>}</div><p>{work.description || '一个等待继续探索的创意'}</p><div className="cw-project-foot"><span>交互作品</span><span>{isFailedWork(work) ? '查看失败详情 →' : '继续创作 →'}</span></div></div></button>{['ready', 'draft', 'published'].includes(work.status) && <div className="cw-square-actions"><button type="button" className="cw-button cw-outline" onClick={() => setPublishCandidate(work)}>发布到创意广场</button></div>}</article>)}</div>
      {!loading && !visible.length && !error && <div className="cw-empty"><CreativeIcon name="spark" /><h3>{!isLoggedIn() ? '登录后，保存你的第一个创意。' : search || filter !== 'all' ? '没有匹配的作品' : '这里将收藏你的创意世界。'}</h3><p>{!isLoggedIn() ? '你的创作、任务和作品都将在这里延续。' : '从上方写下一段描述开始。'}</p>{!isLoggedIn() && <button className="cw-button cw-primary" onClick={() => openCreatePageWithAuth({ mode: 'fresh' })}>登录并开始创作</button>}</div>}
      {loading && <p className="cw-loading" role="status">正在加载你的作品…</p>}{more && !loading && <button className="cw-button cw-outline cw-loadmore" onClick={() => loadWorks(page + 1)}>加载更多作品</button>}</>}
      <footer className="cw-footer"><span>创意，不止一种形态。</span><span>智了空间 / 桌面创作台</span></footer>
    </main>
    <FailedWorkDialog work={failedWork} onClose={() => setFailedWork(null)} />
    {publishCandidate && <dialog ref={publishDialog} className="cw-dialog cw-publish-dialog" aria-label="发布到创意广场" onCancel={e => { if (publishing) e.preventDefault(); else setPublishCandidate(null); }}><div className="cw-dialog-head"><h2>发布到创意广场</h2><button type="button" disabled={publishing} onClick={() => setPublishCandidate(null)}>关闭</button></div><div className="cw-publish-body"><h3>{publishCandidate.title}</h3><PublicationFields draft={publicationDraft} onChange={setPublicationDraft} disabled={publishing} /><p>发布后所有用户都能体验作品。其他用户可在你允许复刻时创建独立版本，原作不会被修改。</p>{error && <p role="alert">{error}</p>}</div><div className="cw-dialog-foot"><span>只有明确发布的作品才会进入广场。</span><button type="button" className="cw-button cw-primary" disabled={publishing || !isPublicationReady(publicationDraft)} onClick={publishWork}>{publishing ? '正在发布…' : '确认公开发布'}</button></div></dialog>}
    <dialog className="cw-dialog" ref={dialogRef} onCancel={() => setChoosing(false)}><div className="cw-dialog-head"><div><div className="cw-eyebrow">01 / SHAPE YOUR IDEA</div><h2>你想让这个创意，如何被体验？</h2><p>先选择呈现方式，再确认创作描述。</p></div><button className="cw-icon-button" aria-label="关闭" onClick={() => setChoosing(false)}><CreativeIcon name="close" /></button></div><div className="cw-format-grid">{CREATIVE_FORMATS.map(f => <button key={f.id} className={`cw-format ${format === f.id ? 'active' : ''}`} onClick={() => setFormat(f.id)} aria-pressed={format === f.id}><CreativeIcon name={f.id === 'experiment' ? 'spark' : f.id === 'explanation' ? 'play' : 'grid'} /><h3>{f.title}</h3><p>{f.description}</p><span>{format === f.id ? '✓ 已选择' : '选择这个方向'}</span></button>)}</div><div className="cw-dialog-foot"><span>进入创作台后，你仍然可以修改方向。</span><button className="cw-button cw-primary" onClick={begin}>进入创作台<CreativeIcon name="arrow" /></button></div></dialog>
  </div></ConversationLayout>;
}
