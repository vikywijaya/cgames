'use strict';

/**
 * Crazy Eights — card game engine.
 * 2-4 players, standard 52-card deck (no jokers).
 * Card rank:  A 2 3 4 5 6 7 8 9 10 J Q K
 * Suits:      Diamonds, Clubs, Hearts, Spades
 * Card id:    rankIndex * 4 + suitIndex  (A of D=0, A of C=1, ..., K of S=51)
 * Deal:       5 cards each (for 2-4 players)
 * Start:      Flip top card of draw pile to start discard. If it's an 8, shuffle back and flip again.
 * Play:       Match discard top's suit OR rank, or play any 8 (wild — choose new suit).
 * Draw:       If can't play, draw one card. If draw pile empty, reshuffle discard (minus top) into draw pile.
 * Pass:       If after drawing you still can't play, pass.
 * Win:        First player to empty their hand wins.
 *             If draw + discard exhausted and nobody can play, fewest cards wins
 *             (ties broken by lowest total card value).
 *
 * Interface:
 *   createGame(numPlayers) -> {
 *     state()                         — full serialisable state
 *     play(seat, cardId, chosenSuit)  — returns { ok, reason }
 *     draw(seat)                      — returns { ok, drawnCardId, reason }
 *     pass(seat)                      — returns { ok, reason }
 *     isGameOver()                    — bool
 *     winner()                        — seat index or null
 *     turn()                          — current seat index
 *   }
 */

// -- Card definitions --------------------------------------------------------

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

function rankIndex(id) { return Math.floor(id / 4); }
function suitIndex(id) { return id % 4; }
function rankOf(id)    { return RANKS[rankIndex(id)]; }
function suitOf(id)    { return SUITS[suitIndex(id)]; }
function isEight(id)   { return rankOf(id) === '8'; }

/** Card value used for tiebreaking: rankIndex * 4 + suitIndex (same as id). */
function cardValue(id) { return id; }

// -- Shuffle -----------------------------------------------------------------

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// -- Game factory ------------------------------------------------------------

