import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './Sokoban.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/* ── Tile types ── */
const WALL  = '#';
const FLOOR = ' ';
const BOX   = '$';
const GOAL  = '.';
const BOX_ON_GOAL = '*';
const PLAYER = '@';
const PLAYER_ON_GOAL = '+';

/* ── Level packs by difficulty ── */
const LEVELS = {
  easy: [
    // 1 – straight push
    [
      '######',
      '#    #',
      '# $  #',
      '# .@ #',
      '#    #',
      '######',
    ],
    // 2 – two boxes
    [
      '#######',
      '#     #',
      '# $.$ #',
      '#  @  #',
      '#  .  #',
      '#     #',
      '#######',
    ],
    // 3 – L-shape
    [
      '  ####',
      '###  #',
      '#  $.#',
      '# #. #',
      '# $@ #',
      '#    #',
      '######',
    ],
    // 4 – corridor
    [
      '########',
      '#      #',
      '# $ $  #',
      '# .@.  #',
      '#      #',
      '########',
    ],
    // 5 – corner push
    [
      '#####',
      '#   #',
      '# $ ##',
      '# .  #',
      '##$. #',
      ' # @ #',
      ' #   #',
      ' #####',
    ],
  ],
  medium: [
    // 1
    [
      '  #####',
      '###   #',
      '# $ # #',
      '# #.  #',
      '# $.# #',
      '##    #',
      ' #@ ###',
      ' ####',
    ],
    // 2
    [
      '########',
      '#   #  #',
      '# $  $ #',
      '## ## ##',
      ' #.@. #',
      ' # $  #',
      ' #  . #',
      ' ######',
    ],
    // 3
    [
      '  ####',
      '  #  ###',
      '  #  $ #',
      '### .# #',
      '#  .$ ##',
      '# #.$ #',
      '#   @ #',
      '#######',
    ],
    // 4
    [
      '#######',
      '#  .  #',
      '# #$# #',
      '#  $  #',
      '##.@.##',
      '#  $  #',
      '# #$# #',
      '#  .  #',
      '#######',
    ],
    // 5
    [
      ' ######',
      '##    #',
      '#  ## #',
      '# #...#',
      '#  $$ #',
      '###$  #',
      '  # @##',
      '  ####',
    ],
    // 6
    [
      '######',
      '#    ##',
      '# ## .#',
      '# $  .#',
      '## $#.#',
      ' #$ @ #',
      ' #  ###',
      ' ####',
    ],
  ],
  hard: [
    // 1
    [
      '  #####',
      '###   #',
      '#.$$  #',
      '#.# $ #',
      '#.  $ #',
      '#.@ ###',
      '#  ##',
      '####',
    ],
    // 2
    [
      '  ######',
      '  #    #',
      '###$## #',
      '#  $ ..#',
      '# $  ..#',
      '### $# #',
      '  #  @ #',
      '  ######',
    ],
    // 3
    [
      ' #######',
      ' #  .  #',
      ' #  $  #',
      '##$.$##',
      '#  $  #',
      '#  .. @#',
      '########',
    ],
    // 4
    [
      '  ######',
      '###    #',
      '#  $.$ #',
      '# .#.  #',
      '# $#$  #',
      '##  .@##',
      ' ######',
    ],
    // 5
    [
      '########',
      '#  . . #',
      '# $$$$ #',
      '#. # .##',
      '#  @  #',
      '#######',
    ],
    // 6
    [
      '  ####',
      '###  ####',
      '#   $.  #',
      '# #.##  #',
      '# #.. $ #',
      '#   $#$ #',
      '####  @ #',
      '   ######',
    ],
    // 7
    [
      '#######',
      '#     #',
      '# .#. #',
      '# $$$ #',
      '##.#.##',
      '# $$$ #',
      '# .#. #',
      '#  @  #',
      '#######',
    ],
  ],
};

const TIME_LIMITS = {
  easy:   null,
  medium: null,
  hard:   null,
};

/* ── Parse a level string array into a grid ── */
function parseLevel(lines) {
  const height = lines.length;
  const width = Math.max(...lines.map(l => l.length));
  const grid = [];
  let playerR = 0, playerC = 0;

  for (let r = 0; r < height; r++) {
    const row = [];
    for (let c = 0; c < width; c++) {
      const ch = (lines[r] || '')[c] || ' ';
      if (ch === PLAYER || ch === PLAYER_ON_GOAL) {
        playerR = r;
        playerC = c;
      }
      row.push(ch);
    }
    grid.push(row);
  }

  return { grid, playerR, playerC, height, width };
}

