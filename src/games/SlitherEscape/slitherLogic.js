/*
 * Slither Escape — pure puzzle logic (no React).
 *
 * The board is a set of stone path tiles; everything else is wall. Each
 * snake is a chain of adjacent tiles, head first. A move pushes the head
 * into a neighbouring free tile and the body follows, like the classic
 * Snake game, so snakes bend around corners. Each snake has a door just
 * outside the path; when its head moves into its own door the whole snake
 * slithers out. The puzzle is solved when every snake is out.
 */

export const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
export const DIR_NAMES = ['up', 'down', 'left', 'right'];

export const DIFFICULTY_CONFIG = {
  easy: { puzzles: 9 },
  medium: { puzzles: 10 },
  hard: { puzzles: 10 },
};

const key = (r, c) => `${r},${c}`;
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const step = ([r, c], dir) => [r + DIRS[dir][0], c + DIRS[dir][1]];

const tileSets = new WeakMap();
function tileSet(level) {
  let s = tileSets.get(level);
  if (!s) {
    s = new Set(level.tiles.map(([r, c]) => key(r, c)));
    tileSets.set(level, s);
  }
  return s;
}
export const isTile = (level, [r, c]) => tileSet(level).has(key(r, c));

/** Direction the head is facing (from the neck to the head). */
export function facing(cells) {
  if (cells.length < 2) return 'right';
  const [hr, hc] = cells[0];
  const [nr, nc] = cells[1];
  if (hr < nr) return 'up';
  if (hr > nr) return 'down';
  if (hc < nc) return 'left';
  return 'right';
}

/**
 * Try to move snake `si`'s head one tile in `dir`.
 * Returns { ok: true, snakes, escaped } or { ok: false, reason } where
 * reason is 'out' | 'self' | 'wall' | 'snake'.
 */
export function moveSnake(level, snakes, si, dir) {
  const me = snakes[si];
  if (!me || me.out) return { ok: false, reason: 'out' };
  const target = step(me.cells[0], dir);
  if (same(target, me.exit)) {
    // Head reaches its own door: the whole snake slithers out.
    const cells = [target, ...me.cells.slice(0, -1)];
    return { ok: true, escaped: true, snakes: snakes.map((s, i) => (i === si ? { ...s, cells, out: true } : s)) };
  }
  if (me.cells.length > 1 && same(target, me.cells[1])) return { ok: false, reason: 'self' };
  if (!isTile(level, target)) return { ok: false, reason: 'wall' };
  for (let i = 0; i < snakes.length; i++) {
    const s = snakes[i];
    if (s.out) continue;
    // The tail leaves its tile as the head moves, so it may be followed.
    const body = i === si ? s.cells.slice(0, -1) : s.cells;
    if (body.some(c => same(c, target))) return { ok: false, reason: i === si ? 'self' : 'snake' };
  }
  const cells = [target, ...me.cells.slice(0, -1)];
  return { ok: true, escaped: false, snakes: snakes.map((s, i) => (i === si ? { ...s, cells } : s)) };
}

/** Tiles (or the door) the head of snake si can move into right now. */
export function validMoves(level, snakes, si) {
  const out = [];
  if (!snakes[si] || snakes[si].out) return out;
  for (const dir of DIR_NAMES) {
    const res = moveSnake(level, snakes, si, dir);
    if (res.ok) out.push({ dir, to: step(snakes[si].cells[0], dir) });
  }
  return out;
}

export function dirBetween([r1, c1], [r2, c2]) {
  if (r2 === r1 - 1 && c2 === c1) return 'up';
  if (r2 === r1 + 1 && c2 === c1) return 'down';
  if (r2 === r1 && c2 === c1 - 1) return 'left';
  if (r2 === r1 && c2 === c1 + 1) return 'right';
  return null;
}

export const encode = (snakes) => snakes.map(s => (s.out ? 'x' : s.cells.map(([r, c]) => key(r, c)).join('|'))).join(';');

/**
 * Breadth-first search over snake states for a shortest solution.
 * Returns an array of { si, dir } (empty if already solved) or null if
 * unsolvable or the state cap is hit (never assumed solvable).
 * `only` restricts the search to moving a single snake.
 */
