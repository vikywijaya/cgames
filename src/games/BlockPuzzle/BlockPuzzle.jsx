import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './BlockPuzzle.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * BlockPuzzle — fill the outlined shape with the pieces in the tray.
 *
 * Tuned for seniors:
 * - No clock. Pieces never rotate, so what you see in the tray is exactly
 *   what lands on the board.
 * - Tap a piece, then tap any square it should cover (the game finds the
 *   fitting spot around that square), or drag it onto the board.
 * - Tap a placed piece to take it back. Undo and Start over are always there.
 * - Hint puts one piece in its right place (moving anything in the way back
 *   to the tray), so a puzzle can never get stuck.
 * - Every puzzle is built by cutting a shape into the given pieces, so it
 *   always has a solution.
 * - Stars per puzzle: 3 with no hints, 2 with one hint, 1 with more.
 *   maxScore = 3 x puzzles.
 * - Each piece shows its number, so colour is never the only cue.
 */

// Strong, distinct colours with dark borders; all readable with white numbers.
const PIECE_COLORS = [
  { fill: '#2563eb', edge: '#1e3a8a' }, // blue
  { fill: '#dc2626', edge: '#7f1d1d' }, // red
  { fill: '#d97706', edge: '#78350f' }, // amber
  { fill: '#7c3aed', edge: '#4c1d95' }, // purple
  { fill: '#0f766e', edge: '#134e4a' }, // teal
  { fill: '#db2777', edge: '#831843' }, // pink
  { fill: '#4d7c0f', edge: '#365314' }, // olive green
  { fill: '#475569', edge: '#1e293b' }, // slate
];

/* Polyomino shapes (relative coords). Every shape contains [0,0]. */
const SHAPES = {
  d2h: [[0,0],[0,1]],
  d2v: [[0,0],[1,0]],
  i3h: [[0,0],[0,1],[0,2]],
  i3v: [[0,0],[1,0],[2,0]],
  l3a: [[0,0],[0,1],[1,0]],
  l3b: [[0,0],[0,1],[1,1]],
  l3c: [[0,0],[1,0],[1,1]],
  sq:  [[0,0],[0,1],[1,0],[1,1]],
  i4h: [[0,0],[0,1],[0,2],[0,3]],
  i4v: [[0,0],[1,0],[2,0],[3,0]],
  l4a: [[0,0],[0,1],[0,2],[1,0]],
  l4b: [[0,0],[0,1],[0,2],[1,2]],
  l4c: [[0,0],[1,0],[1,1],[1,2]],
  l4d: [[0,0],[1,0],[2,0],[2,1]],
  s4:  [[0,0],[0,1],[1,1],[1,2]],
  t4a: [[0,0],[0,1],[0,2],[1,1]],
  t4b: [[0,0],[1,0],[1,1],[2,0]],
};

const DIFFICULTY_CONFIG = {
  easy:   { gridSize: 5, rounds: 4, pieces: [3, 4], shapes: ['d2h', 'd2v', 'i3h', 'i3v', 'l3a', 'l3b', 'l3c', 'sq'] },
  medium: { gridSize: 6, rounds: 5, pieces: [5, 5], shapes: ['i3h', 'i3v', 'l3a', 'l3b', 'l3c', 'sq', 'i4h', 'l4a', 'l4c', 't4a', 's4'] },
  hard:   { gridSize: 6, rounds: 5, pieces: [6, 7], shapes: ['l3a', 'l3b', 'l3c', 'sq', 'i4h', 'i4v', 'l4a', 'l4b', 'l4c', 'l4d', 's4', 't4a', 't4b'] },
};

