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

vi.mock('./GinRummyGame', () => ({
  GinRummyGame: () => <div>gin rummy game screen</div>,
}));

import { MultiplayerGinRummySession } from './MultiplayerGinRummySession';

describe('MultiplayerGinRummySession', () => {
  it('renders the lobby while no game has started', () => {
    render(<MultiplayerGinRummySession memberId="m-1" />);
    expect(screen.getByText('Gin Rummy')).toBeInTheDocument();
  });

  it('renders the game once gameState is present', () => {
    mockHookReturn.gameState = { gameType: 'gin-rummy', isGameOver: false, phase: 'draw', currentSeat: 0 };
    mockHookReturn.myColor = 'p1';
    render(<MultiplayerGinRummySession memberId="m-1" />);
    expect(screen.queryByText('Gin Rummy')).not.toBeInTheDocument();
    expect(screen.getByText('gin rummy game screen')).toBeInTheDocument();
  });
});
