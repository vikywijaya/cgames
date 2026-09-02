'use strict';

/**
 * TV Pipe Puzzle engine — server-authoritative multiplayer, 3 rounds.
 *
 * Faithful port of PipePuzzle.jsx from cgames:
 *  - Same grid, same puzzle generator, same connectivity logic.
 *  - Each player gets the SAME scrambled puzzle to solve independently.
 *  - First player to connect all color pairs wins the round (3pts).
 *  - 3 rounds per session. Points: 1st=3, 2nd=2, 3rd=1.
 */

const TOTAL_ROUNDS = 3;
const ROUND_POINTS = [3, 2, 1];

// Directions: N=0, E=1, S=2, W=3
const DR = [-1, 0, 1, 0];
const DC = [0, 1, 0, -1];

const SHAPE_OPENINGS = {
  end:      [0],
  straight: [0, 2],
  corner:   [0, 1],
  tee:      [0, 1, 2],
  cross:    [0, 1, 2, 3],
};

const PIPE_COLORS = ['yellow', 'salmon', 'blue', 'green'];

const DIFFICULTY_CONFIG = {
  easy:   { rows: 4, cols: 4, numColors: 2 },
  medium: { rows: 5, cols: 5, numColors: 3 },
  hard:   { rows: 6, cols: 6, numColors: 4 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getOpenings(shape, rotation) {
  return (SHAPE_OPENINGS[shape] || []).map(d => (d + rotation) % 4);
}

function dirTo(r1, c1, r2, c2) {
  if (r2 - r1 === -1 && c2 - c1 === 0) return 0; // N
  if (r2 - r1 === 0  && c2 - c1 === 1) return 1; // E
  if (r2 - r1 === 1  && c2 - c1 === 0) return 2; // S
  if (r2 - r1 === 0  && c2 - c1 === -1) return 3; // W
  return -1;
}

function getShape(openDirs) {
  const n = openDirs.length;
  if (n === 1) return 'end';
  if (n === 4) return 'cross';
  if (n === 3) return 'tee';
  if (n === 2) {
    const [a, b] = [...openDirs].sort((x, y) => x - y);
    if ((a === 0 && b === 2) || (a === 1 && b === 3)) return 'straight';
    return 'corner';
  }
  return 'end';
}

function getSolvedRotation(shape, openDirs) {
  const base = SHAPE_OPENINGS[shape] || [];
  const target = [...openDirs].sort((a, b) => a - b);
  for (let rot = 0; rot < 4; rot++) {
    const rotated = base.map(d => (d + rot) % 4).sort((a, b) => a - b);
    if (rotated.length === target.length && rotated.every((v, i) => v === target[i])) return rot;
  }
  return 0;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── DFS random path (exact port from PipePuzzle.jsx) ─────────────────────────

function randomPath(sr, sc, er, ec, rows, cols, occupied) {
  const path = [[sr, sc]];
  const inPath = new Set([`${sr},${sc}`]);

  function dfs(r, c) {
    if (r === er && c === ec) return true;
    for (const d of shuffle([0, 1, 2, 3])) {
      const nr = r + DR[d];
      const nc = c + DC[d];
      const k = `${nr},${nc}`;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (inPath.has(k) || occupied.has(k)) continue;
      path.push([nr, nc]);
      inPath.add(k);
      if (dfs(nr, nc)) return true;
      path.pop();
      inPath.delete(k);
    }
    return false;
  }

  return dfs(sr, sc) ? path : null;
}

// ── Puzzle generation (exact port from PipePuzzle.jsx) ────────────────────────

function tryGeneratePuzzle(rows, cols, numColors) {
  const occupied = new Set();
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  const colorPairs = [];

  for (let ci = 0; ci < numColors; ci++) {
    const colorId = PIPE_COLORS[ci];
    let placed = false;

    for (let attempt = 0; attempt < 50 && !placed; attempt++) {
      const free = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (!occupied.has(`${r},${c}`)) free.push([r, c]);

      if (free.length < 2) break;

      const sfree = shuffle(free);
      const [sr, sc] = sfree[0];

      // Prefer far endpoints
      const minDist = Math.max(2, Math.floor((rows + cols) / 3));
      const farCells = sfree.slice(1).filter(
        ([r, c]) => Math.abs(r - sr) + Math.abs(c - sc) >= minDist
      );
      const candidates = farCells.length ? farCells : sfree.slice(1);
      const [er, ec] = candidates[Math.floor(Math.random() * candidates.length)];

      occupied.add(`${sr},${sc}`);

      const path = randomPath(sr, sc, er, ec, rows, cols, occupied);
      if (!path || path.length < 3) {
        // Path must have at least 3 cells (start + middle + end)
        // so there's at least 1 rotatable pipe between endpoints
        occupied.delete(`${sr},${sc}`);
        continue;
      }

      occupied.add(`${er},${ec}`);
      for (let i = 1; i < path.length - 1; i++) {
        occupied.add(`${path[i][0]},${path[i][1]}`);
      }

      for (let i = 0; i < path.length; i++) {
        const [r, c] = path[i];
        const openDirs = [];
        if (i > 0)                openDirs.push(dirTo(r, c, path[i - 1][0], path[i - 1][1]));
        if (i < path.length - 1) openDirs.push(dirTo(r, c, path[i + 1][0], path[i + 1][1]));
        const shape = getShape(openDirs);
        const solvedRotation = getSolvedRotation(shape, openDirs);
        grid[r][c] = {
          shape,
          solvedRotation,
          currentRotation: solvedRotation,
          colorId,
          isEndpoint: i === 0 || i === path.length - 1,
        };
      }

      colorPairs.push({ colorId, endpoints: [[sr, sc], [er, ec]] });
      placed = true;
    }
  }

  return { grid, colorPairs };
}

function generatePuzzle(rows, cols, numColors) {
  // Retry entire puzzle generation until all colors are successfully placed
  for (let fullAttempt = 0; fullAttempt < 100; fullAttempt++) {
    const result = tryGeneratePuzzle(rows, cols, numColors);
    if (result.colorPairs.length === numColors) return result;
  }
  // Fallback: return whatever we got (should rarely happen)
  return tryGeneratePuzzle(rows, cols, numColors);
}

function getDistinctRotations(shape) {
  // Returns rotations that produce visually/functionally different openings
  // Cross: all rotations identical → only [0]
  // Straight: 0 and 2 are same, 1 and 3 are same → [0, 1]
  // End/Corner/Tee: all 4 are distinct → [0, 1, 2, 3]
  if (shape === 'cross') return [0];
  if (shape === 'straight') return [0, 1];
  return [0, 1, 2, 3];
}

function scramblePuzzle(grid, rows, cols) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = grid[r][c];
      if (!cell || cell.isEndpoint) continue;
      if (cell.shape === 'cross') continue; // cross looks the same at any rotation

      const distinct = getDistinctRotations(cell.shape);
      // For straight: solved 0 means avoid 0 AND 2 (both are the same)
      const solvedGroup = cell.shape === 'straight' ? (cell.solvedRotation % 2) : cell.solvedRotation;
      const candidates = distinct.filter(rot => {
        if (cell.shape === 'straight') return (rot % 2) !== solvedGroup;
        return rot !== cell.solvedRotation;
      });

      if (candidates.length > 0) {
        cell.currentRotation = candidates[Math.floor(Math.random() * candidates.length)];
      } else {
        // Shouldn't happen, but fallback to any non-solved rotation
        let rot;
        do { rot = Math.floor(Math.random() * 4); } while (rot === cell.solvedRotation);
        cell.currentRotation = rot;
      }
    }
  }
}

