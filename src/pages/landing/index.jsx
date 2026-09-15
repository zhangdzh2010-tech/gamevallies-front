import React, { useEffect, useMemo, useState } from 'react';
import Taro from '@tarojs/taro';
import { getFeaturedGames, getLatest, getTrending } from '../../services/feed';
import { normalizeWorks, saveCreativeDraft } from '../../components/creative-web/creativeModel';
import { CoverMatte } from '../../components/creative-web/coverLetterbox';
import WorkExperienceOverlay from '../../components/creative-web/WorkExperienceOverlay';
import {
  HOME_PAGE_URL,
  openCreatePageWithAuth,
} from '../../utils/authNavigation';
import { getGameCoverUrl } from '../../utils/media';
import { isH5Runtime, isPcWebViewport } from '../../utils/runtime';
import { openWorkExperience } from '../../utils/workExperienceRoute';
import { isPlayableWorkId } from '../../utils/workPlayability';
import {
  KEEP_WORKS,
  LANDING_FILTERS,
  adaptPublicWork,
  filterWorks,
  pickPhotosynthesisWork,
} from './keepWorks';
import { BrandMarkImg } from '../../components/common/BrandMark';
import './index.scss';

const COMPOSER_PLACEHOLDER = '例如：两个几乎相同的双摆，轨迹会如何分叉……';

function openCreativeHome() {
  return Taro.switchTab({ url: HOME_PAGE_URL }).catch(() => {
    Taro.navigateTo({ url: HOME_PAGE_URL }).catch(() => {});
  });
}

function beginCreate(idea = '') {
  const prompt = String(idea || '').trim();
  if (prompt.length >= 5) {
    saveCreativeDraft({
      prompt,
      domain: 'open',
      format: 'experiment',
      orientation: 'landscape',
      title: '',
    });
  }
  openCreatePageWithAuth({ mode: 'fresh' });
}

