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

// ChessGame mounts the real canvas board, which needs a working 2D context
// jsdom doesn't provide — irrelevant to what this test verifies (lobby vs.
// game switching), so it's mocked out here the same way useMultiplayerSocket is.
vi.mock('./ChessGame', () => ({
  ChessGame: () => <div>chess game screen</div>,
}));

import { MultiplayerChessSession } from './MultiplayerChessSession';

describe('MultiplayerChessSession', () => {
  it('renders the lobby while no game has started', () => {
    render(<MultiplayerChessSession memberId="m-1" />);
    expect(screen.getByText('CaritaHub Chess')).toBeInTheDocument();
  });

  it('renders the game once gameState is present', () => {
    mockHookReturn.gameState = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', turn: 'w', isGameOver: false };
    mockHookReturn.myColor = 'white';
    render(<MultiplayerChessSession memberId="m-1" />);
    expect(screen.queryByText('CaritaHub Chess')).not.toBeInTheDocument();
    expect(screen.getByText('chess game screen')).toBeInTheDocument();
  });
});
