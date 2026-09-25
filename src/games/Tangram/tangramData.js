/*
 * Tangram puzzle data and geometry helpers.
 *
 * Everything lives on a grid where the small triangle has a long side of 2.
 * Every piece corner sits on a whole grid point, so pieces only ever need
 * quarter turns. Each puzzle is a list of slots [kind, points]; the slots
 * were found with an exact-cover solver, so every puzzle is solvable with
 * the pieces it lists (checked again in tangramData.test.js).
 */

// Base shape of each kind of piece (turn 0).
export const BASE = {
  L: [[0, 0], [4, 0], [2, 2]],          // large triangle
  M: [[0, 0], [2, 0], [0, 2]],          // medium triangle
  S: [[0, 0], [2, 0], [1, 1]],          // small triangle
  Q: [[1, 0], [2, 1], [1, 2], [0, 1]],  // square (sits as a diamond)
  P: [[1, 0], [3, 0], [2, 1], [0, 1]],  // parallelogram
};

// Colours are paired with the shape itself, so colour is never the only cue.
export const COLORS = ['#dc2626', '#2563eb', '#15803d', '#b45309', '#7c3aed', '#be185d', '#0e7490'];

const s = (kind, points) => ({ kind, points });

export const PUZZLES = {
  easy: [
    { name: 'fish', slots: [
      s('L', [[0, 2], [4, 2], [2, 4]]), s('L', [[4, 2], [0, 2], [2, 0]]), s('S', [[5, 1], [5, 3], [4, 2]]),
    ] },
    { name: 'arrow', slots: [
      s('L', [[2, 4], [2, 0], [4, 2]]), s('M', [[0, 1], [2, 1], [0, 3]]),
      s('S', [[2, 1], [2, 3], [1, 2]]), s('S', [[2, 3], [0, 3], [1, 2]]),
    ] },
    { name: 'house', slots: [
      s('L', [[4, 2], [0, 2], [2, 0]]), s('M', [[1, 2], [3, 2], [1, 4]]),
      s('S', [[3, 2], [3, 4], [2, 3]]), s('S', [[3, 4], [1, 4], [2, 3]]),
    ] },
  ],
  medium: [
    { name: 'sail', slots: [
      s('M', [[4, 4], [2, 4], [4, 2]]), s('S', [[4, 0], [4, 2], [3, 1]]), s('S', [[3, 3], [1, 3], [2, 2]]),
      s('Q', [[3, 1], [4, 2], [3, 3], [2, 2]]), s('P', [[1, 3], [3, 3], [2, 4], [0, 4]]),
    ] },
    { name: 'cottage', slots: [
      s('L', [[0, 2], [4, 2], [2, 4]]), s('L', [[4, 2], [0, 2], [2, 0]]), s('M', [[4, 4], [2, 4], [4, 2]]),
      s('S', [[2, 4], [0, 4], [1, 3]]), s('S', [[0, 4], [0, 2], [1, 3]]),
    ] },
    { name: 'rocket', slots: [
      s('L', [[4, 2], [0, 2], [2, 0]]), s('M', [[1, 2], [3, 2], [1, 4]]), s('S', [[3, 2], [3, 4], [2, 3]]),
      s('S', [[3, 4], [1, 4], [2, 3]]), s('P', [[1, 4], [3, 4], [2, 5], [0, 5]]),
    ] },
  ],
  hard: [
    { name: 'square', slots: [
      s('L', [[4, 0], [4, 4], [2, 2]]), s('L', [[4, 4], [0, 4], [2, 2]]), s('M', [[0, 0], [2, 0], [0, 2]]),
      s('S', [[1, 1], [3, 1], [2, 2]]), s('S', [[0, 4], [0, 2], [1, 3]]),
      s('Q', [[1, 1], [2, 2], [1, 3], [0, 2]]), s('P', [[2, 0], [4, 0], [3, 1], [1, 1]]),
    ] },
    { name: 'mountain', slots: [
      s('L', [[4, 4], [0, 4], [2, 2]]), s('L', [[8, 4], [4, 4], [6, 2]]), s('M', [[4, 2], [4, 0], [6, 2]]),
      s('S', [[3, 3], [5, 3], [4, 4]]), s('S', [[4, 0], [4, 2], [3, 1]]),
      s('Q', [[3, 1], [4, 2], [3, 3], [2, 2]]), s('P', [[4, 2], [6, 2], [5, 3], [3, 3]]),
    ] },
    { name: 'slope', slots: [
      s('L', [[4, 0], [8, 0], [6, 2]]), s('L', [[4, 4], [0, 4], [2, 2]]), s('M', [[4, 2], [4, 0], [6, 2]]),
      s('S', [[3, 3], [5, 3], [4, 4]]), s('S', [[4, 0], [4, 2], [3, 1]]),
      s('Q', [[3, 1], [4, 2], [3, 3], [2, 2]]), s('P', [[4, 2], [6, 2], [5, 3], [3, 3]]),
    ] },
    { name: 'boot', slots: [
      s('L', [[4, 4], [0, 4], [2, 2]]), s('L', [[0, 4], [0, 0], [2, 2]]), s('M', [[4, 4], [4, 2], [6, 4]]),
      s('S', [[0, 0], [2, 0], [1, 1]]), s('S', [[3, 1], [3, 3], [2, 2]]),
      s('Q', [[2, 0], [3, 1], [2, 2], [1, 1]]), s('P', [[4, 2], [4, 4], [3, 3], [3, 1]]),
    ] },
  ],
};

