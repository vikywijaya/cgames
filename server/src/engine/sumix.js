'use strict';

/**
 * Sumix — target-sum activation puzzle engine.
 * Grid comes pre-filled with numbers. Players toggle cells on/off (activate/deactivate).
 * Goal: activate the right cells so each row and column sum matches the target.
 * Easy = 3×3, Medium = 4×4, Hard = 5×5.
 */

// ── Puzzle generation ───────────────────────────────────────────────────────

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Generate a puzzle: NxN grid of numbers with a solution mask.
 * - Fill grid with random numbers 1-9.
 * - Create a random boolean mask (which cells are "on" in the solution).
 * - Compute row/col targets from the activated cells.
 * - Ensure each row and column has at least 1 active and 1 inactive cell for interesting puzzles.
 */
function generatePuzzle(size) {
  const grid = [];
  const solutionMask = [];

  for (let r = 0; r < size; r++) {
    const row = [];
    const maskRow = [];
    for (let c = 0; c < size; c++) {
      row.push(randInt(1, 9));
      maskRow.push(false);
    }
    grid.push(row);
    solutionMask.push(maskRow);
  }

  // For each row, randomly activate some cells (at least 1, at most size-1)
  for (let r = 0; r < size; r++) {
    const count = randInt(1, size - 1);
    const indices = shuffle([...Array(size).keys()]).slice(0, count);
    for (const c of indices) solutionMask[r][c] = true;
  }

  // Verify each column has at least 1 active and 1 inactive
  // If a column is all-active or all-inactive, flip one cell
  for (let c = 0; c < size; c++) {
    const activeCount = solutionMask.reduce((sum, row) => sum + (row[c] ? 1 : 0), 0);
    if (activeCount === 0) {
      solutionMask[randInt(0, size - 1)][c] = true;
    } else if (activeCount === size) {
      solutionMask[randInt(0, size - 1)][c] = false;
    }
  }

  // Also re-check rows after column fixes
  for (let r = 0; r < size; r++) {
    const activeCount = solutionMask[r].filter(Boolean).length;
    if (activeCount === 0) {
      solutionMask[r][randInt(0, size - 1)] = true;
    } else if (activeCount === size) {
      solutionMask[r][randInt(0, size - 1)] = false;
    }
  }

  // Compute targets from solution
  const rowTargets = [];
  for (let r = 0; r < size; r++) {
    let sum = 0;
    for (let c = 0; c < size; c++) {
      if (solutionMask[r][c]) sum += grid[r][c];
    }
    rowTargets.push(sum);
  }

  const colTargets = [];
  for (let c = 0; c < size; c++) {
    let sum = 0;
    for (let r = 0; r < size; r++) {
      if (solutionMask[r][c]) sum += grid[r][c];
    }
    colTargets.push(sum);
  }

  return { grid, solutionMask, rowTargets, colTargets };
}

// ── Game factory ────────────────────────────────────────────────────────────

function createGame(playerCount, options = {}) {
  const mode = options.mode || 'easy';
  const gridSize = mode === 'hard' ? 5 : mode === 'medium' ? 4 : 3;
  const { grid, rowTargets, colTargets } = generatePuzzle(gridSize);

  // Each player gets their own activation mask (all off initially)
  const playerMasks = [];
  for (let s = 0; s < playerCount; s++) {
    const mask = [];
    for (let r = 0; r < gridSize; r++) {
      mask.push(new Array(gridSize).fill(false));
    }
    playerMasks.push(mask);
  }

  // Correctness flags per player
  const correctRows = playerMasks.map(() => new Array(gridSize).fill(false));
  const correctCols = playerMasks.map(() => new Array(gridSize).fill(false));

  let _isGameOver = false;
  let _winnerSeat = null;

  // ── Internal helpers ────────────────────────────────────────────────────

  function _updateCorrectness(seat) {
    const mask = playerMasks[seat];

    for (let r = 0; r < gridSize; r++) {
      let sum = 0;
      for (let c = 0; c < gridSize; c++) {
        if (mask[r][c]) sum += grid[r][c];
      }
      correctRows[seat][r] = sum === rowTargets[r];
    }

    for (let c = 0; c < gridSize; c++) {
      let sum = 0;
      for (let r = 0; r < gridSize; r++) {
        if (mask[r][c]) sum += grid[r][c];
      }
      correctCols[seat][c] = sum === colTargets[c];
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  function state() {
    return {
      gameType: 'tv-sumix',
      mode,
      gridSize,
      grid,          // the shared number grid (same for all players)
      rowTargets,
      colTargets,
      playerMasks,   // each player's activation state
      correctRows,
      correctCols,
      isGameOver: _isGameOver,
      winnerSeat: _winnerSeat,
      playerCount
    };
  }

  function toggleCell(seat, row, col) {
    if (_isGameOver) return { ok: false, reason: 'Game is over' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return { ok: false, reason: 'Invalid cell' };

    playerMasks[seat][row][col] = !playerMasks[seat][row][col];
    _updateCorrectness(seat);
    return { ok: true, active: playerMasks[seat][row][col] };
  }

  function checkComplete(seat) {
    if (seat < 0 || seat >= playerCount) return { complete: false, correct: false };
    const allCorrect = correctRows[seat].every(Boolean) && correctCols[seat].every(Boolean);
    if (allCorrect && !_isGameOver) {
      _isGameOver = true;
      _winnerSeat = seat;
    }
    return { complete: true, correct: allCorrect };
  }

  function isGameOver() { return _isGameOver; }
  function winner() { return _winnerSeat; }

  return { state, toggleCell, checkComplete, isGameOver, winner };
}

module.exports = { createGame };
