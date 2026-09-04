import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { cardFromId, isRedCard, SUIT_GLYPHS, SUIT_NAMES, SUITS } from '../cards';
import { useLocalCrazyEightsMatch } from './useLocalCrazyEightsMatch';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './CrazyEightsGame.module.css';

const RESULT_PCT = { win: 100, loss: 0 };

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

function CrazyEightsPane({
  seat, name, activeName, gameState, dispatch, t,
  selectedCardId, setSelectedCardId, pendingEightCardId, setPendingEightCardId,
}) {
  const isActive = gameState.currentSeat === seat && !gameState.isGameOver;
  const hand = [...gameState.hands[seat]].sort((a, b) => a - b);
  const handCount = hand.length;
  const isPending8 = pendingEightCardId !== null;

  const selectCard = (id) => {
    if (!isActive) return;
    setSelectedCardId(prev => (prev === id ? null : id));
  };

  const handlePlay = () => {
    if (selectedCardId === null) return;
    const card = cardFromId(selectedCardId);
    if (card.rank === '8') {
      setPendingEightCardId(selectedCardId);
      return;
    }
    dispatch('play', { cardId: selectedCardId, chosenSuit: null });
    setSelectedCardId(null);
  };

  const chooseSuit = (suit) => {
    if (pendingEightCardId === null) return;
    dispatch('play', { cardId: pendingEightCardId, chosenSuit: suit });
    setPendingEightCardId(null);
    setSelectedCardId(null);
  };

  return (
    <div className={styles.pane}>
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
      {isActive && isPending8 && (
        <div className={styles.suitChooser}>
          <p>{t.chooseSuitForEight}</p>
          <div className={styles.suitButtons}>
            {SUITS.map(suit => (
              <button key={suit} type="button" className={styles.actionBtn} onClick={() => chooseSuit(suit)}>
                {SUIT_NAMES[suit]}
              </button>
            ))}
          </div>
        </div>
      )}
      {isActive && !isPending8 && (
        <div className={styles.actions}>
          <button type="button" className={styles.actionBtn} disabled={selectedCardId === null}
            onClick={handlePlay}>
            {t.play}
          </button>
          <button type="button" className={styles.actionBtn} disabled={gameState.hasDrawn}
            onClick={() => dispatch('draw', {})}>
            {t.drawAction}
          </button>
          <button type="button" className={styles.actionBtn} disabled={!gameState.hasDrawn}
            onClick={() => { dispatch('pass', {}); setSelectedCardId(null); }}>
            {t.pass}
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
CrazyEightsPane.propTypes = {
  seat: PropTypes.oneOf([0, 1]).isRequired,
  name: PropTypes.string.isRequired,
  activeName: PropTypes.string.isRequired,
  gameState: PropTypes.object.isRequired,
  dispatch: PropTypes.func.isRequired,
  t: PropTypes.object.isRequired,
  selectedCardId: PropTypes.number,
  setSelectedCardId: PropTypes.func.isRequired,
  pendingEightCardId: PropTypes.number,
  setPendingEightCardId: PropTypes.func.isRequired,
};

export function CrazyEightsGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalCrazyEightsMatch();
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [pendingEightCardId, setPendingEightCardId] = useState(null);
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const result = lastGameOver.winner === 0 ? 'win' : 'loss';
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    saveScore('mp-crazy-eights', RESULT_PCT[result], durationSeconds, memberId, null);

    const payload = buildPayload({
      memberId, gameId: 'mp-crazy-eights',
      score: RESULT_PCT[result], maxScore: 100,
      completed: true, durationSeconds,
    });
    window.parent.postMessage({ type: 'GAME_COMPLETE', payload }, '*');

    if (!callbackUrl) return;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[CrazyEightsGame] callback failed:', e));
  }, [lastGameOver, memberId, callbackUrl, accessToken]);

  const p1 = players[0];
  const p2 = players[1];
  const currentName = gameState.currentSeat === 0 ? p1.name : p2.name;
  const statusText = t.namedTurnPlayDrawPass.replace('{name}', currentName);

  const handleConfirmReset = () => {
    startedAtRef.current = Date.now();
    reportedRef.current = false;
    setSelectedCardId(null);
    setPendingEightCardId(null);
    dispatch('play_again', {});
    setConfirmingReset(false);
  };

  const paneProps = {
    gameState, dispatch, t,
    selectedCardId, setSelectedCardId,
    pendingEightCardId, setPendingEightCardId,
  };

  return (
    <div className={styles.game}>
      <CrazyEightsPane seat={1} name={p2.name} activeName={currentName} {...paneProps} />

      <div className={styles.center}>
        <div className={styles.status}>{statusText}</div>
        <button type="button" className={styles.deck} disabled={gameState.isGameOver || gameState.hasDrawn}
          onClick={() => dispatch('draw', {})}>
          {t.drawPile.replace('{n}', gameState.drawPileCount)}
        </button>
        {gameState.discardTop === null || gameState.discardTop === undefined ? (
          <div className={`${styles.card} ${styles.back}`}>—</div>
        ) : (
          <CardTile card={cardFromId(gameState.discardTop)} disabled />
        )}
        {gameState.currentSuit && (
          <span className={styles.suitBadge}>
            {t.currentSuit}{SUIT_GLYPHS[gameState.currentSuit]} {SUIT_NAMES[gameState.currentSuit]}
          </span>
        )}

        {lastGameOver && (
          <div className={styles.gameOver}>
            <h3>{(lastGameOver.winner === 0 ? p1.name : p2.name)} {t.youWinSimple}</h3>
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

      <CrazyEightsPane seat={0} name={p1.name} activeName={currentName} {...paneProps} />
    </div>
  );
}

CrazyEightsGame.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
