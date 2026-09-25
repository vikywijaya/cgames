import { describe, it, expect } from 'vitest';
import { LEVELS, S, T, cloneGrid, isSolvable, findHint, transfer, isSolved, findPath, starsFor } from './logic';

describe('DotEd puzzles', () => {
  for (const [diff, levels] of Object.entries(LEVELS)) {
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
});
