import { useCallback, useRef, useState } from 'react';
import { createGame } from './congkakEngine';

const PLAYERS = [
  { name: 'Player 1', color: 'p1' },
  { name: 'Player 2', color: 'p2' },
];

/**
 * Game-over reasons are fixed English tokens, not translated text — the UI
 * maps them to the current language, matching XiangqiGame's reasonLabel.
 */
function gameOverFromState(gs) {
  if (!gs.isGameOver) return null;
  return { winner: gs.winner, reason: gs.winner === 'draw' ? 'Draw' : 'Most seeds' };
}

export function useLocalCongkakMatch() {
  const engineRef = useRef(createGame());
  const historyRef = useRef([]);              // snapshots taken before each move
  const moveIdRef = useRef(0);
  const [gameState, setGameState] = useState(() => engineRef.current.state());
  const [lastMove, setLastMove] = useState(null);
  const [lastGameOver, setLastGameOver] = useState(null);

  const dispatch = useCallback((action, payload = {}) => {
    const engine = engineRef.current;

    if (action === 'move') {
      const before = engine.state();
      const result = engine.move(payload.seat, payload.hole);
      // An illegal move must not push a history entry, or undo would appear
      // to do nothing the next time it is pressed.
      if (!result.ok) return;

      historyRef.current.push({ board: before.board, turn: before.turn });
      moveIdRef.current += 1;
      setLastMove({ id: moveIdRef.current, boardBefore: before.board, steps: result.steps });
      setGameState(result.state);
      setLastGameOver(gameOverFromState(result.state));
      return;
    }

    if (action === 'undo') {
      const snapshot = historyRef.current.pop();
      if (!snapshot) return;
      engine.restore(snapshot);
      setLastMove(null);
      setLastGameOver(null);
      setGameState(engine.state());
      return;
    }

    if (action === 'resign') {
      // Unlike a move, a resignation can come from the seat that is not on
      // turn, so it is driven by payload.seat rather than engine turn order.
      const winner = 1 - payload.seat;
      engine.restore({ ...engine.state(), isGameOver: true, winner });
      setLastGameOver({ winner, reason: 'Resigned' });
      setGameState(engine.state());
      return;
    }

    if (action === 'reset' || action === 'play_again') {
      engineRef.current = createGame();
      historyRef.current = [];
      moveIdRef.current = 0;
      setLastMove(null);
      setLastGameOver(null);
      setGameState(engineRef.current.state());
      return;
    }

    if (action === 'restore_for_test') {
      engine.restore(payload);
      historyRef.current = [];
      setLastMove(null);
      setLastGameOver(null);
      setGameState(engine.state());
    }
  }, []);

  return { gameState, lastMove, lastGameOver, players: PLAYERS, dispatch };
}
