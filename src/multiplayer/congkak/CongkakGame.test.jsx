import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { CongkakGame } from './CongkakGame';

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  global.fetch = vi.fn(() => Promise.resolve({}));
});

afterEach(() => {
  vi.useRealTimers();
  // Safety net in case a test throws before its own inline restore runs.
  window.matchMedia = originalMatchMedia;
});

/** Run the whole sowing animation to completion. */
function finishAnimation() {
  act(() => { vi.advanceTimersByTime(20000); });
}

describe('CongkakGame board wiring', () => {
  it('starts with P1 to move — only P1 houses are tappable', () => {
    render(<CongkakGame memberId="m-1" />);
    expect(screen.getByLabelText(/Your hole 1, 7 seeds/i)).toBeEnabled();
    expect(screen.getByLabelText(/Opponent hole 1, 7 seeds/i)).toHaveAttribute('aria-disabled', 'true');
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
    // mid-animation: every hole is aria-disabled (not natively disabled, so
    // focus isn't force-blurred — the spec calls for aria-disabled here).
    expect(screen.getByLabelText(/Your hole 2/i)).toHaveAttribute('aria-disabled', 'true');
    finishAnimation();
  });

  it('resolves a move instantly under prefers-reduced-motion, with no animation delay', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation(query => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    render(<CongkakGame memberId="m-1" />);
    fireEvent.click(screen.getByLabelText(/Your hole 3, 7 seeds/i));
    // No finishAnimation()/timer advance needed — reduced motion resolves
    // synchronously inside the effect, not via setTimeout.
    expect(screen.getByLabelText(/Opponent hole 3, 0 seeds/i)).toBeInTheDocument();

    window.matchMedia = originalMatchMedia;
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

import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';

describe('CongkakGame game over', () => {
  it('shows the game-over modal when a player resigns', () => {
    render(<CongkakGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reports a loss for P1 when P1 resigns', () => {
    render(<CongkakGame memberId="m-1" />);
    // The rotated card is P2's; index 0 is P2's resign, index 1 is P1's.
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[1]);
    expect(saveScore).toHaveBeenCalledWith('mp-congkak', 0, expect.any(Number), 'm-1', null);
  });

  it('reports a win for P1 when P2 resigns', () => {
    render(<CongkakGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    expect(saveScore).toHaveBeenCalledWith('mp-congkak', 100, expect.any(Number), 'm-1', null);
  });

  it('builds the payload with the standard game id and max score', () => {
    render(<CongkakGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    expect(buildPayload).toHaveBeenCalledWith(expect.objectContaining({
      memberId: 'm-1', gameId: 'mp-congkak', score: 100, maxScore: 100, completed: true,
    }));
  });

  it('fires the completion payload exactly once', () => {
    render(<CongkakGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    finishAnimation();
    expect(saveScore).toHaveBeenCalledTimes(1);
  });

  it('POSTs to callbackUrl with the access token header when both are given', () => {
    render(<CongkakGame memberId="m-1" callbackUrl="https://example.test/done" accessToken="tok-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    expect(global.fetch).toHaveBeenCalledWith('https://example.test/done', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Access-Token': 'tok-1' }),
    }));
  });

  it('does not POST when no callbackUrl is given', () => {
    render(<CongkakGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('Play Again from the modal starts a fresh board', () => {
    render(<CongkakGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /play again/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Your hole 1, 7 seeds/i)).toBeInTheDocument();
  });

  it('disables Undo and Resign once the game is over', () => {
    render(<CongkakGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    expect(screen.getAllByRole('button', { name: /undo/i })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /resign/i })[0]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /resign/i })[1]).toBeDisabled();
  });
});
