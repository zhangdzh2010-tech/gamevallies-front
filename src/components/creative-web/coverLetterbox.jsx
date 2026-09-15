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
  const [metrics, setMetrics] = useState({ scale: 0, x: 0, y: 0 });
  useEffect(() => {
    const node = stage.current;
    if (!node) return undefined;
    const update = () => {
      const { width, height } = node.getBoundingClientRect();
      if (!width || !height) return;
      const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
      setMetrics({
        scale,
        x: (width - DESIGN_WIDTH * scale) / 2,
        y: (height - DESIGN_HEIGHT * scale) / 2,
      });
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
      <div
        className="cw-player-scaler"
        style={{ transform: `translate(${metrics.x}px, ${metrics.y}px) scale(${metrics.scale || 0})` }}
      >
        {children}
      </div>
    </div>
  );
}
