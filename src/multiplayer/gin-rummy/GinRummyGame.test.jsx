import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GinRummyGame } from './GinRummyGame';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';

function makeSocket() { return { emit: vi.fn(), on: vi.fn(), off: vi.fn() }; }

const baseState = {
  gameType: 'gin-rummy', isGameOver: false, phase: 'discard', currentSeat: 0,
  myHand: [0, 4, 8], discardTop: 20, drawPileCount: 30,
  players: [{ name: 'Tester' }, { name: 'Opponent' }], handCounts: [10, 10],
};

beforeEach(() => { vi.clearAllMocks(); global.fetch = vi.fn(() => Promise.resolve({})); });

describe('GinRummyGame rendering', () => {
  it('shows both players with their hand counts', () => {
    render(
      <GinRummyGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" />
    );
    expect(screen.getByText(/Tester.*\(you\)/)).toBeInTheDocument();
    expect(screen.getByText(/Opponent/)).toBeInTheDocument();
    expect(screen.getAllByText(/10 cards/)).toHaveLength(2);
  });

  it('renders my hand as clickable card tiles', () => {
    render(
      <GinRummyGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" />
    );
    // card id 0 = A of Diamonds
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('emits gin_discard for the selected card when Discard is clicked (my turn, discard phase)', () => {
    const socket = makeSocket();
    render(
      <GinRummyGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={socket} memberId="m-1" />
    );
    fireEvent.click(screen.getByText('A')); // select card id 0
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(socket.emit).toHaveBeenCalledWith('gin_discard', { cardId: 0 });
  });

  it('emits gin_draw from the deck when Draw Deck is clicked (draw phase)', () => {
    const socket = makeSocket();
    render(
      <GinRummyGame myColor="p1" myName="Tester" gameState={{ ...baseState, phase: 'draw' }} lastGameOver={null}
        socket={socket} memberId="m-1" />
    );
    fireEvent.click(screen.getByRole('button', { name: /Draw \(30\)/ }));
    expect(socket.emit).toHaveBeenCalledWith('gin_draw', { source: 'draw' });
  });
});

describe('GinRummyGame scoring', () => {
  it('saves a win (100%) when my seat is the winner', () => {
    render(
      <GinRummyGame myColor="p1" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 0, reason: 'Gin!' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-gin-rummy', 100, expect.any(Number), 'm-1', null);
  });

  it('saves a loss (0%) when the opponent seat wins', () => {
    render(
      <GinRummyGame myColor="p1" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 1, reason: 'Gin!' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-gin-rummy', 0, expect.any(Number), 'm-1', null);
  });

  it('saves a draw (50%) when there is no winner seat', () => {
    render(
      <GinRummyGame myColor="p1" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: null, reason: 'Deck exhausted' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-gin-rummy', 50, expect.any(Number), 'm-1', null);
  });

  it('posts to callbackUrl when one is provided', () => {
    render(
      <GinRummyGame myColor="p1" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 0, reason: 'Gin!' }}
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
      <GinRummyGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" />
    );
    expect(saveScore).not.toHaveBeenCalled();
  });
});

describe('GinRummyGame connection banners', () => {
  it('shows a reconnecting banner when status is disconnected', () => {
    render(
      <GinRummyGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" status="disconnected" reconnectAttempt={3}
        disconnectedPlayerName={null} />
    );
    expect(screen.getByText(/reconnecting.*attempt 3/i)).toBeInTheDocument();
  });

  it('shows an opponent-disconnected notice', () => {
    render(
      <GinRummyGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" status="connected" reconnectAttempt={0}
        disconnectedPlayerName="Opponent" />
    );
    expect(screen.getByText(/opponent disconnected/i)).toBeInTheDocument();
  });
});
