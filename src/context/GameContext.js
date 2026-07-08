import { createContext, useContext } from 'react';

export const GameContext = createContext({ hideDifficulty: false, langCode: 'en', isDailyChallenge: false });

export function useGameContext() {
  return useContext(GameContext);
}