/* ── Check if all goals are covered ── */
function isSolved(grid) {
  for (const row of grid) {
    for (const cell of row) {
      if (cell === GOAL || cell === PLAYER_ON_GOAL) return false;
    }
  }
  return true;
}

/* ── Try to move in a direction; returns new state or null ── */
function tryMove(grid, playerR, playerC, dr, dc) {
  const rows = grid.length;
  const cols = grid[0].length;
  const nr = playerR + dr;
  const nc = playerC + dc;

  if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return null;

  const target = grid[nr][nc];

  // Wall – can't move
  if (target === WALL) return null;

  // Box or box-on-goal – try to push
  if (target === BOX || target === BOX_ON_GOAL) {
    const br = nr + dr;
    const bc = nc + dc;
    if (br < 0 || br >= rows || bc < 0 || bc >= cols) return null;
    const behind = grid[br][bc];
    if (behind !== FLOOR && behind !== GOAL) return null;

    // Clone grid
    const newGrid = grid.map(row => [...row]);

    // Move box
    newGrid[br][bc] = behind === GOAL ? BOX_ON_GOAL : BOX;
    // Player moves to box's old spot
    const boxWasOnGoal = target === BOX_ON_GOAL;
    newGrid[nr][nc] = boxWasOnGoal ? PLAYER_ON_GOAL : PLAYER;
    // Player's old spot
    const playerWasOnGoal = grid[playerR][playerC] === PLAYER_ON_GOAL;
    newGrid[playerR][playerC] = playerWasOnGoal ? GOAL : FLOOR;

    return { grid: newGrid, playerR: nr, playerC: nc, pushed: true };
  }

  // Floor or goal – just walk
  if (target === FLOOR || target === GOAL) {
    const newGrid = grid.map(row => [...row]);
    newGrid[nr][nc] = target === GOAL ? PLAYER_ON_GOAL : PLAYER;
    const playerWasOnGoal = grid[playerR][playerC] === PLAYER_ON_GOAL;
    newGrid[playerR][playerC] = playerWasOnGoal ? GOAL : FLOOR;
    return { grid: newGrid, playerR: nr, playerC: nc, pushed: false };
  }

  return null;
}

/* ── Direction helpers ── */
const DIR_MAP = {
  ArrowUp:    [-1,  0],
  ArrowDown:  [ 1,  0],
  ArrowLeft:  [ 0, -1],
  ArrowRight: [ 0,  1],
  w: [-1, 0], W: [-1, 0],
  s: [ 1, 0], S: [ 1, 0],
  a: [ 0,-1], A: [ 0,-1],
  d: [ 0, 1], D: [ 0, 1],
};

/* ── Tile rendering helpers ── */
function tileClass(ch, s) {
  switch (ch) {
    case WALL:           return s.tileWall;
    case FLOOR:          return s.tileFloor;
    case BOX:            return s.tileBox;
    case GOAL:           return s.tileGoal;
    case BOX_ON_GOAL:    return s.tileBoxOnGoal;
    case PLAYER:         return s.tilePlayer;
    case PLAYER_ON_GOAL: return s.tilePlayer;
    default:             return s.tileOutside;
  }
}

// Direction → rotation degrees for the player SVG (default faces up)
const DIR_ROTATION = { up: 0, down: 180, left: 270, right: 90 };

function PlayerSVG({ direction }) {
  const rot = DIR_ROTATION[direction] ?? 0;
  return (
    <svg viewBox="0 0 32 32" width="82%" height="82%" style={{ display: 'block', overflow: 'visible' }}>
      <g transform={`rotate(${rot}, 16, 16)`}>
        {/* Body (torso) — top-down oval */}
        <ellipse cx="16" cy="18" rx="5.5" ry="6" fill="#3B82F6" />
        {/* Head — top-down circle, above body */}
        <circle cx="16" cy="11" r="5.5" fill="#FBBF24" stroke="#D97706" strokeWidth="0.8" />
        {/* Face eyes */}
        <circle cx="14" cy="10.5" r="1" fill="#1e1e1e" />
        <circle cx="18" cy="10.5" r="1" fill="#1e1e1e" />
        {/* Arms stretched forward (upward in default/up direction) */}
        <line x1="11" y1="17" x2="7"  y2="10" stroke="#FBBF24" strokeWidth="2.8" strokeLinecap="round" />
        <line x1="21" y1="17" x2="25" y2="10" stroke="#FBBF24" strokeWidth="2.8" strokeLinecap="round" />
        {/* Hands */}
        <circle cx="7"  cy="9.5" r="2" fill="#FBBF24" stroke="#D97706" strokeWidth="0.8" />
        <circle cx="25" cy="9.5" r="2" fill="#FBBF24" stroke="#D97706" strokeWidth="0.8" />

      </g>
    </svg>
  );
}

