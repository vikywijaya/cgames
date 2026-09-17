import { describe, it, expect, vi } from 'vitest';
import { XiangqiBoardCH } from './XiangqiBoardCH';

function makeFakeCanvas() {
  return {
    getContext: () => ({
      fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
      stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), setTransform: vi.fn(),
      save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    }),
    width: 480, height: 533,
    style: {},
    addEventListener: vi.fn(),
  };
}

describe('XiangqiBoardCH coordinate transforms', () => {
  it('never flips — the shared board keeps a fixed orientation', () => {
    const board = new XiangqiBoardCH(makeFakeCanvas());
    const { x, y } = board._toCanvas(0, 0);
    expect(x).toBe(board.padding);
    expect(y).toBe(board.padding);
  });

  it('maps the bottom-right intersection to the bottom-right of the canvas', () => {
    const board = new XiangqiBoardCH(makeFakeCanvas());
    const { x, y } = board._toCanvas(9, 8);
    expect(x).toBe(board.padding + 8 * board.cellW);
    expect(y).toBe(board.padding + 9 * board.cellH);
  });

  it('sizes the canvas taller than it is wide (10 rows over 9 cols)', () => {
    const board = new XiangqiBoardCH(makeFakeCanvas(), 400);
    expect(board.height).toBeGreaterThan(board.width);
  });
});

describe('XiangqiBoardCH resizing', () => {
  it('setMaxSize updates maxSize and re-renders at the new size', () => {
    const board = new XiangqiBoardCH(makeFakeCanvas(), 400);
    board.setMaxSize(300);
    expect(board.maxSize).toBe(300);
  });
});
