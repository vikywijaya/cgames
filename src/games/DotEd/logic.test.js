import { describe, it, expect } from 'vitest';
import {
  HAND_LEVELS, S, T, cloneGrid, isSolvable, findHint, transfer, isSolved, findPath, starsFor,
  generateLevel, buildLevelPool,
} from './logic';

describe('DotEd puzzles', () => {
  for (const [diff, levels] of Object.entries(HAND_LEVELS)) {
    levels.forEach((level, i) => {
      it(`${diff} puzzle ${i + 1} is solvable and following hints solves it`, () => {
        const g = cloneGrid(level.grid);
        expect(isSolvable(g)).toBe(true);
        for (let steps = 0; !isSolved(g); steps++) {
          const m = findHint(g);
          expect(m).not.toBeNull();
          expect(transfer(g, [m.from], m.to).length).toBeGreaterThan(0);
          expect(steps).toBeLessThan(50);
        }
      });
    });
  }

  it('full targets block lines', () => {
    const g = [[S('s1', 1), T('t1', 0), T('t2', 1)]];
    expect(findPath(g, 's1', 't2')).toBeNull();
    expect(findHint(g)).toBeNull();
  });

  it('awards stars by help used', () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(2)).toBe(2);
    expect(starsFor(5)).toBe(1);
  });

  const SIZE_BOUNDS = {
    easy:   { cells: [2, 4],  rows: [1, 2] },
    medium: { cells: [4, 7],  rows: [2, 3] },
    hard:   { cells: [7, 10], rows: [2, 4] },
  };

  for (const diff of ['easy', 'medium', 'hard']) {
    describe(`${diff} generated puzzles`, () => {
      const bounds = SIZE_BOUNDS[diff];

      it('200 generated puzzles are all solvable by following hints, and sized within bounds', () => {
        for (let n = 0; n < 200; n++) {
          const level = generateLevel(diff);
          expect(level).not.toBeNull();
          const { grid } = level;

          expect(grid.length).toBeGreaterThanOrEqual(bounds.rows[0]);
          expect(grid.length).toBeLessThanOrEqual(bounds.rows[1]);
          const cellCount = grid.flat().filter(Boolean).length;
          expect(cellCount).toBeGreaterThanOrEqual(bounds.cells[0]);
          expect(cellCount).toBeLessThanOrEqual(bounds.cells[1]);

          expect(isSolved(grid)).toBe(false); // not trivially already solved
          const g = cloneGrid(grid);
          expect(isSolvable(g)).toBe(true);
          for (let steps = 0; !isSolved(g); steps++) {
            const m = findHint(g);
            expect(m).not.toBeNull();
            expect(transfer(g, [m.from], m.to).length).toBeGreaterThan(0);
            expect(steps).toBeLessThan(50);
          }
        }
      });
    });
  }

  it('consecutive generated rounds differ (very unlikely to collide by chance)', () => {
    const key = pool => JSON.stringify(pool.map(l => l.grid));
    const a = buildLevelPool('hard', 5);
    const b = buildLevelPool('hard', 5);
    expect(key(a)).not.toBe(key(b));
  });
});
