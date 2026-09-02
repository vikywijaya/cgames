import { describe, it, expect } from 'vitest';
import { parseFenState, legalMovesFor, isPawnPromotion } from './chessMoves';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

describe('chessMoves', () => {
  it('parses the standard starting FEN into an 8x8 board with white to move', () => {
    const { board, turn } = parseFenState(START_FEN);
    expect(turn).toBe('w');
    expect(board[0]).toEqual(['r','n','b','q','k','b','n','r']);
    expect(board[1]).toEqual(['p','p','p','p','p','p','p','p']);
    expect(board[6]).toEqual(['P','P','P','P','P','P','P','P']);
  });

  it('gives the e2 pawn two legal moves from the starting position', () => {
    const state = parseFenState(START_FEN);
    const moves = legalMovesFor(state.board, state, 6, 4); // e2 = row 6, col 4
    expect(moves).toEqual(expect.arrayContaining([[5, 4], [4, 4]]));
    expect(moves).toHaveLength(2);
  });

  it('flags a white pawn reaching rank 0 as a promotion', () => {
    const board = parseFenState(START_FEN).board;
    expect(isPawnPromotion(board, 1, 0, 0)).toBe(false); // starting position, no promotion yet
  });
});
