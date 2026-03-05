import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './Lumeno.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { cols: 5, rows: 5, numColors: 4, moves: 20 },
  medium: { cols: 6, rows: 6, numColors: 5, moves: 18 },
  hard:   { cols: 7, rows: 7, numColors: 5, moves: 15 },
};

const MIN_CHAIN = 3;

const COLORS = [
  { id: 'red',    bg: '#ef4444', lit: '#fca5a5' },
  { id: 'blue',   bg: '#3b82f6', lit: '#93c5fd' },
  { id: 'green',  bg: '#22c55e', lit: '#86efac' },
  { id: 'yellow', bg: '#eab308', lit: '#fde047' },
  { id: 'purple', bg: '#a855f7', lit: '#d8b4fe' },
];

const COLOR_MAP = Object.fromEntries(COLORS.map(c => [c.id, c]));

function rndColor(n) { return COLORS[Math.floor(Math.random() * n)].id; }

function buildGrid(rows, cols, n) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => rndColor(n))
  );
}

function isAdj(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1 && !(r1 === r2 && c1 === c2);
}

function dropAndFill(grid, cleared, rows, cols, n) {
  const next = grid.map(row => [...row]);
  cleared.forEach(({ row, col }) => { next[row][col] = null; });
  for (let c = 0; c < cols; c++) {
    const stack = [];
    for (let r = rows - 1; r >= 0; r--) {
      if (next[r][c] !== null) stack.push(next[r][c]);
    }
    while (stack.length < rows) stack.push(rndColor(n));
    for (let r = rows - 1; r >= 0; r--) {
      next[r][c] = stack[rows - 1 - r];
    }
  }
  return next;
}

