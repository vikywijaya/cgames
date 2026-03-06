import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './MathCross.module.css';

/*
 * Layout: equations laid out on a grid. Each equation is either horizontal or
 * vertical:  A op B = C.   Intersections share a cell.
 *
 * Easy:   2 horizontal + 1 vertical (cross shape)
 * Medium: 2 horizontal + 2 vertical (plus/grid)
 * Hard:   3 horizontal + 3 vertical (large grid)
 */

const OPS = ['+', '-', 'x'];

const DIFFICULTY_CONFIG = {
  easy:   { hCount: 2, vCount: 1, maxNum: 12,  rounds: 5, timeLimitSeconds: null },
  medium: { hCount: 2, vCount: 2, maxNum: 20,  rounds: 6, timeLimitSeconds: 180  },
  hard:   { hCount: 3, vCount: 3, maxNum: 25,  rounds: 8, timeLimitSeconds: 120  },
};

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

/**
 * Generate a single equation: a op b = c
 * Returns { a, op, b, c } where all values are positive integers.
 */
function makeEquation(maxNum) {
  const op = OPS[randInt(0, 2)];
  let a, b, c;
  if (op === '+') {
    a = randInt(1, Math.floor(maxNum / 2));
    b = randInt(1, Math.floor(maxNum / 2));
    c = a + b;
  } else if (op === '-') {
    c = randInt(1, Math.floor(maxNum / 2));
    b = randInt(1, Math.floor(maxNum / 2));
    a = b + c;
  } else {
    a = randInt(2, Math.min(9, maxNum));
    b = randInt(2, Math.min(9, maxNum));
    c = a * b;
  }
  return { a, op, b, c };
}

/**
 * Build puzzle: place horizontal & vertical equations on a grid.
 * Horizontals at rows 0, 4, 8, ... (spaced by 4 rows for operator rows between)
 * Verticals at cols 0, 4, 8, ... — column of the first operand aligns with
 * horizontal's first operand (col 0).
 *
 * Grid cell types: 'number', 'op', 'eq', 'blank'
 * Some number cells are 'given' (shown), others are 'slot' (player fills).
 */
