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

  it('shows resign buttons for both panes and a reset button', () => {
    renderStarted();
    expect(screen.getAllByRole('button', { name: /resign/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^reset$/i }).length).toBeGreaterThan(0);
  });

  it('asks for confirmation before resigning', () => {
    renderStarted();
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    expect(screen.getByText(/resign this game\?/i)).toBeInTheDocument();
    expect(saveScore).not.toHaveBeenCalled();
  });

  it('cancelling a resign leaves the match untouched', () => {
    renderStarted();
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/resign this game\?/i)).not.toBeInTheDocument();
    expect(saveScore).not.toHaveBeenCalled();
  });

  it('reports a loss from Player 1\'s perspective when seat 0 confirms resigning', () => {
    renderStarted();
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /yes, resign/i }));
    expect(saveScore).toHaveBeenCalledWith('mp-singapore-trivia', 0, expect.any(Number), 'm-1', null);
  });
});

describe('SingaporeTriviaGame reset', () => {
  it('asks for confirmation before resetting', () => {
    renderStarted();
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    expect(screen.getByText(/reset this game\?/i)).toBeInTheDocument();
  });

  it('cancelling leaves the game untouched', () => {
    renderStarted();
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/reset this game\?/i)).not.toBeInTheDocument();
  });

  it('confirming restarts the match at the ready gate', () => {
    renderStarted();
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /yes, reset/i }));
    expect(screen.getByRole('button', { name: /Player 1, I'm Ready/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Player 2, I'm Ready/i })).toBeInTheDocument();
  });
});
