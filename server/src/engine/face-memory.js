'use strict';

/**
 * TV Face Memory engine — server-authoritative multiplayer, 3 rounds.
 *
 * Rules:
 *  - TV shows faces with names during study phase (countdown timer).
 *  - All players memorise. Then TV shows one face at a time (recall phase).
 *  - Players pick the correct name from 4 choices on their phone.
 *  - First player to answer correctly each question gets points.
 *  - Points per round based on total correct answers (most correct = 1st place).
 *  - 3 rounds per session.
 */

const TOTAL_ROUNDS = 3;
const ROUND_POINTS = [3, 2, 1];

const ALL_FACES = [
  { id: 'face01', name: 'Mei Ling',  img: '/img/faces/face01.jpg' },
  { id: 'face02', name: 'Arthur',    img: '/img/faces/face02.jpg' },
  { id: 'face03', name: 'Grace',     img: '/img/faces/face03.jpg' },
  { id: 'face04', name: 'Raj',       img: '/img/faces/face04.jpg' },
  { id: 'face05', name: 'Eleanor',   img: '/img/faces/face05.jpg' },
  { id: 'face06', name: 'Carlos',    img: '/img/faces/face06.jpg' },
  { id: 'face07', name: 'Hiroshi',   img: '/img/faces/face07.jpg' },
  { id: 'face08', name: 'Fatimah',   img: '/img/faces/face08.jpg' },
  { id: 'face09', name: 'Samuel',    img: '/img/faces/face09.jpg' },
  { id: 'face10', name: 'Shu Fen',   img: '/img/faces/face10.jpg' },
  { id: 'face11', name: 'Patrick',   img: '/img/faces/face11.jpg' },
  { id: 'face12', name: 'Rosa',      img: '/img/faces/face12.jpg' },
  { id: 'face13', name: 'Hassan',    img: '/img/faces/face13.jpg' },
  { id: 'face14', name: 'Soo Jin',   img: '/img/faces/face14.jpg' },
  { id: 'face15', name: 'Priya',     img: '/img/faces/face15.jpg' },
  { id: 'face16', name: 'Bernard',   img: '/img/faces/face16.jpg' },
  { id: 'face17', name: 'Keisha',    img: '/img/faces/face17.jpg' },
  { id: 'face18', name: 'Carmen',    img: '/img/faces/face18.jpg' },
  { id: 'face19', name: 'Wei Ming',  img: '/img/faces/face19.jpg' },
  { id: 'face20', name: 'Margaret',  img: '/img/faces/face20.jpg' },
];

