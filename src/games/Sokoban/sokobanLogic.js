/**
 * Sokoban rules + a small solver used for hints and for checking that every
 * puzzle we ship can be solved. Pure functions, no React.
 *
 * Level strings: '#' wall, ' ' floor, '$' box, '.' goal, '*' box on goal,
 * '@' player, '+' player on goal. Anything outside the walls is also ' ',
 * but it is never reachable so it does not matter.
 */

export const DIRS = {
  up:    [-1, 0],
  down:  [1, 0],
  left:  [0, -1],
  right: [0, 1],
};
export const DIR_NAMES = Object.keys(DIRS);

export function parseLevel(lines) {
  const height = lines.length;
  const width = Math.max(...lines.map(l => l.length));
  const walls = new Set();
  const goals = new Set();
  const boxes = [];
  let player = 0;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const ch = lines[r][c] ?? ' ';
      const i = r * width + c;
      if (ch === '#') walls.add(i);
      if (ch === '.' || ch === '*' || ch === '+') goals.add(i);
      if (ch === '$' || ch === '*') boxes.push(i);
      if (ch === '@' || ch === '+') player = i;
    }
  }
  // Cells the player can ever stand on (flood fill from start, ignoring boxes).
  const inside = new Set();
  const stack = [player];
  while (stack.length) {
    const i = stack.pop();
    if (inside.has(i) || walls.has(i)) continue;
    const r = Math.floor(i / width);
    const c = i % width;
    if (r < 0 || r >= height || c < 0 || c >= width) continue;
    inside.add(i);
    if (r > 0) stack.push(i - width);
    if (r < height - 1) stack.push(i + width);
    if (c > 0) stack.push(i - 1);
    if (c < width - 1) stack.push(i + 1);
  }
  return { width, height, walls, goals, inside, boxes: boxes.sort((a, b) => a - b), player };
}

function step(level, i, dir) {
  const [dr, dc] = DIRS[dir];
  const r = Math.floor(i / level.width) + dr;
  const c = (i % level.width) + dc;
  if (r < 0 || r >= level.height || c < 0 || c >= level.width) return -1;
  return r * level.width + c;
}

function open(level, i) {
  return i >= 0 && level.inside.has(i);
}

/**
 * Try to move the player one step. Returns
 *   { player, boxes, pushed } on success, or
 *   { blocked: 'wall' | 'box' } when the move is not allowed.
 */
export function tryMove(level, state, dir) {
  const next = step(level, state.player, dir);
  if (!open(level, next)) return { blocked: 'wall' };
  const bi = state.boxes.indexOf(next);
  if (bi === -1) return { player: next, boxes: state.boxes, pushed: false };
  const beyond = step(level, next, dir);
  if (!open(level, beyond) || state.boxes.includes(beyond)) return { blocked: 'box' };
  const boxes = state.boxes.slice();
  boxes[bi] = beyond;
  boxes.sort((a, b) => a - b);
  return { player: next, boxes, pushed: true, from: next, to: beyond };
}

export function isSolved(level, boxes) {
  return boxes.every(b => level.goals.has(b));
}

/** Shortest walking path (list of directions) avoiding boxes, or null. */
export function walkPath(level, boxes, from, to) {
  if (from === to) return [];
  const blocked = new Set(boxes);
  if (!open(level, to) || blocked.has(to)) return null;
  const prev = new Map([[from, null]]);
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q];
    for (const d of DIR_NAMES) {
      const n = step(level, cur, d);
      if (!open(level, n) || blocked.has(n) || prev.has(n)) continue;
      prev.set(n, [cur, d]);
      if (n === to) {
        const path = [];
        let k = n;
        while (prev.get(k)) { const [p, dd] = prev.get(k); path.unshift(dd); k = p; }
        return path;
      }
      queue.push(n);
    }
  }
  return null;
}

