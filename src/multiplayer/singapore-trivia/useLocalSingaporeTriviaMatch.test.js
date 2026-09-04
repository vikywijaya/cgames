import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalSingaporeTriviaMatch } from './useLocalSingaporeTriviaMatch';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useLocalSingaporeTriviaMatch', () => {
  it('starts with two players, waiting phase, no game-over', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    expect(result.current.players).toEqual([
      { name: 'Player 1', color: 'p1' },
      { name: 'Player 2', color: 'p2' },
    ]);
    expect(result.current.gameState.phase).toBe('waiting');
    expect(result.current.lastGameOver).toBeNull();
  });

  it('start_question moves to the question phase', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('start_question', {}); });
    expect(result.current.gameState.phase).toBe('question');
  });

  it('auto-reveals after 20 seconds if not everyone has answered', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('start_question', {}); });
    expect(result.current.gameState.phase).toBe('question');
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current.gameState.phase).toBe('reveal');
  });

  it('reveals immediately once both seats answer, without waiting for the timer', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('start_question', {}); });
    act(() => { result.current.dispatch('submit_answer', { seat: 0, answerIndex: 0 }); });
    expect(result.current.gameState.phase).toBe('question');
    act(() => { result.current.dispatch('submit_answer', { seat: 1, answerIndex: 1 }); });
    expect(result.current.gameState.phase).toBe('reveal');
  });

  it('does not double-reveal when the 20s timer fires after an early reveal already happened', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('start_question', {}); });
    act(() => { result.current.dispatch('submit_answer', { seat: 0, answerIndex: 0 }); });
    act(() => { result.current.dispatch('submit_answer', { seat: 1, answerIndex: 1 }); });
    expect(result.current.gameState.phase).toBe('reveal');
    const scoresAfterReveal = result.current.gameState.scores;
    // Advancing time should be a no-op now — the pending timer was cancelled
    // by the early reveal, and even if it somehow fired, the phase guard
    // inside the callback prevents a second revealAnswers() call (which
    // would double-score or throw against the engine's own phase check).
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current.gameState.phase).toBe('reveal');
    expect(result.current.gameState.scores).toEqual(scoresAfterReveal);
  });

  it('resign hands the win to the other seat and sets lastGameOver', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    expect(result.current.lastGameOver).toEqual({ winner: 1, reason: 'Resigned' });
    expect(result.current.gameState.isGameOver).toBe(true);
  });

  it('play_again resets to a fresh waiting-phase game and clears lastGameOver', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    act(() => { result.current.dispatch('play_again', {}); });
    expect(result.current.lastGameOver).toBeNull();
    expect(result.current.gameState.phase).toBe('waiting');
    expect(result.current.gameState.scores).toEqual([0, 0]);
  });

  it('play_again cancels a pending auto-reveal timer from the previous question', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('start_question', {}); });
    act(() => { result.current.dispatch('play_again', {}); });
    // If the old timer weren't cancelled, advancing time here would call
    // revealAnswers() on the OLD engine instance, which no longer matters,
    // but could still throw if that engine's phase somehow reset — assert
    // the new game is unaffected either way.
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current.gameState.phase).toBe('waiting');
  });
});
