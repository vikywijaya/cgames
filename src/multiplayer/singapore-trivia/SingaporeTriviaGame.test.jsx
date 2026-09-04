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

describe('SingaporeTriviaGame split-screen', () => {
  it('renders two player panels before any question has started', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    expect(screen.getByText(/Player 1/)).toBeInTheDocument();
    expect(screen.getByText(/Player 2/)).toBeInTheDocument();
  });

  it('shows a Next Question control while waiting, and starts a question when clicked', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    // Once a question has started, 8 answer option buttons exist (4 per pane).
    const optionButtons = screen.getAllByRole('button').filter(b => /^[A-D]\)/.test(b.textContent || ''));
    expect(optionButtons.length).toBe(8);
  });

  it('answering on one pane does not reveal the other pane\'s pick or the correct answer', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    const optionButtons = screen.getAllByRole('button').filter(b => /^[A-D]\)/.test(b.textContent || ''));
    fireEvent.click(optionButtons[0]); // seat 0's first option
    // No green/red highlighting classes should exist yet — reveal hasn't happened.
    expect(document.querySelector('[class*="correct"]')).toBeNull();
    expect(document.querySelector('[class*="wrong"]')).toBeNull();
  });

  it('auto-reveals after 20 seconds', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(document.querySelector('[class*="correct"]')).not.toBeNull();
  });

  it('shows resign buttons for both panes and a reset button', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    expect(screen.getAllByRole('button', { name: /resign/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^reset$/i }).length).toBeGreaterThan(0);
  });

  it('reports a loss from Player 1\'s perspective when seat 0 resigns', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    expect(saveScore).toHaveBeenCalledWith('mp-singapore-trivia', 0, expect.any(Number), 'm-1', null);
  });
});

describe('SingaporeTriviaGame reset', () => {
  it('asks for confirmation before resetting', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    expect(screen.getByText(/reset this game\?/i)).toBeInTheDocument();
  });

  it('cancelling leaves the game untouched', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/reset this game\?/i)).not.toBeInTheDocument();
  });

  it('confirming restarts the match at the waiting phase', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /yes, reset/i }));
    expect(screen.getByRole('button', { name: /next question/i })).toBeInTheDocument();
  });
});
