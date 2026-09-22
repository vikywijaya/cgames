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

describe('congkakEngine move validation', () => {
  it('rejects a move from the seat that is not on turn', () => {
    const engine = createGame();
    const result = engine.move(1, 8);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-your-turn');
  });

  it('rejects sowing from a house the seat does not own', () => {
    const engine = createGame();
    const result = engine.move(0, 8);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not-your-house');
  });

  it('rejects sowing from an empty house', () => {
    const engine = createGame();
    engine.restore({ board: [0,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0], turn: 0 });
    const result = engine.move(0, 0);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('empty-house');
  });
});

describe('congkakEngine sowing', () => {
  it('sows one seed per hole anticlockwise and empties the tapped house', () => {
    const engine = createGame();
    // 1 seed in house 0 only; it lands in house 1, which is empty -> capture
    // is not what we are testing here, so put a seed in house 1 to force a stop.
    engine.restore({ board: [1,1,0,0,0,0,0, 0, 0,0,0,0,0,0,0, 0], turn: 0 });
    const result = engine.move(0, 0);
    expect(result.ok).toBe(true);
    expect(result.state.board[0]).toBe(0);
    expect(result.state.board[1]).toBe(0); // relayed away, see relay test
  });

  it('emits a pickup step then one sow step per seed', () => {
    const engine = createGame();
    engine.restore({ board: [3,0,0,1,0,0,0, 0, 0,0,0,0,0,0,0, 0], turn: 0 });
    const { steps } = engine.move(0, 0);
    expect(steps[0]).toEqual({ type: 'pickup', hole: 0, count: 3 });
    expect(steps[1]).toEqual({ type: 'sow', hole: 1, seedsRemaining: 2 });
    expect(steps[2]).toEqual({ type: 'sow', hole: 2, seedsRemaining: 1 });
    expect(steps[3]).toEqual({ type: 'sow', hole: 3, seedsRemaining: 0 });
  });

  it('skips the opponent store while sowing, and captures live across the wrap', () => {
    const engine = createGame();
    // P1 sows 10 from house 6: store 7, then 8..14, SKIP store 15, wrap to
    // house 0, then house 1. The 10th seed lands on house 1 — empty before
    // this seed, a legal Rule 3 capture. Its opposite, house 13, already
    // holds a seed sown earlier in this SAME move (the 7th of the 10):
    // captures read the board's CURRENT state, so that seed is swept too.
    engine.restore({ board: [0,0,0,0,0,0,10, 0, 0,0,0,0,0,0,0, 0], turn: 0 });
    const { state } = engine.move(0, 6);
    expect(state.board[15]).toBe(0);   // opponent store untouched
    expect(state.board[1]).toBe(0);    // captured: was empty, now swept
    expect(state.board[13]).toBe(0);   // captured: its seed swept too
    expect(state.board[7]).toBe(3);    // 1 passed through + 2 captured
    expect(state.board[0]).toBe(1);    // wrapped past 15 into house 0
  });

  it('skips the opponent store for P2 as well, and captures live across the wrap', () => {
    const engine = createGame();
    // Mirror of the P1 case above: the 10th seed lands on house 9 (empty),
    // capturing house 5, which this same move already sowed a seed into.
    engine.restore({ board: [0,0,0,0,0,0,0, 0, 0,0,0,0,0,0,10, 0], turn: 1 });
    const { state } = engine.move(1, 14);
    expect(state.board[7]).toBe(0);    // P1 store untouched
    expect(state.board[9]).toBe(0);    // captured: was empty, now swept
    expect(state.board[5]).toBe(0);    // captured: its seed swept too
    expect(state.board[15]).toBe(3);   // 1 passed through + 2 captured
    expect(state.board[0]).toBe(1);
  });
});

