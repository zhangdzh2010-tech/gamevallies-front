import React, { useEffect, useRef, useState } from 'react';
import { getGame } from '../../services/game';
import { openForkPageWithAuth, openIteratePageWithAuth } from '../../utils/authNavigation';
import { Storage } from '../../utils/storage';
import { isPlayableWorkId } from '../../utils/workPlayability';
import { PlayerLetterbox } from './coverLetterbox';
import { galleryAuthorName } from './SquareGalleryCard';
import WorkSandbox from './WorkSandbox';
import './creative-web.scss';

function unwrapGame(payload) {
  return payload?.game || payload?.data || payload || null;
}

function normalizeWork(work) {
  const id = work?.id == null ? '' : String(work.id).trim();
  return id ? { ...work, id } : null;
}

export function describeWorkRemix(work) {
  const user = Storage.getUser() || {};
  const userId = user.id || user.userId;
  const authorId = work?.authorId || work?.author?.id;
  const own = Boolean(userId && authorId && String(userId) === String(authorId));
  const remixDisabled = !own && work?.allowFork === false;
  const remixLabel = own ? '继续创作' : remixDisabled ? '作者未开放复刻' : '复刻并创作';
  return { own, remixDisabled, remixLabel };
}

export default function WorkExperienceOverlay({
  work,
  onClose,
  autoPlay = false,
  ariaLabel = '作品体验',
}) {
  const selected = normalizeWork(work);
  const playable = isPlayableWorkId(selected?.id);
  const dialog = useRef(null);
  const [resolved, setResolved] = useState(selected);
  const [playing, setPlaying] = useState(Boolean(autoPlay) && playable);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    setResolved(selected);
    setPlaying(Boolean(autoPlay) && playable);
    setMaximized(false);
  }, [selected?.id, autoPlay, playable]);

  useEffect(() => {
    const id = selected?.id;
    if (!id || !playable) {
      return undefined;
    }
    let active = true;
    getGame(id)
      .then((payload) => {
        const game = unwrapGame(payload);
        if (active && game?.id) {
          setResolved((previous) => ({ ...(previous || {}), ...game }));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [playable, selected?.id]);

  useEffect(() => {
    const node = dialog.current;
    if (!selected || !node) {
      return undefined;
    }
    node.showModal?.();
    return () => {
      if (node.open) {
        node.close?.();
      }
    };
  }, [selected?.id]);

  if (!selected) {
    return null;
  }

  const current = resolved || selected;
  const { own, remixDisabled, remixLabel } = describeWorkRemix(current);
  const title = current.title || '交互作品';
  const author = galleryAuthorName(current);
  const close = (reason = 'close') => onClose?.(reason);

  const remix = () => {
    dialog.current?.close();
    close('remix');
    return own ? openIteratePageWithAuth(current, current.id) : openForkPageWithAuth(current.id);
  };

  return (
    <div
      className="creative-web cw-experience-overlay-root"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          close('close');
        }
      }}
    >
      <dialog
        ref={dialog}
        className={`cw-dialog cw-experience-dialog${maximized ? ' is-maximized' : ''}`}
        aria-label={ariaLabel}
        aria-modal="true"
        onCancel={() => close('close')}
      >
        <div className="cw-dialog-head">
          <div className="cw-experience-heading">
            <h2>{title}</h2>
            <p className="cw-experience-author">{author}</p>
          </div>
          <div className="cw-dialog-head-actions">
            <button
              type="button"
              className="cw-experience-window-btn"
              aria-label={maximized ? '还原窗口' : '最大化'}
              aria-pressed={maximized}
              onClick={() => setMaximized((value) => !value)}
            >
              {maximized ? '还原' : '最大化'}
            </button>
            <button
              type="button"
              className="cw-icon-button"
              aria-label="关闭作品体验"
              onClick={() => close('close')}
            >
              ×
            </button>
          </div>
        </div>
        <div className="cw-dialog-stage">
          {!playable ? (
            <div className="cw-empty">
              <h3>这个作品暂时无法体验</h3>
              <p>精选卡还没有对应的可玩版本。请看看广场里已发布的作品。</p>
            </div>
          ) : playing ? (
            <PlayerLetterbox className="cw-square-stage">
              <WorkSandbox
                workId={current.id}
                className="cw-square-player"
                title={title}
                src={`/games/${encodeURIComponent(current.id)}/index.html`}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
              />
            </PlayerLetterbox>
          ) : (
            <div className="cw-empty">
              <p>{current.description}</p>
              <button type="button" className="cw-button cw-primary" onClick={() => setPlaying(true)}>
                开始体验
              </button>
            </div>
          )}
        </div>
        <div className="cw-dialog-foot">
          <span>复刻会创建你的独立作品，保留原作来源。</span>
          <button
            type="button"
            className="cw-button cw-primary"
            disabled={remixDisabled || !playable}
            onClick={remix}
          >
            {remixLabel}
          </button>
        </div>
      </dialog>
    </div>
  );
}
