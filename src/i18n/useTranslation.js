import { useContext } from 'react';
import { GameContext } from '../context/GameContext';
import translations from './index';

/**
 * Returns the translation object for the current language.
 * Usage:
 *   const t = useTranslation();
 *   t.shell.play        → "Play" / "Main" / "开始" / …
 *   t.games['memory-match'].title
 */
export function useTranslation() {
  const { langCode } = useContext(GameContext);
  return translations[langCode] || translations.en;
}
