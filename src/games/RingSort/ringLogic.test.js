import { describe, it, expect } from 'vitest';
import { generatePuzzle, solve, isSolved, isRodDone, applyMove, canMove, hintMove, starsFor } from './ringLogic';
import { DIFFICULTY_CONFIG } from './RingSort';

describe('ringLogic', () => {
  it('detects solved boards', () => {
    expect(isSolved([[0, 0, 0], [1, 1, 1], []], 3)).toBe(true);
    expect(isSolved([[0, 0, 1], [1, 1, 0], []], 3)).toBe(false);
    expect(isRodDone([2, 2, 2], 3)).toBe(true);
  });

  it('only allows moves onto rods with space', () => {
    const rods = [[0, 0, 0, 1], [1], []];
    expect(canMove(rods, 1, 0, 4)).toBe(false);
    expect(canMove(rods, 0, 2, 4)).toBe(true);
    expect(canMove(rods, 2, 0, 4)).toBe(false);
    expect(applyMove(rods, 0, 1)).toEqual([[0, 0, 0], [1, 1], []]);
  });

  it('scores stars by help used', () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(2)).toBe(2);
    expect(starsFor(5)).toBe(1);
  });

  for (const [level, cfg] of Object.entries(DIFFICULTY_CONFIG)) {
    it(`${level}: generated puzzles are unsolved, well-formed and solvable`, () => {
      for (let i = 0; i < 25; i++) {
        const rods = generatePuzzle(cfg);
        expect(rods).toHaveLength(cfg.numColors + cfg.extraRods);
        expect(rods.flat()).toHaveLength(cfg.numColors * cfg.ringsPerColor);
        expect(rods.every(r => r.length <= cfg.rodCapacity)).toBe(true);
        expect(rods.some(r => isRodDone(r, cfg.ringsPerColor))).toBe(false);
        const path = solve(rods, cfg);
        expect(path).not.toBeNull();
        const end = path.reduce((b, [f, t]) => applyMove(b, f, t), rods);
        expect(isSolved(end, cfg.ringsPerColor)).toBe(true);
      }
    });
  }

  it('following hints always finishes the puzzle', () => {
    const cfg = DIFFICULTY_CONFIG.hard;
    let rods = generatePuzzle(cfg);
    for (let n = 0; n < 200 && !isSolved(rods, cfg.ringsPerColor); n++) {
      const [f, t] = hintMove(rods, cfg);
      rods = applyMove(rods, f, t);
    }
    expect(isSolved(rods, cfg.ringsPerColor)).toBe(true);
  });
});
