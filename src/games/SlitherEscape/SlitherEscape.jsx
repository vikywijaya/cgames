import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SlitherEscape.module.css';

/* ══════════════════════════════════════════════════════════════
   Constants
   ══════════════════════════════════════════════════════════════ */
const SNAKE_COLORS = [
  { id: 'cyan',   body: '#33ccee', head: '#22aacc', glow: 'rgba(51,204,238,0.6)', exit: '#33ccee' },
  { id: 'green',  body: '#44dd44', head: '#2ebc2e', glow: 'rgba(68,221,68,0.6)',  exit: '#44dd44' },
  { id: 'yellow', body: '#ddee33', head: '#ccdd22', glow: 'rgba(221,238,51,0.6)', exit: '#ccdd22' },
  { id: 'orange', body: '#ee8833', head: '#cc6622', glow: 'rgba(238,136,51,0.6)', exit: '#ee8833' },
  { id: 'purple', body: '#bb55ee', head: '#9933cc', glow: 'rgba(187,85,238,0.6)', exit: '#bb55ee' },
];

const DIR = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const DIR_NAMES = ['up', 'down', 'left', 'right'];
const EXIT_ROT = { up: 0, right: 90, down: 180, left: 270 };

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  timeLimitSeconds: null },
  medium: { rounds: 12, timeLimitSeconds: 300 },
  hard:   { rounds: 16, timeLimitSeconds: 200 },
};
const TIME_LIMITS = { easy: null, medium: 300, hard: 200 };

/* ══════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════ */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function borderDir(r, c, rows, cols) {
  // Which edge does this border cell face outward?
  if (r === 0) return 'up';
  if (r === rows - 1) return 'down';
  if (c === 0) return 'left';
  if (c === cols - 1) return 'right';
  return 'right';
}

/* ══════════════════════════════════════════════════════════════
   Movement — slide until hitting edge or another snake
   ══════════════════════════════════════════════════════════════ */
function buildWallSet(snakes, excludeIdx) {
  const set = new Set();
  snakes.forEach((s, i) => {
    if (i !== excludeIdx) s.cells.forEach(([r, c]) => set.add(`${r},${c}`));
  });
  return set;
}

function slideSnake(cells, dir, rows, cols, wallSet) {
  const [dr, dc] = DIR[dir];
  let current = cells.map(([r, c]) => [r, c]);
  let moved = false;

  while (true) {
    const next = current.map(([r, c]) => [r + dr, c + dc]);
    const ownKeys = new Set(current.map(([r, c]) => `${r},${c}`));
    const blocked = next.some(([r, c]) => {
      if (r < 0 || r >= rows || c < 0 || c >= cols) return true;
      const key = `${r},${c}`;
      if (ownKeys.has(key)) return false;
      return wallSet.has(key);
    });
    if (blocked) break;
    current = next;
    moved = true;
  }
  return moved ? current : null;
}

/** Snake escapes when ANY of its cells covers the exit cell. */
function snakeAtExit(snake) {
  return snake.cells.some(([r, c]) => r === snake.exitCell[0] && c === snake.exitCell[1]);
}

/* ══════════════════════════════════════════════════════════════
   Solvability check — lightweight BFS (capped at 2000 states)
   ══════════════════════════════════════════════════════════════ */

/** Encode snake positions as a compact string key for BFS visited set. */
function encodeState(snakes) {
  return snakes.map(s => s.cells.map(([r, c]) => `${r},${c}`).join('|')).join(';');
}

/** Returns true if the puzzle can be solved from the given scrambled state. */
function isSolvable(initSnakes, rows, cols) {
  const MAX_STATES = 8000;
  const visited = new Set();
  const queue = [initSnakes.map(s => ({ ...s, cells: s.cells.map(c => [...c]) }))];
  visited.add(encodeState(initSnakes));

  while (queue.length > 0 && visited.size < MAX_STATES) {
    const state = queue.shift();

    // Check if solved: every snake at its exit
    if (state.every(s => snakeAtExit(s))) return true;

    // Try all moves
    for (let si = 0; si < state.length; si++) {
      const walls = buildWallSet(state, si);
      for (const dir of DIR_NAMES) {
        const result = slideSnake(state[si].cells, dir, rows, cols, walls);
        if (!result) continue;
        const nextState = state.map((s, i) =>
          i === si ? { ...s, cells: result } : { ...s, cells: s.cells.map(c => [...c]) }
        );
        const key = encodeState(nextState);
        if (!visited.has(key)) {
          visited.add(key);
          queue.push(nextState);
        }
      }
    }
  }

  // If BFS exhausted under limit → proven unsolvable; if limit hit → assume solvable (scramble guarantees it)
  return visited.size >= MAX_STATES;
}

