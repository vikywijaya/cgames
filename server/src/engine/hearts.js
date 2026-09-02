'use strict';

/**
 * Hearts — Trick-taking card game engine.
 * 4 players (seats 0-3), standard 52-card deck (no jokers).
 * Card rank:  2 3 4 5 6 7 8 9 10 J Q K A  (2=lowest, A=highest)
 * Suit order: Diamonds, Clubs, Hearts, Spades (for id encoding only)
 * Card id:    rankIndex * 4 + suitIndex  (2D=0, 2C=1, 2H=2, 2S=3, ... AD=48, AC=49, AH=50, AS=51)
 *
 * Plays one round of 13 tricks.
 * - Player holding 2♣ (id=1) leads the first trick.
 * - Must follow lead suit if possible; if void, may play any card.
 * - Hearts cannot be led until hearts are "broken" (a heart played when void).
 * - Each heart = 1 point. Queen of Spades = 13 points.
 * - Shoot the moon: take ALL hearts + Q♠ → you get 0, everyone else gets 26.
 * - Winner = player with the lowest score after 13 tricks.
 * - No passing phase (simplified for multiplayer).
 *
 * Interface (mirrors chordaidi.js):
 *   createGame() → {
 *     state()              — full serialisable state (sent to clients)
 *     play(seat, cardId)   — returns { ok, reason }
 *     isGameOver()         — bool
 *     winner()             — seat index 0-3 or null
 *     turn()               — current seat index (0-3)
 *   }
 */

// ── Card definitions ────────────────────────────────────────────────────────

const SUITS = ['D', 'C', 'H', 'S'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

// Special card ids
const TWO_OF_CLUBS   = 0 * 4 + 1;  // rankIndex 0 ('2'), suitIndex 1 ('C') = id 1
const QUEEN_OF_SPADES = 10 * 4 + 3; // rankIndex 10 ('Q'), suitIndex 3 ('S') = id 43

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

function cardSuit(id)     { return SUITS[id % 4]; }
function cardRankIndex(id) { return Math.floor(id / 4); }   // 0=2, 1=3, ... 12=A

// ── Deal ────────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function deal() {
  const deck = shuffle(makeDeck());
  const hands = [[], [], [], []];
  deck.forEach((card, i) => hands[i % 4].push(card.id));
  // Sort each hand by id (ascending)
  hands.forEach(h => h.sort((a, b) => a - b));
  return hands;
}

// ── Scoring helpers ─────────────────────────────────────────────────────────

function isHeart(cardId)          { return cardSuit(cardId) === 'H'; }
function isQueenOfSpades(cardId)  { return cardId === QUEEN_OF_SPADES; }
function isPointCard(cardId)      { return isHeart(cardId) || isQueenOfSpades(cardId); }

function cardPoints(cardId) {
  if (isQueenOfSpades(cardId)) return 13;
  if (isHeart(cardId))         return 1;
  return 0;
}

// ── Game factory ─────────────────────────────────────────────────────────────

