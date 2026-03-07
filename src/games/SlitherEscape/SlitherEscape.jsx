import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SlitherEscape.module.css';

/* ── Snake colors ── */
const SNAKE_DEFS = [
  { id: 'blue',   body: '#3355dd', head: '#2244bb', light: '#5577ff', arrow: '#3355dd' },
  { id: 'yellow', body: '#c8e620', head: '#a8c610', light: '#e8ff50', arrow: '#c8e620' },
  { id: 'red',    body: '#dd3333', head: '#bb2222', light: '#ff5555', arrow: '#dd3333' },
  { id: 'green',  body: '#22bb55', head: '#119944', light: '#44dd77', arrow: '#22bb55' },
];

/* ── Directions ── */
const DIR = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const DIR_NAMES = ['up', 'down', 'left', 'right'];
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

/* ── Exit arrow rotation by direction the snake must go to reach exit ── */
const EXIT_ROTATION = { up: 0, right: 90, down: 180, left: 270 };

/* ── Difficulty ── */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 5, timeLimitSeconds: null },
  medium: { rounds: 8, timeLimitSeconds: 240 },
  hard:   { rounds: 12, timeLimitSeconds: 150 },
};

const TIME_LIMITS = {
  easy: null,
  medium: 240,
  hard: 150,
};

/* ── Level templates ──
   Each level defines:
   - maze: 2D array where 1=path, 0=wall
   - snakes: array of { colorIdx, cells:[[r,c],...], exitCell:[r,c], exitDir }
   The exitDir is the direction the snake exits (which edge the exit arrow points)
*/

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Determine which edge direction a border cell faces outward.
 */
function borderDir(r, c, rows, cols) {
  if (r === 0) return 'up';
  if (r === rows - 1) return 'down';
  if (c === 0) return 'left';
  return 'right';
}

/**
 * Generate a random maze shape (irregular path layout).
 * Uses a random walk approach to carve out connected path cells.
 */
function generateMaze(rows, cols, fillRatio) {
  const maze = Array.from({ length: rows }, () => Array(cols).fill(0));
  const target = Math.floor(rows * cols * fillRatio);

  // Start from center
  const sr = Math.floor(rows / 2);
  const sc = Math.floor(cols / 2);
  maze[sr][sc] = 1;
  let count = 1;
  const frontier = [[sr, sc]];

  while (count < target && frontier.length > 0) {
    const idx = Math.floor(Math.random() * frontier.length);
    const [r, c] = frontier[idx];

    const dirs = shuffle(DIR_NAMES);
    let expanded = false;
    for (const d of dirs) {
      const [dr, dc] = DIR[d];
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (maze[nr][nc] === 1) continue;
      maze[nr][nc] = 1;
      count++;
      frontier.push([nr, nc]);
      expanded = true;
      break;
    }
    if (!expanded) {
      frontier.splice(idx, 1);
    }
  }

  return maze;
}

/**
 * Find border cells of the maze (path cells on the edge).
 */
function findBorderPaths(maze, rows, cols) {
  const borders = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (maze[r][c] !== 1) continue;
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        borders.push([r, c]);
      }
    }
  }
  return borders;
}

/**
 * Slide a snake in a direction within the maze. Returns new cells or null.
 */
function slideSnake(cells, dir, maze, rows, cols, wallSet) {
  const [dr, dc] = DIR[dir];
  let moved = false;
  let current = cells.map(([r, c]) => [r, c]);
  const ownSet = new Set(current.map(([r, c]) => `${r},${c}`));

  while (true) {
    const next = current.map(([r, c]) => [r + dr, c + dc]);
    const blocked = next.some(([r, c]) => {
      if (r < 0 || r >= rows || c < 0 || c >= cols) return true;
      if (maze[r][c] !== 1) return true;
      const key = `${r},${c}`;
      if (ownSet.has(key)) return false;
      return wallSet.has(key);
    });
    if (blocked) break;
    // Update ownSet
    const prevSet = new Set(current.map(([r, c]) => `${r},${c}`));
    current = next;
    const nextSet = new Set(current.map(([r, c]) => `${r},${c}`));
    // Remove old cells from ownSet, add new
    for (const k of prevSet) if (!nextSet.has(k)) ownSet.delete(k);
    for (const k of nextSet) ownSet.add(k);
    moved = true;
  }
  return moved ? current : null;
}

