/*
  Zip puzzle logic (framework-free, unit-tested).

  A puzzle is built backwards from a random Hamiltonian path, so it is always
  solvable: we scramble a snake-shaped path with "backbite" moves, then drop
  numbered waypoints along it (1 at the start, the last number at the end).
  cellIndex = row * size + col.
*/

export function neighbours(idx, size) {
  const r = Math.floor(idx / size);
  const c = idx % size;
  const out = [];
  if (r > 0) out.push(idx - size);
  if (r < size - 1) out.push(idx + size);
  if (c > 0) out.push(idx - 1);
  if (c < size - 1) out.push(idx + 1);
  return out;
}

export function isAdjacent(a, b, size) {
  const dr = Math.abs(Math.floor(a / size) - Math.floor(b / size));
  const dc = Math.abs((a % size) - (b % size));
  return dr + dc === 1;
}

/** Random Hamiltonian path over a size×size grid. */
export function randomHamiltonianPath(size, rand = Math.random) {
  let path = [];
  for (let r = 0; r < size; r++) {
    for (let k = 0; k < size; k++) path.push(r * size + (r % 2 === 0 ? k : size - 1 - k));
  }
  const steps = size * size * 30;
  for (let s = 0; s < steps; s++) {
    if (rand() < 0.5) path.reverse();
    const head = path[path.length - 1];
    const opts = neighbours(head, size).filter(n => n !== path[path.length - 2]);
    const n = opts[Math.floor(rand() * opts.length)];
    const j = path.indexOf(n);
    // Backbite: link head to n, then reverse the tail after n.
    path = path.slice(0, j + 1).concat(path.slice(j + 1).reverse());
  }
  return path;
}

/** Build a puzzle: { size, numbers: {cell: n}, solution, maxWaypoint }. */
export function makePuzzle(size, waypointCount, rand = Math.random) {
  const solution = randomHamiltonianPath(size, rand);
  const total = size * size;
  const k = Math.max(2, Math.min(waypointCount, total));
  const positions = new Set([0, total - 1]);
  const gap = (total - 1) / (k - 1);
  for (let i = 1; i < k - 1; i++) {
    const jitter = gap >= 3 ? Math.round((rand() - 0.5) * (gap - 2)) : 0;
    let p = Math.round(i * gap) + jitter;
    p = Math.min(total - 2, Math.max(1, p));
    while (positions.has(p) && p < total - 2) p++;
    positions.add(p);
  }
  const sorted = [...positions].sort((a, b) => a - b);
  const numbers = {};
  sorted.forEach((p, i) => { numbers[solution[p]] = i + 1; });
  return { size, numbers, solution, maxWaypoint: sorted.length };
}

/** Number that the path must reach next (1-based). */
export function nextWaypoint(path, numbers) {
  let highest = 0;
  for (const idx of path) if (numbers[idx] != null && numbers[idx] > highest) highest = numbers[idx];
  return highest + 1;
}

/**
 * Why extending `path` with `to` is not allowed, or null if it is fine.
 * Reasons: 'visited' | 'notAdjacent' | 'order'.
 */
export function extensionError(path, to, puzzle) {
  const { size, numbers } = puzzle;
  if (path.includes(to)) return 'visited';
  if (!isAdjacent(path[path.length - 1], to, size)) return 'notAdjacent';
  if (numbers[to] != null && numbers[to] !== nextWaypoint(path, numbers)) return 'order';
  return null;
}

export function isSolved(path, puzzle) {
  return path.length === puzzle.size * puzzle.size;
}

/** True when the line has no legal next square and the grid isn't full. */
export function isStuck(path, puzzle) {
  if (isSolved(path, puzzle)) return false;
  const head = path[path.length - 1];
  return !neighbours(head, puzzle.size).some(n => extensionError(path, n, puzzle) === null);
}

/**
 * Try to finish the puzzle from `path` (depth-first, with a node budget).
 * Returns the full solved path, or null if none found within the budget.
 */
export function solveFrom(path, puzzle, budget = 40000) {
  const { size, numbers } = puzzle;
  const total = size * size;
  const visited = new Set(path);
  const cur = [...path];
  let next = nextWaypoint(cur, numbers);
  let nodes = 0;

  const freeDegree = (cell) => neighbours(cell, size).filter(n => !visited.has(n)).length;

  function dfs() {
    if (cur.length === total) return true;
    if (++nodes > budget) return false;
    const head = cur[cur.length - 1];
    const opts = neighbours(head, size).filter(n =>
      !visited.has(n) && (numbers[n] == null || numbers[n] === next));
    opts.sort((a, b) => freeDegree(a) - freeDegree(b));
    for (const n of opts) {
      visited.add(n); cur.push(n);
      const prevNext = next;
      if (numbers[n] != null) next = numbers[n] + 1;
      // Prune: an empty square with no free neighbours (other than the head) is unreachable
      // unless it is the only square left.
      let ok = true;
      if (cur.length < total) {
        for (const m of neighbours(n, size)) {
          if (!visited.has(m) && freeDegree(m) === 0 && cur.length !== total - 1) { ok = false; break; }
        }
      }
      if (ok && dfs()) return true;
      next = prevNext;
      visited.delete(n); cur.pop();
      if (nodes > budget) return false;
    }
    return false;
  }

  return dfs() ? cur : null;
}

/**
 * Work out the hint for the current line.
 * Returns { path, cell, steppedBack } — `path` is the line after the hint
 * (possibly cut back to where it left a working route) plus the next square.
 */
export function hintFor(path, puzzle) {
  const solved = solveFrom(path, puzzle);
  if (solved) return { path: solved.slice(0, path.length + 1), cell: solved[path.length], steppedBack: false };
  const { solution } = puzzle;
  let common = 0;
  while (common < path.length && path[common] === solution[common]) common++;
  const keep = Math.max(1, common);
  return { path: solution.slice(0, keep + 1), cell: solution[keep], steppedBack: true };
}

/** Stars for one puzzle: 3 with no hints, 2 with one or two, 1 with more. */
export function starsFor(hints) {
  if (hints === 0) return 3;
  if (hints <= 2) return 2;
  return 1;
}
