import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './Zip.module.css';

/* ──────────────────────────────────────────────────────────
   Zip — Hamiltonian Path puzzle
   Draw a path from 1 → 2 → 3 → … visiting every cell exactly once.
   Movement: horizontal/vertical only, no crossing.
────────────────────────────────────────────────────────── */

/*
  Level format:
  - size: grid dimension (size × size)
  - numbers: { [cellIndex]: waypointNumber }  (1-based, must visit in order)
  - walls: Set or array of "r,c|r2,c2" (blocked edge between adjacent cells)

  cellIndex = row * size + col
*/

const LEVELS = {
  easy: [
    // 4×4 level 1
    {
      size: 4,
      numbers: { 0: 1, 6: 2, 9: 3, 15: 4 },
      walls: [],
    },
    // 4×4 level 2
    {
      size: 4,
      numbers: { 3: 1, 5: 2, 10: 3, 12: 4 },
      walls: [],
    },
    // 5×5 level 3
    {
      size: 5,
      numbers: { 0: 1, 4: 2, 12: 3, 20: 4, 24: 5 },
      walls: [],
    },
    // 5×5 level 4
    {
      size: 5,
      numbers: { 2: 1, 10: 2, 14: 3, 22: 4, 24: 5 },
      walls: [],
    },
  ],
  medium: [
    // 5×5 level 1
    {
      size: 5,
      numbers: { 0: 1, 6: 2, 12: 3, 18: 4, 24: 5 },
      walls: [],
    },
    // 5×5 level 2
    {
      size: 5,
      numbers: { 4: 1, 8: 2, 12: 3, 16: 4, 20: 5 },
      walls: [],
    },
    // 6×6 level 3
    {
      size: 6,
      numbers: { 0: 1, 7: 2, 14: 3, 21: 4, 28: 5, 35: 6 },
      walls: [],
    },
    // 6×6 level 4
    {
      size: 6,
      numbers: { 5: 1, 10: 2, 17: 3, 24: 4, 29: 5, 30: 6 },
      walls: [],
    },
  ],
  hard: [
    // 6×6 level 1
    {
      size: 6,
      numbers: { 0: 1, 11: 2, 24: 3, 35: 4 },
      walls: [],
    },
    // 6×6 level 2
    {
      size: 6,
      numbers: { 2: 1, 9: 2, 14: 3, 21: 4, 26: 5, 33: 6 },
      walls: [],
    },
    // 7×7 level 3
    {
      size: 7,
      numbers: { 0: 1, 12: 2, 24: 3, 36: 4, 48: 5 },
      walls: [],
    },
    // 7×7 level 4
    {
      size: 7,
      numbers: { 6: 1, 14: 2, 24: 3, 34: 4, 42: 5, 48: 6 },
      walls: [],
    },
  ],
};

const TIME_LIMITS = { easy: null, medium: 300, hard: 240 };

