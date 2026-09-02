'use strict';

/**
 * Frog Drop — multiplayer drop-and-merge puzzle.
 * Each player has their own grid. Drop frogs into columns; matching adjacent
 * frogs in a column merge into the next tier. Round is timed; highest score wins.
 */

const COLS = 5;
const ROWS = 8;
const MAX_TIER = 8;
const MAX_UNDO = 10;

const FROG_TIERS = [
  null,
  { color: '#4CAF50', name: 'Green',  number: 1 },
  { color: '#2196F3', name: 'Blue',   number: 2 },
  { color: '#F44336', name: 'Red',    number: 3 },
  { color: '#FF9800', name: 'Orange', number: 4 },
  { color: '#9C27B0', name: 'Purple', number: 5 },
  { color: '#E91E63', name: 'Pink',   number: 6 },
  { color: '#00BCD4', name: 'Cyan',   number: 7 },
  { color: '#FFD700', name: 'Gold',   number: 8 },
];

function emptyGrid() {
  const g = [];
  for (let c = 0; c < COLS; c++) {
    g[c] = new Array(ROWS).fill(0);
  }
  return g;
}

function cloneGrid(g) {
  return g.map(col => col.slice());
}

function randomTier() {
  const r = Math.random();
  if (r < 0.45) return 1;
  if (r < 0.80) return 2;
  if (r < 0.95) return 3;
  return 4;
}

function findDropRow(grid, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (grid[col][r] === 0) return r;
  }
  return -1;
}

function applyGravity(grid) {
  for (let c = 0; c < COLS; c++) {
    let writePos = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[c][r] !== 0) {
        if (r !== writePos) {
          grid[c][writePos] = grid[c][r];
          grid[c][r] = 0;
        }
        writePos--;
      }
    }
  }
}

function checkBoardFull(grid) {
  for (let c = 0; c < COLS; c++) {
    if (grid[c][0] === 0) return false;
  }
  return true;
}

// Rainbow rule:
//   If the bottom 4 cells of any column hold the multiset {1, 2, 3, 4}
//   (any vertical order), they collapse into a single tier-5 frog at the
//   bottom and award a flat bonus on top of the regular merge points.
const RAINBOW_TIERS  = [1, 2, 3, 4];
const RAINBOW_TARGET = 5;
const RAINBOW_BONUS  = 200;   // flat bonus per rainbow trigger

// Row Match rule:
//   If any row contains 4 or more frogs of the same tier (in any columns),
//   those cells are cleared and the player gets:
//     points = tier × 50 × matchCount   (e.g. 4 × tier-3s → 600)
//   Cleared cells let frogs above fall via gravity, which can chain into
//   more merges / row matches. Detection runs after each merge pass.
// 5 = full row of the same tier across all columns.
const ROW_MATCH_MIN = 5;
const ROW_MATCH_MULT = 50;

function makePlayerState() {
  return {
    grid: emptyGrid(),
    score: 0,
    bestScore: 0,
    nextFrog: randomTier(),
    previewFrog: randomTier(),
    undoStack: [],
    discoveredTiers: new Set([1, 2, 3]),
    boardFull: false,
    mergeEvents: [],
    dropEvents: [],
    rainbowEvents: [],          // [{col, bottomCells:[r0..r3], score}]
    rowMatchEvents: [],         // [{row, cols:[...], tier, count, score, chain}]
  };
}

