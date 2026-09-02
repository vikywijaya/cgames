import { describe, it, expect } from 'vitest';
import { parseFenBoard, legalMovesFor } from './xiangqiMoves';

const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';

describe('xiangqiMoves', () => {
  it('parses the standard starting FEN into a 10x9 board', () => {
    const board = parseFenBoard(START_FEN);
    expect(board).toHaveLength(10);
    expect(board[0]).toEqual(['r','n','b','a','k','a','b','n','r']);
    expect(board[3]).toEqual(['p',null,'p',null,'p',null,'p',null,'p']);
  });

  it('gives the red central pawn one legal move forward across the river', () => {
    const board = parseFenBoard(START_FEN);
    // Red pawn at row6,col4 (rank 4 from bottom, e-file equivalent)
    const moves = legalMovesFor(board, 6, 4);
    expect(moves).toEqual([[5, 4]]);
  });

  it('gives the black central pawn one legal move forward', () => {
    const board = parseFenBoard(START_FEN);
    const moves = legalMovesFor(board, 3, 4);
    expect(moves).toEqual([[4, 4]]);
  });
});
