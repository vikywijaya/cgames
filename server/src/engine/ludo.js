'use strict';

/**
 * Ludo (飞行棋) engine — server-authoritative.
 *
 * Board:
 *  - 52 shared track squares (0-51), traversed clockwise
 *  - 4 home columns of 6 squares each (0-5, where 5 = finished)
 *  - 4 bases (one per player colour)
 *
 * Each player's start is offset by 13:
 *  - Player 0 (red):    start=0,  homeEntry=50
 *  - Player 1 (blue):   start=13, homeEntry=11
 *  - Player 2 (green):  start=26, homeEntry=24
 *  - Player 3 (yellow): start=39, homeEntry=37
 *
 * Safe squares: start squares (0, 13, 26, 39) and stars (8, 21, 34, 47).
 *
 * Interface:
 *   createGame(playerCount)         → engine object
 *   engine.state()                  → full state
 *   engine.rollDice(seat)           → { ok, reason, diceValue, validMoves, autoPass }
 *   engine.moveToken(seat, tokenIndex) → { ok, reason, captured, capturedPlayer, capturedToken }
 *   engine.isGameOver()             → bool
 *   engine.winner()                 → seat number | null
 */

const TRACK_LENGTH = 52;
const TOKENS_PER_PLAYER = 4;
const HOME_LENGTH = 6; // squares 0-5 in home column
const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

function startSquare(seat) {
  return seat * 13;
}

function homeEntrySquare(seat) {
  return (seat * 13 + 50) % TRACK_LENGTH;
}

/**
 * Calculate how many track steps a token at `fromSquare` (absolute) has
 * travelled relative to its owner's start square.
 */
function trackStepsFromStart(seat, fromSquare) {
  const start = startSquare(seat);
  return (fromSquare - start + TRACK_LENGTH) % TRACK_LENGTH;
}

/**
 * Create a fresh token position in base.
 */
function baseToken() {
  return { zone: 'base', square: -1 };
}

