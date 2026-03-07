import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SlitherEscape.module.css';

/* ── Snake colors ── */
const SNAKE_DEFS = [
  { id: 'red',   body: '#ef4444', head: '#dc2626', exit: '#fca5a5', emoji: '🔴' },
  { id: 'green', body: '#22c55e', head: '#16a34a', exit: '#86efac', emoji: '🟢' },
  { id: 'blue',  body: '#3b82f6', head: '#2563eb', exit: '#93c5fd', emoji: '🔵' },
  { id: 'cyan',  body: '#06b6d4', head: '#0891b2', exit: '#67e8f6', emoji: '🟦' },
];

/* ── Directions ── */
const DIR = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const DIR_NAMES = ['up', 'down', 'left', 'right'];
const DIR_ARROWS = { up: '↑', down: '↓', left: '←', right: '→' };

/* ── Difficulty ── */
const DIFFICULTY_CONFIG = {
  easy:   { gridSize: 5, rounds: 4, numSnakes: 2, timeLimitSeconds: null },
  medium: { gridSize: 6, rounds: 6, numSnakes: 3, timeLimitSeconds: 240 },
  hard:   { gridSize: 7, rounds: 8, numSnakes: 4, timeLimitSeconds: 150 },
};

const TIME_LIMITS = {
  easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds ?? null,
  medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds ?? null,
  hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds ?? null,
};

/* ── Puzzle generation ── */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pick exit positions on the grid border. Each exit is a cell on the edge.
 */
function pickBorderCells(gridSize, count) {
  const border = [];
  for (let c = 0; c < gridSize; c++) { border.push([0, c]); border.push([gridSize - 1, c]); }
  for (let r = 1; r < gridSize - 1; r++) { border.push([r, 0]); border.push([r, gridSize - 1]); }
  return shuffle(border).slice(0, count);
}

/**
 * Check if a snake at `cells` can slide in `dir` on the grid, considering walls
 * (other snakes' cells). Returns the new cells after sliding, or null if no movement.
 */
function slideSnake(cells, dir, gridSize, wallSet) {
  const [dr, dc] = DIR[dir];
  let moved = false;
  let current = cells.map(([r, c]) => [r, c]);

  // Slide one step at a time until blocked
  while (true) {
    const next = current.map(([r, c]) => [r + dr, c + dc]);
    // Check bounds and collisions
    const blocked = next.some(([r, c]) => {
      if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return true;
      const key = `${r},${c}`;
      // Allow sliding into own cells
      if (current.some(([cr, cc]) => cr === r && cc === c)) return false;
      return wallSet.has(key);
    });
    if (blocked) break;
    current = next;
    moved = true;
  }
  return moved ? current : null;
}

/**
 * Build a wall set from all snakes except the one at snakeIdx.
 */
function buildWallSet(snakes, excludeIdx) {
  const set = new Set();
  snakes.forEach((snake, i) => {
    if (i === excludeIdx) return;
    snake.cells.forEach(([r, c]) => set.add(`${r},${c}`));
  });
  return set;
}

/**
 * Check if a snake's head cell matches its exit cell.
 */
function snakeAtExit(snake) {
  const head = snake.cells[0];
  return head[0] === snake.exit[0] && head[1] === snake.exit[1];
}

/**
 * Try to generate a solvable puzzle via random walk backward from solution state.
 * Start with all snakes at their exits, then do random moves to scramble.
 */
function generatePuzzle(gridSize, numSnakes) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const exits = pickBorderCells(gridSize, numSnakes);
    const snakes = [];

    // Place snakes: each snake is 2-3 cells long, starting from its exit
    let valid = true;
    const usedCells = new Set();

    for (let i = 0; i < numSnakes; i++) {
      const [er, ec] = exits[i];
      const snakeLen = 2 + Math.floor(Math.random() * 2); // 2-3 cells
      const cells = [[er, ec]];
      usedCells.add(`${er},${ec}`);

      // Grow snake inward from exit
      for (let seg = 1; seg < snakeLen; seg++) {
        const [lr, lc] = cells[cells.length - 1];
        const dirs = shuffle(DIR_NAMES);
        let placed = false;
        for (const d of dirs) {
          const [dr, dc] = DIR[d];
          const nr = lr + dr;
          const nc = lc + dc;
          if (nr < 0 || nr >= gridSize || nc < 0 || nc >= gridSize) continue;
          if (usedCells.has(`${nr},${nc}`)) continue;
          cells.push([nr, nc]);
          usedCells.add(`${nr},${nc}`);
          placed = true;
          break;
        }
        if (!placed) break;
      }

      if (cells.length < 2) { valid = false; break; }

      snakes.push({
        colorIdx: i,
        cells,
        exit: exits[i],
      });
    }

    if (!valid) continue;

    // Scramble: do random slides to move snakes away from exits
    const scrambled = snakes.map(s => ({ ...s, cells: s.cells.map(c => [...c]) }));
    let scrambleMoves = 0;
    const minMoves = numSnakes * 3;

    for (let m = 0; m < 200 && scrambleMoves < minMoves; m++) {
      const si = Math.floor(Math.random() * numSnakes);
      const dir = DIR_NAMES[Math.floor(Math.random() * 4)];
      const walls = buildWallSet(scrambled, si);
      const result = slideSnake(scrambled[si].cells, dir, gridSize, walls);
      if (result) {
        scrambled[si].cells = result;
        scrambleMoves++;
      }
    }

    // Verify none of the snakes are already at their exits
    const allAway = scrambled.every(s => !snakeAtExit(s));
    if (!allAway || scrambleMoves < minMoves) continue;

    return scrambled;
  }

  // Fallback: return a simple puzzle
  return generatePuzzle(gridSize, Math.max(2, numSnakes - 1));
}

