import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './PipePuzzle.module.css';

// ── Directions: N=0, E=1, S=2, W=3 ───────────────────────────────
const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];

function dirTo(r1, c1, r2, c2) {
  for (let d = 0; d < 4; d++) {
    if (DR[d] === r2 - r1 && DC[d] === c2 - c1) return d;
  }
  return -1;
}

// ── Pipe shapes ───────────────────────────────────────────────────
// Base openings when rotation = 0
const SHAPE_OPENINGS = {
  end:      [0],       // N only
  straight: [0, 2],   // N + S
  corner:   [0, 1],   // N + E
  tee:      [0, 1, 2],// N + E + S
  cross:    [0, 1, 2, 3],
};

function getOpenings(shape, rotation) {
  return (SHAPE_OPENINGS[shape] ?? []).map(d => (d + rotation) % 4);
}

function getShape(openDirs) {
  const n = openDirs.length;
  if (n === 1) return 'end';
  if (n === 4) return 'cross';
  if (n === 3) return 'tee';
  const [a, b] = openDirs;
  return (Math.abs(a - b) === 2 || Math.abs(a - b) === 2) ? 'straight' : 'corner';
}

// Brute-force: find rotation r so getOpenings(shape, r) matches openDirs
function getSolvedRotation(shape, openDirs) {
  const target = [...openDirs].sort((a, b) => a - b);
  for (let r = 0; r < 4; r++) {
    const o = getOpenings(shape, r).sort((a, b) => a - b);
    if (o.length === target.length && o.every((v, i) => v === target[i])) return r;
  }
  return 0;
}

// ── Colors ────────────────────────────────────────────────────────
const PIPE_COLORS = [
  { id: 'yellow', pipe: '#F5A623', dark: '#C07D10' },
  { id: 'salmon', pipe: '#E8825A', dark: '#B8522A' },
  { id: 'blue',   pipe: '#4A9DD9', dark: '#2A6DA0' },
  { id: 'green',  pipe: '#5BAD6F', dark: '#357A45' },
];

function colorOf(id) {
  return PIPE_COLORS.find(c => c.id === id) ?? { pipe: '#9BA8B5', dark: '#6B7A88' };
}

// ── Difficulty ────────────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
  easy:   { rows: 4, cols: 4, numColors: 2, timeLimitSeconds: null },
  medium: { rows: 5, cols: 5, numColors: 3, timeLimitSeconds: 240 },
  hard:   { rows: 6, cols: 6, numColors: 4, timeLimitSeconds: 150 },
};

// ── Utility ───────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Puzzle generator ──────────────────────────────────────────────
function randomPath(sr, sc, er, ec, rows, cols, occupied) {
  const path = [[sr, sc]];
  const inPath = new Set([`${sr},${sc}`]);

  function dfs(r, c) {
    if (r === er && c === ec) return true;
    for (const d of shuffle([0, 1, 2, 3])) {
      const nr = r + DR[d];
      const nc = c + DC[d];
      const key = `${nr},${nc}`;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (inPath.has(key) || occupied.has(key)) continue;
      path.push([nr, nc]);
      inPath.add(key);
      if (dfs(nr, nc)) return true;
      path.pop();
      inPath.delete(key);
    }
    return false;
  }

  return dfs(sr, sc) ? path : null;
}

