import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SlitherEscape.module.css';
import { useTranslation } from '../../i18n/useTranslation';
import { DIFFICULTY_CONFIG, applyMove, solve, generateLevel, starsFor } from './slitherLogic';

/*
 * Mechanic overview
 * - Each snake is a straight bar with a number. Its exit door on the wall
 *   shows the same number and colour.
 * - Tap a snake, then an arrow (or swipe the snake). It slides until it
 *   hits the wall or another snake. Reaching its own door, it leaves.
 * - No clock. Hint shows the next move of a shortest solution; Undo and
 *   Start again are always there, so a puzzle can never dead-end.
 * - 3 stars per puzzle with no help, 2 with a little, 1 with a lot.
 */

// Deep, high-contrast colours; the number is the real cue.
const SNAKE_COLORS = [
  { body: '#1d4ed8', dark: '#1e3a8a' }, // blue
  { body: '#b91c1c', dark: '#7f1d1d' }, // red
  { body: '#7e22ce', dark: '#581c87' }, // purple
  { body: '#0f766e', dark: '#134e4a' }, // teal
];
const ARROWS = { up: '▲', down: '▼', left: '◀', right: '▶' };
// Height taken by the shell header, HUD, message, arrow row and tool row.
const CHROME_H = 380;
const KEY_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

const clone = (snakes) => snakes.map(s => ({ ...s, cells: s.cells.map(c => [...c]) }));
const fmt = (str, vars) => Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, v), str);

function SnakeEyes({ dir }) {
  const rot = { up: 0, right: 90, down: 180, left: 270 }[dir] ?? 0;
  return (
    <svg viewBox="-20 -20 40 40" className={styles.eyes} aria-hidden="true">
      <g transform={`rotate(${rot})`}>
        <circle cx="-6" cy="-2" r="6" fill="#fff" stroke="#111" strokeWidth="1" />
        <circle cx="6" cy="-2" r="6" fill="#fff" stroke="#111" strokeWidth="1" />
        <circle cx="-6" cy="-4" r="3.2" fill="#111" />
        <circle cx="6" cy="-4" r="3.2" fill="#111" />
      </g>
    </svg>
  );
}
SnakeEyes.propTypes = { dir: PropTypes.string };