export function solve(level, snakes, { cap = 120000, only = null } = {}) {
  if (snakes.every(s => s.out)) return [];
  const startKey = encode(snakes);
  const seen = new Map([[startKey, null]]);
  const queue = [snakes];
  const keys = [startKey];
  let head = 0;
  while (head < queue.length) {
    const state = queue[head];
    const stateKey = keys[head++];
    for (let si = 0; si < state.length; si++) {
      if (state[si].out || (only != null && si !== only)) continue;
      for (const dir of DIR_NAMES) {
        const res = moveSnake(level, state, si, dir);
        if (!res.ok) continue;
        const next = res.snakes;
        const k = encode(next);
        if (seen.has(k)) continue;
        seen.set(k, { prev: stateKey, move: { si, dir } });
        const done = only != null ? next[only].out : next.every(s => s.out);
        if (done) {
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
        keys.push(k);
      }
    }
  }
  return null;
}

/** Next move of a shortest solution: { si, dir, to } or null. */
export function nextHint(level, snakes, cap) {
  // Fast path: still on the stored solution line.
  if (level.solution) {
    let state = level.snakes;
    const cur = encode(snakes);
    for (const mv of level.solution) {
      if (encode(state) === cur) return { ...mv, to: step(state[mv.si].cells[0], mv.dir) };
      state = moveSnake(level, state, mv.si, mv.dir).snakes;
    }
  }
  const path = solve(level, snakes, { cap });
  if (!path || !path.length) return null;
  const mv = path[0];
  return { ...mv, to: step(snakes[mv.si].cells[0], mv.dir) };
}

// ── Generation ──────────────────────────────────────────────────────────

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];
const randInt = (lo, hi, rnd) => lo + Math.floor(rnd() * (hi - lo + 1));

function rectTiles(rows, cols) {
  const t = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) t.push([r, c]);
  return t;
}

function connected(tiles) {
  if (!tiles.length) return false;
  const set = new Set(tiles.map(([r, c]) => key(r, c)));
  const seen = new Set([key(...tiles[0])]);
  const stack = [tiles[0]];
  while (stack.length) {
    const cur = stack.pop();
    for (const d of DIR_NAMES) {
      const n = step(cur, d);
      const k = key(...n);
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push(n); }
    }
  }
  return seen.size === set.size;
}

/** A room, optionally with a few corner notches or a pillar removed. */
function roomTiles(rows, cols, cuts, rnd) {
  let tiles = rectTiles(rows, cols);
  for (let i = 0; i < cuts; i++) {
    const cand = pick(tiles, rnd);
    const rest = tiles.filter(t => !same(t, cand));
    if (connected(rest)) tiles = rest;
  }
  return tiles;
}

/** A self-avoiding corridor walk with a few turns. */
function corridorWalk(len, turns, rnd) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let dir = pick(['right', 'left', 'down'], rnd);
    const cells = [[0, 0]];
    const set = new Set([key(0, 0)]);
    const segs = [];
    let left = len - 1;
    for (let t = 0; t <= turns; t++) {
      const remainingSegs = turns - t + 1;
      segs.push(t === turns ? left : randInt(2, Math.max(2, Math.floor(left / remainingSegs) + 1), rnd));
      left -= segs[t];
    }
    let ok = segs.every(s => s >= 2);
    for (let t = 0; ok && t < segs.length; t++) {
      if (t > 0) {
        const perp = dir === 'left' || dir === 'right' ? ['up', 'down'] : ['left', 'right'];
        dir = pick(perp, rnd);
      }
      for (let k = 0; k < segs[t]; k++) {
        const n = step(cells[cells.length - 1], dir);
        // Keep the corridor one tile wide: no touching earlier tiles.
        const touches = DIR_NAMES.some(d => {
          const m = step(n, d);
          return set.has(key(...m)) && !same(m, cells[cells.length - 1]);
        });
        if (set.has(key(...n)) || touches) { ok = false; break; }
        cells.push(n);
        set.add(key(...n));
      }
    }
    if (ok) return cells;
  }
  return null;
}

