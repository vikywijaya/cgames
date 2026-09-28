/* Pure puzzle logic for Dot.ed — no React, easy to test.

   A grid holds sources (red, with `capacity` dots) and targets (blue, with
   a `need`). A line runs from a source through touching cells to a target
   and moves min(capacity, need) dots. Lines can pass through any cell except
   a target that is already full. Solved when every capacity and need is 0. */

export const S = (id, capacity) => ({ type: 'source', id, capacity });
export const T = (id, need)     => ({ type: 'target', id, need });
const _ = null;

/* Hand-made puzzles, kept as a fallback pool if generation ever fails.
   Every one is checked solvable in logic.test.js. */
export const HAND_LEVELS = {
  easy: [
    { grid: [[ S('s1',2), T('t1',2) ]] },
    { grid: [
      [ S('s1',1), S('s2',3), _         ],
      [ _,         S('s3',2), T('t1',6) ],
    ]},
    { grid: [
      [ _,         _,         T('t1',1), _         ],
      [ S('s1',1), S('s2',2), S('s3',3), T('t2',5) ],
    ]},
    { grid: [
      [ S('s1',1), S('s2',2), T('t1',5) ],
      [ S('s3',2), _,         _         ],
      [ S('s4',1), _,         _         ],
      [ S('s5',1), _,         _         ],
      [ S('s6',2), S('s7',1), T('t2',5) ],
    ]},
  ],
  medium: [
    { grid: [
      [ S('s1',1), S('s2',3), _         ],
      [ _,         S('s3',2), T('t1',6) ],
    ]},
    { grid: [
      [ _,         S('s1',3), _         ],
      [ S('s2',2), T('t1',8), S('s3',2) ],
      [ _,         S('s4',1), _         ],
    ]},
    { grid: [
      [ T('t1',3), S('s1',2), S('s2',1) ],
      [ S('s3',1), S('s4',1), S('s5',1) ],
      [ S('s6',1), S('s7',1), T('t2',5) ],
    ]},
    { grid: [
      [ S('s1',3), S('s2',2), S('s3',2), T('t1',8) ],
      [ S('s4',1), _,         _,         _         ],
      [ S('s5',2), _,         _,         _         ],
      [ S('s6',2), S('s7',1), S('s8',1), T('t2',6) ],
    ]},
    { grid: [
      [ T('t1',10), S('s1',4), S('s2',3) ],
      [ S('s3',3),  S('s4',1), S('s5',2) ],
      [ S('s6',2),  S('s7',3), T('t2',8) ],
    ]},
  ],
  hard: [
    { grid: [
      [ T('t1',4), S('s1',2), S('s2',1) ],
      [ S('s3',1), S('s4',2), S('s5',1) ],
      [ S('s6',1), S('s7',1), T('t2',5) ],
    ]},
    { grid: [
      [ S('s1',2), T('t1',5), S('s2',3) ],
      [ _,         S('s3',2), _         ],
      [ _,         T('t2',2), _         ],
    ]},
    { grid: [
      [ S('s1',2), S('s2',2), T('t1',5), S('s3',1) ],
      [ _,         _,         S('s4',2), _         ],
      [ _,         T('t2',4), S('s5',1), S('s6',1) ],
    ]},
    { grid: [
      [ S('s1',2), S('s2',3), T('t1',7), _         ],
      [ S('s3',2), _,         _,         _         ],
      [ S('s4',1), _,         _,         _         ],
      [ S('s5',3), _,         _,         _         ],
      [ S('s6',2), S('s7',2), S('s8',1), T('t2',9) ],
    ]},
    { grid: [
      [ T('t1',10), S('s1',4), S('s2',3) ],
      [ S('s3',3),  S('s4',1), S('s5',2) ],
      [ S('s6',2),  S('s7',3), T('t2',8) ],
    ]},
  ],
};

export function cloneGrid(grid) {
  return grid.map(row => row.map(cell => (cell ? { ...cell } : null)));
}

export function findPos(grid, id) {
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]?.id === id) return { r, c };
    }
  }
  return null;
}

export function isSolved(grid) {
  return grid.every(row => row.every(cell =>
    !cell || (cell.type === 'source' ? cell.capacity === 0 : cell.need === 0)));
}