const STARS_MAX = 3;
export function starsFor(hints) {
  if (hints <= 0) return 3;
  if (hints === 1) return 2;
  return 1;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const shapeKey = (shape) => shape.map(([r, c]) => `${r},${c}`).join(';');

/**
 * Build a puzzle by growing one connected shape out of pieces. The pieces
 * themselves are the solution, so every puzzle is solvable.
 */
export function generatePuzzle(config, attempt = 0) {
  const { gridSize } = config;
  const target = config.pieces[0] + Math.floor(Math.random() * (config.pieces[1] - config.pieces[0] + 1));
  const active = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));
  const placed = [];
  const touches = (cells) => cells.some(([r, c]) =>
    [[1,0],[-1,0],[0,1],[0,-1]].some(([dr, dc]) => active[r + dr]?.[c + dc]));

  for (let tries = 0; tries < 600 && placed.length < target; tries++) {
    const name = config.shapes[Math.floor(Math.random() * config.shapes.length)];
    // Keep variety: at most two of the same shape.
    if (placed.filter(p => p.name === name).length >= 2) continue;
    const shape = SHAPES[name];
    const r0 = Math.floor(Math.random() * gridSize);
    const c0 = Math.floor(Math.random() * gridSize);
    const cells = shape.map(([dr, dc]) => [r0 + dr, c0 + dc]);
    const fits = cells.every(([r, c]) => r < gridSize && c < gridSize && !active[r][c]);
    if (!fits) continue;
    if (placed.length === 0) {
      // First piece near the middle so the shape can grow in every direction.
      const mid = (gridSize - 1) / 2;
      if (Math.abs(r0 - mid) > 1.5 || Math.abs(c0 - mid) > 1.5) continue;
    } else if (!touches(cells)) continue;
    cells.forEach(([r, c]) => { active[r][c] = true; });
    placed.push({ name, shape, cells });
  }

  if (placed.length < target && attempt < 30) return generatePuzzle(config, attempt + 1);

  // Trim empty rows/columns so the shape fills the board (bigger squares).
  const all = placed.flatMap(p => p.cells);
  const r0 = Math.min(...all.map(([r]) => r));
  const c0 = Math.min(...all.map(([, c]) => c));
  const rows = Math.max(...all.map(([r]) => r)) - r0 + 1;
  const cols = Math.max(...all.map(([, c]) => c)) - c0 + 1;
  const size = Math.max(rows, cols);
  const offR = r0 - Math.floor((size - rows) / 2);
  const offC = c0 - Math.floor((size - cols) / 2);
  const grid = Array.from({ length: size }, () => Array(size).fill(false));
  const pieces = shuffle(placed).map((p, i) => {
    const solution = p.cells.map(([r, c]) => [r - offR, c - offC]);
    solution.forEach(([r, c]) => { grid[r][c] = true; });
    return { shape: p.shape, key: shapeKey(p.shape), color: PIECE_COLORS[i % PIECE_COLORS.length], solution };
  });
  return { gridSize: size, active: grid, pieces };
}

/** Cells piece `shape` would cover with its [0,0] at (r, c). */
const cellsAt = (shape, r, c) => shape.map(([dr, dc]) => [r + dr, c + dc]);

function fitsOn(board, cells) {
  return cells.every(([r, c]) => board[r]?.[c] === null);
}

/**
 * Where the piece goes when the player taps (r, c): first try with the
 * piece's top-left block on that square, then any other position that
 * still covers the tapped square.
 */
export function findFit(board, shape, r, c) {
  const first = cellsAt(shape, r, c);
  if (fitsOn(board, first)) return first;
  for (const [dr, dc] of shape) {
    const cells = cellsAt(shape, r - dr, c - dc);
    if (fitsOn(board, cells)) return cells;
  }
  return null;
}

function buildBoard(puzzle, placements) {
  const board = puzzle.active.map(row => row.map(a => (a ? null : 'x')));
  Object.entries(placements).forEach(([idx, cells]) => {
    cells.forEach(([r, c]) => { board[r][c] = Number(idx); });
  });
  return board;
}

const sameCells = (a, b) => {
  const s = new Set(a.map(([r, c]) => `${r},${c}`));
  return b.length === a.length && b.every(([r, c]) => s.has(`${r},${c}`));
};

/**
 * Pick one hint move: a solution slot that isn't yet filled by a matching
 * piece, and the piece to put there. Returns the new placements.
 */
