import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './Sumix.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * Sumix — tap numbers on or off so every row and every column adds up to
 * its target.
 *
 * Tuned for seniors:
 * - No clock. Each target box shows its target, then a tick when the
 *   sum is right, or how much it is over ("−2").
 * - Every puzzle has exactly one answer, so a hint can always point at a
 *   cell to change. Undo and Reset are free; only hints cost stars.
 * - 3 stars per puzzle with no hints, 2 with one or two, 1 with more.
 */
export const DIFFICULTY_CONFIG = {
  easy:   { rows: 3, cols: 3, rounds: 4, maxVal: 5, density: 0.45 },
  medium: { rows: 4, cols: 4, rounds: 5, maxVal: 9, density: 0.5 },
  hard:   { rows: 4, cols: 4, rounds: 6, maxVal: 9, density: 0.55 },
};
const MAX_STARS = 3;
const HINT_SHOW_MS = 2600;

export function starsFor(hints) {
  if (hints === 0) return 3;
  if (hints <= 2) return 2;
  return 1;
}

export function sums(grid, on) {
  const rowSums = grid.map((row, r) => row.reduce((s, v, c) => s + (on[r][c] ? v : 0), 0));
  const colSums = grid[0].map((_, c) => grid.reduce((s, row, r) => s + (on[r][c] ? row[c] : 0), 0));
  return { rowSums, colSums };
}

/** Count solutions (stopping at `limit`) by trying every on/off pattern. */
export function countSolutions(grid, rowTargets, colTargets, limit = 2) {
  const rows = grid.length;
  const cols = grid[0].length;
  const n = rows * cols;
  let found = 0;
  for (let mask = 0; mask < (1 << n); mask++) {
    let ok = true;
    for (let r = 0; r < rows && ok; r++) {
      let s = 0;
      for (let c = 0; c < cols; c++) if (mask & (1 << (r * cols + c))) s += grid[r][c];
      if (s !== rowTargets[r]) ok = false;
    }
    for (let c = 0; c < cols && ok; c++) {
      let s = 0;
      for (let r = 0; r < rows; r++) if (mask & (1 << (r * cols + c))) s += grid[r][c];
      if (s !== colTargets[c]) ok = false;
    }
    if (ok && ++found >= limit) return found;
  }
  return found;
}

function randomPuzzle({ rows, cols, maxVal, density }) {
  const grid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 1 + Math.floor(Math.random() * maxVal)));
  const solution = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Math.random() < density));
  // Every row and column needs at least one number turned on, and at least
  // one left off, so no line is trivially "all" or "nothing".
  for (let r = 0; r < rows; r++) {
    if (!solution[r].some(Boolean)) solution[r][Math.floor(Math.random() * cols)] = true;
    if (solution[r].every(Boolean)) solution[r][Math.floor(Math.random() * cols)] = false;
  }
  for (let c = 0; c < cols; c++) {
    if (!solution.some(row => row[c])) solution[Math.floor(Math.random() * rows)][c] = true;
  }
  const { rowSums, colSums } = sums(grid, solution);
  return { grid, solution, rowTargets: rowSums, colTargets: colSums };
}

/** A puzzle with exactly one answer (falls back to any valid one). */
export function generatePuzzle(config) {
  let p = randomPuzzle(config);
  for (let tries = 0; tries < 60; tries++) {
    if (countSolutions(p.grid, p.rowTargets, p.colTargets) === 1) return p;
    p = randomPuzzle(config);
  }
  return p;
}

const emptyBoard = (rows, cols) => Array.from({ length: rows }, () => Array(cols).fill(false));

function statusOf(left) {
  if (left === 0) return { cls: 'done', text: '✓' };
  if (left > 0) return { cls: 'need', text: '' };
  return { cls: 'over', text: `−${-left}` };
}

