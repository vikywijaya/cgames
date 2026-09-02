'use strict';

/**
 * TV Sokoban engine — exact logic ported from cgames/Sokoban.jsx.
 * All levels are the verified-solvable ones from that repo.
 *
 * Multiplayer: all players get the SAME level simultaneously.
 * First to solve wins the round (3 pts), 2nd = 2 pts, 3rd = 1 pt.
 * 3 rounds: easy #1, easy #2, easy #3.
 */

const TOTAL_ROUNDS = 3;
const ROUND_POINTS = [3, 2, 1];

// ── Tile types (exact from cgames) ───────────────────────────────────────────
const WALL           = '#';
const FLOOR          = ' ';
const BOX            = '$';
const GOAL           = '.';
const BOX_ON_GOAL    = '*';
const PLAYER         = '@';
const PLAYER_ON_GOAL = '+';

// ── Levels — exact copy from cgames LEVELS.easy[0..2] ────────────────────────
const LEVEL_PACK = [
  // Round 1 — easy #1: straight push (1 box)
  [
    '######',
    '#    #',
    '# $  #',
    '# .@ #',
    '#    #',
    '######',
  ],
  // Round 2 — easy #2: two boxes
  [
    '#######',
    '#     #',
    '# $.$ #',
    '#  @  #',
    '#  .  #',
    '#     #',
    '#######',
  ],
  // Round 3 — easy #3: L-shape
  [
    '  ####',
    '###  #',
    '#  $.#',
    '# #. #',
    '# $@ #',
    '#    #',
    '######',
  ],
];

// ── Exact logic from cgames parseLevel ───────────────────────────────────────
function parseLevel(lines) {
  const height = lines.length;
  const width = Math.max(...lines.map(l => l.length));
  const grid = [];
  let playerR = 0, playerC = 0;
  for (let r = 0; r < height; r++) {
    const row = [];
    for (let c = 0; c < width; c++) {
      const ch = (lines[r] || '')[c] || ' ';
      if (ch === PLAYER || ch === PLAYER_ON_GOAL) { playerR = r; playerC = c; }
      row.push(ch);
    }
    grid.push(row);
  }
  return { grid, playerR, playerC, height, width };
}

// ── Exact logic from cgames isSolved ─────────────────────────────────────────
function isSolved(grid) {
  for (const row of grid) {
    for (const cell of row) {
      if (cell === GOAL || cell === PLAYER_ON_GOAL) return false;
    }
  }
  return true;
}

// ── Exact logic from cgames tryMove ──────────────────────────────────────────
function tryMove(grid, playerR, playerC, dr, dc) {
  const rows = grid.length;
  const cols = grid[0].length;
  const nr = playerR + dr;
  const nc = playerC + dc;
  if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return null;
  const target = grid[nr][nc];
  if (target === WALL) return null;

  if (target === BOX || target === BOX_ON_GOAL) {
    const br = nr + dr;
    const bc = nc + dc;
    if (br < 0 || br >= rows || bc < 0 || bc >= cols) return null;
    const behind = grid[br][bc];
    if (behind !== FLOOR && behind !== GOAL) return null;
    const newGrid = grid.map(row => [...row]);
    newGrid[br][bc] = behind === GOAL ? BOX_ON_GOAL : BOX;
    newGrid[nr][nc] = target === BOX_ON_GOAL ? PLAYER_ON_GOAL : PLAYER;
    newGrid[playerR][playerC] = grid[playerR][playerC] === PLAYER_ON_GOAL ? GOAL : FLOOR;
    return { grid: newGrid, playerR: nr, playerC: nc, pushed: true };
  }

  if (target === FLOOR || target === GOAL) {
    const newGrid = grid.map(row => [...row]);
    newGrid[nr][nc] = target === GOAL ? PLAYER_ON_GOAL : PLAYER;
    newGrid[playerR][playerC] = grid[playerR][playerC] === PLAYER_ON_GOAL ? GOAL : FLOOR;
    return { grid: newGrid, playerR: nr, playerC: nc, pushed: false };
  }

  return null;
}

const DIR_MAP = {
  up:    [-1,  0],
  down:  [ 1,  0],
  left:  [ 0, -1],
  right: [ 0,  1],
};

function clonePlayerState(ps) {
  return { grid: ps.grid.map(r => [...r]), playerR: ps.playerR, playerC: ps.playerC, height: ps.height, width: ps.width };
}