function generatePuzzle(rows, cols, numColors) {
  const occupied = new Set();
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  const colorPairs = [];

  for (let ci = 0; ci < numColors; ci++) {
    const colorId = PIPE_COLORS[ci].id;
    let placed = false;

    for (let attempt = 0; attempt < 30 && !placed; attempt++) {
      // Build list of free cells, prefer corners/edges for endpoints
      const free = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (!occupied.has(`${r},${c}`)) free.push([r, c]);

      if (free.length < 2) break;

      const sfree = shuffle(free);
      const [sr, sc] = sfree[0];

      // Pick an end point that is at least half the grid away (Manhattan)
      // Prefer far endpoints but fall back to any cell if none qualify
      const minDist = Math.max(2, Math.floor((rows + cols) / 3));
      const farCells = sfree.slice(1).filter(
        ([r, c]) => Math.abs(r - sr) + Math.abs(c - sc) >= minDist
      );
      const candidates = farCells.length ? farCells : sfree.slice(1);
      if (!candidates.length) continue;

      const [er, ec] = candidates[Math.floor(Math.random() * candidates.length)];

      // Block the start cell so the path can't loop back through it.
      // Do NOT block the end cell yet — the DFS must be able to reach it.
      occupied.add(`${sr},${sc}`);

      const path = randomPath(sr, sc, er, ec, rows, cols, occupied);
      if (!path) {
        occupied.delete(`${sr},${sc}`);
        continue;
      }

      // Mark all path cells (including the end endpoint) as occupied
      occupied.add(`${er},${ec}`);
      for (let i = 1; i < path.length - 1; i++) {
        occupied.add(`${path[i][0]},${path[i][1]}`);
      }

      // Assign shapes to cells along the path
      for (let i = 0; i < path.length; i++) {
        const [r, c] = path[i];
        const openDirs = [];
        if (i > 0)                openDirs.push(dirTo(r, c, path[i - 1][0], path[i - 1][1]));
        if (i < path.length - 1) openDirs.push(dirTo(r, c, path[i + 1][0], path[i + 1][1]));
        const shape = getShape(openDirs);
        const solvedRotation = getSolvedRotation(shape, openDirs);
        grid[r][c] = {
          shape,
          solvedRotation,
          currentRotation: solvedRotation,
          colorId,
          isEndpoint: i === 0 || i === path.length - 1,
        };
      }

      colorPairs.push({ colorId, endpoints: [[sr, sc], [er, ec]] });
      placed = true;
    }
  }

  return { grid, colorPairs };
}

function scramblePuzzle(grid) {
  return grid.map(row =>
    row.map(cell => {
      if (!cell || cell.isEndpoint) return cell;
      // Pick a random rotation that is NOT the solved one (guarantee at least one move needed)
      let r;
      do { r = Math.floor(Math.random() * 4); } while (r === cell.solvedRotation);
      return { ...cell, currentRotation: r };
    })
  );
}

// ── Connectivity ──────────────────────────────────────────────────
function computeConnected(grid, rows, cols) {
  // BFS from each endpoint; returns Map<"r,c", colorId> for reachable cells
  const result = new Map();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (!cell?.isEndpoint) continue;

      const queue = [[r, c]];
      const seen = new Set([`${r},${c}`]);

      while (queue.length) {
        const [cr, cc] = queue.shift();
        const curr = grid[cr][cc];
        if (!curr) continue;

        const key = `${cr},${cc}`;
        // First color to claim a cell wins (skip if already claimed by another)
        if (!result.has(key)) result.set(key, cell.colorId);
        else if (result.get(key) !== cell.colorId) continue; // conflict, stop

        for (const d of getOpenings(curr.shape, curr.currentRotation)) {
          const nr = cr + DR[d];
          const nc = cc + DC[d];
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          const nb = grid[nr][nc];
          if (!nb) continue;
          if (!getOpenings(nb.shape, nb.currentRotation).includes((d + 2) % 4)) continue;
          const nk = `${nr},${nc}`;
          if (!seen.has(nk)) { seen.add(nk); queue.push([nr, nc]); }
        }
      }
    }
  }
  return result;
}

function isConnected(grid, r1, c1, r2, c2, rows, cols) {
  const visited = new Set([`${r1},${c1}`]);
  const queue = [[r1, c1]];
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === r2 && c === c2) return true;
    const cell = grid[r][c];
    if (!cell) continue;
    for (const d of getOpenings(cell.shape, cell.currentRotation)) {
      const nr = r + DR[d];
      const nc = c + DC[d];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nb = grid[nr][nc];
      if (!nb) continue;
      if (!getOpenings(nb.shape, nb.currentRotation).includes((d + 2) % 4)) continue;
      const k = `${nr},${nc}`;
      if (!visited.has(k)) { visited.add(k); queue.push([nr, nc]); }
    }
  }
  return false;
}

function checkWin(grid, colorPairs, rows, cols) {
  return colorPairs.every(({ endpoints: [[r1, c1], [r2, c2]] }) =>
    isConnected(grid, r1, c1, r2, c2, rows, cols)
  );
}

// ── SVG Tile renderer ─────────────────────────────────────────────
// All coordinates inside a 60×60 viewBox
const VB = 60;
const HALF = 30;
const PIPE_W = 13;   // stroke-width
const BULB_R = 11;   // endpoint circle radius
const BULB_GLOW = 16;// outer glow circle

