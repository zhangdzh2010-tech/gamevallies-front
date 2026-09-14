import React, { useEffect, useState } from 'react';
import {
  registerWorkExperienceOverlayHost,
  unregisterWorkExperienceOverlayHost,
} from '../../utils/workExperienceRoute';
import WorkExperienceOverlay from './WorkExperienceOverlay';

export default function WorkExperienceHost({ autoPlay = true }) {
  const [work, setWork] = useState(null);

  useEffect(() => {
    registerWorkExperienceOverlayHost(setWork);
    return () => unregisterWorkExperienceOverlayHost();
  }, []);

  return (
    <WorkExperienceOverlay
      work={work}
      autoPlay={autoPlay}
      onClose={() => setWork(null)}
    />
  );
}
