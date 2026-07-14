import { describe, it, expect } from 'vitest';
import translations from './index';

const APP_KEYS = [
  'playWithFriend', 'playWithFriendDesc',
  'multiplayerTitle', 'multiplayerSubtitle',
  'multiplayerExternalBadge', 'multiplayerPlayers',
];

const GAME_IDS = [
  'mp-chess', 'mp-xiangqi', 'mp-gin-rummy', 'mp-crazy-eights', 'mp-singapore-trivia',
];

describe('multiplayer i18n keys', () => {
  for (const lang of Object.keys(translations)) {
    it(`${lang} has all multiplayer app keys`, () => {
      for (const key of APP_KEYS) {
        expect(translations[lang].app[key]).toBeTruthy();
      }
    });

    it(`${lang} has all multiplayer game entries`, () => {
      for (const id of GAME_IDS) {
        expect(translations[lang].games[id]?.title).toBeTruthy();
        expect(translations[lang].games[id]?.description).toBeTruthy();
      }
    });
  }
});
