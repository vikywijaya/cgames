import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './MathCross.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * Math Cross — a small crossword of equations on a 5 x 5 board.
 *
 * Easy:   a "plus" shape — one equation across, one down, sharing the middle number.
 * Medium: a square frame — two across, two down, sharing the four corners (+ and − only).
 * Hard:   the same frame with ×, bigger numbers and more blanks.
 *
 * The puzzle is built from real equations first and blanks are punched out
 * afterwards, so every puzzle is always solvable with the numbers in the tray.
 * A puzzle counts as solved when every equation is true (so swapping two
 * numbers that both work is fine).
 */

const DIFFICULTY_CONFIG = {
  easy:   { shape: 'cross', ops: ['+', '-'],      max: 10, blanks: 2, puzzles: 4 },
  medium: { shape: 'frame', ops: ['+', '-'],      max: 20, blanks: 4, puzzles: 5 },
  hard:   { shape: 'frame', ops: ['+', '-', 'x'], max: 40, blanks: 6, puzzles: 5 },
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };
const STARS_PER_PUZZLE = 3;
const OP_SYMBOL = { '+': '+', '-': '−', x: '×', '=': '=' };

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Build `a op b = c` starting from a known first number `a`. */
function extendFrom(a, ops, max) {
  for (const op of shuffle(ops)) {
    if (op === '+' && max - a >= 1) {
      const b = randInt(1, Math.min(max - a, Math.max(1, Math.ceil(max * 0.6))));
      return { op, b, c: a + b };
    }
    if (op === '-' && a >= 2) {
      const b = randInt(1, a - 1);
      return { op, b, c: a - b };
    }
    if (op === 'x' && a >= 2 && a <= 9) {
      const hi = Math.min(9, Math.floor(max / a));
      if (hi >= 2) {
        const b = randInt(2, hi);
        return { op, b, c: a * b };
      }
    }
  }
  return null;
}

/** Find `op, b` so that `d op b = e`. */
function closeBetween(d, e, ops) {
  for (const op of shuffle(ops)) {
    if (op === '+' && e > d) return { op, b: e - d };
    if (op === '-' && d > e) return { op, b: d - e };
    if (op === 'x' && d >= 2 && e % d === 0 && e / d >= 2 && e / d <= 9) return { op, b: e / d };
  }
  return null;
}

export function evaluate(x, op, y) {
  if (op === '+') return x + y;
  if (op === '-') return x - y;
  return x * y;
}

/** Returns { equations: [{ op, cells:[k1,k2,k3] }], values: { key: number } } */
function buildShape(shape, ops, max) {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (shape === 'cross') {
      // Across: (2,0) op (2,2) = (2,4); Down: (0,2) op (2,2) = (4,2)
      const a = randInt(2, Math.max(2, max - 2));
      const h = extendFrom(a, ops, max);
      if (!h) continue;
      const mid = h.b;
      const op = ops[randInt(0, ops.length - 1)];
      let va, vc;
      if (op === '+') {
        if (max - mid < 1) continue;
        va = randInt(1, max - mid);
        vc = va + mid;
      } else {
        vc = randInt(1, Math.max(1, max - mid));
        va = vc + mid;
        if (va > max) continue;
      }
      return {
        equations: [
          { op: h.op, cells: ['2,0', '2,2', '2,4'] },
          { op,       cells: ['0,2', '2,2', '4,2'] },
        ],
        values: { '2,0': a, '2,2': mid, '2,4': h.c, '0,2': va, '4,2': vc },
      };
    }

    // Frame: top (0,0)(0,2)(0,4), left (0,0)(2,0)(4,0), right (0,4)(2,4)(4,4), bottom (4,0)(4,2)(4,4)
    const hasTimes = ops.includes('x');
    const a0 = hasTimes ? randInt(2, 9) : randInt(2, Math.max(2, Math.floor(max * 0.7)));
    const top = extendFrom(a0, ops, max);
    if (!top) continue;
    const left = extendFrom(a0, ops, max);
    const right = extendFrom(top.c, ops, max);
    if (!left || !right) continue;
    const bottom = closeBetween(left.c, right.c, ops);
    if (!bottom || bottom.b > max) continue;
    // Avoid the dull case of all four equations using the same sign on hard
    if (hasTimes && ![top, left, right, bottom].some(e => e.op === 'x')) continue;
    return {
      equations: [
        { op: top.op,    cells: ['0,0', '0,2', '0,4'] },
        { op: left.op,   cells: ['0,0', '2,0', '4,0'] },
        { op: right.op,  cells: ['0,4', '2,4', '4,4'] },
        { op: bottom.op, cells: ['4,0', '4,2', '4,4'] },
      ],
      values: {
        '0,0': a0, '0,2': top.b, '0,4': top.c,
        '2,0': left.b, '4,0': left.c,
        '2,4': right.b, '4,4': right.c,
        '4,2': bottom.b,
      },
    };
  }
  // Guaranteed fallback (never expected to be reached)
  return {
    equations: [
      { op: '+', cells: ['2,0', '2,2', '2,4'] },
      { op: '+', cells: ['0,2', '2,2', '4,2'] },
    ],
    values: { '2,0': 2, '2,2': 3, '2,4': 5, '0,2': 1, '4,2': 4 },
  };
}

