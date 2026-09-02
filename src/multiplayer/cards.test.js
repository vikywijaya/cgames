import { describe, it, expect } from 'vitest';
import { cardFromId, isRedCard } from './cards';

describe('cards', () => {
  it('decodes card id 0 as the Ace of Diamonds', () => {
    expect(cardFromId(0)).toEqual({ id: 0, rank: 'A', suit: 'D' });
  });

  it('decodes card id 51 as the King of Spades', () => {
    expect(cardFromId(51)).toEqual({ id: 51, rank: 'K', suit: 'S' });
  });

  it('treats Diamonds and Hearts as red suits', () => {
    expect(isRedCard('D')).toBe(true);
    expect(isRedCard('H')).toBe(true);
  });

  it('treats Clubs and Spades as black suits', () => {
    expect(isRedCard('C')).toBe(false);
    expect(isRedCard('S')).toBe(false);
  });
});
