import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SlitherEscape.module.css';

/* ══════════════════════════════════════════════════════════════
   Snake definitions
   ══════════════════════════════════════════════════════════════ */
const SNAKE_COLORS = [
  { id: 'blue',   body: '#3366ee', head: '#2850cc', glow: 'rgba(51,102,238,0.5)', exitBg: '#3366ee' },
  { id: 'green',  body: '#44bb55', head: '#339944', glow: 'rgba(68,187,85,0.5)',  exitBg: '#44bb55' },
  { id: 'orange', body: '#ee8833', head: '#cc6622', glow: 'rgba(238,136,51,0.5)', exitBg: '#ee8833' },
  { id: 'purple', body: '#9955dd', head: '#7733bb', glow: 'rgba(153,85,221,0.5)', exitBg: '#9955dd' },
];

/* ══════════════════════════════════════════════════════════════
   Direction helpers
   ══════════════════════════════════════════════════════════════ */
const DIR = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const DIR_NAMES = ['up', 'down', 'left', 'right'];
const EXIT_ROT = { up: 0, right: 90, down: 180, left: 270 };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ══════════════════════════════════════════════════════════════
   Level definitions — hand-crafted + procedural progression
   ══════════════════════════════════════════════════════════════ */

function borderDir(r, c, rows, cols) {
  if (r === 0) return 'up';
  if (r === rows - 1) return 'down';
  if (c === 0) return 'left';
  return 'right';
}

// Tutorial levels (hand-crafted for learning)
const TUTORIAL_LEVELS = [
  // Level 1: single straight corridor, 1 snake
  () => {
    const maze = [
      [0,0,0,0,0],
      [0,1,1,1,1],
      [0,0,0,0,0],
    ];
    return {
      maze, rows: 3, cols: 5,
      snakes: [
        { colorIdx: 0, cells: [[1,1],[1,2]], exitCell: [1,4], exitDir: 'right' },
      ],
    };
  },
  // Level 2: L-shaped corridor, 1 snake
  () => {
    const maze = [
      [0,0,1,0,0],
      [0,0,1,0,0],
      [0,0,1,0,0],
      [0,0,1,1,1],
    ];
    return {
      maze, rows: 4, cols: 5,
      snakes: [
        { colorIdx: 0, cells: [[2,2],[3,2],[3,3]], exitCell: [0,2], exitDir: 'up' },
      ],
    };
  },
  // Level 3: straight corridor, 2 snakes blocking each other
  () => {
    const maze = [
      [1,1,1,1,1,1],
      [0,0,0,0,0,0],
    ];
    return {
      maze, rows: 2, cols: 6,
      snakes: [
        { colorIdx: 0, cells: [[0,2],[0,3]], exitCell: [0,5], exitDir: 'right' },
        { colorIdx: 1, cells: [[0,4]], exitCell: [0,0], exitDir: 'left' },
      ],
    };
  },
  // Level 4: T-junction, 2 snakes
  () => {
    const maze = [
      [0,0,1,0,0],
      [1,1,1,1,1],
      [0,0,1,0,0],
      [0,0,1,0,0],
    ];
    return {
      maze, rows: 4, cols: 5,
      snakes: [
        { colorIdx: 0, cells: [[1,0],[1,1]], exitCell: [0,2], exitDir: 'up' },
        { colorIdx: 1, cells: [[2,2],[3,2]], exitCell: [1,4], exitDir: 'right' },
      ],
    };
  },
];

/**
 * Procedurally generate a level with the given number of snakes.
 */
