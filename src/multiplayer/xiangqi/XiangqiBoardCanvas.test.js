import { describe, it, expect, vi } from 'vitest';
import { XiangqiBoard } from './XiangqiBoardCanvas';

function makeFakeCanvas() {
  return {
    getContext: () => ({
      fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
      stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    }),
    width: 560, height: 622,
    addEventListener: vi.fn(),
  };
}

describe('XiangqiBoard coordinate transforms', () => {
  it('does not flip the board for the red player', () => {
    const board = new XiangqiBoard(makeFakeCanvas(), 'red');
    expect(board.flipped).toBe(false);
    const { x, y } = board._toCanvas(0, 0);
    expect(x).toBe(board.padding);
    expect(y).toBe(board.padding);
  });

  it('flips the board 180 degrees for the black player', () => {
    const board = new XiangqiBoard(makeFakeCanvas(), 'black');
    expect(board.flipped).toBe(true);
    // row 0, col 0 should render in the bottom-right corner when flipped
    const { x, y } = board._toCanvas(0, 0);
    expect(x).toBe(board.padding + 8 * board.cellW);
    expect(y).toBe(board.padding + 9 * board.cellH);
  });
});