describe('congkakEngine landing rules', () => {
  it('rule 1: last seed in own store grants an extra turn', () => {
    const engine = createGame();
    // house 6 holds 1 seed -> lands exactly in store 7
    engine.restore({ board: [0,0,0,0,0,0,1, 0, 7,7,7,7,7,7,7, 0], turn: 0 });
    const { steps, state } = engine.move(0, 6);
    expect(steps).toContainEqual({ type: 'extraTurn', seat: 0 });
    expect(state.board[7]).toBe(1);
    expect(state.turn).toBe(0); // still P1
  });

  it('rule 2: landing on a non-empty hole relays, lifting that hole and sowing on', () => {
    const engine = createGame();
    // 1 seed at house 0 lands on house 1 which holds 2 -> lift 3, sow on
    engine.restore({ board: [1,2,0,0,0,0,0, 0, 0,0,0,0,0,0,3, 0], turn: 0 });
    const { steps, state } = engine.move(0, 0);
    expect(steps).toContainEqual({ type: 'relay', hole: 1, count: 3 });
    expect(state.board[1]).toBe(0);
    expect(state.board[2]).toBe(1);
    expect(state.board[3]).toBe(1);
    expect(state.board[4]).toBe(1);
  });

  it('rule 3: last seed in an empty own house captures it plus the opposite house', () => {
    const engine = createGame();
    // 1 seed at house 0 -> lands in empty house 1. opposite(1) = 13, holding 5.
    engine.restore({ board: [1,0,0,0,0,0,0, 0, 0,0,0,0,0,5,0, 0], turn: 0 });
    const { steps, state } = engine.move(0, 0);
    expect(steps).toContainEqual({
      type: 'capture', hole: 1, oppositeHole: 13, count: 6, store: 7,
    });
    expect(state.board[1]).toBe(0);
    expect(state.board[13]).toBe(0);
    expect(state.board[7]).toBe(6);   // 1 landed + 5 captured
    expect(state.turn).toBe(1);        // turn passes
  });

  it('rule 3 boundary: no capture when the opposite house is empty', () => {
    const engine = createGame();
    // opposite(1) is 13, left empty. P2 holds seeds elsewhere so the game
    // does not end on this move.
    engine.restore({ board: [1,0,0,0,0,0,0, 0, 0,0,0,0,0,0,3, 0], turn: 0 });
    const { steps, state } = engine.move(0, 0);
    expect(steps.some(s => s.type === 'capture')).toBe(false);
    expect(state.board[1]).toBe(1);   // seed stays where it landed
    expect(state.board[7]).toBe(0);   // nothing captured
    expect(state.turn).toBe(1);        // turn passes
  });

  it('rule 4: last seed in an empty OPPONENT house is mati — no capture, turn passes', () => {
    const engine = createGame();
    // P1 sows from house 6: store 7 then house 8 (empty). Opposite(8) = 6.
    engine.restore({ board: [0,0,0,0,0,0,2, 0, 0,0,0,0,0,0,4, 0], turn: 0 });
    const { steps, state } = engine.move(0, 6);
    expect(steps.some(s => s.type === 'capture')).toBe(false);
    expect(state.board[8]).toBe(1);   // seed stays on the opponent's side
    expect(state.board[7]).toBe(1);   // only the store seed sown in passing
    expect(state.turn).toBe(1);
  });
});

describe('congkakEngine termination guard', () => {
  it('force-ends a move that exceeds the sow-step cap, returning the hand to the mover\'s store', () => {
    const engine = createGame({ maxSowSteps: 5 });
    engine.restore({ board: [20,1,1,1,1,1,1, 0, 1,1,1,1,1,1,1, 0], turn: 0 });
    const { steps, state } = engine.move(0, 0);
    const forced = steps.find(s => s.type === 'forceEnd');
    expect(forced).toBeDefined();
    expect(forced.seat).toBe(0);
    expect(forced.seedsReturned).toBeGreaterThan(0);
    expect(state.turn).toBe(1);
    // seeds are conserved: nothing vanished
    expect(state.board.reduce((a, b) => a + b, 0)).toBe(20 + 6 + 7);
  });
});

import { applyStep } from './congkakEngine';

