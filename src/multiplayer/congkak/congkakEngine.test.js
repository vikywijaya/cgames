import { describe, it, expect } from 'vitest';
import {
  createGame, opposite, ownsHouse,
  HOUSES_PER_SIDE, SEEDS_PER_HOUSE, STORE,
} from './congkakEngine';

describe('congkakEngine board geometry', () => {
  it('exports the traditional 7x7 board constants', () => {
    expect(HOUSES_PER_SIDE).toBe(7);
    expect(SEEDS_PER_HOUSE).toBe(7);
    expect(STORE).toEqual([7, 15]);
  });

  it('maps each house to the house directly across from it', () => {
    expect(opposite(0)).toBe(14);
    expect(opposite(6)).toBe(8);
    expect(opposite(14)).toBe(0);
    expect(opposite(8)).toBe(6);
  });

  it('knows which houses each seat owns, and that stores are not houses', () => {
    expect(ownsHouse(0, 0)).toBe(true);
    expect(ownsHouse(0, 6)).toBe(true);
    expect(ownsHouse(0, 7)).toBe(false);  // own store is not a house
    expect(ownsHouse(0, 8)).toBe(false);
    expect(ownsHouse(1, 8)).toBe(true);
    expect(ownsHouse(1, 14)).toBe(true);
    expect(ownsHouse(1, 15)).toBe(false);
    expect(ownsHouse(1, 6)).toBe(false);
  });
});

describe('congkakEngine initial state', () => {
  it('starts with 7 seeds in every house, empty stores, and P1 to move', () => {
    const gs = createGame().state();
    expect(gs.board).toEqual([7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0]);
    expect(gs.turn).toBe(0);
    expect(gs.isGameOver).toBe(false);
    expect(gs.winner).toBeNull();
  });

  it('returns a defensive copy of the board', () => {
    const engine = createGame();
    engine.state().board[0] = 999;
    expect(engine.state().board[0]).toBe(7);
  });

  it('lists the moving seat\'s non-empty houses as legal moves', () => {
    const engine = createGame();
    expect(engine.legalMoves(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('gives the seat that is not on turn no legal moves', () => {
    const engine = createGame();
    expect(engine.legalMoves(1)).toEqual([]);
  });

  it('omits empty houses from legal moves', () => {
    const engine = createGame();
    engine.restore({ board: [0,3,0,0,0,0,2, 0, 7,7,7,7,7,7,7, 0], turn: 0 });
    expect(engine.legalMoves(0)).toEqual([1, 6]);
  });
});