export function hintMove(puzzle, placements) {
  const slots = puzzle.pieces.map(p => ({ key: p.key, cells: p.solution }));
  const inGoodSpot = new Set();
  const openSlots = [];
  slots.forEach(slot => {
    const owner = Object.entries(placements).find(([idx, cells]) =>
      !inGoodSpot.has(Number(idx)) && puzzle.pieces[idx].key === slot.key && sameCells(cells, slot.cells));
    if (owner) inGoodSpot.add(Number(owner[0]));
    else openSlots.push(slot);
  });
  if (openSlots.length === 0) return null;
  const slot = openSlots[0];
  const candidates = puzzle.pieces
    .map((p, i) => i)
    .filter(i => puzzle.pieces[i].key === slot.key && !inGoodSpot.has(i));
  // Prefer a piece still in the tray.
  const pieceIdx = candidates.find(i => !placements[i]) ?? candidates[0];
  const slotSet = new Set(slot.cells.map(([r, c]) => `${r},${c}`));
  const next = {};
  const returned = [];
  Object.entries(placements).forEach(([idx, cells]) => {
    const i = Number(idx);
    if (i === pieceIdx) return;
    if (cells.some(([r, c]) => slotSet.has(`${r},${c}`))) returned.push(i);
    else next[i] = cells;
  });
  next[pieceIdx] = slot.cells;
  return { placements: next, pieceIdx, cells: slot.cells, returned };
}

function PieceShape({ piece, idx, cell }) {
  const rows = Math.max(...piece.shape.map(([r]) => r)) + 1;
  const cols = Math.max(...piece.shape.map(([, c]) => c)) + 1;
  const set = new Set(piece.shape.map(([r, c]) => `${r},${c}`));
  return (
    <span className={styles.shape} style={{ '--pc': `${cell}px`, gridTemplateColumns: `repeat(${cols}, var(--pc))`, gridTemplateRows: `repeat(${rows}, var(--pc))` }}>
      {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
        const on = set.has(`${r},${c}`);
        return (
          <span
            key={`${r}-${c}`}
            className={on ? styles.shapeCell : styles.shapeGap}
            style={on ? { background: piece.color.fill, borderColor: piece.color.edge } : undefined}
          >
            {on && r === 0 && c === 0 ? idx + 1 : ''}
          </span>
        );
      }))}
    </span>
  );
}
PieceShape.propTypes = { piece: PropTypes.object.isRequired, idx: PropTypes.number.isRequired, cell: PropTypes.number.isRequired };

