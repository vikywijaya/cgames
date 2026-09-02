import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { cardFromId, isRedCard, SUIT_GLYPHS, SUIT_NAMES, SUITS } from '../cards';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import styles from './CrazyEightsGame.module.css';

const SEAT_COLORS = ['p1', 'p2', 'p3', 'p4'];
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

export function CrazyEightsGame({
  myName, myColor, gameState, lastGameOver, socket, memberId, callbackUrl, accessToken,
  status = 'connected', reconnectAttempt = 0, disconnectedPlayerName = null,
}) {
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [pendingEightCardId, setPendingEightCardId] = useState(null);
  const startedAtRef = useRef(null);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!gameState) return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    const mySeat = SEAT_COLORS.indexOf(myColor);
    const myTurn = gameState.currentSeat === mySeat && !gameState.isGameOver;
    if (myTurn && gameState.phase === 'play') setHasDrawn(false);
  }, [gameState, myColor]);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const mySeat = SEAT_COLORS.indexOf(myColor);
    const result = lastGameOver.winner === mySeat ? 'win'
      : (lastGameOver.winner !== null && lastGameOver.winner !== undefined) ? 'loss' : 'draw';
    const durationSeconds = startedAtRef.current !== null
      ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;

    saveScore('mp-crazy-eights', RESULT_PCT[result], durationSeconds, memberId, null);

    if (!callbackUrl) return;
    const payload = buildPayload({
      memberId, gameId: 'mp-crazy-eights',
      score: RESULT_PCT[result], maxScore: 100,
      completed: true, durationSeconds,
    });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[CrazyEightsGame] callback failed:', e));
  }, [lastGameOver, myColor, memberId, callbackUrl, accessToken]);

  if (!gameState) return null;

  const mySeat = SEAT_COLORS.indexOf(myColor);
  const gameActive = !gameState.isGameOver;
  const myTurn = gameState.currentSeat === mySeat && gameActive;
  const sortedHand = [...(gameState.myHand || [])].sort((a, b) => a - b);
  const discardTop = gameState.discardTop;
  const currentPlayer = gameState.players?.[gameState.currentSeat];
  const statusText = myTurn ? 'Your turn — play a card, draw, or pass' : `${currentPlayer?.name || 'Opponent'}'s turn`;

  const selectCard = (id) => {
    if (!myTurn || !gameActive) return;
    setSelectedCardId(id);
  };

  const handlePlay = () => {
    if (selectedCardId === null) return;
    const card = cardFromId(selectedCardId);
    if (card.rank === '8') {
      setPendingEightCardId(selectedCardId);
      return;
    }
    socket.emit('c8_play', { cardId: selectedCardId, chosenSuit: null });
    setSelectedCardId(null);
  };

  const chooseSuit = (suit) => {
    if (pendingEightCardId === null) return;
    socket.emit('c8_play', { cardId: pendingEightCardId, chosenSuit: suit });
    setPendingEightCardId(null);
    setSelectedCardId(null);
  };

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
        <button type="button" className={styles.deck} disabled={!myTurn || !gameActive || hasDrawn}
          onClick={() => { socket.emit('c8_draw'); setHasDrawn(true); }}>
          Draw ({gameState.drawPileCount})
        </button>
        {discardTop === null || discardTop === undefined ? (
          <div className={`${styles.card} ${styles.back}`}>—</div>
        ) : (
          <CardTile card={cardFromId(discardTop)} disabled />
        )}
        {gameState.currentSuit && (
          <span className={styles.suitBadge}>
            Current suit: {SUIT_GLYPHS[gameState.currentSuit]} {SUIT_NAMES[gameState.currentSuit]}
          </span>
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

      <div className={styles.actions}>
        <button type="button" className={styles.actionBtn} disabled={!myTurn || !gameActive || selectedCardId === null}
          onClick={handlePlay}>
          Play
        </button>
        <button type="button" className={styles.actionBtn} disabled={!myTurn || !gameActive || hasDrawn}
          onClick={() => { socket.emit('c8_draw'); setHasDrawn(true); }}>
          Draw
        </button>
        <button type="button" className={styles.actionBtn} disabled={!myTurn || !gameActive || !hasDrawn}
          onClick={() => { socket.emit('c8_pass'); setHasDrawn(false); setSelectedCardId(null); }}>
          Pass
        </button>
      </div>

      {pendingEightCardId !== null && (
        <div className={styles.suitChooser}>
          <p>Choose a suit for your 8:</p>
          <div className={styles.suitButtons}>
            {SUITS.map(suit => (
              <button key={suit} type="button" className={styles.actionBtn} onClick={() => chooseSuit(suit)}>
                {SUIT_NAMES[suit]}
              </button>
            ))}
          </div>
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

CrazyEightsGame.propTypes = {
  myName: PropTypes.string.isRequired,
  myColor: PropTypes.oneOf(['p1', 'p2', 'p3', 'p4']).isRequired,
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
