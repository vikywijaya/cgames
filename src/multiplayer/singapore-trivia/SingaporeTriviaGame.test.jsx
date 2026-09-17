import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { SingaporeTriviaGame } from './SingaporeTriviaGame';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  global.fetch = vi.fn(() => Promise.resolve({}));
});

afterEach(() => {
  vi.useRealTimers();
});

// Every test below exercises the in-progress match rather than the
// ready-up flow itself (covered separately by 'SingaporeTriviaGame ready
// gate'), so tap both players' own per-pane Ready buttons first, same
// convention as ChessGame.test.jsx's renderStarted helper. Readying up both
// seats now serves the first question by itself, so these land straight on
// an open question with no further clicks.
function renderStarted(props) {
  const utils = render(<SingaporeTriviaGame memberId="m-1" {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /Player 1, I'm Ready/i }));
  fireEvent.click(screen.getByRole('button', { name: /Player 2, I'm Ready/i }));
  return utils;
}

describe('SingaporeTriviaGame ready gate', () => {
  it('does not start the match immediately — covers each pane with its own Ready button', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    expect(screen.getByRole('button', { name: /Player 1, I'm Ready/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Player 2, I'm Ready/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next question/i })).not.toBeInTheDocument();
  });

  it('one player readying up is not enough to start the match', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Player 1, I'm Ready/i }));
    expect(screen.getByRole('button', { name: /Player 2, I'm Ready/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next question/i })).not.toBeInTheDocument();
  });

  it("confirming one player's own cover leaves the other player's cover in place", () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Player 1, I'm Ready/i }));
    expect(screen.getByRole('button', { name: /✓ Player 1 Ready/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Player 2, I'm Ready/i })).not.toBeDisabled();
  });

  it('the match begins only once both players have confirmed ready', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Player 1, I'm Ready/i }));
    fireEvent.click(screen.getByRole('button', { name: /Player 2, I'm Ready/i }));
    expect(screen.queryByRole('button', { name: /I'm Ready/i })).not.toBeInTheDocument();
    // Straight into the first question — no second confirmation step.
    const optionButtons = screen.getAllByRole('button').filter(b => /^[A-D]\)/.test(b.textContent || ''));
    expect(optionButtons.length).toBe(8);
  });
});

describe('SingaporeTriviaGame split-screen', () => {
  it('renders two player panels once both players are ready', () => {
    renderStarted();
    expect(screen.getByText(/Player 1/)).toBeInTheDocument();
    expect(screen.getByText(/Player 2/)).toBeInTheDocument();
  });

  it('serves the first question as soon as both players are ready', () => {
    renderStarted();
    // 8 answer option buttons exist (4 per pane) with no further interaction,
    // and there is no leftover control asking to start the round.
    const optionButtons = screen.getAllByRole('button').filter(b => /^[A-D]\)/.test(b.textContent || ''));
    expect(optionButtons.length).toBe(8);
    expect(screen.queryByRole('button', { name: /next question/i })).not.toBeInTheDocument();
  });

  it('answering on one pane does not reveal the other pane\'s pick or the correct answer', () => {
    renderStarted();
    const optionButtons = screen.getAllByRole('button').filter(b => /^[A-D]\)/.test(b.textContent || ''));
    // Options 0-3 are seat 1's pane: it renders first so the rotated half
    // sits at the top of the screen. Seat 0's are 4-7.
    fireEvent.click(optionButtons[0]);
    // No green/red highlighting classes should exist yet — reveal hasn't happened.
    expect(document.querySelector('[class*="correct"]')).toBeNull();
    expect(document.querySelector('[class*="wrong"]')).toBeNull();
  });

  it('auto-reveals after 20 seconds', () => {
    renderStarted();
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(document.querySelector('[class*="correct"]')).not.toBeNull();
  });

  it('has no resign, reset or reveal controls', () => {
    renderStarted();
    expect(screen.queryByRole('button', { name: /resign/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reset$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reveal$/i })).not.toBeInTheDocument();
  });

  it('marks the correct option once both players have answered', () => {
    renderStarted();
    const opts = () => screen.getAllByRole('button').filter(b => /^[A-D]\)/.test(b.textContent || ''));

    // Seat 0 alone isn't enough — the round is still open, nothing revealed.
    fireEvent.click(opts()[0]);
    expect(document.querySelector('[class*="correct"]')).toBeNull();

    // 0-3 and 4-7 are the same question in each pane (seat 1's first — it
    // renders first so the rotated half is on top), so this is the other seat.
    fireEvent.click(opts()[4]);
    expect(document.querySelector('[class*="correct"]')).not.toBeNull();
  });
});
