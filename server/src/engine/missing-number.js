'use strict';

const ROUNDS_BY_DIFFICULTY = { easy: 6, medium: 8, hard: 10 };
// Position-based: 1st=5, 2nd=3, 3rd=2, anyone else correct=1
const ROUND_POINTS = [5, 3, 2];
const FINISH_BONUS = 1;

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

function generateOptions(answer, step) {
  const candidates = new Set();
  candidates.add(answer);
  const deltas = [step, step * 2, 1, step + 1, -step, -step * 2, -1, -(step + 1), step - 1, -(step - 1)];
  for (const d of deltas) {
    if (d !== 0) candidates.add(answer + d);
    if (candidates.size >= 8) break;
  }
  candidates.delete(answer);
  const distractors = shuffle(Array.from(candidates)).slice(0, 3);
  // fallback
  let extra = 1;
  while (distractors.length < 3) {
    const v = answer + (step + extra) * (distractors.length % 2 === 0 ? 1 : -1);
    if (!candidates.has(v) && v !== answer) { distractors.push(v); candidates.add(v); }
    extra++;
  }
  const opts = shuffle([answer, ...distractors]);
  return opts;
}

function generateQuestion(difficulty) {
  let seqLen, stepMin, stepMax, startMin, startMax, descending;
  if (difficulty === 'easy') {
    seqLen = 5; stepMin = 2; stepMax = 5; startMin = 1; startMax = 10; descending = false;
  } else if (difficulty === 'medium') {
    seqLen = 6; stepMin = 2; stepMax = 10; startMin = 1; startMax = 10; descending = false;
  } else {
    seqLen = 7; stepMin = 2; stepMax = 15; startMin = -10; startMax = 10;
    descending = Math.random() < 0.4;
  }

  const step = randInt(stepMin, stepMax);
  const start = randInt(startMin, startMax);
  const values = [];
  for (let i = 0; i < seqLen; i++) {
    values.push(descending ? start - i * step : start + i * step);
  }

  // blank a middle index (not first, not last)
  const blankIdx = randInt(1, seqLen - 2);
  const answer = values[blankIdx];
  const options = generateOptions(answer, step);

  const sequence = values.map((v, i) => ({ value: i === blankIdx ? null : v, blank: i === blankIdx }));

  return { sequence, answer, options, step, descending };
}

function createGame(playerCount = 1, difficulty = 'easy') {
  const TOTAL_ROUNDS = ROUNDS_BY_DIFFICULTY[difficulty] || 8;

  let currentRound = 0;
  let phase = 'question';
  let _isRoundOver = false;
  let _isSessionOver = false;
  const sessionScores = new Array(playerCount).fill(0);
  let answers = new Array(playerCount).fill(null);
  let correct = new Array(playerCount).fill(false);
  let solvedOrder = [];
  let currentQuestion = null;

  function start() {
    currentQuestion = generateQuestion(difficulty);
  }

  function submitAnswer(seat, answerValue) {
    if (phase !== 'question') return { ok: false, reason: 'Not in question phase' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (answers[seat] !== null) return { ok: false, reason: 'Already answered' };

    answers[seat] = answerValue;
    const isCorrect = answerValue === currentQuestion.answer;
    correct[seat] = isCorrect;
    if (isCorrect) {
      solvedOrder.push(seat);
      sessionScores[seat] += ROUND_POINTS[solvedOrder.length - 1] || FINISH_BONUS;
    }

    const allAnswered = answers.every(a => a !== null);
    if (allAnswered) _isRoundOver = true;

    return { ok: true, isCorrect, isRoundOver: allAnswered, firstCorrect: isCorrect && solvedOrder.length === 1 };
  }

  function endRound() {
    _isRoundOver = true;
    if (currentRound + 1 >= TOTAL_ROUNDS) _isSessionOver = true;
    return sessionScores.map((pts, s) => ({ seat: s, sessionScore: pts, correct: correct[s] }));
  }

  function nextRound() {
    if (currentRound + 1 >= TOTAL_ROUNDS) { _isSessionOver = true; return { ok: false }; }
    currentRound++;
    answers = new Array(playerCount).fill(null);
    correct = new Array(playerCount).fill(false);
    solvedOrder = [];
    _isRoundOver = false;
    currentQuestion = generateQuestion(difficulty);
    return { ok: true };
  }

  function state() {
    return {
      gameType: 'tv-missing-number',
      difficulty,
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      phase,
      sequence: currentQuestion ? currentQuestion.sequence : null,
      answer: currentQuestion ? currentQuestion.answer : null,
      options: currentQuestion ? currentQuestion.options : null,
      questionNumber: currentRound + 1,
      totalQuestions: TOTAL_ROUNDS,
      answers: answers.slice(),
      correct: correct.slice(),
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

  return { state, start, submitAnswer, endRound, nextRound, isGameOver: () => _isSessionOver, winner };
}

module.exports = { createGame, ROUNDS_BY_DIFFICULTY };
