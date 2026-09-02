'use strict';

/**
 * TV Stroop Colour engine — server-authoritative multiplayer, 3 session rounds.
 *
 * Classic Stroop effect: a colour word is shown in a different ink colour.
 * Player must tap the INK colour (not the word).
 *
 * 3 session rounds with increasing difficulty: easy → medium → hard.
 * Scoring: most correct taps = 1st = 3pts, 2nd = 2pts, 3rd = 1pt.
 */

const TOTAL_ROUNDS = 1;
const ROUND_POINTS = [3, 2, 1];

const COLOURS = [
  { name: 'Red',    hex: '#f87171' },
  { name: 'Blue',   hex: '#60a5fa' },
  { name: 'Green',  hex: '#4ade80' },
  { name: 'Yellow', hex: '#fbbf24' },
  { name: 'Purple', hex: '#c084fc' },
  { name: 'Orange', hex: '#fb923c' },
];

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 10, timerMs: 10000, congruentChance: 0.3 },
  medium: { rounds: 14, timerMs: 8000,  congruentChance: 0.15 },
  hard:   { rounds: 18, timerMs: 6000,  congruentChance: 0 },
};

const ROUND_DIFFICULTY = ['medium'];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeStimulus(config) {
  // 1. Pick random ink colour
  const inkIdx = Math.floor(Math.random() * COLOURS.length);
  const inkColour = COLOURS[inkIdx];

  // 2. Decide word — mostly incongruent (classic Stroop effect)
  let wordColour;
  if (Math.random() < (config.congruentChance || 0)) {
    // Congruent: word matches ink (rare, used to keep player guessing)
    wordColour = inkColour;
  } else {
    // Incongruent: word is a DIFFERENT colour name (the Stroop challenge)
    const others = COLOURS.filter((_, i) => i !== inkIdx);
    wordColour = others[Math.floor(Math.random() * others.length)];
  }

  // 3. Build 4 options: ink colour + 3 random others (shuffled)
  const otherColours = shuffle(COLOURS.filter(c => c.name !== inkColour.name));
  const options = shuffle([inkColour, ...otherColours.slice(0, 3)]);

  return {
    word: wordColour.name,
    inkHex: inkColour.hex,
    inkName: inkColour.name,
    options: options.map(c => ({ name: c.name, hex: c.hex })),
  };
}

function createGame(playerCount = 1, selectedDiff = 'easy') {
  if (playerCount < 1 || playerCount > 8) throw new Error('Stroop Colour requires 1–8 players');
  const selectedDifficulty = DIFFICULTY_CONFIG[selectedDiff] ? selectedDiff : 'easy';

  let currentRound = 0;
  let phase = 'waiting';
  let difficulty = selectedDifficulty;
  let config = DIFFICULTY_CONFIG[difficulty];

  let questionIndex = 0;
  let totalQuestions = config.rounds;
  let stimulus = null;

  // Per-player state for current round
  let playerScores = new Array(playerCount).fill(0);     // correct count this round
  let playerAnswered = new Array(playerCount).fill(false); // answered current stimulus?

  // Session scores across all rounds
  const sessionScores = new Array(playerCount).fill(0);

  function start() {
    // Escalate difficulty each round: easy → medium → hard
    difficulty = ROUND_DIFFICULTY[currentRound % ROUND_DIFFICULTY.length];
    config = DIFFICULTY_CONFIG[difficulty];
    totalQuestions = config.rounds;
    questionIndex = 0;
    playerScores = new Array(playerCount).fill(0);
    playerAnswered = new Array(playerCount).fill(false);
    stimulus = makeStimulus(config);
    phase = 'playing';
  }

  function answerColour(seat, colourName) {
    if (phase !== 'playing') return { ok: false, reason: 'Not in playing phase' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (playerAnswered[seat]) return { ok: false, reason: 'Already answered' };

    playerAnswered[seat] = true;
    const correct = colourName === stimulus.inkName;
    if (correct) playerScores[seat]++;

    const allAnswered = playerAnswered.every(Boolean);

    return { ok: true, correct, score: playerScores[seat], allAnswered };
  }

  function nextStimulus() {
    questionIndex++;
    if (questionIndex >= totalQuestions) {
      phase = 'round_over';
      return { ok: true, stimulus: null, questionIndex, totalQuestions, isRoundOver: true };
    }

    playerAnswered = new Array(playerCount).fill(false);
    stimulus = makeStimulus(config);
    phase = 'playing';

    return {
      ok: true,
      stimulus: { word: stimulus.word, inkHex: stimulus.inkHex, inkName: stimulus.inkName, options: stimulus.options },
      questionIndex,
      totalQuestions,
      isRoundOver: false,
    };
  }

  function endRound() {
    // Mark game over if this was the last round
    if (currentRound + 1 >= TOTAL_ROUNDS) {
      phase = 'game_over';
    } else {
      phase = 'round_over';
    }
    // Award session points based on rank this round
    const ranked = playerScores
      .map((score, seat) => ({ seat, score }))
      .sort((a, b) => b.score - a.score);

    let rank = 0;
    let prevScore = -1;
    ranked.forEach((entry, idx) => {
      if (entry.score !== prevScore) { rank = idx; prevScore = entry.score; }
      sessionScores[entry.seat] += ROUND_POINTS[rank] || 0;
    });

    return playerScores.map((score, seat) => ({
      seat,
      roundScore: score,
      sessionScore: sessionScores[seat],
    }));
  }

  function nextRound() {
    if (currentRound + 1 >= TOTAL_ROUNDS) {
      phase = 'game_over';
      return { ok: false, reason: 'Session complete' };
    }
    currentRound++;
    start();
    return { ok: true };
  }

  function getSessionWinner() {
    let best = -1, bestSeat = null;
    for (let i = 0; i < playerCount; i++) {
      if (sessionScores[i] > best) { best = sessionScores[i]; bestSeat = i; }
    }
    return bestSeat;
  }

  function winner() { return getSessionWinner(); }
  function isGameOver() { return phase === 'game_over'; }

  function state() {
    return {
      gameType: 'tv-stroop-colour',
      phase,
      difficulty,
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      stimulus: stimulus ? {
        word: stimulus.word,
        inkHex: stimulus.inkHex,
        inkName: stimulus.inkName,
        options: stimulus.options,
      } : null,
      questionIndex,
      totalQuestions,
      playerScores: playerScores.slice(),
      playerAnswered: playerAnswered.slice(),
      sessionScores: sessionScores.slice(),
      isRoundOver: phase === 'round_over',
      isGameOver: phase === 'game_over',
      sessionWinnerSeat: phase === 'game_over' ? getSessionWinner() : null,
      playerCount,
      timerMs: config.timerMs,
    };
  }

  return { state, start, answerColour, nextStimulus, endRound, nextRound, isGameOver, winner };
}

module.exports = { createGame, TOTAL_ROUNDS, COLOURS, DIFFICULTY_CONFIG };
