# Play with a Friend — design spec

Date: 2026-07-13

## Context

`cgames` currently only offers solo cognitive/brain-training games. A separate,
already-live platform — `caritahub-games` (Node + Express + Socket.IO, deployed
on Fly.io at `https://caritahub-games.fly.dev`) — hosts server-authoritative
2-player games with a room-code + QR join flow. A Flutter app
(`flutter-2p-games-main`) is a thin client over that same server, wiring up 7
games: Chess, Xiangqi, Rummikub, Crazy Eights, Higher-or-Lower, Singapore
Trivia, and Gin Rummy.

Checking the live server directly, only 5 of those 7 are actually reachable as
a real 2-player room today:

| Game | Status |
|---|---|
| Chess | ✅ `/lobby.html?game=chess` |
| Xiangqi | ✅ `/lobby.html?game=xiangqi` |
| Gin Rummy | ✅ `/lobby.html?game=gin-rummy` |
| Crazy Eights | ✅ `/lobby.html?game=crazy-eights` |
| Singapore Trivia | ✅ `/lobby.html?game=singapore-trivia` |
| Higher-or-Lower | ⚠️ engine exists, but only wired for TV/big-screen mode — no 2-player room page |
| Rummikub | ❌ no engine on this server at all |

This spec covers adding a single "Play with a Friend" entry point to `cgames`
that links out to the 5 ready games. It does not cover any changes to the
`caritahub-games` server itself, and does not add Higher-or-Lower or Rummikub.

## Goals

- One clearly-visible button/card on the `cgames` home screen that leads to a
  "Play with a Friend" screen listing the 5 ready 2-player games.
- Tapping a game opens the existing `caritahub-games` room-code lobby for that
  game in a new browser tab.
- Follow existing `cgames` conventions: CSS Modules, PropTypes, i18n keys in
  all 5 languages, colocated Vitest tests.

## Non-goals

- No score/achievement sync back into `cgames`. `caritahub-games` has no
  callback mechanism to report results, so playing these games does not touch
  `scoreStore`, `buildPayload`, or the achievement/level system that solo
  games use.
- No server-side work on `caritahub-games` (no Higher-or-Lower room page, no
  Rummikub engine/deploy).
- No iframe embedding of `caritahub-games` pages — they're a full separate
  site with their own header/lobby/QR chrome, so this always opens a new tab.
- No offline/error handling beyond a normal broken link — if the Fly server is
  down, the new tab just fails to load like any dead external link.

## Design

### Data: `src/shared/multiplayerGames.js`

A new framework-free module (no React/browser imports), matching the style of
`src/shared/gameData.js`:

```js
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
```

`id` values are prefixed `mp-` to avoid any collision with the existing
`GAME_MAP`/`GAME_GROUPS` id namespace (these are not registered there — they
never render through `GameShell`).

Titles and descriptions are not hardcoded here; they live in i18n as
`games['<id>']` entries (same `{ title, description }` shape used by every
other game), read at render time the same way `gameData.js`-driven cards
already do via `useTranslation()`.

### Entry point: home screen card

In `src/App.jsx`, a new full-width card is added directly below the existing
Daily Challenge focus card (`styles.focusCard` block, ~line 950) and above the
`tileRow`. Visually it's a second, slightly less prominent "play now"-style
card — same structural pattern as the Daily Challenge card (icon box, title,
eyebrow subtitle, "Play now ›" footer), with its own class name
(`styles.multiplayerCard`) so it can be styled distinctly (e.g. a two-person
icon and a different accent color) without perturbing the Daily Challenge
card's existing CSS. Clicking it calls `setView('multiplayer')`.

New i18n keys (added to all 5 language files): `app.playWithFriend` (card
title), `app.playWithFriendDesc` (card eyebrow/subtitle).

### Screen: `src/components/MultiplayerGames/MultiplayerGames.jsx`

A new small component (kept out of `App.jsx`, which is already 1000+ lines):

- Props: `onBack` (function), `translatedGames` (array of `{ id, slug, icon,
  title, description }`, pre-translated by the caller the same way `App.jsx`
  already builds `translatedAllGames`).
- Renders: a header with a back button (reusing the same floating-back-button
  markup/pattern already used by the `games`/`scores` views) and title
  (`t.app.multiplayerTitle`), a short explainer paragraph
  (`t.app.multiplayerSubtitle` — "Tap a game to open it in a new tab, then
  create or join with a 6-character room code — no account needed"), and a
  `styles.gameGrid` of cards.
- Each card reuses the existing `.gameCard` CSS classes from
  `App.module.css` (icon box, domain-style label, title) for visual
  consistency, but:
  - drops the favorite-heart button and "played" checkmark (not applicable —
    no local score tracking for these),
  - replaces the circular "▶" play button with a small "Opens in a new tab ↗"
    label, so it's clear before tapping that this leaves the app.
- `onClick` per card: `window.open(multiplayerGameUrl(game.slug), '_blank',
  'noopener,noreferrer')`.
- Own `MultiplayerGames.module.css` only for the handful of styles that don't
  already exist in `App.module.css` (the explainer paragraph, the "opens in
  new tab" label); everything else is shared classes passed in via `styles`
  import from `App.module.css` or duplicated minimally if module-scoping
  requires it — implementation will decide based on what CSS Modules allows
  cheaply.

### Wiring in `App.jsx`

- New `view === 'multiplayer'` branch, structurally parallel to the existing
  `view === 'games'` / `view === 'scores'` branches: renders
  `<MultiplayerGames onBack={() => setView('home')} translatedGames={...} />`
  inside the same floating-back-button wrapper pattern used elsewhere.
- `translatedGames` built once near the other `translatedGroups`/
  `translatedAllGames` derivations: map `MULTIPLAYER_GAMES` to `{ ...game,
  title: t.games[game.id]?.title, description: t.games[game.id]?.description
  }`.

### i18n

Added to `src/i18n/en.js`, `ms.js`, `zh.js`, `ta.js`, `id.js` (all 5, kept
structurally in sync per existing convention):

- `app.playWithFriend`, `app.playWithFriendDesc`
- `app.multiplayerTitle`, `app.multiplayerSubtitle`
- `games['mp-chess']`, `games['mp-xiangqi']`, `games['mp-gin-rummy']`,
  `games['mp-crazy-eights']`, `games['mp-singapore-trivia']` — each `{ title,
  description }`

### Testing

`src/components/MultiplayerGames/MultiplayerGames.test.jsx` (Vitest +
Testing Library, colocated per convention):

- Renders all 5 game cards with their translated titles.
- Clicking a card calls `window.open` with the exact expected URL
  (`https://caritahub-games.fly.dev/lobby.html?game=chess`, etc. — mocking
  `window.open`).
- Back button calls `onBack`.

No changes needed to `vite-api-plugin.js` or `api/daily-challenge.js` — the
daily challenge picks from `GAME_GROUPS` only, and multiplayer games are
intentionally not registered there.

## Open questions / risks

- Icon choice: using emoji (♟️ 🀄 🃏 🎴 🇸🇬) to match the rest of the app's
  emoji-icon convention rather than pulling in the `caritahub-games` repo's
  banner images (`banner-chess.jpg` etc.), which would require copying binary
  assets across repos and doesn't fit `cgames`' existing icon system anyway.
- `VITE_MULTIPLAYER_URL` env var is optional — if unset, the default points at
  the live Fly.io server, so no `.env` changes are required to ship this.
