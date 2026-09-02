import { describe, it, expect, vi } from 'vitest';
import { ChessBoard } from './ChessBoardCanvas';

function makeFakeCanvas() {
  return {
    getContext: () => ({
      fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    }),
    width: 560, height: 560,
    addEventListener: vi.fn(),
  };
}

describe('ChessBoard coordinate transforms', () => {
  it('does not flip the board for the white player', () => {
    const board = new ChessBoard(makeFakeCanvas(), 'white');
    expect(board.flipped).toBe(false);
    expect(board._toCanvas(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('flips the board 180 degrees for the black player', () => {
    const board = new ChessBoard(makeFakeCanvas(), 'black');
    expect(board.flipped).toBe(true);
    // row 0, col 0 (a8) should render in the bottom-right corner when flipped
    const { x, y } = board._toCanvas(0, 0);
    expect(x).toBe(7 * board.cellSize);
    expect(y).toBe(7 * board.cellSize);
  });
});