function cloneGrid(grid, rows, cols) {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) =>
      grid[r][c] ? { ...grid[r][c] } : null
    )
  );
}

// ── Connectivity (exact port from PipePuzzle.jsx computeConnected / isConnected) ─

function isConnected(grid, r1, c1, r2, c2, rows, cols) {
  // BFS from (r1,c1) following mutually-open pipes, reach (r2,c2)?
  const visited = new Set([`${r1},${c1}`]);
  const queue = [[r1, c1]];

  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === r2 && c === c2) return true;
    const cell = grid[r][c];
    if (!cell) continue;
    for (const d of getOpenings(cell.shape, cell.currentRotation)) {
      const nr = r + DR[d];
      const nc = c + DC[d];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nb = grid[nr][nc];
      if (!nb) continue;
      // Neighbor must open back toward us
      if (!getOpenings(nb.shape, nb.currentRotation).includes((d + 2) % 4)) continue;
      const k = `${nr},${nc}`;
      if (!visited.has(k)) { visited.add(k); queue.push([nr, nc]); }
    }
  }
  return false;
}

function checkWin(grid, colorPairs, rows, cols) {
  return colorPairs.every(({ endpoints: [[r1, c1], [r2, c2]] }) =>
    isConnected(grid, r1, c1, r2, c2, rows, cols)
  );
}

// ── createGame ────────────────────────────────────────────────────────────────

