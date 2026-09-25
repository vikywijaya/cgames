import { describe, it, expect } from 'vitest';
import { PUZZLES, BASE, turnForSlot, fitsSlot, makePieces, starsFor, piecePoints } from './tangramData';

function area(points) {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function inside(px, py, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

const all = Object.entries(PUZZLES).flatMap(([d, list]) => list.map(p => [d, p]));

describe('tangram puzzles', () => {
  it.each(all)('%s %o: every slot is a reachable turn of its piece', (_d, puzzle) => {
    for (const slot of puzzle.slots) {
      expect(turnForSlot(slot)).toBeGreaterThanOrEqual(0);
      expect(area(slot.points)).toBe(area(BASE[slot.kind]));
    }
  });

  it.each(all)('%s %o: slots do not overlap', (_d, puzzle) => {
    for (let x = -1; x < 10; x += 0.25) {
      for (let y = -1; y < 8; y += 0.25) {
        const px = x + 0.11, py = y + 0.07;
        const hits = puzzle.slots.filter(sl => inside(px, py, sl.points)).length;
        expect(hits).toBeLessThanOrEqual(1);
      }
    }
  });

  it('uses at most the seven classic pieces', () => {
    const limit = { L: 2, M: 1, S: 2, Q: 1, P: 1 };
    for (const [, puzzle] of all) {
      const count = {};
      for (const sl of puzzle.slots) count[sl.kind] = (count[sl.kind] ?? 0) + 1;
      for (const k of Object.keys(count)) expect(count[k]).toBeLessThanOrEqual(limit[k]);
    }
    for (const p of PUZZLES.hard) expect(p.slots).toHaveLength(7);
  });

  it('pre-turned pieces fit a slot; others need turning when possible', () => {
    const puzzle = PUZZLES.medium[0];
    const easy = makePieces(puzzle, true);
    for (const piece of easy) {
      expect(puzzle.slots.some(sl => fitsSlot(piece.kind, piece.turn, sl))).toBe(true);
    }
    const hard = makePieces(puzzle, false);
    const p = hard.find(pc => pc.kind === 'P');
    expect(puzzle.slots.some(sl => fitsSlot('P', p.turn, sl))).toBe(false);
  });

  it('turning keeps the shape on the grid', () => {
    for (let t = 0; t < 4; t++) {
      for (const [x, y] of piecePoints('P', t)) {
        expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      }
    }
  });

  it('gives 3/2/1 stars by hints used', () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(1)).toBe(2);
    expect(starsFor(4)).toBe(1);
  });
});
