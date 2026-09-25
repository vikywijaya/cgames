// Pure board logic for Lumeno (no React) so it can be unit-tested.

export const MIN_CHAIN = 3;

export const COLORS = [
  { id: 'red',    bg: '#c62828', fg: '#ffffff', symbol: '♥' },
  { id: 'blue',   bg: '#1e56c7', fg: '#ffffff', symbol: '●' },
  { id: 'yellow', bg: '#fbc02d', fg: '#1f1f1f', symbol: '★' },
  { id: 'green',  bg: '#1b7a3a', fg: '#ffffff', symbol: '▲' },
  { id: 'purple', bg: '#7b2cbf', fg: '#ffffff', symbol: '■' },
];

export const COLOR_MAP = Object.fromEntries(COLORS.map(c => [c.id, c]));

export function rndColor(n, rand = Math.random) {
  return COLORS[Math.floor(rand() * n)].id;
}

export function isAdj(a, b) {
  return Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1
    && !(a.row === b.row && a.col === b.col);
}

export function buildGrid(size, n, rand = Math.random) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => rndColor(n, rand)));
}

/** Longest same-colour chain (bounded search), preferring `preferred` colours. */
export function findBestChain(grid, preferred = [], budget = 6000) {
  const size = grid.length;
  let best = null;
  let bestScore = -1;
  let steps = 0;
  const seen = Array.from({ length: size }, () => Array(size).fill(false));

  function scoreOf(path) {
    const color = grid[path[0].row][path[0].col];
    return path.length + (preferred.includes(color) ? 100 : 0);
  }

  function dfs(path) {
    steps++;
    if (path.length >= MIN_CHAIN) {
      const s = scoreOf(path);
      if (s > bestScore) { bestScore = s; best = [...path]; }
    }
    if (steps > budget || path.length >= 8) return;
    const head = path[path.length - 1];
    const color = grid[head.row][head.col];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = head.row + dr, c = head.col + dc;
        if ((dr || dc) && r >= 0 && c >= 0 && r < size && c < size
            && !seen[r][c] && grid[r][c] === color) {
          seen[r][c] = true;
          path.push({ row: r, col: c });
          dfs(path);
          path.pop();
          seen[r][c] = false;
        }
      }
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      seen[r][c] = true;
      dfs([{ row: r, col: c }]);
      seen[r][c] = false;
    }
  }
  return best;
}

export function hasMove(grid) {
  return findBestChain(grid, [], 400) !== null;
}

/** A fresh board that always has at least one valid chain. */
export function buildPlayableGrid(size, n, rand = Math.random) {
  for (let i = 0; i < 200; i++) {
    const g = buildGrid(size, n, rand);
    if (hasMove(g)) return g;
  }
  // Fallback: force a straight line of three in the top row.
  const g = buildGrid(size, n, rand);
  g[0][0] = g[0][1] = g[0][2] = COLORS[0].id;
  return g;
}

export function dropAndFill(grid, cleared, n, rand = Math.random) {
  const size = grid.length;
  const next = grid.map(row => [...row]);
  cleared.forEach(({ row, col }) => { next[row][col] = null; });
  for (let c = 0; c < size; c++) {
    const stack = [];
    for (let r = size - 1; r >= 0; r--) if (next[r][c] !== null) stack.push(next[r][c]);
    while (stack.length < size) stack.push(rndColor(n, rand));
    for (let r = size - 1; r >= 0; r--) next[r][c] = stack[size - 1 - r];
  }
  return next;
}

/** Stars for one puzzle: 3 = no help, 2 = one hint, 1 = more. */
export function starsFor(hintsUsed) {
  if (hintsUsed <= 0) return 3;
  if (hintsUsed === 1) return 2;
  return 1;
}
