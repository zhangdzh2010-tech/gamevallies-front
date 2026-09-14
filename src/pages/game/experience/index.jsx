import React, { useEffect, useState } from 'react';
import { useRoute } from '@tarojs/hooks';
import WorkExperienceOverlay from '../../../components/creative-web/WorkExperienceOverlay';
import { getGame } from '../../../services/game';
import { HOME_PAGE_URL } from '../../../utils/authNavigation';
import { navigateBackOrHome } from '../../../utils/navigation';
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

  return (
    <div className="cw-experience-page">
      <WorkExperienceOverlay
        work={work}
        autoPlay
        ariaLabel="作品体验"
        onClose={(reason) => {
          if (reason === 'remix') {
            return;
          }
          navigateBackOrHome(HOME_PAGE_URL);
        }}
      />
    </div>
  );
}
