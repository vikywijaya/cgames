import { createContext, useContext } from 'react';

export const GameContext = createContext({ hideDifficulty: false });

export function useGameContext() {
  return useContext(GameContext);
}
