'use strict';

/**
 * TV Speed Tap engine — server-authoritative multiplayer, 3 session rounds.
 *
 * Rules:
 *  - TV shows a target emoji; all players get the SAME grid on their phones.
 *  - Players race to tap the correct target emoji from a grid of distractors.
 *  - Correct tap → +1 score. Wrong tap or timeout → no score.
 *  - One tap per question per player.
 *  - 3 session rounds: easy (10 Qs), medium (14 Qs), hard (18 Qs).
 *  - Session scoring: most correct in a round = 1st = 3pts, 2nd = 2pts, 3rd = 1pt.
 *
 * Interface:
 *   createGame(playerCount)
 *   engine.start()               → generates first question
 *   engine.nextQuestion()        → advance to next question
 *   engine.tapItem(seat, emoji)  → player taps an emoji
 *   engine.endRound()            → finalize current round
 *   engine.nextRound()           → advance to next session round
 *   engine.state()               → full state
 *   engine.isGameOver()          → bool
 *   engine.winner()              → seat index | null
 */

const TOTAL_ROUNDS = 3;
const ROUND_POINTS = [3, 2, 1];

const TARGETS = ['⭐', '🌟', '💎', '🎯'];
const DISTRACTORS = ['🍎', '🐶', '🌸', '🚗', '🎈', '🏠', '🐱', '🌈', '🎵', '🍦'];

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 10, showMs: 3000, gridSize: 6, distractors: 3 },
  medium: { rounds: 12, showMs: 2200, gridSize: 9, distractors: 4 },
  hard:   { rounds: 14, showMs: 1500, gridSize: 12, distractors: 5 },
};

const ROUND_DIFFICULTY = ['easy', 'medium', 'hard'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createGame(playerCount = 1, difficulty = 'easy') {
  if (playerCount < 1 || playerCount > 8) throw new Error('Speed Tap requires 1–8 players');
  const selectedDifficulty = DIFFICULTY_CONFIG[difficulty] ? difficulty : 'easy';

  let currentRound = 0;
  let questionIndex = -1;
  let totalQuestions = 0;
  let currentQuestion = null; // { target, grid, gridSize }
  let questionPhase = 'idle'; // 'buildup' → 'answering' → 'idle'
  let showMs = 4000;

  // Per-player state for current round
  let playerScores = [];    // correct count per seat for current round
  let playerAnswered = [];  // bool per seat for current question

  const sessionScores = new Array(playerCount).fill(0);
  let _isRoundOver = false;
  let _isSessionOver = false;

  function getDiffConfig() {
    const diff = ROUND_DIFFICULTY[currentRound % ROUND_DIFFICULTY.length];
    return { diff, config: DIFFICULTY_CONFIG[diff] };
  }

  function generateQuestion() {
    const { config } = getDiffConfig();
    const { gridSize, distractors: distCount } = config;

    // Pick random target
    const target = TARGETS[Math.floor(Math.random() * TARGETS.length)];

    // Pick unique distractors (not including target)
    const availDistractors = shuffle(DISTRACTORS).slice(0, distCount);

    // Build grid: gridSize cells total, 1 target + rest filled with distractors
    const grid = new Array(gridSize);
    const targetPos = Math.floor(Math.random() * gridSize);

    for (let i = 0; i < gridSize; i++) {
      if (i === targetPos) {
        grid[i] = target;
      } else {
        // Pick a random distractor from the available set
        grid[i] = availDistractors[Math.floor(Math.random() * availDistractors.length)];
      }
    }

    currentQuestion = { target, grid, gridSize };
    playerAnswered = new Array(playerCount).fill(false);
    questionPhase = 'buildup';
  }

  function revealTarget() {
    questionPhase = 'answering';
  }

  function setupRound() {
    const { config } = getDiffConfig();
    totalQuestions = config.rounds;
    showMs = config.showMs;
    questionIndex = -1;
    playerScores = new Array(playerCount).fill(0);
    playerAnswered = new Array(playerCount).fill(false);
    currentQuestion = null;
    _isRoundOver = false;
  }

  function start() {
    setupRound();
    questionPhase = 'countdown';
  }

  function startFirstQuestion() {
    questionIndex = 0;
    generateQuestion();
  }

  function nextQuestion() {
    if (_isRoundOver || _isSessionOver) return { ok: false, reason: 'Round/session is over' };

    questionIndex++;
    if (questionIndex >= totalQuestions) {
      _isRoundOver = true;
      return { ok: true, question: null, questionIndex, totalQuestions, isRoundOver: true };
    }

    generateQuestion();
    return {
      ok: true,
      question: { target: currentQuestion.target, grid: currentQuestion.grid, gridSize: currentQuestion.gridSize },
      questionIndex,
      totalQuestions,
      isRoundOver: false,
    };
  }

  function tapItem(seat, emoji) {
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (_isRoundOver || _isSessionOver) return { ok: false, reason: 'Round is over' };
    if (questionPhase !== 'answering') return { ok: false, reason: 'Not answering yet' };
    if (!currentQuestion) return { ok: false, reason: 'No active question' };
    if (playerAnswered[seat]) return { ok: false, reason: 'Already answered' };

    playerAnswered[seat] = true;
    const correct = emoji === currentQuestion.target;
    if (correct) playerScores[seat]++;

    const allAnswered = playerAnswered.every(Boolean);

    return { ok: true, correct, score: playerScores[seat], allAnswered };
  }

  function endRound() {
    _isRoundOver = true;

    // Rank players by score for this round, award session points
    const ranked = playerScores
      .map((score, seat) => ({ seat, score }))
      .sort((a, b) => b.score - a.score);

    const solvedOrder = [];
    const pointsAwarded = new Array(playerCount).fill(0);
    let rank = 0;
    let prevScore = -1;

    for (let i = 0; i < ranked.length; i++) {
      if (ranked[i].score !== prevScore) {
        rank = i;
        prevScore = ranked[i].score;
      }
      if (ranked[i].score > 0) {
        solvedOrder.push(ranked[i].seat);
        const pts = ROUND_POINTS[rank] || 0;
        pointsAwarded[ranked[i].seat] = pts;
        sessionScores[ranked[i].seat] += pts;
      }
    }

    if (currentRound + 1 >= TOTAL_ROUNDS) _isSessionOver = true;

    return { solvedOrder, pointsAwarded, playerScores: playerScores.slice() };
  }

  function nextRound() {
    if (currentRound + 1 >= TOTAL_ROUNDS) {
      _isSessionOver = true;
      return { ok: false, reason: 'Session complete' };
    }
    currentRound++;
    setupRound();
    questionIndex = 0;
    generateQuestion();
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
    const { diff } = getDiffConfig();
    return {
      gameType: 'tv-speed-tap',
      difficulty: diff,
      showMs,
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      currentQuestion,
      questionIndex,
      totalQuestions,
      playerScores: playerScores.slice(),
      playerAnswered: playerAnswered.slice(),
      sessionScores: sessionScores.slice(),
      isRoundOver: _isRoundOver,
      isSessionOver: _isSessionOver,
      sessionWinnerSeat: _isSessionOver ? getSessionWinner() : null,
      playerCount,
      questionPhase,
    };
  }

  function isGameOver() { return _isSessionOver; }
  function winner() { return getSessionWinner(); }

  return { state, start, startFirstQuestion, nextQuestion, revealTarget, tapItem, endRound, nextRound, isGameOver, winner };
}

module.exports = { createGame, TOTAL_ROUNDS, TARGETS, DISTRACTORS, DIFFICULTY_CONFIG };
