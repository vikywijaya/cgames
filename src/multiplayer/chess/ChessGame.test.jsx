import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChessGame } from './ChessGame';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';

function makeSocket() { return { emit: vi.fn(), on: vi.fn(), off: vi.fn() }; }

const baseState = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', turn: 'w', isGameOver: false, inCheck: false };

// jsdom has no real 2D canvas context; ChessGame mounts the real ChessBoard
// class (deliberately not mocked — this is the integration point worth
// exercising for real), so stub just enough of the context for `draw()` to
// run without throwing. Same approach as ChessBoardCanvas.test.js's fake canvas.
beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({}));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
  }));
});

describe('ChessGame scoring', () => {
  it('saves a win (100%) when I am the winner', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 'white', reason: 'Checkmate' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-chess', 100, expect.any(Number), 'm-1', null);
  });

  it('saves a loss (0%) when the opponent wins', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 'black', reason: 'Checkmate' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-chess', 0, expect.any(Number), 'm-1', null);
  });

  it('saves a draw (50%) on stalemate', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 'draw', reason: 'Stalemate' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-chess', 50, expect.any(Number), 'm-1', null);
  });

  it('posts to callbackUrl when one is provided', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 'white', reason: 'Checkmate' }}
        socket={makeSocket()} memberId="m-1" callbackUrl="https://host.example/callback" accessToken="tok" />
    );
    expect(buildPayload).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://host.example/callback',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('does not report a result when there is no lastGameOver yet', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState}
        lastGameOver={null}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).not.toHaveBeenCalled();
  });
});

describe('ChessGame connection banners', () => {
  it('shows a reconnecting banner when status is disconnected', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" status="disconnected" reconnectAttempt={2}
        disconnectedPlayerName={null} />
    );
    expect(screen.getByText(/reconnecting.*attempt 2/i)).toBeInTheDocument();
  });

  it('shows an opponent-disconnected notice', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" status="connected" reconnectAttempt={0}
        disconnectedPlayerName="Opponent" />
    );
    expect(screen.getByText(/opponent disconnected/i)).toBeInTheDocument();
  });

  it('shows no banner when connected and no one has disconnected', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" status="connected" reconnectAttempt={0}
        disconnectedPlayerName={null} />
    );
    expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/disconnected/i)).not.toBeInTheDocument();
  });
});
