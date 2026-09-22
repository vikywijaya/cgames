import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLocalCongkakMatch } from './useLocalCongkakMatch';

describe('useLocalCongkakMatch', () => {
  it('starts with a full board, P1 to move, and no move or game-over yet', () => {
    const { result } = renderHook(() => useLocalCongkakMatch());
    expect(result.current.gameState.board).toEqual([7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0]);
    expect(result.current.gameState.turn).toBe(0);
    expect(result.current.lastMove).toBeNull();
    expect(result.current.lastGameOver).toBeNull();
    expect(result.current.players).toHaveLength(2);
  });

  it('exposes the board before the move plus its step list, for the animation to walk', () => {
    const { result } = renderHook(() => useLocalCongkakMatch());
    act(() => { result.current.dispatch('move', { seat: 0, hole: 2 }); });
    expect(result.current.lastMove.boardBefore).toEqual([7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0]);
    expect(result.current.lastMove.steps[0]).toEqual({ type: 'pickup', hole: 2, count: 7 });
    expect(result.current.lastMove.id).toBe(1);
  });

  it('bumps lastMove.id on every move so repeated moves still retrigger', () => {
    const { result } = renderHook(() => useLocalCongkakMatch());
    act(() => { result.current.dispatch('move', { seat: 0, hole: 2 }); });
    const first = result.current.lastMove.id;
    act(() => { result.current.dispatch('move', { seat: result.current.gameState.turn, hole: result.current.gameState.turn === 0 ? 0 : 8 }); });
    expect(result.current.lastMove.id).toBe(first + 1);
  });

  it('ignores an illegal move and leaves the board untouched', () => {
    const { result } = renderHook(() => useLocalCongkakMatch());
    const before = result.current.gameState.board;
    act(() => { result.current.dispatch('move', { seat: 1, hole: 8 }); }); // not P2's turn
    expect(result.current.gameState.board).toEqual(before);
    expect(result.current.lastMove).toBeNull();
  });

  it('undo restores the board and turn from before the last move', () => {
    const { result } = renderHook(() => useLocalCongkakMatch());
    const before = result.current.gameState.board;
    act(() => { result.current.dispatch('move', { seat: 0, hole: 2 }); });
    expect(result.current.gameState.board).not.toEqual(before);
    act(() => { result.current.dispatch('undo'); });
    expect(result.current.gameState.board).toEqual(before);
    expect(result.current.gameState.turn).toBe(0);
    expect(result.current.lastMove).toBeNull();
  });

  it('undo with no history is a no-op', () => {
    const { result } = renderHook(() => useLocalCongkakMatch());
    const before = result.current.gameState.board;
    act(() => { result.current.dispatch('undo'); });
    expect(result.current.gameState.board).toEqual(before);
  });

  it('undo steps back one move at a time across an extra turn', () => {
    const { result } = renderHook(() => useLocalCongkakMatch());
    act(() => { result.current.dispatch('move', { seat: 0, hole: 0 }); });
    const afterFirst = result.current.gameState.board;
    const turnAfterFirst = result.current.gameState.turn;
    act(() => { result.current.dispatch('move', { seat: turnAfterFirst, hole: turnAfterFirst === 0 ? 1 : 8 }); });
    act(() => { result.current.dispatch('undo'); });
    expect(result.current.gameState.board).toEqual(afterFirst);
    expect(result.current.gameState.turn).toBe(turnAfterFirst);
  });

  it('resign hands the win to the other seat', () => {
    const { result } = renderHook(() => useLocalCongkakMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    expect(result.current.lastGameOver).toEqual({ winner: 1, reason: 'Resigned' });
    expect(result.current.gameState.isGameOver).toBe(true);
  });

  it('reset clears the board, history and game-over back to a fresh match', () => {
    const { result } = renderHook(() => useLocalCongkakMatch());
    act(() => { result.current.dispatch('move', { seat: 0, hole: 2 }); });
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    act(() => { result.current.dispatch('reset'); });
    expect(result.current.gameState.board).toEqual([7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0]);
    expect(result.current.gameState.isGameOver).toBe(false);
    expect(result.current.lastGameOver).toBeNull();
    expect(result.current.lastMove).toBeNull();
  });

  it('reports a natural finish with the Most seeds reason', () => {
    const { result } = renderHook(() => useLocalCongkakMatch());
    act(() => {
      result.current.dispatch('restore_for_test', {
        board: [0,0,0,0,0,0,1, 40, 0,0,0,0,0,2,3, 30], turn: 0,
      });
    });
    act(() => { result.current.dispatch('move', { seat: 0, hole: 6 }); });
    expect(result.current.lastGameOver).toEqual({ winner: 0, reason: 'Most seeds' });
  });

  it('reports a drawn finish with the Draw reason', () => {
    const { result } = renderHook(() => useLocalCongkakMatch());
    act(() => {
      result.current.dispatch('restore_for_test', {
        board: [0,0,0,0,0,0,1, 48, 0,0,0,0,0,0,5, 44], turn: 0,
      });
    });
    act(() => { result.current.dispatch('move', { seat: 0, hole: 6 }); });
    expect(result.current.lastGameOver).toEqual({ winner: 'draw', reason: 'Draw' });
  });
});
