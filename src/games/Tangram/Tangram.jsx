import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './Tangram.module.css';

/* ── The 7 classic tangram pieces (tans) ──
   Each piece is defined as a polygon in a normalised coordinate space.
   The full tangram square is 100×100.
   Pieces are: 2 large triangles, 1 medium triangle, 2 small triangles,
   1 square, and 1 parallelogram. */

const TAN_DEFS = [
  { id: 'lg-tri-1',  label: 'Large Triangle 1',  color: '#ef4444', points: [[0,0],[50,50],[0,100]] },
  { id: 'lg-tri-2',  label: 'Large Triangle 2',  color: '#3b82f6', points: [[0,0],[100,0],[50,50]] },
  { id: 'md-tri',    label: 'Medium Triangle',    color: '#22c55e', points: [[50,50],[100,100],[0,100]] },
  { id: 'sm-tri-1',  label: 'Small Triangle 1',   color: '#f59e0b', points: [[0,0],[50,0],[25,25]] },
  { id: 'sm-tri-2',  label: 'Small Triangle 2',   color: '#a78bfa', points: [[50,50],[75,25],[75,75]] },
  { id: 'square',    label: 'Square',             color: '#ec4899', points: [[25,25],[50,0],[75,25],[50,50]] },
  { id: 'para',      label: 'Parallelogram',      color: '#06b6d4', points: [[50,50],[75,75],[100,75],[75,50]] },
];

/* ── Puzzle silhouettes ──
   Each puzzle has a target outline (SVG path) and a solution: where each
   piece should be placed. The player drags pieces onto the board to
   match the silhouette. We define puzzles as a set of piece placements
   (translate offsets) that together form the silhouette. */

function generatePuzzles() {
  // Each puzzle is an arrangement of all 7 tans inside a 100×100 viewbox.
  // We pre-define several classic tangram shapes.
  return [
    {
      name: 'Square',
      // Classic square arrangement
      solution: [
        { id: 'lg-tri-1',  x: 0, y: 0 },
        { id: 'lg-tri-2',  x: 0, y: 0 },
        { id: 'md-tri',    x: 0, y: 0 },
        { id: 'sm-tri-1',  x: 0, y: 0 },
        { id: 'sm-tri-2',  x: 0, y: 0 },
        { id: 'square',    x: 0, y: 0 },
        { id: 'para',      x: 0, y: 0 },
      ],
    },
    {
      name: 'Arrow',
      solution: [
        { id: 'lg-tri-1',  x: 25, y: -25 },
        { id: 'lg-tri-2',  x: 0,  y: 0 },
        { id: 'md-tri',    x: 15, y: 10 },
        { id: 'sm-tri-1',  x: 10, y: 30 },
        { id: 'sm-tri-2',  x: -5, y: 20 },
        { id: 'square',    x: 5,  y: 5 },
        { id: 'para',      x: -10, y: 15 },
      ],
    },
    {
      name: 'House',
      solution: [
        { id: 'lg-tri-1',  x: 10, y: -20 },
        { id: 'lg-tri-2',  x: -5, y: 5 },
        { id: 'md-tri',    x: 5,  y: 15 },
        { id: 'sm-tri-1',  x: 20, y: 10 },
        { id: 'sm-tri-2',  x: 15, y: -5 },
        { id: 'square',    x: 0,  y: 25 },
        { id: 'para',      x: -15, y: 20 },
      ],
    },
  ];
}

/* ── Snap distance threshold (in SVG units) ── */
const SNAP_DIST = 8;

/* ── Difficulty config ── */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 3, timeLimitSeconds: null, showOutlines: true  },
  medium: { rounds: 5, timeLimitSeconds: 180,  showOutlines: true  },
  hard:   { rounds: 7, timeLimitSeconds: 120,  showOutlines: false },
};

const TIME_LIMITS = {
  easy:   DIFFICULTY_CONFIG.easy.timeLimitSeconds,
  medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds,
  hard:   DIFFICULTY_CONFIG.hard.timeLimitSeconds,
};

/* ── Point-in-polygon test (ray casting) ── */
function pointInPolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/* ── Distance between two points ── */
function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

/* ── Compute centroid of a polygon ── */
function centroid(points) {
  const n = points.length;
  const cx = points.reduce((s, p) => s + p[0], 0) / n;
  const cy = points.reduce((s, p) => s + p[1], 0) / n;
  return [cx, cy];
}

/* ── Generate a random arrangement puzzle ──
   We place all 7 tans at random positions around a board.
   The target silhouette is the "solution" arrangement. */

