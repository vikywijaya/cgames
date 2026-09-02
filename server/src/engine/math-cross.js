'use strict';

/**
 * TV MathCross engine — server-authoritative multiplayer, 3 rounds.
 *
 * Rules:
 *  - 1–8 players race to solve the SAME MathCross puzzle each round.
 *  - 3 rounds per session. Each round = a fresh puzzle.
 *  - Points per round: 1st=3pts, 2nd=2pts, 3rd=1pt, others=0pts.
 *  - Bonus: -1s per second faster than 30s (speed bonus capped at 10pts).
 *  - Most total points after 3 rounds wins the session.
 */

const OPS = ['+', '-', 'x'];
const TOTAL_ROUNDS = 3;

const DIFFICULTY_CONFIG = {
  easy:   { crossCount: 1, maxNum: 12,  slotRatio: 0.5  },
  medium: { crossCount: 2, maxNum: 20,  slotRatio: 0.45 },
  hard:   { crossCount: 3, maxNum: 25,  slotRatio: 0.45 },
};

const ROUND_POINTS = [3, 2, 1]; // 1st, 2nd, 3rd place

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeEquation(maxNum) {
  const op = OPS[randInt(0, 2)];
  let a, b, c;
  if (op === '+') {
    a = randInt(1, Math.floor(maxNum / 2));
    b = randInt(1, Math.floor(maxNum / 2));
    c = a + b;
  } else if (op === '-') {
    c = randInt(1, Math.floor(maxNum / 2));
    b = randInt(1, Math.floor(maxNum / 2));
    a = b + c;
  } else {
    a = randInt(2, Math.min(9, maxNum));
    b = randInt(2, Math.min(9, maxNum));
    c = a * b;
  }
  return { a, op, b, c };
}

function generatePuzzle(crossCount, maxNum, slotRatio) {
  const cells = {};
  const crossBlockH = 5;
  const gap = 1;
  const crosses = [];

  for (let i = 0; i < crossCount; i++) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const hEq = makeEquation(maxNum);
      const shared = hEq.b;
      const vOp = OPS[randInt(0, 2)];
      let vA, vC;

      if (vOp === '+') {
        vA = randInt(1, Math.floor(maxNum / 2));
        vC = vA + shared;
      } else if (vOp === '-') {
        vA = shared + randInt(1, Math.floor(maxNum / 2));
        vC = vA - shared;
      } else {
        vA = randInt(2, Math.min(9, maxNum));
        vC = vA * shared;
      }

      if (vC > 0 && vA > 0 && vC <= maxNum * maxNum) {
        crosses.push({ h: hEq, v: { a: vA, op: vOp, b: shared, c: vC } });
        break;
      }
    }
  }

  function setCell(r, c, type, value) {
    cells[`${r},${c}`] = { type, value };
  }

  crosses.forEach((cross, idx) => {
    const startR = idx * (crossBlockH + gap);
    const hr = startR + 2;
    const vc = 2;
    setCell(hr, 0, 'number', cross.h.a);
    setCell(hr, 1, 'op', cross.h.op);
    setCell(hr, 2, 'number', cross.h.b);
    setCell(hr, 3, 'op', '=');
    setCell(hr, 4, 'number', cross.h.c);
    setCell(startR,     vc, 'number', cross.v.a);
    setCell(startR + 1, vc, 'op', cross.v.op);
    setCell(startR + 3, vc, 'op', '=');
    setCell(startR + 4, vc, 'number', cross.v.c);
  });

  let maxR = 0, maxC = 0;
  for (const key of Object.keys(cells)) {
    const [r, c] = key.split(',').map(Number);
    if (r > maxR) maxR = r;
    if (c > maxC) maxC = c;
  }

  const numberKeys = Object.keys(cells).filter(k => cells[k].type === 'number');
  const slotCount = Math.max(2, Math.ceil(numberKeys.length * slotRatio));
  const slotKeys = new Set(shuffle(numberKeys).slice(0, slotCount));
  const answers = {};
  const trayValues = [];

  for (const key of slotKeys) {
    const val = cells[key].value;
    answers[key] = val;
    trayValues.push(val);
    cells[key] = { type: 'slot', value: null, answer: val };
  }

  return {
    cells,
    rows: maxR + 1,
    cols: maxC + 1,
    slotPositions: [...slotKeys],
    trayValues: shuffle(trayValues),
    answers
  };
}