function headDir(cells) {
  if (cells.length < 2) return 'up';
  const [hr, hc] = cells[0];
  const [nr, nc] = cells[1];
  if (hr < nr) return 'up';
  if (hr > nr) return 'down';
  if (hc < nc) return 'left';
  return 'right';
}

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

  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [level, setLevel] = useState(() => generateLevel(difficulty));
  const [snakes, setSnakes] = useState(() => clone(level.snakes));
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState(null);
  const [hint, setHint] = useState(null); // { si, dir }
  const [message, setMessage] = useState(null); // { text, tone }
  const [banner, setBanner] = useState(null); // { stars }
  const [stars, setStars] = useState(0);

  const helpRef = useRef({ hints: 0, undos: 0, resets: 0 });
  const starsRef = useRef(0);
  const doneRef = useRef(false);
  const solvedRef = useRef(false);
  const timersRef = useRef(new Set());
  const swipeRef = useRef(null);

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
    reportRound?.(puzzleIdx + 1, config.puzzles);
  }, [puzzleIdx, config.puzzles, reportRound]);

  const finishPuzzle = useCallback(() => {
    solvedRef.current = true;
    const got = starsFor(helpRef.current);
    starsRef.current += got;
    setStars(starsRef.current);
    reportScore(starsRef.current);
    setBanner({ stars: got });
    setSelected(null);
    setHint(null);
    playSuccess();
    later(() => {
      if (doneRef.current) return;
      const next = puzzleIdx + 1;
      if (next >= config.puzzles) {
        doneRef.current = true;
        onComplete({ finalScore: starsRef.current, maxScore: config.puzzles * 3, completed: true });
        return;
      }
      const lv = generateLevel(difficulty);
      helpRef.current = { hints: 0, undos: 0, resets: 0 };
      solvedRef.current = false;
      setPuzzleIdx(next);
      setLevel(lv);
      setSnakes(clone(lv.snakes));
      setHistory([]);
      setBanner(null);
      setMessage(null);
    }, 1800);
  }, [puzzleIdx, config.puzzles, difficulty, later, onComplete, reportScore, playSuccess]);

  const move = useCallback((si, dir) => {
    if (solvedRef.current || doneRef.current) return;
    if (si == null) { setMessage({ text: ts.pickFirst, tone: 'info' }); return; }
    const next = applyMove(snakes, si, dir, level.rows, level.cols);
    if (!next) {
      playFail();
      setMessage({ text: fmt(ts.blocked, { n: si + 1, dir: dirWord(dir) }), tone: 'warn' });
      return;
    }
    playClick();
    setHistory(h => [...h, snakes]);
    setSnakes(next);
    setHint(null);
    if (next.every(s => s.out)) {
      setMessage({ text: ts.solved, tone: 'good' });
      finishPuzzle();
    } else if (next[si].out) {
      playReveal?.();
      setSelected(null);
      setMessage({ text: fmt(ts.escaped, { n: si + 1 }), tone: 'good' });
    } else {
      setMessage(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snakes, level, ts, finishPuzzle, playClick, playFail, playReveal]);

  const resetPuzzle = useCallback((counted = true) => {
    if (solvedRef.current) return;
    if (counted) helpRef.current.resets += 1;
    setSnakes(clone(level.snakes));
    setHistory([]);
    setSelected(null);
    setHint(null);
  }, [level]);

  const handleHint = useCallback(() => {
    if (solvedRef.current) return;
    const path = solve(snakes, level.rows, level.cols);
    helpRef.current.hints += 1;
    if (!path || !path.length) {
      // Tangled beyond rescue: start the puzzle again, gently.
      resetPuzzle(false);
      setMessage({ text: ts.tangled, tone: 'info' });
      return;
    }
    const step = path[0];
    playReveal?.();
    setSelected(step.si);
    setHint(step);
    setMessage({ text: fmt(ts.hintMsg, { n: step.si + 1, dir: dirWord(step.dir) }), tone: 'info' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snakes, level, ts, resetPuzzle, playReveal]);

  const handleUndo = useCallback(() => {
    if (solvedRef.current || !history.length) return;
    helpRef.current.undos += 1;
    playClick();
    setSnakes(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
    setHint(null);
    setMessage(null);
  }, [history, playClick]);

  const handleReset = useCallback(() => {
    if (!history.length) return;
    playClick();
    resetPuzzle(true);
    setMessage(null);
  }, [history, playClick, resetPuzzle]);

  const selectSnake = useCallback((si) => {
    if (solvedRef.current || snakes[si]?.out) return;
    playClick();
    setSelected(si);
    if (!hint || hint.si !== si) setHint(null);
    setMessage({ text: fmt(ts.chosen, { n: si + 1 }), tone: 'info' });
  }, [snakes, hint, ts, playClick]);

  // Keyboard: arrows slide the chosen snake.
  const keyRef = useRef(null);
  keyRef.current = (e) => {
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

  // Swipe on a snake slides it that way.
  const onPointerDown = (e, si) => { swipeRef.current = { si, x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e) => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    swipeRef.current = { swiped: true };
    setSelected(s.si);
    move(s.si, dir);
  };

  const { rows, cols } = level;
  // Size the board from the space left over, so nothing scrolls while playing.
  const avail = Math.min(420, viewport.w - 32);
  const byW = Math.floor(avail / (Math.max(rows, cols) + 2));
  const byH = Math.floor((viewport.h - CHROME_H) / (rows + 2));
  const cell = Math.max(30, Math.min(byW, byH, 56));
  const W = (cols + 2) * cell;
  const H = (rows + 2) * cell;

  const doorPos = ([r, c], dir) => {
    const pos = { top: (r + 1) * cell, left: (c + 1) * cell };
    if (dir === 'up') pos.top -= cell;
    if (dir === 'down') pos.top += cell;
    if (dir === 'left') pos.left -= cell;
    if (dir === 'right') pos.left += cell;
    return pos;
  };

  // The number sits on the body, away from the face.
  const numStyle = (vertical, headFirst) => (vertical
    ? { left: 0, right: 0, top: headFirst ? cell : 0, bottom: headFirst ? 0 : cell }
    : { top: 0, bottom: 0, left: headFirst ? cell : 0, right: headFirst ? 0 : cell });

  const remaining = snakes.filter(s => !s.out).length;

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
          style={{ width: W, height: H, '--cell': `${cell}px` }}
          role="group"
          aria-label={ts.board}
        >
          <div className={styles.field} style={{ top: cell, left: cell, width: cols * cell, height: rows * cell }} />

          {snakes.map((s, si) => {
            const col = SNAKE_COLORS[s.id % SNAKE_COLORS.length];
            const pos = doorPos(s.exitCell, s.exitDir);
            return (
              <div
                key={`d${s.id}`}
                className={`${styles.door} ${s.out ? styles.doorDone : ''}`}
                style={{ ...pos, width: cell, height: cell, background: col.body }}
                aria-label={fmt(ts.exitLabel, { n: si + 1 })}
              >
                <span className={styles.doorNum}>{si + 1}</span>
                <span className={styles.doorArrow} aria-hidden="true">{ARROWS[s.exitDir]}</span>
              </div>
            );
          })}

          {snakes.map((s, si) => {
            const col = SNAKE_COLORS[s.id % SNAKE_COLORS.length];
            const rs = s.cells.map(c => c[0]);
            const cs = s.cells.map(c => c[1]);
            const r0 = Math.min(...rs), c0 = Math.min(...cs);
            const h = (Math.max(...rs) - r0 + 1) * cell;
            const w = (Math.max(...cs) - c0 + 1) * cell;
            const [hr, hc] = s.cells[0];
            const isSel = selected === si && !s.out;
            return (
              <button
                key={`s${s.id}`}
                type="button"
                className={[
                  styles.snake,
                  isSel ? styles.snakeSel : '',
                  hint?.si === si ? styles.snakeHint : '',
                  s.out ? styles.snakeOut : '',
                ].join(' ')}
                style={{
                  top: (r0 + 1) * cell, left: (c0 + 1) * cell, width: w, height: h,
                  '--body': col.body, '--dark': col.dark,
                }}
                disabled={s.out || !!banner}
                aria-pressed={isSel}
                aria-label={fmt(ts.snakeLabel, { n: si + 1 })}
                onClick={() => {
                  if (swipeRef.current?.swiped) { swipeRef.current = null; return; }
                  selectSnake(si);
                }}
                onPointerDown={(e) => onPointerDown(e, si)}
                onPointerUp={onPointerUp}
              >
                <span
                  className={styles.head}
                  style={{ top: (hr - r0) * cell, left: (hc - c0) * cell, width: cell, height: cell }}
                >
                  <SnakeEyes dir={headDir(s.cells)} />
                </span>
                <span className={styles.snakeNum} style={numStyle(h > w, hr === r0 && hc === c0)}>
                  {si + 1}
                </span>
                {hint?.si === si && <span className={styles.hintArrow} aria-hidden="true">{ARROWS[hint.dir]}</span>}
              </button>
            );
          })}

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