function buildWallSet(snakes, excludeIdx) {
  const set = new Set();
  snakes.forEach((snake, i) => {
    if (i === excludeIdx) return;
    snake.cells.forEach(([r, c]) => set.add(`${r},${c}`));
  });
  return set;
}

function snakeAtExit(snake) {
  const head = snake.cells[0];
  return head[0] === snake.exitCell[0] && head[1] === snake.exitCell[1];
}

/**
 * Generate a complete level with maze + snakes.
 */
function generateLevel(numSnakes, difficulty) {
  const baseSize = difficulty === 'easy' ? 5 : difficulty === 'medium' ? 6 : 7;
  // Vary dimensions to create interesting shapes
  const rows = baseSize + Math.floor(Math.random() * 3);
  const cols = baseSize + Math.floor(Math.random() * 2);
  const fillRatio = 0.5 + Math.random() * 0.2;

  for (let attempt = 0; attempt < 40; attempt++) {
    const maze = generateMaze(rows, cols, fillRatio);
    const borders = findBorderPaths(maze, rows, cols);
    if (borders.length < numSnakes * 2) continue;

    const shuffledBorders = shuffle(borders);
    const snakes = [];
    const usedCells = new Set();
    let valid = true;

    for (let si = 0; si < numSnakes; si++) {
      // Find exit cell
      let exitCell = null;
      for (const bc of shuffledBorders) {
        const key = `${bc[0]},${bc[1]}`;
        if (usedCells.has(key)) continue;
        exitCell = bc;
        break;
      }
      if (!exitCell) { valid = false; break; }

      const exitDir = borderDir(exitCell[0], exitCell[1], rows, cols);

      // Build snake body: 3-5 cells long, growing inward from a random interior position
      const snakeLen = 3 + Math.floor(Math.random() * (difficulty === 'hard' ? 3 : 2));
      // Find a starting position away from exit
      const pathCells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (maze[r][c] === 1 && !usedCells.has(`${r},${c}`)) {
            const dist = Math.abs(r - exitCell[0]) + Math.abs(c - exitCell[1]);
            if (dist >= 2) pathCells.push([r, c]);
          }
        }
      }

      if (pathCells.length < snakeLen) { valid = false; break; }

      const shuffledPath = shuffle(pathCells);
      let placed = false;

      for (const startCell of shuffledPath.slice(0, 20)) {
        const cells = [startCell];
        const tempUsed = new Set([...usedCells, `${startCell[0]},${startCell[1]}`]);

        for (let seg = 1; seg < snakeLen; seg++) {
          const [lr, lc] = cells[cells.length - 1];
          const dirs = shuffle(DIR_NAMES);
          let grew = false;
          for (const d of dirs) {
            const [dr, dc] = DIR[d];
            const nr = lr + dr;
            const nc = lc + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (maze[nr][nc] !== 1) continue;
            if (tempUsed.has(`${nr},${nc}`)) continue;
            cells.push([nr, nc]);
            tempUsed.add(`${nr},${nc}`);
            grew = true;
            break;
          }
          if (!grew) break;
        }

        if (cells.length >= 3) {
          cells.forEach(([r, c]) => usedCells.add(`${r},${c}`));
          usedCells.add(`${exitCell[0]},${exitCell[1]}`);
          snakes.push({
            colorIdx: si,
            cells,
            exitCell,
            exitDir,
          });
          placed = true;
          break;
        }
      }

      if (!placed) { valid = false; break; }
    }

    if (!valid) continue;

    // Verify no snake is already at its exit
    const allAway = snakes.every(s => !snakeAtExit(s));
    if (!allAway) continue;

    return { maze, rows, cols, snakes };
  }

  // Fallback: simpler puzzle
  return generateLevel(Math.max(1, numSnakes - 1), 'easy');
}

