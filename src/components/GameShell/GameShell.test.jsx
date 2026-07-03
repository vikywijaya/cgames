import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GameShell } from './GameShell';

function TestGame({ onGameComplete }) {
  return (
    <GameShell
      gameId="test-game"
      title="Test Game"
      instructions="These are the instructions."
      difficulty="easy"
      onGameComplete={onGameComplete}
    >
      {({ onComplete }) => (
        <button onClick={() => onComplete({ finalScore: 7, maxScore: 10, completed: true })}>
          Finish Game
        </button>
      )}
    </GameShell>
  );
}

describe('GameShell', () => {
  it('renders the start screen initially', () => {
    render(<TestGame onGameComplete={vi.fn()} />);
    expect(screen.getByText('Test Game')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByText('These are the instructions')).toBeInTheDocument();
  });

  it('shows the difficulty badge', () => {
    render(<TestGame onGameComplete={vi.fn()} />);
    expect(screen.getByText('Easy')).toBeInTheDocument();
  });

  it('transitions to playing phase on Start', () => {
    render(<TestGame onGameComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByRole('button', { name: 'Finish Game' })).toBeInTheDocument();
  });

  it('transitions to end screen after game completes', () => {
    render(<TestGame onGameComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish Game' }));
    expect(screen.getByText('7')).toBeInTheDocument(); // score
    expect(screen.getByText('out of 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Again' })).toBeInTheDocument();
  });

  it('calls onGameComplete with the result', () => {
    const onGameComplete = vi.fn();
    render(<TestGame onGameComplete={onGameComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish Game' }));
    expect(onGameComplete).toHaveBeenCalledTimes(1);
    const result = onGameComplete.mock.calls[0][0];
    expect(result.score).toBe(7);
    expect(result.maxScore).toBe(10);
    expect(result.completed).toBe(true);
    expect(typeof result.durationSeconds).toBe('number');
  });

  it('returns to idle state on Play Again', () => {
    render(<TestGame onGameComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish Game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play Again' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('shows score headline based on performance', () => {
    render(<TestGame onGameComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish Game' }));
    // 7/10 = 70% → 'Well done!'
    expect(screen.getByText('Well done!')).toBeInTheDocument();
  });
});
