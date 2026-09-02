import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { XiangqiGame } from './XiangqiGame';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';

function makeSocket() { return { emit: vi.fn(), on: vi.fn(), off: vi.fn() }; }

const baseState = { fen: 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR', turn: 'w', isGameOver: false };

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({}));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  }));
});

describe('XiangqiGame scoring', () => {
  it('saves a win (100%) when I am the winner', () => {
    render(
      <XiangqiGame myColor="red" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 'red', reason: 'Checkmate' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-xiangqi', 100, expect.any(Number), 'm-1', null);
  });

  it('saves a loss (0%) when the opponent wins', () => {
    render(
      <XiangqiGame myColor="red" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 'black', reason: 'Checkmate' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-xiangqi', 0, expect.any(Number), 'm-1', null);
  });

  it('saves a draw (50%) when there is no winner', () => {
    render(
      <XiangqiGame myColor="red" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: null, reason: 'Stalemate' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-xiangqi', 50, expect.any(Number), 'm-1', null);
  });

  it('posts to callbackUrl when one is provided', () => {
    render(
      <XiangqiGame myColor="red" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 'red', reason: 'Checkmate' }}
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
      <XiangqiGame myColor="red" myName="Tester" gameState={baseState}
        lastGameOver={null}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).not.toHaveBeenCalled();
  });
});

describe('XiangqiGame connection banners', () => {
  it('shows a reconnecting banner when status is disconnected', () => {
    render(
      <XiangqiGame myColor="red" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" status="disconnected" reconnectAttempt={2}
        disconnectedPlayerName={null} />
    );
    expect(screen.getByText(/reconnecting.*attempt 2/i)).toBeInTheDocument();
  });

  it('shows an opponent-disconnected notice', () => {
    render(
      <XiangqiGame myColor="red" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" status="connected" reconnectAttempt={0}
        disconnectedPlayerName="Opponent" />
    );
    expect(screen.getByText(/opponent disconnected/i)).toBeInTheDocument();
  });
});
