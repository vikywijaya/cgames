import { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { CongkakBoard } from './CongkakBoard';
import { useLocalCongkakMatch } from './useLocalCongkakMatch';
import { applyStep, ownsHouse } from './congkakEngine';
import { useSoundFx } from '../../hooks/useSoundFx';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './CongkakGame.module.css';

// Pacing for the step walk. A sow is a quick tick; a relay or capture gets a
// longer beat so the player registers what just happened. Past FAST_AFTER
// steps the interval halves, so a long relay chain cannot stall the game.
const SOW_MS = 120;
const BEAT_MS = 350;
const FAST_AFTER = 60;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The card above/below the board for one seat. P2's is rotated 180° by the
 * parent so it reads right side up for the player sitting opposite, the same
 * convention ChessGame and XiangqiGame use for pass-and-play.
 */
function PlayerCard({ seat, seeds, active, canUndo, disabled, onUndo, onResign, onReset, t }) {
  return (
    <div className={`${styles.card} ${active ? styles.cardActive : ''}`}>
      <div className={styles.cardHeader}>
        <span className={`${styles.avatar} ${seat === 1 ? styles.avatarP2 : ''}`}>
          {seat === 0 ? 'P1' : 'P2'}
        </span>
        {active && <span className={styles.badgeActive}>{t.yourTurnBadge}</span>}
        <span className={styles.seedTally}>{seeds}</span>
      </div>
      <div className={styles.actionsRow}>
        <button type="button" className={styles.pillBtn}
                disabled={disabled || !canUndo}
                aria-label={t.undo} onClick={onUndo}>
          <span aria-hidden="true">↩</span><span>{t.undoShort}</span>
        </button>
        <button type="button" className={`${styles.pillBtn} ${styles.pillBtnDanger}`}
                disabled={disabled}
                aria-label={t.resign} onClick={onResign}>
          <span aria-hidden="true">⚑</span><span>{t.resign}</span>
        </button>
        <button type="button" className={styles.pillBtn}
                aria-label={t.resetGame} onClick={onReset}>
          <span aria-hidden="true">↻</span><span>{t.resetGame}</span>
        </button>
      </div>
    </div>
  );
}
PlayerCard.propTypes = {
  seat: PropTypes.number.isRequired,
  seeds: PropTypes.number.isRequired,
  active: PropTypes.bool.isRequired,
  canUndo: PropTypes.bool.isRequired,
  disabled: PropTypes.bool.isRequired,
  onUndo: PropTypes.func.isRequired,
  onResign: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  t: PropTypes.object.isRequired,
};

export function CongkakGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastMove, lastGameOver, dispatch } = useLocalCongkakMatch();
  const { playTick, playSuccess, playComplete } = useSoundFx();

  // The board the player SEES. During an animation it lags gameState.board,
  // replaying lastMove.steps one at a time; otherwise it is gameState.board.
  const [displayBoard, setDisplayBoard] = useState(gameState.board);
  const [highlightHole, setHighlightHole] = useState(null);
  const [animating, setAnimating] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const timerRef = useRef(null);

  // Keep the visible board in step with the engine whenever no animation is
  // running (undo, reset, resign).
  useEffect(() => {
    if (!animating) setDisplayBoard(gameState.board);
  }, [gameState.board, animating]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Walk the step list. Every frame re-derives the board by applying one more
  // step, so an interrupted walk still lands on the engine's own final board.
  useEffect(() => {
    if (!lastMove) return;

    const { steps, boardBefore } = lastMove;
    const working = [...boardBefore];

    if (prefersReducedMotion()) {
      steps.forEach(step => applyStep(working, step));
      setDisplayBoard(working);
      setHighlightHole(null);
      setAnnouncement(describe(steps, t));
      return;
    }

    setAnimating(true);
    let i = 0;

    function tick() {
      if (i >= steps.length) {
        setAnimating(false);
        setHighlightHole(null);
        setAnnouncement(describe(steps, t));
        return;
      }
      const step = steps[i];
      applyStep(working, step);
      setDisplayBoard([...working]);
      setHighlightHole(step.hole ?? null);

      if (step.type === 'sow') playTick();
      if (step.type === 'capture') playSuccess();

      const base = step.type === 'sow' ? SOW_MS : BEAT_MS;
      const delay = i > FAST_AFTER ? base / 2 : base;
      i += 1;
      timerRef.current = setTimeout(tick, delay);
    }

    tick();
    return () => clearTimeout(timerRef.current);
    // playTick/playSuccess are stable; t only changes with language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMove]);

  useEffect(() => {
    if (lastGameOver) playComplete();
  }, [lastGameOver, playComplete]);

  const onHoleTap = useCallback(hole => {
    if (animating) return;
    dispatch('move', { seat: gameState.turn, hole });
    setCanUndo(true);
  }, [animating, dispatch, gameState.turn]);

  const legalHoles = animating || gameState.isGameOver
    ? []
    : [0,1,2,3,4,5,6,8,9,10,11,12,13,14]
        .filter(i => ownsHouse(gameState.turn, i) && gameState.board[i] > 0);

  const labels = {
    houseLabel: (hole, seeds) => {
      const mine = ownsHouse(gameState.turn, hole);
      const n = hole <= 6 ? hole + 1 : hole - 7;
      return (mine ? t.holeYours : t.holeOpponent)
        .replace('{n}', String(n))
        .replace('{seeds}', String(seeds));
    },
    storeLabel: (seat, seeds) => t.storeLabel
      .replace('{p}', seat === 0 ? 'P1' : 'P2')
      .replace('{seeds}', String(seeds)),
  };

  function handleUndo() {
    if (animating) return;
    dispatch('undo');
    setCanUndo(false);
    setAnnouncement('');
  }

  function handleReset() {
    clearTimeout(timerRef.current);
    setAnimating(false);
    setHighlightHole(null);
    setAnnouncement('');
    setCanUndo(false);
    dispatch('reset');
  }

  return (
    <div className={styles.game}>
      <div className={styles.cardSlotRotated}>
        <PlayerCard
          seat={1} seeds={displayBoard[15]} active={gameState.turn === 1 && !gameState.isGameOver}
          canUndo={canUndo} disabled={animating}
          onUndo={handleUndo} onResign={() => dispatch('resign', { seat: 1 })}
          onReset={handleReset} t={t}
        />
      </div>

      <CongkakBoard
        board={displayBoard}
        legalHoles={legalHoles}
        onHoleTap={onHoleTap}
        highlightHole={highlightHole}
        labels={labels}
      />

      <p className={styles.liveRegion} role="status" aria-live="polite">{announcement}</p>

      <PlayerCard
        seat={0} seeds={displayBoard[7]} active={gameState.turn === 0 && !gameState.isGameOver}
        canUndo={canUndo} disabled={animating}
        onUndo={handleUndo} onResign={() => dispatch('resign', { seat: 0 })}
        onReset={handleReset} t={t}
      />
    </div>
  );
}

/** One short sentence describing what a completed move did, for screen readers. */
function describe(steps, t) {
  const capture = steps.find(s => s.type === 'capture');
  if (capture) return t.announceCapture.replace('{n}', String(capture.count));
  if (steps.some(s => s.type === 'extraTurn')) return t.announceExtraTurn;
  return t.announceSown;
}

CongkakGame.propTypes = {
  memberId: PropTypes.string,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