function TileSVG({ cell, connectedColor }) {
  if (!cell || cell.shape === 'empty') return null;

  const opens = getOpenings(cell.shape, cell.currentRotation);
  const hasN = opens.includes(0);
  const hasE = opens.includes(1);
  const hasS = opens.includes(2);
  const hasW = opens.includes(3);

  const info = colorOf(cell.colorId);
  const pipe = connectedColor ? info.pipe : '#9BA8B5';

  // Corner = exactly 2 adjacent sides open
  const adjPairs = [
    [0, 1, hasN && hasE],
    [1, 2, hasE && hasS],
    [2, 3, hasS && hasW],
    [3, 0, hasW && hasN],
  ];
  const cornerMatch = opens.length === 2 ? adjPairs.find(([,, hit]) => hit) : null;

  // Build pipe paths
  let pathD = '';
  if (cornerMatch) {
    // Quadratic Bezier bending into the corner
    // Control point is at the tile corner in that direction
    if (hasN && hasE) pathD = `M${HALF},0 Q${VB},0 ${VB},${HALF}`;
    else if (hasE && hasS) pathD = `M${VB},${HALF} Q${VB},${VB} ${HALF},${VB}`;
    else if (hasS && hasW) pathD = `M${HALF},${VB} Q0,${VB} 0,${HALF}`;
    else if (hasW && hasN) pathD = `M0,${HALF} Q0,0 ${HALF},0`;
  } else {
    const segs = [];
    if (hasN) segs.push(`M${HALF},0 L${HALF},${HALF}`);
    if (hasE) segs.push(`M${VB},${HALF} L${HALF},${HALF}`);
    if (hasS) segs.push(`M${HALF},${VB} L${HALF},${HALF}`);
    if (hasW) segs.push(`M0,${HALF} L${HALF},${HALF}`);
    pathD = segs.join(' ');
  }

  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}>
      {/* Pipe */}
      <path
        d={pathD}
        stroke={pipe}
        strokeWidth={PIPE_W}
        strokeLinecap="round"
        fill="none"
      />

      {/* Endpoint bulb */}
      {cell.isEndpoint && (
        <>
          <circle cx={HALF} cy={HALF} r={BULB_GLOW} fill={pipe} opacity={0.18} />
          <circle cx={HALF} cy={HALF} r={BULB_R}    fill={pipe} />
          {/* Shine */}
          <circle cx={HALF - 3} cy={HALF - 4} r={3.5} fill="white" opacity={0.55} />
        </>
      )}
    </svg>
  );
}

TileSVG.propTypes = {
  cell:           PropTypes.object,
  connectedColor: PropTypes.string,
};

