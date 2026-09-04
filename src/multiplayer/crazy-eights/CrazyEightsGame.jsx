import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { cardFromId, isRedCard, SUIT_GLYPHS, SUIT_NAMES, SUITS } from '../cards';
import { useLocalCrazyEightsMatch } from './useLocalCrazyEightsMatch';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './CrazyEightsGame.module.css';

const RESULT_PCT = { win: 100, loss: 0 };

// Same idea as Chess's computeMaxBoardSize: grow the UI to fill the
// available viewport height instead of sitting small in a mostly-empty
// page. There's no single "board" here, so scale card size/typography by a
// factor derived from how much vertical room the whole layout (two panes'
// wrapped hands, plus the shared center strip, all of which scale together
// via the same --card-scale variable) actually needs to fill the screen.
// These per-element "chrome" heights (everything in a pane besides the
// hand grid itself) are measured from a real render at scale=1 — one
// active pane (panel + action buttons + resign) and one inactive pane
// (panel + hidden message), plus the shared center strip — rather than
// guessed, since estimating a11y-rendered flex layouts by hand undershoots.
const PAGE_CHROME_ABOVE_GAME = 60; // the host page's back/home button + spacing, above the game container
const ACTIVE_PANE_CHROME = 90; // active pane's non-hand-grid height, unscaled (measured + margin)
const INACTIVE_PANE_CHROME = 90; // inactive pane's non-hand-grid height, unscaled (measured + margin)
const CENTER_HEIGHT = 180; // status/deck/discard/suit badge/reset strip, unscaled (measured + margin)
const BASE_CARD_WIDTH = 32;
const BASE_CARD_HEIGHT = 44;
const BASE_GAP = 3;
const MAX_HAND_SIZE = 5; // Crazy Eights hands are dealt at exactly 5 and rarely grow much before a play

function computeCardScale() {
  const availableHeight = Math.max(120, window.innerHeight - PAGE_CHROME_ABOVE_GAME - 15);
  const availableWidth = Math.max(200, window.innerWidth - 16);

  // Search scale candidates and keep the largest one whose full stacked
  // layout (2 hands + center strip, all scaling together) still fits the
  // viewport — accounts for cards wrapping to more rows as they grow,
  // which a flat multiplier can't.
  let best = 1;
  for (let scale = 1; scale <= 3; scale += 0.01) {
    const cardW = BASE_CARD_WIDTH * scale;
    const cardH = BASE_CARD_HEIGHT * scale;
    const gap = BASE_GAP * scale;
    const perRow = Math.max(1, Math.floor((availableWidth + gap) / (cardW + gap)));
    const rows = Math.ceil(MAX_HAND_SIZE / perRow);
    const handHeight = rows * cardH + (rows - 1) * gap;
    const activePaneHeight = handHeight + ACTIVE_PANE_CHROME * scale;
    const inactivePaneHeight = handHeight + INACTIVE_PANE_CHROME * scale;
    const totalHeight = activePaneHeight + inactivePaneHeight + CENTER_HEIGHT * scale;
    if (totalHeight <= availableHeight) best = scale;
    else break;
  }
  return Math.max(1, Math.min(2, best));
}

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
  selectedCardId, setSelectedCardId, pendingEightCardId, setPendingEightCardId, rotated,
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
  rotated: PropTypes.bool,
};

export function CrazyEightsGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalCrazyEightsMatch();
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [pendingEightCardId, setPendingEightCardId] = useState(null);
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [cardScale, setCardScale] = useState(computeCardScale);

  useEffect(() => {
    const onResize = () => setCardScale(computeCardScale());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

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
    <div className={styles.game} style={{ '--card-scale': cardScale }}>
      <CrazyEightsPane seat={1} name={p2.name} activeName={currentName} {...paneProps} rotated />

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
