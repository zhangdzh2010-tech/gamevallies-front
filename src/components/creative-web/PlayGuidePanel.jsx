import React from 'react';

export function PlayGuideButton({ open = false, onClick }) {
  return (
    <button
      type="button"
      className="play-guide-btn cw-play-guide-btn"
      aria-expanded={Boolean(open)}
      aria-controls="work-play-guide"
      onClick={onClick}
    >
      玩法说明
    </button>
  );
}

export function PlayGuideSheet({ title, text, onDismiss }) {
  return (
    <aside id="work-play-guide" className="play-guide-sheet cw-play-guide-sheet" role="region" aria-label="玩法说明">
      <div className="play-guide-body">
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
      <button
        type="button"
        className="play-guide-dismiss cw-play-guide-dismiss"
        aria-label="关闭玩法说明"
        onClick={onDismiss}
      >
        ×
      </button>
    </aside>
  );
}