function createGame(playerCount) {
  const players = [];
  for (let i = 0; i < playerCount; i++) players.push(makePlayerState());

  let _ended = false;

  function _pushUndo(p) {
    p.undoStack.push({
      grid: cloneGrid(p.grid),
      score: p.score,
      nextFrog: p.nextFrog,
      previewFrog: p.previewFrog,
      discoveredTiers: new Set(p.discoveredTiers),
    });
    if (p.undoStack.length > MAX_UNDO) p.undoStack.shift();
  }

  function _processMerges(p, chainDepth) {
    let changed = false;

    // ── Same-tier vertical merges (one per column per pass) ────────────
    for (let c = 0; c < COLS; c++) {
      for (let r = ROWS - 1; r > 0; r--) {
        const tier = p.grid[c][r];
        if (tier === 0 || tier >= MAX_TIER) continue;
        if (p.grid[c][r - 1] === tier) {
          const newTier = tier + 1;
          p.grid[c][r] = newTier;
          p.grid[c][r - 1] = 0;
          const points = newTier * 10 * (chainDepth + 1);
          p.score += points;
          p.discoveredTiers.add(newTier);
          p.mergeEvents.push({ col: c, row: r, fromTier: tier, toTier: newTier, score: points, chain: chainDepth });
          changed = true;
          break;
        }
      }
    }

    // ── Rainbow rule: bottom 4 cells = {1,2,3,4} → collapse into one 5 ─
    // We only check after a merge pass (or on the initial drop) so cells
    // are settled by gravity. Multiple rainbows in different columns can
    // trigger in the same pass.
    for (let c = 0; c < COLS; c++) {
      // Read the bottom 4 cells (rows ROWS-1 down to ROWS-4).
      const cells = [
        p.grid[c][ROWS - 1],
        p.grid[c][ROWS - 2],
        p.grid[c][ROWS - 3],
        p.grid[c][ROWS - 4],
      ];
      // Match if those four values are exactly {1,2,3,4}.
      const sorted = cells.slice().sort((a, b) => a - b);
      if (sorted[0] === 1 && sorted[1] === 2 && sorted[2] === 3 && sorted[3] === 4) {
        // Collapse: clear the top three, place a tier-5 at the bottom.
        p.grid[c][ROWS - 1] = RAINBOW_TARGET;
        p.grid[c][ROWS - 2] = 0;
        p.grid[c][ROWS - 3] = 0;
        p.grid[c][ROWS - 4] = 0;

        // Score: same formula as a merge into tier-5 + a flat rainbow bonus.
        const mergePts = RAINBOW_TARGET * 10 * (chainDepth + 1);
        const total    = mergePts + RAINBOW_BONUS;
        p.score += total;
        p.discoveredTiers.add(RAINBOW_TARGET);

        // Record both a merge event (for the score popup) and a rainbow
        // event (for the rainbow-specific animation).
        p.mergeEvents.push({
          col: c, row: ROWS - 1,
          fromTier: 4, toTier: RAINBOW_TARGET,
          score: mergePts, chain: chainDepth,
          rainbow: true,
        });
        p.rainbowEvents.push({
          col: c, row: ROWS - 1,
          score: total, bonus: RAINBOW_BONUS,
          chain: chainDepth,
        });
        changed = true;
      }
    }

    // ── Row Match rule: ≥N same-tier frogs in any single row → clear them
    for (let r = 0; r < ROWS; r++) {
      // Count tiers in this row.
      const counts = new Map();   // tier → [col,col,...]
      for (let c = 0; c < COLS; c++) {
        const t = p.grid[c][r];
        if (t === 0) continue;
        if (!counts.has(t)) counts.set(t, []);
        counts.get(t).push(c);
      }
      for (const [tier, cols] of counts) {
        if (cols.length < ROW_MATCH_MIN) continue;
        // Award bonus, clear those cells.
        const points = tier * ROW_MATCH_MULT * cols.length;
        p.score += points;
        cols.forEach(c => { p.grid[c][r] = 0; });
        p.rowMatchEvents.push({
          row: r,
          cols: cols.slice(),
          tier,
          count: cols.length,
          score: points,
          chain: chainDepth,
        });
        changed = true;
      }
    }

    if (changed) {
      applyGravity(p.grid);
      _processMerges(p, chainDepth + 1);
    }
  }

  function dropFrog(seat, col) {
    if (_ended) return { ok: false };
    const p = players[seat];
    if (!p) return { ok: false };
    if (p.boardFull) return { ok: false };
    if (col < 0 || col >= COLS) return { ok: false };
    const row = findDropRow(p.grid, col);
    if (row < 0) return { ok: false };

    _pushUndo(p);
    p.mergeEvents = [];
    p.dropEvents = [];
    p.rainbowEvents = [];
    p.rowMatchEvents = [];

    const tier = p.nextFrog;
    p.grid[col][row] = tier;
    p.dropEvents.push({ col, row, tier });

    p.nextFrog = p.previewFrog;
    p.previewFrog = randomTier();

    _processMerges(p, 0);
    p.boardFull = checkBoardFull(p.grid);
    if (p.score > p.bestScore) p.bestScore = p.score;
    return { ok: true };
  }

  function undo(seat) {
    if (_ended) return false;
    const p = players[seat];
    if (!p || p.undoStack.length === 0) return false;
    const snap = p.undoStack.pop();
    p.grid = snap.grid;
    p.score = snap.score;
    p.nextFrog = snap.nextFrog;
    p.previewFrog = snap.previewFrog;
    p.discoveredTiers = snap.discoveredTiers;
    p.boardFull = checkBoardFull(p.grid);
    p.mergeEvents = [];
    p.dropEvents = [];
    p.rainbowEvents = [];
    p.rowMatchEvents = [];
    return true;
  }

  function restart(seat) {
    if (_ended) return false;
    const p = players[seat];
    if (!p) return false;
    const best = p.bestScore;
    players[seat] = makePlayerState();
    players[seat].bestScore = best;
    return true;
  }

  function endRound() { _ended = true; }
  function isEnded() { return _ended; }

  function rankings() {
    return players.map((p, seat) => ({ seat, score: p.score })).sort((a, b) => b.score - a.score);
  }

  function playerSnapshot(seat) {
    const p = players[seat];
    if (!p) return null;
    return {
      grid: p.grid,
      score: p.score,
      bestScore: p.bestScore,
      nextFrog: p.nextFrog,
      previewFrog: p.previewFrog,
      discoveredTiers: Array.from(p.discoveredTiers),
      boardFull: p.boardFull,
      mergeEvents: p.mergeEvents,
      dropEvents: p.dropEvents,
      rainbowEvents: p.rainbowEvents || [],
      rowMatchEvents: p.rowMatchEvents || [],
      undoCount: p.undoStack.length,
    };
  }

  function state() {
    return {
      gameType: 'tv-frog-drop',
      cols: COLS,
      rows: ROWS,
      maxTier: MAX_TIER,
      playerCount,
      ended: _ended,
      players: players.map((_, seat) => playerSnapshot(seat)),
    };
  }

  return {
    state, dropFrog, undo, restart, endRound, isEnded, rankings, playerSnapshot,
  };
}

module.exports = { createGame, COLS, ROWS, MAX_TIER, FROG_TIERS };
