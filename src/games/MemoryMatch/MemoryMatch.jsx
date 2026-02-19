import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import { GAME_IDS } from '../../utils/gameIds';
import { useMemoryMatch } from './useMemoryMatch';
import styles from './MemoryMatch.module.css';

const INSTRUCTIONS =
  'Flip cards to find matching pairs. Click a card to reveal it, then find its match. ' +
  'Matched pairs stay face-up. Find all pairs to win!';

function CardTile({ card, state, onFlip }) {
  const { isFlipped, isMatched } = state;
  const tileClass = [
    styles.cardTile,
    isFlipped || isMatched ? styles.flipped : '',
    isMatched ? styles.matched : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={tileClass}
      onClick={onFlip}
      disabled={isMatched}
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
  state: PropTypes.shape({ isFlipped: PropTypes.bool, isMatched: PropTypes.bool }).isRequired,
  onFlip: PropTypes.func.isRequired,
};

function MemoryMatchGame({ difficulty, onComplete, reportScore, secondsLeft }) {
  const { cards, cardState, flipCard, matchCount, maxMatches, cols, timeLimitSeconds, done } =
    useMemoryMatch(difficulty);

  useEffect(() => { reportScore?.(matchCount); }, [matchCount, reportScore]);

  useEffect(() => {
    if (done) {
      onComplete({ finalScore: matchCount, maxScore: maxMatches, completed: true });
    }
  }, [done, matchCount, maxMatches, onComplete]);

  // Handle time-up
  useEffect(() => {
    if (timeLimitSeconds !== null && secondsLeft === 0 && !done) {
      onComplete({ finalScore: matchCount, maxScore: maxMatches, completed: false });
    }
  }, [secondsLeft, timeLimitSeconds, done, matchCount, maxMatches, onComplete]);

  return (
    <div className={styles.container}>
      <p className={styles.scoreRow} aria-live="polite">
        Matched: <strong>{matchCount}</strong> / {maxMatches}
      </p>
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
            onFlip={() => flipCard(i)}
          />
        ))}
      </div>
    </div>
  );
}

MemoryMatchGame.propTypes = {
  difficulty: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  reportScore: PropTypes.func,
  secondsLeft: PropTypes.number,
};

export function MemoryMatch({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const { fireComplete } = useGameCallback({
    memberId,
    gameId: GAME_IDS.MEMORY_MATCH,
    callbackUrl,
    onComplete,
  });

  const config = { easy: null, medium: 120, hard: 90 };
  const timeLimitSeconds = config[difficulty] ?? null;

  return (
    <GameShell
      gameId={GAME_IDS.MEMORY_MATCH}
      title="Memory Match"
      instructions={INSTRUCTIONS}
      difficulty={difficulty}
      timeLimitSeconds={timeLimitSeconds}
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore, secondsLeft }) => (
        <MemoryMatchGame
          difficulty={difficulty}
          onComplete={shellComplete}
          reportScore={reportScore}
          secondsLeft={secondsLeft}
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
