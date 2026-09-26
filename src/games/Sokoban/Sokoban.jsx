import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './Sokoban.module.css';
import { useTranslation } from '../../i18n/useTranslation';
import { DIRS, parseLevel, tryMove, isSolved, walkPath, nextHint, starsFor } from './sokobanLogic';

/*
 * Sokoban for seniors: no clock, a few hand-picked puzzles per difficulty
 * (every one checked solvable by the solver in sokobanLogic.test.js).
 * Hint shows the next step, Undo / Start over are always available, and
 * each puzzle earns 1-3 stars depending on how much help was used.
 */

/* '#' wall, ' ' floor, '$' box, '.' target, '@' you */
export const LEVELS = {
  easy: [
    [
      '  ####',
      '###  #',
      '#  $.#',
      '# #. #',
      '# $@ #',
      '#    #',
      '######',
    ],
    [
      '########',
      '#  #   #',
      '# $  $ #',
      '#  ##  #',
      '# .  . #',
      '#   @  #',
      '########',
    ],
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
    [
      ' #####',
      '##   #',
      '# $# ##',
      '# $ . #',
      '#. @  #',
      '#######',
    ],
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
    [
      '#######',
      '#. .  #',
      '# $$  #',
      '## #$ #',
      '#  . @#',
      '#######',
    ],
    [
      '  #####',
      '###   #',
      '# $ $ #',
      '# #.# #',
      '# .@. #',
      '## $ ##',
      ' #   #',
      ' #####',
    ],
  ],
  hard: [
    [
      '########',
      '#  . . #',
      '# $$$$ #',
      '#. # .##',
      '#  @  #',
      '#######',
    ],
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
    [
      ' #######',
      ' #  .  #',
      ' #  $  #',
      '##$.$##',
      '#  $  #',
      '#  .. @#',
      '########',
    ],
    [
      '########',
      '#   #  #',
      '# $   .#',
      '# #$## #',
      '#.  $ .#',
      '# #@ $ #',
      '#   . ##',
      '#######',
    ],
  ],
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };
const ARROWS = { up: '⬆', down: '⬇', left: '⬅', right: '➡' };
const KEY_DIRS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

function PlayerSVG({ direction }) {
  const rot = { up: 0, right: 90, down: 180, left: 270 }[direction] ?? 180;
  return (
    <svg viewBox="0 0 32 32" width="84%" height="84%" aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <g transform={`rotate(${rot}, 16, 16)`}>
        <ellipse cx="16" cy="19" rx="6.5" ry="7" fill="#1d4ed8" stroke="#1e3a8a" strokeWidth="1" />
        <line x1="10.5" y1="17" x2="7" y2="10" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
        <line x1="21.5" y1="17" x2="25" y2="10" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
        <circle cx="16" cy="11.5" r="6" fill="#fcd34d" stroke="#b45309" strokeWidth="1" />
        <circle cx="13.8" cy="10.5" r="1.1" fill="#111827" />
        <circle cx="18.2" cy="10.5" r="1.1" fill="#111827" />
      </g>
    </svg>
  );
}
PlayerSVG.propTypes = { direction: PropTypes.string };

