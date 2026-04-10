import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { useGameCallback } from '../../hooks/useGameCallback';
import { GAME_IDS } from '../../utils/gameIds';
import { useMemoryMatch } from './useMemoryMatch';
import styles from './MemoryMatch.module.css';
import { useTranslation } from '../../i18n/useTranslation';


function CardTile({ card, state, onFlip, index }) {
  const { isFlipped, isMatched, isMismatched } = state;
  const tileClass = [
    styles.cardTile,
    isFlipped || isMatched ? styles.flipped : '',
    isMatched ? styles.matched : '',
    isMismatched ? styles.mismatched : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={tileClass}
      onClick={onFlip}
      disabled={isMatched}
      style={{ '--deal-delay': `${Math.min(index * 0.055, 0.5)}s` }}
      aria-label={
        isFlipped || isMatched
          ? `Card: ${card.symbol}${isMatched ? ', matched' : ''}`
          : 'Card face down'
      }
      aria-pressed={isFlipped || isMatched}
    >
      <div className={styles.cardInner}>
        <div className={`${styles.cardFace} ${styles.cardBack}`}>?</div>
        <div className={`${styles.cardFace} ${styles.cardFront}`} aria-hidden="true">
          {card.symbol}
        </div>
      </div>
    </button>
  );
}

CardTile.propTypes = {
  card: PropTypes.shape({ symbol: PropTypes.string.isRequired }).isRequired,
  state: PropTypes.shape({ isFlipped: PropTypes.bool, isMatched: PropTypes.bool, isMismatched: PropTypes.bool }).isRequired,
  onFlip: PropTypes.func.isRequired,
  index: PropTypes.number.isRequired,
};

function MemoryMatchGame({ difficulty, onComplete, reportScore, secondsLeft, playReveal, playSuccess }) {
  const { cards, cardState, flipCard, matchCount, maxMatches, cols, timeLimitSeconds, done } =
    useMemoryMatch(difficulty);

  const prevMatchCountRef = useRef(matchCount);
  useEffect(() => {
    if (matchCount > prevMatchCountRef.current) { playSuccess(); }
    prevMatchCountRef.current = matchCount;
  }, [matchCount, playSuccess]);

  useEffect(() => { reportScore?.(matchCount); }, [matchCount, reportScore]);

  useEffect(() => {
    if (done) {
      onComplete({ finalScore: matchCount, maxScore: maxMatches, completed: true });
    }
  }, [done, matchCount, maxMatches, onComplete]);

  useEffect(() => {
    if (timeLimitSeconds !== null && secondsLeft === 0 && !done) {
      onComplete({ finalScore: matchCount, maxScore: maxMatches, completed: false });
    }
  }, [secondsLeft, timeLimitSeconds, done, matchCount, maxMatches, onComplete]);

  const pairsLeft = maxMatches - matchCount;

  return (
    <div className={styles.container}>

      {/* ── Info header — WordRecall style ── */}
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderLabel}>{t.games['memory-match'].label}</span>
          <span className={styles.infoHeaderSub}>
            {pairsLeft === 0 ? t.common.allPairsFound : `${pairsLeft} ${pairsLeft !== 1 ? t.common.pairsLeft : t.common.pairLeft}`}
          </span>
        </div>
        <div className={styles.infoScoreBadge} aria-live="polite" aria-label={`${matchCount} of ${maxMatches} pairs matched`}>
          <span className={styles.infoScoreNum}>{matchCount}</span>
          <span className={styles.infoScoreMax}>/ {maxMatches}</span>
        </div>
      </div>

      {/* ── Match progress bar ── */}
      <div className={styles.progressBar}>
        <ProgressBar
          value={matchCount}
          max={maxMatches}
          ariaLabel="Pairs matched"
          colorVariant={matchCount === maxMatches ? 'success' : 'default'}
        />
      </div>

      {/* ── Card grid ── */}
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        role="grid"
        aria-label="Memory card grid"
      >
        {cards.map((card, i) => (
          <CardTile
            key={card.id}
            card={card}
            state={cardState[i]}
            onFlip={() => { playReveal(); flipCard(i); }}
            index={i}
          />
        ))}
      </div>

    </div>
  );
}

MemoryMatchGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func,
  secondsLeft: PropTypes.number,
  playReveal:  PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

const TIME_LIMITS = { easy: null, medium: 120, hard: 90 };

export function MemoryMatch({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete } = useGameCallback({
    memberId,
    gameId: GAME_IDS.MEMORY_MATCH,
    callbackUrl,
    onComplete,
  });

  return (
    <GameShell
      gameId={GAME_IDS.MEMORY_MATCH}
      title={t.games['memory-match'].title}
      instructions={t.games['memory-match'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireComplete}
      onBack={onBack}
    >
      {({ onComplete: shellComplete, reportScore, secondsLeft, difficulty: diff, playReveal, playSuccess, playFail }) => (
        <MemoryMatchGame
          difficulty={diff}
          onComplete={shellComplete}
          reportScore={reportScore}
          secondsLeft={secondsLeft}
          playReveal={playReveal}
          playSuccess={playSuccess}
          playFail={playFail}
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