function generateProceduralLevel(numSnakes, complexity) {
  const rows = 4 + Math.floor(complexity * 2) + Math.floor(Math.random() * 2);
  const cols = 4 + Math.floor(complexity * 2) + Math.floor(Math.random() * 2);
  const fillRatio = 0.35 + complexity * 0.1 + Math.random() * 0.1;

  for (let attempt = 0; attempt < 60; attempt++) {
    // Generate maze via random walk
    const maze = Array.from({ length: rows }, () => Array(cols).fill(0));
    const target = Math.max(numSnakes * 6, Math.floor(rows * cols * fillRatio));
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
      if (!expanded) frontier.splice(idx, 1);
    }

    // Find border path cells for exits
    const borders = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (maze[r][c] === 1 && (r === 0 || r === rows - 1 || c === 0 || c === cols - 1))
          borders.push([r, c]);

    if (borders.length < numSnakes) continue;

    // Place snakes
    const shuffledBorders = shuffle(borders);
    const snakes = [];
    const usedCells = new Set();
    let valid = true;

    for (let si = 0; si < numSnakes; si++) {
      let exitCell = null;
      for (const bc of shuffledBorders) {
        if (usedCells.has(`${bc[0]},${bc[1]}`)) continue;
        // Check exit isn't adjacent to another exit
        const tooClose = snakes.some(s =>
          Math.abs(s.exitCell[0] - bc[0]) + Math.abs(s.exitCell[1] - bc[1]) <= 1
        );
        if (tooClose) continue;
        exitCell = bc;
        break;
      }
      if (!exitCell) { valid = false; break; }

      const exitD = borderDir(exitCell[0], exitCell[1], rows, cols);
      usedCells.add(`${exitCell[0]},${exitCell[1]}`);

      // Find start position and grow snake body
      const snakeLen = 2 + Math.floor(Math.random() * 2 + complexity);
      const candidates = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (maze[r][c] === 1 && !usedCells.has(`${r},${c}`) &&
              Math.abs(r - exitCell[0]) + Math.abs(c - exitCell[1]) >= 2)
            candidates.push([r, c]);

      if (candidates.length < snakeLen) { valid = false; break; }

      let placed = false;
      for (const start of shuffle(candidates).slice(0, 30)) {
        const cells = [start];
        const tempUsed = new Set([...usedCells, `${start[0]},${start[1]}`]);

        for (let seg = 1; seg < snakeLen; seg++) {
          const [lr, lc] = cells[cells.length - 1];
          let grew = false;
          for (const d of shuffle(DIR_NAMES)) {
            const [dr, dc] = DIR[d];
            const nr = lr + dr;
            const nc = lc + dc;
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
            if (maze[nr][nc] !== 1 || tempUsed.has(`${nr},${nc}`)) continue;
            cells.push([nr, nc]);
            tempUsed.add(`${nr},${nc}`);
            grew = true;
            break;
          }
          if (!grew) break;
        }

        if (cells.length >= 2) {
          cells.forEach(([r, c]) => usedCells.add(`${r},${c}`));
          snakes.push({ colorIdx: si % SNAKE_COLORS.length, cells, exitCell, exitDir: exitD });
          placed = true;
          break;
        }
      }
      if (!placed) { valid = false; break; }
    }

    if (!valid) continue;

    // Ensure no snake already at exit
    if (snakes.some(s => s.cells[0][0] === s.exitCell[0] && s.cells[0][1] === s.exitCell[1])) continue;

    return { maze, rows, cols, snakes };
  }

  return generateProceduralLevel(Math.max(1, numSnakes - 1), Math.max(0, complexity - 0.5));
}

/* ══════════════════════════════════════════════════════════════
   Movement logic
   ══════════════════════════════════════════════════════════════ */
function buildWallSet(snakes, excludeIdx) {
  const set = new Set();
  snakes.forEach((s, i) => {
    if (i === excludeIdx) return;
    s.cells.forEach(([r, c]) => set.add(`${r},${c}`));
  });
  return set;
}

