import { useCallback, useRef, useState } from 'react';
import { createGame, findBestMelds } from './ginRummyEngine';

const PLAYERS = [
  { name: 'Player 1', color: 'p1' },
  { name: 'Player 2', color: 'p2' },
];

function gameOverFromState(gs) {
  if (!gs.isGameOver) return null;
  if (gs.winner === null || gs.winner === undefined) {
    return { winner: null, reason: 'Draw pile exhausted — tie!' };
  }
  if (gs.knockerIsGin) return { winner: gs.winner, reason: 'Gin!' };
  // Undercut vs. plain knock: the winner is the knocker unless the score
  // went to the non-knocker (undercut).
  if (gs.knocker !== null && gs.winner !== gs.knocker) {
    return { winner: gs.winner, reason: 'Undercut!' };
  }
  return { winner: gs.winner, reason: 'Knock!' };
}

export function useLocalGinRummyMatch() {
  const engineRef = useRef(createGame());
  const [gameState, setGameState] = useState(() => engineRef.current.state());
  const [lastGameOver, setLastGameOver] = useState(null);

  const sync = useCallback(() => {
    const gs = engineRef.current.state();
    setGameState(gs);
    const over = gameOverFromState(gs);
    if (over) setLastGameOver(over);
  }, []);

  const dispatch = useCallback((action, payload = {}) => {
    const engine = engineRef.current;
    const seat = engine.turn();

    if (action === 'draw') {
      const result = engine.draw(seat, payload.source);
      if (result.exhausted) {
        setGameState(engine.state());
        setLastGameOver({ winner: null, reason: 'Draw pile exhausted — tie!' });
        return;
      }
      if (result.ok) sync();
      return;
    }

    if (action === 'discard') {
      const result = engine.discard(seat, payload.cardId);
      if (result.exhausted) {
        setGameState(engine.state());
        setLastGameOver({ winner: null, reason: 'Draw pile exhausted — tie!' });
        return;
      }
      if (result.ok) sync();
      return;
    }

    if (action === 'knock') {
      const hand = engine.state().hands[seat];
      let bestKnock = null;
      for (const discardId of hand) {
        const remaining = hand.filter(id => id !== discardId);
        const best = findBestMelds(remaining);
        if (best.deadwoodPoints <= 10) {
          if (!bestKnock || best.deadwoodPoints < bestKnock.deadwoodPoints) {
            bestKnock = { melds: best.melds, discardId, deadwoodPoints: best.deadwoodPoints };
          }
        }
      }
      if (!bestKnock) return; // cannot legally knock yet — no-op, matches server behavior
      const result = engine.knock(seat, bestKnock.melds, bestKnock.discardId);
      if (result.ok) sync();
      return;
    }

    if (action === 'layoff') {
      const result = engine.layoff(seat, payload.cardId, payload.meldIndex);
      if (result.ok) sync();
      return;
    }

    if (action === 'finish_layoff') {
      const result = engine.finishLayoff(seat);
      if (result.ok) sync();
      return;
    }

    if (action === 'resign') {
      // Unlike the other actions, resign is not necessarily performed by
      // `engine.turn()` — a pane may resign on behalf of its own seat even
      // when it is not currently on turn (e.g. its hand is rendered face-down).
      // The payload must carry an explicit seat.
      const resigningSeat = payload.seat;
      const winner = 1 - resigningSeat;
      setLastGameOver({ winner, reason: 'Resigned' });
      setGameState(prev => ({ ...prev, isGameOver: true, winner }));
      return;
    }

    if (action === 'play_again') {
      engineRef.current = createGame();
      setLastGameOver(null);
      setGameState(engineRef.current.state());
      return;
    }
  }, [sync]);

  return { gameState, lastGameOver, players: PLAYERS, dispatch };
}