// ── Engine ───────────────────────────────────────────────────────────────────
function createGame(playerCount) {
  playerCount = Math.max(1, Math.min(8, playerCount || 1));

  const sessionScores = new Array(playerCount).fill(0);
  let currentRound = 0;
  const totalRounds = TOTAL_ROUNDS;
  let isSessionOver = false;

  let levelState = null;
  let playerStates = [];   // per-seat { grid, playerR, playerC, height, width }
  let playerHistory = [];  // per-seat array of previous states (for undo)
  let playerSolved = [];
  let solvedOrder = [];
  let moveCounts = [];
  let roundOver = false;

  function initRound() {
    const lines = LEVEL_PACK[currentRound % LEVEL_PACK.length];
    levelState = parseLevel(lines);
    playerStates = [];
    playerHistory = [];
    playerSolved = [];
    moveCounts = [];
    solvedOrder = [];
    roundOver = false;
    for (let i = 0; i < playerCount; i++) {
      playerStates.push(clonePlayerState(levelState));
      playerHistory.push([]);
      playerSolved.push(false);
      moveCounts.push(0);
    }
  }

  function start() { initRound(); }

  function move(seat, direction) {
    if (roundOver) return { ok: false, reason: 'Round is over' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (playerSolved[seat]) return { ok: false, reason: 'Already solved' };
    const dir = DIR_MAP[direction];
    if (!dir) return { ok: false, reason: 'Invalid direction' };

    const ps = playerStates[seat];
    const result = tryMove(ps.grid, ps.playerR, ps.playerC, dir[0], dir[1]);
    if (!result) return { ok: false, reason: 'Blocked' };

    // Save history for undo
    playerHistory[seat].push(clonePlayerState(ps));
    if (playerHistory[seat].length > 100) playerHistory[seat].shift(); // cap

    playerStates[seat] = { grid: result.grid, playerR: result.playerR, playerC: result.playerC, height: ps.height, width: ps.width };
    moveCounts[seat]++;

    let justSolved = false;
    if (isSolved(result.grid)) {
      playerSolved[seat] = true;
      solvedOrder.push(seat);
      justSolved = true;
      roundOver = true;
    }

    return { ok: true, justSolved, isRoundOver: justSolved && roundOver };
  }

  function undo(seat) {
    if (seat < 0 || seat >= playerCount) return { ok: false };
    if (playerSolved[seat]) return { ok: false };
    if (playerHistory[seat].length === 0) return { ok: false };
    playerStates[seat] = playerHistory[seat].pop();
    if (moveCounts[seat] > 0) moveCounts[seat]--;
    return { ok: true };
  }

  function restart(seat) {
    if (seat < 0 || seat >= playerCount) return { ok: false };
    if (playerSolved[seat]) return { ok: false };
    playerStates[seat] = clonePlayerState(levelState);
    playerHistory[seat] = [];
    moveCounts[seat] = 0;
    return { ok: true };
  }

  function endRound() {
    roundOver = true;
    const pts = {};
    solvedOrder.forEach((seat, i) => {
      const p = i < ROUND_POINTS.length ? ROUND_POINTS[i] : 0;
      sessionScores[seat] += p;
      pts[seat] = p;
    });
    // Mark session over if this was the last round
    if (currentRound + 1 >= totalRounds) {
      isSessionOver = true;
    }
    return { solvedOrder: [...solvedOrder], pointsAwarded: pts, sessionScores: [...sessionScores] };
  }

  function nextRound() {
    currentRound++;
    if (currentRound >= totalRounds) { isSessionOver = true; return { ok: false }; }
    initRound();
    return { ok: true };
  }

  function winner() {
    let best = -1, bestScore = -1;
    for (let i = 0; i < playerCount; i++) {
      if (sessionScores[i] > bestScore) { bestScore = sessionScores[i]; best = i; }
    }
    return best;
  }

  function state() {
    return {
      gameType: 'tv-sokoban',
      currentRound,
      totalRounds,
      isSessionOver,
      sessionScores: [...sessionScores],
      playerSolved: [...playerSolved],
      solvedOrder: [...solvedOrder],
      moveCounts: [...moveCounts],
      playerGrids: playerStates.map(ps => ({
        grid: ps.grid,
        playerR: ps.playerR,
        playerC: ps.playerC,
        height: ps.height,
        width: ps.width,
      })),
      level: levelState ? { height: levelState.height, width: levelState.width } : null,
    };
  }

  return { start, move, undo, restart, endRound, nextRound, winner, state };
}

module.exports = { createGame };
