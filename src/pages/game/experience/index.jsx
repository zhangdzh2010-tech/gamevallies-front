import React, { useEffect, useState } from 'react';
import { useRoute } from '@tarojs/hooks';
import WorkSandbox from '../../../components/creative-web/WorkSandbox';
import { PlayerLetterbox } from '../../../components/creative-web/coverLetterbox';
import { galleryAuthorName } from '../../../components/creative-web/SquareGalleryCard';
import '../../../components/creative-web/creative-web.scss';
import { getGame } from '../../../services/game';
import {
  HOME_PAGE_URL,
  openForkPageWithAuth,
  openIteratePageWithAuth,
} from '../../../utils/authNavigation';
import { navigateBackOrHome } from '../../../utils/navigation';
import { Storage } from '../../../utils/storage';
import {
  WORK_EXPERIENCE_PAGE_PATH,
  consumePendingExperienceWork,
  useWorkShellGuard,
} from '../../../utils/workExperienceRoute';
import './index.scss';

function unwrapGame(payload) {
  return payload?.game || payload?.data || payload || null;
}

export default function WorkExperiencePage() {
  const route = useRoute();
  const workId = route.params?.id == null ? '' : String(route.params.id).trim();
  const routePath = route.path || WORK_EXPERIENCE_PAGE_PATH;
  const blocked = useWorkShellGuard(routePath, workId);
  const [work, setWork] = useState(() => consumePendingExperienceWork(workId) || { id: workId });

  useEffect(() => {
    if (!workId || blocked) {
      return undefined;
    }
    let active = true;
    getGame(workId)
      .then((payload) => {
        const game = unwrapGame(payload);
        if (active && game?.id) {
          setWork((previous) => ({ ...previous, ...game }));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [blocked, workId]);

  if (blocked || !workId) {
    return null;
  }

  const user = Storage.getUser() || {};
  const userId = user.id || user.userId;
  const authorId = work.authorId || work.author?.id;
  const own = Boolean(userId && authorId && String(userId) === String(authorId));
  const remixDisabled = !own && work.allowFork === false;
  const remixLabel = own ? '继续创作' : remixDisabled ? '作者未开放复刻' : '复刻并创作';
  const title = work.title || '交互作品';
  const author = galleryAuthorName(work);

  const remix = () => (
    own ? openIteratePageWithAuth(work, work.id) : openForkPageWithAuth(work.id)
  );

  return (
    <div className="creative-web cw-experience-page">
      <header className="cw-experience-page__head">
        <button
          type="button"
          className="cw-icon-button"
          aria-label="返回"
          onClick={() => navigateBackOrHome(HOME_PAGE_URL)}
        >
          ←
        </button>
        <div className="cw-experience-page__copy">
          <h1>{title}</h1>
          <p className="cw-experience-page__author">{author}</p>
        </div>
      </header>
      <div className="cw-dialog-stage cw-experience-page__stage">
        <PlayerLetterbox className="cw-square-stage">
          <WorkSandbox
            workId={work.id}
            className="cw-square-player"
            title={title}
            src={`/games/${encodeURIComponent(work.id)}/index.html`}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
          />
        </PlayerLetterbox>
      </div>
      <footer className="cw-experience-page__foot">
        <span>复刻会创建你的独立作品，保留原作来源。</span>
        <button
          type="button"
          className="cw-button cw-primary"
          disabled={remixDisabled}
          onClick={remix}
        >
          {remixLabel}
        </button>
      </footer>
    </div>
  );
}
