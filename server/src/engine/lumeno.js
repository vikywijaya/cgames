'use strict';

/**
 * TV Lumeno engine — server-authoritative multiplayer, 3 rounds.
 *
 * Rules:
 *  - Each player has their own grid of colored orbs.
 *  - Players drag to connect 3+ adjacent (8-directional) orbs of the SAME color.
 *  - A valid chain clears those orbs, drops remaining down, fills top with new random orbs.
 *  - Score = chain_length² per clear.
 *  - Each player has movesLeft; when moves hit 0, that player is finished.
 *  - Round ends when ALL players are finished.
 *  - Session points: rank by round score descending → 1st=3pts, 2nd=2pts, 3rd=1pt.
 *  - 3 rounds per session. Most session points wins.
 */

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple'];

const TOTAL_ROUNDS = 1;
const ROUND_POINTS = [3, 2, 1]; // 1st, 2nd, 3rd place

const DIFFICULTY_CONFIG = {
  easy:   { rows: 5, cols: 5, numColors: 4, movesPerRound: 20 },
  medium: { rows: 6, cols: 6, numColors: 5, movesPerRound: 18 },
  hard:   { rows: 7, cols: 7, numColors: 5, movesPerRound: 15 },
};

function buildGrid(rows, cols, numColors) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => COLORS[Math.floor(Math.random() * numColors)])
  );
}

function isAdjacent(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1 && !(r1 === r2 && c1 === c2);
}

/**
 * Check that every cell in `cells` is connected to at least one other cell
 * in the chain (forms a connected subgraph in 8-directional adjacency).
 */
function isConnectedChain(cells) {
  if (cells.length === 0) return false;
  if (cells.length === 1) return true;

  const visited = new Set();
  visited.add(0);
  const queue = [0];

  while (queue.length > 0) {
    const idx = queue.shift();
    for (let j = 0; j < cells.length; j++) {
      if (!visited.has(j) && isAdjacent(cells[idx].row, cells[idx].col, cells[j].row, cells[j].col)) {
        visited.add(j);
        queue.push(j);
      }
    }
  }
  return visited.size === cells.length;
}

/**
 * Drop and fill: for each column, remove null entries, push remaining to bottom,
 * fill top with new random colors.
 */
function dropAndFill(grid, rows, cols, numColors) {
  for (let c = 0; c < cols; c++) {
    const column = [];
    for (let r = 0; r < rows; r++) {
      if (grid[r][c] !== null) column.push(grid[r][c]);
    }
    // Fill top with new random colors
    while (column.length < rows) {
      column.unshift(COLORS[Math.floor(Math.random() * numColors)]);
    }
    for (let r = 0; r < rows; r++) {
      grid[r][c] = column[r];
    }
  }
}

