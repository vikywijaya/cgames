import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './Zip.module.css';
import { useTranslation } from '../../i18n/useTranslation';
import { makePuzzle, extensionError, isSolved, isStuck, nextWaypoint, hintFor, starsFor } from './zipLogic';

/* ──────────────────────────────────────────────────────────
   Zip — draw one line through every square, visiting the
   numbers in order. No clock: take as long as you like.
   - The line starts on 1. Drag, or tap the square next to the end.
   - Tap any square already on the line to shorten it back to there.
   - Undo / Start over are free. A hint adds the next square for you.
   - Stars per puzzle: 3 with no hints, 2 with 1–2, 1 with more.
   Puzzles are generated from a random full path, so they are always solvable.
────────────────────────────────────────────────────────── */

const DIFFICULTY_CONFIG = {
  // sizes: one entry per puzzle; spacing: squares between numbers (smaller = more guidance)
  easy:   { sizes: [4, 4, 5],    spacing: 3 },
  medium: { sizes: [5, 5, 6, 6], spacing: 4 },
  hard:   { sizes: [6, 6, 7, 7], spacing: 6 },
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };
const HINT_GLOW_MS = 1400;
const SOLVE_PAUSE_MS = 1600;

function makeSet(config) {
  return config.sizes.map(size => makePuzzle(size, Math.ceil((size * size - 1) / config.spacing) + 1));
}

function fmt(str, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), str);
}

