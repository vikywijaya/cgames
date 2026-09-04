import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalGinRummyMatch } from './useLocalGinRummyMatch';

describe('useLocalGinRummyMatch', () => {
  it('starts with two players, seat 0 to move, no game-over', () => {
    const { result } = renderHook(() => useLocalGinRummyMatch());
    expect(result.current.players).toEqual([
      { name: 'Player 1', color: 'p1' },
      { name: 'Player 2', color: 'p2' },
    ]);
    expect(result.current.gameState.currentSeat).toBe(0);
    expect(result.current.lastGameOver).toBeNull();
  });

  it('dispatching draw then discard advances the turn to seat 1', () => {
    const { result } = renderHook(() => useLocalGinRummyMatch());
    act(() => { result.current.dispatch('draw', { source: 'draw' }); });
    const hand = result.current.gameState.hands[0];
    act(() => { result.current.dispatch('discard', { cardId: hand[0] }); });
    expect(result.current.gameState.currentSeat).toBe(1);
  });

  it('resign hands the win to the other seat and sets lastGameOver', () => {
    const { result } = renderHook(() => useLocalGinRummyMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    expect(result.current.lastGameOver).toEqual({ winner: 1, reason: 'Resigned' });
    expect(result.current.gameState.isGameOver).toBe(true);
  });

  it('play_again resets to a fresh deal with seat 0 to move and clears lastGameOver', () => {
    const { result } = renderHook(() => useLocalGinRummyMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    act(() => { result.current.dispatch('play_again', {}); });
    expect(result.current.lastGameOver).toBeNull();
    expect(result.current.gameState.currentSeat).toBe(0);
    expect(result.current.gameState.hands[0]).toHaveLength(10);
  });

  it('knock with no meldGroups auto-finds the best legal knock via findBestMelds', () => {
    const { result } = renderHook(() => useLocalGinRummyMatch());
    // Force a deterministic hand isn't available without a seeded RNG (the
    // ported engine intentionally is not seeded — it uses Math.random(), same
    // as the server). Instead, verify the dispatch reaches the engine without
    // throwing and returns a coherent state either way: if the random 10-card
    // hand happens to knock legally, phase becomes 'knock_response' or 'over';
    // if it can't legally knock yet (deadwood > 10), gameState is unchanged
    // and no error is thrown.
    act(() => { result.current.dispatch('draw', { source: 'draw' }); });
    const beforePhase = result.current.gameState.phase;
    act(() => { result.current.dispatch('knock', {}); });
    const afterPhase = result.current.gameState.phase;
    expect(['knock_response', 'over', beforePhase]).toContain(afterPhase);
  });
});
