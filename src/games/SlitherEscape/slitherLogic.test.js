import { describe, it, expect } from 'vitest';
import { DIFFICULTY_CONFIG, applyMove, solve, generateLevel, slide, starsFor } from './slitherLogic';

describe('slitherLogic', () => {
  it('slides until blocked and escapes on reaching its exit', () => {
    const snakes = [
      { id: 0, cells: [[2, 1], [2, 2]], exitCell: [0, 2], exitDir: 'up', out: false },
      { id: 1, cells: [[4, 3], [4, 4]], exitCell: [2, 4], exitDir: 'right', out: false },
    ];
    expect(slide(snakes, 0, 'up', 5, 5)).toEqual({ cells: [[0, 1], [0, 2]], escaped: true });
    expect(slide(snakes, 1, 'down', 5, 5)).toBeNull();
    const after = applyMove(snakes, 0, 'left', 5, 5);
    expect(after[0].cells).toEqual([[2, 0], [2, 1]]);
    expect(after[0].out).toBe(false);
  });

  it('generates puzzles that the solver proves solvable, with the right length', () => {
    for (const diff of Object.keys(DIFFICULTY_CONFIG)) {
      const cfg = DIFFICULTY_CONFIG[diff];
      for (let i = 0; i < 5; i++) {
        const lv = generateLevel(diff);
        expect(lv.snakes).toHaveLength(cfg.snakes);
        let state = lv.snakes;
        const path = solve(state, lv.rows, lv.cols);
        expect(path).not.toBeNull();
        expect(path.length).toBe(lv.par);
        for (const { si, dir } of path) state = applyMove(state, si, dir, lv.rows, lv.cols);
        expect(state.every(s => s.out)).toBe(true);
      }
    }
  });

  it('awards 3 stars without help and never fewer than 1', () => {
    expect(starsFor({})).toBe(3);
    expect(starsFor({ hints: 1 })).toBe(2);
    expect(starsFor({ undos: 1 })).toBe(3);
    expect(starsFor({ hints: 5, resets: 3 })).toBe(1);
  });
});
