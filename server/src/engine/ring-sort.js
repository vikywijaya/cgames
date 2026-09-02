'use strict';

/**
 * TV Ring Sort engine — exact logic ported from cgames/RingSort.jsx.
 * Server-authoritative competitive multiplayer, 3 rounds.
 *
 * All players get the SAME scrambled puzzle to solve independently.
 * First to sort all rings wins the round: 1st=3pts, 2nd=2pts, 3rd=1pt.
 */

const TOTAL_ROUNDS = 3;
const ROUND_POINTS = [3, 2, 1];

// Exact from cgames
const RING_COLORS = [
  { bg: '#f87171', name: 'red' },
  { bg: '#facc15', name: 'yellow' },
  { bg: '#4ade80', name: 'green' },
  { bg: '#60a5fa', name: 'blue' },
  { bg: '#c084fc', name: 'purple' },
  { bg: '#f9a8d4', name: 'pink' },
  { bg: '#2dd4bf', name: 'teal' },
  { bg: '#fb923c', name: 'orange' },
];

const RING_WIDTHS = [62, 54, 46, 38, 32]; // index 0=largest (bottom)

// Exact from cgames DIFFICULTY_CONFIG
const DIFFICULTY_CONFIG = {
  easy:   { numColors: 2, ringsPerColor: 3, rodCapacity: 4, extraRods: 1 },
  medium: { numColors: 3, ringsPerColor: 3, rodCapacity: 4, extraRods: 1 },
  hard:   { numColors: 4, ringsPerColor: 4, rodCapacity: 4, extraRods: 1 },
};

