import WorkSandbox from './WorkSandbox';
import React, { useEffect, useRef, useState } from 'react';
import { getLatest, getTrending, searchGames } from '../../services/feed';
import { formatUserErrorMessage } from '../../utils/networkError';
import { openForkPageWithAuth, openIteratePageWithAuth } from '../../utils/authNavigation';
import { Storage } from '../../utils/storage';
import { PlayerLetterbox } from './coverLetterbox';
import { normalizeWorks } from './creativeModel';
import SquareGalleryCard from './SquareGalleryCard';

export default function CreativeSquare() {
  const [sort, setSort] = useState('trending');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [works, setWorks] = useState([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [playing, setPlaying] = useState(false);
  const serial = useRef(0);
  const busy = useRef(false);
  const dialog = useRef(null);
  const user = Storage.getUser() || {};
  const own = work => Boolean((user.id || user.userId) && (user.id || user.userId) === (work.authorId || work.author?.id));
  const remixLabel = work => (own(work) ? '继续创作' : work.allowFork === false ? '作者未开放复刻' : '复刻并创作');
  async function load(next = 1) {
    if (next > 1 && busy.current) return;
    const request = ++serial.current;
    busy.current = true; setLoading(true); setError('');
    try {
      const result = search
        ? await searchGames(search, { page: next, limit: 24 })
        : await (sort === 'latest' ? getLatest : getTrending)(next, 24);
      if (request !== serial.current) return;
      const items = normalizeWorks(result);
      setWorks(previous => next === 1 ? items : [...previous, ...items.filter(item => !previous.some(p => p.id === item.id))]);
      setPage(next);
      setMore(result?.hasMore ?? (result?.total != null ? next * 24 < Number(result.total) : items.length === 24));
    } catch (err) {
      if (request === serial.current) {
        setError(formatUserErrorMessage(err, '广场暂时无法加载，请重试。'));
      }
    }
    finally { if (request === serial.current) { busy.current = false; setLoading(false); } }
  }
  useEffect(() => { setWorks([]); setMore(false); void load(); return () => { serial.current++; }; }, [sort, search]);
  useEffect(() => { setPlaying(false); if (selected) dialog.current?.showModal(); }, [selected]);
  const remix = work => {
    dialog.current?.close();
    setSelected(null);
    setPlaying(false);
    return own(work) ? openIteratePageWithAuth(work, work.id) : openForkPageWithAuth(work.id);
  };
  return <>
    <div className="cw-section-head"><div className="cw-tabs">{[['trending', '热门作品'], ['latest', '最新发布']].map(([id, label]) => <button type="button" key={id} className={`cw-tab${sort === id ? ' active' : ''}`} onClick={() => setSort(id)}>{label}</button>)}</div>
      <form className="cw-row" onSubmit={e => { e.preventDefault(); setSearch(query.trim()); }}><input className="cw-search" aria-label="搜索广场作品" placeholder="搜索作品或创作者" value={query} onChange={e => setQuery(e.target.value)} /><button type="submit" className="cw-button cw-outline">搜索</button></form></div>
    {error && (
      <div className="cw-error" role="alert">
        <span className="cw-error__message">{error}</span>
        <button type="button" className="cw-error__retry" onClick={() => load(page)}>重试</button>
      </div>
    )}
    <div className="cw-projects">{works.map((work, index) => {
      const featured = sort === 'trending' && !search && index < 3;
      return (
        <SquareGalleryCard
          key={work.id}
          work={work}
          featured={featured}
          rank={featured ? index + 1 : 0}
          onExperience={() => setSelected(work)}
          onRemix={() => remix(work)}
          remixLabel={remixLabel(work)}
          remixDisabled={!own(work) && work.allowFork === false}
        />
      );
    })}</div>
    {loading && <p className="cw-loading" role="status">正在加载广场作品…</p>}
    {!loading && !works.length && !error && <div className="cw-empty"><h3>{search ? '没有找到匹配的作品' : '广场等待第一个公开作品'}</h3><p>在我的作品中发布后，其他人就可以在这里体验。</p></div>}
    {more && !loading && <button type="button" className="cw-button cw-outline cw-loadmore" onClick={() => load(page + 1)}>加载更多作品</button>}
    {selected && <dialog ref={dialog} className="cw-dialog cw-experience-dialog" aria-label="广场作品体验" onCancel={() => setSelected(null)} onClose={() => setSelected(null)}>
      <div className="cw-dialog-head"><h2>{selected.title}</h2><button type="button" aria-label="关闭作品体验" onClick={() => setSelected(null)}>×</button></div>
      <div className="cw-dialog-stage">{playing ? <PlayerLetterbox className="cw-square-stage"><WorkSandbox workId={selected.id} className="cw-square-player" title={selected.title || '广场作品'} src={`/games/${encodeURIComponent(selected.id)}/index.html`} sandbox="allow-scripts" referrerPolicy="no-referrer" /></PlayerLetterbox> : <div className="cw-empty"><p>{selected.description}</p><button type="button" className="cw-button cw-primary" onClick={() => setPlaying(true)}>开始体验</button></div>}</div>
      <div className="cw-dialog-foot"><span>复刻会创建你的独立作品，保留原作来源。</span><button type="button" className="cw-button cw-primary" disabled={!own(selected) && selected.allowFork === false} onClick={() => remix(selected)}>{remixLabel(selected)}</button></div>
    </dialog>}
  </>;
}
