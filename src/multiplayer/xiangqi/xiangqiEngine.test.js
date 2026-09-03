import { describe, it, expect } from 'vitest';
import { createGame, INITIAL_FEN } from './xiangqiEngine';

describe('xiangqiEngine', () => {
  it('starts at the standard initial position with red to move', () => {
    const game = createGame();
    expect(game.fen()).toBe(INITIAL_FEN);
    expect(game.turn()).toBe('w'); // 'w' = red
    expect(game.isGameOver()).toBe(false);
  });

  it('accepts a legal cannon move and switches turn', () => {
    const game = createGame();
    // Red cannon at row7,col1 moves along the row to row7,col4 (no pieces in the way)
    const result = game.move([7, 1], [7, 4]);
    expect(result).toEqual({ ok: true });
    expect(game.turn()).toBe('b');
  });

  it('rejects moving a piece that is not yours', () => {
    const game = createGame();
    const result = game.move([2, 1], [2, 4]); // black cannon, red's turn
    expect(result.ok).toBe(false);
  });

  it('rejects an illegal move for the piece', () => {
    const game = createGame();
    // Advisor can't move outside the palace
    const result = game.move([9, 3], [8, 2]);
    expect(result.ok).toBe(false);
  });

  it('legalMoves returns an empty array for an empty square', () => {
    const game = createGame();
    expect(game.legalMoves([4, 4])).toEqual([]);
  });

  it('undo reverts the last move', () => {
    const game = createGame();
    game.move([7, 1], [7, 4]);
    expect(game.turn()).toBe('b');
    const undone = game.undo();
    expect(undone).toBe(true);
    expect(game.fen()).toBe(INITIAL_FEN);
  });

  it('has no winner() method — winner inference happens in the local hook', () => {
    const game = createGame();
    expect(typeof game.winner).toBe('undefined');
  });
});
