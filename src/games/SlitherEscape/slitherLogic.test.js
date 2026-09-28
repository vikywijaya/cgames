import { describe, it, expect } from 'vitest';
import {
  DIFFICULTY_CONFIG, moveSnake, validMoves, solve, nextHint, generateSet, starsFor, tutorialLevel, facesAway,
} from './slitherLogic';

// An L-shaped corridor: row 0 cols 0-3, then down column 3 to row 2.
const L_TILES = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3]];
const lLevel = (snakes) => ({ tiles: L_TILES, rows: 4, cols: 4, snakes });

describe('slitherLogic move rules', () => {
  it('the body follows the head and bends round a corner', () => {
    const lv = lLevel([{ id: 0, cells: [[0, 2], [0, 1], [0, 0]], exit: [3, 3], exitDir: 'down', out: false }]);
    let s = lv.snakes;
    s = moveSnake(lv, s, 0, 'right').snakes;
    expect(s[0].cells).toEqual([[0, 3], [0, 2], [0, 1]]);
    s = moveSnake(lv, s, 0, 'down').snakes;
    expect(s[0].cells).toEqual([[1, 3], [0, 3], [0, 2]]);
  });

  it('cannot reverse into its own body or go into walls', () => {
    const lv = lLevel([{ id: 0, cells: [[0, 2], [0, 1], [0, 0]], exit: [3, 3], exitDir: 'down', out: false }]);
    expect(moveSnake(lv, lv.snakes, 0, 'left')).toEqual({ ok: false, reason: 'self' });
    expect(moveSnake(lv, lv.snakes, 0, 'down')).toEqual({ ok: false, reason: 'wall' });
    expect(moveSnake(lv, lv.snakes, 0, 'up')).toEqual({ ok: false, reason: 'wall' });
    expect(validMoves(lv, lv.snakes, 0).map(m => m.dir)).toEqual(['right']);
  });

  it('is blocked by other snakes and cannot use another snake\'s door', () => {
    const lv = lLevel([
      { id: 0, cells: [[0, 1], [0, 0]], exit: [3, 3], exitDir: 'down', out: false },
      { id: 1, cells: [[1, 3], [2, 3]], exit: [0, 4], exitDir: 'right', out: false },
    ]);
    let s = moveSnake(lv, lv.snakes, 0, 'right').snakes;
    s = moveSnake(lv, s, 0, 'right').snakes;
    expect(moveSnake(lv, s, 0, 'down')).toEqual({ ok: false, reason: 'snake' });
    expect(moveSnake(lv, s, 0, 'right')).toEqual({ ok: false, reason: 'wall' });
  });

  it('a snake whose head enters its own door leaves, freeing its tiles', () => {
    const lv = { tiles: [[0, 0], [0, 1], [0, 2]], rows: 1, cols: 4, snakes: [
      { id: 0, cells: [[0, 2], [0, 1]], exit: [0, 3], exitDir: 'right', out: false },
    ] };
    const res = moveSnake(lv, lv.snakes, 0, 'right');
    expect(res.ok).toBe(true);
    expect(res.escaped).toBe(true);
    expect(res.snakes[0].out).toBe(true);
    expect(solve(lv, res.snakes)).toEqual([]);
  });

  it('tutorial is a straight corridor with the door straight ahead', () => {
    for (let i = 0; i < 10; i++) {
      const lv = tutorialLevel();
      expect(lv.rows).toBe(1);
      expect(lv.snakes).toHaveLength(1);
      expect(facesAway(lv.snakes[0])).toBe(false);
      expect(new Set(lv.solution.map(m => m.dir)).size).toBe(1);
    }
  });
});

describe('slitherLogic generation', () => {
  const ranges = { easy: [1, 2], medium: [2, 3], hard: [3, 4] };
  for (const diff of Object.keys(DIFFICULTY_CONFIG)) {
    it(`every ${diff} puzzle is unsolved and can be finished by following hints`, () => {
      for (let g = 0; g < 3; g++) {
        const set = generateSet(diff);
        expect(set).toHaveLength(DIFFICULTY_CONFIG[diff].puzzles);
        if (diff === 'easy') expect(set[0].kind).toBe('tutorial');
        for (const lv of set) {
          expect(lv.snakes.length).toBeGreaterThanOrEqual(ranges[diff][0]);
          expect(lv.snakes.length).toBeLessThanOrEqual(ranges[diff][1]);
          expect(lv.snakes.some(s => !s.out)).toBe(true);
          if (diff !== 'easy') expect(lv.snakes.some(facesAway)).toBe(true);
          let state = lv.snakes;
          for (let n = 0; n < 60 && !state.every(s => s.out); n++) {
            const h = nextHint(lv, state);
            expect(h).not.toBeNull();
            const res = moveSnake(lv, state, h.si, h.dir);
            expect(res.ok).toBe(true);
            state = res.snakes;
          }
          expect(state.every(s => s.out)).toBe(true);
        }
      }
    }, 60000);
  }
});

describe('stars', () => {
  it('awards 3 stars without hints and never fewer than 1', () => {
    expect(starsFor({})).toBe(3);
    expect(starsFor({ hints: 1 })).toBe(2);
    expect(starsFor({ undos: 4 })).toBe(3);
    expect(starsFor({ hints: 5 })).toBe(1);
  });
});
