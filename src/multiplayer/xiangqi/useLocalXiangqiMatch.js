import { useCallback, useRef, useState } from 'react';
import { createGame } from './xiangqiEngine';

const PLAYERS = [
  { name: 'Player 1', color: 'red' },
  { name: 'Player 2', color: 'black' },
];

function snapshot(engine, lastMove) {
  return {
    fen: engine.fen(),
    turn: engine.turn(),
    inCheck: engine.inCheck(),
    isGameOver: engine.isGameOver(),
    lastMove: lastMove || null,
  };
}

// xiangqi.js has no winner() — the side to move when isGameOver() is true
// has no legal moves left, so the OTHER side wins. There is no draw case
// from the engine itself (see 'draw_agreed' below for the UI-negotiated one).
function gameOverResult(engine) {
  if (!engine.isGameOver()) return null;
  const winner = engine.turn() === 'w' ? 'black' : 'red';
  return { winner, reason: 'Checkmate' };
}

export function useLocalXiangqiMatch() {
  const engineRef = useRef(createGame());
  const [gameState, setGameState] = useState(() => snapshot(engineRef.current, null));
  const [lastGameOver, setLastGameOver] = useState(null);

  const dispatch = useCallback((action, payload) => {
    const engine = engineRef.current;

    if (action === 'make_move') {
      const { from, to } = payload;
      const result = engine.move(from, to);
      if (!result.ok) return;
      setGameState(snapshot(engine, { from, to }));
      const over = gameOverResult(engine);
      if (over) setLastGameOver(over);
      return;
    }

    if (action === 'resign') {
      const winner = engine.turn() === 'w' ? 'black' : 'red';
      setLastGameOver({ winner, reason: 'Resignation' });
      return;
    }

    // A single ply undo — only meaningful while the game is still in
    // progress; the caller (XiangqiGame) already gates the Undo control on
    // !lastGameOver, but guard here too since dispatch has no other caller.
    if (action === 'undo') {
      if (!engine.undo()) return;
      setGameState(snapshot(engine, null));
      return;
    }

    // Both players agreed to a draw via the pass-the-device confirmation —
    // there's no engine-level concept of this, it's purely a UI negotiation
    // that ends the match even.
    if (action === 'draw_agreed') {
      setLastGameOver({ winner: 'draw', reason: 'Agreed' });
      return;
    }

    // A player's clock ran out. The clock itself is UI-only state (the
    // engine has no notion of time), so the component tells us who lost.
    if (action === 'timeout') {
      setLastGameOver({ winner: payload.winner, reason: 'Timeout' });
      return;
    }

    if (action === 'play_again') {
      engineRef.current = createGame();
      setGameState(snapshot(engineRef.current, null));
      setLastGameOver(null);
    }
  }, []);

  return { gameState, lastGameOver, players: PLAYERS, dispatch };
}
