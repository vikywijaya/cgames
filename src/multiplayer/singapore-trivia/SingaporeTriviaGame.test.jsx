import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SingaporeTriviaGame } from './SingaporeTriviaGame';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';

function makeSocket() { return { emit: vi.fn(), on: vi.fn(), off: vi.fn() }; }

const questionState = {
  gameType: 'singapore-trivia', isGameOver: false, phase: 'question',
  questionIndex: 0, totalQuestions: 10, timeLeft: 15, answeredCount: 0, playerCount: 2,
  players: [{ name: 'Tester', color: 'p1' }, { name: 'Opponent', color: 'p2' }],
  scores: [0, 0], answers: [null, null],
  currentQuestion: { text: 'What is the national flower of Singapore?', imageUrl: null,
    options: ['Orchid', 'Rose', 'Tulip', 'Lily'], correctIndex: 0 },
};

beforeEach(() => { vi.clearAllMocks(); global.fetch = vi.fn(() => Promise.resolve({})); });

describe('SingaporeTriviaGame rendering', () => {
  it('shows the current question and its options', () => {
    render(
      <SingaporeTriviaGame myColor="p1" myName="Tester" gameState={questionState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" />
    );
    expect(screen.getByText('What is the national flower of Singapore?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Orchid/ })).toBeInTheDocument();
  });

  it('submits my answer when an option is clicked', () => {
    const socket = makeSocket();
    render(
      <SingaporeTriviaGame myColor="p1" myName="Tester" gameState={questionState} lastGameOver={null}
        socket={socket} memberId="m-1" />
    );
    fireEvent.click(screen.getByRole('button', { name: /Orchid/ }));
    expect(socket.emit).toHaveBeenCalledWith('trivia_answer', { answerIndex: 0 });
  });

  it('locks all options after answering', () => {
    const socket = makeSocket();
    render(
      <SingaporeTriviaGame myColor="p1" myName="Tester" gameState={questionState} lastGameOver={null}
        socket={socket} memberId="m-1" />
    );
    fireEvent.click(screen.getByRole('button', { name: /Orchid/ }));
    expect(screen.getByRole('button', { name: /Rose/ })).toBeDisabled();
  });

  it('shows host controls only for p1', () => {
    render(
      <SingaporeTriviaGame myColor="p1" myName="Tester" gameState={questionState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" />
    );
    expect(screen.getByRole('button', { name: 'Reveal' })).toBeInTheDocument();
  });

  it('hides host controls for non-host players', () => {
    render(
      <SingaporeTriviaGame myColor="p2" myName="Opponent" gameState={questionState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" />
    );
    expect(screen.queryByRole('button', { name: 'Reveal' })).not.toBeInTheDocument();
  });
});

describe('SingaporeTriviaGame scoring', () => {
  const finishedState = { ...questionState, scores: [21, 15] };

  it('saves a percentage based on my score out of totalQuestions*3', () => {
    render(
      <SingaporeTriviaGame myColor="p1" myName="Tester" gameState={finishedState}
        lastGameOver={{ winner: 0, reason: null }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    // 21 / (10*3) = 70%
    expect(saveScore).toHaveBeenCalledWith('mp-singapore-trivia', 70, expect.any(Number), 'm-1', null);
  });

  it('posts to callbackUrl with the raw score and maxScore', () => {
    render(
      <SingaporeTriviaGame myColor="p1" myName="Tester" gameState={finishedState}
        lastGameOver={{ winner: 0, reason: null }}
        socket={makeSocket()} memberId="m-1" callbackUrl="https://host.example/callback" accessToken="tok" />
    );
    expect(buildPayload).toHaveBeenCalledWith(expect.objectContaining({ score: 21, maxScore: 30 }));
    expect(global.fetch).toHaveBeenCalledWith(
      'https://host.example/callback',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('does not report a result when there is no lastGameOver yet', () => {
    render(
      <SingaporeTriviaGame myColor="p1" myName="Tester" gameState={finishedState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" />
    );
    expect(saveScore).not.toHaveBeenCalled();
  });
});

describe('SingaporeTriviaGame connection banners', () => {
  it('shows a reconnecting banner when status is disconnected', () => {
    render(
      <SingaporeTriviaGame myColor="p1" myName="Tester" gameState={questionState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" status="disconnected" reconnectAttempt={4}
        disconnectedPlayerName={null} />
    );
    expect(screen.getByText(/reconnecting.*attempt 4/i)).toBeInTheDocument();
  });
});
