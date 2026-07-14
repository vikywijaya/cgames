import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiplayerGames } from './MultiplayerGames';
import translations from '../../i18n/en';

const games = [
  { id: 'mp-chess', slug: 'chess', icon: '♟️', title: 'Chess', description: 'Classic chess against a friend.' },
  { id: 'mp-xiangqi', slug: 'xiangqi', icon: '🀄', title: 'Xiangqi', description: 'Traditional Chinese chess.' },
];

describe('MultiplayerGames', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockImplementation(() => {});
  });

  it('renders the header title and subtitle', () => {
    render(<MultiplayerGames t={translations} games={games} />);
    expect(screen.getByText(translations.app.multiplayerTitle)).toBeInTheDocument();
    expect(screen.getByText(translations.app.multiplayerSubtitle)).toBeInTheDocument();
  });

  it('renders a card for every game with its translated title and description', () => {
    render(<MultiplayerGames t={translations} games={games} />);
    expect(screen.getByRole('button', { name: 'Play Chess' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Xiangqi' })).toBeInTheDocument();
    expect(screen.getByText('Classic chess against a friend.')).toBeInTheDocument();
  });

  it('opens the correct room-lobby URL in a new tab when a card is clicked', () => {
    render(<MultiplayerGames t={translations} games={games} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Chess' }));
    expect(window.open).toHaveBeenCalledWith(
      'https://caritahub-games.fly.dev/lobby.html?game=chess',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('opens a different game\'s URL for a different card', () => {
    render(<MultiplayerGames t={translations} games={games} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Xiangqi' }));
    expect(window.open).toHaveBeenCalledWith(
      'https://caritahub-games.fly.dev/lobby.html?game=xiangqi',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
