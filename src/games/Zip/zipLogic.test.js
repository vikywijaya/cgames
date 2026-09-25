import { describe, it, expect } from 'vitest';
import { randomHamiltonianPath, makePuzzle, extensionError, isAdjacent, solveFrom, hintFor, starsFor, isStuck } from './zipLogic';

function checkPath(path, size) {
  expect(new Set(path).size).toBe(size * size);
  for (let i = 1; i < path.length; i++) expect(isAdjacent(path[i - 1], path[i], size)).toBe(true);
}

describe('zipLogic', () => {
  it('builds full, connected paths', () => {
    for (const size of [4, 5, 6, 7]) checkPath(randomHamiltonianPath(size), size);
  });

  it('puzzles are always solvable: the solution visits numbers in order', () => {
    for (let k = 0; k < 40; k++) {
      const size = 4 + (k % 4);
      const p = makePuzzle(size, 8);
      checkPath(p.solution, size);
      const nums = p.solution.filter(c => p.numbers[c] != null).map(c => p.numbers[c]);
      expect(nums).toEqual(nums.map((_, i) => i + 1));
      expect(p.numbers[p.solution[0]]).toBe(1);
      expect(p.numbers[p.solution[size * size - 1]]).toBe(p.maxWaypoint);
      // Replaying the solution is accepted move by move
      for (let i = 1; i < p.solution.length; i++) {
        expect(extensionError(p.solution.slice(0, i), p.solution[i], p)).toBeNull();
      }
    }
  });

  it('rejects out-of-order numbers and gaps', () => {
    const p = { size: 3, numbers: { 0: 1, 2: 2, 8: 3 } };
    expect(extensionError([0], 4, p)).toBe('notAdjacent');
    expect(extensionError([0, 1, 4, 5], 8, p)).toBe('order');
    expect(extensionError([0, 1], 0, p)).toBe('visited');
  });

  it('solver finishes from the start and hints always make progress', () => {
    for (let k = 0; k < 10; k++) {
      const p = makePuzzle(5, 7);
      const start = [p.solution[0]];
      const solved = solveFrom(start, p);
      expect(solved).not.toBeNull();
      checkPath(solved, 5);
      let path = start;
      for (let s = 0; s < 25 && path.length < 25; s++) path = hintFor(path, p).path;
      expect(path.length).toBe(25);
    }
  });

  it('hint steps back from a dead end', () => {
    const p = { size: 3, numbers: { 0: 1, 8: 2 }, solution: [0, 1, 2, 5, 4, 3, 6, 7, 8] };
    const dead = [0, 1, 4, 7, 6, 3]; // boxed in at the left edge
    expect(isStuck(dead, p)).toBe(true);
    const h = hintFor(dead, p);
    expect(h.path.length).toBeGreaterThan(1);
    expect(isStuck(h.path, p)).toBe(false);
  });

  it('awards stars by hints used', () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(2)).toBe(2);
    expect(starsFor(5)).toBe(1);
  });
});