function BoxSVG({ onGoal }) {
  const fill = onGoal ? '#f59e0b' : '#b7834a';
  const edge = onGoal ? '#78350f' : '#5b3a1a';
  return (
    <svg viewBox="0 0 32 32" width="86%" height="86%" aria-hidden="true" style={{ display: 'block' }}>
      <rect x="2.5" y="2.5" width="27" height="27" rx="4" fill={fill} stroke={edge} strokeWidth="2" />
      <rect x="6.5" y="6.5" width="19" height="19" rx="2" fill="none" stroke={edge} strokeWidth="1.5" opacity="0.6" />
      {!onGoal && (
        <>
          <line x1="6.5" y1="6.5" x2="25.5" y2="25.5" stroke={edge} strokeWidth="1.5" opacity="0.6" />
          <line x1="25.5" y1="6.5" x2="6.5" y2="25.5" stroke={edge} strokeWidth="1.5" opacity="0.6" />
        </>
      )}
      {onGoal && (
        <>
          <circle cx="16" cy="16" r="8.5" fill="#ffffff" stroke={edge} strokeWidth="1.5" />
          <path d="M11.5 16.3 L14.8 19.5 L20.8 12.8" fill="none" stroke="#111827" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
BoxSVG.propTypes = { onGoal: PropTypes.bool };

function GoalSVG() {
  return (
    <svg viewBox="0 0 32 32" width="70%" height="70%" aria-hidden="true" style={{ display: 'block' }}>
      <circle cx="16" cy="16" r="11" fill="none" stroke="#b91c1c" strokeWidth="3" />
      <circle cx="16" cy="16" r="5" fill="#b91c1c" />
    </svg>
  );
}

/* Largest cell size that lets the whole board fit inside the slot element. */
function useCellSize(slotRef, width, height) {
  const [box, setBox] = useState({ w: 360, h: 360 });
  useEffect(() => {
    const el = slotRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setBox(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [slotRef]);
  const border = 6;
  const fit = Math.floor(Math.min((box.w - border) / width, (box.h - border) / height));
  return Math.max(24, Math.min(60, fit));
}

function freshStats() {
  return { hints: 0, undos: 0, resets: 0 };
}

function SokobanGame({ difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const tg = t.games['sokoban'];
  const puzzles = LEVELS[difficulty] || LEVELS.easy;
  const total = puzzles.length;
  const maxScore = total * 3;

  const [idx, setIdx] = useState(0);
  const level = useMemo(() => parseLevel(puzzles[idx]), [puzzles, idx]);
  const [pos, setPos] = useState(() => ({ player: level.player, boxes: level.boxes }));
  const [history, setHistory] = useState([]);
  const [moves, setMoves] = useState(0);
  const [facing, setFacing] = useState('down');
  const [stars, setStars] = useState(0);
  const [message, setMessage] = useState(null); // { kind, text }
  const [hint, setHint] = useState(null);       // { dir, box, pushDir, walking }
  const [solved, setSolved] = useState(null);   // stars for the solved puzzle
  const [bump, setBump] = useState(0);

  const posRef = useRef(pos);
  const historyRef = useRef(history);
  const statsRef = useRef(freshStats());
  const starsRef = useRef(0);
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const wrapperRef = useRef(null);
  const slotRef = useRef(null);
  const touchRef = useRef(null);
  const timersRef = useRef(new Set());
  posRef.current = pos;
  historyRef.current = history;

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
    return h;
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  const reportRoundRef = useRef(reportRound);
  reportRoundRef.current = reportRound;
  useEffect(() => { reportRoundRef.current?.(idx + 1, total); }, [idx, total]);
  useEffect(() => { wrapperRef.current?.focus({ preventScroll: true }); }, [idx]);

  const say = useCallback((kind, text) => setMessage({ kind, text, id: Date.now() }), []);

  const finishPuzzle = useCallback(() => {
    busyRef.current = true;
    const earned = starsFor(statsRef.current);
    starsRef.current += earned;
    setStars(starsRef.current);
    reportScore(starsRef.current);
    setSolved(earned);
    setHint(null);
    setMessage(null);
    playSuccess();
    later(() => {
      if (idx + 1 >= total) {
        if (doneRef.current) return;
        doneRef.current = true;
        onComplete({ finalScore: starsRef.current, maxScore, completed: true });
        return;
      }
      const next = parseLevel(puzzles[idx + 1]);
      statsRef.current = freshStats();
      setIdx(idx + 1);
      setPos({ player: next.player, boxes: next.boxes });
      setHistory([]);
      setMoves(0);
      setFacing('down');
      setSolved(null);
      busyRef.current = false;
    }, 1800);
  }, [idx, total, maxScore, puzzles, later, onComplete, playSuccess, reportScore]);

  /* One or more steps in a row (a tap on a far tile walks several). */
  const applySteps = useCallback((dirs) => {
    if (busyRef.current || dirs.length === 0) return;
    let cur = posRef.current;
    const snapshots = [];
    let pushedAny = false;
    let blocked = null;
    for (const dir of dirs) {
      const r = tryMove(level, cur, dir);
      setFacing(dir);
      if (r.blocked) { blocked = r.blocked; break; }
      snapshots.push(cur);
      if (r.pushed) pushedAny = true;
      cur = { player: r.player, boxes: r.boxes };
    }
    if (snapshots.length === 0) {
      playFail();
      say('warn', blocked === 'box' ? tg.blocked : tg.wall);
      return;
    }
    playClick();
    setHint(null);
    setMessage(null);
    setPos(cur);
    setHistory(h => [...h, ...snapshots]);
    setMoves(m => m + snapshots.length);
    if (isSolved(level, cur.boxes)) { finishPuzzle(); return; }
    if (pushedAny && cur.boxes.some(b => !level.goals.has(b) && isDeadCell(level, b))) {
      say('warn', tg.deadBox);
    }
  }, [level, finishPuzzle, playClick, playFail, say, tg]);

  const move = useCallback((dir) => applySteps([dir]), [applySteps]);

  const handleUndo = useCallback(() => {
    if (busyRef.current) return;
    const h = historyRef.current;
    if (h.length === 0) return;
    playClick();
    statsRef.current.undos += 1;
    setPos(h[h.length - 1]);
    setHistory(h.slice(0, -1));
    setMoves(m => Math.max(0, m - 1));
    setHint(null);
    setMessage(null);
  }, [playClick]);

  const handleReset = useCallback(() => {
    if (busyRef.current || historyRef.current.length === 0) return;
    playClick();
    statsRef.current.resets += 1;
    setPos({ player: level.player, boxes: level.boxes });
    setHistory([]);
    setMoves(0);
    setFacing('down');
    setHint(null);
    setMessage(null);
  }, [level, playClick]);

  const handleHint = useCallback(() => {
    if (busyRef.current) return;
    const h = nextHint(level, posRef.current);
    if (!h) {
      playFail();
      setHint(null);
      say('warn', tg.stuck);
      return;
    }
    playClick();
    statsRef.current.hints += 1;
    setHint(h);
    setBump(b => b + 1);
    say('hint', (h.walking ? tg.hintWalk : tg.hintPush).replace('{arrow}', ARROWS[h.walking ? h.dir : h.pushDir]));
  }, [level, playClick, playFail, say, tg]);

  const handleTile = useCallback((cell) => {
    if (busyRef.current) return;
    const { player, boxes } = posRef.current;
    const w = level.width;
    const dr = Math.floor(cell / w) - Math.floor(player / w);
    const dc = (cell % w) - (player % w);
    if (Math.abs(dr) + Math.abs(dc) === 1) {
      move(dr === -1 ? 'up' : dr === 1 ? 'down' : dc === -1 ? 'left' : 'right');
      return;
    }
    if (cell === player || !level.inside.has(cell)) return;
    if (boxes.includes(cell)) { say('info', tg.tapNextTo); return; }
    const path = walkPath(level, boxes, player, cell);
    if (path) applySteps(path);
    else say('info', tg.cantReach);
  }, [level, move, applySteps, say, tg]);

  const handleKey = useCallback((e) => {
    const dir = KEY_DIRS[e.key];
    if (dir) { e.preventDefault(); move(dir); return; }
    if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); handleUndo(); }
  }, [move, handleUndo]);

  const onTouchStart = (e) => {
    const p = e.touches[0];
    touchRef.current = { x: p.clientX, y: p.clientY };
  };
  const onTouchEnd = (e) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - start.x;
    const dy = p.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 40) return; // a tap, handled by onClick
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
    else move(dy > 0 ? 'down' : 'up');
  };

  const cellSize = useCellSize(slotRef, level.width, level.height);
  const boxSet = new Set(pos.boxes);
  const onTarget = pos.boxes.filter(b => level.goals.has(b)).length;

  const cells = [];
  for (let r = 0; r < level.height; r++) {
    for (let c = 0; c < level.width; c++) {
      const i = r * level.width + c;
      const isInside = level.inside.has(i);
      const isGoal = level.goals.has(i);
      const isBox = boxSet.has(i);
      const isPlayer = pos.player === i;
      let cls = styles.tileOutside;
      if (level.walls.has(i)) cls = styles.tileWall;
      else if (isInside) cls = isGoal ? styles.tileGoal : styles.tileFloor;
      const hinted = hint && hint.box === i;
      const stepCell = hint && hint.dir && i === stepFrom(level, pos.player, hint.dir);
      const content = isPlayer ? <PlayerSVG direction={facing} />
        : isBox ? <BoxSVG onGoal={isGoal} />
        : isGoal ? <GoalSVG /> : null;
      const label = isPlayer ? tg.you : isBox ? (isGoal ? tg.boxOnTarget : tg.box) : isGoal ? tg.target : tg.floor;
      if (isInside) {
        cells.push(
          <button
            key={i}
            type="button"
            className={`${styles.tile} ${cls} ${hinted ? styles.tileHint : ''} ${stepCell && !hinted ? styles.tileStep : ''}`}
            style={{ width: cellSize, height: cellSize }}
            onClick={() => handleTile(i)}
            aria-label={label}
            tabIndex={-1}
          >
            {content}
            {hinted && <span key={bump} className={styles.hintArrow} aria-hidden="true">{ARROWS[hint.pushDir]}</span>}
          </button>
        );
      } else {
        cells.push(<div key={i} className={`${styles.tile} ${cls}`} style={{ width: cellSize, height: cellSize }} aria-hidden="true" />);
      }
    }
  }

  const dpad = (dir, aria) => (
    <button
      type="button"
      className={`${styles.dpadBtn} ${hint?.dir === dir ? styles.dpadHint : ''}`}
      onClick={() => move(dir)}
      aria-label={aria}
    >
      {ARROWS[dir]}
    </button>
  );

  return (
    <div
      className={styles.wrapper}
      ref={wrapperRef}
      tabIndex={0}
      onKeyDown={handleKey}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      aria-label={tg.ariaGame}
    >
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{tg.puzzleShort.replace('{n}', idx + 1).replace('{total}', total)}</span>
          <span className={styles.hudStat} aria-label={tg.onTarget.replace('{n}', onTarget).replace('{total}', pos.boxes.length)}>
            📦 {onTarget}/{pos.boxes.length}
          </span>
        </div>
        <div className={styles.infoBadge} aria-label={`${stars} / ${maxScore} ${tg.stars}`}>
          <span key={stars} className={styles.infoBadgeNum}>{stars}</span>
          <span className={styles.infoBadgeSub}>/ {maxScore} ★</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <div className={styles.boardSlot} ref={slotRef}>
        <div className={styles.boardWrap}>
          <div
            className={`${styles.board} ${solved ? styles.boardSolved : ''}`}
            style={{ gridTemplateColumns: `repeat(${level.width}, ${cellSize}px)` }}
            key={idx}
          >
            {cells}
          </div>
          {solved && (
            <div className={styles.banner} role="status">
              <span>{tg.solved}</span>
              <span className={styles.bannerStars} aria-label={`${solved} ${tg.stars}`}>
                {'★'.repeat(solved)}<span className={styles.starOff}>{'★'.repeat(3 - solved)}</span>
              </span>
            </div>
          )}
        </div>
        </div>

        <p
          key={message?.id}
          className={`${styles.message} ${message ? styles[`msg_${message.kind}`] : ''}`}
          role="status"
          aria-live="polite"
        >
          {message ? message.text : tg.tip}
        </p>

        <div className={styles.controlsRow}>
          <div className={styles.dpad}>
            <span />{dpad('up', tg.ariaUp)}<span />
            {dpad('left', tg.ariaLeft)}<span className={styles.dpadCenter} aria-hidden="true" />{dpad('right', tg.ariaRight)}
            <span />{dpad('down', tg.ariaDown)}<span />
          </div>
          <div className={styles.actions}>
            <button type="button" className={`${styles.actionBtn} ${styles.hintBtn}`} onClick={handleHint} disabled={!!solved}>
              💡 {tg.hint}
            </button>
            <button type="button" className={styles.actionBtn} onClick={handleUndo} disabled={!!solved || history.length === 0}>
              ↩ {tg.undo}
            </button>
            <button type="button" className={styles.actionBtn} onClick={handleReset} disabled={!!solved || history.length === 0}>
              ⟲ {tg.reset}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function stepFrom(level, i, dir) {
  const [dr, dc] = DIRS[dir];
  return i + dr * level.width + dc;
}

/* A box stuck against walls so it can never reach any target (cheap check). */
function isDeadCell(level, cell) {
  const blocked = (dir) => !level.inside.has(stepFrom(level, cell, dir));
  return (blocked('up') || blocked('down')) && (blocked('left') || blocked('right'));
}

SokobanGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

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
      flushTop
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, reportRound, playClick, playSuccess, playFail }) => (
        <SokobanGame
          key={diff}
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          reportRound={reportRound}
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
