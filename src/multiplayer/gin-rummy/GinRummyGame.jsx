import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { cardFromId, isRedCard, SUIT_GLYPHS } from '../cards';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import styles from './GinRummyGame.module.css';

const SEAT_COLORS = ['p1', 'p2'];
const RESULT_PCT = { win: 100, draw: 50, loss: 0 };

function CardTile({ card, selected, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`${styles.card} ${isRedCard(card.suit) ? styles.red : styles.black} ${selected ? styles.selected : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={styles.rank}>{card.rank}</span>
      <span className={styles.suit}>{SUIT_GLYPHS[card.suit]}</span>
    </button>
  );
}
CardTile.propTypes = {
  card: PropTypes.shape({ rank: PropTypes.string.isRequired, suit: PropTypes.string.isRequired }).isRequired,
  selected: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func,
};

export function GinRummyGame({
  myName, myColor, gameState, lastGameOver, socket, memberId, callbackUrl, accessToken,
  status = 'connected', reconnectAttempt = 0, disconnectedPlayerName = null,
}) {
  const [selectedCardId, setSelectedCardId] = useState(null);
  const startedAtRef = useRef(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (gameState && startedAtRef.current === null) startedAtRef.current = Date.now();
  }, [gameState]);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const mySeat = SEAT_COLORS.indexOf(myColor);
    const result = lastGameOver.winner === mySeat ? 'win'
      : (lastGameOver.winner !== null && lastGameOver.winner !== undefined) ? 'loss' : 'draw';
    const durationSeconds = startedAtRef.current !== null
      ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;

    saveScore('mp-gin-rummy', RESULT_PCT[result], durationSeconds, memberId, null);

    if (!callbackUrl) return;
    const payload = buildPayload({
      memberId, gameId: 'mp-gin-rummy',
      score: RESULT_PCT[result], maxScore: 100,
      completed: true, durationSeconds,
    });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[GinRummyGame] callback failed:', e));
  }, [lastGameOver, myColor, memberId, callbackUrl, accessToken]);

  if (!gameState) return null;

  const mySeat = SEAT_COLORS.indexOf(myColor);
  const gameActive = !gameState.isGameOver;
  const myTurn = gameState.currentSeat === mySeat && gameActive;
  const phase = gameState.phase;
  const sortedHand = [...(gameState.myHand || [])].sort((a, b) => a - b);
  const discardTop = gameState.discardTop;

  const currentPlayer = gameState.players?.[gameState.currentSeat];
  let statusText;
  if (phase === 'draw') statusText = myTurn ? 'Your turn — draw a card' : `${currentPlayer?.name || 'Opponent'} is drawing…`;
  else if (phase === 'discard') statusText = myTurn ? 'Discard a card or knock' : `${currentPlayer?.name || 'Opponent'} is choosing…`;
  else if (phase === 'knock_response') statusText = myTurn ? 'Lay off cards on melds or click Done' : 'Opponent is laying off cards…';

  const selectCard = (id) => {
    if (!myTurn || !gameActive) return;
    setSelectedCardId(prev => (prev === id ? null : id));
  };

  const inKnockResponse = phase === 'knock_response' && myTurn;

  return (
    <div className={styles.game}>
      <div className={styles.panel}>{myName} ({myColor})</div>

      {status === 'disconnected' && (
        <div className={styles.banner}>Reconnecting… (attempt {reconnectAttempt})</div>
      )}
      {disconnectedPlayerName && (
        <div className={styles.banner}>{disconnectedPlayerName} disconnected. Waiting…</div>
      )}

      <div className={styles.status}>{statusText}</div>

      <div className={styles.players}>
        {(gameState.players || []).map((p, i) => (
          <div key={i} className={`${styles.playerRow} ${gameState.currentSeat === i ? styles.active : ''}`}>
            {p.name}{SEAT_COLORS[i] === myColor ? ' (you)' : ''} — {gameState.handCounts?.[i] ?? '?'} cards
          </div>
        ))}
      </div>

      <div className={styles.table}>
        <button type="button" className={styles.deck} disabled={!myTurn || !gameActive || phase !== 'draw'}
          onClick={() => socket.emit('gin_draw', { source: 'draw' })}>
          Draw ({gameState.drawPileCount})
        </button>
        {discardTop === null || discardTop === undefined ? (
          <div className={`${styles.card} ${styles.back}`}>—</div>
        ) : (
          <CardTile
            card={cardFromId(discardTop)}
            disabled={!myTurn || !gameActive || phase !== 'draw'}
            onClick={() => socket.emit('gin_draw', { source: 'discard' })}
          />
        )}
      </div>

      <div className={styles.hand}>
        {sortedHand.map(id => (
          <CardTile
            key={id}
            card={cardFromId(id)}
            selected={selectedCardId === id}
            disabled={!myTurn || !gameActive}
            onClick={() => selectCard(id)}
          />
        ))}
      </div>

      {inKnockResponse ? (
        <div className={styles.actions}>
          <p>Deadwood: {gameState.knockerDeadwood}. Lay off cards on their melds.</p>
          <button type="button" className={styles.actionBtn} disabled={selectedCardId === null}
            onClick={() => { socket.emit('gin_layoff', { cardId: selectedCardId, meldIndex: 0 }); setSelectedCardId(null); }}>
            Lay Off
          </button>
          <button type="button" className={styles.actionBtn}
            onClick={() => socket.emit('gin_finish_layoff')}>
            Done
          </button>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.actionBtn}
            disabled={!myTurn || !gameActive || phase !== 'discard' || selectedCardId === null}
            onClick={() => { socket.emit('gin_discard', { cardId: selectedCardId }); setSelectedCardId(null); }}>
            Discard
          </button>
          <button type="button" className={styles.actionBtn}
            disabled={!myTurn || !gameActive || phase !== 'discard'}
            onClick={() => { socket.emit('gin_knock', { meldGroups: [] }); setSelectedCardId(null); }}>
            Knock
          </button>
        </div>
      )}

      {lastGameOver && (
        <div className={styles.gameOver}>
          <h3>
            {lastGameOver.winner === mySeat ? 'You Win! 🎉'
              : (lastGameOver.winner !== null && lastGameOver.winner !== undefined) ? 'Game Over' : 'Draw!'}
          </h3>
          <p>{lastGameOver.reason}</p>
          <button className={styles.actionBtn} onClick={() => socket.emit('play_again')}>Play Again</button>
        </div>
      )}
    </div>
  );
}

GinRummyGame.propTypes = {
  myName: PropTypes.string.isRequired,
  myColor: PropTypes.oneOf(['p1', 'p2']).isRequired,
  gameState: PropTypes.object,
  lastGameOver: PropTypes.object,
  socket: PropTypes.shape({ emit: PropTypes.func.isRequired }).isRequired,
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
  status: PropTypes.string,
  reconnectAttempt: PropTypes.number,
  disconnectedPlayerName: PropTypes.string,
};