/* ── Swipe detection ── */
function getSwipeDir(dx, dy) {
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/* ── Determine which segments connect to which ── */
function getSegmentConnections(cells) {
  // For each cell, determine which neighbors in the snake it connects to
  const result = [];
  for (let i = 0; i < cells.length; i++) {
    const [r, c] = cells[i];
    const conn = { up: false, down: false, left: false, right: false };
    if (i > 0) {
      const [pr, pc] = cells[i - 1];
      if (pr === r - 1 && pc === c) conn.up = true;
      if (pr === r + 1 && pc === c) conn.down = true;
      if (pr === r && pc === c - 1) conn.left = true;
      if (pr === r && pc === c + 1) conn.right = true;
    }
    if (i < cells.length - 1) {
      const [nr, nc] = cells[i + 1];
      if (nr === r - 1 && nc === c) conn.up = true;
      if (nr === r + 1 && nc === c) conn.down = true;
      if (nr === r && nc === c - 1) conn.left = true;
      if (nr === r && nc === c + 1) conn.right = true;
    }
    result.push(conn);
  }
  return result;
}

/* ── Snake SVG face ── */
function SnakeFace({ dir }) {
  // Eyes and tongue pointing in movement direction
  const eyeOffsets = {
    up:    [{ cx: -4, cy: -2 }, { cx: 4, cy: -2 }],
    down:  [{ cx: -4, cy: 2 }, { cx: 4, cy: 2 }],
    left:  [{ cx: -2, cy: -4 }, { cx: -2, cy: 4 }],
    right: [{ cx: 2, cy: -4 }, { cx: 2, cy: 4 }],
  };
  const tongueDir = {
    up:    'M0,-8 L-2,-13 M0,-8 L2,-13',
    down:  'M0,8 L-2,13 M0,8 L2,13',
    left:  'M-8,0 L-13,-2 M-8,0 L-13,2',
    right: 'M8,0 L13,-2 M8,0 L13,2',
  };
  const crownDir = {
    up:    'M-5,-7 L-3,-12 L0,-8 L3,-12 L5,-7',
    down:  'M-5,7 L-3,12 L0,8 L3,12 L5,7',
    left:  'M-7,-5 L-12,-3 L-8,0 L-12,3 L-7,5',
    right: 'M7,-5 L12,-3 L8,0 L12,3 L7,5',
  };

  const eyes = eyeOffsets[dir] || eyeOffsets.up;

  return (
    <svg viewBox="-18 -18 36 36" className={styles.snakeFace}>
      {/* Crown/tongue */}
      <path d={crownDir[dir] || crownDir.up} stroke="#dd2222" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Eyes */}
      {eyes.map((eye, i) => (
        <g key={i}>
          <circle cx={eye.cx} cy={eye.cy} r="4" fill="white" />
          <circle cx={eye.cx} cy={eye.cy} r="2" fill="black" />
        </g>
      ))}
    </svg>
  );
}

SnakeFace.propTypes = { dir: PropTypes.string };

