import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './PipePuzzle.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * PipePuzzle — turn pipe tiles so each pair of numbered dots is joined.
 *
 * Tuned for seniors:
 * - No clock. Turning a tile is always reversible, so a puzzle can never
 *   get stuck; Undo and Start again are free.
 * - Hint turns one wrong tile into place and highlights it.
 * - 3 stars per puzzle with no hints, 2 with one hint, 1 with more.
 * - Each dot carries a number and a distinct colour, so colour is never
 *   the only cue.
 */

// ── Directions: N=0, E=1, S=2, W=3 ───────────────────────────────
const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];

function dirTo(r1, c1, r2, c2) {
  for (let d = 0; d < 4; d++) {
    if (DR[d] === r2 - r1 && DC[d] === c2 - c1) return d;
  }
  return -1;
}

const SHAPE_OPENINGS = {
  end:      [0],
  straight: [0, 2],
  corner:   [0, 1],
  tee:      [0, 1, 2],
  cross:    [0, 1, 2, 3],
};

export function getOpenings(shape, rotation) {
  return (SHAPE_OPENINGS[shape] ?? []).map(d => (d + rotation) % 4);
}

function openKey(shape, rotation) {
  return getOpenings(shape, rotation).sort((a, b) => a - b).join('');
}

function getShape(openDirs) {
  if (openDirs.length === 1) return 'end';
  return Math.abs(openDirs[0] - openDirs[1]) === 2 ? 'straight' : 'corner';
}

function getSolvedRotation(shape, openDirs) {
  const target = [...openDirs].sort((a, b) => a - b).join('');
  for (let r = 0; r < 4; r++) if (openKey(shape, r) === target) return r;
  return 0;
}

/** True when a tile's openings already match its solution (straights have two good rotations). */
export function isTileRight(cell) {
  return openKey(cell.shape, cell.currentRotation) === openKey(cell.shape, cell.solvedRotation);
}

// High-contrast colours on a light tile, each paired with a number.
const PIPE_COLORS = [
  { id: 'blue',   pipe: '#1D4ED8' },
  { id: 'orange', pipe: '#C2410C' },
  { id: 'purple', pipe: '#7E22CE' },
  { id: 'teal',   pipe: '#0F766E' },
];
const IDLE_PIPE = '#64748B';

function colorIndex(id) {
  return Math.max(0, PIPE_COLORS.findIndex(c => c.id === id));
}

// ── Difficulty ────────────────────────────────────────────────────
export const DIFFICULTY_CONFIG = {
  easy:   { rows: 4, cols: 4, numColors: 2, rounds: 3 },
  medium: { rows: 5, cols: 5, numColors: 3, rounds: 4 },
  hard:   { rows: 6, cols: 6, numColors: 4, rounds: 5 },
};
const STARS_MAX = 3;

export function starsFor(hints) {
  if (hints === 0) return 3;
  if (hints === 1) return 2;
  return 1;
}

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
  let budget = 4000; // keep the search bounded on crowded boards

  function dfs(r, c) {
    if (r === er && c === ec) return true;
    if (--budget <= 0) return false;
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
    for (let attempt = 0; attempt < 30; attempt++) {
      const free = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (!occupied.has(`${r},${c}`)) free.push([r, c]);
      if (free.length < 2) break;

      const sfree = shuffle(free);
      const [sr, sc] = sfree[0];
      const minDist = Math.max(2, Math.floor((rows + cols) / 3));
      const far = sfree.slice(1).filter(([r, c]) => Math.abs(r - sr) + Math.abs(c - sc) >= minDist);
      if (!far.length) continue;
      const [er, ec] = far[Math.floor(Math.random() * far.length)];

      occupied.add(`${sr},${sc}`);
      const path = randomPath(sr, sc, er, ec, rows, cols, occupied);
      if (!path) { occupied.delete(`${sr},${sc}`); continue; }
      for (const [r, c] of path) occupied.add(`${r},${c}`);

      for (let i = 0; i < path.length; i++) {
        const [r, c] = path[i];
        const openDirs = [];
        if (i > 0) openDirs.push(dirTo(r, c, path[i - 1][0], path[i - 1][1]));
        if (i < path.length - 1) openDirs.push(dirTo(r, c, path[i + 1][0], path[i + 1][1]));
        const shape = getShape(openDirs);
        const solvedRotation = getSolvedRotation(shape, openDirs);
        grid[r][c] = { shape, solvedRotation, currentRotation: solvedRotation, colorId, isEndpoint: i === 0 || i === path.length - 1 };
      }
      colorPairs.push({ colorId, endpoints: [[sr, sc], [er, ec]] });
      break;
    }
  }
  return { grid, colorPairs };
}