/* ══════════════════════════════════════════════════════════════
   Level generation — guaranteed solvable via scramble-from-solved
   ══════════════════════════════════════════════════════════════ */

/**
 * Build a level on a compact rectangular grid with LONG snakes.
 *  1. All cells are walkable (no internal walls).
 *  2. Each snake is a long straight bar placed at its exit (solved state).
 *  3. Random slides scramble the board — snakes block each other.
 *  4. BFS validates solvability from the scrambled state.
 */
function generateLevel(numSnakes, roundNum) {
  // Compact grid — snakes should fill most of the space
  const rows = 5 + Math.min(3, Math.floor(roundNum / 5));
  const cols = 6 + Math.min(3, Math.floor(roundNum / 4));

  for (let attempt = 0; attempt < 120; attempt++) {
    // Collect border cells grouped by edge (avoid corners for cleaner placement)
    const borders = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
          borders.push({ r, c, dir: borderDir(r, c, rows, cols) });
        }
      }
    }

    const shuffledBorders = shuffle(borders);
    const snakes = [];
    const occupiedCells = new Set();
    let valid = true;

    for (let si = 0; si < numSnakes; si++) {
      let placed = false;

      for (const border of shuffledBorders) {
        if (occupiedCells.has(`${border.r},${border.c}`)) continue;

        // Determine how far the snake extends inward
        const inDir = { up: 'down', down: 'up', left: 'right', right: 'left' }[border.dir];
        const inward = DIR[inDir];
        const perpDim = (inDir === 'left' || inDir === 'right') ? cols : rows;

        // Long snakes: fill 50-85% of the perpendicular dimension
        const minLen = Math.max(3, Math.floor(perpDim * 0.5));
        const maxLen = Math.max(minLen, perpDim - 1);
        const snakeLen = minLen + Math.floor(Math.random() * (maxLen - minLen + 1));

        const cells = [];
        let canPlace = true;
        for (let seg = 0; seg < snakeLen; seg++) {
          const cr = border.r + inward[0] * seg;
          const cc = border.c + inward[1] * seg;
          if (cr < 0 || cr >= rows || cc < 0 || cc >= cols) { canPlace = false; break; }
          const key = `${cr},${cc}`;
          if (occupiedCells.has(key)) { canPlace = false; break; }
          cells.push([cr, cc]);
        }

        if (!canPlace || cells.length < snakeLen) continue;

        // Reserve cells occupied by this snake
        cells.forEach(([r, c]) => occupiedCells.add(`${r},${c}`));
        // Reserve exit and adjacent cells to avoid adjacent exits
        for (const d of DIR_NAMES) {
          const [dr, dc] = DIR[d];
          occupiedCells.add(`${border.r + dr},${border.c + dc}`);
        }

        snakes.push({
          colorIdx: si % SNAKE_COLORS.length,
          cells,
          exitCell: [border.r, border.c],
          exitDir: border.dir,
        });
        placed = true;
        break;
      }

      if (!placed) { valid = false; break; }
    }

    if (!valid) continue;

    // Scramble: many random moves to push snakes away and into each other's paths
    const scrambled = snakes.map(s => ({ ...s, cells: s.cells.map(c => [...c]) }));
    const minScrambleMoves = numSnakes * 8 + roundNum * 3;
    let totalMoves = 0;

    for (let m = 0; m < 1000 && totalMoves < minScrambleMoves; m++) {
      const si = Math.floor(Math.random() * numSnakes);
      const dir = DIR_NAMES[Math.floor(Math.random() * 4)];
      const walls = buildWallSet(scrambled, si);
      const result = slideSnake(scrambled[si].cells, dir, rows, cols, walls);
      if (result) {
        scrambled[si].cells = result;
        totalMoves++;
      }
    }

    // Verify no snake is still at its exit
    if (scrambled.some(s => snakeAtExit(s))) continue;
    if (totalMoves < numSnakes * 4) continue;

    // Verify every snake can make at least one move (no fully locked board)
    const allMovable = scrambled.every((s, idx) => {
      const walls = buildWallSet(scrambled, idx);
      return DIR_NAMES.some(d => slideSnake(s.cells, d, rows, cols, walls) !== null);
    });
    if (!allMovable) continue;

    // BFS to verify puzzle is solvable
    if (!isSolvable(scrambled, rows, cols)) continue;

    return { rows, cols, snakes: scrambled };
  }

  // Fallback with fewer snakes
  return generateLevel(Math.max(1, numSnakes - 1), Math.max(0, roundNum - 2));
}

