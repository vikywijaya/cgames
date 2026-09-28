import { describe, it, expect } from 'vitest';
import { PUZZLES, PUZZLE_COUNT, BASE, turnForSlot, fitsSlot, makePieces, starsFor, piecePoints, pickPuzzles } from './tangramData';
import en from '../../i18n/en';
import ms from '../../i18n/ms';
import zh from '../../i18n/zh';
import ta from '../../i18n/ta';
import id from '../../i18n/id';

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

  it('each difficulty pool has at least 7 pictures', () => {
    for (const d of ['easy', 'medium', 'hard']) {
      expect(PUZZLES[d].length).toBeGreaterThanOrEqual(7);
    }
  });

  it('pool names are unique within each difficulty', () => {
    for (const d of ['easy', 'medium', 'hard']) {
      const names = PUZZLES[d].map(p => p.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('easy pictures use 3-4 pieces, medium 5, hard all 7', () => {
    for (const p of PUZZLES.easy) expect(p.slots.length).toBeGreaterThanOrEqual(3);
    for (const p of PUZZLES.easy) expect(p.slots.length).toBeLessThanOrEqual(4);
    for (const p of PUZZLES.medium) expect(p.slots.length).toBe(5);
    for (const p of PUZZLES.hard) expect(p.slots.length).toBe(7);
  });

  it('picks a non-repeating subset of the configured size for each difficulty', () => {
    for (const d of ['easy', 'medium', 'hard']) {
      const rand = (() => { let i = 0; const seq = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6, 0.5]; return () => seq[i++ % seq.length]; })();
      const picked = pickPuzzles(d, rand);
      expect(picked.length).toBe(PUZZLE_COUNT[d]);
      expect(new Set(picked.map(p => p.name)).size).toBe(picked.length);
      for (const p of picked) expect(PUZZLES[d].some(q => q.name === p.name)).toBe(true);
    }
  });

  it('every pool picture has a translated name in all 5 languages', () => {
    const langs = { en, ms, zh, ta, id };
    for (const d of ['easy', 'medium', 'hard']) {
      for (const puzzle of PUZZLES[d]) {
        for (const [lang, dict] of Object.entries(langs)) {
          const name = dict.games?.tangram?.names?.[puzzle.name];
          expect(name, `${lang} missing name for "${puzzle.name}"`).toBeTruthy();
        }
      }
    }
  });
});
