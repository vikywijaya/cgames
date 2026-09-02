// Shared 52-card deck helpers, adapted from the identical `cardFromId` +
// constants duplicated in server/public/js/gin-rummy-game.js and
// crazy-eights-game.js. Card ids are 0-51: rank = floor(id/4), suit = id%4.

export const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
export const SUITS = ['D','C','H','S'];
export const SUIT_GLYPHS = { D: '♦', C: '♣', H: '♥', S: '♠' };
export const SUIT_NAMES  = { D: 'Diamonds', C: 'Clubs', H: 'Hearts', S: 'Spades' };
export const RED_SUITS = new Set(['D','H']);

export function cardFromId(id) {
  return { id, rank: RANKS[Math.floor(id / 4)], suit: SUITS[id % 4] };
}

export function isRedCard(suit) {
  return RED_SUITS.has(suit);
}