/** Shift tiles/snakes/doors so the whole picture starts at 0,0. */
function normalise(tiles, snakes) {
  const all = [...tiles, ...snakes.map(s => s.exit)];
  const r0 = Math.min(...all.map(p => p[0]));
  const c0 = Math.min(...all.map(p => p[1]));
  const mv = ([r, c]) => [r - r0, c - c0];
  const nt = tiles.map(mv);
  const ns = snakes.map(s => ({ ...s, cells: s.cells.map(mv), exit: mv(s.exit) }));
  const all2 = [...nt, ...ns.map(s => s.exit)];
  return {
    tiles: nt,
    snakes: ns,
    rows: Math.max(...all2.map(p => p[0])) + 1,
    cols: Math.max(...all2.map(p => p[1])) + 1,
  };
}

function doorOptions(tiles, used) {
  const set = new Set(tiles.map(([r, c]) => key(r, c)));
  const opts = [];
  for (const t of tiles) {
    for (const d of DIR_NAMES) {
      const door = step(t, d);
      if (set.has(key(...door))) continue;
      if (used.some(u => Math.abs(u[0] - door[0]) + Math.abs(u[1] - door[1]) <= 1)) continue;
      opts.push({ door, dir: d, tile: t });
    }
  }
  return opts;
}

function placeSnakes(tiles, lengths, rnd) {
  const set = new Set(tiles.map(([r, c]) => key(r, c)));
  const taken = new Set();
  const snakes = [];
  for (let i = 0; i < lengths.length; i++) {
    let cells = null;
    for (let t = 0; t < 40 && !cells; t++) {
      const start = pick(tiles, rnd);
      if (taken.has(key(...start))) continue;
      const path = [start];
      const local = new Set([key(...start)]);
      while (path.length < lengths[i]) {
        const opts = DIR_NAMES.map(d => step(path[path.length - 1], d))
          .filter(n => set.has(key(...n)) && !taken.has(key(...n)) && !local.has(key(...n)));
        if (!opts.length) break;
        const n = pick(opts, rnd);
        path.push(n);
        local.add(key(...n));
      }
      if (path.length === lengths[i]) cells = path;
    }
    if (!cells) return null;
    cells.forEach(c => taken.add(key(...c)));
    snakes.push({ id: i, cells, out: false });
  }
  const used = [];
  for (const s of snakes) {
    const opts = doorOptions(tiles, used);
    if (!opts.length) return null;
    const o = pick(opts, rnd);
    used.push(o.door);
    s.exit = o.door;
    s.exitDir = o.dir;
  }
  return snakes;
}

/** True when the door lies behind the head (the snake must turn round). */
export function facesAway(s) {
  const [dr, dc] = DIRS[facing(s.cells)];
  const [hr, hc] = s.cells[0];
  return dr * (s.exit[0] - hr) + dc * (s.exit[1] - hc) < 0;
}

function finish(kind, raw) {
  const lv = { kind, ...normalise(raw.tiles, raw.snakes) };
  return lv;
}

/** Tutorial: one straight snake in a straight corridor, door ahead. */
export function tutorialLevel(rnd = Math.random) {
  const n = randInt(5, 6, rnd);
  const len = randInt(2, 3, rnd);
  const tiles = Array.from({ length: n }, (_, c) => [0, c]);
  const toRight = rnd() < 0.5;
  const cells = toRight
    ? Array.from({ length: len }, (_, k) => [0, len - 1 - k])
    : Array.from({ length: len }, (_, k) => [0, n - len + k]);
  const exit = toRight ? [0, n] : [0, -1];
  const lv = finish('tutorial', { tiles, snakes: [{ id: 0, cells, out: false, exit, exitDir: toRight ? 'right' : 'left' }] });
  lv.solution = solve(lv, lv.snakes);
  return lv;
}

/** One snake at one end of a bent corridor; its door past the other end. */
export function bentCorridorLevel(rnd = Math.random, { turns = 1, len = 3 } = {}) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const walk = corridorWalk(randInt(7, 9, rnd) + turns, turns, rnd);
    if (!walk) continue;
    const cells = walk.slice(0, len).reverse();
    const last = walk[walk.length - 1];
    const dir = dirBetween(walk[walk.length - 2], last);
    const exit = step(last, dir);
    const set = new Set(walk.map(([r, c]) => key(r, c)));
    if (set.has(key(...exit))) continue;
    const lv = finish('corridor', { tiles: walk, snakes: [{ id: 0, cells, out: false, exit, exitDir: dir }] });
    if (lv.rows > 6 || lv.cols > 7) continue;
    lv.solution = solve(lv, lv.snakes);
    if (lv.solution) return lv;
  }
  return tutorialLevel(rnd);
}