// ── Inner game ────────────────────────────────────────────────────
function PipeGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [puzzle,   setPuzzle]   = useState(null);  // { grid, colorPairs }
  const [connected, setConnected] = useState(new Map());
  const [won,      setWon]      = useState(false);
  const [animKey,  setAnimKey]  = useState(null); // tracks which tile was just tapped
  const doneRef = useRef(false);

  // ── Generate puzzle on mount ──────────────────────────────────
  useEffect(() => {
    let result;
    // Retry until we get all requested colors placed
    for (let i = 0; i < 15; i++) {
      result = generatePuzzle(config.rows, config.cols, config.numColors);
      if (result.colorPairs.length === config.numColors) break;
    }
    const scrambled = scramblePuzzle(result.grid);
    const initialPuzzle = { grid: scrambled, colorPairs: result.colorPairs };
    setPuzzle(initialPuzzle);
    setConnected(computeConnected(scrambled, config.rows, config.cols));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Time up ───────────────────────────────────────────────────
  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: 0, maxScore: 1, completed: false });
    }
  }, [secondsLeft, onComplete]);

  // ── Tap a tile to rotate it ───────────────────────────────────
  const rotateTile = useCallback((r, c) => {
    if (doneRef.current || !puzzle) return;
    const cell = puzzle.grid[r][c];
    if (!cell || cell.isEndpoint) return;

    playClick();
    setAnimKey(`${r},${c}`);
    setTimeout(() => setAnimKey(null), 160);

    setPuzzle(prev => {
      const newGrid = prev.grid.map((row, ri) =>
        row.map((cell, ci) => {
          if (ri !== r || ci !== c) return cell;
          return { ...cell, currentRotation: (cell.currentRotation + 1) % 4 };
        })
      );
      const newConnected = computeConnected(newGrid, config.rows, config.cols);
      setConnected(newConnected);

      if (!doneRef.current && checkWin(newGrid, prev.colorPairs, config.rows, config.cols)) {
        doneRef.current = true;
        setWon(true);
        playSuccess();
        reportScore(1);
        // Delay slightly so the win flash is visible before shell takes over
        setTimeout(() => onComplete({ finalScore: 1, maxScore: 1, completed: true }), 600);
      }

      return { ...prev, grid: newGrid };
    });
  }, [puzzle, config.rows, config.cols, onComplete, reportScore, playClick, playSuccess]);

  if (!puzzle) {
    return <div className={styles.loading}>Building puzzle…</div>;
  }

  const { grid, colorPairs } = puzzle;

  return (
    <div className={styles.wrapper}>
      {/* Color legend */}
      <div className={styles.legend}>
        {colorPairs.map(({ colorId }) => {
          const info = colorOf(colorId);
          const done = (() => {
            const [[r1,c1],[r2,c2]] = colorPairs.find(p => p.colorId === colorId).endpoints;
            return isConnected(grid, r1, c1, r2, c2, config.rows, config.cols);
          })();
          return (
            <span
              key={colorId}
              className={`${styles.legendDot} ${done ? styles.legendDone : ''}`}
              style={{ background: info.pipe }}
              aria-label={`${colorId} ${done ? 'connected' : 'not connected'}`}
            />
          );
        })}
      </div>

      {/* The grid */}
      <div
        className={`${styles.grid} ${won ? styles.gridWon : ''}`}
        style={{
          gridTemplateColumns: `repeat(${config.cols}, 1fr)`,
          gridTemplateRows:    `repeat(${config.rows}, 1fr)`,
          // Explicit height so rows have a definite size for SVG height:100% to resolve
          height: `min(360px, calc(100vw - 40px))`,
        }}
        role="grid"
        aria-label="Pipe puzzle grid"
      >
        {grid.map((row, r) =>
          row.map((cell, c) => {
            const key = `${r},${c}`;
            const connectedColor = connected.get(key) ?? null;
            const isAnim = animKey === key;
            return (
              <div
                key={key}
                role="gridcell"
                className={`${styles.tile}
                  ${cell ? styles.tilePipe : styles.tileEmpty}
                  ${cell?.isEndpoint ? styles.tileEndpoint : ''}
                  ${isAnim ? styles.tileRotate : ''}
                  ${won && connectedColor ? styles.tileWon : ''}`}
                onClick={() => rotateTile(r, c)}
                aria-label={
                  cell
                    ? `${cell.colorId} ${cell.shape} tile, row ${r + 1} col ${c + 1}`
                    : `Empty tile row ${r + 1} col ${c + 1}`
                }
              >
                <TileSVG cell={cell} connectedColor={connectedColor} />
              </div>
            );
          })
        )}
      </div>

      <p className={styles.hint}>Tap tiles to rotate • connect all coloured dots</p>
    </div>
  );
}

PipeGame.propTypes = {
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']).isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
};

// ── Outer wrapper ─────────────────────────────────────────────────
export function PipePuzzle({
  memberId,
  difficulty = 'easy',
  onComplete,
  callbackUrl,
  onBack,
  musicMuted,
  onToggleMusic,
}) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { fireComplete: fireCallback } = useGameCallback({
    memberId,
    gameId: 'pipe-puzzle',
    callbackUrl,
    onComplete,
  });

  const instructions = (
    <>
      <p>Rotate the tiles to connect the same-coloured dots with an unbroken pipe!</p>
      <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
        <li><strong>Tap</strong> any tile to rotate it 90°</li>
        <li>Connected pipes light up in their colour</li>
        <li>All {config.numColors} pairs must be connected to win</li>
      </ul>
      <p style={{ marginTop: 8 }}>
        Grid: {config.rows}×{config.cols}
        {config.timeLimitSeconds ? ` · ${config.timeLimitSeconds}s time limit` : ' · No time limit'}
      </p>
    </>
  );

  return (
    <GameShell
      gameId="pipe-puzzle"
      title="Pipe Puzzle"
      instructions={instructions}
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore, secondsLeft, playClick, playSuccess }) => (
        <PipeGame
          difficulty={difficulty}
          onComplete={shellComplete}
          reportScore={reportScore}
          secondsLeft={secondsLeft}
          playClick={playClick}
          playSuccess={playSuccess}
        />
      )}
    </GameShell>
  );
}

PipePuzzle.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
