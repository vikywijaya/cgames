import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { CongkakGame } from './CongkakGame';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  global.fetch = vi.fn(() => Promise.resolve({}));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Run the whole sowing animation to completion. */
function finishAnimation() {
  act(() => { vi.advanceTimersByTime(20000); });
}

describe('CongkakGame board wiring', () => {
  it('starts with P1 to move — only P1 houses are tappable', () => {
    render(<CongkakGame memberId="m-1" />);
    expect(screen.getByLabelText(/Your hole 1, 7 seeds/i)).toBeEnabled();
    expect(screen.getByLabelText(/Opponent hole 1, 7 seeds/i)).toBeDisabled();
  });

  it('tapping a legal hole sows and updates the board once the animation finishes', () => {
    render(<CongkakGame memberId="m-1" />);
    fireEvent.click(screen.getByLabelText(/Your hole 3, 7 seeds/i));
    finishAnimation();
    // House labels are turn-relative ("Your"/"Opponent" describes whoever is
    // about to tap next, not a fixed seat) — standard for an accessible
    // turn-based game. This move ends in a capture (never an extra turn), so
    // turn passes to P2, and this same physical house is now labelled from
    // P2's perspective: "Opponent hole 3", not "Your hole 3".
    expect(screen.getByLabelText(/Opponent hole 3, 0 seeds/i)).toBeInTheDocument();
  });

  it('locks the board while the animation is running', () => {
    render(<CongkakGame memberId="m-1" />);
    fireEvent.click(screen.getByLabelText(/Your hole 1, 7 seeds/i));
    act(() => { vi.advanceTimersByTime(120); });
    // mid-animation: every hole is disabled
    expect(screen.getByLabelText(/Your hole 2/i)).toBeDisabled();
    finishAnimation();
  });

  it('disables Undo until a move has been made, then enables it', () => {
    render(<CongkakGame memberId="m-1" />);
    expect(screen.getAllByRole('button', { name: /undo/i })[0]).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Your hole 1, 7 seeds/i));
    finishAnimation();
    expect(screen.getAllByRole('button', { name: /undo/i })[0]).toBeEnabled();
  });

  it('undo puts the seeds back', () => {
    render(<CongkakGame memberId="m-1" />);
    fireEvent.click(screen.getByLabelText(/Your hole 1, 7 seeds/i));
    finishAnimation();
    expect(screen.queryByLabelText(/Your hole 1, 7 seeds/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /undo/i })[0]);
    expect(screen.getByLabelText(/Your hole 1, 7 seeds/i)).toBeInTheDocument();
  });

  it('announces the move outcome in a live region', () => {
    render(<CongkakGame memberId="m-1" />);
    fireEvent.click(screen.getByLabelText(/Your hole 6, 7 seeds/i));
    finishAnimation();
    expect(screen.getByRole('status')).toHaveTextContent(/./);
  });
});