function scrambleGrid(grid) {
  return grid.map(row => row.map(cell => {
    if (!cell || cell.isEndpoint) return cell;
    // Always start in a wrong-looking position (straights have two right ones).
    const wrong = [0, 1, 2, 3].filter(r => openKey(cell.shape, r) !== openKey(cell.shape, cell.solvedRotation));
    return { ...cell, currentRotation: wrong[Math.floor(Math.random() * wrong.length)] };
  }));
}

/** Always returns a solvable puzzle (the generated layout is the solution) that isn't already solved. */
export function buildPuzzle(rows, cols, numColors) {
  let best = null;
  for (let i = 0; i < 300; i++) {
    const p = generatePuzzle(rows, cols, numColors);
    if (!best || p.colorPairs.length > best.colorPairs.length) best = p;
    if (best.colorPairs.length === numColors) break;
  }
  let grid = scrambleGrid(best.grid);
  for (let i = 0; i < 10 && checkWin(grid, best.colorPairs, rows, cols); i++) grid = scrambleGrid(best.grid);
  return { grid, colorPairs: best.colorPairs, initial: grid };
}

// ── Connectivity ──────────────────────────────────────────────────
function neighbours(grid, r, c, rows, cols) {
  const cell = grid[r][c];
  const out = [];
  for (const d of getOpenings(cell.shape, cell.currentRotation)) {
    const nr = r + DR[d];
    const nc = c + DC[d];
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
    const nb = grid[nr][nc];
    if (!nb || !getOpenings(nb.shape, nb.currentRotation).includes((d + 2) % 4)) continue;
    out.push([nr, nc]);
  }
  return out;
}

function reach(grid, r, c, rows, cols) {
  const seen = new Set([`${r},${c}`]);
  const queue = [[r, c]];
  while (queue.length) {
    const [cr, cc] = queue.shift();
    for (const [nr, nc] of neighbours(grid, cr, cc, rows, cols)) {
      const k = `${nr},${nc}`;
      if (!seen.has(k)) { seen.add(k); queue.push([nr, nc]); }
    }
  }
  return seen;
}

export function isPairJoined(grid, pair, rows, cols) {
  const [[r1, c1], [r2, c2]] = pair.endpoints;
  return reach(grid, r1, c1, rows, cols).has(`${r2},${c2}`);
}

export function checkWin(grid, colorPairs, rows, cols) {
  return colorPairs.every(p => isPairJoined(grid, p, rows, cols));
}

/** Map "r,c" → colourId for every tile flowing from a dot, so joined-up pipe lights up. */
function computeLit(grid, colorPairs, rows, cols) {
  const lit = new Map();
  for (const p of colorPairs) {
    for (const [r, c] of p.endpoints) {
      for (const k of reach(grid, r, c, rows, cols)) if (!lit.has(k)) lit.set(k, p.colorId);
    }
  }
  return lit;
}

/** The next tile a hint should fix: a wrong tile, preferring pairs not yet joined. */
export function findHintTile(grid, colorPairs, rows, cols) {
  const open = new Set(colorPairs.filter(p => !isPairJoined(grid, p, rows, cols)).map(p => p.colorId));
  let fallback = null;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (!cell || cell.isEndpoint || isTileRight(cell)) continue;
      if (open.has(cell.colorId)) return [r, c];
      if (!fallback) fallback = [r, c];
    }
  }
  return fallback;
}

// ── SVG Tile renderer ─────────────────────────────────────────────
const VB = 60;
const HALF = 30;

function TileSVG({ cell, litColor }) {
  const opens = getOpenings(cell.shape, cell.currentRotation);
  const has = d => opens.includes(d);
  const pipe = litColor ? PIPE_COLORS[colorIndex(litColor)].pipe : IDLE_PIPE;
  const dotColor = PIPE_COLORS[colorIndex(cell.colorId)].pipe;

  let pathD;
  if (opens.length === 2 && !(has(0) && has(2)) && !(has(1) && has(3))) {
    if (has(0) && has(1)) pathD = `M${HALF},0 A${HALF},${HALF} 0 0,0 ${VB},${HALF}`;
    else if (has(1) && has(2)) pathD = `M${VB},${HALF} A${HALF},${HALF} 0 0,0 ${HALF},${VB}`;
    else if (has(2) && has(3)) pathD = `M${HALF},${VB} A${HALF},${HALF} 0 0,0 0,${HALF}`;
    else pathD = `M0,${HALF} A${HALF},${HALF} 0 0,0 ${HALF},0`;
  } else {
    const ends = [[HALF, 0], [VB, HALF], [HALF, VB], [0, HALF]];
    pathD = opens.map(d => `M${ends[d][0]},${ends[d][1]} L${HALF},${HALF}`).join(' ');
  }

  return (
    <svg viewBox={`0 0 ${VB} ${VB}`} className={styles.tileSvg} aria-hidden="true">
      <path d={pathD} stroke={pipe} strokeWidth={14} strokeLinecap="round" fill="none" />
      {cell.isEndpoint && (
        <>
          <circle cx={HALF} cy={HALF} r={19} fill={dotColor} stroke="#fff" strokeWidth={3} />
          <text x={HALF} y={HALF + 1} textAnchor="middle" dominantBaseline="central" fontSize="24" fontWeight="800" fill="#fff">
            {colorIndex(cell.colorId) + 1}
          </text>
        </>
      )}
    </svg>
  );
}

