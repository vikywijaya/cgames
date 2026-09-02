'use strict';

/**
 * TV Memory Match engine — server-authoritative multiplayer, 3 rounds.
 *
 * Rules:
 *  - Cards are paired (each symbol appears twice), shuffled.
 *  - All players get the SAME card layout but independent board state.
 *  - Player flips 2 cards: if match → stay face up; if no match → flip back after 1s.
 *  - First to find all pairs wins the round (3pts), 2nd=2pts, 3rd=1pt.
 *  - 3 rounds, difficulty increases each round: easy → medium → hard.
 */

const TOTAL_ROUNDS = 3;
const ROUND_POINTS = [3, 2, 1];

const SYMBOLS = ['🌸', '🎵', '⭐', '🌙', '🍎', '🦋', '🌈', '🎈', '🐢', '🌻', '🎨', '🏡', '🌿', '🦁', '🎭', '🔔'];

const DIFFICULTY_CONFIG = {
  easy:   { cols: 4, rows: 3, pairs: 6 },
  medium: { cols: 4, rows: 4, pairs: 8 },
  hard:   { cols: 5, rows: 4, pairs: 10 },
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
  if (playerCount < 1 || playerCount > 8) throw new Error('Memory Match requires 1–8 players');
  const selectedDifficulty = DIFFICULTY_CONFIG[difficulty] ? difficulty : 'easy';

  let currentRound = 0;
  let cards = [];       // shared card symbols array
  let cols = 0;
  let rows = 0;
  let totalPairs = 0;

  // Per-player state
  let cardStates = [];  // cardStates[seat][cardIndex] = { isFlipped, isMatched }
  let firstFlip = [];   // firstFlip[seat] = cardIndex | null (first card of current pair)
  let locked = [];      // locked[seat] = true when waiting for mismatch timeout
  let matchCounts = []; // matchCounts[seat] = number of pairs found
  let solvedOrder = [];
  let finished = [];

  const sessionScores = new Array(playerCount).fill(0);
  let _isRoundOver = false;
  let _isSessionOver = false;

  // Track mismatch timeouts so we can clear them
  let mismatchTimers = [];

  // Callback for state changes (set by socketEvents)
  let _onStateChange = null;

  function generateRound() {
    const diff = selectedDifficulty;
    const config = DIFFICULTY_CONFIG[diff];
    cols = config.cols;
    rows = config.rows;
    totalPairs = config.pairs;

    // Pick symbols and create pairs
    const chosen = shuffle(SYMBOLS).slice(0, totalPairs);
    cards = shuffle([...chosen, ...chosen]);

    // Init per-player state
    cardStates = Array.from({ length: playerCount }, () =>
      cards.map(() => ({ isFlipped: false, isMatched: false }))
    );
    firstFlip = new Array(playerCount).fill(null);
    locked = new Array(playerCount).fill(false);
    matchCounts = new Array(playerCount).fill(0);
    finished = new Array(playerCount).fill(false);
    solvedOrder = [];
    _isRoundOver = false;

    // Clear any pending timers
    mismatchTimers.forEach(t => { if (t) clearTimeout(t); });
    mismatchTimers = new Array(playerCount).fill(null);
  }

  function start() {
    generateRound();
  }

  function flipCard(seat, cardIndex) {
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (_isRoundOver) return { ok: false, reason: 'Round is over' };
    if (finished[seat]) return { ok: false, reason: 'Already finished' };
    if (locked[seat]) return { ok: false, reason: 'Board locked' };
    if (cardIndex < 0 || cardIndex >= cards.length) return { ok: false, reason: 'Invalid card' };

    const cs = cardStates[seat];
    if (cs[cardIndex].isMatched) return { ok: false, reason: 'Already matched' };
    if (cs[cardIndex].isFlipped) return { ok: false, reason: 'Already flipped' };

    cs[cardIndex].isFlipped = true;

    if (firstFlip[seat] === null) {
      // First card of pair
      firstFlip[seat] = cardIndex;
      return { ok: true, action: 'flip', matchCount: matchCounts[seat], isRoundOver: false };
    }

    // Second card — check match
    const first = firstFlip[seat];
    firstFlip[seat] = null;

    if (cards[first] === cards[cardIndex]) {
      // Match!
      cs[first].isMatched = true;
      cs[cardIndex].isMatched = true;
      matchCounts[seat]++;

      // Lock briefly for match feedback (600ms)
      locked[seat] = true;
      mismatchTimers[seat] = setTimeout(() => {
        locked[seat] = false;
        mismatchTimers[seat] = null;
        if (_onStateChange) _onStateChange(seat);
      }, 600);

      const isComplete = matchCounts[seat] === totalPairs;
      if (isComplete) {
        finished[seat] = true;
        solvedOrder.push(seat);
        const pos = solvedOrder.length - 1;
        sessionScores[seat] += ROUND_POINTS[pos] || 0;

        const allDone = finished.every(f => f);
        if (allDone) _isRoundOver = true;
      }

      return { ok: true, action: 'match', matchCount: matchCounts[seat], isRoundOver: _isRoundOver, symbol: cards[first] };
    }

    // No match — lock and flip back after 1000ms
    locked[seat] = true;
    const f = first;
    const c = cardIndex;
    mismatchTimers[seat] = setTimeout(() => {
      cs[f].isFlipped = false;
      cs[c].isFlipped = false;
      locked[seat] = false;
      mismatchTimers[seat] = null;
      // Notify state change so server can broadcast
      if (_onStateChange) _onStateChange(seat);
    }, 1000);

    return { ok: true, action: 'mismatch', matchCount: matchCounts[seat], isRoundOver: false };
  }

  function endRound() {
    _isRoundOver = true;
    // Clear timers
    mismatchTimers.forEach(t => { if (t) clearTimeout(t); });
    mismatchTimers = new Array(playerCount).fill(null);

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
    const diff = selectedDifficulty;
    return {
      gameType: 'tv-memory-match',
      difficulty: diff,
      cols,
      rows,
      totalPairs,
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      cards,  // shared symbols
      cardStates: cardStates.map(cs => cs.map(c => ({ ...c }))),
      matchCounts: matchCounts.slice(),
      locked: locked.slice(),
      finished: finished.slice(),
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

  function onStateChange(cb) { _onStateChange = cb; }

  return { state, start, flipCard, endRound, nextRound, isGameOver, winner, onStateChange };
}

module.exports = { createGame, TOTAL_ROUNDS, SYMBOLS, DIFFICULTY_CONFIG };
