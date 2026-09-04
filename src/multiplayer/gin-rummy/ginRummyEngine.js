/**
 * Gin Rummy — 2-player card game engine.
 * Standard 52-card deck, 10 cards each.
 *
 * Card ID scheme (same as chordaidi.js):
 *   id = rankIndex * 4 + suitIndex
 *   RANKS: A,2,3,4,5,6,7,8,9,10,J,Q,K  (indices 0-12)
 *   SUITS: D,C,H,S                       (indices 0-3)
 *
 * Card values for deadwood:
 *   A=1, 2=2, 3=3, ... 10=10, J=10, Q=10, K=10
 *
 * Melds:
 *   - Sets:  3 or 4 cards of the same rank
 *   - Runs:  3+ consecutive cards of the same suit (A-2-3 ok, K-A-2 NOT ok)
 *
 * Phases: 'draw' | 'discard' | 'knock_response' | 'over'
 *
 * Turn flow:
 *   1. Draw a card (from draw pile or discard pile)
 *   2. Discard a card — OR knock (if deadwood <= 10)
 *
 * Knocking:
 *   - Player declares melds; unmatched cards are deadwood
 *   - If deadwood == 0, it's "gin" (25 bonus, no layoffs allowed)
 *   - Opponent may lay off cards onto knocker's melds (unless gin)
 *   - Compare deadwood: knocker less → knocker wins (diff points)
 *     Opponent equal or less → undercut (opponent wins diff + 25 bonus)
 *
 * Interface:
 *   createGame() -> {
 *     state()                      — full serialisable state
 *     draw(seat, source)           — source: 'draw' | 'discard'
 *     discard(seat, cardId)        — discard a card
 *     knock(seat, meldGroups, discardId) — knock: discard one card, declare melds from remaining 10
 *     layoff(seat, cardId, meldIndex) — lay off onto knocker's meld
 *     finishLayoff(seat)           — done laying off, score round
 *     isGameOver()                 — bool
 *     winner()                     — seat index or null
 *     turn()                       — current seat
 *   }
 */

// -- Card definitions (same ID scheme as chordaidi.js) -----------------------

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['D','C','H','S'];

function makeDeck() {
  const deck = [];
  let id = 0;
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ id: id++, rank, suit });
    }
  }
  return deck; // 52 cards, id 0-51
}

function cardFromId(id) {
  const rank = RANKS[Math.floor(id / 4)];
  const suit = SUITS[id % 4];
  return { id, rank, suit };
}

function rankIndex(rank) { return RANKS.indexOf(rank); }
function suitIndex(suit) { return SUITS.indexOf(suit); }

/** Deadwood point value of a card. A=1, 2-10=face, J/Q/K=10 */
function cardPoints(id) {
  const ri = Math.floor(id / 4); // 0=A, 1=2, ... 9=10, 10=J, 11=Q, 12=K
  if (ri === 0) return 1;        // Ace
  if (ri <= 9) return ri + 1;    // 2-10 (ri 1 -> 2, ri 9 -> 10)
  return 10;                     // J, Q, K
}

// -- Shuffle (Fisher-Yates, same as chordaidi.js) ----------------------------

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// -- Meld validation ---------------------------------------------------------

/**
 * Check if a group of card IDs forms a valid set (3-4 same rank).
 */
function isValidSet(cardIds) {
  if (cardIds.length < 3 || cardIds.length > 4) return false;
  const cards = cardIds.map(cardFromId);
  const rank = cards[0].rank;
  if (!cards.every(c => c.rank === rank)) return false;
  // No duplicate suits
  const suits = cards.map(c => c.suit);
  return new Set(suits).size === suits.length;
}

/**
 * Check if a group of card IDs forms a valid run (3+ consecutive same suit).
 * A-2-3 is valid. K-A-2 is NOT valid (no wrapping at the high end).
 */
function isValidRun(cardIds) {
  if (cardIds.length < 3) return false;
  const cards = cardIds.map(cardFromId);
  // All same suit
  const suit = cards[0].suit;
  if (!cards.every(c => c.suit === suit)) return false;
  // Sort by rank index
  const indices = cards.map(c => rankIndex(c.rank)).sort((a, b) => a - b);
  // Check consecutive
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) return false;
  }
  // No duplicate rank indices
  return new Set(indices).size === indices.length;
}

/**
 * Check if a group of card IDs forms a valid meld (set or run).
 */
function isValidMeld(cardIds) {
  return isValidSet(cardIds) || isValidRun(cardIds);
}

