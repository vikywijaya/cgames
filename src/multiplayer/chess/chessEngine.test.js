import { describe, it, expect } from 'vitest';
import { createGame, INITIAL_FEN } from './chessEngine';

describe('chessEngine', () => {
  it('starts at the standard initial position with white to move', () => {
    const game = createGame();
    expect(game.fen()).toBe(INITIAL_FEN);
    expect(game.turn()).toBe('w');
    expect(game.isGameOver()).toBe(false);
    expect(game.winner()).toBe(null);
  });

  it('accepts a legal opening move and switches turn', () => {
    const game = createGame();
    const result = game.move([6, 4], [4, 4], null); // e2-e4
    expect(result).toEqual({ ok: true });
    expect(game.turn()).toBe('b');
  });

  it('rejects moving a piece that is not yours', () => {
    const game = createGame();
    const result = game.move([1, 4], [3, 4], null); // black pawn, white's turn
    expect(result.ok).toBe(false);
  });

  it('rejects an illegal move for the piece', () => {
    const game = createGame();
    const result = game.move([6, 4], [3, 4], null); // pawn can't jump 3 squares
    expect(result.ok).toBe(false);
  });

  it('detects checkmate (fool\'s mate) and reports the winning color', () => {
    const game = createGame();
    game.move([6, 5], [5, 5], null); // 1. f3
    game.move([1, 4], [3, 4], null); // 1... e5
    game.move([6, 6], [4, 6], null); // 2. g4
    game.move([0, 3], [4, 7], null); // 2... Qh4#
    expect(game.isGameOver()).toBe(true);
    expect(game.inCheck()).toBe(true);
    expect(game.winner()).toBe('black');
  });

  it('legalMoves returns an empty array for an empty square', () => {
    const game = createGame();
    expect(game.legalMoves([4, 4])).toEqual([]);
  });

  it('undo reverts the last move', () => {
    const game = createGame();
    game.move([6, 4], [4, 4], null);
    expect(game.turn()).toBe('b');
    const undone = game.undo();
    expect(undone).toBe(true);
    expect(game.fen()).toBe(INITIAL_FEN);
  });
});