TileSVG.propTypes = { cell: PropTypes.object.isRequired, litColor: PropTypes.string };

function rotateAt(grid, r, c, rotation) {
  return grid.map((row, ri) => row.map((cl, ci) => (ri === r && ci === c ? { ...cl, currentRotation: rotation(cl) } : cl)));
}

// ── Inner game ────────────────────────────────────────────────────
function PipeGame({ difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playReveal }) {
  const t = useTranslation();
  const tp = t.games['pipe-puzzle'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { rows, cols, numColors, rounds } = config;

  const [round, setRound]     = useState(0);
  const [puzzle, setPuzzle]   = useState(() => buildPuzzle(rows, cols, numColors));
  const [grid, setGrid]       = useState(() => puzzle.grid);
  const [history, setHistory] = useState([]);
  const [hints, setHints]     = useState(0);
  const [score, setScore]     = useState(0);
  const [won, setWon]         = useState(false);
  const [spin, setSpin]       = useState(null);
  const [hintAt, setHintAt]   = useState(null);
  const [banner, setBanner]   = useState(null);

  const scoreRef  = useRef(0);
  const doneRef   = useRef(false);
  const started   = useRef(-1);
  const timersRef = useRef(new Set());

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
    return h;
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  useEffect(() => {
    if (started.current === round) return;
    started.current = round;
    reportRound?.(round + 1, rounds);
  }, [round, rounds, reportRound]);

  const finishPuzzle = useCallback((usedHints) => {
    const stars = starsFor(usedHints);
    scoreRef.current += stars;
    setScore(scoreRef.current);
    reportScore(scoreRef.current);
    setWon(true);
    setBanner({ stars });
    playSuccess();
    later(() => {
      if (doneRef.current) return;
      const next = round + 1;
      if (next >= rounds) {
        doneRef.current = true;
        onComplete({ finalScore: scoreRef.current, maxScore: rounds * STARS_MAX, completed: true });
        return;
      }
      const np = buildPuzzle(rows, cols, numColors);
      setRound(next);
      setPuzzle(np);
      setGrid(np.grid);
      setHistory([]);
      setHints(0);
      setWon(false);
      setBanner(null);
      setHintAt(null);
    }, 1800);
  }, [round, rounds, rows, cols, numColors, later, onComplete, reportScore, playSuccess]);

  const applyGrid = useCallback((newGrid, usedHints) => {
    setHistory(h => [...h, grid]);
    setGrid(newGrid);
    if (checkWin(newGrid, puzzle.colorPairs, rows, cols)) finishPuzzle(usedHints);
  }, [grid, puzzle, rows, cols, finishPuzzle]);

  const rotateTile = useCallback((r, c) => {
    if (won || doneRef.current) return;
    const cell = grid[r][c];
    if (!cell || cell.isEndpoint) return;
    playClick();
    setSpin(`${r},${c}`);
    later(() => setSpin(null), 200);
    applyGrid(rotateAt(grid, r, c, cl => (cl.currentRotation + 1) % 4), hints);
  }, [won, grid, hints, later, applyGrid, playClick]);

  const giveHint = useCallback(() => {
    if (won || doneRef.current) return;
    const at = findHintTile(grid, puzzle.colorPairs, rows, cols);
    if (!at) return;
    const [r, c] = at;
    const used = hints + 1;
    setHints(used);
    playReveal?.();
    setHintAt(`${r},${c}`);
    later(() => setHintAt(x => (x === `${r},${c}` ? null : x)), 1600);
    applyGrid(rotateAt(grid, r, c, cl => cl.solvedRotation), used);
  }, [won, grid, puzzle, rows, cols, hints, later, applyGrid, playReveal]);

  const undo = useCallback(() => {
    if (won || !history.length) return;
    playClick();
    setGrid(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
  }, [won, history, playClick]);

  const reset = useCallback(() => {
    if (won || !history.length) return;
    playClick();
    setHistory(h => [...h, grid]);
    setGrid(puzzle.initial);
  }, [won, history, grid, puzzle, playClick]);

  const lit = computeLit(grid, puzzle.colorPairs, rows, cols);
  const joined = puzzle.colorPairs.map(p => isPairJoined(grid, p, rows, cols));
  const joinedCount = joined.filter(Boolean).length;
  const fill = (s, vars) => Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, v), s);

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <span className={styles.roundLabel}>{fill(tp.puzzleShort, { n: round + 1, total: rounds })}</span>
        <div className={styles.infoBadge} aria-label={`${score} / ${rounds * STARS_MAX} ★`}>
          <span key={score} className={styles.infoBadgeNum} aria-hidden="true">{score}</span>
          <span className={styles.infoBadgeSub} aria-hidden="true">★</span>
        </div>
      </div>

      <div className={styles.legend} aria-live="polite">
        {puzzle.colorPairs.map((p, i) => {
          const ci = colorIndex(p.colorId);
          return (
            <span
              key={p.colorId}
              className={`${styles.legendChip} ${joined[i] ? styles.legendDone : ''}`}
              aria-label={`${ci + 1}: ${joined[i] ? tp.joined : tp.notJoined}`}
            >
              <span className={styles.legendDot} style={{ background: PIPE_COLORS[ci].pipe }}>{ci + 1}</span>
              <span aria-hidden="true">{joined[i] ? '✓' : '…'}</span>
            </span>
          );
        })}
      </div>

      <div className={styles.boardWrap}>
        <div
          key={round}
          className={`${styles.grid} ${won ? styles.gridWon : ''}`}
          style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}
          role="group"
          aria-label={tp.gridLabel}
        >
          {grid.map((row, r) => row.map((cell, c) => {
            const key = `${r},${c}`;
            if (!cell) return <div key={key} className={styles.tileEmpty} aria-hidden="true" />;
            const litColor = lit.get(key) ?? null;
            const cls = [
              styles.tile,
              cell.isEndpoint ? styles.tileEndpoint : '',
              spin === key ? styles.tileSpin : '',
              hintAt === key ? styles.tileHint : '',
              won ? styles.tileWon : '',
            ].join(' ');
            if (cell.isEndpoint) {
              return (
                <div key={key} className={cls} role="img" aria-label={fill(tp.dotLabel, { n: colorIndex(cell.colorId) + 1, r: r + 1, c: c + 1 })}>
                  <TileSVG cell={cell} litColor={litColor} />
                </div>
              );
            }
            return (
              <button
                key={key}
                type="button"
                className={cls}
                onClick={() => rotateTile(r, c)}
                disabled={won}
                aria-label={fill(tp.tileLabel, { r: r + 1, c: c + 1 })}
              >
                <TileSVG cell={cell} litColor={litColor} />
              </button>
            );
          }))}
        </div>
        {banner && (
          <div className={styles.banner} role="status">
            <span className={styles.bannerTitle}>{banner.stars === 3 ? tp.solvedPerfect : tp.solved}</span>
            <span className={styles.bannerStars} aria-label={fill(tp.starsLabel, { n: banner.stars })}>
              {'★'.repeat(banner.stars)}<span className={styles.starOff}>{'★'.repeat(STARS_MAX - banner.stars)}</span>
            </span>
          </div>
        )}
      </div>

      <p className={styles.status} aria-live="polite">
        {hintAt ? `💡 ${tp.hintDone}` : won ? ' ' : history.length ? fill(tp.pairsJoined, { n: joinedCount, total: puzzle.colorPairs.length }) : tp.tapTip}
      </p>

      <div className={styles.tools}>
        <button type="button" className={styles.toolBtn} onClick={undo} disabled={won || !history.length}>↶ {tp.undo}</button>
        <button type="button" className={`${styles.toolBtn} ${styles.toolHint}`} onClick={giveHint} disabled={won}>💡 {tp.hint}</button>
        <button type="button" className={styles.toolBtn} onClick={reset} disabled={won || !history.length}>⟲ {tp.reset}</button>
      </div>
    </div>
  );
}

PipeGame.propTypes = {
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']).isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playReveal:  PropTypes.func,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function PipePuzzle({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tp = t.games['pipe-puzzle'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'pipe-puzzle', callbackUrl, onComplete });

  return (
    <GameShell
      gameId="pipe-puzzle"
      title={tp.title}
      instructions={`${tp.instructions} ${tp.instructionsHelp}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playReveal }) => (
        <PipeGame
          difficulty={diff}
          onComplete={shellComplete}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playReveal={playReveal}
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