/** Lay out a full puzzle on a 5 x 5 board. */
export function generatePuzzle(difficulty) {
  const cfg = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { equations, values } = buildShape(cfg.shape, cfg.ops, cfg.max);

  const cells = {};
  equations.forEach(({ op, cells: [k1, k2, k3] }) => {
    const [r1, c1] = k1.split(',').map(Number);
    const [r3, c3] = k3.split(',').map(Number);
    const across = r1 === r3;
    const opKey = across ? `${r1},${c1 + 1}` : `${r1 + 1},${c1}`;
    const eqKey = across ? `${r3},${c3 - 1}` : `${r3 - 1},${c3}`;
    cells[opKey] = { type: 'op', value: op };
    cells[eqKey] = { type: 'op', value: '=' };
    [k1, k2, k3].forEach(k => { cells[k] = { type: 'number', answer: values[k] }; });
  });

  // Choose blanks: each equation must keep at least one printed clue.
  const numberKeys = Object.keys(values);
  let blanks = [];
  for (let n = cfg.blanks; n >= 1 && blanks.length === 0; n--) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const pick = shuffle(numberKeys).slice(0, n);
      const set = new Set(pick);
      if (equations.every(eq => eq.cells.some(k => !set.has(k)))) { blanks = pick; break; }
    }
  }
  blanks.forEach(k => { cells[k] = { ...cells[k], type: 'slot' }; });

  return {
    cells,
    equations,
    slots: blanks,
    tray: shuffle(blanks.map(k => values[k])),
  };
}

function valueAt(puzzle, placed, key) {
  const cell = puzzle.cells[key];
  if (cell.type === 'number') return cell.answer;
  const idx = placed[key];
  return idx == null ? null : puzzle.tray[idx];
}

/** Indices of equations that are fully filled but false. */
function wrongEquations(puzzle, placed) {
  const out = [];
  puzzle.equations.forEach((eq, i) => {
    const [x, y, z] = eq.cells.map(k => valueAt(puzzle, placed, k));
    if (x == null || y == null || z == null) return;
    if (evaluate(x, eq.op, y) !== z) out.push(i);
  });
  return out;
}

export function starsFor(helpUsed) {
  if (helpUsed === 0) return 3;
  if (helpUsed <= 2) return 2;
  return 1;
}

function fill(template, vars) {
  return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), template);
}