function createGame(playerCount = 1, difficulty = 'easy') {
  if (playerCount < 1 || playerCount > 8) throw new Error('MathCross requires 1–8 players');
  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;

  let currentRound = 0;
  let puzzle = generatePuzzle(config.crossCount, config.maxNum, config.slotRatio);
  let placed = Array.from({ length: playerCount }, () => ({}));
  let solved = new Array(playerCount).fill(false);
  let solvedAt = new Array(playerCount).fill(null);
  let solvedOrder = []; // seats in order they solved
  let roundStartTime = null;

  // Session scores across all rounds
  const sessionScores = new Array(playerCount).fill(0);
  // Per-round results: [{ seat, points, solveTime }]
  const roundResults = [];

  let _isRoundOver = false;
  let _isSessionOver = false;

  function checkPlayerSolved(seat) {
    const pp = placed[seat];
    return puzzle.slotPositions.every(k => pp[k] !== undefined && pp[k] === puzzle.answers[k]);
  }

  function placeNumber(seat, slotKey, value) {
    if (_isRoundOver) return { ok: false, reason: 'Round is over' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (solved[seat]) return { ok: false, reason: 'You already solved this round' };
    if (!puzzle.slotPositions.includes(slotKey)) return { ok: false, reason: 'Invalid slot' };

    placed[seat][slotKey] = value;
    const correct = value === puzzle.answers[slotKey];
    const nowSolved = correct && checkPlayerSolved(seat);

    if (nowSolved) {
      solved[seat] = true;
      solvedAt[seat] = Date.now();
      solvedOrder.push(seat);

      // Award points based on finishing position
      const pos = solvedOrder.length - 1; // 0-indexed
      const pts = ROUND_POINTS[pos] || 0;
      sessionScores[seat] += pts;

      // Check if all players solved (end round early) or first solver
      if (solvedOrder.length === playerCount) {
        _isRoundOver = true;
      }
    }

    return {
      ok: true,
      seat,
      slotKey,
      value,
      correct,
      nowSolved,
      isRoundOver: _isRoundOver
    };
  }

  function removeNumber(seat, slotKey) {
    if (_isRoundOver) return { ok: false, reason: 'Round is over' };
    if (solved[seat]) return { ok: false, reason: 'Already solved' };
    delete placed[seat][slotKey];
    return { ok: true };
  }

  function endRound() {
    _isRoundOver = true;
    // Capture round results
    const result = sessionScores.map((pts, s) => ({
      seat: s,
      sessionScore: pts,
      solvedThisRound: solved[s],
      solveTime: solvedAt[s] ? Math.round((solvedAt[s] - roundStartTime) / 1000) : null,
      finishPos: solvedOrder.indexOf(s) // -1 if not solved
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
    puzzle = generatePuzzle(config.crossCount, config.maxNum, config.slotRatio);
    placed = Array.from({ length: playerCount }, () => ({}));
    solved = new Array(playerCount).fill(false);
    solvedAt = new Array(playerCount).fill(null);
    solvedOrder = [];
    _isRoundOver = false;
    roundStartTime = Date.now();
    return { ok: true };
  }

  function start() {
    roundStartTime = Date.now();
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
      gameType: 'tv-math-cross',
      difficulty,
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      puzzle: {
        cells: puzzle.cells,
        rows: puzzle.rows,
        cols: puzzle.cols,
        slotPositions: puzzle.slotPositions,
        trayValues: puzzle.trayValues,
        answers: puzzle.answers
      },
      placed: placed.map(p => ({ ...p })),
      solved: solved.slice(),
      solvedAt: solvedAt.slice(),
      solvedOrder: solvedOrder.slice(),
      sessionScores: sessionScores.slice(),
      roundResults,
      isRoundOver: _isRoundOver,
      isSessionOver: _isSessionOver,
      sessionWinnerSeat: _isSessionOver ? getSessionWinner() : null,
      playerCount,
      roundStartTime
    };
  }

  function isGameOver() { return _isSessionOver; }
  function winner() { return getSessionWinner(); }

  return { state, placeNumber, removeNumber, start, endRound, nextRound, isGameOver, winner };
}

module.exports = { createGame, TOTAL_ROUNDS };
