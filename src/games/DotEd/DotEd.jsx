import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './DotEd.module.css';
import { useTranslation } from '../../i18n/useTranslation';
import {
  LEVELS, cloneGrid, findPos, isSolved, findPath, transfer, isSolvable, findHint, starsFor,
} from './logic';

const TIME_LIMITS = { easy: null, medium: null, hard: null };
const STEP_MS = 120;

/* Which corners to round so neighbouring cells merge into one white blob. */
function computeBorderRadii(grid) {
  const R = 20;
  return grid.map((row, r) => row.map((cell, c) => {
    if (!cell) return null;
    const top = !!grid[r - 1]?.[c], bottom = !!grid[r + 1]?.[c];
    const left = !!row[c - 1], right = !!row[c + 1];
    const tl = (!top && !left) ? R : 0, tr = (!top && !right) ? R : 0;
    const bl = (!bottom && !left) ? R : 0, br = (!bottom && !right) ? R : 0;
    return `${tl}px ${tr}px ${br}px ${bl}px`;
  }));
}

/* A red circle that hops along the line's cells, then disappears. */
function FlyingCircle({ waypoints, capacity, delay, duration }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!waypoints || waypoints.length < 2) return undefined;
    const stepMs = duration / (waypoints.length - 1);
    let step = 0;
    let timer;
    const start = setTimeout(() => {
      setPos(waypoints[0]);
      timer = setInterval(() => {
        step++;
        if (step >= waypoints.length) { clearInterval(timer); setPos(null); return; }
        setPos(waypoints[step]);
      }, stepMs);
    }, delay);
    return () => { clearTimeout(start); if (timer) clearInterval(timer); };
  }, [waypoints, delay, duration]);

  if (!pos) return null;
  const stepMs = duration / (waypoints.length - 1);
  return (
    <div
      className={styles.flyingCircle}
      style={{ left: pos.x, top: pos.y, transition: `left ${stepMs}ms linear, top ${stepMs}ms linear` }}
      aria-hidden="true"
    >
      {Array.from({ length: capacity }).map((__, i) => <span key={i} className={styles.flyingCircleDot} />)}
    </div>
  );
}

FlyingCircle.propTypes = {
  waypoints: PropTypes.array.isRequired,
  capacity: PropTypes.number.isRequired,
  delay: PropTypes.number.isRequired,
  duration: PropTypes.number.isRequired,
};

