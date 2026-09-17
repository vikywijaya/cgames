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
      // Guard against the all-answered early reveal having landed between
      // scheduling this and it firing.
      if (engineRef.current.state().phase !== 'question') return;
      engineRef.current.revealAnswers();
      sync();
    }, QUESTION_TIME * 1000);
  }, [clearPendingTimer, sync]);

  useEffect(() => clearPendingTimer, [clearPendingTimer]);

  // gameState.timeLeft is derived from `_timerEnd - Date.now()` inside the
  // engine, but engine.state() is only ever recomputed when a dispatch()
  // call happens to sync() — so without this, the on-screen "⏱ 20s" stays
  // frozen at whatever it was when the question started until a player
  // answers (or the auto-reveal timeout fires) forces the next sync. Tick
  // once a second while a question is live so the countdown actually counts
  // down.
  useEffect(() => {
    if (gameState.phase !== 'question') return;
    const id = setInterval(sync, 1000);
    return () => clearInterval(id);
  }, [gameState.phase, sync]);

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
