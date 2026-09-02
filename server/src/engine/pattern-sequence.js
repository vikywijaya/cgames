'use strict';

/**
 * Pattern Sequence engine — server-authoritative Simon-says style game.
 *
 * Rules:
 *  - 1–8 players watch a sequence of coloured pads flash on the TV.
 *  - All players get the SAME sequence and independently repeat it on their phone.
 *  - First to complete all rounds wins (3pts), 2nd=2pts, 3rd=1pt.
 *  - 3 rounds per session. Each round the sequence resets with new random pattern.
 *  - Wrong pad → player is out for that round (no points).
 *  - Round ends when all players finish/fail OR 30s after first player finishes.
 *
 * Difficulty config:
 *   easy:   startLen=2, maxLen=6,  flashMs=800
 *   medium: startLen=3, maxLen=8,  flashMs=600
 *   hard:   startLen=4, maxLen=10, flashMs=450
 *
 * 4 pads: Red(0), Blue(1), Yellow(2), Green(3)
 *
 * Interface:
 *   createGame(playerCount, difficulty)
 *   engine.start()              → generate sequence, set phase='showing'
 *   engine.showingDone()        → TV signals done, set phase='input'
 *   engine.pressPad(seat, idx)  → { ok, correct, isFinished, isFailed, isRoundOver }
 *   engine.endRound()           → { solvedOrder, pointsAwarded }
 *   engine.nextRound()          → { ok }
 *   engine.winner()             → seat index | null
 *   engine.state()              → full state object
 */

const DIFFICULTY_CONFIG = {
  easy:   { startLen: 2, maxLen: 6,  flashMs: 800 },
  medium: { startLen: 3, maxLen: 8,  flashMs: 600 },
  hard:   { startLen: 4, maxLen: 10, flashMs: 450 }
};

const GAP_MS = 200;
const TOTAL_ROUNDS = 3;
const POINTS = [3, 2, 1]; // 1st, 2nd, 3rd

