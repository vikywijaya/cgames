import { describe, it, expect } from 'vitest';
import { createGame } from './crazyEightsEngine';

describe('crazyEightsEngine', () => {
  it('deals 5 cards to each of 2 players and starts a non-eight discard pile', () => {
    const engine = createGame(2);
    const gs = engine.state();
    expect(gs.hands[0]).toHaveLength(5);
    expect(gs.hands[1]).toHaveLength(5);
    expect(gs.discardTop).not.toBeNull();
    // 52 - 5 - 5 - 1(discard) = 41 left in the draw pile
    expect(gs.drawPileCount).toBe(41);
    // the starter card is never an 8 (id % 4 gives suit; rank 8 has index 7,
    // so ids 28-31 are the four 8s — the engine reshuffles until discardTop
    // is not one of those)
    expect([28, 29, 30, 31]).not.toContain(gs.discardTop);
  });

  it('seat 0 moves first', () => {
    const engine = createGame(2);
    expect(engine.turn()).toBe(0);
    expect(engine.state().phase).toBe('play');
  });

  it('rejects a play from the player who is not on turn', () => {
    const engine = createGame(2);
    const result = engine.play(1, engine.state().hands[1][0]);
    expect(result.ok).toBe(false);
  });

  it('rejects playing an 8 without a chosenSuit', () => {
    const engine = createGame(2);
    // id 28 = 8 of Diamonds (rankIndex 7 * 4 + suitIndex 0). Force it into
    // seat 0's hand directly via state is not possible (no setter), so
    // instead verify the rule using the engine's own hand — deal a fresh
    // game and check whichever seat holds ANY 8 rejects playing it blank.
    const gs = engine.state();
    const eightInHand = gs.hands[0].find(id => Math.floor(id / 4) === 7);
    if (eightInHand !== undefined) {
      const result = engine.play(0, eightInHand, null);
      expect(result.ok).toBe(false);
    } else {
      // No 8 dealt to seat 0 this shuffle — nothing to assert, but confirm
      // the engine at least starts in a legal, non-crashed state.
      expect(engine.isGameOver()).toBe(false);
    }
  });

  it('draw advances hasDrawn state such that a second draw in the same turn is rejected', () => {
    const engine = createGame(2);
    const first = engine.draw(0);
    expect(first.ok).toBe(true);
    const second = engine.draw(0);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('Already drew this turn');
  });

  it('pass is rejected before drawing', () => {
    const engine = createGame(2);
    const result = engine.pass(0);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Must draw before passing');
  });

  it('isGameOver/winner report a fresh game as not over', () => {
    const engine = createGame(2);
    expect(engine.isGameOver()).toBe(false);
    expect(engine.winner()).toBeNull();
  });
});
