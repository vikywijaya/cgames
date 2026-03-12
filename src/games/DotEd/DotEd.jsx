import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './DotEd.module.css';

/* ──────────────────────────────────────────────────────────
   Grid-based level data (visual layout only).
   Any source can connect to any target — no adjacency needed.
   A single swipe from source → target gives 1 connection.
   Win when all sources have 0 capacity AND all targets have 0 need.
────────────────────────────────────────────────────────── */
const S = (id, capacity) => ({ type: 'source', id, capacity });
const T = (id, need)     => ({ type: 'target', id, need });
const _ = null;

/* ── Levels matching screenshots ─────────────────────── */
const LEVELS = {
  easy: [
    // Level 1 — tutorial (screenshot 4): S(2) T(2)
    { grid: [[ S('s1',2), T('t1',2) ]] },

    // Level 2 — L-shape (screenshot 1): s1(1) s2(3) / _ s3(2) t1(6)
    { grid: [
      [ S('s1',1), S('s2',3), _          ],
      [ _,         S('s3',2), T('t1',6) ],
    ]},

    // Level 3 — full 3×3 (screenshot 2): sources=18, targets=18
    { grid: [
      [ T('t1',10), S('s1',4), S('s2',3) ],
      [ S('s3',3),  S('s4',1), S('s5',2) ],
      [ S('s6',2),  S('s7',3), T('t2',8) ],
    ]},

    // Level 4 — C shape, 2 targets — sources=10, targets=10
    { grid: [
      [ S('s1',1), S('s2',2), T('t1',5) ],
      [ S('s3',2), _,         _          ],
      [ S('s4',1), _,         _          ],
      [ S('s5',1), _,         _          ],
      [ S('s6',2), S('s7',1), T('t2',5) ],
    ]},

    // Level 5 — T-shape: sources=6, targets=6
    { grid: [
      [ _,         _,         T('t1',1), _          ],
      [ S('s1',1), S('s2',2), S('s3',3), T('t2',5) ],
    ]},

    // Level 6 — funnel: sources=11, targets=11
    { grid: [
      [ T('t1',7), S('s1',1), S('s2',2), S('s3',1) ],
      [ _,         S('s4',2), S('s5',2), S('s6',3) ],
      [ _,         _,         T('t2',4), _          ],
    ]},
  ],
  medium: [
    // 1: tutorial
    { grid: [[ S('s1',2), T('t1',2) ]] },

    // 2: L-shape
    { grid: [
      [ S('s1',1), S('s2',3), _          ],
      [ _,         S('s3',2), T('t1',6) ],
    ]},

    // 3: 3×3 — sources=18, targets=18
    { grid: [
      [ T('t1',10), S('s1',4), S('s2',3) ],
      [ S('s3',3),  S('s4',1), S('s5',2) ],
      [ S('s6',2),  S('s7',3), T('t2',8) ],
    ]},

    // 4: C-shape wider, 2 targets — sources=14, targets=14
    { grid: [
      [ S('s1',3), S('s2',2), S('s3',2), T('t1',8) ],
      [ S('s4',1), _,         _,         _          ],
      [ S('s5',2), _,         _,         _          ],
      [ S('s6',2), S('s7',1), S('s8',1), T('t2',6) ],
    ]},

    // 5: cross shape — sources=8, targets=8
    { grid: [
      [ _,         S('s1',3), _          ],
      [ S('s2',2), T('t1',8), S('s3',2) ],
      [ _,         S('s4',1), _          ],
    ]},

    // 6: two targets — sources=8, targets=8
    { grid: [
      [ T('t1',3), S('s1',2), S('s2',1) ],
      [ S('s3',1), S('s4',1), S('s5',1) ],
      [ S('s6',1), S('s7',1), T('t2',5) ],
    ]},
  ],
  hard: [
    // 1: L-shape
    { grid: [
      [ S('s1',1), S('s2',3), _          ],
      [ _,         S('s3',2), T('t1',6) ],
    ]},

    // 2: 3×3 — sources=18, targets=18
    { grid: [
      [ T('t1',10), S('s1',4), S('s2',3) ],
      [ S('s3',3),  S('s4',1), S('s5',2) ],
      [ S('s6',2),  S('s7',3), T('t2',8) ],
    ]},

    // 3: C-shape tall, 2 targets — sources=16, targets=16
    { grid: [
      [ S('s1',2), S('s2',3), T('t1',7),  _          ],
      [ S('s3',2), _,         _,          _          ],
      [ S('s4',1), _,         _,          _          ],
      [ S('s5',3), _,         _,          _          ],
      [ S('s6',2), S('s7',2), S('s8',1), T('t2',9) ],
    ]},

    // 4: cross — sources=8, targets=8
    { grid: [
      [ _,         S('s1',3), _          ],
      [ S('s2',2), T('t1',8), S('s3',2) ],
      [ _,         S('s4',1), _          ],
    ]},

    // 5: two-target 3×3 — sources=9, targets=9
    { grid: [
      [ T('t1',4), S('s1',2), S('s2',1) ],
      [ S('s3',1), S('s4',2), S('s5',1) ],
      [ S('s6',1), S('s7',1), T('t2',5) ],
    ]},

    // 6: big L
    { grid: [
      [ S('s1',3), S('s2',2), S('s3',2), _          ],
      [ S('s4',1), _,         _,         _          ],
      [ T('t1',9), S('s5',1), _,         _          ],
    ]},

    // 7: T-shape with 2 targets
    { grid: [
      [ S('s1',2), T('t1',5), S('s2',3) ],
      [ _,         S('s3',2), _          ],
      [ _,         T('t2',2), _          ],
    ]},

    // 8: wide
    { grid: [
      [ S('s1',2), S('s2',2), T('t1',5), S('s3',1) ],
      [ _,         _,         S('s4',2), _          ],
      [ _,         T('t2',4), S('s5',1), S('s6',1) ],
    ]},
  ],
};