/* ── Touch / swipe handling ── */
function getSwipeDir(dx, dy) {
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/* ── Inner game component ── */
function SlitherEscapeGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { gridSize, rounds, numSnakes } = config;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [snakes, setSnakes] = useState(() => generatePuzzle(gridSize, numSnakes));
  const [selectedSnake, setSelectedSnake] = useState(null);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);
  const [sliding, setSliding] = useState(null); // { snakeIdx, cells } for animation
  const touchRef = useRef(null);
  const doneRef = useRef(false);

  // Time up
  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: score, maxScore: rounds, completed: false });
    }
  }, [secondsLeft, score, rounds, onComplete]);

  // Check win after each move
  useEffect(() => {
    if (solved || !snakes) return;
    const allDone = snakes.every(s => snakeAtExit(s));
    if (!allDone) return;

    setSolved(true);
    playSuccess();
    const newScore = score + 1;
    setScore(newScore);
    reportScore(newScore);

    const timer = setTimeout(() => {
      const nextRound = round + 1;
      if (nextRound >= rounds) {
        doneRef.current = true;
        onComplete({ finalScore: newScore, maxScore: rounds, completed: true });
        return;
      }
      setRound(nextRound);
      setSnakes(generatePuzzle(gridSize, numSnakes));
      setSelectedSnake(null);
      setMoves(0);
      setSolved(false);
      setSliding(null);
    }, 900);
    return () => clearTimeout(timer);
  }, [snakes, solved, score, round, rounds, gridSize, numSnakes, onComplete, reportScore, playSuccess]);

  const moveSnake = useCallback((dir) => {
    if (solved || selectedSnake == null || doneRef.current) return;
    const walls = buildWallSet(snakes, selectedSnake);
    const result = slideSnake(snakes[selectedSnake].cells, dir, gridSize, walls);
    if (!result) {
      playFail();
      return;
    }
    playClick();
    setSliding({ snakeIdx: selectedSnake, cells: result });
    setMoves(m => m + 1);
    // Apply move after brief delay for animation
    setTimeout(() => {
      setSnakes(prev => prev.map((s, i) => i === selectedSnake ? { ...s, cells: result } : s));
      setSliding(null);
    }, 150);
  }, [solved, selectedSnake, snakes, gridSize, playClick, playFail]);

  // Keyboard controls
  useEffect(() => {
    function handleKey(e) {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                    w: 'up', s: 'down', a: 'left', d: 'right' };
      const dir = map[e.key];
      if (dir) { e.preventDefault(); moveSnake(dir); }
      // Number keys to select snake
      const num = parseInt(e.key);
      if (num >= 1 && num <= numSnakes) setSelectedSnake(num - 1);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [moveSnake, numSnakes]);

  // Touch/swipe on grid
  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!touchRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchRef.current.x;
    const dy = touch.clientY - touchRef.current.y;
    const dir = getSwipeDir(dx, dy);
    if (dir) moveSnake(dir);
    touchRef.current = null;
  }, [moveSnake]);

  // Build cell lookup for rendering
  const cellMap = new Map();
  snakes.forEach((snake, si) => {
    const displayCells = (sliding && sliding.snakeIdx === si) ? sliding.cells : snake.cells;
    displayCells.forEach(([r, c], ci) => {
      cellMap.set(`${r},${c}`, { snakeIdx: si, segIdx: ci, isHead: ci === 0 });
    });
  });

  // Exit map
  const exitMap = new Map();
  snakes.forEach((snake, si) => {
    const key = `${snake.exit[0]},${snake.exit[1]}`;
    if (!cellMap.has(key) || cellMap.get(key).snakeIdx === si) {
      exitMap.set(key, si);
    }
  });

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.label}>Level <strong>{round + 1}</strong> / {rounds}</span>
        <span className={styles.label}>Moves: <strong>{moves}</strong></span>
      </div>

      {/* Snake selector */}
      <div className={styles.snakeSelector}>
        {snakes.map((snake, si) => {
          const def = SNAKE_DEFS[snake.colorIdx];
          const atExit = snakeAtExit(snake);
          return (
            <button
              key={si}
              className={`${styles.snakeBtn} ${selectedSnake === si ? styles.snakeBtnActive : ''} ${atExit ? styles.snakeBtnDone : ''}`}
              style={{ '--snake-color': def.body }}
              onClick={() => { if (!solved) { playClick(); setSelectedSnake(si); } }}
              disabled={solved}
              aria-label={`Select ${def.id} snake${atExit ? ' (at exit)' : ''}`}
              aria-pressed={selectedSnake === si}
            >
              <span className={styles.snakeDot} style={{ background: def.body }} />
              <span className={styles.snakeLabel}>{def.id}{atExit ? ' ✓' : ''}</span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div
        className={`${styles.grid} ${solved ? styles.gridSolved : ''}`}
        style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="grid"
        aria-label="Slither escape grid"
      >
        {Array.from({ length: gridSize }, (_, r) =>
          Array.from({ length: gridSize }, (_, c) => {
            const key = `${r},${c}`;
            const snakeCell = cellMap.get(key);
            const exitIdx = exitMap.get(key);
            const isExit = exitIdx != null;

            let cellClass = styles.cell;
            if (snakeCell) {
              cellClass += ` ${styles.cellSnake}`;
              if (snakeCell.isHead) cellClass += ` ${styles.cellHead}`;
              if (snakeCell.snakeIdx === selectedSnake) cellClass += ` ${styles.cellSelected}`;
            }
            if (isExit && !snakeCell) cellClass += ` ${styles.cellExit}`;

            const snakeDef = snakeCell ? SNAKE_DEFS[snakes[snakeCell.snakeIdx].colorIdx] : null;
            const exitDef = isExit ? SNAKE_DEFS[snakes[exitIdx].colorIdx] : null;

            return (
              <div
                key={key}
                className={cellClass}
                style={
                  snakeCell
                    ? { background: snakeCell.isHead ? snakeDef.head : snakeDef.body }
                    : isExit
                    ? { background: exitDef.exit, borderColor: exitDef.body }
                    : undefined
                }
                onClick={() => {
                  if (solved) return;
                  if (snakeCell) {
                    playClick();
                    setSelectedSnake(snakeCell.snakeIdx);
                  }
                }}
                role="gridcell"
                aria-label={
                  snakeCell
                    ? `${SNAKE_DEFS[snakes[snakeCell.snakeIdx].colorIdx].id} snake${snakeCell.isHead ? ' head' : ''}`
                    : isExit
                    ? `${SNAKE_DEFS[snakes[exitIdx].colorIdx].id} exit`
                    : `Empty cell`
                }
              >
                {isExit && !snakeCell && (
                  <span className={styles.exitMarker}>⬟</span>
                )}
                {snakeCell && snakeCell.isHead && (
                  <span className={styles.headDot} />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Direction buttons for mobile */}
      <div className={styles.dpad}>
        <button className={styles.dpadBtn} onClick={() => moveSnake('up')} disabled={solved || selectedSnake == null} aria-label="Move up">↑</button>
        <div className={styles.dpadRow}>
          <button className={styles.dpadBtn} onClick={() => moveSnake('left')} disabled={solved || selectedSnake == null} aria-label="Move left">←</button>
          <button className={styles.dpadBtn} onClick={() => moveSnake('down')} disabled={solved || selectedSnake == null} aria-label="Move down">↓</button>
          <button className={styles.dpadBtn} onClick={() => moveSnake('right')} disabled={solved || selectedSnake == null} aria-label="Move right">→</button>
        </div>
      </div>

      <p className={styles.hint}>
        {selectedSnake == null
          ? 'Tap a snake to select it, then swipe or use arrows to slide'
          : `Swipe or press arrows to slide the ${SNAKE_DEFS[snakes[selectedSnake].colorIdx].id} snake`}
      </p>
    </div>
  );
}

SlitherEscapeGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

/* ── Outer wrapper ── */
export function SlitherEscape({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'slither-escape', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="slither-escape"
      title="Slither Escape"
      instructions="Guide each coloured snake to its matching exit! Tap a snake to select it, then swipe or use the arrow buttons to slide it. Snakes slide until they hit a wall or another snake. Get all snakes to their exits to solve the puzzle!"
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <SlitherEscapeGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

SlitherEscape.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