function BlockPuzzleGame({ difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const tb = t.games['block-puzzle'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { rounds } = config;

  const [round, setRound] = useState(0);
  const [puzzle, setPuzzle] = useState(() => generatePuzzle(config));
  const [placements, setPlacements] = useState({}); // pieceIdx -> cells
  const [history, setHistory] = useState([]);       // earlier placements, for Undo
  const [selected, setSelected] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  const [hints, setHints] = useState(0);
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(false);
  const [message, setMessage] = useState(null);     // { text, tone }
  const [flash, setFlash] = useState(null);         // { cells:Set, tone }
  const [banner, setBanner] = useState(null);
  const [drag, setDrag] = useState(null);           // { pieceIdx, x, y }

  const boardRef = useRef(null);
  const dragMovedRef = useRef(false);
  const placementsRef = useRef(placements);
  placementsRef.current = placements;
  const solvedRef = useRef(false);
  const hintsRef = useRef(0);
  const scoreRef = useRef(0);
  const doneRef = useRef(false);
  const idRef = useRef(0);
  const timersRef = useRef(new Set());

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  const cbRef = useRef({});
  cbRef.current = { reportRound };
  useEffect(() => { cbRef.current.reportRound?.(round + 1, rounds); }, [round, rounds]);

  const board = useMemo(() => buildBoard(puzzle, placements), [puzzle, placements]);
  const emptyCells = useMemo(() => board.reduce((n, row) => n + row.filter(v => v === null).length, 0), [board]);

  const flashCells = useCallback((cells, tone, ms = 700) => {
    const id = ++idRef.current;
    setFlash({ id, cells: new Set(cells.map(([r, c]) => `${r},${c}`)), tone });
    later(() => setFlash(f => (f?.id === id ? null : f)), ms);
  }, [later]);

  const nextPuzzle = useCallback(() => {
    if (doneRef.current) return;
    const n = round + 1;
    if (n >= rounds) {
      doneRef.current = true;
      onComplete({ finalScore: scoreRef.current, maxScore: rounds * STARS_MAX, completed: true });
      return;
    }
    solvedRef.current = false;
    hintsRef.current = 0;
    setRound(n);
    setPuzzle(generatePuzzle(config));
    setPlacements({});
    setHistory([]);
    setSelected(null);
    setHints(0);
    setSolved(false);
    setMessage(null);
    setFlash(null);
  }, [round, rounds, config, onComplete]);

  // Commit a new arrangement; checks for a solved board.
  const commit = useCallback((next) => {
    setHistory(h => [...h, placementsRef.current]);
    placementsRef.current = next;
    setPlacements(next);
    const full = buildBoard(puzzle, next).every(row => row.every(v => v !== null));
    if (full && !solvedRef.current) {
      solvedRef.current = true;
      setSolved(true);
      setSelected(null);
      const stars = starsFor(hintsRef.current);
      scoreRef.current += stars;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      const id = ++idRef.current;
      setBanner({ id, text: `${tb.solved} ${'★'.repeat(stars)}` });
      later(() => setBanner(b => (b?.id === id ? null : b)), 1500);
      setMessage({ text: hintsRef.current === 0 ? tb.noHelp : tb.wellDone, tone: 'good' });
      later(() => playSuccess(), 200);
      later(nextPuzzle, 1900);
    }
  }, [puzzle, reportScore, playSuccess, later, nextPuzzle, tb.solved, tb.noHelp, tb.wellDone]);

  const placePiece = useCallback((pieceIdx, r, c) => {
    if (solvedRef.current || pieceIdx == null) return false;
    const piece = puzzle.pieces[pieceIdx];
    if (!piece || placementsRef.current[pieceIdx]) return false;
    const fit = findFit(buildBoard(puzzle, placementsRef.current), piece.shape, r, c);
    if (!fit) {
      playFail();
      setMessage({ text: tb.noFit, tone: 'bad' });
      flashCells(cellsAt(piece.shape, r, c).filter(([cr, cc]) => puzzle.active[cr]?.[cc] !== undefined), 'bad');
      return false;
    }
    playClick();
    setSelected(null);
    setHoverCell(null);
    setMessage(null);
    flashCells(fit, 'placed', 350);
    commit({ ...placementsRef.current, [pieceIdx]: fit });
    return true;
  }, [puzzle, commit, flashCells, playClick, playFail, tb.noFit]);

  const liftPiece = useCallback((pieceIdx) => {
    if (solvedRef.current) return;
    playClick();
    const next = { ...placementsRef.current };
    delete next[pieceIdx];
    commit(next);
    setSelected(pieceIdx);
    setMessage({ text: tb.liftedBack, tone: 'info' });
  }, [commit, playClick, tb.liftedBack]);

  const handleCell = useCallback((r, c) => {
    if (solvedRef.current) return;
    const v = board[r][c];
    if (v === 'x') return;
    if (v !== null) { liftPiece(v); return; }
    if (selected == null) { setMessage({ text: tb.pickFirst, tone: 'info' }); return; }
    placePiece(selected, r, c);
  }, [board, selected, liftPiece, placePiece, tb.pickFirst]);

  const undo = useCallback(() => {
    if (solvedRef.current || history.length === 0) return;
    playClick();
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    placementsRef.current = prev;
    setPlacements(prev);
    setSelected(null);
    setMessage(null);
  }, [history, playClick]);

  const reset = useCallback(() => {
    if (solvedRef.current || Object.keys(placementsRef.current).length === 0) return;
    playClick();
    commit({});
    setSelected(null);
    setMessage(null);
  }, [commit, playClick]);

  const hint = useCallback(() => {
    if (solvedRef.current) return;
    const move = hintMove(puzzle, placementsRef.current);
    if (!move) return;
    hintsRef.current += 1;
    setHints(hintsRef.current);
    setSelected(null);
    setMessage({ text: move.returned.length ? tb.hintMoved : tb.hintPlaced, tone: 'info' });
    flashCells(move.cells, 'hint', 1600);
    playClick();
    commit(move.placements);
  }, [puzzle, commit, flashCells, playClick, tb.hintMoved, tb.hintPlaced]);

  const pickPiece = useCallback((idx) => {
    if (solvedRef.current || placementsRef.current[idx]) return;
    playClick();
    setSelected(prev => (prev === idx ? null : idx));
    setMessage({ text: tb.nowTapBoard, tone: 'info' });
  }, [playClick, tb.nowTapBoard]);

  // ── Drag and drop (pointer based: mouse, touch, pen) ──
  const cellFromPoint = useCallback((x, y) => {
    const el = boardRef.current;
    if (!el) return null;
    const first = el.firstElementChild;
    if (!first) return null;
    const cr = first.getBoundingClientRect();
    const style = getComputedStyle(el);
    const gap = parseFloat(style.columnGap) || 0;
    const pitch = cr.width + gap;
    if (!pitch) return null;
    const c = Math.floor((x - cr.left) / pitch);
    const r = Math.floor((y - cr.top) / pitch);
    if (r < 0 || c < 0 || r >= puzzle.gridSize || c >= puzzle.gridSize) return null;
    return [r, c];
  }, [puzzle.gridSize]);

  const onPieceDown = useCallback((e, idx) => {
    if (solvedRef.current || placementsRef.current[idx]) return;
    if (e.button != null && e.button !== 0) return;
    dragMovedRef.current = false;
    setDrag({ pieceIdx: idx, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  }, []);

  const onPieceMove = useCallback((e) => {
    if (!drag) return;
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) dragMovedRef.current = true;
    if (!dragMovedRef.current) return;
    if (selected !== drag.pieceIdx) setSelected(drag.pieceIdx);
    setDrag(d => (d ? { ...d, x: e.clientX, y: e.clientY, moved: true } : d));
    setHoverCell(cellFromPoint(e.clientX, e.clientY));
  }, [drag, selected, cellFromPoint]);

  const onPieceUp = useCallback((e, idx) => {
    if (!drag) return;
    const moved = dragMovedRef.current;
    setDrag(null);
    setHoverCell(null);
    if (!moved) { pickPiece(idx); return; }
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell && board[cell[0]][cell[1]] !== 'x') placePiece(idx, cell[0], cell[1]);
    else { setSelected(idx); setMessage({ text: tb.nowTapBoard, tone: 'info' }); }
  }, [drag, board, cellFromPoint, pickPiece, placePiece, tb.nowTapBoard]);

  // Preview where the selected piece would land.
  const preview = useMemo(() => {
    if (selected == null || !hoverCell || placements[selected]) return null;
    const [r, c] = hoverCell;
    if (board[r]?.[c] !== null) return null;
    const fit = findFit(board, puzzle.pieces[selected].shape, r, c);
    return fit ? new Set(fit.map(([a, b]) => `${a},${b}`)) : null;
  }, [selected, hoverCell, placements, board, puzzle.pieces]);

  const piecesLeft = puzzle.pieces.length - Object.keys(placements).length;
  const n = puzzle.gridSize;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.puzzle} {round + 1}/{rounds}</span>
          <span className={styles.hintCount} aria-label={`${tb.hintsUsed} ${hints}`}>
            💡 {hints}
          </span>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>★ / {rounds * STARS_MAX}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <p className={styles.status}>
          {solved ? tb.solved : `${tb.squaresLeft}: ${emptyCells} · ${tb.piecesLeft}: ${piecesLeft}`}
        </p>

        <div className={styles.boardWrap}>
          {banner && <div key={banner.id} className={styles.banner}>{banner.text}</div>}
          <div
            key={`b${round}`}
            ref={boardRef}
            className={`${styles.board} ${solved ? styles.boardSolved : ''}`}
            style={{ '--n': n, gridTemplateColumns: `repeat(${n}, var(--cell))` }}
          >
            {board.map((row, r) => row.map((v, c) => {
              const k = `${r},${c}`;
              if (v === 'x') return <span key={k} className={styles.cellOff} aria-hidden="true" />;
              const piece = v !== null ? puzzle.pieces[v] : null;
              const inPreview = preview?.has(k);
              const fl = flash?.cells.has(k) ? flash.tone : null;
              const cls = [
                styles.cell,
                piece ? styles.cellFilled : styles.cellEmpty,
                inPreview ? styles.cellPreview : '',
                fl ? styles[`flash_${fl}`] : '',
              ].join(' ');
              const sel = selected != null ? puzzle.pieces[selected] : null;
              const style = piece
                ? { background: piece.color.fill, borderColor: piece.color.edge }
                : inPreview && sel ? { background: sel.color.fill, borderColor: sel.color.edge } : undefined;
              const isAnchor = piece && placements[v]?.[0]?.[0] === r && placements[v]?.[0]?.[1] === c;
              return (
                <button
                  key={k}
                  type="button"
                  className={cls}
                  style={style}
                  onClick={() => handleCell(r, c)}
                  onMouseEnter={() => setHoverCell([r, c])}
                  onMouseLeave={() => setHoverCell(h => (h && h[0] === r && h[1] === c ? null : h))}
                  disabled={solved}
                  aria-label={piece ? `${tb.pieceLabel} ${v + 1}. ${tb.placedCell}` : `${tb.emptyCell} ${r + 1}, ${c + 1}`}
                >
                  {isAnchor ? v + 1 : ''}
                </button>
              );
            }))}
          </div>
        </div>

        <p className={`${styles.message} ${message ? styles[`msg_${message.tone}`] : ''}`} aria-live="polite">
          {message?.text ?? (selected == null ? tb.pickFirst : tb.nowTapBoard)}
        </p>

        <div className={styles.tray}>
          {puzzle.pieces.map((piece, idx) => {
            const used = !!placements[idx];
            return (
              <button
                key={`${round}-${idx}`}
                type="button"
                className={[
                  styles.pieceCard,
                  selected === idx ? styles.pieceSelected : '',
                  used ? styles.pieceUsed : '',
                  drag?.pieceIdx === idx && drag.moved ? styles.pieceDragging : '',
                ].join(' ')}
                onPointerDown={(e) => onPieceDown(e, idx)}
                onPointerMove={onPieceMove}
                onPointerUp={(e) => onPieceUp(e, idx)}
                onPointerCancel={() => { setDrag(null); setHoverCell(null); }}
                disabled={used || solved}
                aria-pressed={selected === idx}
                aria-label={`${tb.pieceLabel} ${idx + 1}${used ? `, ${tb.onBoard}` : ''}`}
              >
                <PieceShape piece={piece} idx={idx} cell={20} />
              </button>
            );
          })}
        </div>

        <div className={styles.tools}>
          <button type="button" className={styles.toolBtn} onClick={undo} disabled={solved || history.length === 0}>
            <span aria-hidden="true">↶</span> {tb.undo}
          </button>
          <button type="button" className={styles.toolBtn} onClick={reset} disabled={solved || Object.keys(placements).length === 0}>
            <span aria-hidden="true">⟲</span> {tb.reset}
          </button>
          <button type="button" className={`${styles.toolBtn} ${styles.hintBtn}`} onClick={hint} disabled={solved}>
            <span aria-hidden="true">💡</span> {tb.hint}
          </button>
        </div>
      </div>

      {drag?.moved && (
        <div className={styles.ghost} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <PieceShape piece={puzzle.pieces[drag.pieceIdx]} idx={drag.pieceIdx} cell={40} />
        </div>
      )}
    </div>
  );
}

BlockPuzzleGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function BlockPuzzle({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'block-puzzle', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="block-puzzle"
      title={t.games['block-puzzle'].title}
      instructions={t.games['block-puzzle'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, reportRound, playClick, playSuccess, playFail }) => (
        <BlockPuzzleGame difficulty={diff} onComplete={sc} reportScore={reportScore} reportRound={reportRound} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

BlockPuzzle.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};

export { DIFFICULTY_CONFIG };
