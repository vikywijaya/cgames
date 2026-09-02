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

// XiangqiGame mounts the real canvas board, which needs a working 2D context
// jsdom doesn't provide — irrelevant to what this test verifies (lobby vs.
// game switching), so it's mocked out here the same way useMultiplayerSocket is.
vi.mock('./XiangqiGame', () => ({
  XiangqiGame: () => <div>xiangqi game screen</div>,
}));

import { MultiplayerXiangqiSession } from './MultiplayerXiangqiSession';

describe('MultiplayerXiangqiSession', () => {
  it('renders the lobby while no game has started', () => {
    render(<MultiplayerXiangqiSession memberId="m-1" />);
    expect(screen.getByText('CaritaHub 象棋')).toBeInTheDocument();
  });

  it('renders the game once gameState is present', () => {
    mockHookReturn.gameState = { fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR', turn: 'w', isGameOver: false };
    mockHookReturn.myColor = 'red';
    render(<MultiplayerXiangqiSession memberId="m-1" />);
    expect(screen.queryByText('CaritaHub 象棋')).not.toBeInTheDocument();
    expect(screen.getByText('xiangqi game screen')).toBeInTheDocument();
  });
});
