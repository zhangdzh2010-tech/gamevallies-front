import React from 'react';

export function CoverMatte({ src, alt = '' }) {
  if (!src) return null;
  return (
    <div className="cw-cover-matte">
      <img src={src} alt={alt} loading="lazy" />
    </div>
  );
}

export function PlayerLetterbox({ children, className = '' }) {
  return (
    <div className={['cw-player-letterbox', 'cw-player-letterbox--scaled', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
