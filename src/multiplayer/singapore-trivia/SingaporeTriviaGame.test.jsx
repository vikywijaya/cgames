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
// convention as ChessGame.test.jsx's renderStarted helper.
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
    expect(screen.getByRole('button', { name: /next question/i })).toBeInTheDocument();
  });
});

describe('SingaporeTriviaGame split-screen', () => {
  it('renders two player panels once both players are ready', () => {
    renderStarted();
    expect(screen.getByText(/Player 1/)).toBeInTheDocument();
    expect(screen.getByText(/Player 2/)).toBeInTheDocument();
  });

  it('shows a Next Question control while waiting, and starts a question when clicked', () => {
    renderStarted();
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    // Once a question has started, 8 answer option buttons exist (4 per pane).
    const optionButtons = screen.getAllByRole('button').filter(b => /^[A-D]\)/.test(b.textContent || ''));
    expect(optionButtons.length).toBe(8);
  });

  it('answering on one pane does not reveal the other pane\'s pick or the correct answer', () => {
    renderStarted();
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    const optionButtons = screen.getAllByRole('button').filter(b => /^[A-D]\)/.test(b.textContent || ''));
    fireEvent.click(optionButtons[0]); // seat 0's first option
    // No green/red highlighting classes should exist yet — reveal hasn't happened.
    expect(document.querySelector('[class*="correct"]')).toBeNull();
    expect(document.querySelector('[class*="wrong"]')).toBeNull();
  });

  it('auto-reveals after 20 seconds', () => {
    renderStarted();
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(document.querySelector('[class*="correct"]')).not.toBeNull();
  });

  it('has no resign, reset or reveal controls', () => {
    renderStarted();
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    expect(screen.queryByRole('button', { name: /resign/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reset$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reveal$/i })).not.toBeInTheDocument();
  });

  it('spells out the correct answer once both players have answered', () => {
    renderStarted();
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    const opts = () => screen.getAllByRole('button').filter(b => /^[A-D]\)/.test(b.textContent || ''));

    // Seat 0 alone isn't enough — the round is still open.
    fireEvent.click(opts()[0]);
    expect(screen.queryByText(/correct answer:/i)).not.toBeInTheDocument();

    // opts()[4] is the same question rendered in the other player's pane.
    fireEvent.click(opts()[4]);
    // One per pane, so both players can read it the right way up.
    expect(screen.getAllByText(/correct answer:/i)).toHaveLength(2);
  });

  it('spells out the correct answer when the timer runs out instead', () => {
    renderStarted();
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    expect(screen.queryByText(/correct answer:/i)).not.toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(screen.getAllByText(/correct answer:/i)).toHaveLength(2);
  });
});