function createGame(numPlayers) {
  if (numPlayers === undefined || numPlayers === null) numPlayers = 2;
  if (numPlayers < 2 || numPlayers > 4) {
    throw new Error('Crazy Eights requires 2-4 players');
  }

  // Build and shuffle deck
  const allCards = makeDeck().map(c => c.id);
  let drawPile = shuffle(allCards);

  // Deal 5 cards each
  const cardsPerPlayer = 5;
  const hands = [];
  for (let p = 0; p < numPlayers; p++) {
    const hand = drawPile.splice(0, cardsPerPlayer);
    hand.sort((a, b) => a - b);
    hands.push(hand);
  }

  // Flip first card for discard pile — if it's an 8, shuffle it back and flip again
  const discardPile = [];
  flipStarterCard();

  function flipStarterCard() {
    while (true) {
      const card = drawPile.shift();
      if (!isEight(card)) {
        discardPile.push(card);
        return;
      }
      // It's an 8 — shuffle it back in
      drawPile.push(card);
      drawPile = shuffle(drawPile);
    }
  }

  let currentSeat  = 0;
  let currentSuit  = suitOf(discardPile[discardPile.length - 1]); // suit in effect
  let phase        = 'play';   // 'play' | 'over'
  let winnerSeat   = null;
  let hasDrawn     = false;    // whether current player has drawn this turn

  // -- Helpers ---------------------------------------------------------------

  function discardTop() {
    return discardPile[discardPile.length - 1];
  }

  function nextSeat(s) {
    return (s + 1) % numPlayers;
  }

  /** Check if a card can be legally played on the current discard. */
  function canPlay(cardId) {
    if (isEight(cardId)) return true;
    const topId = discardTop();
    return suitOf(cardId) === currentSuit || rankOf(cardId) === rankOf(topId);
  }

  /** Does the player have any playable card? */
  function hasPlayableCard(seat) {
    return hands[seat].some(canPlay);
  }

  /**
   * Reshuffle the discard pile (minus its top card) back into the draw pile.
   * Returns true if reshuffling produced cards; false if nothing to reshuffle.
   */
  function reshuffleDiscard() {
    if (discardPile.length <= 1) return false;
    const top = discardPile.pop();
    drawPile = shuffle(discardPile);
    discardPile.length = 0;
    discardPile.push(top);
    return drawPile.length > 0;
  }

  /** Check stalemate: no one can play, draw pile empty, discard can't reshuffle. */
  function checkStalemate() {
    if (drawPile.length > 0) return false;
    if (discardPile.length > 1) return false; // could reshuffle
    // Draw pile empty and discard has at most 1 card (the top). Check if anyone can play.
    for (let p = 0; p < numPlayers; p++) {
      if (hasPlayableCard(p)) return false;
    }
    return true;
  }

  /** Resolve winner by fewest cards, then lowest total card value. */
  function resolveStalemate() {
    let bestSeat = 0;
    let bestCount = hands[0].length;
    let bestTotal = hands[0].reduce((s, id) => s + cardValue(id), 0);

    for (let p = 1; p < numPlayers; p++) {
      const count = hands[p].length;
      const total = hands[p].reduce((s, id) => s + cardValue(id), 0);
      if (count < bestCount || (count === bestCount && total < bestTotal)) {
        bestSeat = p;
        bestCount = count;
        bestTotal = total;
      }
    }

    winnerSeat = bestSeat;
    phase = 'over';
  }

  /** Advance turn to the next player and reset per-turn state. */
  function advanceTurn() {
    hasDrawn = false;
    currentSeat = nextSeat(currentSeat);

    // After advancing, check stalemate
    if (checkStalemate()) {
      resolveStalemate();
    }
  }

  // -- Public API ------------------------------------------------------------

  function isGameOver() { return phase === 'over'; }
  function winner()     { return winnerSeat; }
  function turn()       { return currentSeat; }

  function state() {
    return {
      hands: hands.map(h => [...h]),
      discardTop: discardTop(),
      currentSuit,
      currentSeat,
      drawPileCount: drawPile.length,
      handCounts: hands.map(h => h.length),
      phase,
      isGameOver: isGameOver(),
      winner: winnerSeat,
    };
  }

  function play(seat, cardId, chosenSuit) {
    if (isGameOver()) return { ok: false, reason: 'Game is over' };
    if (seat !== currentSeat) return { ok: false, reason: 'Not your turn' };

    // Validate player owns the card
    const hand = hands[seat];
    const idx = hand.indexOf(cardId);
    if (idx === -1) return { ok: false, reason: 'Card not in hand' };

    // Validate legal play
    if (!canPlay(cardId)) {
      return { ok: false, reason: 'Card does not match current suit or rank' };
    }

    // If playing an 8, chosenSuit is required and must be valid
    if (isEight(cardId)) {
      if (!chosenSuit || !SUITS.includes(chosenSuit)) {
        return { ok: false, reason: 'Must choose a suit (D, C, H, S) when playing an 8' };
      }
    }

    // Remove card from hand
    hand.splice(idx, 1);

    // Place on discard pile
    discardPile.push(cardId);

    // Update current suit
    if (isEight(cardId)) {
      currentSuit = chosenSuit;
    } else {
      currentSuit = suitOf(cardId);
    }

    // Check win — hand empty
    if (hand.length === 0) {
      winnerSeat = seat;
      phase = 'over';
      return { ok: true };
    }

    // Advance to next player
    advanceTurn();
    return { ok: true };
  }

  function draw(seat) {
    if (isGameOver()) return { ok: false, reason: 'Game is over' };
    if (seat !== currentSeat) return { ok: false, reason: 'Not your turn' };
    if (hasDrawn) return { ok: false, reason: 'Already drew this turn' };

    // If draw pile is empty, try to reshuffle discard
    if (drawPile.length === 0) {
      const reshuffled = reshuffleDiscard();
      if (!reshuffled) {
        // Nothing to draw — check stalemate
        if (checkStalemate()) {
          resolveStalemate();
          return { ok: false, reason: 'No cards to draw — game over' };
        }
        return { ok: false, reason: 'No cards to draw' };
      }
    }

    // Draw one card
    const drawnCardId = drawPile.shift();
    hands[seat].push(drawnCardId);
    hands[seat].sort((a, b) => a - b);
    hasDrawn = true;

    return { ok: true, drawnCardId };
  }

  function pass(seat) {
    if (isGameOver()) return { ok: false, reason: 'Game is over' };
    if (seat !== currentSeat) return { ok: false, reason: 'Not your turn' };
    if (!hasDrawn) return { ok: false, reason: 'Must draw before passing' };

    // Can only pass if no playable card after drawing
    if (hasPlayableCard(seat)) {
      return { ok: false, reason: 'You have a playable card' };
    }

    // Advance turn
    advanceTurn();
    return { ok: true };
  }

  return { state, play, draw, pass, isGameOver, winner, turn };
}

module.exports = { createGame };
