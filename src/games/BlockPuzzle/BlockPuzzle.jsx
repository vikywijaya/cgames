import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './BlockPuzzle.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/* ── Colours for pieces ── */
const PIECE_COLORS = [
  '#f59e0b', // amber/yellow
  '#3b82f6', // blue
  '#22c55e', // green
  '#ef4444', // red
  '#a78bfa', // purple
  '#06b6d4', // teal
  '#f97316', // orange
  '#ec4899', // pink
];

/* ── All polyomino shapes (relative coords) ── */
const SHAPES = [
  // Monominoes & Dominoes
  [[0,0],[0,1]],                                         // horizontal 2
  [[0,0],[1,0]],                                         // vertical 2
  // Triominoes
  [[0,0],[0,1],[0,2]],                                   // horizontal 3
  [[0,0],[1,0],[2,0]],                                   // vertical 3
  [[0,0],[0,1],[1,0]],                                   // L corner
  [[0,0],[0,1],[1,1]],                                   // reverse L corner
  // Tetrominoes
  [[0,0],[0,1],[1,0],[1,1]],                             // 2x2 square
  [[0,0],[0,1],[0,2],[0,3]],                             // horizontal 4
  [[0,0],[1,0],[2,0],[3,0]],                             // vertical 4
  [[0,0],[0,1],[0,2],[1,0]],                             // L
  [[0,0],[0,1],[0,2],[1,2]],                             // reverse L
  [[0,0],[1,0],[1,1],[1,2]],                             // L flipped
  [[0,0],[0,1],[1,1],[1,2]],                             // S
  [[0,0],[0,1],[1,0],[0,2]],                             // T top
  [[0,0],[1,0],[1,1],[2,0]],                             // T left
];

const DIFFICULTY_CONFIG = {
  easy:   { gridSize: 6, rounds: 4, timeLimitSeconds: null },
  medium: { gridSize: 7, rounds: 6, timeLimitSeconds: 180  },
  hard:   { gridSize: 8, rounds: 8, timeLimitSeconds: 120  },
};

const TIME_LIMITS = { easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds ?? null, medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds ?? null, hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds ?? null };

/**
 * Generate a puzzle board. We start with an empty grid, place random pieces
 * to create a pattern, then give the player those pieces to place back.
 */
function generatePuzzle(gridSize) {
  const board = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
  // active = which cells are part of the puzzle shape
  const active = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));
  const pieces = [];

  // Try to fill as much of the board as possible with pieces
  const maxAttempts = 200;
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    // Pick a random shape
    const shapeIdx = Math.floor(Math.random() * SHAPES.length);
    const shape = SHAPES[shapeIdx];
    const color = PIECE_COLORS[pieces.length % PIECE_COLORS.length];

    // Pick a random position
    const r = Math.floor(Math.random() * gridSize);
    const c = Math.floor(Math.random() * gridSize);

    // Check if shape fits
    const cells = shape.map(([dr, dc]) => [r + dr, c + dc]);
    const fits = cells.every(
      ([cr, cc]) => cr >= 0 && cr < gridSize && cc >= 0 && cc < gridSize && !active[cr][cc]
    );

    if (fits) {
      cells.forEach(([cr, cc]) => {
        active[cr][cc] = true;
        board[cr][cc] = pieces.length; // store piece index
      });
      pieces.push({ shape, color, cells });
    }
  }

  // Only keep puzzle if we placed enough pieces
  if (pieces.length < 3) return generatePuzzle(gridSize);

  return { board, active, pieces, gridSize };
}

function BlockPuzzleGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { gridSize, rounds } = config;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [puzzle, setPuzzle] = useState(() => generatePuzzle(gridSize));
  // Board state: null = empty, 'inactive' = not part of puzzle, or piece index
  const [boardState, setBoardState] = useState(() => initBoard(puzzle));
  const [piecesUsed, setPiecesUsed] = useState(() => new Set());
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [hoverCell, setHoverCell] = useState(null);
  const [solved, setSolved] = useState(false);
  const [justPlaced, setJustPlaced] = useState(new Set());
  // Drag-and-drop state. `drag` holds the floating ghost info while a piece is
  // being dragged from the tray onto the board.
  const [drag, setDrag] = useState(null); // { pieceIdx, x, y } | null
  const boardRef = useRef(null);
  const dragMovedRef = useRef(false);
  const advanceTimerRef = useRef(null);
  const stateRef = useRef({ score, round, rounds, gridSize, onComplete, reportScore, playSuccess });
  stateRef.current = { score, round, rounds, gridSize, onComplete, reportScore, playSuccess };

  function initBoard(puz) {
    return Array.from({ length: puz.gridSize }, (_, r) =>
      Array.from({ length: puz.gridSize }, (_, c) =>
        puz.active[r][c] ? null : 'inactive'
      )
    );
  }

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: rounds, completed: false });
  }, [secondsLeft, score, rounds, onComplete]);

  // Count empty cells to check if solved
  const emptyCells = useMemo(() => {
    let count = 0;
    for (let r = 0; r < puzzle.gridSize; r++) {
      for (let c = 0; c < puzzle.gridSize; c++) {
        if (boardState[r][c] === null) count++;
      }
    }
    return count;
  }, [boardState, puzzle.gridSize]);

  useEffect(() => () => clearTimeout(advanceTimerRef.current), []);

  // Check solved
  useEffect(() => {
    if (emptyCells !== 0 || solved) return;
    setSolved(true);

    const { score: s, round: r, rounds: total, gridSize: gs, onComplete: oc, reportScore: rs, playSuccess: ps } = stateRef.current;
    ps();
    const newScore = s + 1;
    setScore(newScore);
    rs(newScore);

    clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = setTimeout(() => {
      const nextRound = r + 1;
      if (nextRound >= total) {
        oc({ finalScore: newScore, maxScore: total, completed: true });
        return;
      }
      setRound(nextRound);
      const newPuzzle = generatePuzzle(gs);
      setPuzzle(newPuzzle);
      setBoardState(initBoard(newPuzzle));
      setPiecesUsed(new Set());
      setSelectedPiece(null);
      setSolved(false);
      setJustPlaced(new Set());
    }, 900);
  }, [emptyCells, solved]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute preview cells when hovering
  const preview = useMemo(() => {
    if (selectedPiece == null || hoverCell == null) return null;
    const piece = puzzle.pieces[selectedPiece];
    // Find top-left of piece shape to compute offsets
    const minR = Math.min(...piece.shape.map(([r]) => r));
    const minC = Math.min(...piece.shape.map(([, c]) => c));

    const cells = piece.shape.map(([dr, dc]) => [
      hoverCell[0] + (dr - minR),
      hoverCell[1] + (dc - minC),
    ]);

    const valid = cells.every(
      ([r, c]) => r >= 0 && r < puzzle.gridSize && c >= 0 && c < puzzle.gridSize && boardState[r][c] === null
    );

    return { cells, valid };
  }, [selectedPiece, hoverCell, puzzle, boardState]);

  // Remove a placed piece from the board, returning it to the tray
  const removePiece = useCallback((pieceIdx) => {
    if (solved) return;
    playClick();
    const newBoard = boardState.map(row => [...row]);
    for (let r = 0; r < puzzle.gridSize; r++) {
      for (let c = 0; c < puzzle.gridSize; c++) {
        if (newBoard[r][c] === pieceIdx) newBoard[r][c] = null;
      }
    }
    setBoardState(newBoard);
    setPiecesUsed(prev => {
      const next = new Set(prev);
      next.delete(pieceIdx);
      return next;
    });
    setSelectedPiece(pieceIdx);
  }, [solved, boardState, puzzle.gridSize, playClick]);

  // Clear all placed pieces
  const clearAll = useCallback(() => {
    if (solved) return;
    playClick();
    setBoardState(initBoard(puzzle));
    setPiecesUsed(new Set());
    setSelectedPiece(null);
    setHoverCell(null);
  }, [solved, puzzle, playClick]);

  // Try to place piece `pieceIdx` anchored so its top-left lands at (r, c).
  // Returns true if placed. Shared by tap-to-place and drag-and-drop.
  const tryPlace = useCallback((pieceIdx, r, c) => {
    if (solved || pieceIdx == null || piecesUsed.has(pieceIdx)) return false;
    const piece = puzzle.pieces[pieceIdx];
    if (!piece) return false;
    const minR = Math.min(...piece.shape.map(([dr]) => dr));
    const minC = Math.min(...piece.shape.map(([, dc]) => dc));

    const cells = piece.shape.map(([dr, dc]) => [r + (dr - minR), c + (dc - minC)]);
    const valid = cells.every(
      ([cr, cc]) => cr >= 0 && cr < puzzle.gridSize && cc >= 0 && cc < puzzle.gridSize && boardState[cr][cc] === null
    );

    if (!valid) {
      playFail();
      return false;
    }

    playClick();
    const newBoard = boardState.map(row => [...row]);
    const placed = new Set();
    cells.forEach(([cr, cc]) => {
      newBoard[cr][cc] = pieceIdx;
      placed.add(`${cr},${cc}`);
    });
    setBoardState(newBoard);
    setJustPlaced(placed);
    setPiecesUsed(prev => new Set([...prev, pieceIdx]));
    setSelectedPiece(null);
    setHoverCell(null);

    // Clear animation after delay
    setTimeout(() => setJustPlaced(new Set()), 300);
    return true;
  }, [solved, piecesUsed, puzzle, boardState, playClick, playFail]);

  const handleCellClick = useCallback((r, c) => {
    if (solved) return;

    const state = boardState[r][c];
    // If tapping a filled cell, remove that piece
    if (state !== null && state !== 'inactive') {
      removePiece(state);
      return;
    }

    if (selectedPiece == null) return;
    if (state !== null) return;

    tryPlace(selectedPiece, r, c);
  }, [solved, selectedPiece, boardState, removePiece, tryPlace]);

  // ── Drag-and-drop (pointer based, works for mouse + touch) ──────────
  // Map a clientX/clientY to the board cell under the pointer, accounting for
  // the piece's pointer-grab offset so the shape's top-left aligns naturally.
  const cellFromPoint = useCallback((clientX, clientY) => {
    const board = boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    // 3px gap + 8px (space-2) padding — derive cell pitch from grid width.
    const pad = 8;
    const gap = 3;
    const size = puzzle.gridSize;
    const inner = rect.width - pad * 2;
    const pitch = (inner + gap) / size; // cell + gap
    const cx = clientX - rect.left - pad;
    const cy = clientY - rect.top - pad;
    if (cx < 0 || cy < 0) return null;
    const c = Math.floor(cx / pitch);
    const r = Math.floor(cy / pitch);
    if (r < 0 || r >= size || c < 0 || c >= size) return null;
    return [r, c];
  }, [puzzle.gridSize]);

  const updateDragHover = useCallback((clientX, clientY) => {
    const cell = cellFromPoint(clientX, clientY);
    setHoverCell(cell);
  }, [cellFromPoint]);

  const handlePiecePointerDown = useCallback((e, idx) => {
    if (solved || piecesUsed.has(idx)) return;
    // Only primary button / touch / pen
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    dragMovedRef.current = false;
    setSelectedPiece(idx);
    setDrag({ pieceIdx: idx, x: e.clientX, y: e.clientY });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* noop */ }
  }, [solved, piecesUsed]);

  const handlePiecePointerMove = useCallback((e) => {
    if (!drag) return;
    e.preventDefault();
    dragMovedRef.current = true;
    setDrag(d => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
    updateDragHover(e.clientX, e.clientY);
  }, [drag, updateDragHover]);

  const endDrag = useCallback((e, idx) => {
    if (!drag) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    const moved = dragMovedRef.current;
    setDrag(null);
    setHoverCell(null);
    if (cell) {
      // Anchor the piece's top-left at the hovered cell.
      const placedOk = tryPlace(idx, cell[0], cell[1]);
      if (placedOk) return;
    }
    // No placement: if it was a tap (no real drag), toggle selection like before.
    if (!moved) {
      setSelectedPiece(prev => (prev === idx ? null : idx));
    }
  }, [drag, cellFromPoint, tryPlace]);

  // Get the color for a filled cell
  const getCellColor = useCallback((r, c) => {
    const val = boardState[r][c];
    if (val === null || val === 'inactive') return null;
    return puzzle.pieces[val]?.color ?? '#94a3b8';
  }, [boardState, puzzle.pieces]);

  // Is a cell in the preview?
  const isPreview = useCallback((r, c) => {
    if (!preview) return false;
    return preview.cells.some(([pr, pc]) => pr === r && pc === c);
  }, [preview]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderLabel}>{t.games['block-puzzle'].label}</span>
          <span className={styles.infoHeaderSub}>{t.common.puzzle} {round + 1} {t.common.of} {rounds}</span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{emptyCells}</span>
          <span className={styles.infoBadgeSub}>left</span>
        </div>
      </div>

      {/* Board */}
      <div
        ref={boardRef}
        className={`${styles.board} ${solved ? styles.boardSolved : ''}`}
        style={{ gridTemplateColumns: `repeat(${puzzle.gridSize}, 40px)` }}
      >
        {Array.from({ length: puzzle.gridSize }, (_, r) =>
          Array.from({ length: puzzle.gridSize }, (_, c) => {
            const state = boardState[r][c];
            const isInactive = state === 'inactive';
            const isFilled = state !== null && state !== 'inactive';
            const inPreview = isPreview(r, c);
            const color = getCellColor(r, c);
            const previewColor = selectedPiece != null ? puzzle.pieces[selectedPiece]?.color : null;
            const jp = justPlaced.has(`${r},${c}`);

            let cellClass = styles.boardCell;
            if (isInactive) cellClass += ` ${styles.cellInactive}`;
            else if (isFilled) cellClass += ` ${styles.cellFilled}`;
            else cellClass += ` ${styles.cellEmpty}`;

            if (inPreview && !isFilled) {
              cellClass += preview.valid ? ` ${styles.cellPreview}` : ` ${styles.cellPreviewInvalid}`;
            }
            if (jp) cellClass += ` ${styles.cellJustPlaced}`;

            return (
              <button
                key={`${r}-${c}`}
                className={cellClass}
                style={
                  isFilled
                    ? { background: color }
                    : inPreview && preview?.valid
                    ? { background: previewColor }
                    : undefined
                }
                onClick={() => !isInactive && handleCellClick(r, c)}
                onMouseEnter={() => !isInactive && !isFilled && setHoverCell([r, c])}
                onMouseLeave={() => setHoverCell(null)}
                disabled={isInactive || solved}
                aria-label={
                  isInactive
                    ? 'Inactive cell'
                    : isFilled
                    ? `Placed piece, tap to remove`
                    : `Empty cell row ${r + 1} column ${c + 1}`
                }
              />
            );
          })
        )}
      </div>

      {/* Clear button */}
      {piecesUsed.size > 0 && !solved && (
        <button className={styles.clearBtn} onClick={clearAll} aria-label="Remove all placed pieces">
          Clear All
        </button>
      )}

      {/* Pieces tray */}
      <div className={styles.pieceTray}>
        {puzzle.pieces.map((piece, idx) => {
          const used = piecesUsed.has(idx);
          const selected = selectedPiece === idx;
          const maxR = Math.max(...piece.shape.map(([r]) => r)) + 1;
          const maxC = Math.max(...piece.shape.map(([, c]) => c)) + 1;
          const shapeSet = new Set(piece.shape.map(([r, c]) => `${r},${c}`));

          let cardClass = styles.pieceCard;
          if (selected) cardClass += ` ${styles.pieceSelected}`;
          if (used) cardClass += ` ${styles.pieceUsed}`;

          return (
            <button
              key={idx}
              className={`${cardClass} ${drag?.pieceIdx === idx ? styles.pieceDragging : ''}`}
              onPointerDown={(e) => handlePiecePointerDown(e, idx)}
              onPointerMove={handlePiecePointerMove}
              onPointerUp={(e) => endDrag(e, idx)}
              onPointerCancel={(e) => endDrag(e, idx)}
              style={{ gridTemplateColumns: `repeat(${maxC}, 22px)`, gridTemplateRows: `repeat(${maxR}, 22px)`, touchAction: 'none' }}
              disabled={used || solved}
              aria-label={`Piece ${idx + 1}${used ? ', placed' : selected ? ', selected' : ''}. Drag onto the board to place.`}
              aria-pressed={selected}
            >
              {Array.from({ length: maxR }, (_, r) =>
                Array.from({ length: maxC }, (_, c) => {
                  const filled = shapeSet.has(`${r},${c}`);
                  return (
                    <div
                      key={`${r}-${c}`}
                      className={`${styles.pieceCell} ${filled ? styles.pieceCellFilled : styles.pieceCellEmpty}`}
                      style={filled ? { background: piece.color } : undefined}
                    />
                  );
                })
              )}
            </button>
          );
        })}
      </div>

      {/* Floating drag ghost following the pointer */}
      {drag && (() => {
        const piece = puzzle.pieces[drag.pieceIdx];
        if (!piece) return null;
        const maxR = Math.max(...piece.shape.map(([r]) => r)) + 1;
        const maxC = Math.max(...piece.shape.map(([, c]) => c)) + 1;
        const shapeSet = new Set(piece.shape.map(([r, c]) => `${r},${c}`));
        return (
          <div
            className={styles.dragGhost}
            style={{
              left: drag.x,
              top: drag.y,
              gridTemplateColumns: `repeat(${maxC}, 40px)`,
              gridTemplateRows: `repeat(${maxR}, 40px)`,
            }}
            aria-hidden="true"
          >
            {Array.from({ length: maxR }, (_, r) =>
              Array.from({ length: maxC }, (_, c) => {
                const filled = shapeSet.has(`${r},${c}`);
                return (
                  <div
                    key={`${r}-${c}`}
                    className={styles.dragGhostCell}
                    style={filled ? { background: piece.color } : undefined}
                  />
                );
              })
            )}
          </div>
        );
      })()}
    </div>
  );
}

BlockPuzzleGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

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
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <BlockPuzzleGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
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