/* Shortest open path (list of {r,c}) from one cell to another, or null. */
export function findPath(grid, fromId, toId) {
  const start = findPos(grid, fromId);
  const goal = findPos(grid, toId);
  if (!start || !goal) return null;
  const key = p => `${p.r},${p.c}`;
  const prev = new Map([[key(start), null]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (cur.r === goal.r && cur.c === goal.c) {
      const path = [];
      for (let p = cur; p; p = prev.get(key(p))) path.unshift(p);
      return path;
    }
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const n = { r: cur.r + dr, c: cur.c + dc };
      const cell = grid[n.r]?.[n.c];
      if (!cell || prev.has(key(n))) continue;
      const isGoal = n.r === goal.r && n.c === goal.c;
      if (cell.type === 'target' && cell.need === 0 && !isGoal) continue;
      prev.set(key(n), cur);
      queue.push(n);
    }
  }
  return null;
}

/* Send each collected source into the target, in order. Returns the moved
   amounts per source, or [] if nothing moved. Mutates `grid`. */
export function transfer(grid, sourceIds, targetId) {
  const tp = findPos(grid, targetId);
  if (!tp) return [];
  const tgt = grid[tp.r][tp.c];
  const moved = [];
  for (const id of sourceIds) {
    const sp = findPos(grid, id);
    const src = sp && grid[sp.r][sp.c];
    if (!src || src.type !== 'source' || src.capacity <= 0 || tgt.need <= 0) continue;
    const amount = Math.min(src.capacity, tgt.need);
    src.capacity -= amount;
    tgt.need -= amount;
    moved.push({ from: id, amount });
  }
  return moved;
}

function cellsOf(grid, type) {
  const out = [];
  for (const row of grid) for (const cell of row) if (cell?.type === type) out.push(cell);
  return out;
}

const stateKey = grid => grid.map(row => row.map(c => (c ? (c.capacity ?? c.need) : '-')).join(',')).join('|');

/* Possible single-source moves from this position. */
function moves(grid) {
  const out = [];
  for (const s of cellsOf(grid, 'source')) {
    if (s.capacity <= 0) continue;
    for (const t of cellsOf(grid, 'target')) {
      if (t.need > 0 && findPath(grid, s.id, t.id)) out.push({ from: s.id, to: t.id });
    }
  }
  return out;
}

export function isSolvable(grid, memo = new Map()) {
  if (isSolved(grid)) return true;
  const k = stateKey(grid);
  if (memo.has(k)) return memo.get(k);
  memo.set(k, false);
  let ok = false;
  for (const m of moves(grid)) {
    const next = cloneGrid(grid);
    transfer(next, [m.from], m.to);
    if (isSolvable(next, memo)) { ok = true; break; }
  }
  memo.set(k, ok);
  return ok;
}

/* A move that keeps the puzzle solvable, or null if the board is stuck. */
export function findHint(grid) {
  const memo = new Map();
  for (const m of moves(grid)) {
    const next = cloneGrid(grid);
    transfer(next, [m.from], m.to);
    if (isSolvable(next, memo)) return m;
  }
  return null;
}

/* Stars for one puzzle: 3 = no help, 2 = a little, 1 = lots. */
export function starsFor(helps) {
  if (helps <= 0) return 3;
  if (helps <= 2) return 2;
  return 1;
}

/* ── Random level generation ─────────────────────────────────────────
   Puzzles are built on a small rectangular grid (with the occasional
   notch, like the hand-made ones) so every cell is reachable from every
   other cell — that keeps the "every dollar of capacity can reach every
   need" invariant true, which is what actually makes these solvable. */

const GEN_PARAMS = {
  easy:   { cells: [2, 4],  targets: [1, 1], cap: [1, 3], rows: [1, 2] },
  medium: { cells: [4, 7],  targets: [1, 2], cap: [1, 4], rows: [2, 3] },
  hard:   { cells: [7, 10], targets: [1, 2], cap: [1, 5], rows: [2, 4] },
};

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* True if every non-null cell can be reached from every other one. */
function isConnected(grid) {
  let start = null;
  let count = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c]) { count++; if (!start) start = { r, c }; }
    }
  }
  if (!start) return false;
  const seen = new Set([`${start.r},${start.c}`]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { r: cur.r + dr, c: cur.c + dc };
      const key = `${n.r},${n.c}`;
      if (grid[n.r]?.[n.c] && !seen.has(key)) { seen.add(key); queue.push(n); }
    }
  }
  return count === seen.size;
}

