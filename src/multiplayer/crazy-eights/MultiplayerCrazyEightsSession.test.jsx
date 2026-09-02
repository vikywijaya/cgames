import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const mockHookReturn = {
  status: 'connected', reconnectAttempt: 0, roomId: null, myColor: null, players: [],
  gameState: null, lastGameOver: null, errorMessage: null, disconnectedPlayerName: null,
  socketInstance: { emit: vi.fn() },
  createRoom: vi.fn(), joinRoom: vi.fn(), startGame: vi.fn(),
};
vi.mock('../useMultiplayerSocket', () => ({
  useMultiplayerSocket: vi.fn(() => mockHookReturn),
}));

vi.mock('./CrazyEightsGame', () => ({
  CrazyEightsGame: () => <div>crazy eights game screen</div>,
}));

import { MultiplayerCrazyEightsSession } from './MultiplayerCrazyEightsSession';

describe('MultiplayerCrazyEightsSession', () => {
  it('renders the lobby while no game has started', () => {
    render(<MultiplayerCrazyEightsSession memberId="m-1" />);
    expect(screen.getByText('Crazy Eights')).toBeInTheDocument();
  });

  it('renders the game once gameState is present', () => {
    mockHookReturn.gameState = { gameType: 'crazy-eights', isGameOver: false, phase: 'play', currentSeat: 0 };
    mockHookReturn.myColor = 'p1';
    render(<MultiplayerCrazyEightsSession memberId="m-1" />);
    expect(screen.queryByText('Crazy Eights')).not.toBeInTheDocument();
    expect(screen.getByText('crazy eights game screen')).toBeInTheDocument();
  });
});