function MathCrossGame({ difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playPop }) {
  const t = useTranslation();
  const tx = t.games['math-cross'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const total = config.puzzles;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [puzzle, setPuzzle] = useState(() => generatePuzzle(difficulty));
  const [placed, setPlaced] = useState({});          // slotKey -> tray index
  const [hinted, setHinted] = useState(() => new Set()); // locked slot keys
  const [history, setHistory] = useState([]);        // snapshots for Undo
  const [selectedTray, setSelectedTray] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [help, setHelp] = useState(0);               // hints + wrong full attempts
  const [wrong, setWrong] = useState([]);            // wrong equation indices
  const [flashKey, setFlashKey] = useState(null);
  const [banner, setBanner] = useState(null);        // { kind, text }
  const [solved, setSolved] = useState(false);

  // Ref mirrors so timer callbacks always see fresh values
  const scoreRef = useRef(0);
  const doneRef = useRef(false);
  const timersRef = useRef(new Set());

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => { timersRef.current.delete(id); fn(); }, ms);
    timersRef.current.add(id);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  useEffect(() => { reportRound?.(round + 1, total); }, [round, total, reportRound]);

  const usedTray = new Set(Object.values(placed));

  const finishPuzzle = useCallback((helpUsed) => {
    const stars = starsFor(helpUsed);
    const newScore = scoreRef.current + stars;
    scoreRef.current = newScore;
    setScore(newScore);
    reportScore(newScore);
    setSolved(true);
    setWrong([]);
    playSuccess();
    const last = round + 1 >= total;
    setBanner({ kind: 'good', text: last ? tx.allSolved : tx.solved, stars });
    later(() => {
      if (doneRef.current) return;
      if (last) {
        doneRef.current = true;
        onComplete({ finalScore: newScore, maxScore: total * STARS_PER_PUZZLE, completed: true });
        return;
      }
      setRound(r => r + 1);
      setPuzzle(generatePuzzle(difficulty));
      setPlaced({});
      setHinted(new Set());
      setHistory([]);
      setSelectedTray(null);
      setSelectedSlot(null);
      setHelp(0);
      setBanner(null);
      setSolved(false);
    }, 1600);
  }, [round, total, tx, difficulty, later, onComplete, reportScore, playSuccess]);

  /** Apply a new placement map and check the board. */
  const commit = useCallback((nextPlaced, nextHinted, helpUsed, { countMistake = true } = {}) => {
    setHistory(h => [...h, { placed, hinted }]);
    setPlaced(nextPlaced);
    setHinted(nextHinted);
    setSelectedTray(null);
    setSelectedSlot(null);

    const bad = wrongEquations(puzzle, nextPlaced);
    const full = puzzle.slots.every(k => nextPlaced[k] != null);
    if (full && bad.length === 0) {
      finishPuzzle(helpUsed);
      return;
    }
    setWrong(full ? bad : []);
    if (full) {
      playFail();
      setBanner({ kind: 'bad', text: tx.notQuite });
      if (countMistake) setHelp(helpUsed + 1);
    } else {
      setBanner(null);
    }
  }, [placed, hinted, puzzle, finishPuzzle, playFail, tx]);

  const place = useCallback((slotKey, trayIdx) => {
    playPop();
    setFlashKey(slotKey);
    later(() => setFlashKey(null), 300);
    commit({ ...placed, [slotKey]: trayIdx }, hinted, help);
  }, [placed, hinted, help, commit, later, playPop]);

  const handleSlot = useCallback((key) => {
    if (solved || hinted.has(key)) return;
    if (placed[key] != null) {
      playClick();
      const next = { ...placed };
      delete next[key];
      commit(next, hinted, help, { countMistake: false });
      return;
    }
    if (selectedTray != null) { place(key, selectedTray); return; }
    playClick();
    setSelectedSlot(s => (s === key ? null : key));
  }, [solved, hinted, placed, selectedTray, help, commit, place, playClick]);

  const handleTray = useCallback((idx) => {
    if (solved || usedTray.has(idx)) return;
    if (selectedSlot != null) { place(selectedSlot, idx); return; }
    playClick();
    setSelectedTray(s => (s === idx ? null : idx));
  }, [solved, usedTray, selectedSlot, place, playClick]);

  const handleHint = useCallback(() => {
    if (solved) return;
    const valOf = k => (placed[k] == null ? null : puzzle.tray[placed[k]]);
    const answer = k => puzzle.cells[k].answer;
    // Prefer an empty slot, otherwise one holding the wrong number
    const target =
      shuffle(puzzle.slots.filter(k => !hinted.has(k) && placed[k] == null))[0] ??
      shuffle(puzzle.slots.filter(k => !hinted.has(k) && valOf(k) !== answer(k)))[0];
    if (!target) return;
    const want = answer(target);
    const next = { ...placed };
    delete next[target];
    const inUse = new Set(Object.values(next));
    let idx = puzzle.tray.findIndex((v, i) => v === want && !inUse.has(i));
    if (idx === -1) {
      // Take it back from a slot that holds it but needs something else
      const donor = puzzle.slots.find(k => next[k] != null && puzzle.tray[next[k]] === want && answer(k) !== want && !hinted.has(k));
      if (!donor) return;
      idx = next[donor];
      delete next[donor];
    }
    next[target] = idx;
    const nextHinted = new Set(hinted);
    nextHinted.add(target);
    const helpUsed = help + 1;
    setHelp(helpUsed);
    playPop();
    setFlashKey(target);
    later(() => setFlashKey(null), 300);
    commit(next, nextHinted, helpUsed, { countMistake: false });
    if (!puzzle.slots.every(k => next[k] != null)) setBanner({ kind: 'info', text: tx.hintGiven });
  }, [solved, placed, hinted, puzzle, help, commit, later, playPop, tx]);

  const handleUndo = useCallback(() => {
    if (solved || history.length === 0) return;
    playClick();
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setPlaced(prev.placed);
    setHinted(prev.hinted);
    setSelectedTray(null);
    setSelectedSlot(null);
    setWrong([]);
    setBanner(null);
  }, [solved, history, playClick]);

  const handleReset = useCallback(() => {
    if (solved) return;
    playClick();
    const keep = {};
    hinted.forEach(k => { if (placed[k] != null) keep[k] = placed[k]; });
    setHistory(h => [...h, { placed, hinted }]);
    setPlaced(keep);
    setSelectedTray(null);
    setSelectedSlot(null);
    setWrong([]);
    setBanner(null);
  }, [solved, hinted, placed, playClick]);

  const wrongCells = new Set(wrong.flatMap(i => puzzle.equations[i].cells));
  const emptyCount = puzzle.slots.filter(k => placed[k] == null).length;
  const guide = solved
    ? ' '
    : selectedTray != null
    ? tx.tapEmptySlot
    : selectedSlot != null
    ? tx.pickNumber
    : emptyCount === puzzle.slots.length
    ? tx.tapNumberThenSlot
    : emptyCount > 0
    ? fill(tx.slotsLeft, { n: emptyCount })
    : tx.tapToTakeBack;

  const cellSize = 'var(--mc-cell)';

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{fill(tx.puzzleOf, { n: round + 1, total })}</span>
        </div>
        <div className={styles.infoBadge} aria-live="polite" aria-label={`${tx.starsLabel} ${score} / ${total * STARS_PER_PUZZLE}`}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>/ {total * STARS_PER_PUZZLE} ★</span>
        </div>
      </div>

      <div className={styles.playArea}>
      <div className={styles.bannerSlot} aria-live="polite">
        {banner ? (
          <div className={`${styles.banner} ${styles[`banner_${banner.kind}`]}`}>
            {banner.kind === 'good' && <span className={styles.bannerStars}>{'★'.repeat(banner.stars)}{'☆'.repeat(3 - banner.stars)}</span>}
            <span>{banner.text}</span>
          </div>
        ) : (
          <p className={styles.guide}>{guide}</p>
        )}
      </div>

      <div
        className={`${styles.grid} ${solved ? styles.gridSolved : ''}`}
        style={{ gridTemplateColumns: `repeat(5, ${cellSize})`, gridTemplateRows: `repeat(5, ${cellSize})` }}
        role="group"
        aria-label={tx.gridAria}
        key={round}
      >
        {Array.from({ length: 25 }, (_, i) => {
          const r = Math.floor(i / 5);
          const c = i % 5;
          const key = `${r},${c}`;
          const cell = puzzle.cells[key];
          if (!cell) return <div key={key} className={styles.cellBlank} />;
          if (cell.type === 'op') {
            return <div key={key} className={`${styles.cell} ${styles.cellOp}`} aria-hidden="true">{OP_SYMBOL[cell.value]}</div>;
          }
          const isWrong = wrongCells.has(key);
          if (cell.type === 'number') {
            return (
              <div key={key} className={`${styles.cell} ${styles.cellGiven} ${solved ? styles.cellDone : ''} ${isWrong ? styles.cellWrong : ''}`}>
                {cell.answer}
              </div>
            );
          }
          const idx = placed[key];
          const filled = idx != null;
          const value = filled ? puzzle.tray[idx] : '';
          const isHint = hinted.has(key);
          let cls = `${styles.cell} ${styles.slot}`;
          if (filled) cls += ` ${styles.slotFilled}`;
          if (isHint) cls += ` ${styles.slotHint}`;
          if (selectedSlot === key) cls += ` ${styles.slotSelected}`;
          if (isWrong && filled) cls += ` ${styles.cellWrong}`;
          if (solved) cls += ` ${styles.cellDone}`;
          if (flashKey === key) cls += ` ${styles.slotPop}`;
          return (
            <button
              key={key}
              type="button"
              className={cls}
              onClick={() => handleSlot(key)}
              disabled={solved || isHint}
              aria-label={filled ? fill(tx.slotFilledAria, { value }) : tx.slotEmptyAria}
            >
              {value}
              {isWrong && filled && <span className={styles.wrongMark} aria-hidden="true">✗</span>}
              {isHint && <span className={styles.hintMark} aria-hidden="true">💡</span>}
            </button>
          );
        })}
      </div>

      <div className={styles.tray} role="group" aria-label={tx.numbersLabel}>
        {puzzle.tray.map((val, idx) => {
          const used = usedTray.has(idx);
          let cls = styles.trayNum;
          if (selectedTray === idx) cls += ` ${styles.trayNumSelected}`;
          if (used) cls += ` ${styles.trayNumUsed}`;
          return (
            <button
              key={idx}
              type="button"
              className={cls}
              onClick={() => handleTray(idx)}
              disabled={used || solved}
              aria-pressed={selectedTray === idx}
            >
              {val}
            </button>
          );
        })}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.actionBtn} onClick={handleHint} disabled={solved}>💡 {tx.hint}</button>
        <button type="button" className={styles.actionBtn} onClick={handleUndo} disabled={solved || history.length === 0}>↶ {tx.undo}</button>
        <button type="button" className={styles.actionBtn} onClick={handleReset} disabled={solved || emptyCount === puzzle.slots.length}>⟲ {tx.reset}</button>
      </div>
      </div>
    </div>
  );
}

MathCrossGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playPop:     PropTypes.func.isRequired,
};

export function MathCross({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'math-cross', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="math-cross"
      title={t.games['math-cross'].title}
      instructions={t.games['math-cross'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, reportRound, playClick, playSuccess, playFail, playPop }) => (
        <MathCrossGame
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
          playPop={playPop}
        />
      )}
    </GameShell>
  );
}

MathCross.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
