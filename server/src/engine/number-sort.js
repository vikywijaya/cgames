'use strict';

const ROUNDS_BY_DIFFICULTY = { easy: 5, medium: 7, hard: 9 };
// Position-based scoring: 1st=5, 2nd=3, 3rd=2, anyone else who finishes = 1
const ROUND_POINTS = [5, 3, 2];
const FINISH_BONUS = 1;
// Bonus for a perfect solve (zero wrong taps)
const PERFECT_BONUS = 1;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateQuestion(difficulty) {
  let count, maxVal;
  if (difficulty === 'easy') { count = 4; maxVal = 20; }
  else if (difficulty === 'medium') { count = 5; maxVal = 100; }
  else { count = 6; maxVal = 999; }

  const pool = new Set();
  while (pool.size < count) pool.add(randInt(1, maxVal));
  const numbers = Array.from(pool);
  const sortedNumbers = numbers.slice().sort((a, b) => a - b);
  const shuffled = shuffle(numbers);
  return { numbers: shuffled, sortedNumbers };
}

function createGame(playerCount = 1, difficulty = 'easy') {
  const TOTAL_ROUNDS = ROUNDS_BY_DIFFICULTY[difficulty] || 8;

  let currentRound = 0;
  let phase = 'question';
  let _isRoundOver = false;
  let _isSessionOver = false;
  const sessionScores = new Array(playerCount).fill(0);
  // For number-sort, "finished" tracks completion; solvedOrder tracks who finished first
  let finished = new Array(playerCount).fill(false);
  let solvedOrder = [];
  let taps = Array.from({ length: playerCount }, () => []);
  let resetCount = new Array(playerCount).fill(0);
  let firstFinishTime = null;
  let currentQuestion = null;

  function start() {
    currentQuestion = generateQuestion(difficulty);
  }

  function submitTap(seat, value) {
    if (phase !== 'question') return { ok: false, reason: 'Not in question phase' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (finished[seat]) return { ok: false, reason: 'Already finished' };

    const seatTaps = taps[seat];
    const expectedIdx = seatTaps.length;
    const expected = currentQuestion.sortedNumbers[expectedIdx];

    if (value !== expected) {
      // Wrong tap — count it but don't reset all progress
      resetCount[seat]++;
      const allFinished = finished.every(f => f);
      if (allFinished) _isRoundOver = true;
      return { ok: true, correct: false, reset: false, isRoundOver: allFinished };
    }

    // Correct tap
    seatTaps.push(value);

    let playerFinished = false;
    if (seatTaps.length === currentQuestion.sortedNumbers.length) {
      finished[seat] = true;
      playerFinished = true;
      solvedOrder.push(seat);
      const positionPts = ROUND_POINTS[solvedOrder.length - 1] || FINISH_BONUS;
      const perfectPts = resetCount[seat] === 0 ? PERFECT_BONUS : 0;
      sessionScores[seat] += positionPts + perfectPts;
      if (firstFinishTime === null) firstFinishTime = Date.now();
    }

    const allFinished = finished.every(f => f);
    if (allFinished) _isRoundOver = true;

    return { ok: true, correct: true, reset: false, playerFinished, isRoundOver: allFinished, firstCorrect: playerFinished && solvedOrder.length === 1 };
  }

  // submitAnswer alias for compatibility — not used for this game (use submitTap)
  function submitAnswer(seat, answerValue) {
    return submitTap(seat, answerValue);
  }

  function endRound() {
    _isRoundOver = true;
    if (currentRound + 1 >= TOTAL_ROUNDS) _isSessionOver = true;
    return sessionScores.map((pts, s) => ({ seat: s, sessionScore: pts, finished: finished[s] }));
  }

  function nextRound() {
    if (currentRound + 1 >= TOTAL_ROUNDS) { _isSessionOver = true; return { ok: false }; }
    currentRound++;
    finished = new Array(playerCount).fill(false);
    solvedOrder = [];
    taps = Array.from({ length: playerCount }, () => []);
    resetCount = new Array(playerCount).fill(0);
    firstFinishTime = null;
    _isRoundOver = false;
    currentQuestion = generateQuestion(difficulty);
    return { ok: true };
  }

  function state() {
    return {
      gameType: 'tv-number-sort',
      difficulty,
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      phase,
      numbers: currentQuestion ? currentQuestion.numbers : null,
      sortedNumbers: currentQuestion ? currentQuestion.sortedNumbers : null,
      taps: taps.map(t => t.slice()),
      finished: finished.slice(),
      resetCount: resetCount.slice(),
      firstFinishTime,
      questionNumber: currentRound + 1,
      totalQuestions: TOTAL_ROUNDS,
      solvedOrder: solvedOrder.slice(),
      sessionScores: sessionScores.slice(),
      isRoundOver: _isRoundOver,
      isSessionOver: _isSessionOver,
      playerCount,
    };
  }

  function winner() {
    let best = -1, bestSeat = null;
    for (let i = 0; i < playerCount; i++) {
      if (sessionScores[i] > best) { best = sessionScores[i]; bestSeat = i; }
    }
    return bestSeat;
  }

  return { state, start, submitAnswer, submitTap, endRound, nextRound, isGameOver: () => _isSessionOver, winner };
}

module.exports = { createGame, ROUNDS_BY_DIFFICULTY };