function buildRound(gridSize) {
  const trayPieces = TAN_DEFS.map((def) => {
    // Scatter pieces in a tray area below the board
    return {
      ...def,
      x: 10 + Math.random() * (gridSize - 40),
      y: gridSize + 20 + Math.random() * 40,
      placed: false,
    };
  });

  // The solution positions are defined relative to the board centre
  const solutionPieces = TAN_DEFS.map((def) => {
    const [cx, cy] = centroid(def.points);
    return {
      id: def.id,
      // Target position: piece centroid should be at its solution spot
      targetX: 0,
      targetY: 0,
      cx, cy,
    };
  });

  return { trayPieces, solutionPieces };
}

/* ──────────────────────────────────────────────────────
   TangramGame — the inner game component
────────────────────────────────────────────────────── */
function TangramGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { rounds, showOutlines } = config;
  const boardSize = 240; // SVG viewBox size for the board area
  const trayHeight = 100;
  const totalHeight = boardSize + trayHeight + 20;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(false);

  // Each piece: { ...TAN_DEF, x, y, placed }
  const [pieces, setPieces] = useState(() => initPieces());
  const [dragging, setDragging] = useState(null); // { id, offsetX, offsetY }
  const svgRef = useRef(null);

  function initPieces() {
    // Place pieces randomly in the tray area
    const shuffled = [...TAN_DEFS].sort(() => Math.random() - 0.5);
    return shuffled.map((def, i) => ({
      ...def,
      x: 15 + (i % 4) * 55,
      y: boardSize + 10 + Math.floor(i / 4) * 55,
      placed: false,
    }));
  }

  // Target positions: all pieces assembled into the classic square at centre of board
  const targets = useMemo(() => {
    // Classic tangram square — each piece's centroid target on the board
    // We'll place the assembled square centred at (boardSize/2, boardSize/2)
    // Scale factor: pieces defined in 0-100 space, board is boardSize
    const scale = boardSize * 0.7 / 100;
    const ox = boardSize * 0.15;
    const oy = boardSize * 0.15;

    return TAN_DEFS.map(def => {
      const [cx, cy] = centroid(def.points);
      return {
        id: def.id,
        x: ox + cx * scale,
        y: oy + cy * scale,
      };
    });
  }, [boardSize]);

  // Scale for rendering pieces
  const pieceScale = boardSize * 0.7 / 100;

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: rounds, completed: false });
  }, [secondsLeft, score, rounds, onComplete]);

  // Check if all pieces are placed correctly
  useEffect(() => {
    if (solved) return;
    const allPlaced = pieces.every(p => p.placed);
    if (!allPlaced) return;

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
      setPieces(initPieces());
      setSolved(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, [pieces, solved, score, round, rounds, onComplete, reportScore, playSuccess]);

  // Convert mouse/touch event to SVG coordinates
  const toSVG = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    const touch = e.touches?.[0] ?? e.changedTouches?.[0] ?? e;
    pt.x = touch.clientX;
    pt.y = touch.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const handlePointerDown = useCallback((e, pieceId) => {
    if (solved) return;
    e.preventDefault();
    const pos = toSVG(e);
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;

    // If piece was placed, unplace it
    if (piece.placed) {
      setPieces(prev => prev.map(p =>
        p.id === pieceId ? { ...p, placed: false } : p
      ));
    }

    playClick();
    setDragging({
      id: pieceId,
      offsetX: pos.x - piece.x,
      offsetY: pos.y - piece.y,
    });
  }, [solved, pieces, toSVG, playClick]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();
    const pos = toSVG(e);
    setPieces(prev => prev.map(p =>
      p.id === dragging.id
        ? { ...p, x: pos.x - dragging.offsetX, y: pos.y - dragging.offsetY }
        : p
    ));
  }, [dragging, toSVG]);

  const handlePointerUp = useCallback((e) => {
    if (!dragging) return;
    e.preventDefault();

    const piece = pieces.find(p => p.id === dragging.id);
    const target = targets.find(t => t.id === dragging.id);

    if (piece && target) {
      // Check if piece centroid is close to target
      const [cx, cy] = centroid(piece.points);
      const pieceCX = piece.x + cx * pieceScale;
      const pieceCY = piece.y + cy * pieceScale;
      const d = dist(pieceCX, pieceCY, target.x, target.y);

      if (d < SNAP_DIST * 3) {
        // Snap to target
        const snapX = target.x - cx * pieceScale;
        const snapY = target.y - cy * pieceScale;
        setPieces(prev => prev.map(p =>
          p.id === dragging.id
            ? { ...p, x: snapX, y: snapY, placed: true }
            : p
        ));
        playSuccess();
      } else {
        playFail();
      }
    }

    setDragging(null);
  }, [dragging, pieces, targets, pieceScale, playSuccess, playFail]);

  // Reset all pieces to tray
  const resetPieces = useCallback(() => {
    if (solved) return;
    playClick();
    setPieces(initPieces());
  }, [solved, playClick]);

  const placedCount = pieces.filter(p => p.placed).length;

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Puzzle <strong>{round + 1}</strong> / {rounds}</span>
        <span className={styles.roundLabel}>{placedCount} / 7 placed</span>
      </div>

      <svg
        ref={svgRef}
        className={styles.board}
        viewBox={`0 0 ${boardSize} ${totalHeight}`}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        onTouchCancel={handlePointerUp}
      >
        {/* Board background */}
        <rect
          x="4" y="4"
          width={boardSize - 8} height={boardSize - 8}
          rx="12"
          fill="#f1f5f9"
          stroke="#cbd5e1"
          strokeWidth="2"
        />

        {/* Target silhouette outlines */}
        {showOutlines && targets.map(target => {
          const def = TAN_DEFS.find(d => d.id === target.id);
          const placed = pieces.find(p => p.id === target.id)?.placed;
          if (placed) return null;
          const pts = def.points
            .map(([px, py]) => `${target.x - centroid(def.points)[0] * pieceScale + px * pieceScale},${target.y - centroid(def.points)[1] * pieceScale + py * pieceScale}`)
            .join(' ');
          return (
            <polygon
              key={`outline-${target.id}`}
              points={pts}
              fill="rgba(148, 163, 184, 0.15)"
              stroke="#94a3b8"
              strokeWidth="1"
              strokeDasharray="4 3"
            />
          );
        })}

        {/* Tray separator */}
        <line
          x1="10" y1={boardSize + 2}
          x2={boardSize - 10} y2={boardSize + 2}
          stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="6 4"
        />
        <text
          x={boardSize / 2} y={boardSize + 14}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="8"
          fontFamily="inherit"
        >
          Drag pieces onto the board
        </text>

        {/* Pieces (render non-dragging first, dragging piece on top) */}
        {pieces
          .sort((a, b) => {
            if (a.id === dragging?.id) return 1;
            if (b.id === dragging?.id) return -1;
            return 0;
          })
          .map(piece => {
            const pts = piece.points
              .map(([px, py]) => `${piece.x + px * pieceScale},${piece.y + py * pieceScale}`)
              .join(' ');
            const isDragging = piece.id === dragging?.id;
            return (
              <g key={piece.id}>
                <polygon
                  points={pts}
                  fill={piece.color}
                  stroke={piece.placed ? '#16a34a' : isDragging ? '#1d4ed8' : 'rgba(0,0,0,0.2)'}
                  strokeWidth={piece.placed ? 2.5 : isDragging ? 2 : 1.5}
                  opacity={piece.placed ? 0.9 : isDragging ? 0.8 : 1}
                  style={{
                    cursor: solved ? 'default' : 'grab',
                    filter: isDragging ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))' : piece.placed ? 'none' : 'drop-shadow(0 2px 3px rgba(0,0,0,0.15))',
                    transition: isDragging ? 'none' : 'all 0.2s ease',
                  }}
                  onMouseDown={(e) => handlePointerDown(e, piece.id)}
                  onTouchStart={(e) => handlePointerDown(e, piece.id)}
                />
                {piece.placed && (
                  <text
                    x={piece.x + centroid(piece.points)[0] * pieceScale}
                    y={piece.y + centroid(piece.points)[1] * pieceScale + 3}
                    textAnchor="middle"
                    fontSize="10"
                    fill="white"
                    style={{ pointerEvents: 'none' }}
                  >
                    ✓
                  </text>
                )}
              </g>
            );
          })}

        {/* Solved overlay */}
        {solved && (
          <g>
            <rect x="0" y="0" width={boardSize} height={boardSize} fill="rgba(34,197,94,0.12)" rx="12" />
            <text
              x={boardSize / 2} y={boardSize / 2}
              textAnchor="middle" dominantBaseline="middle"
              fill="#16a34a" fontSize="20" fontWeight="bold"
              fontFamily="inherit"
            >
              Solved!
            </text>
          </g>
        )}
      </svg>

      {/* Reset button */}
      {placedCount > 0 && !solved && (
        <button className={styles.clearBtn} onClick={resetPieces}>
          Reset Pieces
        </button>
      )}
    </div>
  );
}

TangramGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function Tangram({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'tangram', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="tangram"
      title="Tangram"
      instructions="Drag the seven geometric pieces onto the board to fill the silhouette. Each piece must be placed in its correct position. Match the dashed outlines to solve the puzzle!"
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <TangramGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

Tangram.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
