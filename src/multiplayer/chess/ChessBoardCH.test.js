import { describe, it, expect, vi } from 'vitest';
import { ChessBoardCH } from './ChessBoardCH';

function makeFakeCanvas() {
  return {
    getContext: () => ({
      fillRect: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(), beginPath: vi.fn(),
      arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), strokeRect: vi.fn(),
      moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn(), setTransform: vi.fn(),
    }),
    width: 560, height: 560,
    style: {},
    addEventListener: vi.fn(),
  };
}

describe('ChessBoardCH coordinate transforms', () => {
  it('does not flip the board for the white player', () => {
    const board = new ChessBoardCH(makeFakeCanvas(), 'white');
    expect(board.flipped).toBe(false);
    expect(board._toCanvas(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('flips the board 180 degrees for the black player', () => {
    const board = new ChessBoardCH(makeFakeCanvas(), 'black');
    expect(board.flipped).toBe(true);
    const { x, y } = board._toCanvas(0, 0);
    expect(x).toBe(7 * board.cellSize);
    expect(y).toBe(7 * board.cellSize);
  });

  it('supports flipping orientation after construction via the mutable flipped flag', () => {
    // ChessGame always constructs this with playerColor 'white' and never
    // touches `flipped` afterward — the pass-and-play board keeps a fixed
    // orientation throughout a match. This just verifies the renderer's own
    // general-purpose capability, independent of whether any caller uses it.
    const board = new ChessBoardCH(makeFakeCanvas(), 'white');
    expect(board.flipped).toBe(false);
    board.flipped = true;
    const { x, y } = board._toCanvas(0, 0);
    expect(x).toBe(7 * board.cellSize);
    expect(y).toBe(7 * board.cellSize);
  });
});

describe('ChessBoardCH label toggle', () => {
  it('defaults showLabels to false (piece letters removed) and honors opts.showLabels=true', () => {
    expect(new ChessBoardCH(makeFakeCanvas(), 'white').showLabels).toBe(false);
    expect(new ChessBoardCH(makeFakeCanvas(), 'white', 560, { showLabels: true }).showLabels).toBe(true);
  });

  it('setShowLabels updates the flag', () => {
    const board = new ChessBoardCH(makeFakeCanvas(), 'white');
    board.setShowLabels(true);
    expect(board.showLabels).toBe(true);
  });
});