function generatePuzzle(hCount, vCount, maxNum) {
  const eqSpacing = 4; // rows/cols between equation starts: A op B = C

  // Grid dimensions
  const gridRows = hCount * eqSpacing - (eqSpacing - 5);
  const hLen = 5; // A op B = C
  const vLen = hCount * eqSpacing - (eqSpacing - 5);

  // We lay out equations carefully:
  // Horizontals at row i*4, from col 0..4
  // Verticals at col j*4, from row 0..gridRows-1 (but only occupying eq positions)

  // Generate equations with intersection constraints
  const hEqs = [];
  const vEqs = [];

  // Simple approach: generate all equations independently, then assign
  // which cells are blanks vs given.

  // For each horizontal equation
  for (let i = 0; i < hCount; i++) hEqs.push(makeEquation(maxNum));
  for (let j = 0; j < vCount; j++) vEqs.push(makeEquation(maxNum));

  // Now build vertical equations that pass through horizontal equations.
  // Vertical equation j occupies column j * eqSpacing.
  // At row i * eqSpacing it intersects horizontal equation i.
  // The vertical equation's value at that intersection must match.

  // Rebuild equations to fit intersections:
  // vEq[j] passes through rows 0, 4, 8, ... at column j*eqSpacing
  // hEq[i] sits at row i*eqSpacing, columns 0..4

  // For the cross to work, we need:
  //   hEq[i].values[j_col_index] == vEq[j].values[i_row_index]
  // where j_col_index is the position in hEq that column j*eqSpacing maps to
  // and i_row_index is the position in vEq that row i*eqSpacing maps to.

  // H eq at row R: cells at (R, 0), (R, 1), (R, 2), (R, 3), (R, 4)
  //   which are:    A         op       B         =         C

  // V eq at col C: cells at (0, C), (1, C), (2, C), (3, C), (4, C), ...
  // For vCount equations, the v-eq spans the same rows as the grid height.
  // V eq j: at column j * eqSpacing
  //   row 0: first operand, row 1: op, row 2: second operand, row 3: =, row 4: result
  //   If hCount > 2 then continues: row 4 is also start of next segment
  //   Actually simpler: V equation j has its A,op,B,=,C laid out every row from
  //   row 0 to row 4 at column j*eqSpacing.

  // With hCount=2, vCount=2:
  //   H0 at row 0:  cols 0,1,2,3,4
  //   H1 at row 4:  cols 0,1,2,3,4
  //   V0 at col 0:  rows 0,1,2,3,4
  //   V1 at col 4:  rows 0,1,2,3,4

  //   Intersection: H0[col0] = V0[row0] → hEqs[0].a == vEqs[0].a
  //                 H0[col4] = V1[row0] → hEqs[0].c == vEqs[1].a
  //                 H1[col0] = V0[row4] → hEqs[1].a == vEqs[0].c
  //                 H1[col4] = V1[row4] → hEqs[1].c == vEqs[1].c

  // So we need to generate equations that share values at intersections.
  // Strategy: pick intersection values first, then build equations around them.

  const totalRows = (hCount - 1) * eqSpacing + 1;
  const totalCols = Math.max(hLen, (vCount - 1) * eqSpacing + 1);

  // Intersection values: intVal[i][j] = the number at row i*eqSpacing, col j*eqSpacing
  // For h equation i: positions are col 0 (a), col 2 (b), col 4 (c)
  // At col j*eqSpacing, position in h eq = j * eqSpacing (0, 4, 8...)
  // position 0 = a, position 2 = b, position 4 = c

  // For v equation j: positions are row 0 (a), row 2 (b), row 4 (c)
  // At row i*eqSpacing, position = i * eqSpacing
  // position 0 = a, position 2 = b, position 4 = c

  // Simplified: generate equations that share intersection values
  // by building from scratch.

  const attempts = 300;
  for (let attempt = 0; attempt < attempts; attempt++) {
    // Generate intersection grid values
    const vals = Array.from({ length: hCount }, () => Array(vCount).fill(0));

    // h eq i values: a = vals[i][0_mapped], b = ..., c = ...
    // Horizontal eq i spans cols. V equations at cols 0, 4, 8...
    // In h eq at row i*4: the number positions are col 0 (a), col 2 (b), col 4 (c)
    // V eq j is at col j*4.
    // So the intersection of h_i and v_j is at (i*4, j*4).
    // In h_i: col j*4 — if j*4 == 0 → a, j*4 == 2 → b, j*4 == 4 → c
    //   j=0 → col 0 → a   j=1 → col 4 → c   (for eqSpacing=4)
    // In v_j: row i*4 — if i*4 == 0 → a, i*4 == 4 → c   (for 2 h-eqs)

    // Actually for eqSpacing=4, vCount can be at most 2 (col 0 and col 4).
    // For 3, we'd need cols 0, 4, 8 → hLen needs to be 9 (too wide).
    // Let's simplify: for hard mode, use eqSpacing=4, hLen=5 per eq,
    // and just have 2 vCols max. For 3h+3v, stack them differently.

    // SIMPLIFICATION: generate independent cross patterns.
    // Each cross: 1 horizontal + 1 vertical sharing the center number.
    // For easy: 1 cross. For medium: 2 crosses. For hard: 3 crosses.

    // Each cross is 5x5: h eq at row 2, v eq at col 2, sharing center cell.
    break; // exit attempts loop, use simplified approach below
  }

  return generateSimpleCrossPuzzle(hCount, vCount, maxNum);
}

/**
 * Simplified approach: generate crosses (each is 2 intersecting equations).
 */