/**
 * Given a hand (array of card IDs) and meld groups (array of arrays of card IDs),
 * validate that:
 *   1. All meld cards are in the hand
 *   2. No card appears in multiple melds
 *   3. Each meld group is valid
 * Returns { valid, deadwood, deadwoodPoints, melds }
 */
function validateMelds(hand, meldGroups) {
  const handSet = new Set(hand);
  const usedCards = new Set();

  for (const group of meldGroups) {
    for (const cardId of group) {
      if (!handSet.has(cardId)) {
        return { valid: false, reason: 'Meld contains card not in hand' };
      }
      if (usedCards.has(cardId)) {
        return { valid: false, reason: 'Card used in multiple melds' };
      }
      usedCards.add(cardId);
    }
    if (!isValidMeld(group)) {
      return { valid: false, reason: 'Invalid meld group' };
    }
  }

  const deadwood = hand.filter(id => !usedCards.has(id));
  const deadwoodPoints = deadwood.reduce((sum, id) => sum + cardPoints(id), 0);

  return { valid: true, deadwood, deadwoodPoints, melds: meldGroups };
}

/**
 * Find the best (lowest deadwood) arrangement of melds for a hand.
 * Uses brute-force search over all possible meld combinations.
 * For 10-11 cards this is tractable.
 */
function findBestMelds(hand) {
  let bestDeadwood = Infinity;
  let bestMelds = [];
  let bestDeadwoodCards = [...hand];

  function search(remaining, currentMelds) {
    // Calculate current deadwood
    const dwPoints = remaining.reduce((sum, id) => sum + cardPoints(id), 0);
    if (dwPoints < bestDeadwood) {
      bestDeadwood = dwPoints;
      bestMelds = currentMelds.map(m => [...m]);
      bestDeadwoodCards = [...remaining];
    }
    if (remaining.length < 3) return;

    // Try to find sets
    const byRank = {};
    for (const id of remaining) {
      const ri = Math.floor(id / 4);
      if (!byRank[ri]) byRank[ri] = [];
      byRank[ri].push(id);
    }
    for (const ri in byRank) {
      const cards = byRank[ri];
      if (cards.length >= 3) {
        // Try sets of 3
        for (let i = 0; i < cards.length; i++) {
          for (let j = i + 1; j < cards.length; j++) {
            for (let k = j + 1; k < cards.length; k++) {
              const meld = [cards[i], cards[j], cards[k]];
              const newRemaining = remaining.filter(id => !meld.includes(id));
              search(newRemaining, [...currentMelds, meld]);
            }
          }
        }
        // Try sets of 4
        if (cards.length === 4) {
          const meld = [...cards];
          const newRemaining = remaining.filter(id => !meld.includes(id));
          search(newRemaining, [...currentMelds, meld]);
        }
      }
    }

    // Try to find runs
    const bySuit = {};
    for (const id of remaining) {
      const si = id % 4;
      if (!bySuit[si]) bySuit[si] = [];
      bySuit[si].push(id);
    }
    for (const si in bySuit) {
      const cards = bySuit[si].sort((a, b) => Math.floor(a / 4) - Math.floor(b / 4));
      const rIndices = cards.map(id => Math.floor(id / 4));

      // Find all consecutive sequences of length >= 3
      for (let start = 0; start < cards.length; start++) {
        let run = [cards[start]];
        for (let next = start + 1; next < cards.length; next++) {
          if (rIndices[next] === rIndices[next - 1] + 1) {
            // Actually check relative to last in run
            if (Math.floor(cards[next] / 4) === Math.floor(run[run.length - 1] / 4) + 1) {
              run.push(cards[next]);
            } else {
              break;
            }
          } else {
            break;
          }
        }
        if (run.length >= 3) {
          // Try all sub-runs of length 3+
          for (let len = 3; len <= run.length; len++) {
            for (let offset = 0; offset + len <= run.length; offset++) {
              const meld = run.slice(offset, offset + len);
              const newRemaining = remaining.filter(id => !meld.includes(id));
              search(newRemaining, [...currentMelds, meld]);
            }
          }
        }
      }
    }
  }

  search(hand, []);
  return { melds: bestMelds, deadwood: bestDeadwoodCards, deadwoodPoints: bestDeadwood };
}

/**
 * Check if a card can be laid off onto a meld (extend the meld).
 * Returns true if adding the card keeps the meld valid.
 */
function canLayoff(cardId, meld) {
  const extended = [...meld, cardId];
  return isValidMeld(extended);
}

// -- Deal --------------------------------------------------------------------

