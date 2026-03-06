import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './Sumix.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rows: 3, cols: 3, rounds: 5, maxVal: 9,  timeLimitSeconds: null },
  medium: { rows: 4, cols: 4, rounds: 6, maxVal: 9,  timeLimitSeconds: 180  },
  hard:   { rows: 4, cols: 4, rounds: 8, maxVal: 9,  timeLimitSeconds: 120  },
};

const TIME_LIMITS = { easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds ?? null, medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds ?? null, hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds ?? null };

/**
 * Generate a Sumix puzzle.
 * 1. Create a grid of random numbers.
 * 2. Pick a random subset of cells as "solution" (activated).
 * 3. Compute row/col targets from the solution.
 * This guarantees at least one valid solution exists.
 */
function generatePuzzle(rows, cols, maxVal) {
  // Fill grid with random numbers 1..maxVal
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(Math.floor(Math.random() * maxVal) + 1);
    }
    grid.push(row);
  }

  // Pick a random solution: each cell has ~50% chance of being active
  // Ensure at least one cell per row and column is active for interesting targets
  const solution = Array.from({ length: rows }, () => Array(cols).fill(false));

  // First ensure at least one per row
  for (let r = 0; r < rows; r++) {
    const c = Math.floor(Math.random() * cols);
    solution[r][c] = true;
  }
  // Ensure at least one per col
  for (let c = 0; c < cols; c++) {
    const hasActive = solution.some(row => row[c]);
    if (!hasActive) {
      const r = Math.floor(Math.random() * rows);
      solution[r][c] = true;
    }
  }
  // Randomly activate more cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!solution[r][c] && Math.random() < 0.35) {
        solution[r][c] = true;
      }
    }
  }

  // Compute targets
  const rowTargets = [];
  for (let r = 0; r < rows; r++) {
    let sum = 0;
    for (let c = 0; c < cols; c++) {
      if (solution[r][c]) sum += grid[r][c];
    }
    rowTargets.push(sum);
  }
  const colTargets = [];
  for (let c = 0; c < cols; c++) {
    let sum = 0;
    for (let r = 0; r < rows; r++) {
      if (solution[r][c]) sum += grid[r][c];
    }
    colTargets.push(sum);
  }

  return { grid, rowTargets, colTargets };
}

function SumixGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { rows, cols, rounds } = config;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [puzzle, setPuzzle] = useState(() => generatePuzzle(rows, cols, config.maxVal));
  const [active, setActive] = useState(() => Array.from({ length: rows }, () => Array(cols).fill(false)));
  const [solved, setSolved] = useState(false);

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: rounds, completed: false });
  }, [secondsLeft, score, rounds, onComplete]);

  // Check if current state matches targets
  const { rowRemainders, colRemainders, isSolved } = useMemo(() => {
    const rr = puzzle.rowTargets.map((target, r) => {
      let sum = 0;
      for (let c = 0; c < cols; c++) {
        if (active[r][c]) sum += puzzle.grid[r][c];
      }
      return target - sum;
    });
    const cr = puzzle.colTargets.map((target, c) => {
      let sum = 0;
      for (let r = 0; r < rows; r++) {
        if (active[r][c]) sum += puzzle.grid[r][c];
      }
      return target - sum;
    });
    const done = rr.every(v => v === 0) && cr.every(v => v === 0);
    return { rowRemainders: rr, colRemainders: cr, isSolved: done };
  }, [active, puzzle, rows, cols]);

  // Handle puzzle solved
  useEffect(() => {
    if (!isSolved || solved) return;
    setSolved(true);
    playSuccess();
    const newScore = score + 1;
    setScore(newScore);
    reportScore(newScore);

    const timer = setTimeout(() => {
      const nextRound = round + 1;
      if (nextRound >= rounds) {
        onComplete({ finalScore: newScore, maxScore: rounds, completed: true });
        return;
      }
      setRound(nextRound);
      setPuzzle(generatePuzzle(rows, cols, config.maxVal));
      setActive(Array.from({ length: rows }, () => Array(cols).fill(false)));
      setSolved(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [isSolved, solved, score, round, rounds, rows, cols, config.maxVal, onComplete, reportScore, playSuccess]);

  const toggleCell = useCallback((r, c) => {
    if (solved) return;
    playClick();
    setActive(prev => {
      const next = prev.map(row => [...row]);
      next[r][c] = !next[r][c];
      return next;
    });
  }, [solved, playClick]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Puzzle <strong>{round + 1}</strong> / {rounds}</span>
      </div>

      <div className={`${styles.board} ${solved ? styles.boardSolved : ''}`}>
        {/* Column targets */}
        <div className={styles.colTargets}>
          <div className={styles.colTargetSpacer} />
          {puzzle.colTargets.map((t, c) => (
            <div key={c} className={styles.colTarget}>{t}</div>
          ))}
          <div className={styles.colTargetSpacer} />
        </div>

        {/* Grid rows */}
        {puzzle.grid.map((row, r) => (
          <div key={r} className={styles.row}>
            <div className={styles.rowTarget}>{puzzle.rowTargets[r]}</div>
            {row.map((val, c) => (
              <button
                key={c}
                className={`${styles.cell} ${active[r][c] ? styles.cellActive : ''}`}
                onClick={() => toggleCell(r, c)}
                disabled={solved}
                aria-label={`Row ${r + 1} column ${c + 1}, value ${val}${active[r][c] ? ', selected' : ''}`}
                aria-pressed={active[r][c]}
              >
                {val}
              </button>
            ))}
            <div className={`${styles.rowRemainder} ${rowRemainders[r] === 0 ? styles.remainderDone : ''}`}>
              {rowRemainders[r]}
            </div>
          </div>
        ))}

        {/* Column remainders */}
        <div className={styles.colRemainders}>
          <div className={styles.colRemainderSpacer} />
          {colRemainders.map((rem, c) => (
            <div key={c} className={`${styles.colRemainder} ${rem === 0 ? styles.remainderDone : ''}`}>
              {rem}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

SumixGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function Sumix({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'sumix', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="sumix"
      title="Sumix"
      instructions="Activate the correct numbers so that their sum equals the target number in each row and column. Tap a number to toggle it on or off. Exercises numeric reasoning and logic."
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <SumixGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

Sumix.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