function scrollToId(id) {
  if (typeof document === 'undefined') {
    return;
  }
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function openShowcaseWork(work, openOverlay) {
  const id = work?.id == null ? '' : String(work.id).trim();
  if (!id) {
    return undefined;
  }
  const playable = isPlayableWorkId(id);
  if (typeof openOverlay === 'function' && (isPcWebViewport() || !playable)) {
    openOverlay(work);
    return { overlay: true, playable };
  }
  if (!playable) {
    return undefined;
  }
  return openWorkExperience(work);
}

function PendulumMark() {
  return (
    <div className="zl-pendulum" aria-hidden="true">
      <span className="zl-pendulum__bar" />
      <span className="zl-pendulum__pivot" />
      <span className="zl-pendulum__arm">
        <span className="zl-pendulum__rod" />
        <span className="zl-pendulum__bob" />
      </span>
    </div>
  );
}

function PhotosynthesisMark() {
  return (
    <div className="zl-photo" aria-hidden="true">
      <span className="zl-photo__glow" />
      <span className="zl-photo__sun" />
      <span className="zl-photo__ray" />
      <span className="zl-photo__ray zl-photo__ray--2" />
      <span className="zl-photo__ray zl-photo__ray--3" />
      <span className="zl-photo__leaf">
        <span className="zl-photo__blade" />
        <span className="zl-photo__vein" />
        <span className="zl-photo__stem" />
      </span>
      <span className="zl-photo__drop" />
      <span className="zl-photo__bubble zl-photo__bubble--a" />
      <span className="zl-photo__bubble zl-photo__bubble--b" />
      <span className="zl-photo__bubble zl-photo__bubble--c" />
      <span className="zl-photo__tag zl-photo__tag--light">光</span>
      <span className="zl-photo__tag zl-photo__tag--co2">CO₂</span>
      <span className="zl-photo__tag zl-photo__tag--h2o">H₂O</span>
      <span className="zl-photo__tag zl-photo__tag--o2">O₂</span>
      <span className="zl-photo__eq">6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂</span>
      <span className="zl-photo__caption">光合作 · 产氧可视化</span>
    </div>
  );
}

export default function LandingPage() {
  const [idea, setIdea] = useState('');
  const [filter, setFilter] = useState('all');
  const [works, setWorks] = useState(KEEP_WORKS);
  const [experienceWork, setExperienceWork] = useState(null);

  useEffect(() => {
    if (!isH5Runtime()) {
      Taro.switchTab({ url: HOME_PAGE_URL }).catch(() => {});
      return undefined;
    }
    if (typeof document === 'undefined') {
      return undefined;
    }
    document.documentElement.classList.add('zl-landing-route');
    return () => document.documentElement.classList.remove('zl-landing-route');
  }, []);

  useEffect(() => {
    let active = true;
    async function loadShowcase() {
      // Public published feed: latest → featured → trending. Fallback is curated KEEP.
      const loaders = [
        () => getLatest(1, 12),
        () => getFeaturedGames(12),
        () => getTrending(1, 12),
      ];
      for (const load of loaders) {
        try {
          const items = normalizeWorks(await load()).map((item, index) => ({
            ...adaptPublicWork(item, index),
            coverUrl: getGameCoverUrl(item) || adaptPublicWork(item, index).coverUrl,
          }));
          if (active && items.length) {
            setWorks(items);
            return;
          }
        } catch {
          // try the next public endpoint
        }
      }
      if (active) {
        setWorks(KEEP_WORKS);
      }
    }
    void loadShowcase();
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => filterWorks(works, filter), [works, filter]);
  const bandWork = useMemo(() => pickPhotosynthesisWork(works), [works]);

  const submitComposer = (event) => {
    event.preventDefault();
    beginCreate(idea);
  };

  return (
    <div className="zl-landing">
      <header className="zl-nav">
        <div className="zl-nav__inner">
          <button type="button" className="zl-brand" onClick={() => scrollToId('create')}>
            <BrandMarkImg className="zl-mark" />
            智了空间
          </button>
          <nav className="zl-nav__links" aria-label="落地页导航">
            <button type="button" className="zl-nav__link" onClick={() => scrollToId('showcase')}>精选作品</button>
            <button type="button" className="zl-nav__link" onClick={() => scrollToId('ways')}>探索方式</button>
            <button type="button" className="zl-nav__link" onClick={() => beginCreate(idea)}>开始创作</button>
          </nav>
          <button type="button" className="zl-btn zl-btn--cta" onClick={openCreativeHome}>开启智了</button>
        </div>
      </header>

      <main>
        <section className="zl-hero" id="create">
          <div>
            <p className="zl-eyebrow">CREATIVE SCIENCE</p>
            <h1>把想法和科学<br />变成可探索的作品</h1>
            <p className="zl-lead">
              面向创意与教育的交互实验空间。参数、反馈，让物理、化学、生物里的规律变得可感知。游戏只是可选形式。
            </p>
            <form className="zl-composer" onSubmit={submitComposer}>
              <input
                className="zl-composer__input"
                aria-label="你的想法"
                placeholder={COMPOSER_PLACEHOLDER}
                value={idea}
                maxLength={3000}
                onChange={(event) => setIdea(event.target.value)}
              />
              <button type="submit" className="zl-btn zl-btn--cta">即刻创作</button>
            </form>
          </div>

          <article className="zl-demo">
            <div className="zl-demo__head">
              <strong>小角度理想单摆演示</strong>
              <span className="zl-dot" />
            </div>
            <div className="zl-demo__stage">
              <PendulumMark />
            </div>
            <p className="zl-demo__meta">
              <span>T ≈ 2π√(L/g)</span>
              <span>L · g 可调</span>
            </p>
          </article>
        </section>

        <section className="zl-band" aria-labelledby="band-title">
          <div>
            <div className="zl-index">01</div>
            <h2 id="band-title">灵感即刻成实验</h2>
            <p>一句话描述现象或想法，生成可动手探索的桌面交互。适合课堂演示、自学与创意探索。</p>
            <button type="button" className="zl-btn zl-btn--outline" onClick={() => scrollToId('showcase')}>
              立即体验精选
            </button>
          </div>
          <button
            type="button"
            className="zl-band__card"
            onClick={() => scrollToId('showcase')}
            aria-label="查看光合作 · 产氧可视化"
          >
            {bandWork?.coverUrl
              ? <CoverMatte src={bandWork.coverUrl} alt={bandWork.title || ''} />
              : <PhotosynthesisMark />}
          </button>
        </section>

        <section className="zl-ways" id="ways">
          <h2>这样探索科学</h2>
          <p className="zl-section-lead">把科学变成可感知、可调节、可继续改的作品。</p>
          <div className="zl-ways__grid">
            <article>
              <div className="zl-way-head">
                <span>01</span>
                <span className="zl-ico" aria-hidden="true" />
              </div>
              <h3>可感知的规律</h3>
              <p>摆动、光合、渗透、波干涉，用动画把公式变眼前的变化。</p>
            </article>
            <article>
              <div className="zl-way-head">
                <span>02</span>
                <span className="zl-ico zl-ico--box" aria-hidden="true" />
              </div>
              <h3>可调的参数</h3>
              <p>拖动滑块、改初态，立刻看到系统如何响应。</p>
            </article>
            <article>
              <div className="zl-way-head">
                <span>03</span>
                <span className="zl-ico" aria-hidden="true" />
              </div>
              <h3>可继续的创作</h3>
              <p>发布到创意广场，别人在你打磨同一条想法。</p>
            </article>
          </div>
        </section>

        <section className="zl-showcase" id="showcase">
          <h2>精选作品</h2>
          {/* TODO(feed): wire domain filters to a published-by-type API when it exists. */}
          <div className="zl-filters" role="tablist" aria-label="作品领域">
            {LANDING_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                className={filter === item.id ? 'zl-filter is-active' : 'zl-filter'}
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="zl-cards">
            {visible.map((work) => (
              <article key={work.id} className="zl-card">
                <button
                  type="button"
                  className="zl-card__hit"
                  aria-label={`体验 ${work.title || '作品'}`}
                  onClick={() => openShowcaseWork(work, setExperienceWork)}
                >
                  <div className="zl-card__cover">
                    {work.coverUrl
                      ? <CoverMatte src={work.coverUrl} alt="" />
                      : (work.coverLabel || work.domainLabel)}
                  </div>
                  <div className="zl-card__body">
                    <h3>{work.title}</h3>
                    <div className="zl-card__author">
                      <span className="zl-card__avatar" aria-hidden="true">
                        {Array.from(work.author || '创')[0]}
                      </span>
                      <span className="zl-card__author-name">{work.author || '创作者'}</span>
                    </div>
                  </div>
                </button>
              </article>
            ))}
          </div>
          {!visible.length && (
            <p className="zl-empty">这个分类暂时还没有作品。</p>
          )}
        </section>

        <section className="zl-bottom" id="open">
          <h2>把下一个想法，做成可探索的作品</h2>
          <p className="zl-lead">进入智了空间工作台，继续写、调参数、发布到广场。</p>
          <div className="zl-bottom__actions">
            <button type="button" className="zl-btn zl-btn--cta" onClick={openCreativeHome}>开启智了</button>
            <button type="button" className="zl-btn zl-btn--ghost" onClick={() => beginCreate(idea)}>开始创作</button>
          </div>
        </section>
      </main>

      <footer className="zl-foot">
        <span>智了空间 · 创意与教育的交互实验</span>
      </footer>
      <WorkExperienceOverlay
        work={experienceWork}
        autoPlay
        ariaLabel="精选作品体验"
        onClose={() => setExperienceWork(null)}
      />
    </div>
  );
}