function wallKey(r1, c1, r2, c2) {
  const a = `${r1},${c1}`;
  const b = `${r2},${c2}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/* ──────────────────────────────────────────────────────────
   Inner game
────────────────────────────────────────────────────────── */
function ZipGame({ difficulty, onComplete, reportScore, secondsLeft, playPop, playSuccess, playClick, playFail }) {
  const levels = LEVELS[difficulty] ?? LEVELS.easy;
  const totalLevels = levels.length;

  const [levelIdx, setLevelIdx] = useState(0);
  const [path, setPath] = useState([]);          // array of cellIndex (visited in order)
  const [dragging, setDragging] = useState(false);
  const [won, setWon] = useState(false);
  const [score, setScore] = useState(0);
  const [shake, setShake] = useState(false);

  const boardRef = useRef(null);
  const pathRef = useRef([]);   // mirrors path state, safe to read in event handlers
  const level = levels[levelIdx];
  const { size, numbers, walls } = level;
  const wallSet = useMemo(() => new Set(walls), [walls]);
  const totalCells = size * size;

  // Ordered waypoints that the path must pass through
  const maxWaypoint = useMemo(() =>
    Math.max(...Object.values(numbers)), [numbers]);

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: totalLevels, completed: false });
  }, [secondsLeft, score, totalLevels, onComplete]);

  const loadLevel = useCallback((idx, finalScore) => {
    if (idx >= totalLevels) {
      onComplete({ finalScore, maxScore: totalLevels, completed: true });
      return;
    }
    setLevelIdx(idx);
    pathRef.current = [];
    setPath([]);
    setWon(false);
  }, [totalLevels, onComplete]);

  /* Check if moving to newIdx is valid from current path end */
  const canMove = useCallback((fromIdx, toIdx) => {
    const fr = Math.floor(fromIdx / size);
    const fc = fromIdx % size;
    const tr = Math.floor(toIdx / size);
    const tc = toIdx % size;
    // Must be orthogonally adjacent
    const dr = Math.abs(tr - fr);
    const dc = Math.abs(tc - fc);
    if (dr + dc !== 1) return false;
    // No wall between them
    if (wallSet.has(wallKey(fr, fc, tr, tc))) return false;
    return true;
  }, [size, wallSet]);

  /* Next required waypoint number */
  const nextWaypoint = useCallback((currentPath) => {
    // Find highest waypoint already in path
    let highest = 0;
    for (const idx of currentPath) {
      if (numbers[idx] != null && numbers[idx] > highest) {
        highest = numbers[idx];
      }
    }
    return highest + 1;
  }, [numbers]);

  /* Check if extending path to toIdx is allowed */
  const isValidExtension = useCallback((currentPath, toIdx) => {
    if (currentPath.includes(toIdx)) return false;
    const fromIdx = currentPath[currentPath.length - 1];
    if (!canMove(fromIdx, toIdx)) return false;
    // If toIdx is a waypoint, it must be the next one in sequence
    if (numbers[toIdx] != null) {
      const next = nextWaypoint(currentPath);
      if (numbers[toIdx] !== next) return false;
    }
    return true;
  }, [canMove, numbers, nextWaypoint]);

  /* Check win: path covers all cells AND all waypoints were visited in order
     (order is already enforced by isValidExtension during drawing) */
  const checkWin = useCallback((currentPath) => {
    if (currentPath.length !== totalCells) return false;
    return Object.keys(numbers).every(idx => currentPath.includes(Number(idx)));
  }, [totalCells, numbers]);

  /* Get cell index from pointer position */
  const getCellFromPointer = useCallback((clientX, clientY) => {
    const board = boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const cellW = rect.width / size;
    const cellH = rect.height / size;
    const c = Math.floor(x / cellW);
    const r = Math.floor(y / cellH);
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    return r * size + c;
  }, [size]);

  const handlePointerDown = useCallback((e, cellIdx) => {
    // Must start on waypoint "1"
    if (numbers[cellIdx] !== 1) return;
    e.preventDefault();
    playClick();
    pathRef.current = [cellIdx];
    setPath([cellIdx]);
    setDragging(true);
    setShake(false);
  }, [numbers, playClick]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const toIdx = getCellFromPointer(clientX, clientY);
    if (toIdx === null) return;

    const prev = pathRef.current;
    const last = prev[prev.length - 1];
    if (toIdx === last) return;

    let next;
    // Backtrack: if toIdx is second-to-last, remove last cell
    if (prev.length >= 2 && prev[prev.length - 2] === toIdx) {
      next = prev.slice(0, -1);
    } else if (isValidExtension(prev, toIdx)) {
      next = [...prev, toIdx];
    } else {
      return;
    }

    pathRef.current = next;
    setPath(next);
  }, [dragging, getCellFromPointer, isValidExtension]);

  const handlePointerUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);

    const current = pathRef.current;

    if (checkWin(current)) {
      const newScore = score + 1;
      setScore(newScore);
      reportScore(newScore);
      setWon(true);
      playSuccess();
      setTimeout(() => loadLevel(levelIdx + 1, newScore), 1400);
      return;
    }

    // Invalid path — shake and reset
    if (current.length > 1) {
      setShake(true);
      playFail();
      setTimeout(() => {
        setShake(false);
        pathRef.current = [];
        setPath([]);
      }, 600);
      return;
    }

    pathRef.current = [];
    setPath([]);
  }, [dragging, checkWin, score, reportScore, playSuccess, playFail, loadLevel, levelIdx]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => handlePointerMove(e);
    const onUp   = () => handlePointerUp();
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
  }, [dragging, handlePointerMove, handlePointerUp]);

  const restart = useCallback(() => {
    playClick();
    pathRef.current = [];
    setPath([]);
    setWon(false);
    setShake(false);
  }, [playClick]);

  /* Colour gradient along path */
  const pathLength = path.length;
  function getPathColor(position) {
    // Gradient: blue → purple → pink
    const t = pathLength <= 1 ? 0 : position / (pathLength - 1);
    const r = Math.round(17 + (219 - 17) * t);
    const g = Math.round(85 + (0 - 85) * t);
    const b = Math.round(204 + (180 - 204) * t);
    return `rgb(${r},${g},${b})`;
  }

  const pathSet = useMemo(() => new Set(path), [path]);
  const pathIndexOf = useMemo(() => {
    const map = {};
    path.forEach((idx, pos) => { map[idx] = pos; });
    return map;
  }, [path]);

  /* Progress: how many waypoints have been hit in order */
  const waypointsHit = useMemo(() => {
    let count = 0;
    for (let w = 1; w <= maxWaypoint; w++) {
      const idx = Object.entries(numbers).find(([, v]) => v === w)?.[0];
      if (idx != null && pathSet.has(Number(idx))) count++;
      else break;
    }
    return count;
  }, [numbers, maxWaypoint, pathSet]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.topBar}>
        <div className={styles.levelLabel}>Level {levelIdx + 1}</div>
        <div className={styles.progress}>
          {Array.from({ length: maxWaypoint }).map((_, i) => (
            <div
              key={i}
              className={`${styles.progressDot} ${i < waypointsHit ? styles.progressDotDone : ''}`}
            />
          ))}
        </div>
        <button
          className={styles.ctrlBtn}
          onClick={restart}
          disabled={won}
          aria-label="Restart"
          title="Restart level"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
        </button>
      </div>

      {won && <div className={styles.wonBanner}>Level Complete! 🎉</div>}

      <div
        ref={boardRef}
        className={`${styles.board} ${shake ? styles.shake : ''}`}
        style={{ '--size': size }}
        aria-label={`Zip puzzle grid, ${size} by ${size}`}
      >
        {/* SVG overlay for path lines */}
        <svg className={styles.svgOverlay} viewBox={`0 0 ${size * 100} ${size * 100}`} preserveAspectRatio="none">
          {path.length >= 2 && path.slice(1).map((toIdx, i) => {
            const fromIdx = path[i];
            const fr = Math.floor(fromIdx / size);
            const fc = fromIdx % size;
            const tr = Math.floor(toIdx / size);
            const tc = toIdx % size;
            const x1 = fc * 100 + 50;
            const y1 = fr * 100 + 50;
            const x2 = tc * 100 + 50;
            const y2 = tr * 100 + 50;
            const color = getPathColor(i);
            return (
              <line
                key={`${fromIdx}-${toIdx}`}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={color}
                strokeWidth="28"
                strokeLinecap="round"
                opacity="0.75"
              />
            );
          })}
        </svg>

        {/* Cells */}
        {Array.from({ length: totalCells }).map((_, idx) => {
          const r = Math.floor(idx / size);
          const c = idx % size;
          const waypoint = numbers[idx];
          const inPath = pathSet.has(idx);
          const posInPath = pathIndexOf[idx];
          const isHead = path.length > 0 && path[path.length - 1] === idx;
          const isStart = path[0] === idx;
          const color = inPath ? getPathColor(posInPath) : null;

          return (
            <div
              key={idx}
              className={`${styles.cell} ${inPath ? styles.cellInPath : ''} ${isHead ? styles.cellHead : ''} ${waypoint != null ? styles.cellWaypoint : ''}`}
              style={{
                '--r': r,
                '--c': c,
                '--path-color': color,
              }}
              onMouseDown={e => handlePointerDown(e, idx)}
              onTouchStart={e => handlePointerDown(e, idx)}
              aria-label={waypoint != null ? `Waypoint ${waypoint}` : `Cell ${r + 1},${c + 1}`}
            >
              {waypoint != null && (
                <span className={`${styles.waypointNum} ${inPath ? styles.waypointNumVisited : ''}`}>
                  {waypoint}
                </span>
              )}
              {isHead && !won && (
                <span className={styles.headDot} style={{ background: color }} />
              )}
            </div>
          );
        })}
      </div>

      <p className={styles.hint}>
        {path.length === 0
          ? 'Start from the cell marked 1'
          : path.length === totalCells && !won
          ? 'Connect all cells — release to check!'
          : `${path.length} / ${totalCells} cells`}
      </p>
    </div>
  );
}

ZipGame.propTypes = {
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
   Exported wrapper
────────────────────────────────────────────────────────── */
export function Zip({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack }) {
  const { fireComplete } = useGameCallback({ memberId, gameId: 'zip', callbackUrl, onComplete });

  return (
    <GameShell
      gameId="zip"
      title="Zip"
      instructions="Draw a path starting from 1, passing through each number in order. Your path must cover every single cell on the grid. Move horizontally or vertically — no crossing!"
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireComplete}
      onBack={onBack}
    >
      {({ difficulty: diff, onComplete: complete, reportScore, secondsLeft, playClick, playSuccess, playPop, playFail }) => (
        <ZipGame
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

Zip.propTypes = {
  memberId:    PropTypes.string,
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:  PropTypes.func,
  callbackUrl: PropTypes.string,
  onBack:      PropTypes.func,
};