function createGame(playerCount = 2, difficulty = 'medium') {
  if (playerCount < 1 || playerCount > 8) throw new Error('Pattern Sequence requires 1–8 players');
  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;

  let currentRound = 0;
  let phase = 'waiting'; // waiting | showing | input | roundover | sessionover
  let sequence = [];
  let sequenceStep = 0; // how far into the sequence we are (current target length for this sub-round)
  let playerInputs = []; // per seat: array of pad indices entered so far
  let playerFinished = []; // per seat: true if completed entire sequence
  let playerFailed = []; // per seat: true if got one wrong
  let playerMaxCompleted = []; // per seat: highest sequence length completed correctly
  let solvedOrder = []; // seats in order of completion
  let sessionScores = new Array(playerCount).fill(0);
  let _isSessionOver = false;
  let roundTimerActive = false;

  function generateSequence(len) {
    const seq = [];
    for (let i = 0; i < len; i++) {
      seq.push(Math.floor(Math.random() * 4));
    }
    return seq;
  }

  function start(skipCountdown) {
    sequence = generateSequence(config.startLen);
    sequenceStep = config.startLen;
    playerInputs = Array.from({ length: playerCount }, () => []);
    playerFinished = new Array(playerCount).fill(false);
    playerFailed = new Array(playerCount).fill(false);
    playerMaxCompleted = new Array(playerCount).fill(0);
    solvedOrder = [];
    roundTimerActive = false;
    phase = skipCountdown ? 'showing' : 'countdown';
    return state();
  }

  function beginShowing() {
    phase = 'showing';
  }

  function showingDone() {
    if (phase !== 'showing') return;
    phase = 'input';
    // Reset inputs for this sub-round showing
    for (let i = 0; i < playerCount; i++) {
      if (!playerFailed[i] && !playerFinished[i]) {
        playerInputs[i] = [];
      }
    }
  }

  function pressPad(seat, padIndex) {
    if (phase !== 'input') return { ok: false, reason: 'Not in input phase' };
    if (seat < 0 || seat >= playerCount) return { ok: false, reason: 'Invalid seat' };
    if (playerFailed[seat]) return { ok: false, reason: 'Already failed this round' };
    if (playerFinished[seat]) return { ok: false, reason: 'Already finished this round' };

    const inputIdx = playerInputs[seat].length;
    const expected = sequence[inputIdx];
    const correct = padIndex === expected;

    if (!correct) {
      playerFailed[seat] = true;
      playerInputs[seat].push(padIndex);
      const isRoundOver = checkRoundOver();

      // Check if all remaining active players already completed this sequence
      // (they were waiting for this player, who just failed)
      if (!isRoundOver && sequence.length < config.maxLen) {
        const allActiveComplete = playerInputs.every((inputs, i) =>
          playerFailed[i] || playerFinished[i] || inputs.length >= sequence.length
        );
        if (allActiveComplete) {
          sequence.push(Math.floor(Math.random() * 4));
          for (let i = 0; i < playerCount; i++) {
            if (!playerFailed[i] && !playerFinished[i]) {
              playerInputs[i] = [];
            }
          }
          phase = 'showing';
          return { ok: true, correct: false, isFailed: true, isFinished: false, isRoundOver: false, extended: true, inputProgress: 0, sequenceLength: sequence.length };
        }
      }

      return { ok: true, correct: false, isFinished: false, isFailed: true, isRoundOver, inputProgress: playerInputs[seat].length, sequenceLength: sequence.length };
    }

    playerInputs[seat].push(padIndex);

    // Check if this player completed the current sequence
    if (playerInputs[seat].length >= sequence.length) {
      // Track highest sequence length this player completed
      playerMaxCompleted[seat] = sequence.length;

      // Sequence fully matched — check if we've reached maxLen
      if (sequence.length >= config.maxLen) {
        // Player wins this round!
        playerFinished[seat] = true;
        solvedOrder.push(seat);
        if (solvedOrder.length === 1) {
          roundTimerActive = true;
        }
        const isRoundOver = checkRoundOver();
        return { ok: true, correct: true, isFinished: true, isFailed: false, isRoundOver, inputProgress: playerInputs[seat].length, sequenceLength: sequence.length };
      }

      // Check if ALL active players have completed this sequence length
      const allActiveComplete = playerInputs.every((inputs, i) =>
        playerFailed[i] || playerFinished[i] || inputs.length >= sequence.length
      );

      if (allActiveComplete) {
        // Extend sequence by 1 and start new showing phase
        sequence.push(Math.floor(Math.random() * 4));
        for (let i = 0; i < playerCount; i++) {
          if (!playerFailed[i] && !playerFinished[i]) {
            playerInputs[i] = [];
          }
        }
        phase = 'showing';
        return { ok: true, correct: true, isFinished: false, isFailed: false, isRoundOver: false, extended: true, inputProgress: 0, sequenceLength: sequence.length };
      }

      // This player is done but waiting for others
      return { ok: true, correct: true, isFinished: false, isFailed: false, isRoundOver: false, waiting: true, inputProgress: playerInputs[seat].length, sequenceLength: sequence.length };
    }

    return { ok: true, correct: true, isFinished: false, isFailed: false, isRoundOver: false, inputProgress: playerInputs[seat].length, sequenceLength: sequence.length };
  }

  function checkRoundOver() {
    // Round is over if all players are finished or failed
    const allDone = playerFinished.every(Boolean) ||
      playerFinished.every((f, i) => f || playerFailed[i]);
    return allDone;
  }

  function endRound() {
    phase = 'roundover';

    // Rank all players by progress: highest sequence completed, then finish order
    const ranked = [];
    for (let i = 0; i < playerCount; i++) {
      ranked.push({ seat: i, maxCompleted: playerMaxCompleted[i], finishOrder: solvedOrder.indexOf(i) });
    }
    ranked.sort((a, b) => {
      if (b.maxCompleted !== a.maxCompleted) return b.maxCompleted - a.maxCompleted;
      // Both reached maxLen — earlier finisher wins
      if (a.finishOrder >= 0 && b.finishOrder >= 0) return a.finishOrder - b.finishOrder;
      if (a.finishOrder >= 0) return -1;
      if (b.finishOrder >= 0) return 1;
      return 0;
    });

    const pointsAwarded = new Array(playerCount).fill(0);
    let rank = 0;
    let prevScore = -1;
    const finalOrder = [];
    for (let i = 0; i < ranked.length; i++) {
      const r = ranked[i];
      if (r.maxCompleted !== prevScore) { rank = i; prevScore = r.maxCompleted; }
      if (r.maxCompleted > 0) {
        const pts = POINTS[rank] || 0;
        pointsAwarded[r.seat] = pts;
        sessionScores[r.seat] += pts;
        finalOrder.push(r.seat);
      }
    }

    currentRound++;
    if (currentRound >= TOTAL_ROUNDS) {
      _isSessionOver = true;
      phase = 'sessionover';
    }

    return { solvedOrder: finalOrder, pointsAwarded };
  }

  function nextRound() {
    if (_isSessionOver) return { ok: false, reason: 'Session is over' };
    if (phase !== 'roundover') return { ok: false, reason: 'Round not over yet' };
    start(true); // skip countdown for subsequent rounds
    return { ok: true };
  }

  function winner() {
    if (!_isSessionOver) return null;
    let maxScore = -1;
    let winnerSeat = null;
    for (let i = 0; i < playerCount; i++) {
      if (sessionScores[i] > maxScore) {
        maxScore = sessionScores[i];
        winnerSeat = i;
      }
    }
    // Check for tie
    const tiedCount = sessionScores.filter(s => s === maxScore).length;
    if (tiedCount > 1) return null; // tie
    return winnerSeat;
  }

  function isGameOver() {
    return _isSessionOver;
  }

  function state() {
    return {
      gameType: 'tv-pattern-sequence',
      phase,
      sequence: phase === 'showing' || phase === 'input' ? sequence.slice() : [],
      sequenceLength: sequence.length,
      flashMs: config.flashMs,
      gapMs: GAP_MS,
      playerInputs: playerInputs.map(a => a.slice()),
      playerFinished: playerFinished.slice(),
      playerFailed: playerFailed.slice(),
      playerMaxCompleted: playerMaxCompleted.slice(),
      solvedOrder: solvedOrder.slice(),
      sessionScores: sessionScores.slice(),
      currentRound,
      totalRounds: TOTAL_ROUNDS,
      isSessionOver: _isSessionOver,
      roundTimerActive,
      playerCount,
      difficulty,
      startLen: config.startLen,
      maxLen: config.maxLen
    };
  }

  return { start, beginShowing, showingDone, pressPad, endRound, nextRound, winner, isGameOver, state };
}

module.exports = { createGame };
