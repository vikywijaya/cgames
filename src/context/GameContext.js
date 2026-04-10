import { createContext, useContext } from 'react';

export const GameContext = createContext({ hideDifficulty: false, langCode: 'en' });

export function useGameContext() {
  return useContext(GameContext);
}