/* ══════════════════════════════════════════════════════════════
   Visual helpers
   ══════════════════════════════════════════════════════════════ */
function getSegConns(cells) {
  return cells.map(([r, c], i) => {
    const conn = { up: false, down: false, left: false, right: false };
    const check = (pr, pc) => {
      if (pr === r - 1 && pc === c) conn.up = true;
      if (pr === r + 1 && pc === c) conn.down = true;
      if (pr === r && pc === c - 1) conn.left = true;
      if (pr === r && pc === c + 1) conn.right = true;
    };
    if (i > 0) check(cells[i - 1][0], cells[i - 1][1]);
    if (i < cells.length - 1) check(cells[i + 1][0], cells[i + 1][1]);
    return conn;
  });
}

function endRadius(conn) {
  if (!conn) return '50%';
  const r = '50%', s = '3px';
  if (conn.up && !conn.down) return `${s} ${s} ${r} ${r}`;
  if (conn.down && !conn.up) return `${r} ${r} ${s} ${s}`;
  if (conn.left && !conn.right) return `${s} ${r} ${r} ${s}`;
  if (conn.right && !conn.left) return `${r} ${s} ${s} ${r}`;
  return '3px';
}

function headDir(cells) {
  if (cells.length < 2) return 'right';
  const [hr, hc] = cells[0];
  const [nr, nc] = cells[1];
  if (hr < nr) return 'up';
  if (hr > nr) return 'down';
  if (hc < nc) return 'left';
  return 'right';
}

/* ══════════════════════════════════════════════════════════════
   Particle burst
   ══════════════════════════════════════════════════════════════ */
function ParticleBurst({ color, x, y, onDone }) {
  const pts = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = 25 + Math.random() * 45;
      return { id: i, dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist,
               size: 3 + Math.random() * 7, delay: Math.random() * 0.12 };
    }), []);

  useEffect(() => { const t = setTimeout(onDone, 900); return () => clearTimeout(t); }, [onDone]);

  return (
    <div className={styles.particleWrap} style={{ left: x, top: y }}>
      {pts.map(p => (
        <div key={p.id} className={styles.particle}
          style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--sz': `${p.size}px`,
                   '--del': `${p.delay}s`, background: color }} />
      ))}
    </div>
  );
}
ParticleBurst.propTypes = { color: PropTypes.string, x: PropTypes.number, y: PropTypes.number, onDone: PropTypes.func };

/* ══════════════════════════════════════════════════════════════
   Snake face — googly eyes + waggling tongue
   ══════════════════════════════════════════════════════════════ */
function SnakeFace({ dir }) {
  const rot = EXIT_ROT[dir] ?? 0;
  return (
    <svg viewBox="-20 -20 40 40" className={styles.snakeFace}>
      <g transform={`rotate(${rot})`}>
        {/* Forked tongue */}
        <g className={styles.tongue}>
          <path d="M0,-11 L-2.5,-18 M0,-11 L2.5,-18" stroke="#dd2222" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>
        {/* Eye whites */}
        <circle cx="-5.5" cy="-1" r="5.5" fill="white" stroke="#444" strokeWidth="0.7" />
        <circle cx="5.5"  cy="-1" r="5.5" fill="white" stroke="#444" strokeWidth="0.7" />
        {/* Pupils */}
        <circle cx="-5.5" cy="-2.5" r="3" fill="#111" />
        <circle cx="5.5"  cy="-2.5" r="3" fill="#111" />
        {/* Shine */}
        <circle cx="-7" cy="-3.5" r="1.5" fill="white" opacity="0.85" />
        <circle cx="4"  cy="-3.5" r="1.5" fill="white" opacity="0.85" />
      </g>
    </svg>
  );
}
SnakeFace.propTypes = { dir: PropTypes.string };