/** Cells from which a box could still be pushed onto some goal (reverse pulls). */
function liveCells(level) {
  if (level._live) return level._live;
  const live = new Set();
  const queue = [...level.goals];
  queue.forEach(g => live.add(g));
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q];
    for (const d of DIR_NAMES) {
      // Box at `prev` pushed in dir d lands on `cur`; player stands behind `prev`.
      const [dr, dc] = DIRS[d];
      const back = DIR_NAMES.find(x => DIRS[x][0] === -dr && DIRS[x][1] === -dc);
      const prevCell = step(level, cur, back);
      const playerCell = step(level, prevCell, back);
      if (!open(level, prevCell) || !open(level, playerCell) || live.has(prevCell)) continue;
      live.add(prevCell);
      queue.push(prevCell);
    }
  }
  level._live = live;
  return live;
}

function reachable(level, boxes, from) {
  const blocked = new Set(boxes);
  const seen = new Set([from]);
  const queue = [from];
  let min = from;
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q];
    if (cur < min) min = cur;
    for (const d of DIR_NAMES) {
      const n = step(level, cur, d);
      if (!open(level, n) || blocked.has(n) || seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return { seen, min };
}

/**
 * Breadth-first search over pushes. Returns the shortest list of pushes
 * [{ box, dir }] that solves the puzzle from `state`, [] if already solved,
 * or null if it can no longer be solved (or the search gives up).
 */
export function solve(level, state, maxNodes = 300000) {
  if (isSolved(level, state.boxes)) return [];
  const live = liveCells(level);
  if (state.boxes.some(b => !live.has(b))) return null;
  const startReach = reachable(level, state.boxes, state.player);
  const key = (boxes, min) => `${boxes.join(',')}|${min}`;
  const seen = new Set([key(state.boxes, startReach.min)]);
  const nodes = [{ boxes: state.boxes, reach: startReach, parent: -1, push: null }];
  for (let q = 0; q < nodes.length; q++) {
    if (nodes.length > maxNodes) return null;
    const { boxes, reach } = nodes[q];
    for (let bi = 0; bi < boxes.length; bi++) {
      const box = boxes[bi];
      for (const d of DIR_NAMES) {
        const [dr, dc] = DIRS[d];
        const behindDir = DIR_NAMES.find(x => DIRS[x][0] === -dr && DIRS[x][1] === -dc);
        const behind = step(level, box, behindDir);
        if (!reach.seen.has(behind)) continue;
        const to = step(level, box, d);
        if (!open(level, to) || !live.has(to) || boxes.includes(to)) continue;
        const nb = boxes.slice();
        nb[bi] = to;
        nb.sort((a, b) => a - b);
        const nr = reachable(level, nb, box);
        const k = key(nb, nr.min);
        if (seen.has(k)) continue;
        seen.add(k);
        nodes.push({ boxes: nb, reach: nr, parent: q, push: { box, dir: d } });
        if (isSolved(level, nb)) {
          const pushes = [];
          for (let n = nodes.length - 1; n > 0; n = nodes[n].parent) pushes.unshift(nodes[n].push);
          return pushes;
        }
      }
    }
  }
  return null;
}

/**
 * The very next step toward a solution: { dir, box, pushDir } where `dir` is
 * the single move to make now and `box`/`pushDir` describe the push it leads
 * to. Returns null when the puzzle cannot be finished from here.
 */
export function nextHint(level, state) {
  const pushes = solve(level, state);
  if (!pushes || pushes.length === 0) return null;
  const { box, dir } = pushes[0];
  const [dr, dc] = DIRS[dir];
  const behind = step(level, box, DIR_NAMES.find(x => DIRS[x][0] === -dr && DIRS[x][1] === -dc));
  const path = walkPath(level, state.boxes, state.player, behind);
  if (!path) return null;
  return { dir: path.length ? path[0] : dir, box, pushDir: dir, walking: path.length > 0 };
}

/** Stars for one puzzle: 3 = no help, 2 = a little, 1 = lots. */
export function starsFor({ hints = 0 }) {
  const help = hints; // undo and start over are free
  if (help === 0) return 3;
  if (help <= 2) return 2;
  return 1;
}
