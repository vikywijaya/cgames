import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CongkakBoard } from './CongkakBoard';

const labels = {
  houseLabel: (hole, seeds) => `House ${hole}, ${seeds} seeds`,
  storeLabel: (seat, seeds) => `Store ${seat}, ${seeds} seeds`,
};

function renderBoard(props = {}) {
  return render(
    <CongkakBoard
      board={[7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0]}
      legalHoles={[0, 1, 2, 3, 4, 5, 6]}
      onHoleTap={() => {}}
      highlightHole={null}
      labels={labels}
      {...props}
    />
  );
}

describe('CongkakBoard', () => {
  it('renders all 14 houses and both stores', () => {
    renderBoard();
    for (let i = 0; i < 16; i++) {
      if (i === 7 || i === 15) continue;
      expect(screen.getByLabelText(`House ${i}, 7 seeds`)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Store 0, 0 seeds')).toBeInTheDocument();
    expect(screen.getByLabelText('Store 1, 0 seeds')).toBeInTheDocument();
  });

  it('shows the seed count as a numeral in every house', () => {
    renderBoard({ board: [12,0,0,0,0,0,0, 0, 0,0,0,0,0,0,0, 0] });
    expect(screen.getByLabelText('House 0, 12 seeds')).toHaveTextContent('12');
  });

  it('calls onHoleTap with the hole index when a legal hole is tapped', () => {
    const onHoleTap = vi.fn();
    renderBoard({ onHoleTap });
    fireEvent.click(screen.getByLabelText('House 3, 7 seeds'));
    expect(onHoleTap).toHaveBeenCalledWith(3);
  });

  it('disables holes that are not legal and does not call onHoleTap for them', () => {
    const onHoleTap = vi.fn();
    renderBoard({ onHoleTap, legalHoles: [0] });
    const illegal = screen.getByLabelText('House 3, 7 seeds');
    expect(illegal).toBeDisabled();
    fireEvent.click(illegal);
    expect(onHoleTap).not.toHaveBeenCalled();
  });

  it('never makes a store tappable', () => {
    const onHoleTap = vi.fn();
    renderBoard({ onHoleTap, legalHoles: [0, 7] });
    fireEvent.click(screen.getByLabelText('Store 0, 0 seeds'));
    expect(onHoleTap).not.toHaveBeenCalled();
  });

  it('marks the highlighted hole for the animation', () => {
    renderBoard({ highlightHole: 4 });
    expect(screen.getByLabelText('House 4, 7 seeds')).toHaveAttribute('data-highlight', 'true');
    expect(screen.getByLabelText('House 5, 7 seeds')).toHaveAttribute('data-highlight', 'false');
  });
});
