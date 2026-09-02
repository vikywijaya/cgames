import { describe, it, expect } from 'vitest';
import { MULTIPLAYER_GAMES, multiplayerGameUrl } from './multiplayerGames';

describe('multiplayerGames', () => {
  it('lists exactly the 5 ready games with expected ids and slugs', () => {
    expect(MULTIPLAYER_GAMES.map(g => ({ id: g.id, slug: g.slug }))).toEqual([
      { id: 'mp-chess', slug: 'chess' },
      { id: 'mp-xiangqi', slug: 'xiangqi' },
      { id: 'mp-gin-rummy', slug: 'gin-rummy' },
      { id: 'mp-crazy-eights', slug: 'crazy-eights' },
      { id: 'mp-singapore-trivia', slug: 'singapore-trivia' },
    ]);
  });

  it('every game has a non-empty icon', () => {
    for (const game of MULTIPLAYER_GAMES) {
      expect(typeof game.icon).toBe('string');
      expect(game.icon.length).toBeGreaterThan(0);
    }
  });

  it('builds the room-lobby URL for a game slug using the default server', () => {
    expect(multiplayerGameUrl('chess')).toBe('http://localhost:3000/lobby.html?game=chess');
    expect(multiplayerGameUrl('singapore-trivia')).toBe('http://localhost:3000/lobby.html?game=singapore-trivia');
  });

  it('appends memberId, callbackUrl, and accessToken as query params when passed', () => {
    const url = new URL(multiplayerGameUrl('chess', {
      memberId: 'm-42',
      callbackUrl: 'https://host.example/callback',
      accessToken: 'tok-123',
    }));
    expect(url.searchParams.get('game')).toBe('chess');
    expect(url.searchParams.get('memberId')).toBe('m-42');
    expect(url.searchParams.get('callbackUrl')).toBe('https://host.example/callback');
    expect(url.searchParams.get('accessToken')).toBe('tok-123');
  });

  it('omits identity params that are not passed', () => {
    const url = new URL(multiplayerGameUrl('chess', { memberId: 'm-42' }));
    expect(url.searchParams.has('callbackUrl')).toBe(false);
    expect(url.searchParams.has('accessToken')).toBe(false);
  });
});
