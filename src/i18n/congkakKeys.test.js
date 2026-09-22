import { describe, it, expect } from 'vitest';
import translations from './index';

const LANGS = ['en', 'ms', 'zh', 'ta', 'id'];

const NEW_MULTIPLAYER_KEYS = [
  'holeYours', 'holeOpponent', 'storeLabel', 'namedWins',
  'reasonMostSeeds', 'reasonDraw', 'reasonResigned',
  'announceCapture', 'announceExtraTurn', 'announceSown',
];

const EXISTING_KEYS_CONGKAK_USES = [
  'yourTurnBadge', 'undo', 'undoShort', 'resign', 'resetGame',
  'playAgain', 'gameOver', 'draw',
];

describe('congkak translations', () => {
  it.each(LANGS)('%s has a title and description for mp-congkak', lang => {
    const entry = translations[lang].games['mp-congkak'];
    expect(entry).toBeDefined();
    expect(entry.title).toBeTruthy();
    expect(entry.description).toBeTruthy();
  });

  it.each(LANGS)('%s defines every congkak-specific multiplayer key', lang => {
    NEW_MULTIPLAYER_KEYS.forEach(key => {
      expect(translations[lang].multiplayer[key], `${lang}.multiplayer.${key}`).toBeTruthy();
    });
  });

  it.each(LANGS)('%s still defines the shared keys congkak reuses', lang => {
    EXISTING_KEYS_CONGKAK_USES.forEach(key => {
      expect(translations[lang].multiplayer[key], `${lang}.multiplayer.${key}`).toBeTruthy();
    });
  });

  it.each(LANGS)('%s keeps the placeholders the code substitutes', lang => {
    const m = translations[lang].multiplayer;
    expect(m.holeYours).toContain('{n}');
    expect(m.holeYours).toContain('{seeds}');
    expect(m.holeOpponent).toContain('{n}');
    expect(m.holeOpponent).toContain('{seeds}');
    expect(m.storeLabel).toContain('{p}');
    expect(m.storeLabel).toContain('{seeds}');
    expect(m.namedWins).toContain('{name}');
    expect(m.announceCapture).toContain('{n}');
  });
});