/* ── Inner game component ── */
function SlitherEscapeGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const numSnakes = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 4;
  const rounds = DIFFICULTY_CONFIG[difficulty]?.rounds ?? 5;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(() => generateLevel(numSnakes, difficulty));
  const [snakes, setSnakes] = useState(() => level.snakes);
  const [selectedSnake, setSelectedSnake] = useState(null);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);
  const touchRef = useRef(null);
  const doneRef = useRef(false);

  // Regenerate snakes reference when level changes
  useEffect(() => {
    setSnakes(level.snakes);
  }, [level]);

  // Time up
  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: score, maxScore: rounds, completed: false });
    }
  }, [secondsLeft, score, rounds, onComplete]);

  // Check win
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
      const nextSnakes = Math.min(numSnakes, 2 + Math.floor(nextRound / 3));
      const newLevel = generateLevel(nextSnakes, difficulty);
      setLevel(newLevel);
      setSelectedSnake(null);
      setMoves(0);
      setSolved(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [snakes, solved, score, round, rounds, numSnakes, difficulty, onComplete, reportScore, playSuccess]);

  const moveSnake = useCallback((dir) => {
    if (solved || selectedSnake == null || doneRef.current) return;
    const walls = buildWallSet(snakes, selectedSnake);
    const result = slideSnake(snakes[selectedSnake].cells, dir, level.maze, level.rows, level.cols, walls);
    if (!result) {
      playFail();
      return;
    }
    playClick();
    setMoves(m => m + 1);
    setSnakes(prev => prev.map((s, i) => i === selectedSnake ? { ...s, cells: result } : s));
  }, [solved, selectedSnake, snakes, level, playClick, playFail]);

  // Keyboard
  useEffect(() => {
    function handleKey(e) {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                    w: 'up', s: 'down', a: 'left', d: 'right' };
      const dir = map[e.key];
      if (dir) { e.preventDefault(); moveSnake(dir); }
      const num = parseInt(e.key);
      if (num >= 1 && num <= snakes.length) setSelectedSnake(num - 1);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [moveSnake, snakes.length]);

  // Touch/swipe
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

  // Build cell lookup
  const cellMap = new Map();
  snakes.forEach((snake, si) => {
    snake.cells.forEach(([r, c], ci) => {
      cellMap.set(`${r},${c}`, { snakeIdx: si, segIdx: ci, isHead: ci === 0, isTail: ci === snake.cells.length - 1 });
    });
  });

  // Exit map
  const exitMap = new Map();
  snakes.forEach((snake, si) => {
    const key = `${snake.exitCell[0]},${snake.exitCell[1]}`;
    exitMap.set(key, si);
  });

  // Determine head facing direction for each snake
  function getHeadDir(snake) {
    if (snake.cells.length < 2) return 'up';
    const [hr, hc] = snake.cells[0];
    const [nr, nc] = snake.cells[1];
    if (hr < nr) return 'up';
    if (hr > nr) return 'down';
    if (hc < nc) return 'left';
    return 'right';
  }

  const { maze, rows, cols } = level;

  // Calculate cell size
  const maxGridW = 360;
  const cellSize = Math.floor(maxGridW / Math.max(rows, cols));

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.label}>Level <strong>{round + 1}</strong> / {rounds}</span>
        <span className={styles.label}>Moves: <strong>{moves}</strong></span>
      </div>

      {/* Board */}
      <div
        className={`${styles.board} ${solved ? styles.boardSolved : ''}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="grid"
        aria-label="Slither escape board"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
        }}
      >
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            const key = `${r},${c}`;
            const isPath = maze[r][c] === 1;
            const snakeCell = cellMap.get(key);
            const exitIdx = exitMap.get(key);
            const isExit = exitIdx != null;

            if (!isPath && !isExit) {
              return <div key={key} className={styles.wallCell} />;
            }

            // Path cell with stone border appearance
            const hasTop = r > 0 && maze[r - 1][c] === 1;
            const hasBottom = r < rows - 1 && maze[r + 1][c] === 1;
            const hasLeft = c > 0 && maze[r][c - 1] === 1;
            const hasRight = c < cols - 1 && maze[r][c + 1] === 1;

            const borderClasses = [styles.pathCell];
            if (!hasTop) borderClasses.push(styles.borderTop);
            if (!hasBottom) borderClasses.push(styles.borderBottom);
            if (!hasLeft) borderClasses.push(styles.borderLeft);
            if (!hasRight) borderClasses.push(styles.borderRight);

            let snakeDef = null;
            let segConn = null;
            if (snakeCell) {
              snakeDef = SNAKE_DEFS[snakes[snakeCell.snakeIdx].colorIdx];
              const conns = getSegmentConnections(snakes[snakeCell.snakeIdx].cells);
              segConn = conns[snakeCell.segIdx];
            }

            const exitDef = isExit ? SNAKE_DEFS[snakes[exitIdx].colorIdx] : null;
            const exitDir = isExit ? snakes[exitIdx].exitDir : null;

            return (
              <div
                key={key}
                className={borderClasses.join(' ')}
                onClick={() => {
                  if (solved) return;
                  if (snakeCell) {
                    playClick();
                    setSelectedSnake(snakeCell.snakeIdx);
                  }
                }}
                role="gridcell"
              >
                {/* Exit marker */}
                {isExit && !snakeCell && (
                  <div
                    className={styles.exitArrow}
                    style={{
                      background: exitDef.arrow,
                      transform: `rotate(${EXIT_ROTATION[exitDir]}deg)`,
                    }}
                  >
                    <svg viewBox="0 0 24 24" className={styles.exitChevron}>
                      <path d="M7 14l5-5 5 5" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}

                {/* Snake segment */}
                {snakeCell && (
                  <div
                    className={`${styles.snakeSegment} ${snakeCell.isHead ? styles.snakeHead : ''} ${selectedSnake === snakeCell.snakeIdx ? styles.snakeSelected : ''}`}
                    style={{
                      background: snakeDef.body,
                      '--snake-light': snakeDef.light,
                      // Extend segment visually to connect to neighbors
                      borderRadius: snakeCell.isHead || snakeCell.isTail
                        ? getEndRadius(segConn, snakeCell.isHead)
                        : '4px',
                    }}
                  >
                    {snakeCell.isHead && (
                      <SnakeFace dir={getHeadDir(snakes[snakeCell.snakeIdx])} />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Direction buttons */}
      <div className={styles.dpad}>
        <button className={styles.dpadBtn} onClick={() => moveSnake('up')} disabled={solved || selectedSnake == null} aria-label="Move up">
          <svg viewBox="0 0 24 24" width="24" height="24"><path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>
        </button>
        <div className={styles.dpadRow}>
          <button className={styles.dpadBtn} onClick={() => moveSnake('left')} disabled={solved || selectedSnake == null} aria-label="Move left">
            <svg viewBox="0 0 24 24" width="24" height="24"><path d="M14 7l-5 5 5 5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>
          </button>
          <button className={styles.dpadBtn} onClick={() => moveSnake('down')} disabled={solved || selectedSnake == null} aria-label="Move down">
            <svg viewBox="0 0 24 24" width="24" height="24"><path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>
          </button>
          <button className={styles.dpadBtn} onClick={() => moveSnake('right')} disabled={solved || selectedSnake == null} aria-label="Move right">
            <svg viewBox="0 0 24 24" width="24" height="24"><path d="M10 7l5 5-5 5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      <p className={styles.hint}>
        {selectedSnake == null
          ? 'Tap a snake, then swipe or use arrows'
          : `Slide the ${SNAKE_DEFS[snakes[selectedSnake].colorIdx].id} snake to its exit`}
      </p>
    </div>
  );
}

/** Compute border-radius for head/tail segments based on connections */
function getEndRadius(conn, isHead) {
  if (!conn) return '50%';
  // Round the "free" end, square the connected end
  const r = '50%';
  const s = '4px';
  if (conn.up && !conn.down) return `${s} ${s} ${r} ${r}`;     // connected up, free bottom
  if (conn.down && !conn.up) return `${r} ${r} ${s} ${s}`;     // connected down, free top
  if (conn.left && !conn.right) return `${s} ${r} ${r} ${s}`;  // connected left, free right
  if (conn.right && !conn.left) return `${r} ${s} ${s} ${r}`;  // connected right, free left
  return '50%';
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
      instructions="Guide each coloured snake to its matching exit! Tap a snake to select it, then swipe or use the arrow buttons to slide it. Snakes slide until they hit a wall or another snake. Get all snakes home!"
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