const DIFFICULTY_CONFIG = {
  easy:   { faceCount: 4, studySec: 8  },
  medium: { faceCount: 6, studySec: 10 },
  hard:   { faceCount: 8, studySec: 10 },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createGame(playerCount = 1, difficulty = 'easy') {
  if (playerCount < 1 || playerCount > 8) throw new Error('Face Memory requires 1–8 players');
  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.easy;

  let currentRound = 0;
  let phase = 'study'; // 'study' | 'recall'
  let studyFaces = []; // faces shown during study
  let questions = [];  // all questions for this round [{face, options:[name,...]}]
  let questionIndex = 0;

  // Per-player per-question answers: correctAnswers[seat] = count
  let correctAnswers = new Array(playerCount).fill(0);
  // Per-question: which player answered correctly first
  let questionWinners = [];
  // Per-player: did they answer current question already?
  let answeredThisQuestion = new Array(playerCount).fill(false);

  const sessionScores = new Array(playerCount).fill(0);
  let _isRoundOver = false;
  let _isSessionOver = false;
  let _advancePending = false;

  function buildQuestions(faces) {
    return shuffle(faces).map(face => {
      const otherNames = ALL_FACES.filter(f => f.id !== face.id).map(f => f.name);
      const distractors = shuffle(otherNames).slice(0, 3);
      const options = shuffle([face.name, ...distractors]);
      return { face, options };
    });
  }

  function generateRound() {
    studyFaces = shuffle(ALL_FACES).slice(0, config.faceCount);
    questions = buildQuestions(studyFaces);
    questionIndex = 0;
    correctAnswers = new Array(playerCount).fill(0);
    questionWinners = [];
    answeredThisQuestion = new Array(playerCount).fill(false);
    phase = 'study';
    _isRoundOver = false;
    _advancePending = false;
  }

  function start() {
    generateRound();
  }

  // Called by server after study timer expires
  function studyDone() {
    if (phase !== 'study') return { ok: false };
    phase = 'recall';
    return { ok: true };
  }

  // Player answers a face question
  function answerFace(seat, name) {
    if (phase !== 'recall') return { ok: false, reason: 'Not in recall phase' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (answeredThisQuestion[seat]) return { ok: false, reason: 'Already answered this question' };
    if (_isRoundOver) return { ok: false, reason: 'Round is over' };

    answeredThisQuestion[seat] = true;
    const correct = name === questions[questionIndex].face.name;

    if (correct) {
      correctAnswers[seat]++;
      // Record first correct answerer for this question
      if (!questionWinners[questionIndex]) {
        questionWinners[questionIndex] = seat;
      }
    }

    // Check if all players answered
    const allAnswered = answeredThisQuestion.every(Boolean);
    let advanceQuestion = false;

    if ((allAnswered || correct) && !_advancePending) {
      _advancePending = true;
      advanceQuestion = true;
    }

    return { ok: true, correct, correctName: questions[questionIndex].face.name, allAnswered, advanceQuestion };
  }

  // Advance to next question (called by server after short delay)
  function nextQuestion() {
    _advancePending = false;
    questionIndex++;
    answeredThisQuestion = new Array(playerCount).fill(false);

    if (questionIndex >= questions.length) {
      _isRoundOver = true;
      return { ok: false, roundOver: true };
    }
    return { ok: true };
  }

  function endRound() {
    _isRoundOver = true;
    if (currentRound + 1 >= TOTAL_ROUNDS) _isSessionOver = true;
    // Award session points based on correct answers count (most correct = 1st)
    // Tie-break: players with same correct count share the higher rank points
    const groups = {};
    for (let s = 0; s < playerCount; s++) {
      const c = correctAnswers[s];
      if (!groups[c]) groups[c] = [];
      groups[c].push(s);
    }
    const sortedCounts = Object.keys(groups).map(Number).sort((a, b) => b - a);
    let rank = 0;
    sortedCounts.forEach(count => {
      const seats = groups[count];
      const pts = ROUND_POINTS[rank] || 0;
      seats.forEach(s => { sessionScores[s] += pts; });
      rank += seats.length;
    });
    return sessionScores.map((pts, s) => ({
      seat: s,
      sessionScore: pts,
      correctThisRound: correctAnswers[s],
    }));
  }

  function nextRound() {
    if (currentRound + 1 >= TOTAL_ROUNDS) {
      _isSessionOver = true;
      return { ok: false, reason: 'Session complete' };
    }
    currentRound++;
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

  function currentQuestion() {
    if (questionIndex >= questions.length) return null;
    return questions[questionIndex];
  }

  function state() {
    const q = currentQuestion();
    return {
      gameType: 'tv-face-memory',
      difficulty,
      config: { faceCount: config.faceCount, studySec: config.studySec },
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      phase,
      studyFaces: studyFaces.map(f => ({ id: f.id, name: f.name, img: f.img })),
      questionIndex,
      totalQuestions: questions.length,
      currentQuestion: q ? { face: { id: q.face.id, img: q.face.img }, options: q.options } : null,
      answeredThisQuestion: answeredThisQuestion.slice(),
      correctAnswers: correctAnswers.slice(),
      sessionScores: sessionScores.slice(),
      isRoundOver: _isRoundOver,
      isSessionOver: _isSessionOver,
      sessionWinnerSeat: _isSessionOver ? getSessionWinner() : null,
      playerCount,
    };
  }

  function isGameOver() { return _isSessionOver; }
  function winner() { return getSessionWinner(); }

  return { state, start, studyDone, answerFace, nextQuestion, endRound, nextRound, isGameOver, winner };
}

module.exports = { createGame, TOTAL_ROUNDS, ALL_FACES };
