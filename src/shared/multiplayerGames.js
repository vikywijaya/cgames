// Static catalog of ready-to-play 2-player games hosted on the separate
// caritahub-games Socket.IO server (see docs/superpowers/specs/2026-07-13-play-with-a-friend-design.md).
// Keep this module free of React / browser dependencies, matching gameData.js.

export const MULTIPLAYER_BASE_URL =
  import.meta.env.VITE_MULTIPLAYER_URL || 'https://caritahub-games.fly.dev';

export const MULTIPLAYER_GAMES = [
  { id: 'mp-chess',            slug: 'chess',            icon: '♟️' },
  { id: 'mp-xiangqi',          slug: 'xiangqi',          icon: '🀄' },
  { id: 'mp-gin-rummy',        slug: 'gin-rummy',        icon: '🃏' },
  { id: 'mp-crazy-eights',     slug: 'crazy-eights',     icon: '🎴' },
  { id: 'mp-singapore-trivia', slug: 'singapore-trivia', icon: '🇸🇬' },
];

export function multiplayerGameUrl(slug) {
  return `${MULTIPLAYER_BASE_URL}/lobby.html?game=${slug}`;
}
