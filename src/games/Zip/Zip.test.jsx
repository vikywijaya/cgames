import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Zip } from './Zip';

afterEach(() => vi.useRealTimers());

describe('Zip', () => {
  it('can always be finished with hints, and scores 1 star per heavily-hinted puzzle', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(<Zip memberId="m1" difficulty="easy" onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => { vi.advanceTimersByTime(5000); });

    expect(screen.getByText('Puzzle 1 of 3')).toBeInTheDocument();
    for (let i = 0; i < 200 && !onComplete.mock.calls.length; i++) {
      const hint = screen.queryByRole('button', { name: /Hint/ });
      if (hint && !hint.disabled) fireEvent.click(hint);
      else act(() => { vi.advanceTimersByTime(2000); });
    }
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    const result = onComplete.mock.calls[0][0];
    expect(result.maxScore).toBe(9);
    expect(result.score).toBe(3);
    expect(result.completed).toBe(true);
  });
});
