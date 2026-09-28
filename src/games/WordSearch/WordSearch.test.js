import { describe, it, expect } from 'vitest';
import { DIFFICULTY_CONFIG, generatePuzzle, cellsOnLine, matchSelection, splitLetters } from './useWordSearch';
import en from '../../i18n/en';
import zh from '../../i18n/zh';
import ta from '../../i18n/ta';
import ms from '../../i18n/ms';
import id from '../../i18n/id';

const LANGS = { en, zh, ta, ms, id };

describe('Word Search puzzles', () => {
  for (const [lang, t] of Object.entries(LANGS)) {
    for (const [diff, config] of Object.entries(DIFFICULTY_CONFIG)) {
      it(`${lang}/${diff}: every listed word is really in the grid`, () => {
        for (let n = 0; n < 20; n++) {
          const { grid, placed } = generatePuzzle(config, t.games['word-search'].words);
          expect(placed.length).toBe(config.wordCount);
          expect(grid.length).toBe(config.size);
          for (const p of placed) {
            expect(p.cells.map(({ row, col }) => grid[row][col]).join('')).toBe(p.word);
          }
        }
      });
    }
  }

  it('splits Tamil into letters', () => {
    expect(splitLetters('நாய்')).toEqual(['நா', 'ய்']);
  });

  it('matches forwards and backwards selections', () => {
    const grid = [['C', 'A', 'T'], ['X', 'X', 'X'], ['X', 'X', 'X']];
    const placed = [{ word: 'CAT', cells: [] }];
    const fwd = cellsOnLine({ row: 0, col: 0 }, { row: 0, col: 2 });
    const back = cellsOnLine({ row: 0, col: 2 }, { row: 0, col: 0 });
    expect(matchSelection(fwd, grid, placed, new Set())).toBe('CAT');
    expect(matchSelection(back, grid, placed, new Set())).toBe('CAT');
    expect(matchSelection(fwd, grid, placed, new Set(['CAT']))).toBe(null);
    expect(cellsOnLine({ row: 0, col: 0 }, { row: 1, col: 2 })).toBe(null);
  });

  it('never puts a word inside another word in the same puzzle', () => {
    const bank = ['TEA', 'TEAPOT', 'CAT', 'CATS', 'SUN', 'NUS', 'DOG', 'BIRD', 'FISH', 'MILK'];
    for (let n = 0; n < 50; n++) {
      const words = generatePuzzle(DIFFICULTY_CONFIG.hard, bank).placed.map((p) => p.word);
      for (const a of words) for (const b of words) {
        if (a !== b) expect(b.includes(a) || b.includes([...a].reverse().join(''))).toBe(false);
      }
    }
  });
});
