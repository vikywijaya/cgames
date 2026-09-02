// Static catalog of ready-to-play 2-player games hosted by the same caritahub-games
// Express + Socket.IO server that also serves this app under /games (see server/server.js).
// Keep this module free of React / browser dependencies, matching gameData.js.

// Same-origin by default (the merged Fly.io app serves both from one process).
// `npm run dev` (frontend-only) still needs a local caritahub-games server on :3000.
export const MULTIPLAYER_BASE_URL =
  import.meta.env.VITE_MULTIPLAYER_URL ||
  (import.meta.env.DEV ? 'http://localhost:3000' : '');

export const MULTIPLAYER_GAMES = [
  { id: 'mp-chess',            slug: 'chess',            icon: '♟️' },
  { id: 'mp-xiangqi',          slug: 'xiangqi',          icon: '🀄' },
  { id: 'mp-gin-rummy',        slug: 'gin-rummy',        icon: '🃏' },
  { id: 'mp-crazy-eights',     slug: 'crazy-eights',     icon: '🎴' },
  { id: 'mp-singapore-trivia', slug: 'singapore-trivia', icon: '🇸🇬' },
];

export function multiplayerGameUrl(slug, { memberId, callbackUrl, accessToken } = {}) {
  const url = new URL(`${MULTIPLAYER_BASE_URL}/lobby.html`);
  url.searchParams.set('game', slug);
  if (memberId)    url.searchParams.set('memberId', memberId);
  if (callbackUrl) url.searchParams.set('callbackUrl', callbackUrl);
  if (accessToken) url.searchParams.set('accessToken', accessToken);
  return url.toString();
}
