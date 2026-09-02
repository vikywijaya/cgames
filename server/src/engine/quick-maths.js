'use strict';

const ROUNDS_BY_DIFFICULTY = { easy: 10, medium: 14, hard: 18 };
const ROUND_POINTS = [3, 2, 1];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateOptions(correct) {
  const offsets = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
  const candidates = [];
  for (const o of offsets) {
    const v = correct + o;
    if (v >= 0 && v !== correct) candidates.push(v);
  }
  // shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const distractors = [];
  const seen = new Set([correct]);
  for (const c of candidates) {
    if (!seen.has(c)) { seen.add(c); distractors.push(c); }
    if (distractors.length === 3) break;
  }
  let extra = 1;
  while (distractors.length < 3) {
    const v = correct + extra * 6;
    if (!seen.has(v)) { seen.add(v); distractors.push(v); }
    extra++;
  }
  const opts = [correct, ...distractors];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

function generateQuestion(difficulty) {
  const ops = difficulty === 'easy' ? ['+'] : difficulty === 'medium' ? ['+', '-'] : ['+', '-', '×'];
  const op = ops[randInt(0, ops.length - 1)];
  let a, b, answer;
  if (difficulty === 'easy') {
    a = randInt(1, 10); b = randInt(1, 10);
  } else if (difficulty === 'medium') {
    a = randInt(1, 20); b = randInt(1, 20);
    if (op === '-' && b > a) { const tmp = a; a = b; b = tmp; }
  } else {
    a = randInt(1, 12); b = randInt(1, 12);
  }
  if (op === '+') answer = a + b;
  else if (op === '-') { if (b > a) { const tmp = a; a = b; b = tmp; } answer = a - b; }
  else answer = a * b;
  const options = generateOptions(answer);
  return { a, op, b, answer, options };
}

function createGame(playerCount = 1, difficulty = 'easy') {
  const TOTAL_ROUNDS = ROUNDS_BY_DIFFICULTY[difficulty] || 10;

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
      sessionScores[seat] += ROUND_POINTS[solvedOrder.length - 1] || 0;
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
      gameType: 'tv-quick-maths',
      difficulty,
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      phase,
      question: currentQuestion ? {
        a: currentQuestion.a,
        op: currentQuestion.op,
        b: currentQuestion.b,
        answer: currentQuestion.answer,
        options: currentQuestion.options,
      } : null,
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
