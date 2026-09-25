/*
 * Pure puzzle logic for Ring Sort (no React).
 *
 * A board is an array of rods; each rod is an array of colour indices,
 * bottom ring first. Any top ring may move onto any rod that has space.
 * The puzzle is solved when every rod is empty or holds all the rings of a
 * single colour.
 *
 * Puzzles are made by scrambling a solved board with random legal moves.
 * Every move can be reversed, so a scrambled board is always solvable.
 */

export function isRodDone(rod, ringsPerColor) {
  return rod.length === ringsPerColor && rod.every(c => c === rod[0]);
}

export function isSolved(rods, ringsPerColor) {
  return rods.every(rod => rod.length === 0 || isRodDone(rod, ringsPerColor));
}

export function canMove(rods, from, to, capacity) {
  return from !== to && rods[from]?.length > 0 && rods[to]?.length < capacity;
}

export function applyMove(rods, from, to) {
  const next = rods.map(r => [...r]);
  next[to].push(next[from].pop());
  return next;
}

function randInt(n, rnd) {
  return Math.floor(rnd() * n);
}

/** Make a scrambled, solvable board with no rod already finished. */
export function generatePuzzle({ numColors, ringsPerColor, rodCapacity, extraRods }, rnd = Math.random) {
  const totalRods = numColors + extraRods;
  for (let attempt = 0; attempt < 200; attempt++) {
    let rods = Array.from({ length: totalRods }, (_, i) =>
      i < numColors ? Array(ringsPerColor).fill(i) : []);
    const steps = 40 + numColors * ringsPerColor * 6;
    let last = null;
    for (let s = 0; s < steps; s++) {
      const froms = [];
      for (let i = 0; i < totalRods; i++) if (rods[i].length) froms.push(i);
      const from = froms[randInt(froms.length, rnd)];
      const tos = [];
      for (let j = 0; j < totalRods; j++) {
        if (canMove(rods, from, j, rodCapacity) && !(last && last[0] === j && last[1] === from)) tos.push(j);
      }
      if (!tos.length) continue;
      const to = tos[randInt(tos.length, rnd)];
      rods = applyMove(rods, from, to);
      last = [from, to];
    }
    const anyDone = rods.some(r => isRodDone(r, ringsPerColor));
    // Every colour should be split up at least a little.
    const mixedRods = rods.filter(r => r.length && !r.every(c => c === r[0])).length;
    if (!anyDone && mixedRods >= Math.min(2, numColors)) return rods;
  }
  // Fallback that is always valid: deal colours in a rotating pattern.
  const rods = Array.from({ length: totalRods }, () => []);
  let k = 0;
  for (let size = 0; size < ringsPerColor; size++) {
    for (let r = 0; r < numColors; r++) rods[r].push((r + size + k) % numColors);
    k++;
  }
  return rods;
}

/*
 * Heuristic: rings sitting above the pure bottom run of their rod must move
 * at least once, and a colour whose run is split across rods needs its
 * smaller runs moved too.
 */
function estimate(rods) {
  let h = 0;
  const bestRun = {};
  for (const rod of rods) {
    if (!rod.length) continue;
    let run = 1;
    while (run < rod.length && rod[run] === rod[0]) run++;
    h += rod.length - run;
    const c = rod[0];
    if (bestRun[c] === undefined) bestRun[c] = [];
    bestRun[c].push(run);
  }
  for (const c of Object.keys(bestRun)) {
    const runs = bestRun[c].sort((a, b) => b - a);
    for (let i = 1; i < runs.length; i++) h += runs[i];
  }
  return h;
}

const keyOf = rods => rods.map(r => r.join('')).join('|');

/**
 * Find a sequence of moves that solves the board (weighted best-first
 * search). Returns an array of [from, to] or null if nothing was found
 * within the node budget.
 */
export function solve(rods, { ringsPerColor, rodCapacity }, budget = 40000) {
  if (isSolved(rods, ringsPerColor)) return [];
  const start = { rods, g: 0, parent: null, move: null };
  const seen = new Set([keyOf(rods)]);
  // Simple binary heap keyed on f = g + 2h.
  const heap = [];
  const push = (node) => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const end = heap.pop();
    if (heap.length) {
      heap[0] = end;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].f < heap[m].f) m = l;
        if (r < heap.length && heap[r].f < heap[m].f) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  start.f = 2 * estimate(rods);
  push(start);
  let expanded = 0;
  while (heap.length && expanded < budget) {
    const node = pop();
    expanded++;
    const n = node.rods.length;
    for (let from = 0; from < n; from++) {
      // Never break up a finished rod.
      if (isRodDone(node.rods[from], ringsPerColor)) continue;
      for (let to = 0; to < n; to++) {
        if (!canMove(node.rods, from, to, rodCapacity)) continue;
        const next = applyMove(node.rods, from, to);
        const k = keyOf(next);
        if (seen.has(k)) continue;
        seen.add(k);
        const child = { rods: next, g: node.g + 1, parent: node, move: [from, to] };
        if (isSolved(next, ringsPerColor)) {
          const path = [];
          for (let c = child; c.move; c = c.parent) path.push(c.move);
          return path.reverse();
        }
        child.f = child.g + 2 * estimate(next);
        push(child);
      }
    }
  }
  return null;
}

/** The next move to suggest, or null if the board is solved. */
export function hintMove(rods, config) {
  const path = solve(rods, config);
  if (path && path.length) return path[0];
  if (path) return null;
  // Search gave up (very unlikely): suggest any sensible move.
  const { ringsPerColor, rodCapacity } = config;
  for (let from = 0; from < rods.length; from++) {
    if (!rods[from].length || isRodDone(rods[from], ringsPerColor)) continue;
    for (let to = 0; to < rods.length; to++) {
      if (canMove(rods, from, to, rodCapacity) && rods[to].length && rods[to][rods[to].length - 1] === rods[from][rods[from].length - 1]) return [from, to];
    }
  }
  for (let from = 0; from < rods.length; from++) {
    for (let to = 0; to < rods.length; to++) if (canMove(rods, from, to, rodCapacity)) return [from, to];
  }
  return null;
}

/** 3 stars with no help, 2 with a little, 1 with lots. */
export function starsFor(helpUsed) {
  if (helpUsed <= 0) return 3;
  if (helpUsed <= 2) return 2;
  return 1;
}
