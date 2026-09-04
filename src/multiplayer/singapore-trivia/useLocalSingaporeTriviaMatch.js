import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame, QUESTION_TIME } from './singaporeTriviaEngine';

const PLAYERS = [
  { name: 'Player 1', color: 'p1' },
  { name: 'Player 2', color: 'p2' },
];

export function useLocalSingaporeTriviaMatch() {
  const engineRef = useRef(createGame(2));
  const [gameState, setGameState] = useState(() => engineRef.current.state());
  const [lastGameOver, setLastGameOver] = useState(null);
  const timerRef = useRef(null);

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const sync = useCallback(() => {
    setGameState(engineRef.current.state());
  }, []);

  const scheduleAutoReveal = useCallback(() => {
    clearPendingTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      // Guard against a reveal that already happened another way (manual
      // reveal or all-answered early reveal) between scheduling and firing.
      if (engineRef.current.state().phase !== 'question') return;
      engineRef.current.revealAnswers();
      sync();
    }, QUESTION_TIME * 1000);
  }, [clearPendingTimer, sync]);

  useEffect(() => clearPendingTimer, [clearPendingTimer]);

  const dispatch = useCallback((action, payload = {}) => {
    const engine = engineRef.current;

    if (action === 'start_question') {
      const result = engine.startQuestion();
      if (result.ok) {
        sync();
        scheduleAutoReveal();
      }
      return;
    }

    if (action === 'submit_answer') {
      const result = engine.submitAnswer(payload.seat, payload.answerIndex);
      if (!result.ok) return;
      if (result.allAnswered) {
        clearPendingTimer();
        engine.revealAnswers();
      }
      sync();
      return;
    }

    if (action === 'reveal') {
      clearPendingTimer();
      const result = engine.revealAnswers();
      if (result.ok) sync();
      return;
    }

    if (action === 'next_question') {
      const result = engine.nextQuestion();
      if (!result.ok) return;
      sync();
      if (result.finished) {
        const winnerSeat = engine.winner();
        const winnerName = PLAYERS[winnerSeat].name;
        const winnerScore = engine.state().scores[winnerSeat];
        setLastGameOver({ winner: winnerSeat, reason: `${winnerName} wins with ${winnerScore} points!` });
      }
      return;
    }

    if (action === 'resign') {
      clearPendingTimer();
      const resigningSeat = payload.seat;
      const winner = 1 - resigningSeat;
      setLastGameOver({ winner, reason: 'Resigned' });
      setGameState(prev => ({ ...prev, isGameOver: true, winner }));
      return;
    }

    if (action === 'play_again') {
      clearPendingTimer();
      engineRef.current = createGame(2);
      setLastGameOver(null);
      setGameState(engineRef.current.state());
      return;
    }
  }, [sync, scheduleAutoReveal, clearPendingTimer]);

  return { gameState, lastGameOver, players: PLAYERS, dispatch };
}
