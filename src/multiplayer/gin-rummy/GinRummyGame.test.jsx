import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { GinRummyGame } from './GinRummyGame';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({}));
});

describe('GinRummyGame split-screen', () => {
  it('renders two player panels, one per local seat', () => {
    render(<GinRummyGame memberId="m-1" />);
    expect(screen.getByText('Player 1 (p1)')).toBeInTheDocument();
    expect(screen.getByText('Player 2 (p2)')).toBeInTheDocument();
  });

  it('shows the on-turn seat\'s hand face-up and the other seat\'s hand as face-down backs', () => {
    render(<GinRummyGame memberId="m-1" />);
    // Seat 0 (Player 1) moves first — its 10 cards should render as real card
    // tiles (rank text visible); Player 2's pane should show 10 face-down backs.
    const backs = screen.getAllByText('—');
    expect(backs).toHaveLength(10);
  });

  it('draws from the draw pile on the active pane and advances to the discard phase', () => {
    render(<GinRummyGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Draw \(/ }));
    expect(screen.getAllByText(/discard a card or knock/i).length).toBeGreaterThan(0);
  });

  it('shows a resign button (only for the seat currently on turn) and a reset button', () => {
    render(<GinRummyGame memberId="m-1" />);
    // Seat 0 (Player 1) moves first, so only its pane renders a Resign button.
    expect(screen.getAllByRole('button', { name: /resign/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^reset$/i }).length).toBeGreaterThan(0);
  });

  it('reports a loss from Player 1\'s perspective when seat 0 resigns', () => {
    render(<GinRummyGame memberId="m-1" />);
    // Only seat 0's Resign button exists at the start (seat 0 is on turn).
    fireEvent.click(screen.getByRole('button', { name: /resign/i }));
    expect(saveScore).toHaveBeenCalledWith('mp-gin-rummy', 0, expect.any(Number), 'm-1', null);
  });
});

describe('GinRummyGame reset', () => {
  it('asks for confirmation before resetting', () => {
    render(<GinRummyGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    expect(screen.getByText(/reset this game\?/i)).toBeInTheDocument();
  });

  it('cancelling leaves the game untouched', () => {
    render(<GinRummyGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/reset this game\?/i)).not.toBeInTheDocument();
  });

  it('confirming restarts the match with a fresh deal', () => {
    render(<GinRummyGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /yes, reset/i }));
    expect(screen.getAllByRole('button', { name: /Draw \(/ }).length).toBeGreaterThan(0);
  });
});
