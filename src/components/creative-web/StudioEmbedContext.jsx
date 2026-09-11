import React, { createContext, useContext } from 'react';

export const StudioEmbedContext = createContext(null);

export function useStudioEmbed() {
  return useContext(StudioEmbedContext);
}