const ROUND_DIFFICULTY = ['easy', 'medium', 'hard'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Exact port of cgames generatePuzzle
function generatePuzzle(numColors, ringsPerColor, extraRods) {
  const colors = shuffle(RING_COLORS).slice(0, numColors);
  const allRings = [];
  for (const color of colors) {
    for (let size = 0; size < ringsPerColor; size++) {
      allRings.push({ bg: color.bg, name: color.name, size });
    }
  }
  const shuffled = shuffle(allRings);
  const totalRods = numColors + extraRods;
  const rods = Array.from({ length: totalRods }, () => []);
  let idx = 0;
  for (let r = 0; r < numColors; r++) {
    for (let i = 0; i < ringsPerColor; i++) rods[r].push(shuffled[idx++]);
  }
  // Retry if already solved
  const alreadySolved = rods.every(rod =>
    rod.length === 0 || rod.every(ring => ring.name === rod[0].name)
  );
  if (alreadySolved) return generatePuzzle(numColors, ringsPerColor, extraRods);
  return { rods, numColors, ringsPerColor, totalRods };
}

function deepCloneRods(rods) {
  return rods.map(rod => rod.map(ring => ({ ...ring })));
}

// Exact port of cgames isCorrectOrder
function isCorrectOrder(rod) {
  if (rod.length === 0) return false;
  if (!rod.every(ring => ring.name === rod[0].name)) return false;
  for (let i = 1; i < rod.length; i++) {
    if (rod[i].size <= rod[i - 1].size) return false;
  }
  return true;
}

// Exact port of cgames isRodFullyComplete
function isRodFullyComplete(rod, ringsPerColor) {
  return rod.length === ringsPerColor && isCorrectOrder(rod);
}

// Exact port of cgames isSolved
function isPuzzleSolved(rods, numColors, ringsPerColor) {
  return rods.filter(rod => isRodFullyComplete(rod, ringsPerColor)).length === numColors;
}

// ── Engine ────────────────────────────────────────────────────────────────────

function createGame(playerCount) {
  playerCount = Math.max(1, Math.min(8, playerCount || 1));

  const sessionScores = new Array(playerCount).fill(0);
  let currentRound = 0;
  const totalRounds = TOTAL_ROUNDS;
  let isSessionOver = false;

  let sharedPuzzle = null;
  let playerRods = [];      // independent rods per seat
  let selectedRod = [];     // currently selected rod index per seat (null = none)
  let playerSolved = [];
  let solvedOrder = [];
  let moveCounts = [];
  let roundOver = false;

  function getDiffConfig() {
    return DIFFICULTY_CONFIG[ROUND_DIFFICULTY[currentRound % ROUND_DIFFICULTY.length]];
  }

  function initRound() {
    const cfg = getDiffConfig();
    sharedPuzzle = generatePuzzle(cfg.numColors, cfg.ringsPerColor, cfg.extraRods);
    sharedPuzzle.rodCapacity = cfg.rodCapacity;
    playerRods = [];
    selectedRod = [];
    playerSolved = [];
    moveCounts = [];
    solvedOrder = [];
    roundOver = false;
    for (let i = 0; i < playerCount; i++) {
      playerRods.push(deepCloneRods(sharedPuzzle.rods));
      selectedRod.push(null);
      playerSolved.push(false);
      moveCounts.push(0);
    }
  }

  function start() {
    initRound();
  }

  // Exact port of cgames handleRodClick
  function tapRod(seat, rodIdx) {
    if (roundOver) return { ok: false, reason: 'Round is over' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (playerSolved[seat]) return { ok: false, reason: 'Already solved' };

    const rods = playerRods[seat];
    if (rodIdx < 0 || rodIdx >= rods.length) return { ok: false, reason: 'Invalid rod' };

    const cfg = getDiffConfig();
    const rodCapacity = cfg.rodCapacity;
    const cur = selectedRod[seat];

    // No selection — pick up
    if (cur === null) {
      if (rods[rodIdx].length === 0) return { ok: false, reason: 'Empty rod' };
      selectedRod[seat] = rodIdx;
      return { ok: true, action: 'select', selectedRod: rodIdx };
    }

    // Same rod — deselect
    if (cur === rodIdx) {
      selectedRod[seat] = null;
      return { ok: true, action: 'deselect' };
    }

    // Target rod full — shake & deselect (exact cgames behaviour)
    if (rods[rodIdx].length >= rodCapacity) {
      selectedRod[seat] = null;
      return { ok: false, reason: 'Rod full', action: 'full', shakeRod: rodIdx };
    }

    // Move top ring from cur → rodIdx
    const newRods = deepCloneRods(rods);
    const ring = newRods[cur].pop();
    newRods[rodIdx].push(ring);
    playerRods[seat] = newRods;
    selectedRod[seat] = null;
    moveCounts[seat]++;

    let justSolved = false;
    if (isPuzzleSolved(newRods, sharedPuzzle.numColors, sharedPuzzle.ringsPerColor)) {
      playerSolved[seat] = true;
      solvedOrder.push(seat);
      justSolved = true;
      // Round ends when first player solves
      roundOver = true;
    }

    return { ok: true, action: 'move', from: cur, to: rodIdx, justSolved, isRoundOver: justSolved && roundOver };
  }

  function endRound() {
    roundOver = true;
    const pts = {};
    solvedOrder.forEach((seat, i) => {
      const p = i < ROUND_POINTS.length ? ROUND_POINTS[i] : 0;
      sessionScores[seat] += p;
      pts[seat] = p;
    });
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
    const cfg = sharedPuzzle ? {
      numColors: sharedPuzzle.numColors,
      ringsPerColor: sharedPuzzle.ringsPerColor,
      rodCapacity: sharedPuzzle.rodCapacity,
      totalRods: sharedPuzzle.totalRods,
    } : null;
    return {
      gameType: 'tv-ring-sort',
      currentRound,
      totalRounds,
      isSessionOver,
      sessionScores: [...sessionScores],
      playerSolved: [...playerSolved],
      solvedOrder: [...solvedOrder],
      moveCounts: [...moveCounts],
      config: cfg,
      playerRods: playerRods.map(rods => deepCloneRods(rods)),
      selectedRods: [...selectedRod],
      ringWidths: RING_WIDTHS,
    };
  }

  return { start, tapRod, endRound, nextRound, winner, state };
}

module.exports = { createGame };
