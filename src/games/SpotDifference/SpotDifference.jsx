import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SpotDifference.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 6,  gridSize: 3, changes: 1, timeLimitSeconds: null },
  medium: { rounds: 8,  gridSize: 4, changes: 2, timeLimitSeconds: 120  },
  hard:   { rounds: 10, gridSize: 4, changes: 3, timeLimitSeconds: 90   },
};

// Pool of emoji for grid cells
const EMOJI_POOL = [
  '🌸','🌻','🌈','⭐','🎈','🎯','🍀','🦋',
  '🌙','☀️','❄️','🌊','🔥','🎵','🎪','🌺',
  '🍁','🦄','🐬','🦁','🐼','🦊','🌿','🍄',
];

function buildPuzzle(gridSize, changes) {
  const total = gridSize * gridSize;
  const pool = [...EMOJI_POOL].sort(() => Math.random() - 0.5).slice(0, total);
  const left  = [...pool];
  const right = [...pool];

  // Pick `changes` distinct positions to alter in the right grid
  const positions = [];
  while (positions.length < changes) {
    const p = Math.floor(Math.random() * total);
    if (!positions.includes(p)) positions.push(p);
  }

  for (const pos of positions) {
    // Replace with a different emoji not currently in either grid
    const used = new Set([...left, ...right]);
    const available = EMOJI_POOL.filter(e => !used.has(e));
    right[pos] = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : '❓';
  }

  return { left, right, diffPositions: new Set(positions) };
}

/**
 * SpotDifference — two emoji grids side by side.
 * Player taps a cell in the RIGHT grid that differs from the left.
 */
function SpotDifferenceGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [round,    setRound]    = useState(0);
  const [score,    setScore]    = useState(0);
  const [puzzle,   setPuzzle]   = useState(() => buildPuzzle(config.gridSize, config.changes));
  const [found,    setFound]    = useState(new Set());      // positions already found
  const [wrong,    setWrong]    = useState(null);           // idx of wrong tap (flash)
  const [feedback, setFeedback] = useState(null);           // 'correct' | null
  const scoreRef = useRef(0);
  const doneRef  = useRef(false);

  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: scoreRef.current, maxScore: config.rounds, completed: false });
    }
  }, [secondsLeft, onComplete, config.rounds]);

  const nextRound = useCallback((newRound, newScore) => {
    if (doneRef.current) return;
    if (newRound >= config.rounds) {
      doneRef.current = true;
      onComplete({ finalScore: newScore, maxScore: config.rounds, completed: true });
      return;
    }
    setRound(newRound);
    setPuzzle(buildPuzzle(config.gridSize, config.changes));
    setFound(new Set());
    setWrong(null);
    setFeedback(null);
  }, [config, onComplete]);

  const handleRightTap = useCallback((idx) => {
    if (doneRef.current || found.has(idx)) return;
    playClick();
    if (puzzle.diffPositions.has(idx)) {
      const newFound = new Set(found);
      newFound.add(idx);
      setFound(newFound);
      if (newFound.size === puzzle.diffPositions.size) {
        // All differences found
        playSuccess();
        const newScore = scoreRef.current + 1;
        scoreRef.current = newScore;
        setScore(newScore);
        reportScore(newScore);
        setFeedback('correct');
        setTimeout(() => nextRound(round + 1, newScore), 800);
      }
    } else {
      playFail();
      setWrong(idx);
      setTimeout(() => setWrong(null), 500);
    }
  }, [found, puzzle, round, reportScore, nextRound, playClick, playSuccess, playFail]);

  const total = config.gridSize * config.gridSize;

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Round <strong>{round + 1}</strong> / {config.rounds}</span>
        <span className={styles.hint}>Find <strong>{config.changes}</strong> difference{config.changes > 1 ? 's' : ''}</span>
        <span className={styles.scoreLabel}>Score: <strong>{score}</strong></span>
      </div>

      <div className={styles.gridsRow}>
        {/* Left grid — reference */}
        <div className={styles.gridWrap}>
          <p className={styles.gridLabel}>Original</p>
          <div className={styles.grid} style={{ '--cols': config.gridSize }}>
            {puzzle.left.map((emoji, i) => (
              <span key={i} className={styles.cell}>{emoji}</span>
            ))}
          </div>
        </div>

        <span className={styles.vs}>vs</span>

        {/* Right grid — tap differences */}
        <div className={styles.gridWrap}>
          <p className={styles.gridLabel}>Changed</p>
          <div className={styles.grid} style={{ '--cols': config.gridSize }}>
            {puzzle.right.map((emoji, i) => {
              let cls = styles.cell;
              if (found.has(i))  cls = `${styles.cell} ${styles.cellFound}`;
              if (wrong === i)   cls = `${styles.cell} ${styles.cellWrong}`;
              return (
                <button key={i} className={cls} onClick={() => handleRightTap(i)} aria-label={emoji}>
                  {emoji}
                  {found.has(i) && <span className={styles.tick} aria-hidden="true">✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.progress}>
        {Array.from({ length: config.changes }, (_, i) => (
          <span key={i} className={i < found.size ? styles.dotFilled : styles.dot} aria-hidden="true" />
        ))}
      </div>

      {feedback === 'correct' && <p className={styles.feedbackOk}>✓ All differences found!</p>}
    </div>
  );
}

SpotDifferenceGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function SpotDifference({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'spot-difference', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="spot-difference"
      title="Spot the Difference"
      instructions="Two emoji grids are shown side by side. Tap the cells in the right grid that differ from the left."
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <SpotDifferenceGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

SpotDifference.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