function createGame(playerCount = 1, difficulty = 'easy') {
  if (playerCount < 1 || playerCount > 8) throw new Error('TV Pipe Puzzle requires 1–8 players');
  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;
  const { rows, cols, numColors } = config;

  let currentRound = 0;
  let colorPairs = [];
  let grids = [];
  let solved = new Array(playerCount).fill(false);
  let solvedOrder = [];
  const sessionScores = new Array(playerCount).fill(0);
  let _isRoundOver = false;
  let _isSessionOver = false;

  function generateAndDistribute() {
    // Retry until we get a puzzle where no pipes are pre-connected after scramble
    for (let attempt = 0; attempt < 50; attempt++) {
      const puzzle = generatePuzzle(rows, cols, numColors);
      scramblePuzzle(puzzle.grid, rows, cols);
      // Check no color pair is already connected
      const anyPreConnected = puzzle.colorPairs.some(({ endpoints: [[r1, c1], [r2, c2]] }) =>
        isConnected(puzzle.grid, r1, c1, r2, c2, rows, cols)
      );
      if (!anyPreConnected || attempt === 49) {
        colorPairs = puzzle.colorPairs;
        grids = Array.from({ length: playerCount }, () =>
          cloneGrid(puzzle.grid, rows, cols)
        );
        return;
      }
    }
  }

  function start() {
    generateAndDistribute();
  }

  function rotateTile(seat, row, col) {
    if (_isRoundOver) return { ok: false, reason: 'Round is over' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (solved[seat]) return { ok: false, reason: 'Already solved this round' };
    const cell = grids[seat] && grids[seat][row] && grids[seat][row][col];
    if (!cell) return { ok: false, reason: 'Invalid cell' };
    if (cell.isEndpoint) return { ok: false, reason: 'Cannot rotate endpoint' };

    cell.currentRotation = (cell.currentRotation + 1) % 4;

    const isNowSolved = checkWin(grids[seat], colorPairs, rows, cols);
    let isRoundOver = false;

    if (isNowSolved && !solved[seat]) {
      solved[seat] = true;
      solvedOrder.push(seat);
      const pos = solvedOrder.length - 1;
      sessionScores[seat] += ROUND_POINTS[pos] || 0;
      // Round ends when first player solves
      _isRoundOver = true;
      isRoundOver = true;
    }

    return { ok: true, isNowSolved, isRoundOver };
  }

  function endRound() {
    _isRoundOver = true;
    // If this was the last round, mark session over
    if (currentRound + 1 >= TOTAL_ROUNDS) {
      _isSessionOver = true;
    }
    return sessionScores.map((pts, s) => ({
      seat: s,
      sessionScore: pts,
      solvedThisRound: solved[s],
      finishPos: solvedOrder.indexOf(s),
    }));
  }

  function nextRound() {
    if (currentRound + 1 >= TOTAL_ROUNDS) {
      _isSessionOver = true;
      return { ok: false, reason: 'Session complete' };
    }
    currentRound++;
    solved = new Array(playerCount).fill(false);
    solvedOrder = [];
    _isRoundOver = false;
    generateAndDistribute();
    return { ok: true };
  }

  function getSessionWinner() {
    let best = -1, bestSeat = null;
    for (let i = 0; i < playerCount; i++) {
      if (sessionScores[i] > best) { best = sessionScores[i]; bestSeat = i; }
    }
    return bestSeat;
  }

  function serializeCell(cell) {
    if (!cell) return null;
    return { shape: cell.shape, currentRotation: cell.currentRotation, colorId: cell.colorId, isEndpoint: cell.isEndpoint };
  }

  function countConnectedColors(seat) {
    if (!grids[seat]) return 0;
    return colorPairs.filter(({ endpoints: [[r1, c1], [r2, c2]] }) =>
      isConnected(grids[seat], r1, c1, r2, c2, rows, cols)
    ).length;
  }

  function state() {
    return {
      gameType: 'tv-pipe-puzzle',
      difficulty,
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      rows,
      cols,
      numColors,
      grids: grids.map(g => g.map(row => row.map(serializeCell))),
      colorPairs: colorPairs.map(cp => ({ colorId: cp.colorId, endpoints: cp.endpoints })),
      solved: solved.slice(),
      solvedOrder: solvedOrder.slice(),
      sessionScores: sessionScores.slice(),
      connectedCounts: grids.map((_, i) => countConnectedColors(i)),
      isRoundOver: _isRoundOver,
      isSessionOver: _isSessionOver,
      sessionWinnerSeat: _isSessionOver ? getSessionWinner() : null,
      playerCount,
    };
  }

  function isGameOver() { return _isSessionOver; }
  function winner() { return getSessionWinner(); }

  return { state, start, rotateTile, endRound, nextRound, isGameOver, winner };
}

module.exports = { createGame, TOTAL_ROUNDS };