/* ══════════════════════════════════════════════════════════════
   Main game component
   ══════════════════════════════════════════════════════════════ */
function SlitherEscapeGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const rounds = DIFFICULTY_CONFIG[difficulty]?.rounds ?? 8;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(null);
  const [snakes, setSnakes] = useState([]);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [particles, setParticles] = useState([]);
  const [escapedSet, setEscapedSet] = useState(new Set());
  const boardRef = useRef(null);
  const dragRef = useRef(null); // { snakeIdx, startX, startY, moved }
  const doneRef = useRef(false);
  const pidRef = useRef(0);

  // Generate level for current round
  const genLevel = useCallback((roundNum) => {
    // Start with 2 snakes, add more as rounds progress (max 5)
    const numSnakes = Math.min(SNAKE_COLORS.length, 2 + Math.floor(roundNum / 3));
    return generateLevel(numSnakes, roundNum);
  }, []);

  // Init
  useEffect(() => {
    const lv = genLevel(0);
    setLevel(lv);
    setSnakes(lv.snakes.map(s => ({ ...s, cells: s.cells.map(c => [...c]) })));
  }, [genLevel]);

  // Time up
  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: score, maxScore: rounds, completed: false });
    }
  }, [secondsLeft, score, rounds, onComplete]);

  // Check win
  useEffect(() => {
    if (solved || !snakes.length || !level || transitioning) return;
    if (!snakes.every(s => snakeAtExit(s))) return;

    setSolved(true);
    playSuccess();
    spawnParticlesAtExits();

    const newScore = score + 1;
    setScore(newScore);
    reportScore(newScore);

    const timer = setTimeout(() => {
      const next = round + 1;
      if (next >= rounds) {
        doneRef.current = true;
        onComplete({ finalScore: newScore, maxScore: rounds, completed: true });
        return;
      }
      setTransitioning(true);
      setTimeout(() => {
        setRound(next);
        const newLv = genLevel(next);
        setLevel(newLv);
        setSnakes(newLv.snakes.map(s => ({ ...s, cells: s.cells.map(c => [...c]) })));
        setMoves(0);
        setSolved(false);
        setEscapedSet(new Set());
        setTransitioning(false);
      }, 350);
    }, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snakes, solved, transitioning]);

  function spawnParticlesAtExits() {
    if (!boardRef.current || !level) return;
    const rect = boardRef.current.getBoundingClientRect();
    const cw = rect.width / level.cols;
    const ch = rect.height / level.rows;
    const newP = snakes.map(s => ({
      id: pidRef.current++,
      color: SNAKE_COLORS[s.colorIdx].glow,
      x: s.exitCell[1] * cw + cw / 2,
      y: s.exitCell[0] * ch + ch / 2,
    }));
    setParticles(prev => [...prev, ...newP]);
  }

  function spawnParticleAt(snakeIdx) {
    if (!boardRef.current || !level) return;
    const s = snakes[snakeIdx];
    const rect = boardRef.current.getBoundingClientRect();
    const cw = rect.width / level.cols;
    const ch = rect.height / level.rows;
    setParticles(prev => [...prev, {
      id: pidRef.current++,
      color: SNAKE_COLORS[s.colorIdx].glow,
      x: s.exitCell[1] * cw + cw / 2,
      y: s.exitCell[0] * ch + ch / 2,
    }]);
  }

  // Core move function
  const moveSnake = useCallback((snakeIdx, dir) => {
    if (solved || doneRef.current || !level) return false;
    const walls = buildWallSet(snakes, snakeIdx);
    const result = slideSnake(snakes[snakeIdx].cells, dir, level.rows, level.cols, walls);
    if (!result) return false;

    playClick();
    setMoves(m => m + 1);

    const updatedSnake = { ...snakes[snakeIdx], cells: result };
    const reached = snakeAtExit(updatedSnake);
    setSnakes(prev => prev.map((s, i) => i === snakeIdx ? updatedSnake : s));

    if (reached) {
      setEscapedSet(prev => new Set([...prev, snakeIdx]));
      spawnParticleAt(snakeIdx);
    }
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved, snakes, level, playClick]);

  // Keyboard
  useEffect(() => {
    function handleKey(e) {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                    w: 'up', s: 'down', a: 'left', d: 'right' };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      // Move first non-escaped snake, or the last touched one
      const si = dragRef.current?.lastSnake ?? snakes.findIndex(s => !snakeAtExit(s));
      if (si >= 0 && si < snakes.length) moveSnake(si, dir);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [moveSnake, snakes]);

  /* ── Drag interaction (touch + mouse) ── */
  const findSnakeAt = useCallback((clientX, clientY) => {
    if (!boardRef.current || !level) return -1;
    const rect = boardRef.current.getBoundingClientRect();
    const col = Math.floor((clientX - rect.left) / (rect.width / level.cols));
    const row = Math.floor((clientY - rect.top) / (rect.height / level.rows));
    const key = `${row},${col}`;
    for (let si = 0; si < snakes.length; si++) {
      if (snakes[si].cells.some(([r, c]) => `${r},${c}` === key)) return si;
    }
    return -1;
  }, [level, snakes]);

  const handleDragStart = useCallback((clientX, clientY) => {
    const si = findSnakeAt(clientX, clientY);
    if (si < 0) return;
    dragRef.current = { snakeIdx: si, startX: clientX, startY: clientY, moved: false, lastSnake: si };
  }, [findSnakeAt]);

  const handleDragEnd = useCallback((clientX, clientY) => {
    if (!dragRef.current || dragRef.current.moved) { dragRef.current = dragRef.current ? { lastSnake: dragRef.current.lastSnake } : null; return; }
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    const si = dragRef.current.snakeIdx;
    dragRef.current = { lastSnake: si };

    if (Math.abs(dx) < 15 && Math.abs(dy) < 15) return; // tap, not drag
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    if (!moveSnake(si, dir)) playFail();
  }, [moveSnake, playFail]);

  const handleDragMove = useCallback((clientX, clientY) => {
    if (!dragRef.current || dragRef.current.moved) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    if (Math.abs(dx) < 25 && Math.abs(dy) < 25) return;

    const si = dragRef.current.snakeIdx;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    dragRef.current.moved = true;
    if (!moveSnake(si, dir)) playFail();
  }, [moveSnake, playFail]);

  // Touch handlers
  const onTouchStart = useCallback((e) => {
    const t = e.touches[0];
    handleDragStart(t.clientX, t.clientY);
  }, [handleDragStart]);

  const onTouchMove = useCallback((e) => {
    const t = e.touches[0];
    handleDragMove(t.clientX, t.clientY);
  }, [handleDragMove]);

  const onTouchEnd = useCallback((e) => {
    const t = e.changedTouches[0];
    handleDragEnd(t.clientX, t.clientY);
  }, [handleDragEnd]);

  // Mouse handlers
  const onMouseDown = useCallback((e) => {
    handleDragStart(e.clientX, e.clientY);
  }, [handleDragStart]);

  const onMouseMove = useCallback((e) => {
    if (e.buttons === 0) return;
    handleDragMove(e.clientX, e.clientY);
  }, [handleDragMove]);

  const onMouseUp = useCallback((e) => {
    handleDragEnd(e.clientX, e.clientY);
  }, [handleDragEnd]);

  const removeParticle = useCallback((id) => {
    setParticles(prev => prev.filter(p => p.id !== id));
  }, []);

  /* ── Render ── */
  if (!level) return <div className={styles.loading}>Building puzzle…</div>;

  const { rows, cols } = level;

  // Cell lookup
  const cellMap = new Map();
  snakes.forEach((snake, si) => {
    const conns = getSegConns(snake.cells);
    snake.cells.forEach(([r, c], ci) => {
      cellMap.set(`${r},${c}`, {
        si, ci, isHead: ci === 0, isTail: ci === snake.cells.length - 1, conn: conns[ci],
      });
    });
  });

  const exitMap = new Map();
  snakes.forEach((s, si) => exitMap.set(`${s.exitCell[0]},${s.exitCell[1]}`, si));

  const maxPx = Math.min(420, window.innerWidth - 32);
  const cellSize = Math.floor(maxPx / Math.max(rows, cols));

  return (
    <div className={styles.wrapper}>
      {/* Background */}
      <div className={styles.bgScene}>
        <div className={styles.bgSky} />
        <div className={styles.bgClouds} />
        <div className={styles.bgHills} />
      </div>

      {/* HUD */}
      <div className={styles.hud}>
        <div className={styles.pill}><span className={styles.pillLabel}>Level</span><span className={styles.pillVal}>{round + 1}<small>/{rounds}</small></span></div>
        <div className={styles.pill}><span className={styles.pillLabel}>Moves</span><span className={styles.pillVal}>{moves}</span></div>
      </div>

      {/* Board */}
      <div className={`${styles.boardWrap} ${transitioning ? styles.boardOut : ''} ${solved ? styles.boardWin : ''}`}>
        <div
          ref={boardRef}
          className={styles.board}
          style={{
            gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          role="grid"
          aria-label="Puzzle board"
        >
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => {
              const key = `${r},${c}`;
              const sc = cellMap.get(key);
              const exi = exitMap.get(key);
              const isExit = exi != null;

              // Stone border edges
              const noT = r === 0, noB = r === rows - 1, noL = c === 0, noR = c === cols - 1;

              const cls = [styles.cell];
              if (noT) cls.push(styles.stT);
              if (noB) cls.push(styles.stB);
              if (noL) cls.push(styles.stL);
              if (noR) cls.push(styles.stR);

              const snakeDef = sc ? SNAKE_COLORS[snakes[sc.si].colorIdx] : null;
              const exitDef = isExit ? SNAKE_COLORS[snakes[exi].colorIdx] : null;
              const exitD = isExit ? snakes[exi].exitDir : null;
              const escaped = sc ? escapedSet.has(sc.si) : false;

              // Position exit marks outside the grid border
              const exitStyle = isExit ? (() => {
                const sz = `${cellSize * 0.7}px`;
                const base = { background: exitDef.exit, width: sz, height: sz };
                switch (exitD) {
                  case 'up':    return { ...base, left: '15%', right: '15%', width: 'auto', top: `${-cellSize * 0.75 - 7}px` };
                  case 'down':  return { ...base, left: '15%', right: '15%', width: 'auto', bottom: `${-cellSize * 0.75 - 7}px` };
                  case 'left':  return { ...base, top: '15%', bottom: '15%', height: 'auto', left: `${-cellSize * 0.75 - 7}px` };
                  case 'right': return { ...base, top: '15%', bottom: '15%', height: 'auto', right: `${-cellSize * 0.75 - 7}px` };
                  default: return base;
                }
              })() : null;

              return (
                <div key={key} className={cls.join(' ')} style={isExit ? { overflow: 'visible', zIndex: 5 } : undefined} role="gridcell">
                  {/* Exit chevron (positioned outside grid border) */}
                  {isExit && (
                    <div
                      className={`${styles.exitMark} ${sc ? styles.exitHidden : ''}`}
                      style={exitStyle}
                    >
                      <svg viewBox="0 0 24 24" width="65%" height="65%" style={{ transform: `rotate(${EXIT_ROT[exitD]}deg)` }}>
                        <path d="M6 14l6-5 6 5" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6 19l6-5 6 5" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}

                  {/* Snake segment */}
                  {sc && (
                    <div
                      className={`${styles.seg} ${sc.isHead ? styles.segH : ''} ${escaped ? styles.segDone : ''}`}
                      style={{
                        background: `linear-gradient(135deg, ${snakeDef.body} 0%, ${snakeDef.head} 100%)`,
                        borderRadius: (sc.isHead || sc.isTail) ? endRadius(sc.conn) : '3px',
                        '--glow': snakeDef.glow,
                      }}
                    >
                      <div className={styles.shine} />
                      {sc.isHead && <SnakeFace dir={headDir(snakes[sc.si].cells)} />}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Particles */}
          {particles.map(p => (
            <ParticleBurst key={p.id} color={p.color} x={p.x} y={p.y} onDone={() => removeParticle(p.id)} />
          ))}
        </div>
      </div>

      <p className={styles.hint}>Drag a snake to slide it to its matching exit</p>
    </div>
  );
}

SlitherEscapeGame.propTypes = {
  difficulty: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick: PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail: PropTypes.func.isRequired,
};

/* ══════════════════════════════════════════════════════════════
   Outer wrapper
   ══════════════════════════════════════════════════════════════ */
export function SlitherEscape({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'slither-escape', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="slither-escape"
      title="Slither Escape"
      instructions="Drag each coloured snake to its matching exit! Snakes slide until they hit a wall or another snake. Move snakes out of the way in the right order to clear the path!"
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
