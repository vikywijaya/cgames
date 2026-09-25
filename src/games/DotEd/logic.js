/* Pure puzzle logic for Dot.ed — no React, easy to test.

   A grid holds sources (red, with `capacity` dots) and targets (blue, with
   a `need`). A line runs from a source through touching cells to a target
   and moves min(capacity, need) dots. Lines can pass through any cell except
   a target that is already full. Solved when every capacity and need is 0. */

export const S = (id, capacity) => ({ type: 'source', id, capacity });
export const T = (id, need)     => ({ type: 'target', id, need });
const _ = null;

/* Fewer, better puzzles. Every one is checked solvable in logic.test.js. */
export const LEVELS = {
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
