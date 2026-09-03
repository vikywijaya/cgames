import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { XiangqiGame } from './XiangqiGame';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({}));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  }));
});

describe('XiangqiGame split-screen', () => {
  it('renders two player panels, one per local seat', () => {
    render(<XiangqiGame memberId="m-1" />);
    expect(screen.getByText('Player 1 (red)')).toBeInTheDocument();
    expect(screen.getByText('Player 2 (black)')).toBeInTheDocument();
  });

  it('renders two canvases (one board per pane)', () => {
    const { container } = render(<XiangqiGame memberId="m-1" />);
    expect(container.querySelectorAll('canvas')).toHaveLength(2);
  });

  it('shows a resign button and a reset button while the game is in progress', () => {
    render(<XiangqiGame memberId="m-1" />);
    expect(screen.getAllByRole('button', { name: /resign/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^reset$/i }).length).toBeGreaterThan(0);
  });

  it('reports red-perspective score on red win', () => {
    render(<XiangqiGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]); // red is to move, resigns
    expect(saveScore).toHaveBeenCalledWith('mp-xiangqi', 0, expect.any(Number), 'm-1', null);
  });
});

describe('XiangqiGame reset', () => {
  it('asks for confirmation before resetting', () => {
    render(<XiangqiGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    expect(screen.getByText(/reset this game\?/i)).toBeInTheDocument();
  });

  it('cancelling leaves the game untouched', () => {
    render(<XiangqiGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/reset this game\?/i)).not.toBeInTheDocument();
  });

  it('confirming restarts the match', () => {
    render(<XiangqiGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /yes, reset/i }));
    expect(screen.getByText("Player 1's turn")).toBeInTheDocument();
  });
});