function SumixGame({ difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playReveal }) {
  const t = useTranslation();
  const tm = t.games['sumix'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { rows, cols, rounds } = config;

  const [round, setRound]   = useState(0);
  const [puzzle, setPuzzle] = useState(() => generatePuzzle(config));
  const [active, setActive] = useState(() => emptyBoard(rows, cols));
  const [history, setHistory] = useState([]);
  const [hints, setHints]   = useState(0);
  const [hintCell, setHintCell] = useState(null);
  const [score, setScore]   = useState(0);
  const [solved, setSolved] = useState(null); // stars earned, when solved
  const [message, setMessage] = useState(null);

  const activeRef = useRef(active);
  activeRef.current = active;
  const scoreRef  = useRef(0);
  const doneRef   = useRef(false);
  const lockRef   = useRef(false);
  const hintsRef  = useRef(0);
  const hintTimer = useRef(null);
  const timersRef = useRef(new Set());
  const reported  = useRef(-1);

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
    if (reported.current === round) return;
    reported.current = round;
    reportRound?.(round + 1, rounds);
  }, [round, rounds, reportRound]);

  const { rowSums, colSums } = sums(puzzle.grid, active);
  const rowLeft = puzzle.rowTargets.map((tg, r) => tg - rowSums[r]);
  const colLeft = puzzle.colTargets.map((tg, c) => tg - colSums[c]);

  const clearHint = useCallback(() => {
    clearTimeout(hintTimer.current);
    timersRef.current.delete(hintTimer.current);
    setHintCell(null);
  }, []);

  const checkBoard = useCallback((next, changed) => {
    const { rowSums: rs, colSums: cs } = sums(puzzle.grid, next);
    const done = rs.every((s, r) => s === puzzle.rowTargets[r]) && cs.every((s, c) => s === puzzle.colTargets[c]);
    if (done) {
      lockRef.current = true;
      const stars = starsFor(hintsRef.current);
      scoreRef.current += stars;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      setSolved(stars);
      setMessage(null);
      playSuccess();
      later(() => {
        if (doneRef.current) return;
        const nextRound = round + 1;
        if (nextRound >= rounds) {
          doneRef.current = true;
          onComplete({ finalScore: scoreRef.current, maxScore: rounds * MAX_STARS, completed: true });
          return;
        }
        const p = generatePuzzle(config);
        const empty = emptyBoard(rows, cols);
        activeRef.current = empty;
        hintsRef.current = 0;
        lockRef.current = false;
        setRound(nextRound);
        setPuzzle(p);
        setActive(empty);
        setHistory([]);
        setHints(0);
        setSolved(null);
      }, 1800);
      return;
    }
    if (!changed) { setMessage(null); return; }
    const [r, c] = changed;
    const rowOver = rs[r] - puzzle.rowTargets[r];
    const colOver = cs[c] - puzzle.colTargets[c];
    if (next[r][c] && (rowOver > 0 || colOver > 0)) {
      playFail();
      setMessage(rowOver > 0
        ? tm.rowOver.replace('{n}', r + 1).replace('{x}', rowOver)
        : tm.colOver.replace('{n}', c + 1).replace('{x}', colOver));
    } else {
      setMessage(null);
    }
  }, [puzzle, round, rounds, config, rows, cols, later, onComplete, reportScore, playSuccess, playFail, tm]);

  const toggleCell = useCallback((r, c) => {
    if (lockRef.current) return;
    playClick();
    clearHint();
    const prev = activeRef.current;
    const next = prev.map(row => [...row]);
    next[r][c] = !next[r][c];
    activeRef.current = next;
    setActive(next);
    setHistory(h => [...h, prev]);
    checkBoard(next, [r, c]);
  }, [playClick, clearHint, checkBoard]);

  const undo = useCallback(() => {
    if (lockRef.current || history.length === 0) return;
    playClick();
    clearHint();
    const prev = history[history.length - 1];
    activeRef.current = prev;
    setActive(prev);
    setHistory(h => h.slice(0, -1));
    setMessage(null);
  }, [history, playClick, clearHint]);

  const reset = useCallback(() => {
    if (lockRef.current) return;
    playClick();
    clearHint();
    const empty = emptyBoard(rows, cols);
    setHistory(h => [...h, activeRef.current]);
    activeRef.current = empty;
    setActive(empty);
    setMessage(null);
  }, [rows, cols, playClick, clearHint]);

  const hint = useCallback(() => {
    if (lockRef.current) return;
    const cur = activeRef.current;
    // Prefer turning off a wrong number first, then turning on a missing one.
    let cell = null;
    for (let r = 0; r < rows && !cell; r++) for (let c = 0; c < cols && !cell; c++) {
      if (cur[r][c] && !puzzle.solution[r][c]) cell = [r, c];
    }
    for (let r = 0; r < rows && !cell; r++) for (let c = 0; c < cols && !cell; c++) {
      if (!cur[r][c] && puzzle.solution[r][c]) cell = [r, c];
    }
    if (!cell) return;
    playReveal?.();
    hintsRef.current += 1;
    setHints(hintsRef.current);
    clearHint();
    setHintCell(cell);
    setMessage(cur[cell[0]][cell[1]] ? tm.hintOff : tm.hintOn);
    hintTimer.current = later(() => setHintCell(null), HINT_SHOW_MS);
  }, [rows, cols, puzzle, later, clearHint, playReveal, tm]);

  const stars = (n) => '★'.repeat(n) + '☆'.repeat(MAX_STARS - n);

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{tm.puzzleOf.replace('{n}', round + 1).replace('{total}', rounds)}</span>
          <span className={styles.starsNow} aria-label={tm.starsNow.replace('{n}', starsFor(hints))}>{stars(starsFor(hints))}</span>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>/ {rounds * MAX_STARS} ★</span>
        </div>
      </div>

      <p className={styles.prompt}>{tm.prompt}</p>

      <div key={round} className={`${styles.board} ${solved ? styles.boardSolved : ''}`} style={{ '--cols': cols + 1 }}>
        {puzzle.grid.map((row, r) => (
          <div key={r} className={styles.row}>
            {row.map((val, c) => {
              const on = active[r][c];
              const isHint = hintCell && hintCell[0] === r && hintCell[1] === c;
              return (
                <button
                  key={c}
                  type="button"
                  className={`${styles.cell} ${on ? styles.cellOn : ''} ${isHint ? styles.cellHint : ''}`}
                  onClick={() => toggleCell(r, c)}
                  disabled={solved !== null}
                  aria-label={tm.cellLabel.replace('{r}', r + 1).replace('{c}', c + 1).replace('{v}', val)}
                  aria-pressed={on}
                >
                  {val}
                  {on && <span className={styles.tick} aria-hidden="true">✓</span>}
                </button>
              );
            })}
            <Target target={puzzle.rowTargets[r]} left={rowLeft[r]} label={tm.rowTarget.replace('{n}', r + 1)} />
          </div>
        ))}
        <div className={styles.row}>
          {puzzle.colTargets.map((tg, c) => (
            <Target key={c} target={tg} left={colLeft[c]} label={tm.colTarget.replace('{n}', c + 1)} />
          ))}
          <span className={styles.corner} aria-hidden="true">Σ</span>
        </div>
      </div>


      <div className={styles.message} aria-live="polite">
        {solved !== null
          ? <span className={styles.banner}>{tm.solved} <span className={styles.bannerStars}>{stars(solved)}</span></span>
          : message && <span className={styles.msgText}>{message}</span>}
      </div>

      <div className={styles.tools}>
        <button type="button" className={styles.toolBtn} onClick={undo} disabled={solved !== null || history.length === 0}>{tm.undo}</button>
        <button type="button" className={styles.toolBtn} onClick={reset} disabled={solved !== null || !active.some(row => row.some(Boolean))}>{tm.reset}</button>
        <button type="button" className={`${styles.toolBtn} ${styles.hintBtn}`} onClick={hint} disabled={solved !== null}>
          {tm.hint}
        </button>
      </div>
    </div>
  );
}

function Target({ target, left, label }) {
  const st = statusOf(left);
  return (
    <div className={`${styles.target} ${styles[st.cls]}`} aria-label={st.text ? `${label}: ${target}, ${st.text}` : `${label}: ${target}`}>
      <span className={styles.targetNum}>{target}</span>
      {st.text && <span className={styles.targetLeft}>{st.text}</span>}
    </div>
  );
}

Target.propTypes = {
  target: PropTypes.number.isRequired,
  left:   PropTypes.number.isRequired,
  label:  PropTypes.string.isRequired,
};

SumixGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playReveal:  PropTypes.func,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function Sumix({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'sumix', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="sumix"
      title={t.games['sumix'].title}
      instructions={t.games['sumix'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, reportRound, playClick, playSuccess, playFail, playReveal }) => (
        <SumixGame
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
          playReveal={playReveal}
        />
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