function createGame() {
  const hands = deal();

  // Find who has 2♣ (id = 1)
  let startSeat = hands.findIndex(h => h.includes(TWO_OF_CLUBS));

  let currentSeat   = startSeat;
  let trickLeader   = startSeat;
  let trickCards     = [];          // [{seat, cardId}] for current trick (up to 4)
  let tricksWon      = [0, 0, 0, 0];
  let pointsTaken    = [0, 0, 0, 0];
  let heartsBroken   = false;
  let trickNumber    = 1;           // 1–13
  let phase          = 'play';      // 'play' | 'over'
  let winnerSeat     = null;
  let cardsWonPerSeat = [[], [], [], []]; // track which cards each player won (for shoot-the-moon)

  function isGameOver() { return phase === 'over'; }
  function winner()     { return winnerSeat; }
  function turn()       { return currentSeat; }

  function nextSeat(s) { return (s + 1) % 4; }

  function state() {
    return {
      hands: hands.map(h => [...h]),
      currentSeat,
      trickCards: trickCards.map(tc => ({ ...tc })),
      trickLeader,
      tricksWon: [...tricksWon],
      pointsTaken: [...pointsTaken],
      heartsBroken,
      trickNumber,
      phase,
      isGameOver: isGameOver(),
      winner: winnerSeat,
    };
  }

  /**
   * Determine which cards in a player's hand are legal to play.
   */
  function legalPlays(seat) {
    const hand = hands[seat];
    if (hand.length === 0) return [];

    // First trick, first card: must play 2♣
    if (trickNumber === 1 && trickCards.length === 0) {
      return [TWO_OF_CLUBS];
    }

    // Following: must follow lead suit if possible
    if (trickCards.length > 0) {
      const leadSuit = cardSuit(trickCards[0].cardId);
      const followable = hand.filter(id => cardSuit(id) === leadSuit);
      if (followable.length > 0) return followable;

      // Void in lead suit — can play anything.
      // But on the FIRST trick, cannot play point cards (hearts or Q♠) if void.
      if (trickNumber === 1) {
        const nonPoint = hand.filter(id => !isPointCard(id));
        if (nonPoint.length > 0) return nonPoint;
        // If hand is ALL point cards (extremely unlikely), must play something
        return [...hand];
      }

      return [...hand];
    }

    // Leading a trick (not first trick)
    if (!heartsBroken) {
      // Cannot lead hearts unless hearts broken or only hearts remain
      const nonHearts = hand.filter(id => !isHeart(id));
      if (nonHearts.length > 0) return nonHearts;
      // Only hearts left — must lead hearts (this also breaks hearts)
      return [...hand];
    }

    return [...hand];
  }

  /**
   * Resolve a completed trick: find winner, assign points, advance state.
   */
  function resolveTrick() {
    const leadSuit = cardSuit(trickCards[0].cardId);

    // Winner is the highest card of the lead suit
    let winningEntry = trickCards[0];
    for (let i = 1; i < trickCards.length; i++) {
      const entry = trickCards[i];
      if (cardSuit(entry.cardId) === leadSuit &&
          cardRankIndex(entry.cardId) > cardRankIndex(winningEntry.cardId)) {
        winningEntry = entry;
      }
    }

    const trickWinner = winningEntry.seat;
    tricksWon[trickWinner]++;

    // Tally points in this trick
    let trickPoints = 0;
    for (const tc of trickCards) {
      const pts = cardPoints(tc.cardId);
      trickPoints += pts;
      cardsWonPerSeat[trickWinner].push(tc.cardId);
    }
    pointsTaken[trickWinner] += trickPoints;

    // Clear trick
    trickCards = [];

    // Advance trick number
    trickNumber++;

    if (trickNumber > 13) {
      // Round is over — compute final scores
      finalizeRound();
      return;
    }

    // Winner of trick leads next
    trickLeader = trickWinner;
    currentSeat = trickWinner;
  }

  /**
   * Finalize scoring after 13 tricks. Check for shooting the moon.
   */
  function finalizeRound() {
    // Check shoot the moon: one player took ALL 26 points
    const totalPossiblePoints = 26; // 13 hearts + Q♠
    const moonShooter = pointsTaken.findIndex(p => p === totalPossiblePoints);

    if (moonShooter !== -1) {
      // Shooter gets 0, everyone else gets 26
      for (let i = 0; i < 4; i++) {
        pointsTaken[i] = (i === moonShooter) ? 0 : 26;
      }
    }

    // Find winner(s): lowest score
    const minScore = Math.min(...pointsTaken);
    // If tie, first seat with min score wins (simple tiebreak)
    winnerSeat = pointsTaken.indexOf(minScore);

    phase = 'over';
  }

  function play(seat, cardId) {
    if (isGameOver()) return { ok: false, reason: 'Game over' };
    if (seat !== currentSeat) return { ok: false, reason: 'Not your turn' };

    // Validate player owns this card
    const hand = hands[seat];
    if (!hand.includes(cardId)) return { ok: false, reason: 'Card not in hand' };

    // Validate legality
    const legal = legalPlays(seat);
    if (!legal.includes(cardId)) {
      // Provide a specific reason
      if (trickNumber === 1 && trickCards.length === 0 && cardId !== TWO_OF_CLUBS) {
        return { ok: false, reason: 'Must lead with 2♣ on the first trick' };
      }
      if (trickCards.length > 0) {
        const leadSuit = cardSuit(trickCards[0].cardId);
        const followable = hand.filter(id => cardSuit(id) === leadSuit);
        if (followable.length > 0 && cardSuit(cardId) !== leadSuit) {
          return { ok: false, reason: 'Must follow the lead suit' };
        }
      }
      if (trickCards.length === 0 && isHeart(cardId) && !heartsBroken) {
        return { ok: false, reason: 'Hearts have not been broken yet' };
      }
      if (trickNumber === 1 && isPointCard(cardId) && trickCards.length > 0) {
        return { ok: false, reason: 'Cannot play point cards on the first trick' };
      }
      return { ok: false, reason: 'Illegal play' };
    }

    // Remove card from hand
    hand.splice(hand.indexOf(cardId), 1);

    // Add to current trick
    trickCards.push({ seat, cardId });

    // Check if hearts are now broken
    if (!heartsBroken && isHeart(cardId)) {
      heartsBroken = true;
    }

    // If trick is complete (4 cards), resolve it
    if (trickCards.length === 4) {
      resolveTrick();
      return { ok: true };
    }

    // Advance to next player
    currentSeat = nextSeat(seat);
    return { ok: true };
  }

  return { state, play, isGameOver, winner, turn };
}

module.exports = { createGame };
