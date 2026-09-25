import { describe, it, expect } from 'vitest';
import { generatePuzzle, hintMove, findFit, starsFor, DIFFICULTY_CONFIG } from './BlockPuzzle';

const key = ([r, c]) => `${r},${c}`;

describe('BlockPuzzle generation', () => {
  it.each(Object.keys(DIFFICULTY_CONFIG))('%s puzzles are exactly tiled by their pieces', (d) => {
    const cfg = DIFFICULTY_CONFIG[d];
    for (let i = 0; i < 60; i++) {
      const p = generatePuzzle(cfg);
      expect(p.pieces.length).toBeGreaterThanOrEqual(cfg.pieces[0]);
      const covered = new Set();
      p.pieces.forEach(pc => pc.solution.forEach(cell => {
        expect(covered.has(key(cell))).toBe(false);
        covered.add(key(cell));
      }));
      let active = 0;
      p.active.forEach((row, r) => row.forEach((a, c) => {
        if (a) { active++; expect(covered.has(`${r},${c}`)).toBe(true); }
      }));
      expect(active).toBe(covered.size);
    }
  });
});

describe('BlockPuzzle hints', () => {
  it('repeated hints always finish the puzzle, even from a wrong start', () => {
    for (let i = 0; i < 40; i++) {
      const p = generatePuzzle(DIFFICULTY_CONFIG.hard);
      // Put the first piece somewhere it may not belong.
      const board = p.active.map(row => row.map(a => (a ? null : 'x')));
      let placements = {};
      outer: for (let r = 0; r < p.gridSize; r++) for (let c = 0; c < p.gridSize; c++) {
        const fit = board[r][c] === null && findFit(board, p.pieces[0].shape, r, c);
        if (fit) { placements = { 0: fit }; break outer; }
      }
      let guard = 0;
      let move;
      while ((move = hintMove(p, placements)) && guard++ < 50) placements = move.placements;
      expect(Object.keys(placements).length).toBe(p.pieces.length);
      const covered = new Set(Object.values(placements).flat().map(key));
      p.pieces.forEach(pc => pc.solution.forEach(cell => expect(covered.has(key(cell))).toBe(true)));
    }
  });

  it('scores 3 stars with no hints, then fewer', () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(1)).toBe(2);
    expect(starsFor(3)).toBe(1);
  });
});
