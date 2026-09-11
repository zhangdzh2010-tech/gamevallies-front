import React from 'react';
import GameIteratePage from '../../pages/game/iterate/index';
import Create from '../../pages/create/index';
import { StudioEmbedContext } from './StudioEmbedContext';

export default function CreativeStudioPanel({ context, onClose }) {
  if (!context?.mode) {
    return null;
  }

  const embedValue = {
    inPage: true,
    mode: context.mode,
    gameId: context.gameId || '',
    taskId: context.taskId || '',
    game: context.game || null,
    onClose,
  };

  return (
    <StudioEmbedContext.Provider value={embedValue}>
      <div className="cw-studio-panel">
        {context.mode === 'iterate' ? <GameIteratePage /> : null}
        {context.mode === 'create-task' ? <Create /> : null}
      </div>
    </StudioEmbedContext.Provider>
  );
}
