import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SlitherEscape.module.css';
import { useTranslation } from '../../i18n/useTranslation';
import {
  DIFFICULTY_CONFIG, moveSnake, validMoves, nextHint, generatePuzzle, starsFor, facing, dirBetween,
} from './slitherLogic';

/*
 * Mechanic overview
 * - The board is stone path tiles; the rest is wall. Each snake is a chain
 *   of tiles with a face on its head. Its exit is a glowing portal of the
 *   same colour at the edge of the path.
 * - Drag a snake's head one tile at a time, or tap the snake and then a
 *   glowing tile, or use the arrow buttons. The body follows the head, so
 *   snakes bend round corners. Head into its own door: the snake leaves.
 * - No clock. Hint shows the next move of a shortest solution; Undo and
 *   Start again are free, so a puzzle can never dead-end.
 * - 3 stars per puzzle with no hints, 2 with one or two, 1 with more.
 */

// Four colours that stay far apart (blue, red, orange, green), so each
// snake is easy to match with its portal on the pale stone path.
const SNAKE_COLORS = [
  { body: '#1d4ed8', dark: '#1e3a8a', glow: '#93c5fd' }, // blue
  { body: '#dc2626', dark: '#7f1d1d', glow: '#fca5a5' }, // red
  { body: '#ea580c', dark: '#7c2d12', glow: '#fdba74' }, // orange
  { body: '#15803d', dark: '#14532d', glow: '#86efac' }, // green
];
const ARROWS = { up: '▲', down: '▼', left: '◀', right: '▶' };
const ROT = { up: 0, right: 90, down: 180, left: 270 };
// Height taken by the shell header, HUD, message, arrow row and tool row.
const CHROME_H = 372;
const MOVE_MS = 150;
const KEY_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

const fmt = (str, vars) => Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, v), str);
const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const ease = (p) => 1 - (1 - p) * (1 - p);