function dealGinRummy() {
  const deck = shuffle(makeDeck());
  const hands = [[], []];

  // Deal 10 cards to each player alternating
  for (let i = 0; i < 20; i++) {
    hands[i % 2].push(deck[i].id);
  }

  // Sort each hand
  hands.forEach(h => h.sort((a, b) => a - b));

  // Card at index 20 goes face-up on discard pile
  const discardPile = [deck[20].id];

  // Remaining cards form the draw pile
  const drawPile = deck.slice(21).map(c => c.id);

  return { hands, drawPile, discardPile };
}

// -- Game factory ------------------------------------------------------------

function createGame() {
  const dealt = dealGinRummy();
  const hands = dealt.hands;
  const drawPile = dealt.drawPile;
  const discardPile = dealt.discardPile;

  let currentSeat = 0;       // seat 0 goes first (non-dealer)
  let phase = 'draw';        // 'draw' | 'discard' | 'knock_response' | 'over'
  let winnerSeat = null;
  let scores = [0, 0];

  // Knock state
  let knockerSeat = null;
  let knockerMelds = null;    // array of arrays of cardIds
  let knockerDeadwood = null; // array of cardIds
  let knockerDeadwoodPoints = 0;
  let knockerIsGin = false;

  function isGameOver() { return phase === 'over'; }
  function winner()     { return winnerSeat; }
  function turn()       { return currentSeat; }

  function state() {
    return {
      hands: hands.map(h => [...h]),
      drawPileCount: drawPile.length,
      discardTop: discardPile.length > 0 ? discardPile[discardPile.length - 1] : null,
      discardPile: [...discardPile],
      currentSeat,
      phase,
      knocker: knockerSeat,
      knockerMelds: knockerMelds ? knockerMelds.map(m => [...m]) : null,
      knockerDeadwood: knockerDeadwood ? [...knockerDeadwood] : null,
      knockerDeadwoodPoints,
      knockerIsGin,
      scores: [...scores],
      isGameOver: isGameOver(),
      winner: winnerSeat,
    };
  }

  /**
   * Draw a card.
   * @param {number} seat - 0 or 1
   * @param {string} source - 'draw' (draw pile) or 'discard' (discard pile top)
   */
  function draw(seat, source) {
    if (isGameOver()) return { ok: false, reason: 'Game is over' };
    if (seat !== currentSeat) return { ok: false, reason: 'Not your turn' };
    if (phase !== 'draw') return { ok: false, reason: 'Not in draw phase' };

    if (source === 'draw') {
      if (drawPile.length === 0) {
        // Draw pile exhausted — round is a draw, no scoring
        phase = 'over';
        return { ok: true, drawn: null, exhausted: true };
      }
      const cardId = drawPile.pop();
      hands[seat].push(cardId);
      hands[seat].sort((a, b) => a - b);
      phase = 'discard';
      return { ok: true, drawn: cardId };
    }

    if (source === 'discard') {
      if (discardPile.length === 0) {
        return { ok: false, reason: 'Discard pile is empty' };
      }
      const cardId = discardPile.pop();
      hands[seat].push(cardId);
      hands[seat].sort((a, b) => a - b);
      phase = 'discard';
      return { ok: true, drawn: cardId };
    }

    return { ok: false, reason: 'Invalid source — use "draw" or "discard"' };
  }

  /**
   * Discard a card (ends your turn).
   * @param {number} seat - 0 or 1
   * @param {number} cardId - card to discard
   */
  function discard(seat, cardId) {
    if (isGameOver()) return { ok: false, reason: 'Game is over' };
    if (seat !== currentSeat) return { ok: false, reason: 'Not your turn' };
    if (phase !== 'discard') return { ok: false, reason: 'Not in discard phase' };

    const idx = hands[seat].indexOf(cardId);
    if (idx === -1) return { ok: false, reason: 'Card not in hand' };

    // Remove card and add to discard pile
    hands[seat].splice(idx, 1);
    discardPile.push(cardId);

    // Check if draw pile is exhausted after discard
    if (drawPile.length === 0) {
      phase = 'over';
      // No winner on exhaustion
      return { ok: true, exhausted: true };
    }

    // Switch turn
    currentSeat = 1 - seat;
    phase = 'draw';
    return { ok: true };
  }

  /**
   * Knock with declared melds. Player discards one card, then declares melds
   * from their remaining 10 cards. Deadwood (non-melded cards) must total <= 10.
   * @param {number} seat - 0 or 1
   * @param {Array<Array<number>>} meldGroups - array of arrays of card IDs forming melds (from the 10 remaining)
   * @param {number} discardId - card to discard when knocking
   */
  function knock(seat, meldGroups, discardId) {
    if (isGameOver()) return { ok: false, reason: 'Game is over' };
    if (seat !== currentSeat) return { ok: false, reason: 'Not your turn' };
    if (phase !== 'discard') return { ok: false, reason: 'Can only knock during discard phase' };

    // Validate discard card
    const discardIdx = hands[seat].indexOf(discardId);
    if (discardIdx === -1) return { ok: false, reason: 'Discard card not in hand' };

    // The remaining hand after discarding
    const remainingHand = hands[seat].filter(id => id !== discardId);

    // Validate melds against the remaining 10-card hand
    const result = validateMelds(remainingHand, meldGroups);
    if (!result.valid) return { ok: false, reason: result.reason };

    // Check deadwood threshold
    if (result.deadwoodPoints > 10) {
      return { ok: false, reason: 'Deadwood exceeds 10 points (have ' + result.deadwoodPoints + ')' };
    }

    // Knock is valid — discard the card
    hands[seat].splice(discardIdx, 1);
    discardPile.push(discardId);

    // Knock is valid
    knockerSeat = seat;
    knockerMelds = meldGroups.map(m => [...m]);
    knockerDeadwood = result.deadwood;
    knockerDeadwoodPoints = result.deadwoodPoints;
    knockerIsGin = (result.deadwoodPoints === 0);

    if (knockerIsGin) {
      // Gin — no layoffs allowed, score immediately
      _scoreRound();
      return { ok: true, gin: true };
    }

    // Opponent gets to lay off
    phase = 'knock_response';
    currentSeat = 1 - seat;
    return { ok: true, gin: false };
  }

  /**
   * Lay off a card onto one of the knocker's melds (opponent only, not during gin).
   * @param {number} seat - must be the non-knocking player
   * @param {number} cardId - card to lay off
   * @param {number} meldIndex - index into knockerMelds
   */
  function layoff(seat, cardId, meldIndex) {
    if (isGameOver()) return { ok: false, reason: 'Game is over' };
    if (phase !== 'knock_response') return { ok: false, reason: 'Not in knock response phase' };
    if (seat === knockerSeat) return { ok: false, reason: 'Knocker cannot lay off' };
    if (seat !== currentSeat) return { ok: false, reason: 'Not your turn' };
    if (knockerIsGin) return { ok: false, reason: 'Cannot lay off against gin' };

    const idx = hands[seat].indexOf(cardId);
    if (idx === -1) return { ok: false, reason: 'Card not in hand' };

    if (meldIndex < 0 || meldIndex >= knockerMelds.length) {
      return { ok: false, reason: 'Invalid meld index' };
    }

    const meld = knockerMelds[meldIndex];
    if (!canLayoff(cardId, meld)) {
      return { ok: false, reason: 'Card cannot be laid off onto that meld' };
    }

    // Lay off: remove from hand, add to meld
    hands[seat].splice(idx, 1);
    knockerMelds[meldIndex].push(cardId);
    // Keep the meld sorted for consistent run checking
    knockerMelds[meldIndex].sort((a, b) => a - b);

    return { ok: true };
  }

  /**
   * Finish laying off (opponent declares done). Scores the round.
   * @param {number} seat - must be the non-knocking player
   */
  function finishLayoff(seat) {
    if (isGameOver()) return { ok: false, reason: 'Game is over' };
    if (phase !== 'knock_response') return { ok: false, reason: 'Not in knock response phase' };
    if (seat === knockerSeat) return { ok: false, reason: 'Knocker cannot finish layoff' };
    if (seat !== currentSeat) return { ok: false, reason: 'Not your turn' };

    _scoreRound();
    return { ok: true };
  }

  /**
   * Calculate final scores for the round after knocking.
   */
  function _scoreRound() {
    const opponentSeat = 1 - knockerSeat;

    // Find best melds for opponent's remaining hand
    const opponentResult = findBestMelds(hands[opponentSeat]);
    const opponentDeadwoodPoints = opponentResult.deadwoodPoints;

    if (knockerIsGin) {
      // Gin bonus: knocker gets difference + 25
      const points = opponentDeadwoodPoints + 25;
      scores[knockerSeat] += points;
      winnerSeat = knockerSeat;
    } else if (knockerDeadwoodPoints < opponentDeadwoodPoints) {
      // Knocker wins: difference
      const points = opponentDeadwoodPoints - knockerDeadwoodPoints;
      scores[knockerSeat] += points;
      winnerSeat = knockerSeat;
    } else {
      // Undercut: opponent wins with difference + 25 bonus
      const points = (knockerDeadwoodPoints - opponentDeadwoodPoints) + 25;
      scores[opponentSeat] += points;
      winnerSeat = opponentSeat;
    }

    phase = 'over';
  }

  return { state, draw, discard, knock, layoff, finishLayoff, isGameOver, winner, turn };
}

export { createGame, findBestMelds };
