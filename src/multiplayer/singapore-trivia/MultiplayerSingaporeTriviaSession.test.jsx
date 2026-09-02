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

vi.mock('./SingaporeTriviaGame', () => ({
  SingaporeTriviaGame: () => <div>singapore trivia game screen</div>,
}));

import { MultiplayerSingaporeTriviaSession } from './MultiplayerSingaporeTriviaSession';

describe('MultiplayerSingaporeTriviaSession', () => {
  it('renders the lobby while no game has started', () => {
    render(<MultiplayerSingaporeTriviaSession memberId="m-1" />);
    expect(screen.getByText('Singapore Trivia')).toBeInTheDocument();
  });

  it('renders the game once gameState is present', () => {
    mockHookReturn.gameState = { gameType: 'singapore-trivia', isGameOver: false, phase: 'waiting' };
    mockHookReturn.myColor = 'p1';
    render(<MultiplayerSingaporeTriviaSession memberId="m-1" />);
    expect(screen.queryByText('Singapore Trivia')).not.toBeInTheDocument();
    expect(screen.getByText('singapore trivia game screen')).toBeInTheDocument();
  });
});
