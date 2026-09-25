import { describe, it, expect } from 'vitest';
import { DIFFICULTY_CONFIG, generatePuzzle, countSolutions, sums, starsFor } from './Sumix';

describe('Sumix puzzles', () => {
  for (const [level, config] of Object.entries(DIFFICULTY_CONFIG)) {
    it(`${level}: the stored solution meets every target`, () => {
      for (let i = 0; i < 15; i++) {
        const p = generatePuzzle(config);
        const { rowSums, colSums } = sums(p.grid, p.solution);
        expect(rowSums).toEqual(p.rowTargets);
        expect(colSums).toEqual(p.colTargets);
        expect(p.rowTargets.every(n => n > 0)).toBe(true);
        expect(p.colTargets.every(n => n > 0)).toBe(true);
        expect(countSolutions(p.grid, p.rowTargets, p.colTargets)).toBeGreaterThanOrEqual(1);
      }
    });
  }

  it('usually has exactly one answer so hints are meaningful', () => {
    let unique = 0;
    for (let i = 0; i < 10; i++) {
      const p = generatePuzzle(DIFFICULTY_CONFIG.medium);
      if (countSolutions(p.grid, p.rowTargets, p.colTargets) === 1) unique++;
    }
    expect(unique).toBeGreaterThanOrEqual(9);
  });
});

describe('starsFor', () => {
  it('gives 3 stars without hints, then 2, then 1', () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(1)).toBe(2);
    expect(starsFor(2)).toBe(2);
    expect(starsFor(3)).toBe(1);
    expect(starsFor(9)).toBe(1);
  });
});
