import { createContext, useContext } from 'react';

export const GameContext = createContext({ hideDifficulty: false, hideHeader: false, langCode: 'en', isDailyChallenge: false });

export function useGameContext() {
  return useContext(GameContext);
}
