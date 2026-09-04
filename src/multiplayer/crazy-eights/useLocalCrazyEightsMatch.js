import { useCallback, useRef, useState } from 'react';
import { createGame } from './crazyEightsEngine';

const PLAYERS = [
  { name: 'Player 1', color: 'p1' },
  { name: 'Player 2', color: 'p2' },
];

function gameOverFromState(gs) {
  if (!gs.isGameOver) return null;
  const winnerHandCount = gs.handCounts[gs.winner];
  const reason = winnerHandCount === 0 ? 'Played all cards!' : 'Fewest cards wins!';
  return { winner: gs.winner, reason };
}

export function useLocalCrazyEightsMatch() {
  const engineRef = useRef(createGame(2));
  const [gameState, setGameState] = useState(() => ({ ...engineRef.current.state(), hasDrawn: false }));
  const [lastGameOver, setLastGameOver] = useState(null);
  const hasDrawnRef = useRef(false);

  const sync = useCallback(() => {
    const gs = engineRef.current.state();
    setGameState({ ...gs, hasDrawn: hasDrawnRef.current });
    const over = gameOverFromState(gs);
    if (over) setLastGameOver(over);
  }, []);

  const dispatch = useCallback((action, payload = {}) => {
    const engine = engineRef.current;
    const seat = engine.turn();
    const seatBefore = seat;

    if (action === 'play') {
      engine.play(seat, payload.cardId, payload.chosenSuit ?? null);
      // A successful non-emptying play advances the turn, which starts the
      // next seat's hasDrawn fresh; an illegal play leaves the turn (and
      // hasDrawn) unchanged. Either way, re-deriving from whether the seat
      // actually changed keeps this correct without inspecting `ok`.
      if (engine.turn() !== seatBefore || engine.isGameOver()) hasDrawnRef.current = false;
      // Always re-sync regardless of ok — the fix for the stalemate-
      // reporting gap: engine.draw() (below) can flip phase to 'over' via a
      // stalemate resolution INSIDE its own ok:false branch (empty draw and
      // discard piles, nobody can play) — the networked version's socket
      // handler missed this exact case by bailing out on `!result.ok`
      // before ever checking engine.isGameOver(). Always re-reading
      // state() here, for every action, avoids reproducing that bug.
      sync();
      return;
    }

    if (action === 'draw') {
      const result = engine.draw(seat);
      if (result.ok) hasDrawnRef.current = true;
      sync();
      return;
    }

    if (action === 'pass') {
      engine.pass(seat);
      hasDrawnRef.current = false;
      sync();
      return;
    }

    if (action === 'resign') {
      // Unlike the other actions, resign is not necessarily performed by
      // engine.turn() — a pane may resign on behalf of its own seat even
      // when it is not currently on turn.
      const resigningSeat = payload.seat;
      const winner = 1 - resigningSeat;
      hasDrawnRef.current = false;
      setLastGameOver({ winner, reason: 'Resigned' });
      setGameState(prev => ({ ...prev, isGameOver: true, winner }));
      return;
    }

    if (action === 'play_again') {
      engineRef.current = createGame(2);
      hasDrawnRef.current = false;
      setLastGameOver(null);
      setGameState({ ...engineRef.current.state(), hasDrawn: false });
      return;
    }
  }, [sync]);

  return { gameState, lastGameOver, players: PLAYERS, dispatch };
}
