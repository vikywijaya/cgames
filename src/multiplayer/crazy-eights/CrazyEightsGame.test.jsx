import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrazyEightsGame } from './CrazyEightsGame';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';

function makeSocket() { return { emit: vi.fn(), on: vi.fn(), off: vi.fn() }; }

const baseState = {
  gameType: 'crazy-eights', isGameOver: false, phase: 'play', currentSeat: 0,
  myHand: [0, 4, 30], discardTop: 20, currentSuit: null, drawPileCount: 30,
  players: [{ name: 'Tester' }, { name: 'Opponent' }], handCounts: [7, 7],
};

beforeEach(() => { vi.clearAllMocks(); global.fetch = vi.fn(() => Promise.resolve({})); });

describe('CrazyEightsGame rendering', () => {
  it('shows all players with their hand counts', () => {
    render(
      <CrazyEightsGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" />
    );
    expect(screen.getByText(/Tester.*\(you\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/7 cards/)).toHaveLength(2);
  });

  it('plays a non-eight card directly when Play is clicked', () => {
    const socket = makeSocket();
    render(
      <CrazyEightsGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={socket} memberId="m-1" />
    );
    fireEvent.click(screen.getByText('A')); // card id 0 = Ace of Diamonds
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(socket.emit).toHaveBeenCalledWith('c8_play', { cardId: 0, chosenSuit: null });
  });

  it('opens the suit chooser instead of playing immediately for an 8', () => {
    const socket = makeSocket();
    render(
      <CrazyEightsGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={socket} memberId="m-1" />
    );
    fireEvent.click(screen.getByText('8')); // card id 30 = 8 of Hearts
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(socket.emit).not.toHaveBeenCalledWith('c8_play', expect.anything());
    expect(screen.getByText(/choose a suit/i)).toBeInTheDocument();
  });

  it('plays the chosen suit once picked from the suit chooser', () => {
    const socket = makeSocket();
    render(
      <CrazyEightsGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={socket} memberId="m-1" />
    );
    fireEvent.click(screen.getByText('8'));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hearts' }));
    expect(socket.emit).toHaveBeenCalledWith('c8_play', { cardId: 30, chosenSuit: 'H' });
  });

  it('emits c8_draw when Draw is clicked', () => {
    const socket = makeSocket();
    render(
      <CrazyEightsGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={socket} memberId="m-1" />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
    expect(socket.emit).toHaveBeenCalledWith('c8_draw');
  });
});

describe('CrazyEightsGame scoring', () => {
  it('saves a win (100%) when my seat is the winner', () => {
    render(
      <CrazyEightsGame myColor="p1" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 0, reason: 'Played all cards!' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-crazy-eights', 100, expect.any(Number), 'm-1', null);
  });

  it('saves a loss (0%) when another seat wins', () => {
    render(
      <CrazyEightsGame myColor="p1" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 1, reason: 'Played all cards!' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-crazy-eights', 0, expect.any(Number), 'm-1', null);
  });

  it('posts to callbackUrl when one is provided', () => {
    render(
      <CrazyEightsGame myColor="p1" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 0, reason: 'Played all cards!' }}
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
      <CrazyEightsGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" />
    );
    expect(saveScore).not.toHaveBeenCalled();
  });
});

describe('CrazyEightsGame connection banners', () => {
  it('shows a reconnecting banner when status is disconnected', () => {
    render(
      <CrazyEightsGame myColor="p1" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" status="disconnected" reconnectAttempt={1}
        disconnectedPlayerName={null} />
    );
    expect(screen.getByText(/reconnecting.*attempt 1/i)).toBeInTheDocument();
  });
});
