import { describe, it, expect } from 'vitest';
import { buildPlayableGrid, findBestChain, hasMove, dropAndFill, starsFor, isAdj, MIN_CHAIN } from './lumenoLogic';

describe('lumenoLogic', () => {
  it('always builds a board with at least one valid chain', () => {
    for (let i = 0; i < 50; i++) {
      const g = buildPlayableGrid(6, 5);
      expect(hasMove(g)).toBe(true);
    }
  });

  it('hint chain is valid: same colour, touching, no repeats', () => {
    const g = buildPlayableGrid(6, 4);
    const chain = findBestChain(g);
    expect(chain.length).toBeGreaterThanOrEqual(MIN_CHAIN);
    const color = g[chain[0].row][chain[0].col];
    const keys = new Set();
    chain.forEach((p, i) => {
      expect(g[p.row][p.col]).toBe(color);
      if (i) expect(isAdj(chain[i - 1], p)).toBe(true);
      keys.add(`${p.row}-${p.col}`);
    });
    expect(keys.size).toBe(chain.length);
  });

  it('prefers a goal colour for hints', () => {
    const g = [
      ['red', 'red', 'red', 'red'],
      ['blue', 'yellow', 'blue', 'yellow'],
      ['yellow', 'blue', 'yellow', 'blue'],
      ['blue', 'blue', 'blue', 'yellow'],
    ];
    const chain = findBestChain(g, ['blue']);
    expect(g[chain[0].row][chain[0].col]).toBe('blue');
  });

  it('dropAndFill keeps the board full', () => {
    const g = buildPlayableGrid(5, 3);
    const next = dropAndFill(g, [{ row: 0, col: 0 }, { row: 1, col: 0 }], 3);
    expect(next.flat().every(Boolean)).toBe(true);
  });

  it('awards 3/2/1 stars by hints used', () => {
    expect(starsFor(0)).toBe(3);
    expect(starsFor(1)).toBe(2);
    expect(starsFor(4)).toBe(1);
  });
});