const TIME_LIMITS = { easy: null, medium: 180, hard: 120 };

function deepCloneGrid(grid) {
  return grid.map(row => row.map(cell => cell ? { ...cell } : null));
}

/* Compute which borders to round for merged white blobs. */
function computeBorderClasses(grid) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const R = 20;
  const result = [];
  for (let r = 0; r < rows; r++) {
    const rowResult = [];
    for (let c = 0; c < cols; c++) {
      if (!grid[r][c]) { rowResult.push(null); continue; }
      const top    = r > 0      && !!grid[r-1]?.[c];
      const bottom = r < rows-1 && !!grid[r+1]?.[c];
      const left   = c > 0      && !!grid[r][c-1];
      const right  = c < cols-1 && !!grid[r][c+1];
      const tl = (!top && !left)   ? R : 0;
      const tr = (!top && !right)  ? R : 0;
      const bl = (!bottom && !left)  ? R : 0;
      const br = (!bottom && !right) ? R : 0;
      rowResult.push(`${tl}px ${tr}px ${br}px ${bl}px`);
    }
    result.push(rowResult);
  }
  return result;
}

/* ──────────────────────────────────────────────────────────
   Flying circle — animates a red circle step by step along waypoints
────────────────────────────────────────────────────────── */
function FlyingCircle({ waypoints, capacity, delay, duration }) {
  const [pos, setPos] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!waypoints || waypoints.length < 2) return;
    const steps = waypoints.length - 1;
    const stepMs = duration / steps;
    let step = 0;
    let timer;

    const startTimer = setTimeout(() => {
      setPos(waypoints[0]);
      setVisible(true);
      timer = setInterval(() => {
        step++;
        if (step >= waypoints.length) {
          clearInterval(timer);
          setVisible(false);
          return;
        }
        setPos(waypoints[step]);
      }, stepMs);
    }, delay);

    return () => {
      clearTimeout(startTimer);
      if (timer) clearInterval(timer);
    };
  }, [waypoints, delay, duration]);

  if (!visible || !pos) return null;

  return (
    <div
      className={styles.flyingCircle}
      style={{
        left: pos.x,
        top: pos.y,
        transition: `left ${duration / (waypoints.length - 1)}ms linear, top ${duration / (waypoints.length - 1)}ms linear`,
      }}
    >
      {Array.from({ length: capacity }).map((__, i) => (
        <span key={i} className={styles.flyingCircleDot} />
      ))}
    </div>
  );
}

