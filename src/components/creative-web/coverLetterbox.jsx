import React, { useEffect, useRef, useState } from 'react';

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

export function CoverMatte({ src, alt = '' }) {
  if (!src) return null;
  return (
    <div className="cw-cover-matte">
      <img src={src} alt={alt} loading="lazy" />
    </div>
  );
}

export function PlayerLetterbox({ children, className = '' }) {
  const stage = useRef(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const node = stage.current;
    if (!node) return undefined;
    const update = () => {
      const { width, height } = node.getBoundingClientRect();
      if (!width || !height) return;
      setScale(Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT));
    };
    update();
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={stage} className={['cw-player-letterbox', 'cw-player-letterbox--scaled', className].filter(Boolean).join(' ')}>
      <div className="cw-player-scaler" style={{ transform: `scale(${scale || 0})` }}>
        {children}
      </div>
    </div>
  );
}
