import { describe, it, expect } from 'vitest';
import { generatePuzzle, evaluate, starsFor } from './MathCross';

describe('MathCross generator', () => {
  for (const diff of ['easy', 'medium', 'hard']) {
    it(`${diff}: puzzles are always solvable with the tray numbers`, () => {
      for (let n = 0; n < 300; n++) {
        const p = generatePuzzle(diff);
        // tray is exactly the answers of the blanks
        expect([...p.tray].sort((a, b) => a - b))
          .toEqual(p.slots.map(k => p.cells[k].answer).sort((a, b) => a - b));
        expect(p.slots.length).toBeGreaterThan(0);
        for (const eq of p.equations) {
          const [x, y, z] = eq.cells.map(k => p.cells[k].answer);
          expect(evaluate(x, eq.op, y)).toBe(z);
          expect(Math.min(x, y, z)).toBeGreaterThan(0);
          // every equation keeps at least one printed clue
          expect(eq.cells.some(k => p.cells[k].type === 'number')).toBe(true);
        }
      }
    });
  }

  it('awards 3 stars for no help, fewer with help, never zero', () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(1)).toBe(2);
    expect(starsFor(2)).toBe(2);
    expect(starsFor(5)).toBe(1);
  });
});
