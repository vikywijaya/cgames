import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLocalXiangqiMatch } from './useLocalXiangqiMatch';

describe('useLocalXiangqiMatch', () => {
  it('starts with the initial position and two fixed local players', () => {
    const { result } = renderHook(() => useLocalXiangqiMatch());
    expect(result.current.gameState.turn).toBe('w');
    expect(result.current.gameState.isGameOver).toBe(false);
    expect(result.current.lastGameOver).toBe(null);
    expect(result.current.players).toEqual([
      { name: 'Player 1', color: 'red' },
      { name: 'Player 2', color: 'black' },
    ]);
  });

  it('applies a legal move and updates turn/lastMove', () => {
    const { result } = renderHook(() => useLocalXiangqiMatch());
    act(() => {
      result.current.dispatch('make_move', { from: [7, 1], to: [7, 4] });
    });
    expect(result.current.gameState.turn).toBe('b');
    expect(result.current.gameState.lastMove).toEqual({ from: [7, 1], to: [7, 4] });
  });

  it('ignores an illegal move and leaves state unchanged', () => {
    const { result } = renderHook(() => useLocalXiangqiMatch());
    const before = result.current.gameState;
    act(() => {
      result.current.dispatch('make_move', { from: [9, 3], to: [8, 2] }); // advisor out of palace
    });
    expect(result.current.gameState.fen).toBe(before.fen);
    expect(result.current.gameState.turn).toBe('w');
  });

  it('resign ends the game with the other color as winner', () => {
    const { result } = renderHook(() => useLocalXiangqiMatch());
    act(() => { result.current.dispatch('resign'); }); // red to move resigns
    expect(result.current.lastGameOver).toEqual({ winner: 'black', reason: 'Red resigned' });
  });

  it('play_again resets to a fresh initial position', () => {
    const { result } = renderHook(() => useLocalXiangqiMatch());
    act(() => { result.current.dispatch('make_move', { from: [7, 1], to: [7, 4] }); });
    act(() => { result.current.dispatch('play_again'); });
    expect(result.current.gameState.turn).toBe('w');
    expect(result.current.lastGameOver).toBe(null);
  });
});
