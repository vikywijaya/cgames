import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { cardFromId, isRedCard, SUIT_GLYPHS } from '../cards';
import { useLocalGinRummyMatch } from './useLocalGinRummyMatch';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './GinRummyGame.module.css';

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

function CardBack() {
  return <div className={`${styles.card} ${styles.back}`}>—</div>;
}

function GinRummyPane({ seat, name, activeName, gameState, dispatch, selectedCardId, setSelectedCardId, t, rotated }) {
  const isActive = gameState.currentSeat === seat && !gameState.isGameOver;
  const inKnockResponse = gameState.phase === 'knock_response';
  const isKnocker = gameState.knocker === seat;
  const hand = [...gameState.hands[seat]].sort((a, b) => a - b);
  const handCount = hand.length;

  const selectCard = (id) => {
    if (!isActive) return;
    setSelectedCardId(prev => (prev === id ? null : id));
  };

  return (
    <div className={`${styles.pane} ${rotated ? styles.paneRotated : ''}`}>
      <div className={styles.panel}>{name} ({seat === 0 ? 'p1' : 'p2'})</div>
      <div className={styles.hand}>
        {isActive
          ? hand.map(id => (
              <CardTile
                key={id}
                card={cardFromId(id)}
                selected={selectedCardId === id}
                disabled={!isActive}
                onClick={() => selectCard(id)}
              />
            ))
          : Array.from({ length: handCount }, (_, i) => <CardBack key={i} />)}
      </div>
      {!isActive && (
        <div className={styles.hidden}>{t.tapToRevealHand.replace('{name}', activeName)}</div>
      )}
      {isActive && inKnockResponse && !isKnocker && (
        <div className={styles.actions}>
          <p className={styles.deadwoodHint}>{t.deadwoodHint.replace('{n}', gameState.knockerDeadwoodPoints)}</p>
          <button type="button" className={styles.actionBtn} disabled={selectedCardId === null}
            onClick={() => { dispatch('layoff', { cardId: selectedCardId, meldIndex: 0 }); setSelectedCardId(null); }}>
            {t.layOff}
          </button>
          <button type="button" className={styles.actionBtn}
            onClick={() => dispatch('finish_layoff', {})}>
            {t.done}
          </button>
        </div>
      )}
      {isActive && gameState.phase === 'discard' && (
        <div className={styles.actions}>
          <button type="button" className={styles.actionBtn}
            disabled={selectedCardId === null}
            onClick={() => { dispatch('discard', { cardId: selectedCardId }); setSelectedCardId(null); }}>
            {t.discard}
          </button>
          <button type="button" className={styles.actionBtn}
            onClick={() => { dispatch('knock', {}); setSelectedCardId(null); }}>
            {t.knock}
          </button>
        </div>
      )}
      {isActive && (
        <button type="button" className={styles.resignBtn} onClick={() => dispatch('resign', { seat })}>
          {t.resign}
        </button>
      )}
    </div>
  );
}
GinRummyPane.propTypes = {
  seat: PropTypes.oneOf([0, 1]).isRequired,
  name: PropTypes.string.isRequired,
  activeName: PropTypes.string.isRequired,
  gameState: PropTypes.object.isRequired,
  dispatch: PropTypes.func.isRequired,
  selectedCardId: PropTypes.number,
  setSelectedCardId: PropTypes.func.isRequired,
  t: PropTypes.object.isRequired,
  rotated: PropTypes.bool,
};

export function GinRummyGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalGinRummyMatch();
  const [selectedCardId, setSelectedCardId] = useState(null);
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const result = lastGameOver.winner === 0 ? 'win'
      : (lastGameOver.winner === null || lastGameOver.winner === undefined) ? 'draw' : 'loss';
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    saveScore('mp-gin-rummy', RESULT_PCT[result], durationSeconds, memberId, null);

    const payload = buildPayload({
      memberId, gameId: 'mp-gin-rummy',
      score: RESULT_PCT[result], maxScore: 100,
      completed: true, durationSeconds,
    });
    window.parent.postMessage({ type: 'GAME_COMPLETE', payload }, '*');

    if (!callbackUrl) return;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[GinRummyGame] callback failed:', e));
  }, [lastGameOver, memberId, callbackUrl, accessToken]);

  const p1 = players[0];
  const p2 = players[1];
  const currentName = gameState.currentSeat === 0 ? p1.name : p2.name;

  let statusText;
  if (gameState.phase === 'draw') statusText = t.namedTurnDraw.replace('{name}', currentName);
  else if (gameState.phase === 'discard') statusText = t.namedDiscardOrKnock.replace('{name}', currentName);
  else if (gameState.phase === 'knock_response') {
    const layingOffName = gameState.currentSeat === 0 ? p1.name : p2.name;
    statusText = t.namedLayOffOrDone.replace('{name}', layingOffName);
  }

  const handleConfirmReset = () => {
    startedAtRef.current = Date.now();
    reportedRef.current = false;
    setSelectedCardId(null);
    dispatch('play_again', {});
    setConfirmingReset(false);
  };

  return (
    <div className={styles.game}>
      <GinRummyPane seat={1} name={p2.name} activeName={currentName} gameState={gameState} dispatch={dispatch}
        selectedCardId={selectedCardId} setSelectedCardId={setSelectedCardId} t={t} rotated />

      <div className={styles.center}>
        <div className={styles.status}>{statusText}</div>
        <button type="button" className={styles.deck} disabled={gameState.isGameOver || gameState.phase !== 'draw'}
          onClick={() => dispatch('draw', { source: 'draw' })}>
          {t.drawPile.replace('{n}', gameState.drawPileCount)}
        </button>
        {gameState.discardTop === null || gameState.discardTop === undefined ? (
          <div className={`${styles.card} ${styles.back}`}>—</div>
        ) : (
          <CardTile
            card={cardFromId(gameState.discardTop)}
            disabled={gameState.isGameOver || gameState.phase !== 'draw'}
            onClick={() => dispatch('draw', { source: 'discard' })}
          />
        )}

        {lastGameOver && (
          <div className={styles.gameOver}>
            <h3>
              {lastGameOver.winner === null || lastGameOver.winner === undefined
                ? t.draw
                : `${lastGameOver.winner === 0 ? p1.name : p2.name} ${t.youWinSimple}`}
            </h3>
            <p>{lastGameOver.reason}</p>
            <button className={styles.primaryBtn} onClick={() => dispatch('play_again', {})}>{t.playAgain}</button>
          </div>
        )}
        {!lastGameOver && confirmingReset && (
          <div className={styles.gameOver}>
            <h3>{t.resetConfirmTitle}</h3>
            <p>{t.resetConfirmBody}</p>
            <div className={styles.confirmActions}>
              <button className={styles.primaryBtn} onClick={handleConfirmReset}>{t.resetConfirmYes}</button>
              <button className={styles.resignBtn} onClick={() => setConfirmingReset(false)}>{t.resetConfirmCancel}</button>
            </div>
          </div>
        )}
        {!lastGameOver && !confirmingReset && (
          <button type="button" className={styles.resignBtn} onClick={() => setConfirmingReset(true)}>{t.resetGame}</button>
        )}
      </div>

      <GinRummyPane seat={0} name={p1.name} activeName={currentName} gameState={gameState} dispatch={dispatch}
        selectedCardId={selectedCardId} setSelectedCardId={setSelectedCardId} t={t} />
    </div>
  );
}

GinRummyGame.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
