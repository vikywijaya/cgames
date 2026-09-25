import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import { GAME_IDS } from '../../utils/gameIds';
import { useMemoryMatch, MATCH_POINTS } from './useMemoryMatch';
import styles from './MemoryMatch.module.css';
import { useTranslation } from '../../i18n/useTranslation';

function CardTile({ card, state, onFlip, index, peeking, popup, ariaDown }) {
  const { isFlipped, isMatched, isMismatched } = state;
  const up = isFlipped || isMatched || peeking;
  const tileClass = [
    styles.cardTile,
    up ? styles.flipped : '',
    isMatched ? styles.matched : '',
    isMismatched ? styles.mismatched : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      className={tileClass}
      onPointerDown={onFlip}
      disabled={isMatched}
      style={{ '--deal-delay': `${Math.min(index * 0.045, 0.45)}s` }}
      aria-label={up ? card.symbol : ariaDown}
      aria-pressed={up}
    >
      <div className={styles.cardInner}>
        <div className={`${styles.cardFace} ${styles.cardBack}`} aria-hidden="true" />
        <div className={`${styles.cardFace} ${styles.cardFront}`} aria-hidden="true">{card.symbol}</div>
      </div>
      {popup && (
        <span key={popup.id} className={`${styles.floatText} ${popup.points === MATCH_POINTS ? styles.floatPerfect : ''}`} aria-hidden="true">
          +{popup.points}
        </span>
      )}
    </button>
  );
}

CardTile.propTypes = {
  card: PropTypes.shape({ symbol: PropTypes.string.isRequired }).isRequired,
  state: PropTypes.shape({ isFlipped: PropTypes.bool, isMatched: PropTypes.bool, isMismatched: PropTypes.bool }).isRequired,
  onFlip: PropTypes.func.isRequired,
  index: PropTypes.number.isRequired,
  peeking: PropTypes.bool,
  popup: PropTypes.shape({ id: PropTypes.number, points: PropTypes.number }),
  ariaDown: PropTypes.string.isRequired,
};

function MemoryMatchGame({ countingDown = false, difficulty, onComplete, reportScore, playReveal, playSuccess, playFail, playClick }) {
  const t = useTranslation();
  const tm = t.games['memory-match'];
  const {
    cards, cardState, flipCard, matchCount, maxMatches, maxScore, score, moves,
    cols, peekMs, peeking, peeksLeft, peek, lastMatch, done,
  } = useMemoryMatch(difficulty);

  const [started, setStarted] = useState(false);
  const [banner, setBanner] = useState(null);
  const bannerTimer = useRef(null);

  // Opening peek: every card face up for a few seconds, once the
  // countdown is over.
  useEffect(() => {
    if (countingDown || started) return;
    setStarted(true);
    playReveal?.();
    peek(peekMs, true);
  }, [countingDown, started, peek, peekMs, playReveal]);

  useEffect(() => {
    if (!lastMatch) return;
    playSuccess();
    if (lastMatch.points === MATCH_POINTS) {
      setBanner({ id: lastMatch.id, text: tm.perfectMatch });
      clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => setBanner(null), 900);
    }
  }, [lastMatch, playSuccess, tm.perfectMatch]);
  useEffect(() => () => clearTimeout(bannerTimer.current), []);

  useEffect(() => { reportScore?.(score); }, [score, reportScore]);

  const doneRef = useRef(false);
  useEffect(() => {
    if (done && !doneRef.current) {
      doneRef.current = true;
      setTimeout(() => onComplete({ finalScore: score, maxScore, completed: true }), 900);
    }
  }, [done, score, maxScore, onComplete]);

  // A mismatch: a soft buzz.
  const mismatches = cardState.filter(c => c.isMismatched).length;
  const prevMis = useRef(0);
  useEffect(() => {
    if (mismatches > prevMis.current) playFail?.();
    prevMis.current = mismatches;
  }, [mismatches, playFail]);

  const pairsLeft = maxMatches - matchCount;
  const openingPeek = peeking && moves === 0 && matchCount === 0;

  return (
    <div className={styles.container}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.pairsLabel}>
            {pairsLeft === 0 ? t.common.allPairsFound : `${pairsLeft} ${pairsLeft !== 1 ? t.common.pairsLeft : t.common.pairLeft}`}
          </span>
          <span className={styles.movesChip}>{tm.moves} {moves}</span>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tm.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <p className={`${styles.status} ${openingPeek ? styles.statusPeek : ''}`} aria-live="polite">
          {openingPeek ? `👀 ${tm.lookCarefully}` : peeking ? `👀 ${tm.peeking}` : `👆 ${tm.findPairs}`}
        </p>

        <div className={styles.board}>
          {banner && <div key={banner.id} className={styles.banner}>{banner.text}</div>}
          <div
            className={styles.grid}
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
            role="grid"
            aria-label={tm.ariaGrid}
          >
            {cards.map((card, i) => (
              <CardTile
                key={card.id}
                card={card}
                state={cardState[i]}
                peeking={peeking && !cardState[i].isMatched}
                onFlip={() => { if (!countingDown && flipCard(i)) playReveal(); }}
                index={i}
                popup={lastMatch && lastMatch.cards[1] === i ? lastMatch : null}
                ariaDown={tm.faceDown}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          className={styles.peekBtn}
          onClick={() => { playClick?.(); peek(); }}
          disabled={peeksLeft <= 0 || peeking || done}
        >
          <span aria-hidden="true">👁️</span> {tm.peek} <span className={styles.peekCount}>{peeksLeft}</span>
        </button>
        <p className={styles.tip}>{tm.tip.replace('{n}', MATCH_POINTS)}</p>
      </div>
    </div>
  );
}

MemoryMatchGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func,
  playReveal:  PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func,
  playClick:   PropTypes.func,
};

// No overall clock: memory games shouldn't rush seniors.
const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function MemoryMatch({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete } = useGameCallback({ memberId, gameId: GAME_IDS.MEMORY_MATCH, callbackUrl, onComplete });

  return (
    <GameShell
      startCountdown
      gameId={GAME_IDS.MEMORY_MATCH}
      title={t.games['memory-match'].title}
      instructions={t.games['memory-match'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore, difficulty: diff, playReveal, playSuccess, playFail, playClick, countingDown }) => (
        <MemoryMatchGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={shellComplete}
          reportScore={reportScore}
          playReveal={playReveal}
          playSuccess={playSuccess}
          playFail={playFail}
          playClick={playClick}
        />
      )}
    </GameShell>
  );
}

MemoryMatch.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
