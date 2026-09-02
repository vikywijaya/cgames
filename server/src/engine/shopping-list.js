'use strict';

/**
 * TV Shopping List engine — server-authoritative multiplayer, 3 rounds.
 *
 * Rules:
 *  - TV shows a shopping list (emoji + name) for a study period.
 *  - Players memorise the list, then pick correct items from a larger set.
 *  - Scoring: roundScore = max(0, correct - wrong - missed).
 *  - Multiplayer ranking: 1st=3pts, 2nd=2pts, 3rd=1pt. Ties share higher rank.
 *  - 3 rounds, escalating difficulty: easy → medium → hard.
 */

const TOTAL_ROUNDS = 3;
const ROUND_POINTS = [3, 2, 1];

const ROUND_DIFFICULTIES = ['easy', 'medium', 'hard'];

const DIFFICULTY_CONFIG = {
  easy:   { listSize: 5,  choicesSize: 8,  studySec: 10 },
  medium: { listSize: 8,  choicesSize: 12, studySec: 12 },
  hard:   { listSize: 11, choicesSize: 16, studySec: 12 },
};

const ALL_ITEMS = [
  { emoji: '🍎', name: 'Apples' },
  { emoji: '🍞', name: 'Bread' },
  { emoji: '🥛', name: 'Milk' },
  { emoji: '🧀', name: 'Cheese' },
  { emoji: '🥚', name: 'Eggs' },
  { emoji: '🍗', name: 'Chicken' },
  { emoji: '🥦', name: 'Broccoli' },
  { emoji: '🍅', name: 'Tomatoes' },
  { emoji: '🫙', name: 'Jam' },
  { emoji: '🍋', name: 'Lemons' },
  { emoji: '🧅', name: 'Onions' },
  { emoji: '🥕', name: 'Carrots' },
  { emoji: '🧈', name: 'Butter' },
  { emoji: '🫒', name: 'Olives' },
  { emoji: '🍇', name: 'Grapes' },
  { emoji: '🥩', name: 'Beef' },
  { emoji: '🍓', name: 'Strawberries' },
  { emoji: '🫐', name: 'Blueberries' },
  { emoji: '🥑', name: 'Avocado' },
  { emoji: '🥬', name: 'Lettuce' },
  { emoji: '🍊', name: 'Oranges' },
  { emoji: '🥜', name: 'Peanuts' },
  { emoji: '🍕', name: 'Pizza' },
  { emoji: '🧃', name: 'Juice' },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createGame(playerCount = 1, difficulty = 'easy') {
  if (playerCount < 1 || playerCount > 8) throw new Error('Shopping List requires 1–8 players');
  const selectedDifficulty = DIFFICULTY_CONFIG[difficulty] ? difficulty : 'easy';

  let currentRound = 0;
  let phase = 'study'; // 'study' | 'recall' | 'results'
  let shoppingList = [];   // items on the list
  let listNames = new Set();
  let choices = [];        // all choices (list + distractors), shuffled
  let config = DIFFICULTY_CONFIG.easy;

  // Per-player state
  let playerTicks = Array.from({ length: playerCount }, () => new Set());
  let playerSubmitted = new Array(playerCount).fill(false);
  let playerResults = Array.from({ length: playerCount }, () => null);
  let firstSubmitTime = null;
  let submitTimer = null;

  const sessionScores = new Array(playerCount).fill(0);
  let _isRoundOver = false;
  let _isSessionOver = false;

  function buildRound() {
    const diff = selectedDifficulty;
    config = DIFFICULTY_CONFIG[diff];

    const shuffled = shuffle(ALL_ITEMS);
    shoppingList = shuffled.slice(0, config.listSize);
    listNames = new Set(shoppingList.map(i => i.name));

    const distractors = shuffled.slice(config.listSize, config.choicesSize);
    choices = shuffle([...shoppingList, ...distractors]);

    phase = 'study';
    playerTicks = Array.from({ length: playerCount }, () => new Set());
    playerSubmitted = new Array(playerCount).fill(false);
    playerResults = Array.from({ length: playerCount }, () => null);
    firstSubmitTime = null;
    _isRoundOver = false;
  }

  function start() {
    buildRound();
  }

  function studyDone() {
    if (phase !== 'study') return { ok: false };
    phase = 'recall';
    return { ok: true };
  }

  function toggleItem(seat, itemName) {
    if (phase !== 'recall') return { ok: false, reason: 'Not in recall phase' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (playerSubmitted[seat]) return { ok: false, reason: 'Already submitted' };

    const ticked = playerTicks[seat].has(itemName);
    if (ticked) {
      playerTicks[seat].delete(itemName);
    } else {
      playerTicks[seat].add(itemName);
    }
    return { ok: true, ticked: !ticked };
  }

  function submitAnswer(seat) {
    if (phase !== 'recall') return { ok: false, reason: 'Not in recall phase' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (playerSubmitted[seat]) return { ok: false, reason: 'Already submitted' };

    playerSubmitted[seat] = true;

    const ticked = playerTicks[seat];
    let correct = 0, wrong = 0, missed = 0;

    for (const name of ticked) {
      if (listNames.has(name)) correct++;
      else wrong++;
    }
    for (const name of listNames) {
      if (!ticked.has(name)) missed++;
    }

    const roundScore = Math.max(0, correct - wrong - missed);

    playerResults[seat] = { correct, wrong, missed, roundScore };

    const allSubmitted = playerSubmitted.every(Boolean);

    return { ok: true, correct, wrong, missed, roundScore, isRoundOver: allSubmitted };
  }

  function endRound() {
    _isRoundOver = true;
    phase = 'results';

    // Rank players by roundScore descending
    const scores = playerResults.map((r, i) => ({
      seat: i,
      roundScore: r ? r.roundScore : 0,
    }));
    scores.sort((a, b) => b.roundScore - a.roundScore);

    // Assign points with tie handling
    let rank = 0;
    for (let i = 0; i < scores.length; i++) {
      if (i > 0 && scores[i].roundScore < scores[i - 1].roundScore) {
        rank = i;
      }
      const pts = ROUND_POINTS[rank] || 0;
      sessionScores[scores[i].seat] += pts;
    }

    if (currentRound + 1 >= TOTAL_ROUNDS) _isSessionOver = true;

    return playerResults.map((r, s) => ({
      seat: s,
      ...r,
      sessionScore: sessionScores[s],
    }));
  }

  function nextRound() {
    if (currentRound + 1 >= TOTAL_ROUNDS) {
      _isSessionOver = true;
      return { ok: false, reason: 'Session complete' };
    }
    currentRound++;
    buildRound();
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
    const diff = selectedDifficulty;
    const s = {
      gameType: 'tv-shopping-list',
      difficulty: diff,
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      phase,
      studySec: config.studySec,
      listSize: config.listSize,
      choices: choices.map(c => ({ emoji: c.emoji, name: c.name })),
      playerTicks: playerTicks.map(t => [...t]),
      playerSubmitted: playerSubmitted.slice(),
      playerResults: playerResults.slice(),
      sessionScores: sessionScores.slice(),
      isRoundOver: _isRoundOver,
      isSessionOver: _isSessionOver,
      sessionWinnerSeat: _isSessionOver ? getSessionWinner() : null,
      playerCount,
    };
    // During study, include the shopping list. During recall, do NOT.
    if (phase === 'study') {
      s.shoppingList = shoppingList.map(i => ({ emoji: i.emoji, name: i.name }));
    }
    return s;
  }

  function isGameOver() { return _isSessionOver; }
  function winner() { return getSessionWinner(); }

  return { state, start, studyDone, toggleItem, submitAnswer, endRound, nextRound, isGameOver, winner };
}

module.exports = { createGame, TOTAL_ROUNDS, ALL_ITEMS };