function createGame(playerCount = 1, difficulty = 'easy') {
  if (playerCount < 1 || playerCount > 8) throw new Error('Lumeno requires 1–8 players');
  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;
  const { rows, cols, numColors, movesPerRound } = config;

  let currentRound = 0;

  // Per-player state
  let grids = Array.from({ length: playerCount }, () => buildGrid(rows, cols, numColors));
  let movesLeft = new Array(playerCount).fill(movesPerRound);
  let scores = new Array(playerCount).fill(0);       // round scores (reset each round)
  let finished = new Array(playerCount).fill(false);
  const sessionScores = new Array(playerCount).fill(0); // accumulated across rounds
  const roundResults = [];

  let _isRoundOver = false;
  let _isSessionOver = false;

  function checkRoundOver() {
    return finished.every(f => f);
  }

  function clearChain(seat, cells) {
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (_isRoundOver) return { ok: false, reason: 'Round is over' };
    if (finished[seat]) return { ok: false, reason: 'You have no moves left' };
    if (movesLeft[seat] <= 0) return { ok: false, reason: 'No moves left' };
    if (!cells || cells.length < 3) return { ok: false, reason: 'Need at least 3 orbs' };

    const grid = grids[seat];

    // Validate all cells are in bounds
    for (const { row, col } of cells) {
      if (row < 0 || row >= rows || col < 0 || col >= cols) {
        return { ok: false, reason: 'Cell out of bounds' };
      }
    }

    // Validate all same color
    const color = grid[cells[0].row][cells[0].col];
    for (const { row, col } of cells) {
      if (grid[row][col] !== color) return { ok: false, reason: 'All orbs must be the same color' };
    }

    // Validate no duplicates
    const keys = new Set(cells.map(c => `${c.row},${c.col}`));
    if (keys.size !== cells.length) return { ok: false, reason: 'Duplicate cells in chain' };

    // Validate chain is connected
    if (!isConnectedChain(cells)) return { ok: false, reason: 'Chain must be connected' };

    // Clear cells
    for (const { row, col } of cells) {
      grid[row][col] = null;
    }

    // Drop and fill
    dropAndFill(grid, rows, cols, numColors);

    // Award points
    const points = cells.length * cells.length;
    scores[seat] += points;

    // Decrement moves
    movesLeft[seat]--;
    if (movesLeft[seat] <= 0) {
      movesLeft[seat] = 0;
      finished[seat] = true;
    }

    const isRoundOver = checkRoundOver();
    if (isRoundOver) {
      _isRoundOver = true;
    }

    return {
      ok: true,
      points,
      newGrid: grids[seat].map(row => row.slice()),
      movesLeft: movesLeft[seat],
      isFinished: finished[seat],
      isRoundOver: _isRoundOver
    };
  }

  function endRound() {
    _isRoundOver = true;

    // Rank players by round score descending, award session points
    const ranked = scores
      .map((score, seat) => ({ seat, score }))
      .sort((a, b) => b.score - a.score);

    // Award points (handle ties: same score → same rank, share the points? No, ROUND_POINTS by rank index)
    ranked.forEach((entry, idx) => {
      const pts = ROUND_POINTS[idx] || 0;
      sessionScores[entry.seat] += pts;
    });

    const result = ranked.map((entry, idx) => ({
      seat: entry.seat,
      roundScore: entry.score,
      sessionScore: sessionScores[entry.seat],
      rank: idx + 1,
      roundPoints: ROUND_POINTS[idx] || 0
    }));
    roundResults.push(result);
    // Mark session over if this was the last round
    if (currentRound + 1 >= TOTAL_ROUNDS) {
      _isSessionOver = true;
    }
    return result;
  }

  function nextRound() {
    if (currentRound + 1 >= TOTAL_ROUNDS) {
      _isSessionOver = true;
      return { ok: false, reason: 'Session complete' };
    }
    currentRound++;
    grids = Array.from({ length: playerCount }, () => buildGrid(rows, cols, numColors));
    movesLeft = new Array(playerCount).fill(movesPerRound);
    scores = new Array(playerCount).fill(0);
    finished = new Array(playerCount).fill(false);
    _isRoundOver = false;
    return { ok: true };
  }

  function start() {
    // Grids are already initialized; nothing extra needed
  }

  function getSessionWinner() {
    let best = -1, bestSeat = null;
    for (let i = 0; i < playerCount; i++) {
      if (sessionScores[i] > best) { best = sessionScores[i]; bestSeat = i; }
    }
    return bestSeat;
  }

  function state() {
    return {
      gameType: 'tv-lumeno',
      difficulty,
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      rows,
      cols,
      grids: grids.map(grid => grid.map(row => row.slice())),
      movesLeft: movesLeft.slice(),
      scores: scores.slice(),
      sessionScores: sessionScores.slice(),
      finished: finished.slice(),
      roundResults,
      isRoundOver: _isRoundOver,
      isSessionOver: _isSessionOver,
      sessionWinnerSeat: _isSessionOver ? getSessionWinner() : null,
      playerCount
    };
  }

  function isGameOver() { return _isSessionOver; }
  function winner() { return getSessionWinner(); }

  return { state, clearChain, start, endRound, nextRound, isGameOver, winner };
}

module.exports = { createGame, TOTAL_ROUNDS };
