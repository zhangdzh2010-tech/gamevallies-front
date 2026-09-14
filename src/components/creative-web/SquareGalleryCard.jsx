import React, { useEffect, useState } from 'react';
import { getGalleryPosterUrl } from '../../utils/media';
import { getAvatarFallback, getSafeDisplayText, normalizeAvatarSource } from '../../utils/profileDisplay';

const DOMAIN_HINTS = [
  ['physics', /物理|摆|轨道|重力|自由落|力学|波动|干涉/],
  ['biology', /生物|光合|种群|细胞|渗透/],
  ['chemistry', /化学|反应|分子|平衡|浓度/],
  ['game', /游戏|弹珠|关卡/],
];

export function galleryPosterDomain(work = {}) {
  const explicit = String(work.domain || work.category || '').toLowerCase();
  if (['physics', 'biology', 'chemistry', 'game', 'tool', 'open'].includes(explicit)) {
    return explicit;
  }
  const hay = [work.domainLabel, ...(work.tags || []), work.title, work.description]
    .filter(Boolean)
    .join(' ');
  const hit = DOMAIN_HINTS.find(([, pattern]) => pattern.test(hay));
  return hit ? hit[0] : 'open';
}

export function isDocumentLikePoster(width, height) {
  if (!width || !height) {
    return false;
  }
  return height / width > 0.78;
}

export function galleryAuthorName(work = {}) {
  return getSafeDisplayText([
    work.author?.displayName,
    work.author?.nickname,
    work.author?.username,
    work.authorName,
    typeof work.author === 'string' ? work.author : '',
  ], '创作者');
}

function SquarePoster({ src, domain }) {
  const [mode, setMode] = useState(src ? 'image' : 'placeholder');

  useEffect(() => {
    setMode(src ? 'image' : 'placeholder');
  }, [src]);

  return (
    <div className={`cw-gallery-poster cw-gallery-poster--${domain || 'open'}`}>
      {mode === 'image' && src ? (
        <div className="cw-cover-matte">
          <img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setMode('placeholder')}
            onLoad={(event) => {
              const image = event.currentTarget;
              if (isDocumentLikePoster(image.naturalWidth, image.naturalHeight)) {
                setMode('placeholder');
              }
            }}
          />
        </div>
      ) : (
        <div className="cw-gallery-placeholder" aria-hidden="true">
          <span className="cw-gallery-orb" />
          <span className="cw-gallery-ring" />
          <span className="cw-gallery-beam" />
        </div>
      )}
    </div>
  );
}

function GalleryAuthor({ work }) {
  const author = galleryAuthorName(work);
  const avatarSrc = normalizeAvatarSource(work.author?.avatarUrl || work.author?.avatar);
  const fallback = getAvatarFallback(work.author?.avatar, author, '创');
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarSrc]);

  return (
    <span className="cw-gallery-author">
      <span className="cw-gallery-avatar" aria-hidden="true">
        {avatarSrc && !imageFailed ? (
          <img src={avatarSrc} alt="" onError={() => setImageFailed(true)} />
        ) : fallback}
      </span>
      <span className="cw-gallery-author-name">{author}</span>
    </span>
  );
}

export default function SquareGalleryCard({
  work,
  featured = false,
  rank = 0,
  onExperience,
  onRemix,
  remixLabel,
  remixDisabled = false,
}) {
  const title = work.title || '未命名作品';

  return (
    <article className={`cw-project cw-square-card${featured ? ' cw-project-featured' : ''}`}>
      <div className="cw-gallery-cover">
        {featured && rank > 0 && <span className="cw-hot-badge">热门 · {rank}</span>}
        <SquarePoster src={getGalleryPosterUrl(work)} domain={galleryPosterDomain(work)} />
        <button
          type="button"
          className="cw-gallery-hit"
          onClick={onExperience}
          aria-label={`体验 ${title}`}
        />
        <div className="cw-gallery-actions">
          <button type="button" className="cw-button cw-primary" onClick={onExperience}>体验作品</button>
          <button type="button" className="cw-button cw-outline" disabled={remixDisabled} onClick={onRemix}>
            {remixLabel}
          </button>
        </div>
      </div>
      <button
        type="button"
        className="cw-gallery-meta"
        onClick={onExperience}
        aria-label={`体验 ${title}`}
      >
        <h3>{title}</h3>
        <GalleryAuthor work={work} />
      </button>
    </article>
  );
}