const PLANS = {
  easy: [
    { rows: [2, 3], cols: [3, 4], cuts: 0, lengths: [[2, 3], [2, 2]], min: 3, max: 9, away: 0, blocked: 0 },
  ],
  medium: [
    { rows: [3, 3], cols: [4, 5], cuts: 0, lengths: [[3, 2, 2], [2, 2, 2], [3, 3, 2]], min: 7, max: 24, away: 1, blocked: 1 },
    { rows: [3, 3], cols: [5, 5], cuts: 1, lengths: [[3, 2, 2], [3, 3, 2]], min: 7, max: 24, away: 1, blocked: 1 },
    { rows: [3, 3], cols: [4, 4], cuts: 0, lengths: [[3, 3], [3, 2]], min: 7, max: 16, away: 1, blocked: 1 },
  ],
  hard: [
    { rows: [4, 4], cols: [4, 5], cuts: 2, lengths: [[3, 3, 3], [3, 3, 2, 2], [4, 3, 2]], min: 12, max: 30, away: 1, blocked: 2 },
    { rows: [3, 3], cols: [5, 6], cuts: 1, lengths: [[3, 3, 3], [3, 2, 2, 2]], min: 12, max: 30, away: 1, blocked: 2 },
  ],
};

/** A room puzzle checked by BFS against the difficulty's rules. */
export function roomLevel(difficulty, rnd = Math.random) {
  const plans = PLANS[difficulty] ?? PLANS.easy;
  let fallback = null;
  for (let attempt = 0; attempt < 600; attempt++) {
    const p = pick(plans, rnd);
    const rows = randInt(p.rows[0], p.rows[1], rnd);
    const cols = randInt(p.cols[0], p.cols[1], rnd);
    const tiles = roomTiles(rows, cols, p.cuts ? randInt(0, p.cuts, rnd) : 0, rnd);
    const snakes = placeSnakes(tiles, pick(p.lengths, rnd), rnd);
    if (!snakes) continue;
    const lv = finish('room', { tiles, snakes });
    if (lv.rows > 6 || lv.cols > 7) continue;
    if (lv.snakes.filter(facesAway).length < p.away) continue;
    const blocked = lv.snakes.filter((s, i) => !solve(lv, lv.snakes, { only: i, cap: 4000 })).length;
    if (blocked < p.blocked) continue;
    const path = solve(lv, lv.snakes, { cap: 60000 });
    if (!path) continue;
    lv.solution = path;
    if (path.length >= p.min && path.length <= p.max) return lv;
    if (!fallback || path.length > fallback.solution.length) fallback = lv;
  }
  return fallback ?? bentCorridorLevel(rnd);
}

/** Puzzle number i (0-based) of a game at this difficulty. */
export function generatePuzzle(difficulty, i, rnd = Math.random) {
  if (difficulty === 'hard' || difficulty === 'medium') return roomLevel(difficulty, rnd);
  if (i === 0) return tutorialLevel(rnd);
  if (i === 1) return bentCorridorLevel(rnd, { turns: 1, len: 3 });
  if (i === 2) return bentCorridorLevel(rnd, { turns: 2, len: 3 });
  // After the first room, mix longer winding corridors in between rooms.
  if (i === 4) return bentCorridorLevel(rnd, { turns: 3, len: 4 });
  if (i === 6) return bentCorridorLevel(rnd, { turns: 2, len: 4 });
  return roomLevel('easy', rnd);
}

/** The puzzles for one game, in order. */
export function generateSet(difficulty, rnd = Math.random) {
  const cfg = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  return Array.from({ length: cfg.puzzles }, (_, i) => generatePuzzle(difficulty, i, rnd));
}

/** 3 stars with no hints, 2 with one or two, 1 with more. Undo is free. */
export function starsFor({ hints = 0 }) {
  if (hints === 0) return 3;
  if (hints <= 2) return 2;
  return 1;
}
