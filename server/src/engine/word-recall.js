'use strict';

/**
 * TV Word Recall engine — server-authoritative multiplayer, 3 rounds.
 *
 * Rules:
 *  - TV screen shows a list of words for a study period.
 *  - After study phase, words are hidden and players type them from memory.
 *  - First player to recall ALL words wins the round (3pts).
 *  - 3 rounds per session. Difficulty increases each round (easy→medium→hard).
 *  - Points: 1st=3, 2nd=2, 3rd=1.
 */

const TOTAL_ROUNDS = 3;
const ROUND_POINTS = [3, 2, 1];

const DIFFICULTY_CONFIG = {
  easy:   { count: 5,  studySeconds: 30, recallSeconds: 60 },
  medium: { count: 8,  studySeconds: 25, recallSeconds: 60 },
  hard:   { count: 12, studySeconds: 20, recallSeconds: 60 },
};

const ROUND_DIFFICULTY = ['easy', 'medium', 'hard'];

const WORD_POOLS = {
  easy: ['apple','chair','table','clock','bread','glass','towel','lamp','phone','flower','door','cup','book','keys','spoon','brush','soap','shoe','coat','hat'],
  medium: ['garden','market','bridge','camera','letter','candle','bottle','basket','mirror','window','pillow','carpet','ribbon','wallet','pencil','vessel','lantern','feather','pebble','anchor','curtain','blanket','cabinet','pitcher','hammer'],
  hard: ['freedom','harvest','journey','silence','whisper','crystal','compass','balance','texture','pattern','shelter','courage','mystery','chapter','horizon','climate','segment','mineral','current','portion','contract','venture','complex','passage','reserve'],
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createGame(playerCount = 1) {
  if (playerCount < 1 || playerCount > 8) throw new Error('Word Recall requires 1-8 players');

  let currentRound = 0;
  let phase = 'study'; // 'study' | 'recall'
  let wordList = [];    // current round's words
  let difficulty = ROUND_DIFFICULTY[0];
  let config = DIFFICULTY_CONFIG[difficulty];

  // Per-player recall state
  let recalledWords = Array.from({ length: playerCount }, () => new Set());
  let solvedOrder = []; // seats that recalled ALL words, in order

  const sessionScores = new Array(playerCount).fill(0);
  let _isRoundOver = false;
  let _isSessionOver = false;

  function generateRound() {
    difficulty = ROUND_DIFFICULTY[currentRound] || 'hard';
    config = DIFFICULTY_CONFIG[difficulty];
    const pool = WORD_POOLS[difficulty];
    wordList = shuffle(pool).slice(0, config.count);
    phase = 'study';
    recalledWords = Array.from({ length: playerCount }, () => new Set());
    solvedOrder = [];
    _isRoundOver = false;
  }

  function start() {
    generateRound();
  }

  function studyDone() {
    if (phase !== 'study') return { ok: false };
    phase = 'recall';
    return { ok: true };
  }

  function submitWord(seat, word) {
    if (phase !== 'recall') return { ok: false, result: 'notRecall' };
    if (seat < 0 || seat >= playerCount) return { ok: false, result: 'invalidSeat' };
    if (_isRoundOver) return { ok: false, result: 'roundOver' };

    const normalized = String(word).trim().toLowerCase();
    if (!normalized) return { ok: false, result: 'empty' };

    // Check if already recalled by this player
    if (recalledWords[seat].has(normalized)) {
      return { ok: true, result: 'already', recalledCount: recalledWords[seat].size, isRoundOver: false };
    }

    // Check if word is in the list
    const inList = wordList.some(w => w.toLowerCase() === normalized);
    if (!inList) {
      return { ok: true, result: 'notFound', recalledCount: recalledWords[seat].size, isRoundOver: false };
    }

    // Correct recall
    recalledWords[seat].add(normalized);
    const count = recalledWords[seat].size;
    const allRecalled = count === wordList.length;

    if (allRecalled && !solvedOrder.includes(seat)) {
      solvedOrder.push(seat);
      const pos = solvedOrder.length - 1;
      sessionScores[seat] += ROUND_POINTS[pos] || 0;

      // Check if all players have recalled all words
      const allDone = recalledWords.every(s => s.size === wordList.length);
      if (allDone) _isRoundOver = true;
    }

    return {
      ok: true,
      result: 'found',
      recalledCount: count,
      isRoundOver: _isRoundOver,
      allRecalled,
      firstFinish: solvedOrder.length === 1 && allRecalled,
    };
  }

  function endRound() {
    _isRoundOver = true;

    // Award points to players who haven't finished but have most recalls
    // (only solvedOrder players got points via submitWord; others get ranked by count)
    const unseated = [];
    for (let i = 0; i < playerCount; i++) {
      if (!solvedOrder.includes(i)) unseated.push(i);
    }
    // Sort unseated by recall count descending
    unseated.sort((a, b) => recalledWords[b].size - recalledWords[a].size);
    // Award remaining point slots
    for (const seat of unseated) {
      const pos = solvedOrder.length;
      solvedOrder.push(seat);
      if (ROUND_POINTS[pos]) sessionScores[seat] += ROUND_POINTS[pos];
    }

    if (currentRound + 1 >= TOTAL_ROUNDS) _isSessionOver = true;

    return sessionScores.map((pts, s) => ({
      seat: s,
      sessionScore: pts,
      recalledCount: recalledWords[s].size,
      totalWords: wordList.length,
      finishPos: solvedOrder.indexOf(s),
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

  function state() {
    const s = {
      gameType: 'tv-word-recall',
      difficulty,
      config: { studySeconds: config.studySeconds, recallSeconds: config.recallSeconds },
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      phase,
      wordCount: wordList.length,
      recalledWords: recalledWords.map(set => [...set]),
      recalledCounts: recalledWords.map(set => set.size),
      solvedOrder: solvedOrder.slice(),
      sessionScores: sessionScores.slice(),
      isRoundOver: _isRoundOver,
      isSessionOver: _isSessionOver,
      sessionWinnerSeat: _isSessionOver ? getSessionWinner() : null,
      playerCount,
    };
    // Only include wordList during study phase
    if (phase === 'study') {
      s.wordList = wordList.slice();
    }
    return s;
  }

  function isGameOver() { return _isSessionOver; }
  function winner() { return getSessionWinner(); }

  return { state, start, studyDone, submitWord, endRound, nextRound, isGameOver, winner };
}

module.exports = { createGame, TOTAL_ROUNDS, WORD_POOLS, DIFFICULTY_CONFIG };
