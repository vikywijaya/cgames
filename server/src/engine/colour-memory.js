'use strict';

/**
 * TV Colour Memory engine — server-authoritative multiplayer, 3 rounds.
 *
 * Rules:
 *  - TV screen shows a colour sequence flashing one at a time.
 *  - All players watch the TV (phone shows "watch the TV").
 *  - After sequence finishes, all players tap the sequence on their phone.
 *  - First player to tap the full sequence correctly wins the round (3pts).
 *  - 3 rounds per session. Sequence grows by 1 each round.
 *  - Points: 1st=3, 2nd=2, 3rd=1.
 */

const TOTAL_ROUNDS = 3;
const ROUND_POINTS = [3, 2, 1];

// 6 colours matching the original game
const COLOURS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

const DIFFICULTY_CONFIG = {
  easy:   { startLen: 3, maxLen: 5,  flashMs: 600, gapMs: 300 },
  medium: { startLen: 4, maxLen: 7,  flashMs: 500, gapMs: 250 },
  hard:   { startLen: 5, maxLen: 9,  flashMs: 380, gapMs: 200 },
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateSequence(length) {
  return Array.from({ length }, () => randInt(0, COLOURS.length - 1));
}

function createGame(playerCount = 1, difficulty = 'easy') {
  if (playerCount < 1 || playerCount > 8) throw new Error('Colour Memory requires 1–8 players');
  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;

  let currentRound = 0;
  let phase = 'showing'; // 'showing' | 'recall'
  let sequence = [];
  let sequenceLength = config.startLen;

  // Per-player recall state
  let taps = Array.from({ length: playerCount }, () => []); // taps[seat] = [colorIdx,...]
  let finished = new Array(playerCount).fill(false);
  let failed = new Array(playerCount).fill(false); // tapped wrong
  let solvedOrder = []; // seats in finish order

  const sessionScores = new Array(playerCount).fill(0);
  let _isRoundOver = false;
  let _isSessionOver = false;

  function generateRound() {
    const len = Math.min(sequenceLength, config.maxLen);
    sequence = generateSequence(len);
    phase = 'showing';
    taps = Array.from({ length: playerCount }, () => []);
    finished = new Array(playerCount).fill(false);
    failed = new Array(playerCount).fill(false);
    solvedOrder = [];
    _isRoundOver = false;
  }

  function start() {
    generateRound();
  }

  // Called by server after TV display has finished showing the sequence
  function revealDone() {
    if (phase !== 'showing') return { ok: false };
    phase = 'recall';
    return { ok: true };
  }

  // Player taps a colour
  function tapColour(seat, colourIndex) {
    if (phase !== 'recall') return { ok: false, reason: 'Not in recall phase' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (finished[seat] || failed[seat]) return { ok: false, reason: 'Already done' };
    if (_isRoundOver) return { ok: false, reason: 'Round is over' };

    const pos = taps[seat].length;
    if (pos >= sequence.length) return { ok: false, reason: 'Already tapped all' };

    const expected = sequence[pos];
    const correct = colourIndex === expected;

    if (!correct) {
      failed[seat] = true;
      const allDone = finished.every((f, i) => f || failed[i]);
      if (allDone) _isRoundOver = true;
      return { ok: true, correct: false, isFinished: false, isRoundOver: allDone, firstFinish: false };
    }

    taps[seat].push(colourIndex);

    const isFinished = taps[seat].length === sequence.length;
    let isRoundOver = false;

    if (isFinished) {
      finished[seat] = true;
      solvedOrder.push(seat);
      const pos2 = solvedOrder.length - 1;
      sessionScores[seat] += ROUND_POINTS[pos2] || 0;

      // Round ends when all players are done (finished or failed)
      const allDone = finished.every((f, i) => f || failed[i]);
      if (allDone) {
        _isRoundOver = true;
        isRoundOver = true;
      }
    }

    return { ok: true, correct: true, isFinished, isRoundOver, firstFinish: solvedOrder.length === 1 && isFinished };
  }

  function endRound() {
    _isRoundOver = true;
    if (currentRound + 1 >= TOTAL_ROUNDS) _isSessionOver = true;
    return sessionScores.map((pts, s) => ({
      seat: s,
      sessionScore: pts,
      finishedThisRound: finished[s],
      finishPos: solvedOrder.indexOf(s),
    }));
  }

  function nextRound() {
    if (currentRound + 1 >= TOTAL_ROUNDS) {
      _isSessionOver = true;
      return { ok: false, reason: 'Session complete' };
    }
    currentRound++;
    sequenceLength = Math.min(config.startLen + currentRound, config.maxLen);
    generateRound();
    return { ok: true };
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
      gameType: 'tv-colour-memory',
      difficulty,
      config: { flashMs: config.flashMs, gapMs: config.gapMs },
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      phase,
      sequence,
      sequenceLength: sequence.length,
      taps: taps.map(t => [...t]),
      finished: finished.slice(),
      failed: failed.slice(),
      solvedOrder: solvedOrder.slice(),
      sessionScores: sessionScores.slice(),
      isRoundOver: _isRoundOver,
      isSessionOver: _isSessionOver,
      sessionWinnerSeat: _isSessionOver ? getSessionWinner() : null,
      playerCount,
    };
  }

  function isGameOver() { return _isSessionOver; }
  function winner() { return getSessionWinner(); }

  return { state, start, revealDone, tapColour, endRound, nextRound, isGameOver, winner };
}

module.exports = { createGame, TOTAL_ROUNDS, COLOURS };