function generateSimpleCrossPuzzle(hCount, vCount, maxNum) {
  const crossCount = Math.min(hCount, vCount);
  const crosses = [];

  for (let i = 0; i < crossCount; i++) {
    // Keep trying until we get a valid cross
    for (let attempt = 0; attempt < 100; attempt++) {
      const hEq = makeEquation(maxNum);
      // Vertical equation must share the center value (hEq.b)
      const shared = hEq.b;
      const vOp = OPS[randInt(0, 2)];
      let vA, vB, vC;
      vB = shared;

      if (vOp === '+') {
        vA = randInt(1, Math.floor(maxNum / 2));
        vC = vA + vB;
      } else if (vOp === '-') {
        vA = vB + randInt(1, Math.floor(maxNum / 2));
        vC = vA - vB;
      } else {
        vA = randInt(2, Math.min(9, maxNum));
        vC = vA * vB;
      }

      if (vC > 0 && vA > 0) {
        crosses.push({
          h: hEq,
          v: { a: vA, op: vOp, b: vB, c: vC },
        });
        break;
      }
    }
  }

  // Also generate standalone horizontal equations if hCount > vCount
  const extraH = [];
  for (let i = crossCount; i < hCount; i++) extraH.push(makeEquation(maxNum));
  // Standalone verticals
  const extraV = [];
  for (let j = crossCount; j < vCount; j++) extraV.push(makeEquation(maxNum));

  // Layout on a grid.
  // Each cross occupies a 5-row x 5-col block. Extra h/v equations are appended.
  // Cross i is placed starting at row i*6, col 0 (6 = 5 + 1 gap).

  const crossBlockH = 5;
  const crossBlockW = 5;
  const gap = 1;

  const gridRows = Math.max(
    crosses.length * (crossBlockH + gap) - gap + extraH.length * 2,
    extraV.length * (crossBlockH + gap)
  );
  const gridCols = crossBlockW + (extraV.length > 0 ? 6 : 0);

  // Use a sparse cell map: key = "r,c" → { type, value }
  const cells = {};
  const slotPositions = []; // positions the player must fill
  const allValues = [];     // all answer values for the tray

  function setCell(r, c, type, value) {
    cells[`${r},${c}`] = { type, value };
  }

  // Place each cross
  crosses.forEach((cross, idx) => {
    const startR = idx * (crossBlockH + gap);
    const startC = 0;

    // Horizontal: row startR+2, cols startC..startC+4
    const hr = startR + 2;
    setCell(hr, startC,     'number', cross.h.a);
    setCell(hr, startC + 1, 'op',     cross.h.op);
    setCell(hr, startC + 2, 'number', cross.h.b); // shared with vertical
    setCell(hr, startC + 3, 'op',     '=');
    setCell(hr, startC + 4, 'number', cross.h.c);

    // Vertical: col startC+2, rows startR..startR+4
    const vc = startC + 2;
    setCell(startR,     vc, 'number', cross.v.a);
    setCell(startR + 1, vc, 'op',     cross.v.op);
    // startR+2, vc is already set (shared cell = cross.h.b == cross.v.b)
    setCell(startR + 3, vc, 'op',     '=');
    setCell(startR + 4, vc, 'number', cross.v.c);
  });

  // Place extra horizontal equations
  extraH.forEach((eq, idx) => {
    const r = crosses.length * (crossBlockH + gap) + idx * 2;
    setCell(r, 0, 'number', eq.a);
    setCell(r, 1, 'op',     eq.op);
    setCell(r, 2, 'number', eq.b);
    setCell(r, 3, 'op',     '=');
    setCell(r, 4, 'number', eq.c);
  });

  // Determine actual grid bounds
  let maxR = 0, maxC = 0;
  for (const key of Object.keys(cells)) {
    const [r, c] = key.split(',').map(Number);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }
  const rows = maxR + 1;
  const cols = maxC + 1;

  // Decide which number cells are slots (blanks) vs given.
  // We want roughly 40-50% of number cells to be slots.
  const numberCells = [];
  for (const [key, cell] of Object.entries(cells)) {
    if (cell.type === 'number') numberCells.push(key);
  }
  const shuffled = shuffle(numberCells);
  const slotCount = Math.max(2, Math.ceil(numberCells.length * 0.45));
  const slotKeys = new Set(shuffled.slice(0, slotCount));

  for (const key of slotKeys) {
    const cell = cells[key];
    allValues.push(cell.value);
    slotPositions.push(key);
    cells[key] = { ...cell, type: 'slot', answer: cell.value };
  }

  return { cells, rows, cols, slotPositions, trayValues: shuffle(allValues) };
}

function MathCrossGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail, playPop }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { rounds } = config;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [puzzle, setPuzzle] = useState(() =>
    generatePuzzle(config.hCount, config.vCount, config.maxNum)
  );
  const [placed, setPlaced] = useState({});       // slotKey → trayIndex
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedTray, setSelectedTray] = useState(null);
  const [usedTray, setUsedTray] = useState(new Set());
  const [solved, setSolved] = useState(false);
  const [justPlacedKey, setJustPlacedKey] = useState(null);

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: rounds, completed: false });
  }, [secondsLeft, score, rounds, onComplete]);

  // Check if all slots are correctly filled
  const isSolved = useMemo(() => {
    if (Object.keys(placed).length < puzzle.slotPositions.length) return false;
    return puzzle.slotPositions.every(key => {
      const trayIdx = placed[key];
      if (trayIdx == null) return false;
      return puzzle.trayValues[trayIdx] === puzzle.cells[key].answer;
    });
  }, [placed, puzzle]);

  useEffect(() => {
    if (!isSolved || solved) return;
    setSolved(true);
    playSuccess();
    const newScore = score + 1;
    setScore(newScore);
    reportScore(newScore);

    const timer = setTimeout(() => {
      const nextRound = round + 1;
      if (nextRound >= rounds) {
        onComplete({ finalScore: newScore, maxScore: rounds, completed: true });
        return;
      }
      setRound(nextRound);
      setPuzzle(generatePuzzle(config.hCount, config.vCount, config.maxNum));
      setPlaced({});
      setSelectedSlot(null);
      setSelectedTray(null);
      setUsedTray(new Set());
      setSolved(false);
      setJustPlacedKey(null);
    }, 900);
    return () => clearTimeout(timer);
  }, [isSolved, solved, score, round, rounds, config, onComplete, reportScore, playSuccess]);

  // Place a number: either select tray then slot, or slot then tray
  const placeNumber = useCallback((slotKey, trayIdx) => {
    playPop();
    setPlaced(prev => ({ ...prev, [slotKey]: trayIdx }));
    setUsedTray(prev => new Set([...prev, trayIdx]));
    setSelectedSlot(null);
    setSelectedTray(null);
    setJustPlacedKey(slotKey);
    setTimeout(() => setJustPlacedKey(null), 250);
  }, [playPop]);

  // Remove a placed number
  const removePlaced = useCallback((slotKey) => {
    if (solved) return;
    const trayIdx = placed[slotKey];
    if (trayIdx == null) return;
    playClick();
    setPlaced(prev => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
    setUsedTray(prev => {
      const next = new Set(prev);
      next.delete(trayIdx);
      return next;
    });
    setSelectedTray(trayIdx);
  }, [solved, placed, playClick]);

  const handleSlotClick = useCallback((key) => {
    if (solved) return;
    // If slot already has a number placed, remove it
    if (placed[key] != null) {
      removePlaced(key);
      return;
    }
    // If a tray number is selected, place it
    if (selectedTray != null) {
      placeNumber(key, selectedTray);
      return;
    }
    // Otherwise select/deselect this slot
    playClick();
    setSelectedSlot(prev => prev === key ? null : key);
  }, [solved, placed, selectedTray, playClick, placeNumber, removePlaced]);

  const handleTrayClick = useCallback((idx) => {
    if (solved || usedTray.has(idx)) return;
    // If a slot is selected, place into it
    if (selectedSlot != null) {
      placeNumber(selectedSlot, idx);
      return;
    }
    // Otherwise select/deselect this tray number
    playClick();
    setSelectedTray(prev => prev === idx ? null : idx);
  }, [solved, usedTray, selectedSlot, playClick, placeNumber]);

  // Contextual hint for seniors
  const slotsLeft = puzzle.slotPositions.length - Object.keys(placed).length;
  const hintText = solved
    ? 'Solved!'
    : selectedTray != null
    ? 'Now tap an empty slot on the grid'
    : selectedSlot != null
    ? 'Now pick a number below'
    : slotsLeft === puzzle.slotPositions.length
    ? 'Tap a number below, then tap an empty slot'
    : `${slotsLeft} slot${slotsLeft !== 1 ? 's' : ''} remaining`;

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Puzzle <strong>{round + 1}</strong> / {rounds}</span>
      </div>

      {/* Contextual hint */}
      <div className={styles.hint} aria-live="polite">{hintText}</div>

      {/* Grid */}
      <div
        className={`${styles.grid} ${solved ? styles.gridSolved : ''}`}
        style={{ gridTemplateColumns: `repeat(${puzzle.cols}, 54px)` }}
        role="grid"
        aria-label="Math cross puzzle grid"
      >
        {Array.from({ length: puzzle.rows }, (_, r) =>
          Array.from({ length: puzzle.cols }, (_, c) => {
            const key = `${r},${c}`;
            const cell = puzzle.cells[key];
            if (!cell) {
              return <div key={key} className={`${styles.cell} ${styles.cellBlank}`} />;
            }
            if (cell.type === 'op') {
              return (
                <div key={key} className={`${styles.cell} ${styles.cellOp}`} aria-label={cell.value === 'x' ? 'times' : cell.value === '=' ? 'equals' : cell.value === '+' ? 'plus' : 'minus'}>
                  {cell.value}
                </div>
              );
            }
            if (cell.type === 'number') {
              return (
                <div key={key} className={`${styles.cell} ${solved ? styles.cellCorrect : styles.cellGiven}`} aria-label={`${cell.value}`}>
                  {cell.value}
                </div>
              );
            }
            // slot
            const placedIdx = placed[key];
            const isFilled = placedIdx != null;
            const isSelected = selectedSlot === key;
            const isJust = justPlacedKey === key;
            const value = isFilled ? puzzle.trayValues[placedIdx] : '';

            let cls = `${styles.cell}`;
            if (solved) cls += ` ${styles.cellCorrect}`;
            else if (isFilled) cls += ` ${styles.cellFilled}`;
            else cls += ` ${styles.cellSlot}`;
            if (isSelected) cls += ` ${styles.cellSlotSelected}`;
            if (isJust) cls += ` ${styles.cellJustPlaced}`;

            return (
              <button
                key={key}
                className={cls}
                onClick={() => handleSlotClick(key)}
                disabled={solved}
                aria-label={isFilled ? `Placed ${value}, tap to remove` : `Empty slot row ${r + 1} col ${c + 1}`}
              >
                {value}
              </button>
            );
          })
        )}
      </div>

      {/* Tray label */}
      <div className={styles.trayLabel}>Available Numbers</div>

      {/* Number tray */}
      <div className={styles.tray} role="group" aria-label="Available numbers to place">
        {puzzle.trayValues.map((val, idx) => {
          const used = usedTray.has(idx);
          const selected = selectedTray === idx;
          let cls = styles.trayNum;
          if (selected) cls += ` ${styles.trayNumSelected}`;
          if (used) cls += ` ${styles.trayNumUsed}`;

          return (
            <button
              key={idx}
              className={cls}
              onClick={() => handleTrayClick(idx)}
              disabled={used || solved}
              aria-label={`Number ${val}${used ? ', used' : selected ? ', selected' : ''}`}
            >
              {val}
            </button>
          );
        })}
      </div>
    </div>
  );
}

MathCrossGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playPop:     PropTypes.func.isRequired,
};

export function MathCross({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'math-cross', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="math-cross"
      title="Math Cross"
      instructions="Place the numbers in the tiles to make the operations correct. Tap a number from the tray, then tap an empty slot. Tap a placed number to remove it. Every row and column equation must be satisfied!"
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail, playPop }) => (
        <MathCrossGame
          difficulty={difficulty}
          onComplete={sc}
          reportScore={reportScore}
          secondsLeft={secondsLeft}
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
