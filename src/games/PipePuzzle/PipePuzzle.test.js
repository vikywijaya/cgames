import { describe, it, expect } from 'vitest';
import { buildPuzzle, checkWin, findHintTile, isTileRight, starsFor, DIFFICULTY_CONFIG } from './PipePuzzle';

function solveWithHints(p, rows, cols) {
  let grid = p.grid;
  let steps = 0;
  while (!checkWin(grid, p.colorPairs, rows, cols)) {
    const at = findHintTile(grid, p.colorPairs, rows, cols);
    expect(at).not.toBeNull();
    const [r, c] = at;
    grid = grid.map((row, ri) => row.map((cl, ci) => (ri === r && ci === c ? { ...cl, currentRotation: cl.solvedRotation } : cl)));
    steps += 1;
    expect(steps).toBeLessThan(rows * cols + 1);
  }
  return steps;
}

describe('PipePuzzle generation', () => {
  for (const [level, { rows, cols, numColors }] of Object.entries(DIFFICULTY_CONFIG)) {
    it(`${level}: puzzles start unsolved, have every pair and hints always reach a solution`, () => {
      for (let i = 0; i < 200; i++) {
        const p = buildPuzzle(rows, cols, numColors);
        expect(p.colorPairs.length).toBe(numColors);
        expect(checkWin(p.grid, p.colorPairs, rows, cols)).toBe(false);
        expect(p.initial).toBe(p.grid);
        const tiles = p.grid.flat().filter(c => c && !c.isEndpoint);
        expect(tiles.every(c => !isTileRight(c))).toBe(true);
        expect(solveWithHints(p, rows, cols)).toBeGreaterThan(0);
      }
    });
  }
});

describe('starsFor', () => {
  it('gives 3 / 2 / 1 stars for 0 / 1 / more hints', () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(1)).toBe(2);
    expect(starsFor(4)).toBe(1);
  });
});
