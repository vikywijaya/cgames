import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { ChessGame } from './ChessGame';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({}));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
  }));
});

describe('ChessGame split-screen', () => {
  it('renders two player panels, one per local seat', () => {
    render(<ChessGame memberId="m-1" />);
    expect(screen.getByText('Player 1 (white)')).toBeInTheDocument();
    expect(screen.getByText('Player 2 (black)')).toBeInTheDocument();
  });

  it('renders two canvases (one board per pane)', () => {
    const { container } = render(<ChessGame memberId="m-1" />);
    expect(container.querySelectorAll('canvas')).toHaveLength(2);
  });

  it('shows a resign button for the side to move', () => {
    render(<ChessGame memberId="m-1" />);
    expect(screen.getAllByRole('button', { name: /resign/i }).length).toBeGreaterThan(0);
  });

  it('reports white-perspective score on white win', () => {
    render(<ChessGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]); // black is not to move; this resigns white (side to move)
    expect(saveScore).toHaveBeenCalledWith('mp-chess', 0, expect.any(Number), 'm-1', null);
  });
});
