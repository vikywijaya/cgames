import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './NumberSort.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  count: 4, maxVal: 20,  timeLimitSeconds: null },
  medium: { rounds: 10, count: 5, maxVal: 100, timeLimitSeconds: 120  },
  hard:   { rounds: 12, count: 6, maxVal: 999, timeLimitSeconds: 90   },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateNumbers(count, maxVal) {
  const nums = new Set();
  while (nums.size < count) nums.add(Math.floor(Math.random() * maxVal) + 1);
  return shuffle([...nums]);
}

// Player taps numbers in ascending order. Tapped numbers highlight and lock in.
function NumberSortGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [round,    setRound]    = useState(0);
  const [score,    setScore]    = useState(0);
  const [numbers,  setNumbers]  = useState(() => generateNumbers(config.count, config.maxVal));
  const [selected, setSelected] = useState([]); // indices in tap order
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: config.rounds, completed: false });
  }, [secondsLeft, score, config.rounds, onComplete]);

  const nextRound = useCallback((newScore) => {
    const next = round + 1;
    if (next >= config.rounds) {
      onComplete({ finalScore: newScore, maxScore: config.rounds, completed: true });
      return;
    }
    setRound(next);
    setNumbers(generateNumbers(config.count, config.maxVal));
    setSelected([]);
    setFeedback(null);
  }, [round, config, onComplete]);

  const handleTap = useCallback((idx) => {
    if (feedback || selected.includes(idx)) return;
    playClick();
    const newSelected = [...selected, idx];

    // Check if this tap is the correct next in ascending order
    const sorted = [...numbers].sort((a, b) => a - b);
    const expectedVal = sorted[newSelected.length - 1];
    const tappedVal   = numbers[idx];

    if (tappedVal !== expectedVal) {
      // Wrong order
      playFail();
      setFeedback('wrong');
      setTimeout(() => {
        setSelected([]);
        setFeedback(null);
      }, 700);
      return;
    }

    setSelected(newSelected);

    if (newSelected.length === numbers.length) {
      // All correct!
      playSuccess();
      const newScore = score + 1;
      setScore(newScore);
      reportScore(newScore);
      setFeedback('correct');
      setTimeout(() => nextRound(newScore), 700);
    }
  }, [feedback, selected, numbers, score, reportScore, nextRound, playClick, playSuccess, playFail]);

  const sorted = [...numbers].sort((a, b) => a - b);

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Round <strong>{round + 1}</strong> / {config.rounds}</span>
        <span className={styles.instruction}>Tap smallest → largest</span>
      </div>

      <div className={styles.grid}>
        {numbers.map((num, i) => {
          const tapOrder = selected.indexOf(i); // -1 if not yet tapped
          const isTapped = tapOrder !== -1;
          let cls = styles.numBtn;
          if (feedback === 'wrong' && !isTapped) cls = `${styles.numBtn} ${styles.numShake}`;
          if (isTapped) cls = `${styles.numBtn} ${styles.numTapped}`;

          return (
            <button
              key={i}
              className={cls}
              onClick={() => handleTap(i)}
              disabled={isTapped || !!feedback}
              aria-label={`Number ${num}`}
            >
              {isTapped && <span className={styles.orderBadge}>{tapOrder + 1}</span>}
              {num}
            </button>
          );
        })}
      </div>

      {/* Sorted preview at bottom */}
      {feedback === 'correct' && (
        <div className={styles.correctRow}>
          {sorted.map((n, i) => (
            <span key={i} className={styles.correctNum}>{n}</span>
          ))}
        </div>
      )}
      {feedback === 'wrong' && (
        <p className={styles.feedbackBad}>Wrong order — try again!</p>
      )}
    </div>
  );
}

NumberSortGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function NumberSort({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'number-sort', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="number-sort"
      title="Number Sort"
      instructions={`Tap the numbers in order from smallest to largest. You have ${config.rounds} rounds. Exercises numeric reasoning and ordering.`}
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <NumberSortGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

NumberSort.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