FlyingCircle.propTypes = {
  waypoints: PropTypes.array.isRequired,
  capacity: PropTypes.number.isRequired,
  delay: PropTypes.number.isRequired,
  duration: PropTypes.number.isRequired,
};

/* ──────────────────────────────────────────────────────────
   Inner game component
────────────────────────────────────────────────────────── */
function DotEdGame({ difficulty, onComplete, reportScore, secondsLeft, playPop, playSuccess, playClick, playFail }) {
  const levels = LEVELS[difficulty] ?? LEVELS.easy;
  const totalLevels = levels.length;

  const [levelIdx, setLevelIdx]       = useState(0);
  const [grid, setGrid]               = useState(() => deepCloneGrid(levels[0].grid));
  const [connections, setConnections] = useState([]);
  const [won, setWon]                 = useState(false);
  const [score, setScore]             = useState(0);
  // drag: { collected: [sourceId,...], path: [{r,c},...], lastR, lastC, x, y }
  const [drag, setDrag]               = useState(null);
  const [flyingDots, setFlyingDots]   = useState([]);

  const boardRef = useRef(null);
  const cellRefs = useRef({});

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: totalLevels, completed: false });
  }, [secondsLeft, score, totalLevels, onComplete]);

  const loadLevel = useCallback((idx) => {
    if (idx >= totalLevels) {
      onComplete({ finalScore: totalLevels, maxScore: totalLevels, completed: true });
      return;
    }
    setLevelIdx(idx);
    setGrid(deepCloneGrid(levels[idx].grid));
    setConnections([]);
    setFlyingDots([]);
    setWon(false);
  }, [levels, totalLevels, onComplete]);

  const checkWin = useCallback((g) => {
    for (const row of g) {
      for (const cell of row) {
        if (!cell) continue;
        if (cell.type === 'source' && cell.capacity > 0) return false;
        if (cell.type === 'target' && cell.need > 0) return false;
      }
    }
    return true;
  }, []);

  const getCentre = useCallback((id) => {
    const el = cellRefs.current[id];
    const board = boardRef.current;
    if (!el || !board) return null;
    const er = el.getBoundingClientRect();
    const br = board.getBoundingClientRect();
    return { x: er.left - br.left + er.width / 2, y: er.top - br.top + er.height / 2 };
  }, []);

  /* Build orthogonal line segments from stored paths */
  const connLines = useMemo(() => {
    const lines = [];
    for (const conn of connections) {
      if (!conn.path || conn.path.length < 2) {
        // Fallback: direct line (old connections without path)
        const from = getCentre(conn.from);
        const to = getCentre(conn.to);
        if (from && to) lines.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
        continue;
      }
      for (let i = 0; i < conn.path.length - 1; i++) {
        const cellA = grid[conn.path[i].r]?.[conn.path[i].c];
        const cellB = grid[conn.path[i + 1].r]?.[conn.path[i + 1].c];
        if (!cellA || !cellB) continue;
        const from = getCentre(cellA.id);
        const to = getCentre(cellB.id);
        if (from && to) lines.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      }
    }
    return lines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections, grid]);

  /* Find grid position {r,c} under screen coords */
  const findGridPos = useCallback((screenX, screenY) => {
    const board = boardRef.current;
    if (!board) return null;
    const br = board.getBoundingClientRect();
    const cols = grid[0]?.length ?? 0;
    const rows = grid.length;
    const cellW = br.width / cols;
    const cellH = br.height / rows;
    const c = Math.floor((screenX - br.left) / cellW);
    const r = Math.floor((screenY - br.top) / cellH);
    if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
    return { r, c };
  }, [grid]);

  const findSourceCell = useCallback((id) => {
    for (const row of grid) {
      for (const cell of row) {
        if (cell && cell.id === id) return cell;
      }
    }
    return null;
  }, [grid]);

  /* Find cell position by id */
  const findPos = useCallback((id) => {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (grid[r][c] && grid[r][c].id === id) return { r, c };
      }
    }
    return null;
  }, [grid]);

  const handlePointerDown = useCallback((e, sourceId) => {
    const src = findSourceCell(sourceId);
    if (!src || src.capacity <= 0) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const pos = findPos(sourceId);
    if (!pos) return;
    setDrag({ collected: [sourceId], path: [pos], lastR: pos.r, lastC: pos.c, x: clientX, y: clientY, targetId: null });
  }, [findSourceCell, findPos]);

  const handlePointerMove = useCallback((e) => {
    if (!drag) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const gp = findGridPos(clientX, clientY);
    if (!gp) { setDrag(d => d ? { ...d, x: clientX, y: clientY, targetId: null } : null); return; }

    setDrag(d => {
      if (!d) return null;
      const { r, c } = gp;
      // Only accept orthogonal adjacency (no diagonal)
      const dr = Math.abs(r - d.lastR);
      const dc = Math.abs(c - d.lastC);
      const isAdjacent = (dr + dc === 1);
      const isSameCell = (r === d.lastR && c === d.lastC);

      if (isSameCell) return { ...d, x: clientX, y: clientY };

      if (!isAdjacent) return { ...d, x: clientX, y: clientY };

      const cell = grid[r]?.[c];
      if (!cell) return { ...d, x: clientX, y: clientY };

      // Moving to a source with capacity: collect it
      if (cell.type === 'source' && cell.capacity > 0 && !d.collected.includes(cell.id)) {
        return {
          ...d, x: clientX, y: clientY,
          collected: [...d.collected, cell.id],
          path: [...d.path, { r, c }],
          lastR: r, lastC: c, targetId: null,
        };
      }

      // Moving to a drained source (capacity=0): pass through without collecting
      if (cell.type === 'source' && (cell.capacity === 0 || d.collected.includes(cell.id))) {
        return {
          ...d, x: clientX, y: clientY,
          path: [...d.path, { r, c }],
          lastR: r, lastC: c, targetId: null,
        };
      }

      // Moving to a target: mark as hover target
      if (cell.type === 'target' && cell.need > 0) {
        return {
          ...d, x: clientX, y: clientY,
          path: [...d.path, { r, c }],
          lastR: r, lastC: c, targetId: cell.id,
        };
      }

      return { ...d, x: clientX, y: clientY };
    });
  }, [drag, findGridPos, grid]);

  const handlePointerUp = useCallback(() => {
    if (!drag) return;

    if (drag.targetId) {
      const tgtPos = findPos(drag.targetId);
      if (tgtPos) {
        const next = deepCloneGrid(grid);
        const newConns = [...connections];
        let connected = 0;
        for (const srcId of drag.collected) {
          const srcPos = findPos(srcId);
          if (!srcPos) continue;
          const src = next[srcPos.r][srcPos.c];
          const tgt = next[tgtPos.r][tgtPos.c];
          if (src.capacity <= 0 || tgt.need <= 0) continue;
          // Drain min(source capacity, target remaining need) — target can't go below 0
          const transfer = Math.min(src.capacity, tgt.need);
          src.capacity -= transfer;
          tgt.need -= transfer;
          newConns.push({ from: srcId, to: drag.targetId, amount: transfer, path: [...drag.path] });
          connected += transfer;
        }
        if (connected > 0) {
          // Spawn flying circles that follow the grid path sequentially
          const board = boardRef.current;
          if (board) {
            const br = board.getBoundingClientRect();
            // Build waypoints from the drag path (cell centres)
            const waypoints = [];
            for (const pt of drag.path) {
              const cell = grid[pt.r]?.[pt.c];
              if (!cell) continue;
              const el = cellRefs.current[cell.id];
              if (!el) continue;
              const er = el.getBoundingClientRect();
              waypoints.push({ x: er.left - br.left + er.width / 2, y: er.top - br.top + er.height / 2 });
            }

            if (waypoints.length >= 2) {
              const circles = [];
              // Find the path index for each collected source
              const srcIndices = [];
              for (const srcId of drag.collected) {
                const pos = findPos(srcId);
                if (!pos) continue;
                const cap = grid[pos.r][pos.c]?.capacity ?? 0;
                if (cap <= 0) continue;
                const pathIdx = drag.path.findIndex(p => p.r === pos.r && p.c === pos.c);
                if (pathIdx < 0) continue;
                srcIndices.push({ srcId, pathIdx, capacity: cap });
              }

              // Sort by pathIdx descending — closest to target animates first
              srcIndices.sort((a, b) => b.pathIdx - a.pathIdx);

              // Each source travels from its position in the path to the end (target)
              // Sequentially: each circle starts after the previous finishes
              const STEP_MS = 120; // ms per grid step
              let cumulativeDelay = 0;
              for (const { srcId, pathIdx, capacity } of srcIndices) {
                // Subpath from this source's position to the target (end of path)
                const subWaypoints = waypoints.slice(pathIdx);
                const steps = subWaypoints.length - 1;
                const duration = steps * STEP_MS;
                circles.push({
                  id: `${srcId}-${Date.now()}`,
                  waypoints: subWaypoints,
                  capacity,
                  delay: cumulativeDelay,
                  duration,
                });
                cumulativeDelay += duration + 80; // small gap between circles
              }

              if (circles.length > 0) {
                setFlyingDots(circles);
                const totalTime = cumulativeDelay + 200;
                setTimeout(() => setFlyingDots([]), totalTime);
              }
            }
          }

          setGrid(next);
          setConnections(newConns);
          playPop();

          if (checkWin(next)) {
            const newScore = score + 1;
            setScore(newScore);
            reportScore(newScore);
            setWon(true);
            playSuccess();
            setTimeout(() => loadLevel(levelIdx + 1), 1200);
          }
        }
      }
    }
    setDrag(null);
  }, [drag, findPos, grid, connections, checkWin, score, reportScore, levelIdx, loadLevel, playPop, playSuccess]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e) => handlePointerMove(e);
    const onUp   = (e) => handlePointerUp(e);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [drag, handlePointerMove, handlePointerUp]);

  /* ── Undo (1 connection per undo) ───────────────────── */
  const undo = useCallback(() => {
    if (connections.length === 0 || won) return;
    playClick();
    const last = connections[connections.length - 1];
    const amount = last.amount ?? 1;
    const next = deepCloneGrid(grid);
    const srcPos = findPos(last.from);
    const tgtPos = findPos(last.to);
    if (srcPos) next[srcPos.r][srcPos.c].capacity += amount;
    if (tgtPos) next[tgtPos.r][tgtPos.c].need += amount;
    setGrid(next);
    setConnections(connections.slice(0, -1));
  }, [connections, grid, won, playClick, findPos]);

  const restart = useCallback(() => {
    playClick();
    setGrid(deepCloneGrid(levels[levelIdx].grid));
    setConnections([]);
    setWon(false);
  }, [levelIdx, levels, playClick]);

  /* ── Tutorial hand ──────────────────────────────────── */
  const tutorialAnim = levelIdx === 0 && connections.length === 0 && !won;
  const [handStyle, setHandStyle] = useState({});
  useEffect(() => {
    if (!tutorialAnim) return;
    const update = () => {
      const srcEl = cellRefs.current['s1'];
      const tgtEl = cellRefs.current['t1'];
      const board = boardRef.current;
      if (!srcEl || !tgtEl || !board) return;
      const br = board.getBoundingClientRect();
      const sr = srcEl.getBoundingClientRect();
      const tr = tgtEl.getBoundingClientRect();
      const sx = sr.left - br.left + sr.width / 2;
      const sy = sr.top - br.top + sr.height / 2;
      const tx = tr.left - br.left + tr.width / 2;
      const ty = tr.top - br.top + tr.height / 2;
      setHandStyle({ left: sx, top: sy, '--tx': `${tx - sx}px`, '--ty': `${ty - sy}px` });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [tutorialAnim]);

  /* Drag lines: show path between collected cells only (no diagonal trailing line) */
  const dragLines = useMemo(() => {
    if (!drag || drag.path.length < 2) return [];
    const lines = [];
    for (let i = 0; i < drag.path.length - 1; i++) {
      const cellA = grid[drag.path[i].r]?.[drag.path[i].c];
      const cellB = grid[drag.path[i + 1].r]?.[drag.path[i + 1].c];
      if (!cellA || !cellB) continue;
      const from = getCentre(cellA.id);
      const to = getCentre(cellB.id);
      if (from && to) lines.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y });
    }
    return lines;
  }, [drag, getCentre, grid]);

  const cols = grid[0]?.length ?? 0;
  const borderRadii = useMemo(() => computeBorderClasses(grid), [grid]);

  return (
    <div className={styles.wrapper}>
      {/* Top controls */}
      <div className={styles.topBar}>
        <div className={styles.levelLabel}>Level {levelIdx + 1}</div>
        <div className={styles.controls}>
          <button className={styles.ctrlBtn} onClick={restart} disabled={won} aria-label="Restart" title="Restart">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
            </svg>
          </button>
          <button className={styles.ctrlBtn} onClick={undo} disabled={connections.length === 0 || won} aria-label="Undo" title="Undo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Tutorial hint bar */}
      {tutorialAnim && (
        <div className={styles.tutorialBar}>
          <div className={styles.tutorialPreview}>
            <div className={styles.tutorialDot} />
            <div className={styles.tutorialSquare}>2</div>
          </div>
          <div className={styles.tutorialHandIcon}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M6.5 1.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5V9h1V2.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5V9h1V4c0-.83.67-1.5 1.5-1.5S18 3.17 18 4v6.5h1V7c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5v8c0 4.14-3.36 7.5-7.5 7.5h-1C9.36 22.5 6 19.14 6 15V7.5c0-.17.03-.33.08-.49L6.5 1.5z"/>
            </svg>
          </div>
        </div>
      )}

      {won && <div className={styles.wonText}>Level Complete!</div>}

      {/* Grid board */}
      <div className={styles.board} ref={boardRef} style={{ '--cols': cols }}>
        <svg className={styles.svgOverlay} width="100%" height="100%">
          {connLines.map((l, i) => (
            <line key={i} className={styles.connectionLine}
              x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
          ))}
          {dragLines.map((l, i) => (
            <line key={`drag-${i}`} className={styles.dragLine}
              x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} />
          ))}
        </svg>

        {grid.map((row, ri) =>
          row.map((cell, ci) => {
            if (!cell) return <div key={`${ri}-${ci}`} className={styles.emptyCell} />;

            const cellStyle = { borderRadius: borderRadii[ri][ci] };

            if (cell.type === 'source') {
              const isCollected = drag && drag.collected.includes(cell.id);
              return (
                <div key={cell.id} className={styles.cellBg} style={cellStyle}>
                  <div
                    ref={el => { cellRefs.current[cell.id] = el; }}
                    className={`${styles.source} ${cell.capacity === 0 ? styles.sourceEmpty : ''} ${isCollected ? styles.sourceCollected : ''}`}
                    onMouseDown={e => handlePointerDown(e, cell.id)}
                    onTouchStart={e => handlePointerDown(e, cell.id)}
                  >
                    {Array.from({ length: cell.capacity }).map((__, i) => (
                      <span key={i} className={styles.sourceDot} />
                    ))}
                  </div>
                </div>
              );
            }

            return (
              <div key={cell.id} className={styles.cellBg} style={cellStyle}>
                <div
                  ref={el => { cellRefs.current[cell.id] = el; }}
                  className={`${styles.target} ${cell.need === 0 ? styles.targetComplete : ''}`}
                >
                  {cell.need}
                </div>
              </div>
            );
          })
        )}

        {/* Flying circles animation */}
        {flyingDots.map(circle => (
          <FlyingCircle key={circle.id} {...circle} />
        ))}
      </div>
    </div>
  );
}

DotEdGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playPop:     PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playClick:   PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

/* ──────────────────────────────────────────────────────────
   Exported wrapper (GameShell integration)
────────────────────────────────────────────────────────── */
export function DotEd({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack }) {
  const { fireComplete } = useGameCallback({ memberId, gameId: 'dot-ed', callbackUrl, onComplete });

  return (
    <GameShell
      gameId="dot-ed"
      title="Dot.ed"
      instructions="Swipe from any red dot to any blue square to connect them. Each red dot shows white pips for its capacity. Each blue square shows how many connections it needs. Drain every dot and fill every square to complete the level!"
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireComplete}
      onBack={onBack}
    >
      {({ difficulty: diff, onComplete: complete, reportScore, secondsLeft, playClick, playSuccess, playPop, playFail }) => (
        <DotEdGame
          difficulty={diff}
          onComplete={complete}
          reportScore={reportScore}
          secondsLeft={secondsLeft}
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
};