// Quarter turn (clockwise on screen, where y points down).
function turnOnce(points) {
  return points.map(([x, y]) => [-y, x]);
}

export function normalise(points) {
  const mx = Math.min(...points.map(p => p[0]));
  const my = Math.min(...points.map(p => p[1]));
  return points.map(([x, y]) => [x - mx, y - my]);
}

export function piecePoints(kind, turn) {
  let pts = BASE[kind];
  for (let i = 0; i < ((turn % 4) + 4) % 4; i++) pts = turnOnce(pts);
  return normalise(pts);
}

function shapeKey(points) {
  return normalise(points).map(p => p.join(',')).sort().join(' ');
}

export function fitsSlot(kind, turn, slot) {
  return slot.kind === kind && shapeKey(piecePoints(kind, turn)) === shapeKey(slot.points);
}

// The first quarter turn (0-3) that makes a piece match the slot, or -1.
export function turnForSlot(slot) {
  for (let t = 0; t < 4; t++) if (fitsSlot(slot.kind, t, slot)) return t;
  return -1;
}

// Stars for one puzzle: 3 without help, 2 with one hint, 1 with more.
export function starsFor(hints) {
  if (hints <= 0) return 3;
  if (hints === 1) return 2;
  return 1;
}

export function bounds(slots) {
  const pts = slots.flatMap(sl => sl.points);
  const xs = pts.map(p => p[0]);
  const ys = pts.map(p => p[1]);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/*
 * Pieces for a puzzle, one per slot. On easy each piece already faces the
 * way its slot needs; otherwise it starts turned the wrong way (when that is
 * possible for its shape) so the player has to turn it.
 */
export function makePieces(puzzle, preTurned, rand = Math.random) {
  const pieces = puzzle.slots.map((slot, i) => {
    const right = turnForSlot(slot);
    let turn = right;
    if (!preTurned) {
      const wrong = [0, 1, 2, 3].filter(t => !fitsSlot(slot.kind, t, slot));
      if (wrong.length) turn = wrong[Math.floor(rand() * wrong.length)];
    }
    return { id: `p${i}`, kind: slot.kind, turn, color: COLORS[i % COLORS.length] };
  });
  // Shuffle the tray order.
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return pieces;
}
