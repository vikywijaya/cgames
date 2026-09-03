import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLocalChessMatch } from './useLocalChessMatch';

describe('useLocalChessMatch', () => {
  it('starts with the initial position and two fixed local players', () => {
    const { result } = renderHook(() => useLocalChessMatch());
    expect(result.current.gameState.turn).toBe('w');
    expect(result.current.gameState.isGameOver).toBe(false);
    expect(result.current.lastGameOver).toBe(null);
    expect(result.current.players).toEqual([
      { name: 'Player 1', color: 'white' },
      { name: 'Player 2', color: 'black' },
    ]);
  });

  it('applies a legal move and updates turn/lastMove', () => {
    const { result } = renderHook(() => useLocalChessMatch());
    act(() => {
      result.current.dispatch('make_move', { from: [6, 4], to: [4, 4], promotion: null });
    });
    expect(result.current.gameState.turn).toBe('b');
    expect(result.current.gameState.lastMove).toEqual({ from: [6, 4], to: [4, 4] });
  });

  it('ignores an illegal move and leaves state unchanged', () => {
    const { result } = renderHook(() => useLocalChessMatch());
    const before = result.current.gameState;
    act(() => {
      result.current.dispatch('make_move', { from: [6, 4], to: [3, 4], promotion: null });
    });
    expect(result.current.gameState.fen).toBe(before.fen);
    expect(result.current.gameState.turn).toBe('w');
  });

  it('sets lastGameOver on checkmate with the winning color', () => {
    const { result } = renderHook(() => useLocalChessMatch());
    act(() => { result.current.dispatch('make_move', { from: [6, 5], to: [5, 5], promotion: null }); }); // f3
    act(() => { result.current.dispatch('make_move', { from: [1, 4], to: [3, 4], promotion: null }); }); // e5
    act(() => { result.current.dispatch('make_move', { from: [6, 6], to: [4, 6], promotion: null }); }); // g4
    act(() => { result.current.dispatch('make_move', { from: [0, 3], to: [4, 7], promotion: null }); }); // Qh4#
    expect(result.current.lastGameOver).toEqual({ winner: 'black', reason: 'Checkmate' });
  });

  it('resign ends the game with the other color as winner', () => {
    const { result } = renderHook(() => useLocalChessMatch());
    act(() => { result.current.dispatch('resign'); }); // white to move resigns
    expect(result.current.lastGameOver).toEqual({ winner: 'black', reason: 'White resigned' });
  });

  it('play_again resets to a fresh initial position', () => {
    const { result } = renderHook(() => useLocalChessMatch());
    act(() => { result.current.dispatch('make_move', { from: [6, 4], to: [4, 4], promotion: null }); });
    act(() => { result.current.dispatch('play_again'); });
    expect(result.current.gameState.turn).toBe('w');
    expect(result.current.lastGameOver).toBe(null);
  });
});
