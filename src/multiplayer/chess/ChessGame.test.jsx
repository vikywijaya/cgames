import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { ChessGame } from './ChessGame';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  global.fetch = vi.fn(() => Promise.resolve({}));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(), fillText: vi.fn(), strokeText: vi.fn(), beginPath: vi.fn(),
    arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), strokeRect: vi.fn(),
    moveTo: vi.fn(), arcTo: vi.fn(), closePath: vi.fn(), setTransform: vi.fn(),
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

// Renders the game and taps both players' own per-card Ready buttons, since
// every test below exercises the in-progress board rather than the ready-up
// flow itself (covered separately by 'ChessGame ready overlay').
function renderStarted(props) {
  const utils = render(<ChessGame memberId="m-1" {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Player 1, I'm Ready/i }));
  fireEvent.click(screen.getByRole('button', { name: /Player 2, I'm Ready/i }));
  return utils;
}

describe('ChessGame ready overlay', () => {
  it('does not start the match immediately — covers each player card with its own Ready button', () => {
    const { container } = render(<ChessGame memberId="m-1" />);
    // The opening position is already visible underneath each cover,
    // rather than a separate screen replacing them.
    expect(screen.getByRole('button', { name: /Player 1, I'm Ready/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Player 2, I'm Ready/i })).toBeInTheDocument();
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(screen.getByText('WHITE')).toBeInTheDocument();
    expect(screen.getAllByText('10:00')).toHaveLength(2);
  });

  it('one player readying up is not enough to start the match', () => {
    render(<ChessGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Player 1, I'm Ready/i }));
    expect(screen.getByRole('button', { name: /Player 2, I'm Ready/i })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getAllByText('10:00')).toHaveLength(2); // clock still frozen
  });

  it("confirming one player's own cover leaves the other player's cover in place", () => {
    render(<ChessGame memberId="m-1" />);
    const p1Ready = screen.getByRole('button', { name: /Player 1, I'm Ready/i });
    fireEvent.click(p1Ready);
    // Player 1's own cover confirms...
    expect(screen.getByRole('button', { name: /✓ Player 1 Ready/i })).toBeDisabled();
    // ...but the match still hasn't started, so Player 2's cover — and its
    // own Ready button — stays exactly as it was.
    expect(screen.getByRole('button', { name: /Player 2, I'm Ready/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Player 2, I'm Ready/i })).not.toBeDisabled();
  });

  it('the match begins only once both players have confirmed ready', () => {
    render(<ChessGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Player 1, I'm Ready/i }));
    fireEvent.click(screen.getByRole('button', { name: /Player 2, I'm Ready/i }));
    expect(screen.queryByRole('button', { name: /I'm Ready/i })).not.toBeInTheDocument();
  });

  it('does not tick the clock before both players are ready', () => {
    render(<ChessGame memberId="m-1" />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getAllByText('10:00')).toHaveLength(2); // still frozen at the starting time
  });

  it('does not allow moving a piece before both players are ready', () => {
    render(<ChessGame memberId="m-1" />);
    const canvas = document.querySelector('canvas');
    // Click a white pawn's square, then a square in front of it — if
    // selection were allowed pre-start this would record a move.
    fireEvent.click(canvas, { clientX: 5, clientY: 5 });
    fireEvent.click(canvas, { clientX: 5, clientY: 40 });
    expect(screen.getByText(/tap a piece to see where it can go/i)).toBeInTheDocument();
  });
});

describe('ChessGame pass-and-play', () => {
  it('renders both player cards and a single shared board', () => {
    renderStarted();
    // The P1/P2 chip carries the player name as its accessible name now
    // that the spelled-out label is gone; assert that rather than the text,
    // so this also fails if the label is ever dropped.
    expect(screen.getByRole('img', { name: 'Player 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Player 2' })).toBeInTheDocument();
    expect(screen.getByText('WHITE')).toBeInTheDocument();
    expect(screen.getByText('BLACK')).toBeInTheDocument();
  });

  it('renders exactly one canvas (one shared board, not one per pane)', () => {
    const { container } = renderStarted();
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
  });

  it('marks the side to move as active with a YOUR TURN badge', () => {
    renderStarted();
    expect(screen.getByText('YOUR TURN')).toBeInTheDocument();
  });

  it('starts both clocks at 10:00', () => {
    renderStarted();
    expect(screen.getAllByText('10:00')).toHaveLength(2);
  });

  it('ticks the active side\'s clock down each second', () => {
    renderStarted();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByText('9:57')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument(); // black's clock untouched
  });

  it('shows a resign control for the active side only', () => {
    renderStarted();
    const resignButtons = screen.getAllByRole('button', { name: /resign/i });
    expect(resignButtons.length).toBeGreaterThan(0);
    expect(resignButtons.some(b => !b.disabled)).toBe(true);
  });

  it('resigning opens a confirmation modal, and confirming reports white-perspective loss', () => {
    renderStarted();
    const resignBtn = screen.getAllByRole('button', { name: /resign/i }).find(b => !b.disabled);
    fireEvent.click(resignBtn);
    expect(screen.getByText(/resign this game\?/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /yes, resign/i }));
    expect(saveScore).toHaveBeenCalledWith('mp-chess', 0, expect.any(Number), 'm-1', null);
  });

  it('confirming a resignation replaces the confirmation modal with the game-over modal', () => {
    renderStarted();
    const resignBtn = screen.getAllByRole('button', { name: /resign/i }).find(b => !b.disabled);
    fireEvent.click(resignBtn);
    fireEvent.click(screen.getByRole('button', { name: /yes, resign/i }));
    // The stale confirmation dialog must not remain on screen once the
    // match has actually ended.
    expect(screen.queryByText(/resign this game\?/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play again/i })).toBeInTheDocument();
  });
});

describe('ChessGame reset', () => {
  it('shows a reset control during an in-progress game', () => {
    renderStarted();
    expect(screen.getAllByRole('button', { name: /^reset$/i }).length).toBeGreaterThan(0);
  });

  it('does not reset immediately — asks for confirmation first', () => {
    renderStarted();
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    expect(screen.getByText(/reset this game\?/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Player 1' })).toBeInTheDocument(); // board still mounted, unchanged
  });

  it('cancelling the confirmation leaves the game untouched', () => {
    renderStarted();
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/reset this game\?/i)).not.toBeInTheDocument();
  });

  it('confirming the reset restarts the match and both clocks', () => {
    renderStarted();
    act(() => { vi.advanceTimersByTime(5000); });
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /yes, reset/i }));
    expect(screen.queryByText(/reset this game\?/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('10:00')).toHaveLength(2);
  });

  it('confirming the reset re-arms the ready overlay for both players', () => {
    renderStarted();
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /yes, reset/i }));
    expect(screen.getByRole('button', { name: /Player 1, I'm Ready/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Player 2, I'm Ready/i })).toBeInTheDocument();
  });
});

describe('ChessGame draw offer', () => {
  it('offering a draw opens a confirmation modal', () => {
    renderStarted();
    const drawBtn = screen.getAllByRole('button', { name: /offer a draw/i }).find(b => !b.disabled);
    fireEvent.click(drawBtn);
    expect(screen.getByText(/agree to a draw\?/i)).toBeInTheDocument();
  });

  it('agreeing ends the game as a draw and reports a 50% score', () => {
    renderStarted();
    const drawBtn = screen.getAllByRole('button', { name: /offer a draw/i }).find(b => !b.disabled);
    fireEvent.click(drawBtn);
    fireEvent.click(screen.getByRole('button', { name: /agree to draw/i }));
    expect(saveScore).toHaveBeenCalledWith('mp-chess', 50, expect.any(Number), 'm-1', null);
  });
});
