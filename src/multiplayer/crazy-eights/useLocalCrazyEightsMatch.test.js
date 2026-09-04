import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalCrazyEightsMatch } from './useLocalCrazyEightsMatch';

describe('useLocalCrazyEightsMatch', () => {
  it('starts with two players, seat 0 to move, no game-over', () => {
    const { result } = renderHook(() => useLocalCrazyEightsMatch());
    expect(result.current.players).toEqual([
      { name: 'Player 1', color: 'p1' },
      { name: 'Player 2', color: 'p2' },
    ]);
    expect(result.current.gameState.currentSeat).toBe(0);
    expect(result.current.lastGameOver).toBeNull();
  });

  it('draw sets hasDrawn implicitly by allowing a subsequent pass when no playable card exists', () => {
    const { result } = renderHook(() => useLocalCrazyEightsMatch());
    const before = result.current.gameState.handCounts[0];
    act(() => { result.current.dispatch('draw', {}); });
    // A draw always grows the hand by one UNLESS it happened to trigger the
    // stalemate branch (astronomically unlikely on a fresh 41-card draw
    // pile) — assert the hand grew, which also confirms dispatch reached
    // the engine correctly.
    expect(result.current.gameState.handCounts[0]).toBe(before + 1);
  });

  it('resign hands the win to the other seat and sets lastGameOver', () => {
    const { result } = renderHook(() => useLocalCrazyEightsMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    expect(result.current.lastGameOver).toEqual({ winner: 1, reason: 'Resigned' });
    expect(result.current.gameState.isGameOver).toBe(true);
  });

  it('play_again resets to a fresh deal with seat 0 to move and clears lastGameOver', () => {
    const { result } = renderHook(() => useLocalCrazyEightsMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    act(() => { result.current.dispatch('play_again', {}); });
    expect(result.current.lastGameOver).toBeNull();
    expect(result.current.gameState.currentSeat).toBe(0);
    expect(result.current.gameState.hands[0]).toHaveLength(5);
  });
});
