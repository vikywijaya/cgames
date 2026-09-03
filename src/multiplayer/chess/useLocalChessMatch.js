import { useCallback, useRef, useState } from 'react';
import { createGame } from './chessEngine';

const PLAYERS = [
  { name: 'Player 1', color: 'white' },
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

function checkmateOrStalemateResult(engine) {
  const winner = engine.winner(); // 'white' | 'black' | 'draw' | null
  if (winner === null) return null;
  if (winner === 'draw') return { winner: 'draw', reason: 'Stalemate' };
  return { winner, reason: 'Checkmate' };
}

export function useLocalChessMatch() {
  const engineRef = useRef(createGame());
  const [gameState, setGameState] = useState(() => snapshot(engineRef.current, null));
  const [lastGameOver, setLastGameOver] = useState(null);

  const dispatch = useCallback((action, payload) => {
    const engine = engineRef.current;

    if (action === 'make_move') {
      const { from, to, promotion } = payload;
      const result = engine.move(from, to, promotion);
      if (!result.ok) return;
      setGameState(snapshot(engine, { from, to }));
      const over = checkmateOrStalemateResult(engine);
      if (over) setLastGameOver(over);
      return;
    }

    if (action === 'resign') {
      const resigningColor = engine.turn() === 'w' ? 'White' : 'Black';
      const winner = engine.turn() === 'w' ? 'black' : 'white';
      setLastGameOver({ winner, reason: `${resigningColor} resigned` });
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