function slideSnake(cells, dir, maze, rows, cols, wallSet) {
  const [dr, dc] = DIR[dir];
  let moved = false;
  let current = cells.map(([r, c]) => [r, c]);

  while (true) {
    const next = current.map(([r, c]) => [r + dr, c + dc]);
    const ownKeys = new Set(current.map(([r, c]) => `${r},${c}`));
    const blocked = next.some(([r, c]) => {
      if (r < 0 || r >= rows || c < 0 || c >= cols) return true;
      if (maze[r][c] !== 1) return true;
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

function snakeAtExit(snake) {
  return snake.cells[0][0] === snake.exitCell[0] && snake.cells[0][1] === snake.exitCell[1];
}

/* ══════════════════════════════════════════════════════════════
   Segment connection helper (for rounded pill shape)
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
  const r = '50%', s = '4px';
  if (conn.up && !conn.down) return `${s} ${s} ${r} ${r}`;
  if (conn.down && !conn.up) return `${r} ${r} ${s} ${s}`;
  if (conn.left && !conn.right) return `${s} ${r} ${r} ${s}`;
  if (conn.right && !conn.left) return `${r} ${s} ${s} ${r}`;
  return '4px';
}

function headDir(cells) {
  if (cells.length < 2) return 'up';
  const [hr, hc] = cells[0];
  const [nr, nc] = cells[1];
  if (hr < nr) return 'up';
  if (hr > nr) return 'down';
  if (hc < nc) return 'left';
  return 'right';
}

/* ══════════════════════════════════════════════════════════════
   Particle burst effect
   ══════════════════════════════════════════════════════════════ */
function ParticleBurst({ color, x, y, onDone }) {
  const particles = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const dist = 30 + Math.random() * 40;
      return {
        id: i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        size: 4 + Math.random() * 6,
        delay: Math.random() * 0.1,
      };
    }),
  []);

  useEffect(() => {
    const t = setTimeout(onDone, 800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className={styles.particleContainer} style={{ left: x, top: y }}>
      {particles.map(p => (
        <div
          key={p.id}
          className={styles.particle}
          style={{
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            '--size': `${p.size}px`,
            '--delay': `${p.delay}s`,
            background: color,
          }}
        />
      ))}
    </div>
  );
}

ParticleBurst.propTypes = {
  color: PropTypes.string.isRequired,
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  onDone: PropTypes.func.isRequired,
};

/* ══════════════════════════════════════════════════════════════
   Snake face SVG — expressive googly eyes + oscillating tongue
   ══════════════════════════════════════════════════════════════ */
function SnakeFace({ dir, color, selected }) {
  const rot = EXIT_ROT[dir] || 0;
  return (
    <svg viewBox="-20 -20 40 40" className={styles.snakeFace}>
      <g transform={`rotate(${rot})`}>
        {/* Tongue — animated fork */}
        <g className={styles.tongue}>
          <path d="M0,-10 L-2,-17 M0,-10 L2,-17" stroke="#dd2222" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </g>
        {/* Eye whites */}
        <circle cx="-5" cy="-2" r="5" fill="white" stroke="#333" strokeWidth="0.8" />
        <circle cx="5"  cy="-2" r="5" fill="white" stroke="#333" strokeWidth="0.8" />
        {/* Pupils */}
        <circle cx="-5" cy="-3" r="2.5" fill="#111" />
        <circle cx="5"  cy="-3" r="2.5" fill="#111" />
        {/* Eye shine */}
        <circle cx="-6" cy="-4" r="1.2" fill="white" opacity="0.8" />
        <circle cx="4"  cy="-4" r="1.2" fill="white" opacity="0.8" />
      </g>
    </svg>
  );
}

SnakeFace.propTypes = { dir: PropTypes.string, color: PropTypes.string, selected: PropTypes.bool };

/* ══════════════════════════════════════════════════════════════
   Difficulty config
   ══════════════════════════════════════════════════════════════ */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  timeLimitSeconds: null },
  medium: { rounds: 12, timeLimitSeconds: 300 },
  hard:   { rounds: 16, timeLimitSeconds: 200 },
};

const TIME_LIMITS = {
  easy: null,
  medium: 300,
  hard: 200,
};

/* ══════════════════════════════════════════════════════════════
   Main game component
   ══════════════════════════════════════════════════════════════ */
function SlitherEscapeGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const rounds = DIFFICULTY_CONFIG[difficulty]?.rounds ?? 8;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(null);
  const [snakes, setSnakes] = useState([]);
  const [selectedSnake, setSelectedSnake] = useState(null);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [particles, setParticles] = useState([]);
  const [justEscaped, setJustEscaped] = useState(new Set());
  const boardRef = useRef(null);
  const touchRef = useRef(null);
  const doneRef = useRef(false);
  const particleIdRef = useRef(0);

  // Generate level
  const generateCurrentLevel = useCallback((roundNum) => {
    if (roundNum < TUTORIAL_LEVELS.length) {
      return TUTORIAL_LEVELS[roundNum]();
    }
    const adjustedRound = roundNum - TUTORIAL_LEVELS.length;
    const numSnakes = Math.min(SNAKE_COLORS.length, 2 + Math.floor(adjustedRound / 2));
    const complexity = 0.5 + adjustedRound * 0.15;
    return generateProceduralLevel(numSnakes, complexity);
  }, []);

  // Init first level
  useEffect(() => {
    const lv = generateCurrentLevel(0);
    setLevel(lv);
    setSnakes(lv.snakes.map(s => ({ ...s, cells: s.cells.map(c => [...c]) })));
  }, [generateCurrentLevel]);

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
    const allDone = snakes.every(s => snakeAtExit(s));
    if (!allDone) return;

    setSolved(true);
    playSuccess();

    // Spawn particles at each exit
    if (boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const cellW = rect.width / level.cols;
      const cellH = rect.height / level.rows;
      const newParticles = snakes.map(s => {
        const [er, ec] = s.exitCell;
        return {
          id: particleIdRef.current++,
          color: SNAKE_COLORS[s.colorIdx].glow,
          x: ec * cellW + cellW / 2,
          y: er * cellH + cellH / 2,
        };
      });
      setParticles(prev => [...prev, ...newParticles]);
    }

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
      setTransitioning(true);
      setTimeout(() => {
        setRound(nextRound);
        const newLevel = generateCurrentLevel(nextRound);
        setLevel(newLevel);
        setSnakes(newLevel.snakes.map(s => ({ ...s, cells: s.cells.map(c => [...c]) })));
        setSelectedSnake(null);
        setMoves(0);
        setSolved(false);
        setJustEscaped(new Set());
        setTransitioning(false);
      }, 350);
    }, 1000);
    return () => clearTimeout(timer);
  }, [snakes, solved, score, round, rounds, level, transitioning, onComplete, reportScore, playSuccess, generateCurrentLevel]);

  // Move snake
  const moveSnake = useCallback((dir) => {
    if (solved || selectedSnake == null || doneRef.current || !level) return;
    const walls = buildWallSet(snakes, selectedSnake);
    const result = slideSnake(snakes[selectedSnake].cells, dir, level.maze, level.rows, level.cols, walls);
    if (!result) {
      playFail();
      return;
    }
    playClick();
    setMoves(m => m + 1);

    // Check if this snake just reached its exit
    const snake = snakes[selectedSnake];
    const reachedExit = result[0][0] === snake.exitCell[0] && result[0][1] === snake.exitCell[1];

    setSnakes(prev => prev.map((s, i) => i === selectedSnake ? { ...s, cells: result } : s));

    if (reachedExit) {
      setJustEscaped(prev => new Set([...prev, selectedSnake]));
      // Particle at exit
      if (boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect();
        const cellW = rect.width / level.cols;
        const cellH = rect.height / level.rows;
        const [er, ec] = snake.exitCell;
        setParticles(prev => [...prev, {
          id: particleIdRef.current++,
          color: SNAKE_COLORS[snake.colorIdx].glow,
          x: ec * cellW + cellW / 2,
          y: er * cellH + cellH / 2,
        }]);
      }
    }
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

  // Touch/swipe + drag
  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchRef.current = { x: touch.clientX, y: touch.clientY };

    // Auto-select snake under finger
    if (boardRef.current && level) {
      const rect = boardRef.current.getBoundingClientRect();
      const cellW = rect.width / level.cols;
      const cellH = rect.height / level.rows;
      const col = Math.floor((touch.clientX - rect.left) / cellW);
      const row = Math.floor((touch.clientY - rect.top) / cellH);
      const key = `${row},${col}`;
      for (let si = 0; si < snakes.length; si++) {
        if (snakes[si].cells.some(([r, c]) => `${r},${c}` === key)) {
          setSelectedSnake(si);
          break;
        }
      }
    }
  }, [level, snakes]);

  const handleTouchEnd = useCallback((e) => {
    if (!touchRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchRef.current.x;
    const dy = touch.clientY - touchRef.current.y;
    touchRef.current = null;
    if (Math.abs(dx) < 15 && Math.abs(dy) < 15) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      moveSnake(dx > 0 ? 'right' : 'left');
    } else {
      moveSnake(dy > 0 ? 'down' : 'up');
    }
  }, [moveSnake]);

  // Remove finished particles
  const removeParticle = useCallback((id) => {
    setParticles(prev => prev.filter(p => p.id !== id));
  }, []);

  if (!level) return <div className={styles.loading}>Building level…</div>;

  const { maze, rows, cols } = level;

  // Build cell lookup
  const cellMap = new Map();
  snakes.forEach((snake, si) => {
    const conns = getSegConns(snake.cells);
    snake.cells.forEach(([r, c], ci) => {
      cellMap.set(`${r},${c}`, {
        snakeIdx: si, segIdx: ci,
        isHead: ci === 0,
        isTail: ci === snake.cells.length - 1,
        conn: conns[ci],
      });
    });
  });

  const exitMap = new Map();
  snakes.forEach((s, si) => exitMap.set(`${s.exitCell[0]},${s.exitCell[1]}`, si));

  const cellSize = Math.floor(Math.min(360, window.innerWidth - 48) / Math.max(rows, cols));

  return (
    <div className={styles.wrapper}>
      {/* Parallax background layers */}
      <div className={styles.bgScene}>
        <div className={styles.bgClouds} />
        <div className={styles.bgHills} />
        <div className={styles.bgTrees} />
      </div>

      {/* HUD */}
      <div className={styles.hud}>
        <div className={styles.hudPill}>
          <span className={styles.hudLabel}>Level</span>
          <span className={styles.hudVal}>{round + 1}<small>/{rounds}</small></span>
        </div>
        <div className={styles.hudPill}>
          <span className={styles.hudLabel}>Moves</span>
          <span className={styles.hudVal}>{moves}</span>
        </div>
      </div>

      {/* Snake legend / selector */}
      <div className={styles.legend}>
        {snakes.map((s, si) => {
          const def = SNAKE_COLORS[s.colorIdx];
          const atExit = snakeAtExit(s);
          return (
            <button
              key={si}
              className={`${styles.legendBtn} ${selectedSnake === si ? styles.legendActive : ''} ${atExit ? styles.legendDone : ''}`}
              style={{ '--sc': def.body, '--sg': def.glow }}
              onClick={() => { if (!solved) { playClick(); setSelectedSnake(si); } }}
              disabled={solved}
            >
              <span className={styles.legendDot} style={{ background: def.body }} />
              {atExit && <span className={styles.legendCheck}>✓</span>}
            </button>
          );
        })}
      </div>

      {/* Board */}
      <div className={`${styles.boardWrapper} ${transitioning ? styles.boardExit : ''} ${solved ? styles.boardSolved : ''}`}>
        <div
          ref={boardRef}
          className={styles.board}
          style={{
            gridTemplateColumns: `repeat(${cols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${rows}, ${cellSize}px)`,
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          role="grid"
          aria-label="Puzzle board"
        >
          {Array.from({ length: rows }, (_, r) =>
            Array.from({ length: cols }, (_, c) => {
              const key = `${r},${c}`;
              const isPath = maze[r][c] === 1;
              const snakeCell = cellMap.get(key);
              const exitIdx = exitMap.get(key);
              const isExit = exitIdx != null;

              if (!isPath) {
                return <div key={key} className={styles.wallCell} />;
              }

              // Stone border detection
              const hasT = r > 0 && maze[r - 1][c] === 1;
              const hasB = r < rows - 1 && maze[r + 1][c] === 1;
              const hasL = c > 0 && maze[r][c - 1] === 1;
              const hasR = c < cols - 1 && maze[r][c + 1] === 1;

              const cls = [styles.pathCell];
              if (!hasT) cls.push(styles.stoneT);
              if (!hasB) cls.push(styles.stoneB);
              if (!hasL) cls.push(styles.stoneL);
              if (!hasR) cls.push(styles.stoneR);

              const snakeDef = snakeCell ? SNAKE_COLORS[snakes[snakeCell.snakeIdx].colorIdx] : null;
              const exitDef = isExit ? SNAKE_COLORS[snakes[exitIdx].colorIdx] : null;
              const exitD = isExit ? snakes[exitIdx].exitDir : null;
              const escaped = snakeCell ? justEscaped.has(snakeCell.snakeIdx) : false;

              return (
                <div
                  key={key}
                  className={cls.join(' ')}
                  onClick={() => {
                    if (solved) return;
                    if (snakeCell) { playClick(); setSelectedSnake(snakeCell.snakeIdx); }
                  }}
                  role="gridcell"
                >
                  {/* Exit chevron */}
                  {isExit && !snakeCell && (
                    <div
                      className={styles.exitMarker}
                      style={{
                        background: exitDef.exitBg,
                        transform: `rotate(${EXIT_ROT[exitD]}deg)`,
                      }}
                    >
                      <svg viewBox="0 0 24 24" width="60%" height="60%">
                        <path d="M6 15l6-6 6 6" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}

                  {/* Snake segment */}
                  {snakeCell && (
                    <div
                      className={`${styles.seg} ${snakeCell.isHead ? styles.segHead : ''} ${selectedSnake === snakeCell.snakeIdx ? styles.segSelected : ''} ${escaped ? styles.segEscaped : ''}`}
                      style={{
                        background: `linear-gradient(135deg, ${snakeDef.body} 0%, ${snakeDef.head} 100%)`,
                        borderRadius: (snakeCell.isHead || snakeCell.isTail)
                          ? endRadius(snakeCell.conn)
                          : '4px',
                        '--glow': snakeDef.glow,
                      }}
                    >
                      {/* Body shine */}
                      <div className={styles.segShine} />
                      {/* Face on head */}
                      {snakeCell.isHead && (
                        <SnakeFace
                          dir={headDir(snakes[snakeCell.snakeIdx].cells)}
                          color={snakeDef.body}
                          selected={selectedSnake === snakeCell.snakeIdx}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Particle effects */}
          {particles.map(p => (
            <ParticleBurst key={p.id} color={p.color} x={p.x} y={p.y} onDone={() => removeParticle(p.id)} />
          ))}
        </div>
      </div>

      {/* D-pad */}
      <div className={styles.dpad}>
        <button className={styles.dBtn} onClick={() => moveSnake('up')} disabled={solved || selectedSnake == null} aria-label="Move up">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>
        </button>
        <div className={styles.dRow}>
          <button className={styles.dBtn} onClick={() => moveSnake('left')} disabled={solved || selectedSnake == null} aria-label="Move left">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M14 7l-5 5 5 5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>
          </button>
          <button className={styles.dBtn} onClick={() => moveSnake('down')} disabled={solved || selectedSnake == null} aria-label="Move down">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>
          </button>
          <button className={styles.dBtn} onClick={() => moveSnake('right')} disabled={solved || selectedSnake == null} aria-label="Move right">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M10 7l5 5-5 5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" /></svg>
          </button>
        </div>
      </div>

      <p className={styles.hint}>
        {selectedSnake == null
          ? 'Tap a snake, then swipe or use arrows to slide it'
          : `Slide the ${SNAKE_COLORS[snakes[selectedSnake]?.colorIdx]?.id ?? ''} snake to its exit`}
      </p>
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
      instructions="Guide each coloured snake to its matching exit! Tap a snake to select it, then swipe or use the D-pad to slide it along the corridor. Snakes slide until they hit a wall or another snake. Move snakes out of the way in the right order to clear the path!"
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