/* Build one random grid for a difficulty, or null if this attempt didn't
   come out shaped right (caller retries). */
function buildRandomGrid(difficulty) {
  const p = GEN_PARAMS[difficulty] ?? GEN_PARAMS.easy;
  const cellCount = randInt(p.cells[0], p.cells[1]);
  const targetCount = Math.min(randInt(p.targets[0], p.targets[1]), Math.max(1, cellCount - 1));
  const sourceCount = cellCount - targetCount;
  if (sourceCount < 1) return null;

  const rows = randInt(p.rows[0], Math.min(p.rows[1], cellCount));
  const cols = Math.ceil(cellCount / rows);

  // Lay cells out row-major, leaving a short last row (a "notch") when the
  // rectangle doesn't divide evenly — matches the hand-made shapes.
  const grid = [];
  let placed = 0;
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(placed < cellCount ? {} : null);
      if (placed < cellCount) placed++;
    }
    grid.push(row);
  }
  if (!isConnected(grid)) return null;

  // Assign source capacities first.
  const sourceCaps = Array.from({ length: sourceCount }, () => randInt(p.cap[0], p.cap[1]));
  const total = sourceCaps.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  // Split that total across the targets, each getting at least 1.
  const needs = Array(targetCount).fill(0);
  if (targetCount === 1) {
    needs[0] = total;
  } else {
    let remaining = total - targetCount; // reserve 1 each up front
    if (remaining < 0) return null;
    for (let i = 0; i < targetCount; i++) needs[i] = 1;
    while (remaining > 0) {
      needs[randInt(0, targetCount - 1)]++;
      remaining--;
    }
  }

  // Drop capacities/needs onto the shuffled cell positions.
  const positions = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) if (grid[r][c]) positions.push({ r, c });
  }
  const order = shuffle(positions);
  let sIdx = 0, tIdx = 0;
  const kinds = shuffle([
    ...Array(sourceCount).fill('source'),
    ...Array(targetCount).fill('target'),
  ]);
  order.forEach((pos, i) => {
    const kind = kinds[i];
    if (kind === 'source') {
      grid[pos.r][pos.c] = S(`s${sIdx + 1}`, sourceCaps[sIdx]);
      sIdx++;
    } else {
      grid[pos.r][pos.c] = T(`t${tIdx + 1}`, needs[tIdx]);
      tIdx++;
    }
  });

  return grid;
}

/* Build one solvable, non-trivial puzzle for a difficulty, or null if
   generation didn't succeed within the attempt budget (caller falls back
   to a hand-made level). Keeps each attempt to plain array work, so this
   comfortably runs well under 50ms per puzzle. */
export function generateLevel(difficulty, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    const grid = buildRandomGrid(difficulty);
    if (!grid) continue;
    if (isSolved(grid)) continue; // every need was already 0 — not a puzzle
    if (!isSolvable(grid)) continue;
    return { grid };
  }
  return null;
}

/* A fresh set of `count` puzzles for a difficulty: generated where
   possible, falling back to a (cloned) hand-made level otherwise, so a
   round never repeats the exact same puzzles twice in a row. */
export function buildLevelPool(difficulty, count) {
  const fallback = HAND_LEVELS[difficulty] ?? HAND_LEVELS.easy;
  const fallbackOrder = shuffle(fallback);
  const pool = [];
  for (let i = 0; i < count; i++) {
    const generated = generateLevel(difficulty);
    if (generated) {
      pool.push(generated);
    } else {
      const pick = fallbackOrder[i % fallbackOrder.length];
      pool.push({ grid: cloneGrid(pick.grid) });
    }
  }
  return pool;
}

export const LEVEL_COUNTS = { easy: 4, medium: 5, hard: 5 };