function BoxSVG({ onGoal }) {
  return (
    <svg viewBox="0 0 32 32" width="78%" height="78%" style={{ display: 'block' }}>
      <rect x="3" y="3" width="26" height="26" rx="4" fill={onGoal ? '#68d391' : '#c8a96e'} stroke={onGoal ? '#276749' : '#8B6340'} strokeWidth="1.5" />
      {/* Cross straps */}
      <line x1="3" y1="16" x2="29" y2="16" stroke={onGoal ? '#276749' : '#8B6340'} strokeWidth="1.5" />
      <line x1="16" y1="3" x2="16" y2="29" stroke={onGoal ? '#276749' : '#8B6340'} strokeWidth="1.5" />
      {/* Shine */}
      <rect x="5" y="5" width="8" height="4" rx="2" fill="white" opacity="0.25" />
      {onGoal && <text x="16" y="21" textAnchor="middle" fontSize="12" fill="#276749">✓</text>}
    </svg>
  );
}

function GoalSVG() {
  return (
    <svg viewBox="0 0 32 32" width="60%" height="60%" style={{ display: 'block' }}>
      <circle cx="16" cy="16" r="10" fill="none" stroke="#e05252" strokeWidth="2.5" strokeDasharray="4 2" />
      <circle cx="16" cy="16" r="3.5" fill="#e05252" opacity="0.7" />
    </svg>
  );
}

PlayerSVG.propTypes = { direction: PropTypes.string };
BoxSVG.propTypes    = { onGoal: PropTypes.bool };

function tileContent(ch, direction) {
  switch (ch) {
    case BOX:            return <BoxSVG onGoal={false} />;
    case BOX_ON_GOAL:    return <BoxSVG onGoal={true} />;
    case GOAL:           return <GoalSVG />;
    case PLAYER:         return <PlayerSVG direction={direction} />;
    case PLAYER_ON_GOAL: return <PlayerSVG direction={direction} />;
    default:             return null;
  }
}