/* ──────────────────────────────────────────────────────────
   Inner game
────────────────────────────────────────────────────────── */
function ZipGame({ difficulty, onComplete, reportScore, reportRound, playSuccess, playClick, playFail, playPop }) {
  const t = useTranslation();
  const tz = t.games['zip'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  // Lazy init keeps the same puzzles through StrictMode double renders.
  const [puzzles] = useState(() => makeSet(config));
  const total = puzzles.length;
  const maxScore = total * 3;

  const [idx, setIdx]         = useState(0);
  const puzzle = puzzles[idx];
  const startCell = useMemo(() => puzzle.solution[0], [puzzle]);
  const [path, setPath]       = useState([startCell]);
  const [hints, setHints]     = useState(0);
  const [score, setScore]     = useState(0);
  const [solved, setSolved]   = useState(false);
  const [msg, setMsg]         = useState(null);   // { tone, text }
  const [hintCell, setHintCell] = useState(null);
  const [badCell, setBadCell] = useState(null);
  const [banner, setBanner]   = useState(null);
  const [dragging, setDragging] = useState(false);

  // Ref mirrors for event handlers
  const pathRef   = useRef(path);
  const hintsRef  = useRef(0);
  const scoreRef  = useRef(0);
  const solvedRef = useRef(false);
  const doneRef   = useRef(false);
  const boardRef  = useRef(null);
  const idRef     = useRef(0);
  const timersRef = useRef(new Set());

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  // GameShell hands a fresh reportRound each render; read it through a ref so this
  // effect only runs when the puzzle changes (otherwise it loops forever).
  const reportRoundRef = useRef(reportRound);
  reportRoundRef.current = reportRound;
  useEffect(() => { reportRoundRef.current?.(idx + 1, total); }, [idx, total]);

  const showBanner = useCallback((text, tone) => {
    const id = ++idRef.current;
    setBanner({ id, text, tone });
    later(() => setBanner(b => (b?.id === id ? null : b)), SOLVE_PAUSE_MS);
  }, [later]);

  const nextPuzzle = useCallback(() => {
    const next = idx + 1;
    if (next >= total) {
      if (doneRef.current) return;
      doneRef.current = true;
      onComplete({ finalScore: scoreRef.current, maxScore, completed: true });
      return;
    }
    const first = puzzles[next].solution[0];
    pathRef.current = [first];
    hintsRef.current = 0;
    solvedRef.current = false;
    setIdx(next);
    setPath([first]);
    setHints(0);
    setSolved(false);
    setMsg(null);
    setHintCell(null);
  }, [idx, total, puzzles, maxScore, onComplete]);

  const flashBad = useCallback((cell, text) => {
    setBadCell(cell);
    setMsg({ tone: 'bad', text });
    later(() => setBadCell(c => (c === cell ? null : c)), 450);
  }, [later]);

  /* Commit a new line and check for a solve / dead end */
  const commit = useCallback((next) => {
    pathRef.current = next;
    setPath(next);
    if (isSolved(next, puzzle)) {
      solvedRef.current = true;
      setSolved(true);
      setDragging(false);
      const stars = starsFor(hintsRef.current);
      scoreRef.current += stars;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      setMsg({ tone: 'good', text: fmt(tz.starsEarned, { n: stars }) });
      showBanner(stars === 3 ? tz.perfect : tz.solved, stars === 3 ? 'perfect' : 'solved');
      playSuccess();
      later(nextPuzzle, SOLVE_PAUSE_MS);
      return;
    }
    if (isStuck(next, puzzle)) setMsg({ tone: 'warn', text: tz.stuck });
    else setMsg(null);
  }, [puzzle, reportScore, showBanner, playSuccess, later, nextPuzzle, tz]);

  /* Try to move the line to `cell` (extend, step back, or cut back) */
  const stepTo = useCallback((cell, fromTap) => {
    if (solvedRef.current || cell == null) return;
    const cur = pathRef.current;
    const head = cur[cur.length - 1];
    if (cell === head) return;
    const pos = cur.indexOf(cell);
    if (pos !== -1) {
      // Dragging backwards removes one square; tapping cuts back to that square.
      if (!fromTap && pos !== cur.length - 2) return;
      playClick();
      commit(cur.slice(0, pos + 1));
      return;
    }
    const err = extensionError(cur, cell, puzzle);
    if (err === null) {
      playPop?.();
      setHintCell(null);
      commit([...cur, cell]);
      return;
    }
    if (!fromTap && err === 'notAdjacent') return; // dragging past a gap: just wait
    playFail();
    if (err === 'order') flashBad(cell, fmt(tz.wrongOrder, { n: nextWaypoint(cur, puzzle.numbers) }));
    else flashBad(cell, tz.notAdjacent);
  }, [puzzle, commit, playClick, playPop, playFail, flashBad, tz]);

  const cellFromPoint = useCallback((clientX, clientY) => {
    const board = boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    const c = Math.floor(((clientX - rect.left) / rect.width) * puzzle.size);
    const r = Math.floor(((clientY - rect.top) / rect.height) * puzzle.size);
    if (r < 0 || r >= puzzle.size || c < 0 || c >= puzzle.size) return null;
    return r * puzzle.size + c;
  }, [puzzle.size]);

  const onPointerDown = useCallback((e) => {
    if (solvedRef.current) return;
    e.preventDefault();
    boardRef.current?.setPointerCapture?.(e.pointerId);
    setDragging(true);
    stepTo(cellFromPoint(e.clientX, e.clientY), true);
  }, [stepTo, cellFromPoint]);

  const onPointerMove = useCallback((e) => {
    if (!dragging) return;
    stepTo(cellFromPoint(e.clientX, e.clientY), false);
  }, [dragging, stepTo, cellFromPoint]);

  const endDrag = useCallback(() => setDragging(false), []);

  const undo = useCallback(() => {
    const cur = pathRef.current;
    if (solvedRef.current || cur.length <= 1) return;
    playClick();
    commit(cur.slice(0, -1));
  }, [commit, playClick]);

  const reset = useCallback(() => {
    if (solvedRef.current) return;
    playClick();
    setHintCell(null);
    commit([pathRef.current[0]]);
  }, [commit, playClick]);

  const hint = useCallback(() => {
    if (solvedRef.current) return;
    const h = hintFor(pathRef.current, puzzle);
    hintsRef.current += 1;
    setHints(hintsRef.current);
    playClick();
    setHintCell(h.cell);
    later(() => setHintCell(c => (c === h.cell ? null : c)), HINT_GLOW_MS);
    commit(h.path);
    if (!isSolved(h.path, puzzle)) setMsg({ tone: 'info', text: h.steppedBack ? tz.hintBack : tz.hintUsed });
  }, [puzzle, commit, later, playClick, tz]);

  /* ── Render helpers ── */
  const { size, numbers, maxWaypoint } = puzzle;
  const totalCells = size * size;
  const pathPos = useMemo(() => {
    const m = new Map();
    path.forEach((c, i) => m.set(c, i));
    return m;
  }, [path]);
  const head = path[path.length - 1];
  const want = nextWaypoint(path, numbers);
  const liveStars = starsFor(hints);

  let tip;
  if (msg) tip = msg;
  else if (path.length === 1) tip = { tone: 'info', text: tz.startTip };
  else if (want <= maxWaypoint) tip = { tone: 'info', text: fmt(tz.nextTip, { n: want }) };
  else tip = { tone: 'info', text: tz.fillTip };

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{fmt(tz.puzzleOf, { n: idx + 1, total })}</span>
          <span className={styles.stars} aria-label={fmt(tz.starsLabel, { n: liveStars })}>
            {[1, 2, 3].map(s => (
              <span key={s} className={s <= liveStars ? styles.starOn : styles.starOff} aria-hidden="true">★</span>
            ))}
          </span>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>/ {maxScore}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <div className={styles.boardWrap}>
          {banner && <div key={banner.id} className={`${styles.banner} ${styles[`banner_${banner.tone}`] ?? ''}`}>{banner.text}</div>}
          <div
            ref={boardRef}
            key={`b${idx}`}
            className={`${styles.board} ${solved ? styles.boardSolved : ''}`}
            style={{ '--size': size }}
            role="grid"
            aria-label={fmt(tz.boardLabel, { n: size })}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <svg className={styles.svgOverlay} viewBox={`0 0 ${size * 100} ${size * 100}`} preserveAspectRatio="none" aria-hidden="true">
              {path.length >= 2 && (
                <polyline
                  points={path.map(c => `${(c % size) * 100 + 50},${Math.floor(c / size) * 100 + 50}`).join(' ')}
                  className={styles.line}
                />
              )}
            </svg>

            {Array.from({ length: totalCells }).map((_, cell) => {
              const n = numbers[cell];
              const inPath = pathPos.has(cell);
              const isHead = cell === head && !solved;
              const isNext = n != null && n === want && !solved;
              return (
                <div
                  key={cell}
                  className={[
                    styles.cell,
                    inPath ? styles.cellInPath : '',
                    isHead ? styles.cellHead : '',
                    cell === hintCell ? styles.cellHint : '',
                    cell === badCell ? styles.cellBad : '',
                  ].join(' ')}
                  aria-label={n != null ? fmt(tz.numberLabel, { n }) : tz.squareLabel}
                >
                  {n != null && (
                    <span className={[
                      styles.num,
                      inPath ? styles.numVisited : '',
                      isNext ? styles.numNext : '',
                    ].join(' ')}>
                      {n}
                    </span>
                  )}
                  {isHead && n == null && <span className={styles.headDot} aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        </div>

        <p className={`${styles.tip} ${styles[`tip_${tip.tone}`] ?? ''}`} aria-live="polite">{tip.text}</p>
        <p className={styles.count}>{fmt(tz.filled, { n: path.length, total: totalCells })}</p>

        <div className={styles.controls}>
          <button type="button" className={styles.ctrlBtn} onClick={undo} disabled={solved || path.length <= 1}>
            <span aria-hidden="true">↶</span> {tz.undo}
          </button>
          <button type="button" className={`${styles.ctrlBtn} ${styles.ctrlHint}`} onClick={hint} disabled={solved}>
            <span aria-hidden="true">💡</span> {tz.hint}
          </button>
          <button type="button" className={styles.ctrlBtn} onClick={reset} disabled={solved || path.length <= 1}>
            <span aria-hidden="true">⟲</span> {tz.reset}
          </button>
        </div>
      </div>
    </div>
  );
}

ZipGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playPop:     PropTypes.func,
  playSuccess: PropTypes.func.isRequired,
  playClick:   PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

/* ──────────────────────────────────────────────────────────
   Exported wrapper
────────────────────────────────────────────────────────── */
export function Zip({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack }) {
  const t = useTranslation();
  const { fireComplete } = useGameCallback({ memberId, gameId: 'zip', callbackUrl, onComplete });

  return (
    <GameShell
      gameId="zip"
      title={t.games['zip'].title}
      instructions={t.games['zip'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireComplete}
      onBack={onBack}
    >
      {({ difficulty: diff, onComplete: complete, reportScore, reportRound, playClick, playSuccess, playPop, playFail }) => (
        <ZipGame
          difficulty={diff}
          onComplete={complete}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playPop={playPop}
          playFail={playFail}
        />
      )}
    </GameShell>
  );
}

Zip.propTypes = {
  memberId:    PropTypes.string,
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:  PropTypes.func,
  callbackUrl: PropTypes.string,
  onBack:      PropTypes.func,
};