function DotEdGame({ difficulty, onComplete, reportScore, reportRound, playPop, playSuccess, playClick, playFail }) {
  const t = useTranslation();
  const tn = t.games['dot-ed'];
  const levels = LEVELS[difficulty] ?? LEVELS.easy;
  const total = levels.length;
  const maxScore = total * 3;

  const [levelIdx, setLevelIdx]       = useState(0);
  const [grid, setGrid]               = useState(() => cloneGrid(levels[0].grid));
  const [history, setHistory]         = useState([]); // [{ grid, lines }] snapshots before each move
  const [lines, setLines]             = useState([]); // [{ path }]
  const [won, setWon]                 = useState(false);
  const [score, setScore]             = useState(0);
  const [helps, setHelps]             = useState(0);
  const [drag, setDrag]               = useState(null);
  const [selected, setSelected]       = useState(null);
  const [hint, setHint]               = useState(null); // { from, to } | { stuck: true }
  const [message, setMessage]         = useState(null); // { text, tone }
  const [banner, setBanner]           = useState(null);
  const [flying, setFlying]           = useState([]);
  const [, forceLayout]               = useState(0);

  const boardRef  = useRef(null);
  const cellRefs  = useRef({});
  const dragRef   = useRef(null);
  dragRef.current = drag;
  const scoreRef  = useRef(0);
  const helpsRef  = useRef(0);
  const doneRef   = useRef(false);
  const idRef     = useRef(0);
  const hintIdRef = useRef(0);
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

  // Lines are drawn from measured cell centres, so redraw after layout/resize.
  useEffect(() => {
    const onResize = () => forceLayout(n => n + 1);
    window.addEventListener('resize', onResize);
    const raf = requestAnimationFrame(onResize);
    return () => { window.removeEventListener('resize', onResize); cancelAnimationFrame(raf); };
  }, [levelIdx]);

  const cbRef = useRef({});
  cbRef.current = { reportRound };
  useEffect(() => { cbRef.current.reportRound?.(levelIdx + 1, total); }, [levelIdx, total]);

  const say = useCallback((text, tone = 'info') => setMessage({ text, tone }), []);

  const centre = useCallback((p) => {
    const cell = grid[p.r]?.[p.c];
    const el = cell && cellRefs.current[cell.id];
    const board = boardRef.current;
    if (!el || !board) return null;
    const er = el.getBoundingClientRect();
    const br = board.getBoundingClientRect();
    return { x: er.left - br.left + er.width / 2, y: er.top - br.top + er.height / 2 };
  }, [grid]);

  const segments = useCallback((path) => {
    const out = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = centre(path[i]), b = centre(path[i + 1]);
      if (a && b) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    return out;
  }, [centre]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete({ finalScore: scoreRef.current, maxScore, completed: true });
  }, [onComplete, maxScore]);

  const goToLevel = useCallback((idx) => {
    if (idx >= total) { finish(); return; }
    setLevelIdx(idx);
    setGrid(cloneGrid(levels[idx].grid));
    setHistory([]);
    setLines([]);
    setFlying([]);
    setSelected(null);
    setHint(null);
    setMessage(null);
    setWon(false);
    helpsRef.current = 0;
    setHelps(0);
  }, [levels, total, finish]);

  const addHelp = useCallback(() => {
    helpsRef.current += 1;
    setHelps(helpsRef.current);
  }, []);

  /* Animate red circles hopping along the path into the target. */
  const animate = useCallback((path, moved) => {
    const waypoints = path.map(centre);
    if (waypoints.some(w => !w) || waypoints.length < 2) return;
    const items = moved
      .map(m => {
        const p = findPos(grid, m.from);
        const idx = path.findIndex(q => q.r === p.r && q.c === p.c);
        return { ...m, idx };
      })
      .filter(m => m.idx >= 0)
      .sort((a, b) => b.idx - a.idx);
    let delay = 0;
    const circles = items.map(m => {
      const wp = waypoints.slice(m.idx);
      const duration = Math.max(1, wp.length - 1) * STEP_MS;
      const c = { id: `${m.from}-${++idRef.current}`, waypoints: wp, capacity: m.amount, delay, duration };
      delay += duration + 80;
      return c;
    });
    setFlying(circles);
    later(() => setFlying([]), delay + 200);
  }, [centre, grid, later]);

  const makeMove = useCallback((sourceIds, targetId, path) => {
    if (won || doneRef.current) return;
    const next = cloneGrid(grid);
    const moved = transfer(next, sourceIds, targetId);
    if (moved.length === 0) return;
    animate(path, moved);
    setHistory(h => [...h, { grid, lines }]);
    setLines(ls => [...ls, { path }]);
    setGrid(next);
    setSelected(null);
    setHint(null);
    playPop();

    if (isSolved(next)) {
      const stars = starsFor(helpsRef.current);
      scoreRef.current += stars;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      setWon(true);
      setMessage(null);
      const id = ++idRef.current;
      setBanner({ id, text: stars === 3 ? tn.perfect : tn.solved, stars });
      later(() => playSuccess(), 250);
      later(() => { setBanner(null); goToLevel(levelIdx + 1); }, 1800);
    } else if (!isSolvable(next)) {
      playFail();
      say(tn.stuck, 'warn');
    } else {
      setMessage(null);
    }
  }, [won, grid, lines, animate, playPop, playSuccess, playFail, reportScore, tn, later, goToLevel, levelIdx, say]);

  /* ── Drag ─────────────────────────────────────────── */
  const pointFrom = e => (e.touches?.[0] ?? e.changedTouches?.[0] ?? e);

  const gridPosAt = useCallback((x, y) => {
    const board = boardRef.current;
    if (!board) return null;
    const br = board.getBoundingClientRect();
    const rows = grid.length, cols = grid[0]?.length ?? 0;
    const c = Math.floor((x - br.left) / (br.width / cols));
    const r = Math.floor((y - br.top) / (br.height / rows));
    if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
    return { r, c };
  }, [grid]);

  const onSourceDown = useCallback((e, id) => {
    if (won) return;
    const pos = findPos(grid, id);
    const cell = pos && grid[pos.r][pos.c];
    if (!cell || cell.capacity <= 0) return;
    e.preventDefault();
    setDrag({ collected: [id], path: [pos], targetId: null, moved: false });
  }, [grid, won]);

  const onMove = useCallback((e) => {
    if (!dragRef.current) return;
    e.preventDefault();
    const pt = pointFrom(e);
    const gp = gridPosAt(pt.clientX, pt.clientY);
    if (!gp) return;
    setDrag(d => {
      if (!d) return d;
      const last = d.path[d.path.length - 1];
      if (gp.r === last.r && gp.c === last.c) return d;
      // Step back along the line to shorten it.
      const prev = d.path[d.path.length - 2];
      if (prev && prev.r === gp.r && prev.c === gp.c) {
        const leaving = grid[last.r][last.c];
        return {
          ...d, moved: true,
          path: d.path.slice(0, -1),
          collected: d.collected.filter(id => id !== leaving.id || id === d.collected[0]),
          targetId: grid[gp.r][gp.c]?.type === 'target' ? grid[gp.r][gp.c].id : null,
        };
      }
      if (Math.abs(gp.r - last.r) + Math.abs(gp.c - last.c) !== 1) return d;
      const cell = grid[gp.r]?.[gp.c];
      if (!cell) return d;
      if (d.path.some(p => p.r === gp.r && p.c === gp.c)) return d;
      if (cell.type === 'source') {
        const collect = cell.capacity > 0 && !d.collected.includes(cell.id);
        return {
          ...d, moved: true, targetId: null,
          path: [...d.path, gp],
          collected: collect ? [...d.collected, cell.id] : d.collected,
        };
      }
      if (cell.need > 0) return { ...d, moved: true, targetId: cell.id, path: [...d.path, gp] };
      return d;
    });
  }, [grid, gridPosAt]);

  const onUp = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    setDrag(null);
    if (d.targetId) { makeMove(d.collected, d.targetId, d.path); return; }
    if (!d.moved) {
      // A plain tap: select this dot, then tap a square.
      playClick();
      setSelected(s => (s === d.collected[0] ? null : d.collected[0]));
      say(tn.tapTarget);
      return;
    }
    say(tn.endOnTarget);
  }, [makeMove, playClick, say, tn]);

  const dragging = !!drag;
  useEffect(() => {
    if (!dragging) return undefined;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      window.removeEventListener('touchcancel', onUp);
    };
  }, [dragging, onMove, onUp]);

  /* Tap a target after choosing a dot. */
  const onTargetTap = useCallback((cell) => {
    if (won) return;
    if (cell.need === 0) { playFail(); say(tn.full, 'warn'); return; }
    if (!selected) { say(tn.pickDotFirst); return; }
    const path = findPath(grid, selected, cell.id);
    if (!path) { playFail(); say(tn.blocked, 'warn'); return; }
    makeMove([selected], cell.id, path);
  }, [won, selected, grid, makeMove, playFail, say, tn]);

  /* ── Help ─────────────────────────────────────────── */
  const undo = useCallback(() => {
    if (history.length === 0 || won) return;
    playClick();
    const prev = history[history.length - 1];
    setGrid(prev.grid);
    setLines(prev.lines);
    setHistory(history.slice(0, -1));
    setSelected(null);
    setHint(null);
    setMessage(null);
  }, [history, won, playClick]);

  const reset = useCallback(() => {
    if (history.length === 0 || won) return;
    playClick();
    setGrid(cloneGrid(levels[levelIdx].grid));
    setLines([]);
    setHistory([]);
    setSelected(null);
    setHint(null);
    setMessage(null);
  }, [history.length, won, levels, levelIdx, playClick]);

  const showHint = useCallback(() => {
    if (won) return;
    playClick();
    addHelp();
    const m = findHint(grid);
    if (!m) { setHint({ stuck: true }); say(tn.hintStuck, 'warn'); return; }
    setHint(m);
    setSelected(m.from);
    say(tn.hintShown);
    const id = ++idRef.current;
    hintIdRef.current = id;
    later(() => { if (hintIdRef.current === id) setHint(null); }, 4000);
  }, [won, grid, playClick, addHelp, say, tn, later]);

  /* ── Render ───────────────────────────────────────── */
  const cols = grid[0]?.length ?? 0;
  const radii = useMemo(() => computeBorderRadii(grid), [grid]);
  const lineSegs = lines.flatMap(l => segments(l.path));
  const dragSegs = drag ? segments(drag.path) : [];
  const potentialStars = starsFor(helps);
  const guide = levelIdx === 0 && history.length === 0 && !selected ? tn.guide : null;
  const shownMessage = message?.text ?? guide ?? tn.guideShort;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{tn.puzzle} {levelIdx + 1}/{total}</span>
          <span className={styles.starsNow} aria-label={`${potentialStars} ${tn.stars}`}>
            {[1, 2, 3].map(i => (
              <span key={i} className={i <= potentialStars ? styles.starOn : styles.starOff} aria-hidden="true">★</span>
            ))}
          </span>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>/ {maxScore} ★</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <p className={`${styles.message} ${message?.tone === 'warn' ? styles.messageWarn : ''}`} role="status" aria-live="polite">
          {shownMessage}
        </p>

        <div className={styles.boardWrap}>
          {banner && (
            <div key={banner.id} className={styles.banner}>
              {banner.text} {'★'.repeat(banner.stars)}
            </div>
          )}
          <div key={levelIdx} className={styles.board} ref={boardRef} style={{ '--cols': cols, '--rows': grid.length }}>
            <svg className={styles.svgOverlay} width="100%" height="100%" aria-hidden="true">
              {lineSegs.map((l, i) => <line key={i} className={styles.connectionLine} {...l} />)}
              {dragSegs.map((l, i) => <line key={`d${i}`} className={styles.dragLine} {...l} />)}
            </svg>

            {grid.map((row, ri) => row.map((cell, ci) => {
              if (!cell) return <div key={`${ri}-${ci}`} className={styles.emptyCell} />;
              const style = { borderRadius: radii[ri][ci] };
              const hinted = hint && (hint.from === cell.id || hint.to === cell.id);

              if (cell.type === 'source') {
                const inDrag = drag?.collected.includes(cell.id);
                const cls = [
                  styles.source,
                  cell.capacity === 0 && styles.sourceEmpty,
                  (inDrag || selected === cell.id) && styles.sourceCollected,
                  hinted && styles.hinted,
                ].filter(Boolean).join(' ');
                return (
                  <div key={cell.id} className={styles.cellBg} style={style}>
                    <div
                      ref={el => { cellRefs.current[cell.id] = el; }}
                      className={cls}
                      role="button"
                      aria-label={`${tn.dotLabel} ${cell.capacity}`}
                      aria-pressed={selected === cell.id}
                      onMouseDown={e => onSourceDown(e, cell.id)}
                      onTouchStart={e => onSourceDown(e, cell.id)}
                    >
                      {Array.from({ length: cell.capacity }).map((__, i) => <span key={i} className={styles.sourceDot} />)}
                    </div>
                  </div>
                );
              }

              const cls = [
                styles.target,
                cell.need === 0 && styles.targetComplete,
                drag?.targetId === cell.id && styles.targetHover,
                hinted && styles.hinted,
              ].filter(Boolean).join(' ');
              return (
                <div key={cell.id} className={styles.cellBg} style={style}>
                  <button
                    type="button"
                    ref={el => { cellRefs.current[cell.id] = el; }}
                    className={cls}
                    aria-label={cell.need === 0 ? tn.full : `${tn.squareLabel} ${cell.need}`}
                    onClick={() => onTargetTap(cell)}
                  >
                    {cell.need === 0 ? '✓' : cell.need}
                  </button>
                </div>
              );
            }))}

            {flying.map(c => <FlyingCircle key={c.id} {...c} />)}
          </div>
        </div>

        <div className={styles.controls}>
          <button type="button" className={`${styles.ctrlBtn} ${hint?.stuck ? styles.ctrlPulse : ''}`} onClick={undo} disabled={history.length === 0 || won}>
            <span aria-hidden="true">↩</span> {tn.undo}
          </button>
          <button type="button" className={styles.ctrlBtn} onClick={reset} disabled={history.length === 0 || won}>
            <span aria-hidden="true">⟲</span> {tn.reset}
          </button>
          <button type="button" className={`${styles.ctrlBtn} ${styles.hintBtn}`} onClick={showHint} disabled={won}>
            <span aria-hidden="true">💡</span> {tn.hint}
          </button>
        </div>
      </div>
    </div>
  );
}

DotEdGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playPop:     PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playClick:   PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function DotEd({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete } = useGameCallback({ memberId, gameId: 'dot-ed', callbackUrl, onComplete });

  return (
    <GameShell
      gameId="dot-ed"
      title={t.games['dot-ed'].title}
      instructions={t.games['dot-ed'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: complete, reportScore, reportRound, playClick, playSuccess, playPop, playFail }) => (
        <DotEdGame
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

DotEd.propTypes = {
  memberId: PropTypes.string,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
