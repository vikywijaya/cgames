/*
 * Slither Escape — pure puzzle logic (no React).
 *
 * A snake is a straight bar of 2–3 cells. Tapping an arrow slides the whole
 * snake that way, one cell at a time, until it hits the wall or another
 * snake. If at any step the snake covers its own numbered exit, it stops
 * there and leaves the board. The puzzle is solved when every snake is out.
 */

export const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
export const DIR_NAMES = ['up', 'down', 'left', 'right'];

// Fewer, better puzzles. minMoves/maxMoves bound the shortest solution.
export const DIFFICULTY_CONFIG = {
  easy:   { puzzles: 4, rows: 5, cols: 5, snakes: 2, lengths: [2, 2, 3], minMoves: 2, maxMoves: 3 },
  medium: { puzzles: 5, rows: 6, cols: 6, snakes: 3, lengths: [2, 3],    minMoves: 4, maxMoves: 6 },
  hard:   { puzzles: 5, rows: 6, cols: 7, snakes: 4, lengths: [2, 3, 3], minMoves: 6, maxMoves: 10 },
};

const key = (r, c) => `${r},${c}`;

export function covers(snake, [er, ec]) {
  return snake.cells.some(([r, c]) => r === er && c === ec);
}

/**
 * Slide snake `si` in `dir`. Returns { cells, escaped } or null when it
 * cannot move even one cell.
 */
export function slide(snakes, si, dir, rows, cols) {
  const me = snakes[si];
  if (!me || me.out) return null;
  const walls = new Set();
  snakes.forEach((s, i) => {
    if (i !== si && !s.out) s.cells.forEach(([r, c]) => walls.add(key(r, c)));
  });
  const [dr, dc] = DIRS[dir];
  let cur = me.cells;
  let moved = false;
  for (;;) {
    const next = cur.map(([r, c]) => [r + dr, c + dc]);
    const blocked = next.some(([r, c]) => r < 0 || r >= rows || c < 0 || c >= cols || walls.has(key(r, c)));
    if (blocked) break;
    cur = next;
    moved = true;
    if (covers({ cells: cur }, me.exitCell)) return { cells: cur, escaped: true };
  }
  return moved ? { cells: cur, escaped: false } : null;
}

export function applyMove(snakes, si, dir, rows, cols) {
  const res = slide(snakes, si, dir, rows, cols);
  if (!res) return null;
  return snakes.map((s, i) => (i === si ? { ...s, cells: res.cells, out: res.escaped } : s));
}

const encode = (snakes) => snakes.map(s => (s.out ? 'x' : s.cells.map(([r, c]) => key(r, c)).join('|'))).join(';');

/**
 * Breadth-first search for the shortest solution. Returns an array of
 * { si, dir } moves (empty when already solved) or null if unsolvable
 * (or the search cap is hit — treated as unsolvable, never assumed solvable).
 */
export function solve(snakes, rows, cols, cap = 40000) {
  if (snakes.every(s => s.out)) return [];
  const start = encode(snakes);
  const seen = new Map([[start, null]]);
  const queue = [snakes];
  let head = 0;
  while (head < queue.length) {
    const state = queue[head++];
    const stateKey = encode(state);
    for (let si = 0; si < state.length; si++) {
      if (state[si].out) continue;
      for (const dir of DIR_NAMES) {
        const next = applyMove(state, si, dir, rows, cols);
        if (!next) continue;
        const k = encode(next);
        if (seen.has(k)) continue;
        seen.set(k, { prev: stateKey, move: { si, dir } });
        if (next.every(s => s.out)) {
          const path = [];
          let cur = k;
          while (seen.get(cur)) {
            const { prev, move } = seen.get(cur);
            path.unshift(move);
            cur = prev;
          }
          return path;
        }
        if (seen.size > cap) return null;
        queue.push(next);
      }
    }
  }
  return null;
}

/** Outward direction of a (non-corner) border cell. */
export function exitDirOf([r, c], rows, cols) {
  if (r === 0) return 'up';
  if (r === rows - 1) return 'down';
  if (c === 0) return 'left';
  return 'right';
}

function tryBuild(cfg, rnd) {
  const { rows, cols } = cfg;
  const taken = new Set();
  const snakes = [];
  for (let i = 0; i < cfg.snakes; i++) {
    let placed = false;
    for (let t = 0; t < 60 && !placed; t++) {
      const len = cfg.lengths[Math.floor(rnd() * cfg.lengths.length)];
      const horiz = rnd() < 0.5;
      const r0 = Math.floor(rnd() * (horiz ? rows : rows - len + 1));
      const c0 = Math.floor(rnd() * (horiz ? cols - len + 1 : cols));
      const cells = Array.from({ length: len }, (_, k) => (horiz ? [r0, c0 + k] : [r0 + k, c0]));
      if (cells.some(([r, c]) => taken.has(key(r, c)))) continue;
      if (rnd() < 0.5) cells.reverse(); // which end wears the face
      cells.forEach(([r, c]) => taken.add(key(r, c)));
      snakes.push({ id: i, cells, out: false });
      placed = true;
    }
    if (!placed) return null;
  }
  // Exits on non-corner border cells, never next to each other.
  const border = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const edge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      const corner = (r === 0 || r === rows - 1) && (c === 0 || c === cols - 1);
      if (edge && !corner) border.push([r, c]);
    }
  }
  const used = [];
  for (const s of snakes) {
    const options = border.filter(([r, c]) =>
      !covers(s, [r, c]) && used.every(([ur, uc]) => Math.abs(ur - r) + Math.abs(uc - c) > 1));
    if (!options.length) return null;
    const e = options[Math.floor(rnd() * options.length)];
    used.push(e);
    s.exitCell = e;
    s.exitDir = exitDirOf(e, rows, cols);
  }
  return snakes;
}

/**
 * Build a puzzle whose shortest solution length falls inside the
 * difficulty's range. Every returned puzzle is proven solvable by BFS.
 */
export function generateLevel(difficulty, rnd = Math.random) {
  const cfg = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { rows, cols } = cfg;
  let best = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const snakes = tryBuild(cfg, rnd);
    if (!snakes) continue;
    const path = solve(snakes, rows, cols);
    if (!path || path.length < 2) continue;
    const L = path.length;
    if (L >= cfg.minMoves && L <= cfg.maxMoves) return { rows, cols, snakes, par: L };
    const dist = L < cfg.minMoves ? cfg.minMoves - L : L - cfg.maxMoves;
    if (!best || dist < best.dist) best = { dist, level: { rows, cols, snakes, par: L } };
  }
  if (best) return best.level;
  // Last resort (practically unreachable): one snake, two slides away.
  return {
    rows, cols, par: 2,
    snakes: [{ id: 0, cells: [[2, 1], [2, 2]], out: false, exitCell: [0, 2], exitDir: 'up' }],
  };
}

/** 3 stars with no help, 2 with a little, 1 with a lot. */
export function starsFor({ hints = 0 }) {
  const help = hints; // undo and start again are free
  if (help === 0) return 3;
  if (help <= 2) return 2;
  return 1;
}