describe('congkakEngine end of game', () => {
  it('ends when the seat due to move has no seeds, sweeping the other side into its own store', () => {
    const engine = createGame();
    // P1 plays its last seed into its own store (extra turn), leaving P1 empty.
    engine.restore({ board: [0,0,0,0,0,0,1, 40, 0,0,0,0,0,2,3, 30], turn: 0 });
    const { steps, state } = engine.move(0, 6);
    expect(state.isGameOver).toBe(true);
    const sweep = steps.find(s => s.type === 'sweep');
    expect(sweep).toEqual({ type: 'sweep', seat: 1, holes: [13, 14], count: 5 });
    expect(state.board[13]).toBe(0);
    expect(state.board[14]).toBe(0);
    expect(state.board[15]).toBe(35);  // 30 + 5 swept
    expect(state.board[7]).toBe(41);   // 40 + the sown seed
  });

  it('declares the larger store the winner and emits an end step', () => {
    const engine = createGame();
    engine.restore({ board: [0,0,0,0,0,0,1, 40, 0,0,0,0,0,2,3, 30], turn: 0 });
    const { steps, state } = engine.move(0, 6);
    expect(state.winner).toBe(0);      // 41 vs 35
    expect(steps).toContainEqual({ type: 'end', winner: 0 });
  });

  it('declares P2 the winner when P2 has more seeds', () => {
    const engine = createGame();
    engine.restore({ board: [0,0,0,0,0,0,1, 10, 0,0,0,0,0,2,3, 80], turn: 0 });
    const { state } = engine.move(0, 6);
    expect(state.winner).toBe(1);
  });

  it('declares a draw on equal stores', () => {
    const engine = createGame();
    // P1 ends empty; stores finish level at 49 each.
    engine.restore({ board: [0,0,0,0,0,0,1, 48, 0,0,0,0,0,0,5, 44], turn: 0 });
    const { state } = engine.move(0, 6);
    expect(state.board[7]).toBe(49);
    expect(state.board[15]).toBe(49);
    expect(state.winner).toBe('draw');
  });

  it('refuses further moves once the game is over', () => {
    const engine = createGame();
    engine.restore({ board: [0,0,0,0,0,0,1, 40, 0,0,0,0,0,2,3, 30], turn: 0 });
    engine.move(0, 6);
    const result = engine.move(1, 13);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('game-over');
  });
});

describe('applyStep', () => {
  it('empties the tapped hole on pickup', () => {
    const board = [3,0,0,0,0,0,0, 0, 0,0,0,0,0,0,0, 0];
    applyStep(board, { type: 'pickup', hole: 0, count: 3 });
    expect(board[0]).toBe(0);
  });

  it('adds a seed on sow', () => {
    const board = new Array(16).fill(0);
    applyStep(board, { type: 'sow', hole: 4, seedsRemaining: 2 });
    expect(board[4]).toBe(1);
  });

  it('empties the relayed hole', () => {
    const board = new Array(16).fill(0);
    board[5] = 4;
    applyStep(board, { type: 'relay', hole: 5, count: 4 });
    expect(board[5]).toBe(0);
  });

  it('moves both houses into the store on capture', () => {
    const board = new Array(16).fill(0);
    board[1] = 1; board[13] = 5;
    applyStep(board, { type: 'capture', hole: 1, oppositeHole: 13, count: 6, store: 7 });
    expect(board[1]).toBe(0);
    expect(board[13]).toBe(0);
    expect(board[7]).toBe(6);
  });

  it('clears the swept houses into that seat\'s store', () => {
    const board = new Array(16).fill(0);
    board[13] = 2; board[14] = 3; board[15] = 30;
    applyStep(board, { type: 'sweep', seat: 1, holes: [13, 14], count: 5 });
    expect(board[13]).toBe(0);
    expect(board[14]).toBe(0);
    expect(board[15]).toBe(35);
  });

  it('returns the undistributed hand to the store on forceEnd', () => {
    const board = new Array(16).fill(0);
    applyStep(board, { type: 'forceEnd', seat: 0, seedsReturned: 4 });
    expect(board[7]).toBe(4);
  });

  it('leaves the board untouched for extraTurn and end', () => {
    const board = [1,2,3,0,0,0,0, 0, 0,0,0,0,0,0,0, 0];
    const before = [...board];
    applyStep(board, { type: 'extraTurn', seat: 0 });
    applyStep(board, { type: 'end', winner: 0 });
    expect(board).toEqual(before);
  });

  it('replaying every step of a move reproduces the engine\'s final board', () => {
    const engine = createGame();
    const before = engine.state().board;
    const { steps, state } = engine.move(0, 2);
    const replayed = [...before];
    steps.forEach(step => applyStep(replayed, step));
    expect(replayed).toEqual(state.board);
  });
});
