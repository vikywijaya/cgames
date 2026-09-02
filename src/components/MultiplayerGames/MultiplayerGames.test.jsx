import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MultiplayerGames } from './MultiplayerGames';
import translations from '../../i18n/en';

const games = [
  { id: 'mp-chess', slug: 'chess', icon: '♟️', title: 'Chess', description: 'Classic chess against a friend.' },
  { id: 'mp-xiangqi', slug: 'xiangqi', icon: '🀄', title: 'Xiangqi', description: 'Traditional Chinese chess.' },
];

describe('MultiplayerGames', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    delete window.location;
    window.location = { href: '' };
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('renders the header title and subtitle', () => {
    render(<MultiplayerGames t={translations} games={games} />);
    expect(screen.getByText(translations.app.multiplayerTitle)).toBeInTheDocument();
    expect(screen.getByText(translations.app.multiplayerSubtitle)).toBeInTheDocument();
  });

  it('renders a card for every game with its translated title', () => {
    render(<MultiplayerGames t={translations} games={games} />);
    expect(screen.getByRole('button', { name: 'Play Chess' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Xiangqi' })).toBeInTheDocument();
    expect(screen.getByText('Chess')).toBeInTheDocument();
    expect(screen.getByText('Xiangqi')).toBeInTheDocument();
  });

  it('navigates to the correct room-lobby URL in the same tab when a card is clicked', () => {
    render(<MultiplayerGames t={translations} games={games} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Chess' }));
    expect(window.location.href).toBe('http://localhost:3000/lobby.html?game=chess');
  });

  it('navigates to a different game\'s URL for a different card', () => {
    render(<MultiplayerGames t={translations} games={games} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Xiangqi' }));
    expect(window.location.href).toBe('http://localhost:3000/lobby.html?game=xiangqi');
  });

  it('threads memberId, callbackUrl, and accessToken into the room-lobby URL when provided', () => {
    render(
      <MultiplayerGames
        t={translations}
        games={games}
        memberId="m-42"
        callbackUrl="https://host.example/callback"
        accessToken="tok-123"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Play Chess' }));
    const url = new URL(window.location.href);
    expect(url.searchParams.get('memberId')).toBe('m-42');
    expect(url.searchParams.get('callbackUrl')).toBe('https://host.example/callback');
    expect(url.searchParams.get('accessToken')).toBe('tok-123');
  });
});