/* ══════════════════════════════════════════════════════ */
/*  Inner game component                                */
/* ══════════════════════════════════════════════════════ */
function SokobanGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const levels = LEVELS[difficulty] || LEVELS.easy;
  const totalLevels = levels.length;

  const [levelIdx, setLevelIdx] = useState(0);
  const [state, setState] = useState(() => parseLevel(levels[0]));
  const [moves, setMoves] = useState(0);
  const [pushes, setPushes] = useState(0);
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(false);
  const [history, setHistory] = useState([]);
  const [direction, setDirection] = useState('down');
  const wrapperRef = useRef(null);

  // Swipe handling
  const touchStartRef = useRef(null);

  // Focus for keyboard
  useEffect(() => {
    wrapperRef.current?.focus();
  }, [levelIdx]);


  const doMove = useCallback((dr, dc) => {
    if (solved) return;

    // Update facing direction
    if (dr === -1) setDirection('up');
    else if (dr === 1) setDirection('down');
    else if (dc === -1) setDirection('left');
    else if (dc === 1) setDirection('right');

    const result = tryMove(state.grid, state.playerR, state.playerC, dr, dc);
    if (!result) {
      playFail();
      return;
    }

    playClick();
    setHistory(prev => [...prev, { grid: state.grid, playerR: state.playerR, playerC: state.playerC, moves, pushes }]);
    setState({ grid: result.grid, playerR: result.playerR, playerC: result.playerC, height: state.height, width: state.width });
    setMoves(m => m + 1);
    if (result.pushed) setPushes(p => p + 1);

    // Check solved
    if (isSolved(result.grid)) {
      setSolved(true);
      playSuccess();
      const newScore = score + 1;
      setScore(newScore);
      reportScore(newScore);

      setTimeout(() => {
        const nextIdx = levelIdx + 1;
        if (nextIdx >= totalLevels) {
          onComplete({ finalScore: newScore, maxScore: totalLevels, completed: true });
          return;
        }
        setLevelIdx(nextIdx);
        setState(parseLevel(levels[nextIdx]));
        setMoves(0);
        setPushes(0);
        setSolved(false);
        setHistory([]);
      }, 1200);
    }
  }, [state, solved, moves, pushes, score, levelIdx, totalLevels, levels, playClick, playFail, playSuccess, reportScore, onComplete]);

  const handleKey = useCallback((e) => {
    const dir = DIR_MAP[e.key];
    if (dir) {
      e.preventDefault();
      doMove(dir[0], dir[1]);
    }
    // Undo with Z
    if ((e.key === 'z' || e.key === 'Z') && !solved) {
      e.preventDefault();
      setHistory(prev => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        setState({ grid: last.grid, playerR: last.playerR, playerC: last.playerC, height: state.height, width: state.width });
        setMoves(last.moves);
        setPushes(last.pushes);
        return prev.slice(0, -1);
      });
    }
  }, [doMove, solved, state.height, state.width]);

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const minSwipe = 30;

    if (Math.abs(dx) < minSwipe && Math.abs(dy) < minSwipe) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      doMove(0, dx > 0 ? 1 : -1);
    } else {
      doMove(dy > 0 ? 1 : -1, 0);
    }
    touchStartRef.current = null;
  }, [doMove]);

  const handleUndo = useCallback(() => {
    if (solved || history.length === 0) return;
    playClick();
    const last = history[history.length - 1];
    setState({ grid: last.grid, playerR: last.playerR, playerC: last.playerC, height: state.height, width: state.width });
    setMoves(last.moves);
    setPushes(last.pushes);
    setHistory(prev => prev.slice(0, -1));
  }, [solved, history, state.height, state.width, playClick]);

  const handleRestart = useCallback(() => {
    if (solved) return;
    playClick();
    setState(parseLevel(levels[levelIdx]));
    setMoves(0);
    setPushes(0);
    setHistory([]);
  }, [solved, levels, levelIdx, playClick]);

  // Compute cell size based on grid dimensions and screen width
  // Reserve 32px side padding (2×16px) so board fits on 320px screens
  const maxBoard = Math.min(420, (typeof window !== 'undefined' ? window.innerWidth : 420) - 32);
  const cellSize = Math.max(30, Math.min(52, Math.floor(maxBoard / Math.max(state.width, state.height))));

  return (
    <div
      className={styles.wrapper}
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={handleKey}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderLabel}>{t.games['sokoban'].label}</span>
          <span className={styles.infoHeaderSub}>{t.common.level} {levelIdx + 1} {t.common.of} {totalLevels} · {moves} {t.common.movesLeft}</span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{pushes}</span>
          <span className={styles.infoBadgeSub}>pushes</span>
        </div>
      </div>

      {/* Grid */}
      <div
        className={`${styles.board} ${solved ? styles.boardSolved : ''}`}
        style={{
          gridTemplateColumns: `repeat(${state.width}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${state.height}, ${cellSize}px)`,
        }}
      >
        {state.grid.map((row, r) =>
          row.map((ch, c) => {
            const cls = tileClass(ch, styles);
            const content = tileContent(ch, direction);
            return (
              <div
                key={`${r}-${c}`}
                className={`${styles.tile} ${cls}`}
                style={{ width: cellSize, height: cellSize }}
              >
                {content}
              </div>
            );
          })
        )}
      </div>

      {/* D-pad controls for mobile */}
      <div className={styles.controls}>
        <div className={styles.dpadRow}>
          <button className={styles.dpadBtn} onClick={() => doMove(-1, 0)} aria-label="Move up">▲</button>
        </div>
        <div className={styles.dpadRow}>
          <button className={styles.dpadBtn} onClick={() => doMove(0, -1)} aria-label="Move left">◀</button>
          <div className={styles.dpadCenter} />
          <button className={styles.dpadBtn} onClick={() => doMove(0, 1)} aria-label="Move right">▶</button>
        </div>
        <div className={styles.dpadRow}>
          <button className={styles.dpadBtn} onClick={() => doMove(1, 0)} aria-label="Move down">▼</button>
        </div>
      </div>

      {/* Action buttons */}
      <div className={styles.actions}>
        <button
          className={styles.actionBtn}
          onClick={handleUndo}
          disabled={solved || history.length === 0}
          aria-label="Undo last move"
        >
          ↩ Undo
        </button>
        <button
          className={styles.actionBtn}
          onClick={handleRestart}
          disabled={solved}
          aria-label="Restart level"
        >
          🔄 Restart
        </button>
      </div>
    </div>
  );
}

SokobanGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

/* ══════════════════════════════════════════════════════ */
/*  Outer wrapper with GameShell                         */
/* ══════════════════════════════════════════════════════ */
export function Sokoban({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete } = useGameCallback({ memberId, gameId: 'sokoban', callbackUrl, onComplete });

  return (
    <GameShell
      gameId="sokoban"
      title={t.games['sokoban'].title}
      instructions={t.games['sokoban'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <SokobanGame
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          secondsLeft={secondsLeft}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
        />
      )}
    </GameShell>
  );
}

Sokoban.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