function createGame(playerCount) {
  if (playerCount < 2 || playerCount > 4) {
    throw new Error('Ludo requires 2-4 players');
  }

  // ── state ──────────────────────────────────────────────────────────
  // tokens[seat][tokenIdx] = { zone, square }
  const tokens = [];
  for (let s = 0; s < playerCount; s++) {
    const playerTokens = [];
    for (let t = 0; t < TOKENS_PER_PLAYER; t++) {
      playerTokens.push(baseToken());
    }
    tokens.push(playerTokens);
  }

  let currentSeat = 0;
  let diceValue = null;
  let phase = 'roll'; // 'roll' | 'move'
  let consecutiveSixes = 0;
  let gameOver = false;
  let winnerSeat = null;

  // ── helpers ────────────────────────────────────────────────────────

  function isSafe(sq) {
    return SAFE_SQUARES.includes(sq);
  }

  function nextSeat(seat) {
    let next = (seat + 1) % playerCount;
    return next;
  }

  /**
   * Determine the valid token indices that can move with the current diceValue
   * for the given seat.
   */
  function computeValidMoves(seat, dice) {
    const moves = [];
    const myTokens = tokens[seat];

    for (let i = 0; i < TOKENS_PER_PLAYER; i++) {
      const tok = myTokens[i];

      if (tok.zone === 'finished') continue;

      if (tok.zone === 'base') {
        // Can only leave base on a 6
        if (dice !== 6) continue;
        const target = startSquare(seat);
        // Cannot enter if own token already occupies start square
        if (hasOwnTokenAt(seat, 'track', target)) continue;
        moves.push(i);
        continue;
      }

      if (tok.zone === 'track') {
        const stepsFromStart = trackStepsFromStart(seat, tok.square);
        const newSteps = stepsFromStart + dice;
        const homeEntry = 50; // steps from start to reach home entry

        if (newSteps <= homeEntry) {
          // Stays on track
          const dest = (startSquare(seat) + newSteps) % TRACK_LENGTH;
          // Cannot land on own token
          if (hasOwnTokenAt(seat, 'track', dest)) continue;
          moves.push(i);
        } else {
          // Enters home column
          const homeSquare = newSteps - homeEntry - 1; // 0-based home square
          if (homeSquare >= HOME_LENGTH) continue; // overshoots
          // Cannot land on own token in home
          if (hasOwnTokenAt(seat, 'home', homeSquare)) continue;
          moves.push(i);
        }
        continue;
      }

      if (tok.zone === 'home') {
        const newSq = tok.square + dice;
        if (newSq >= HOME_LENGTH) continue; // overshoots finish
        // Cannot land on own token in home
        if (hasOwnTokenAt(seat, 'home', newSq)) continue;
        moves.push(i);
        continue;
      }
    }

    return moves;
  }

  function hasOwnTokenAt(seat, zone, square) {
    return tokens[seat].some(t => t.zone === zone && t.square === square);
  }

  /**
   * Find opponent tokens occupying a track square (for capture checks).
   * Returns array of { seat, tokenIndex }.
   */
  function opponentTokensAt(mySeat, trackSquare) {
    const results = [];
    for (let s = 0; s < playerCount; s++) {
      if (s === mySeat) continue;
      for (let t = 0; t < TOKENS_PER_PLAYER; t++) {
        if (tokens[s][t].zone === 'track' && tokens[s][t].square === trackSquare) {
          results.push({ seat: s, tokenIndex: t });
        }
      }
    }
    return results;
  }

  function checkWinner(seat) {
    return tokens[seat].every(t => t.zone === 'finished');
  }

  // ── public API ─────────────────────────────────────────────────────

  function state() {
    // Deep-copy tokens to prevent mutation
    const tokensCopy = tokens.map(playerTokens =>
      playerTokens.map(t => ({ zone: t.zone, square: t.square }))
    );
    return {
      tokens: tokensCopy,
      currentSeat,
      diceValue,
      phase,
      consecutiveSixes,
      isGameOver: gameOver,
      winner: winnerSeat,
      playerCount,
      safeSquares: SAFE_SQUARES.slice(),
    };
  }

  function rollDice(seat) {
    if (gameOver) return { ok: false, reason: 'Game is over' };
    if (seat !== currentSeat) return { ok: false, reason: 'Not your turn' };
    if (phase !== 'roll') return { ok: false, reason: 'You need to move a token, not roll' };

    const value = Math.floor(Math.random() * 6) + 1;
    diceValue = value;

    // Check triple-six forfeit
    if (value === 6) {
      consecutiveSixes++;
      if (consecutiveSixes >= 3) {
        // Forfeit: advance to next player
        consecutiveSixes = 0;
        diceValue = null;
        phase = 'roll';
        currentSeat = nextSeat(currentSeat);
        return { ok: true, diceValue: value, validMoves: [], autoPass: true, reason: 'Three consecutive sixes — turn forfeited' };
      }
    }

    const valid = computeValidMoves(seat, value);

    if (valid.length === 0) {
      // No valid moves — auto-pass
      if (value === 6) {
        // Rolled a 6 but can't move: still give extra roll? No — if no moves, pass.
        // Reset sixes if passing.
      }
      consecutiveSixes = value === 6 ? consecutiveSixes : 0;
      // If we rolled a 6 with no moves, we still pass (no point staying)
      // Actually on a 6 with no valid moves, the player should still get their
      // extra turn to roll again, because the 6 grants another roll.
      // But if truly nothing can move, we should pass to avoid infinite loops.
      // Standard rule: if no move is possible, turn passes regardless.
      diceValue = null;
      phase = 'roll';
      if (value !== 6) {
        consecutiveSixes = 0;
      }
      // Even on a 6 with no moves, pass the turn
      currentSeat = nextSeat(currentSeat);
      consecutiveSixes = 0;
      return { ok: true, diceValue: value, validMoves: [], autoPass: true };
    }

    phase = 'move';
    return { ok: true, diceValue: value, validMoves: valid, autoPass: false };
  }

  function moveToken(seat, tokenIndex) {
    if (gameOver) return { ok: false, reason: 'Game is over' };
    if (seat !== currentSeat) return { ok: false, reason: 'Not your turn' };
    if (phase !== 'move') return { ok: false, reason: 'You need to roll first' };
    if (tokenIndex < 0 || tokenIndex >= TOKENS_PER_PLAYER) {
      return { ok: false, reason: 'Invalid token index' };
    }

    const valid = computeValidMoves(seat, diceValue);
    if (!valid.includes(tokenIndex)) {
      return { ok: false, reason: 'That token cannot move' };
    }

    const tok = tokens[seat][tokenIndex];
    let captured = false;
    let capturedPlayer = null;
    let capturedToken = null;

    if (tok.zone === 'base') {
      // Enter the board at start square
      const dest = startSquare(seat);
      tok.zone = 'track';
      tok.square = dest;

      // Check capture at start (start is a safe square, so no capture)
      // Safe squares prevent captures, so no capture here.
    } else if (tok.zone === 'track') {
      const stepsFromStart = trackStepsFromStart(seat, tok.square);
      const newSteps = stepsFromStart + diceValue;
      const homeEntry = 50;

      if (newSteps <= homeEntry) {
        // Stay on track
        const dest = (startSquare(seat) + newSteps) % TRACK_LENGTH;
        tok.square = dest;

        // Check for capture
        if (!isSafe(dest)) {
          const opponents = opponentTokensAt(seat, dest);
          for (const opp of opponents) {
            tokens[opp.seat][opp.tokenIndex].zone = 'base';
            tokens[opp.seat][opp.tokenIndex].square = -1;
            captured = true;
            capturedPlayer = opp.seat;
            capturedToken = opp.tokenIndex;
          }
        }
      } else {
        // Enter home column
        const homeSquare = newSteps - homeEntry - 1;
        tok.zone = homeSquare === HOME_LENGTH - 1 ? 'finished' : 'home';
        tok.square = homeSquare === HOME_LENGTH - 1 ? 5 : homeSquare;
      }
    } else if (tok.zone === 'home') {
      const newSq = tok.square + diceValue;
      if (newSq === HOME_LENGTH - 1) {
        tok.zone = 'finished';
        tok.square = 5;
      } else {
        tok.square = newSq;
      }
    }

    // Check win
    if (checkWinner(seat)) {
      gameOver = true;
      winnerSeat = seat;
      diceValue = null;
      phase = 'roll';
      return { ok: true, captured, capturedPlayer, capturedToken };
    }

    // Determine next phase
    if (diceValue === 6 && consecutiveSixes < 3) {
      // Extra turn: roll again
      phase = 'roll';
      diceValue = null;
      // currentSeat stays the same
    } else {
      // Next player
      phase = 'roll';
      diceValue = null;
      consecutiveSixes = 0;
      currentSeat = nextSeat(currentSeat);
    }

    return { ok: true, captured, capturedPlayer, capturedToken };
  }

  function isGameOver() {
    return gameOver;
  }

  function winner() {
    return winnerSeat;
  }

  return {
    state,
    rollDice,
    moveToken,
    isGameOver,
    winner,
  };
}

module.exports = { createGame };