/* ── Inner game component ─────────────────────────────── */
function LumenoGame({ difficulty, onComplete, reportScore, playSuccess, playFail, playPop }) {
  const cfg = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [grid,      setGrid]      = useState(() => buildGrid(cfg.rows, cfg.cols, cfg.numColors));
  const [path,      setPath]      = useState([]);   // [{row,col}]
  const [clearing,  setClearing]  = useState(null); // Set of 'r-c' keys being animated out
  const [movesLeft, setMovesLeft] = useState(cfg.moves);
  const [score,     setScore]     = useState(0);

  const dragging = useRef(false);
  const doneRef  = useRef(false);
  const gridRef  = useRef(null);

  function pathHas(r, c) { return path.some(p => p.row === r && p.col === c); }

  function startPath(r, c) {
    if (movesLeft <= 0 || doneRef.current) return;
    dragging.current = true;
    setPath([{ row: r, col: c }]);
  }

  function extendPath(r, c) {
    if (!dragging.current) return;
    // Backtrack if we revisit a cell already in path
    const idx = path.findIndex(p => p.row === r && p.col === c);
    if (idx !== -1) {
      setPath(prev => prev.slice(0, idx + 1));
      return;
    }
    const last = path[path.length - 1];
    if (!last) return;
    if (!isAdj(last.row, last.col, r, c)) return;
    if (grid[r]?.[c] !== grid[last.row]?.[last.col]) return;
    setPath(prev => [...prev, { row: r, col: c }]);
  }

  function commitPath() {
    if (!dragging.current) return;
    dragging.current = false;

    if (path.length < MIN_CHAIN) {
      if (path.length > 0) playFail();
      setPath([]);
      return;
    }

    const len       = path.length;
    const points    = len * len;
    const newScore  = score + points;
    const newMoves  = movesLeft - 1;

    playSuccess();
    setClearing(new Set(path.map(p => `${p.row}-${p.col}`)));
    setPath([]);

    setTimeout(() => {
      setGrid(prev => dropAndFill(prev, path, cfg.rows, cfg.cols, cfg.numColors));
      setClearing(null);
      setScore(newScore);
      reportScore(newScore);
      setMovesLeft(newMoves);

      if (newMoves <= 0 && !doneRef.current) {
        doneRef.current = true;
        setTimeout(() => {
          onComplete({ finalScore: newScore, maxScore: cfg.moves * 16, completed: true });
        }, 200);
      }
    }, 320);
  }

  // Pointer-event helpers — resolve row/col from pointer position over grid
  function cellFromPointer(e) {
    const el = gridRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cellW = rect.width  / cfg.cols;
    const cellH = rect.height / cfg.rows;
    const col = Math.floor(x / cellW);
    const row = Math.floor(y / cellH);
    if (row < 0 || row >= cfg.rows || col < 0 || col >= cfg.cols) return null;
    return { row, col };
  }

  function handlePointerMove(e) {
    if (!dragging.current) return;
    const cell = cellFromPointer(e);
    if (cell) extendPath(cell.row, cell.col);
  }

  const pathColor = path.length > 0
    ? COLOR_MAP[grid[path[0].row]?.[path[0].col]]
    : null;

  return (
    <div
      className={styles.wrap}
      onPointerUp={commitPath}
      onPointerMove={handlePointerMove}
      onPointerLeave={commitPath}
      style={{ touchAction: 'none', userSelect: 'none' }}
    >
      {/* HUD row */}
      <div className={styles.hud}>
        <div className={styles.hudItem}>
          <span className={styles.hudLabel}>Moves</span>
          <span className={`${styles.hudVal} ${movesLeft <= 5 ? styles.hudUrgent : ''}`}>
            {movesLeft}
          </span>
        </div>

        <div className={styles.chainPill} style={{ opacity: path.length > 0 ? 1 : 0 }}>
          <span style={{ color: pathColor?.bg ?? 'inherit' }}>
            {path.length >= MIN_CHAIN
              ? `${path.length} orbs · +${path.length * path.length} pts`
              : `${path.length} / ${MIN_CHAIN} min`}
          </span>
        </div>

        <div className={styles.hudItem}>
          <span className={styles.hudLabel}>Score</span>
          <span className={styles.hudVal}>{score}</span>
        </div>
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        className={styles.grid}
        style={{ '--cols': cfg.cols, '--rows': cfg.rows }}
      >
        {grid.map((row, r) =>
          row.map((colorId, c) => {
            const color   = COLOR_MAP[colorId] ?? COLORS[0];
            const inPath  = pathHas(r, c);
            const isHead  = inPath && path[path.length - 1]?.row === r && path[path.length - 1]?.col === c;
            const isOut   = clearing?.has(`${r}-${c}`);
            return (
              <div
                key={`${r}-${c}`}
                className={[
                  styles.orb,
                  inPath  ? styles.orbActive : '',
                  isHead  ? styles.orbHead   : '',
                  isOut   ? styles.orbOut    : '',
                ].join(' ')}
                style={{ '--c': color.bg, '--cl': color.lit }}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  startPath(r, c);
                }}
              />
            );
          })
        )}
      </div>

      <p className={styles.hint}>Connect {MIN_CHAIN}+ same-colour orbs in any direction</p>
    </div>
  );
}

LumenoGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playPop:     PropTypes.func.isRequired,
};

/* ── Public export ───────────────────────────────────── */
export function Lumeno({ memberId, difficulty = 'easy', callbackUrl, onComplete, onBack }) {
  const { fireComplete } = useGameCallback({ memberId, gameId: 'lumeno', callbackUrl, onComplete });
  const cfg = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  return (
    <GameShell
      gameId="lumeno"
      title="Lumeno"
      instructions="Drag through 3 or more orbs of the same colour to clear them. You can connect in any direction, including diagonally. The longer the chain, the more points you score. You have a limited number of moves — use them wisely!"
      difficulty={difficulty}
      timeLimitSeconds={null}
      onGameComplete={fireComplete}
      onBack={onBack}
    >
      {(props) => (
        <LumenoGame
          key={difficulty}
          difficulty={difficulty}
          {...props}
          onComplete={(r) => props.onComplete({ ...r, maxScore: cfg.moves * 16 })}
        />
      )}
    </GameShell>
  );
}

Lumeno.propTypes = {
  memberId:    PropTypes.string.isRequired,
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']),
  callbackUrl: PropTypes.string,
  onComplete:  PropTypes.func,
  onBack:      PropTypes.func,
};
