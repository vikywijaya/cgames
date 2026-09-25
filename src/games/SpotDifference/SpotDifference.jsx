import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SpotDifference.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * SpotDifference — two picture grids, one on top of the other; find the
 * pictures that changed. Tap the change in either grid.
 *
 * Kinds of change: swapped for another picture, a different colour
 * (🍎 → 🍏), missing, and (hard) flipped the other way.
 *
 * Tuned for seniors:
 * - Grids are stacked, not side by side, so cells stay large on a phone.
 * - Stuck? After a while the row holding a difference glows.
 * - +2 per difference found, +2 more for a round with no wrong taps.
 * - No overall clock.
 */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 6, cols: 3, rows: 3, changes: 1, kinds: ['swap', 'colour', 'missing'],         hintMs: 10000 },
  medium: { rounds: 7, cols: 4, rows: 3, changes: 2, kinds: ['swap', 'colour', 'missing'],         hintMs: 12000 },
  hard:   { rounds: 8, cols: 4, rows: 4, changes: 3, kinds: ['swap', 'colour', 'missing', 'flip'], hintMs: 14000 },
};
const FOUND_POINTS = 2;
const PERFECT_BONUS = 2;

// Pictures with a clear colour twin (for the colour kind).
const COLOUR_PAIRS = [['🍎', '🍏'], ['❤️', '💙'], ['🟥', '🟩'], ['📕', '📘'], ['🔴', '🟡'], ['💚', '💜'], ['🟧', '🟦']];
// Pictures that face one way (for the flip kind).
const FACING = ['🐟', '🚗', '🐌', '🐘', '🦆', '🐎', '🐢', '🚲'];
const POOL = ['🌸', '🌻', '⭐', '🎈', '🍀', '🦋', '🌙', '☀️', '🍄', '🐼', '🦊', '🍓', '🍌', '☂️', '🔔', '🎵', '🏠', '⚽', '🍩', '🌵'];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Cells are { e: emoji, flip?: bool } or null (missing).
export function buildPuzzle(config) {
  const total = config.cols * config.rows;
  const positions = shuffle([...Array(total).keys()]).slice(0, config.changes);
  const kinds = positions.map(() => pick(config.kinds));
  // Fill with distinct pictures; seed changed cells so their kind works.
  const base = shuffle(POOL).slice(0, total).map(e => ({ e }));
  const used = new Set(base.map(c => c.e));
  const top = [...base];
  const bottom = [...base];
  positions.forEach((pos, i) => {
    const kind = kinds[i];
    if (kind === 'colour') {
      const [a, b] = shuffle(pick(COLOUR_PAIRS));
      top[pos] = { e: a };
      bottom[pos] = { e: b };
    } else if (kind === 'flip') {
      const e = pick(FACING);
      top[pos] = { e };
      bottom[pos] = { e, flip: true };
    } else if (kind === 'missing') {
      bottom[pos] = null;
    } else {
      const other = POOL.filter(x => !used.has(x));
      const e = other.length ? pick(other) : '❓';
      used.add(e);
      bottom[pos] = { e };
    }
  });
  // Randomly show the changed version on top instead, so "missing" can
  // also mean a picture appeared.
  if (Math.random() < 0.5) return { top: bottom, bottom: top, diffs: new Set(positions) };
  return { top, bottom, diffs: new Set(positions) };
}

export function perfectScore(config) {
  return config.rounds * (config.changes * FOUND_POINTS + PERFECT_BONUS);
}

function Cell({ cell }) {
  if (!cell) return <span className={styles.empty} aria-hidden="true" />;
  return <span className={`${styles.emoji} ${cell.flip ? styles.flip : ''}`}>{cell.e}</span>;
}
Cell.propTypes = { cell: PropTypes.shape({ e: PropTypes.string, flip: PropTypes.bool }) };

function SpotDifferenceGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playPop, playReveal }) {
  const t = useTranslation();
  const td = t.games['spot-difference'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [round, setRound]   = useState(0);
  const [puzzle, setPuzzle] = useState(() => buildPuzzle(config));
  const [found, setFound]   = useState(new Set());
  const [wrong, setWrong]   = useState(null);  // { grid, idx }
  const [misses, setMisses] = useState(0);
  const [hintRow, setHintRow] = useState(null);
  const [phase, setPhase]   = useState('playing'); // playing | done
  const [score, setScore]   = useState(0);
  const [popup, setPopup]   = useState(null);

  const scoreRef  = useRef(0);
  const foundRef  = useRef(new Set());
  const doneRef   = useRef(false);
  const timersRef = useRef(new Set());
  const hintTimer = useRef(null);
  const reportedRound = useRef(-1);

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
    return h;
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete({ finalScore: scoreRef.current, maxScore: Math.max(perfectScore(config), scoreRef.current), completed: true });
  }, [onComplete, config]);

  // Each round: report it, and schedule a hint for when the player is stuck.
  const scheduleHint = useCallback(() => {
    clearTimeout(hintTimer.current);
    hintTimer.current = later(() => {
      const left = [...puzzle.diffs].filter(p => !foundRef.current.has(p));
      if (!left.length) return;
      setHintRow(Math.floor(left[0] / config.cols));
      playReveal?.();
    }, config.hintMs);
  }, [puzzle, config, later, playReveal]);

  useEffect(() => {
    if (countingDown || phase !== 'playing') return;
    if (reportedRound.current !== round) {
      reportedRound.current = round;
      reportRound?.(round + 1, config.rounds);
    }
    scheduleHint();
  }, [countingDown, phase, round, config.rounds, reportRound, scheduleHint]);

  const tap = useCallback((grid, idx) => {
    if (countingDown || phase !== 'playing' || doneRef.current || foundRef.current.has(idx)) return;
    if (puzzle.diffs.has(idx)) {
      const nf = new Set(foundRef.current);
      nf.add(idx);
      foundRef.current = nf;
      setFound(nf);
      setHintRow(null);
      scoreRef.current += FOUND_POINTS;
      setPopup({ id: Date.now(), idx, text: `+${FOUND_POINTS}` });
      playPop?.();
      if (nf.size === puzzle.diffs.size) {
        clearTimeout(hintTimer.current);
        const perfect = misses === 0;
        if (perfect) scoreRef.current += PERFECT_BONUS;
        setPhase('done');
        later(() => playSuccess(), 250);
        later(() => {
          if (doneRef.current) return;
          const nr = round + 1;
          if (nr >= config.rounds) { finish(); return; }
          foundRef.current = new Set();
          setRound(nr);
          setPuzzle(buildPuzzle(config));
          setFound(new Set());
          setMisses(0);
          setPopup(null);
          setPhase('playing');
        }, 1600);
      } else {
        scheduleHint();
      }
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      return;
    }
    playClick();
    playFail();
    setMisses(m => m + 1);
    setWrong({ grid, idx, id: Date.now() });
    later(() => setWrong(w => (w && w.idx === idx && w.grid === grid ? null : w)), 450);
  }, [countingDown, phase, puzzle, misses, round, config, later, finish, scheduleHint, playClick, playFail, playPop, playSuccess, reportScore]);

  const renderGrid = (cells, grid) => (
    <div className={styles.grid} style={{ '--cols': config.cols }}>
      {cells.map((cell, i) => {
        const row = Math.floor(i / config.cols);
        const isFound = found.has(i);
        return (
          <button
            key={`${round}-${grid}-${i}`}
            type="button"
            className={[
              styles.cell,
              isFound ? styles.cellFound : '',
              wrong && wrong.grid === grid && wrong.idx === i ? styles.cellWrong : '',
              hintRow === row && !isFound ? styles.cellHint : '',
            ].join(' ')}
            style={{ '--idx': i }}
            onPointerDown={() => tap(grid, i)}
            aria-label={cell ? cell.e : td.emptySpot}
          >
            <Cell cell={cell} />
            {isFound && <span className={styles.ring} aria-hidden="true" />}
            {popup && popup.idx === i && grid === 'bottom' && (
              <span key={popup.id} className={styles.floatText} aria-hidden="true">{popup.text}</span>
            )}
          </button>
        );
      })}
    </div>
  );

  const left = puzzle.diffs.size - found.size;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.round} {round + 1}/{config.rounds}</span>
          <span className={styles.leftChip} aria-hidden="true">
            {Array.from({ length: puzzle.diffs.size }).map((_, i) => (
              <span key={i} className={i < found.size ? styles.dotOn : styles.dotOff}>●</span>
            ))}
          </span>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{td.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <p className={styles.prompt} aria-live="polite">
          {phase === 'done'
            ? (misses === 0 ? `🎉 ${td.perfect}` : `✓ ${td.allFound}`)
            : hintRow !== null
              ? `💡 ${td.hint}`
              : `🔍 ${td.find.replace('{n}', left)}`}
        </p>
        <div className={styles.panel}>
          <span className={styles.panelLabel}>{td.pictureA}</span>
          {renderGrid(puzzle.top, 'top')}
        </div>
        <div className={styles.panel}>
          <span className={styles.panelLabel}>{td.pictureB}</span>
          {renderGrid(puzzle.bottom, 'bottom')}
        </div>
      </div>
    </div>
  );
}

SpotDifferenceGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playPop:     PropTypes.func,
  playReveal:  PropTypes.func,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function SpotDifference({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'spot-difference', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="spot-difference"
      title={t.games['spot-difference'].title}
      instructions={t.games['spot-difference'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playPop, playReveal, countingDown }) => (
        <SpotDifferenceGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
          playPop={playPop}
          playReveal={playReveal}
        />
      )}
    </GameShell>
  );
}

SpotDifference.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