function SnakeHead({ x, y, dir, body, dark }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${ROT[dir] ?? 0})`}>
      <path d="M0 -0.36 L0 -0.5 M0 -0.5 L-0.07 -0.58 M0 -0.5 L0.07 -0.58" stroke="#dc2626" strokeWidth="0.05" strokeLinecap="round" fill="none" />
      <circle r="0.4" fill={body} stroke={dark} strokeWidth="0.06" />
      <circle cx="-0.15" cy="-0.1" r="0.12" fill="#fff" stroke="#111" strokeWidth="0.025" />
      <circle cx="0.15" cy="-0.1" r="0.12" fill="#fff" stroke="#111" strokeWidth="0.025" />
      <circle cx="-0.15" cy="-0.15" r="0.06" fill="#111" />
      <circle cx="0.15" cy="-0.15" r="0.06" fill="#111" />
    </g>
  );
}
SnakeHead.propTypes = { x: PropTypes.number, y: PropTypes.number, dir: PropTypes.string, body: PropTypes.string, dark: PropTypes.string };

export function SlitherEscapeGame({ difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playReveal }) {
  const t = useTranslation();
  const ts = t.games['slither-escape'];
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 400,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const dirWord = (d) => ts[`dir_${d}`];
  const snakeName = (s) => ts.colorNames[s.id % SNAKE_COLORS.length];

  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [level, setLevel] = useState(() => generatePuzzle(difficulty, 0));
  const [snakes, setSnakes] = useState(() => level.snakes);
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [hint, setHint] = useState(null); // { si, dir, to }
  const [message, setMessage] = useState(null); // { text, tone }
  const [banner, setBanner] = useState(null); // { stars }
  const [stars, setStars] = useState(0);
  const [anim, setAnim] = useState(null); // { si, from, t0 }
  const [, setTick] = useState(0);

  const snakesRef = useRef(snakes);
  const levelRef = useRef(level);
  const helpRef = useRef({ hints: 0 });
  const starsRef = useRef(0);
  const doneRef = useRef(false);
  const solvedRef = useRef(false);
  const timersRef = useRef(new Set());
  const dragRef = useRef(null);
  const blockedRef = useRef(null);
  const svgRef = useRef(null);
  const nextLevelRef = useRef(null);

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
    return h;
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  // Shell callbacks are recreated on every render; call them through refs so
  // reporting the round doesn't re-trigger itself forever.
  const reportRoundRef = useRef(reportRound);
  reportRoundRef.current = reportRound;
  useEffect(() => {
    reportRoundRef.current?.(puzzleIdx + 1, config.puzzles);
  }, [puzzleIdx, config.puzzles]);

  // Drive the short slither animation.
  useEffect(() => {
    if (!anim) return undefined;
    let raf;
    const loop = () => {
      if (performance.now() - anim.t0 >= MOVE_MS) { setAnim(null); return; }
      setTick(n => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [anim]);

  const setBoard = useCallback((next) => {
    snakesRef.current = next;
    setSnakes(next);
  }, []);

  const finishPuzzle = useCallback(() => {
    solvedRef.current = true;
    dragRef.current = null;
    const got = starsFor(helpRef.current);
    starsRef.current += got;
    setStars(starsRef.current);
    reportScore(starsRef.current);
    setBanner({ stars: got });
    setSelected(null);
    setHint(null);
    playSuccess();
    const next = puzzleIdx + 1;
    // Build the next puzzle while the banner shows.
    if (next < config.puzzles) later(() => { nextLevelRef.current = generatePuzzle(difficulty, next); }, 60);
    later(() => {
      if (doneRef.current) return;
      if (next >= config.puzzles) {
        doneRef.current = true;
        onComplete({ finalScore: starsRef.current, maxScore: config.puzzles * 3, completed: true });
        return;
      }
      const lv = nextLevelRef.current ?? generatePuzzle(difficulty, next);
      nextLevelRef.current = null;
      helpRef.current = { hints: 0 };
      solvedRef.current = false;
      levelRef.current = lv;
      setPuzzleIdx(next);
      setLevel(lv);
      setBoard(lv.snakes);
      setHistory([]);
      setBanner(null);
      setMessage(null);
      setAnim(null);
    }, 1800);
  }, [puzzleIdx, config.puzzles, difficulty, later, onComplete, reportScore, playSuccess, setBoard]);

  /** Move snake si one tile in dir. Returns true when it moved. */
  const move = useCallback((si, dir, { quiet = false } = {}) => {
    if (solvedRef.current || doneRef.current) return false;
    if (si == null) { setMessage({ text: ts.pickFirst, tone: 'info' }); return false; }
    const cur = snakesRef.current;
    const res = moveSnake(levelRef.current, cur, si, dir);
    if (!res.ok) {
      if (res.reason === 'out') return false;
      const bkey = `${si}:${cur[si].cells[0]}:${dir}`;
      if (quiet && blockedRef.current === bkey) return false;
      blockedRef.current = bkey;
      playFail();
      const text = { wall: ts.blockedWall, snake: ts.blockedSnake, self: ts.blockedSelf }[res.reason];
      setMessage({ text: fmt(text, { n: snakeName(cur[si]), dir: dirWord(dir) }), tone: 'warn' });
      return false;
    }
    blockedRef.current = null;
    playClick();
    setHistory(h => [...h, cur]);
    setBoard(res.snakes);
    setAnim({ si, from: cur[si].cells, t0: performance.now() });
    setHint(null);
    if (res.snakes.every(s => s.out)) {
      setMessage({ text: ts.solved, tone: 'good' });
      finishPuzzle();
    } else if (res.escaped) {
      playReveal?.();
      setSelected(null);
      dragRef.current = null;
      setMessage({ text: fmt(ts.escaped, { n: snakeName(cur[si]) }), tone: 'good' });
    } else {
      setMessage(null);
    }
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts, finishPuzzle, playClick, playFail, playReveal, setBoard]);

  const resetPuzzle = useCallback(() => {
    if (solvedRef.current) return;
    setBoard(levelRef.current.snakes);
    setHistory([]);
    setSelected(null);
    setHint(null);
    setAnim(null);
  }, [setBoard]);

  const handleHint = useCallback(() => {
    if (solvedRef.current) return;
    const h = nextHint(levelRef.current, snakesRef.current);
    helpRef.current.hints += 1;
    if (!h) {
      // Tangled beyond rescue: start the puzzle again, gently.
      resetPuzzle();
      setMessage({ text: ts.tangled, tone: 'info' });
      return;
    }
    playReveal?.();
    setSelected(h.si);
    setHint(h);
    setMessage({ text: fmt(ts.hintMsg, { n: snakeName(snakesRef.current[h.si]), dir: dirWord(h.dir) }), tone: 'info' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts, resetPuzzle, playReveal]);

  const handleUndo = useCallback(() => {
    if (solvedRef.current || !history.length) return;
    playClick();
    setBoard(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
    setHint(null);
    setAnim(null);
    setMessage(null);
  }, [history, playClick, setBoard]);

  const handleReset = useCallback(() => {
    if (!history.length) return;
    playClick();
    resetPuzzle();
    setMessage(null);
  }, [history, playClick, resetPuzzle]);

  const selectSnake = useCallback((si) => {
    if (solvedRef.current || snakesRef.current[si]?.out) return;
    playClick();
    setSelected(si);
    setHint(h => (h && h.si === si ? h : null));
    setMessage({ text: fmt(ts.chosen, { n: snakeName(snakesRef.current[si]) }), tone: 'info' });
  }, [ts, playClick]);

  // Keyboard: 1–4 choose a snake, arrows move it.
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= snakes.length) { selectSnake(n - 1); return; }
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    move(selected, dir);
  };
  useEffect(() => {
    const h = (e) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const { rows, cols } = level;
  // Size the board from the space left over, so nothing scrolls while playing.
  const avail = Math.min(440, viewport.w - 24);
  const byW = Math.floor(avail / cols);
  const byH = Math.floor((viewport.h - CHROME_H) / rows);
  const cell = Math.max(40, Math.min(byW, byH, 68));
  const W = cols * cell;
  const H = rows * cell;

  const cellAt = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return [Math.floor((e.clientY - rect.top) / cell), Math.floor((e.clientX - rect.left) / cell)];
  };
  const snakeAt = (p) => snakesRef.current.findIndex(s => !s.out && s.cells.some(c => same(c, p)));

  const onPointerDown = (e) => {
    if (solvedRef.current || banner) return;
    const p = cellAt(e);
    const cur = snakesRef.current;
    // Tap a glowing tile next to the chosen snake's head.
    if (selected != null && !cur[selected]?.out) {
      const d = dirBetween(cur[selected].cells[0], p);
      if (d && snakeAt(p) !== selected) {
        if (move(selected, d)) {
          dragRef.current = { si: selected, id: e.pointerId };
          svgRef.current.setPointerCapture?.(e.pointerId);
        }
        return;
      }
    }
    const si = snakeAt(p);
    if (si < 0) return;
    if (si !== selected) selectSnake(si);
    if (same(cur[si].cells[0], p)) {
      dragRef.current = { si, id: e.pointerId };
      blockedRef.current = null;
      svgRef.current.setPointerCapture?.(e.pointerId);
    }
  };
  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    const s = snakesRef.current[drag.si];
    if (!s || s.out) { dragRef.current = null; return; }
    const [r, c] = cellAt(e);
    const [hr, hc] = s.cells[0];
    const dr = r - hr;
    const dc = c - hc;
    if (!dr && !dc) return;
    // Step one tile toward the finger, trying the bigger distance first.
    const primary = Math.abs(dr) >= Math.abs(dc) ? (dr > 0 ? 'down' : 'up') : (dc > 0 ? 'right' : 'left');
    const secondary = Math.abs(dr) >= Math.abs(dc) ? (dc ? (dc > 0 ? 'right' : 'left') : null) : (dr ? (dr > 0 ? 'down' : 'up') : null);
    const tryDir = (d) => d && moveSnake(levelRef.current, snakesRef.current, drag.si, d).ok;
    if (tryDir(primary)) move(drag.si, primary);
    else if (tryDir(secondary)) move(drag.si, secondary);
    else move(drag.si, primary, { quiet: true });
  };
  const onPointerUp = (e) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  };

  const remaining = snakes.filter(s => !s.out).length;
  const targets = selected != null && !banner ? validMoves(level, snakes, selected) : [];

  // Interpolated centres for drawing a snake.
  const pointsFor = (s, si) => {
    let pts = s.cells.map(([r, c]) => [c + 0.5, r + 0.5]);
    if (anim && anim.si === si) {
      const p = ease(Math.min(1, (performance.now() - anim.t0) / MOVE_MS));
      pts = pts.map(([x, y], i) => {
        const [fr, fc] = anim.from[i];
        return [fc + 0.5 + (x - fc - 0.5) * p, fr + 0.5 + (y - fr - 0.5) * p];
      });
    }
    return pts;
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{fmt(ts.puzzleOf, { n: puzzleIdx + 1, total: config.puzzles })}</span>
          <span className={styles.hudSub}>{fmt(ts.snakesLeft, { n: remaining })}</span>
        </div>
        <div className={styles.infoBadge} aria-label={`${stars} ${ts.stars}`}>
          <span key={stars} className={styles.infoBadgeNum}>{stars}</span>
          <span className={styles.infoBadgeSub} aria-hidden="true">★</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <div
          key={`b${puzzleIdx}`}
          className={`${styles.board} ${banner ? styles.boardWin : ''}`}
          style={{ width: W, height: H }}
        >
          <svg
            ref={svgRef}
            className={styles.svg}
            width={W}
            height={H}
            viewBox={`0 0 ${cols} ${rows}`}
            preserveAspectRatio="none"
            role="group"
            aria-label={ts.board}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <defs>
              {snakes.map(s => {
                const col = SNAKE_COLORS[s.id % SNAKE_COLORS.length];
                return (
                  <radialGradient key={s.id} id={`portal${s.id}`}>
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="35%" stopColor={col.glow} />
                    <stop offset="100%" stopColor={col.body} />
                  </radialGradient>
                );
              })}
            </defs>
            {level.tiles.map(([r, c]) => (
              <rect key={`t${r},${c}`} x={c} y={r} width="1" height="1" className={styles.tile} />
            ))}
            {level.tiles.map(([r, c]) => (
              <rect key={`i${r},${c}`} x={c + 0.06} y={r + 0.06} width="0.88" height="0.88" rx="0.14" className={styles.tileInner} />
            ))}

            {snakes.map((s, si) => {
              const col = SNAKE_COLORS[s.id % SNAKE_COLORS.length];
              const [r, c] = s.exit;
              return (
                <g key={`d${s.id}`} className={s.out ? styles.doorDone : ''} aria-label={fmt(ts.exitLabel, { n: snakeName(s) })}>
                  {/* A glowing portal in the snake's colour, with a chevron
                      pointing the way out. */}
                  <circle cx={c + 0.5} cy={r + 0.5} r="0.45" fill={col.dark} />
                  <circle cx={c + 0.5} cy={r + 0.5} r="0.37" fill={`url(#portal${s.id})`} />
                  <g className={styles.swirl} style={{ transformOrigin: `${c + 0.5}px ${r + 0.5}px` }}>
                    <path
                      d={`M${c + 0.5} ${r + 0.5} m0 -0.26 a0.26 0.26 0 1 1 -0.2 0.43 M${c + 0.5} ${r + 0.5} m0 0.26 a0.26 0.26 0 1 1 0.2 -0.43`}
                      fill="none" stroke="#fff" strokeOpacity="0.8" strokeWidth="0.05" strokeLinecap="round"
                    />
                  </g>
                  <g transform={`translate(${c + 0.5} ${r + 0.5}) rotate(${ROT[s.exitDir]})`}>
                    <path d="M-0.12 -0.24 L0 -0.36 L0.12 -0.24" fill="none" stroke="#fff" strokeWidth="0.07" strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                </g>
              );
            })}

            {targets.map(({ to: [r, c], dir }) => (
              <circle key={`v${dir}`} cx={c + 0.5} cy={r + 0.5} r="0.3" className={styles.target} />
            ))}
            {hint && !banner && (
              <circle cx={hint.to[1] + 0.5} cy={hint.to[0] + 0.5} r="0.4" className={styles.hintRing} />
            )}

            {snakes.map((s, si) => {
              const col = SNAKE_COLORS[s.id % SNAKE_COLORS.length];
              const pts = pointsFor(s, si);
              const line = pts.map(p => p.join(',')).join(' ');
              const isSel = selected === si && !s.out;
              return (
                <g
                  key={`s${s.id}`}
                  className={`${styles.snake} ${s.out ? styles.snakeOut : ''}`}
                  aria-label={fmt(ts.snakeLabel, { n: snakeName(s) })}
                >
                  {isSel && <polyline points={line} className={styles.selGlow} />}
                  <polyline points={line} fill="none" stroke={col.dark} strokeWidth="0.72" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points={line} fill="none" stroke={col.body} strokeWidth="0.58" strokeLinecap="round" strokeLinejoin="round" />
                  <SnakeHead x={pts[0][0]} y={pts[0][1]} dir={facing(s.cells)} body={col.body} dark={col.dark} />
                  {hint?.si === si && <circle cx={pts[0][0]} cy={pts[0][1]} r="0.46" className={styles.hintRing} />}
                </g>
              );
            })}
          </svg>

          {banner && (
            <div className={styles.banner} role="status">
              <span className={styles.bannerTitle}>{ts.solved}</span>
              <span className={styles.bannerStars} aria-label={`${banner.stars} ${ts.stars}`}>
                {[0, 1, 2].map(i => <span key={i} className={i < banner.stars ? styles.starOn : styles.starOff}>★</span>)}
              </span>
            </div>
          )}
        </div>

        <p className={`${styles.message} ${message ? styles[`msg_${message.tone}`] : ''}`} aria-live="polite">
          {message ? message.text : ts.prompt}
        </p>

        <div className={styles.pad} role="group" aria-label={ts.arrows}>
          {['left', 'up', 'down', 'right'].map(d => (
            <button
              key={d}
              type="button"
              className={`${styles.arrowBtn} ${hint?.dir === d && hint.si === selected ? styles.arrowHint : ''}`}
              onClick={() => move(selected, d)}
              disabled={!!banner}
              aria-label={fmt(ts.slide, { dir: dirWord(d) })}
            >
              {ARROWS[d]}
            </button>
          ))}
        </div>

        <div className={styles.tools}>
          <button type="button" className={styles.toolBtn} onClick={handleHint} disabled={!!banner}>💡 {ts.hint}</button>
          <button type="button" className={styles.toolBtn} onClick={handleUndo} disabled={!!banner || !history.length}>↶ {ts.undo}</button>
          <button type="button" className={styles.toolBtn} onClick={handleReset} disabled={!!banner || !history.length}>⟲ {ts.reset}</button>
        </div>
      </div>
    </div>
  );
}

SlitherEscapeGame.propTypes = {
  difficulty: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick: PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail: PropTypes.func.isRequired,
  playReveal: PropTypes.func,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function SlitherEscape({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'slither-escape', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="slither-escape"
      title={t.games['slither-escape'].title}
      instructions={t.games['slither-escape'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, reportRound, playClick, playSuccess, playFail, playReveal }) => (
        <SlitherEscapeGame
          difficulty={diff} onComplete={sc} reportScore={reportScore} reportRound={reportRound}
          playClick={playClick} playSuccess={playSuccess} playFail={playFail} playReveal={playReveal}
        />
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
