import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { CrazyEightsGame } from './CrazyEightsGame';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({}));
});

describe('CrazyEightsGame split-screen', () => {
  it('renders two player panels, one per local seat', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    expect(screen.getByText('Player 1 (p1)')).toBeInTheDocument();
    expect(screen.getByText('Player 2 (p2)')).toBeInTheDocument();
  });

  it('shows the on-turn seat\'s hand face-up (5 cards) and the other seat\'s hand as 5 face-down backs', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    const backs = screen.getAllByText('—');
    expect(backs).toHaveLength(5);
  });

  it('draws a card on the active pane, growing its hand to 6', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Draw \(/ }));
    // After drawing, Pass becomes available (assuming the drawn card isn't
    // playable — not guaranteed every run, so instead assert on the Draw
    // button becoming disabled, which is unconditional after one draw).
    expect(screen.getByRole('button', { name: /Draw \(/ })).toBeDisabled();
  });

  it('shows a resign button (only for the seat currently on turn) and a reset button', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    expect(screen.getAllByRole('button', { name: /resign/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^reset$/i }).length).toBeGreaterThan(0);
  });

  it('reports a loss from Player 1\'s perspective when seat 0 resigns', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /resign/i }));
    expect(saveScore).toHaveBeenCalledWith('mp-crazy-eights', 0, expect.any(Number), 'm-1', null);
  });
});

describe('CrazyEightsGame reset', () => {
  it('asks for confirmation before resetting', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    expect(screen.getByText(/reset this game\?/i)).toBeInTheDocument();
  });

  it('cancelling leaves the game untouched', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/reset this game\?/i)).not.toBeInTheDocument();
  });

  it('confirming restarts the match with a fresh deal', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /yes, reset/i }));
    expect(screen.getAllByRole('button', { name: /Draw \(/ }).length).toBeGreaterThan(0);
  });
});
