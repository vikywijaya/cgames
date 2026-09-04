import { describe, it, expect } from 'vitest';
import { createGame, findBestMelds } from './ginRummyEngine';

describe('ginRummyEngine', () => {
  it('deals 10 cards to each seat and leaves one card face-up on the discard pile', () => {
    const engine = createGame();
    const gs = engine.state();
    expect(gs.hands[0]).toHaveLength(10);
    expect(gs.hands[1]).toHaveLength(10);
    expect(gs.discardTop).not.toBeNull();
    // 52 - 10 - 10 - 1(discard) = 31 left in the draw pile
    expect(gs.drawPileCount).toBe(31);
  });

  it('seat 0 moves first, in the draw phase', () => {
    const engine = createGame();
    expect(engine.turn()).toBe(0);
    expect(engine.state().phase).toBe('draw');
  });

  it('rejects a draw from the player who is not on turn', () => {
    const engine = createGame();
    const result = engine.draw(1, 'draw');
    expect(result.ok).toBe(false);
  });

  it('draw then discard hands the turn to the other seat', () => {
    const engine = createGame();
    engine.draw(0, 'draw');
    const hand = engine.state().hands[0];
    engine.discard(0, hand[0]);
    expect(engine.turn()).toBe(1);
    expect(engine.state().phase).toBe('draw');
  });

  it('findBestMelds finds a 3-of-a-kind with zero deadwood among an obvious meld', () => {
    // Three Aces: ids 0 (A-D), 1 (A-C), 2 (A-H) — a valid set
    const result = findBestMelds([0, 1, 2]);
    expect(result.deadwoodPoints).toBe(0);
    expect(result.melds).toHaveLength(1);
    expect(result.melds[0].sort()).toEqual([0, 1, 2]);
  });

  it('findBestMelds reports high deadwood for a hand with no melds at all', () => {
    // 2D, 5C, 9H, KS, 3D, 7C, JD, 4S, 8H, QC — no two cards share rank or
    // form a run; deterministic, no shuffle involved, so this is a stable
    // way to exercise the >10-point deadwood path that engine.knock() checks
    // against (server/src/engine/gin-rummy.js line 424: "deadwood exceeds 10").
    const noMeldHand = [4, 17, 34, 47, 8, 25, 39, 14, 30, 42];
    const best = findBestMelds(noMeldHand);
    expect(best.deadwoodPoints).toBeGreaterThan(10);
    expect(best.melds).toHaveLength(0);
  });

  it('isGameOver/winner report a fresh game as not over', () => {
    const engine = createGame();
    expect(engine.isGameOver()).toBe(false);
    expect(engine.winner()).toBeNull();
  });
});
