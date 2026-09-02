# Play with a Friend — port Chess into React (pilot)

Date: 2026-09-02

## Context

"Play with a Friend" currently links out to `caritahub-games` (vendored into
this repo as `server/`), a separate Express + Socket.IO app serving ~40 games
as plain HTML/vanilla-JS pages, including the 5 ready 2-player games (Chess,
Xiangqi, Gin Rummy, Crazy Eights, Singapore Trivia). A same-origin merge
(`Dockerfile`, `fly.toml`, `vite.config.js`'s `/games/` base) was built so a
single Fly.io deployment could serve both apps and so match results could be
written into the same `caritahub_scores` localStorage bucket / callback
contract solo games use (see
[2026-07-20-play-with-a-friend-scoring-design.md](2026-07-20-play-with-a-friend-scoring-design.md)).

That merge works, but it still leaves two codebases glued together at the
deployment layer: a React/Vite SPA for solo games, and vanilla-JS pages for
multiplayer. This spec starts undoing that by porting the multiplayer game
*clients* into React, one game at a time, while keeping the realtime backend
(Socket.IO + game engines) exactly where it is. Chess is the pilot — proving
the pattern here (lobby + gameplay, both in React, with a refresh-safe URL)
is intended to make the remaining 4 games mechanical follow-ups.

This also changes the deployment target: once a game's UI is React and lives
in the main Vite bundle, it no longer needs to share an origin with the
Socket.IO server (it can call `saveScore`/`buildPayload` directly, and
Socket.IO clients connect cross-origin fine). The chosen end state is
**Vercel for the frontend SPA, Fly.io for the realtime backend only** —
which is *better* than the same-origin merge for the games that get ported,
because it gets Vercel's CDN back for asset delivery while keeping Fly for
the one piece it's actually suited for (a persistent process holding
in-memory Socket.IO room state).

## Goals

- Chess is playable start-to-finish entirely inside the cgames SPA: clicking
  "Chess" from the "Play with a Friend" screen never navigates away from the
  app's origin. Room creation/join (today's `lobby.html`), the QR code, the
  waiting room, and the actual board all render as React.
- The Socket.IO connection is cross-origin, from the Vercel-hosted SPA to the
  existing Fly-hosted `caritahub-games` server, using the existing
  `MULTIPLAYER_BASE_URL` env var convention.
- Match results save via `saveScore()`/`buildPayload()` **imported directly**
  (same as solo games) — no URL-param identity threading, no `/shared`
  static route, no `mp-report-result.js` bridge, for Chess specifically.
- Refreshing mid-lobby or mid-game does not lose the session: room/color/name
  are reflected in the URL (via `history.replaceState`, not a hard
  navigation) so a reload can rejoin.
- The pattern (hook + generic lobby component + per-game config) is reusable
  enough that porting Xiangqi/Gin Rummy/Crazy Eights/Singapore Trivia next is
  mostly "write the game-specific component," not "redesign the plumbing."

## Non-goals

- **No server-side engine changes.** `server/src/engine/chess.js`,
  `roomManager.js`, and the Socket.IO event contract (`join_game`,
  `game_started`, `game_state`, `game_over`, etc.) are unchanged. The server
  does not know or care whether its client is the old vanilla-JS page or the
  new React component.
- **The existing Fly-hosted `lobby.html`/`chess-game.html` are untouched and
  stay live.** The Flutter app (`flutter-2p-games-main`, per the original
  design spec) depends on them directly for its own 7 games. This port adds
  a new client; it does not replace or remove the old one.
- **Not rebuilding the board renderer.** `chess-board.js` (canvas drawing)
  and `chess-moves.js` (move legality) are reused as close to verbatim as
  their global-script structure allows, adapted into an importable module.
  A CSS/SVG rebuild of the board is an explicitly deferred follow-up, not
  part of this pilot.
- **Not porting Xiangqi, Gin Rummy, Crazy Eights, or Singapore Trivia yet.**
  Each gets its own follow-up spec once this pattern is validated. They keep
  using the existing `mp-report-result.js` bridge and same-origin Fly serving
  until then — this spec does not remove that bridge, only stops Chess from
  needing it.
- **Not reverting the Fly same-origin merge wholesale.** `Dockerfile`,
  `fly.toml`, and the `/games` mount stay in place as long as any multiplayer
  game still depends on same-origin serving. They'd only be removed once all
  5 games are ported (a separate future decision, not this spec's scope).
- **No changes to `GAME_MAP`, `GAME_GROUPS`, `GameShell`, or the
  daily-challenge contract.** Ported multiplayer games stay outside that
  system, same as the original "Play with a Friend" design decided — they
  don't fit GameShell's difficulty/countdown/idle-playing-finished model.

## Design

### 1. Routing: two view states, URL-reflected

`App.jsx`'s existing view state machine (`'multiplayer'`, `'game'`, `'daily'`,
...) gains one more: `'mp-chess'`. Clicking "Chess" on the `MultiplayerGames`
screen sets `view = 'mp-chess'` and pushes `?view=mp-chess&game=chess` — a
normal in-app state change, not `window.location.href` (which is what it
does today for the still-vanilla games).

Within that view, `<MultiplayerChessSession>` (see below) owns its own
internal phase (`'lobby' | 'playing'`) and calls `history.replaceState` to
add `room`/`color`/`name` to the URL once they're known — but that phase
switch itself does **not** go through `App.jsx`'s `view` state. Only a full
page load/refresh reads `room`/`color`/`name` back out of the URL to restore
a session; normal lobby→game transition during play is a local state flip
with the same socket connection carried through.

### 2. Realtime connection: `useMultiplayerSocket`

A new hook, `src/multiplayer/useMultiplayerSocket.js`, wraps `socket.io-client`
(new npm dependency in `cgames`'s root `package.json`) connecting to
`MULTIPLAYER_BASE_URL` (already defined in
[multiplayerGames.js](../../../src/shared/multiplayerGames.js), currently
used for the old `window.location.href` link — reused here as a connection
target instead). It exposes:

```js
const {
  status,        // 'connecting' | 'connected' | 'disconnected' | 'error'
  roomId, myColor, myName, players,
  createRoom, joinRoom, startGame,
  gameState,     // latest game_state/game_started payload
  lastGameOver,  // latest game_over payload, or null
} = useMultiplayerSocket('chess');
```

Internally it's the same event set `lobby.js`/`chess-game.js` already handle
(`room_update`, `game_started`, `game_state`, `game_over`, `error`,
`connect_error`, `player_disconnected`) — this hook is intentionally
generic across all 5 games; only the *shape* of `gameState` differs per game,
which is why it's returned opaquely rather than parsed here.

**Backend requirement:** `server.js`'s Socket.IO CORS config
(`cors: { origin: corsOrigin }`, driven by the `CORS_ORIGIN` env var) must
include the Vercel domain(s) once deployed. No code change — a Fly secrets/
env update.

### 3. Components

`src/multiplayer/` (new top-level directory, parallel to `src/games/`,
deliberately not registered in `GAME_MAP`):

- **`MultiplayerLobby.jsx`** — generic name-entry/QR/waiting-room UI, taking
  a `gameMeta` prop (`{ title, subtitle, maxPlayers, hostColors }` — the same
  shape as one entry in `lobby.js`'s existing `GAMES` map) plus the
  `useMultiplayerSocket` return value. Renders the QR code client-side (the
  existing `qrcodejs` library the vanilla lobby already uses, or an npm
  equivalent — implementation detail, not a design fork). This component is
  written once and reused by all 5 games' sessions.
- **`chess/ChessBoardCanvas.js`** — `chess-board.js` and `chess-moves.js`
  adapted from global-script variables into a small module exporting the
  `ChessBoard` class and move-legality functions, imported (not
  `<script src>`'d) by the React wrapper. Logic and canvas drawing
  unchanged.
- **`chess/ChessGame.jsx`** — owns a `<canvas>` ref, instantiates
  `ChessBoardCanvas` on mount, and re-implements `chess-game.js`'s event
  handling (`applyGameState`, `showGameOver`, undo/resign/promotion flows) as
  React state + effects instead of direct DOM manipulation. On game-over,
  calls `saveScore()`/`buildPayload()` directly (imported from
  `src/utils/scoreStore.js`/`buildPayload.js`), using `memberId`/
  `callbackUrl`/`accessToken` passed down as props from `App.jsx` (the same
  values already threaded to `MultiplayerGames` today) — no URL-param
  round-trip needed since it's all one bundle now.
- **`chess/MultiplayerChessSession.jsx`** — the component mounted for
  `view === 'mp-chess'`. Owns one `useMultiplayerSocket('chess')` instance
  and renders `<MultiplayerLobby>` or `<ChessGame>` based on local phase
  state (`gameState`/`lastGameOver` presence, mirroring `applyGameState`'s
  existing `isGameOver` checks).

### 4. Error handling

Same UX as today's vanilla client, re-implemented as conditional rendering
instead of `classList` toggling: a connecting/reconnecting banner
(`status === 'disconnected'`), a "room not found" message on the lobby
(`error` event with no prior successful join), and an opponent-disconnected
notice during play (`player_disconnected` event). No new error cases —
this is a like-for-like port of existing handling, not new design.

### 5. Testing

- `useMultiplayerSocket.test.js` — unit tests against a mocked
  `socket.io-client` (a small fake `EventEmitter`-based client), asserting
  state transitions for each event (`room_update` → `players` updates,
  `game_started`/`game_state` → `gameState` updates, `game_over` →
  `lastGameOver` set, disconnect → `status` change).
- `MultiplayerLobby.test.jsx` — Testing Library coverage of name-entry
  validation, create/join button enabled/disabled states, and the
  room-not-found error path — same style as
  [MultiplayerGames.test.jsx](../../../src/components/MultiplayerGames/MultiplayerGames.test.jsx).
- `ChessGame.test.jsx` — asserts `saveScore`/`buildPayload` are called with
  correct args when a `game_over` event fires (win/loss/draw cases), mocking
  `fetch` the same way
  [useGameCallback.test.js](../../../src/hooks/useGameCallback.test.js)
  already does. Does **not** assert on canvas pixel output.
- `chess-board.js`/`chess-moves.js` themselves get no new tests — unchanged
  logic already running in production via the vanilla client, verified
  manually (same bar the vanilla client has always had, per the July specs'
  "no new Vitest coverage for `server/` vanilla-JS files" precedent).
- **Manual verification (required before calling this done):** a full Chess
  match played end-to-end through the new React UI across two browser
  contexts, confirming: room creation/join/QR/start all work, moves render
  and sync correctly, resign/checkmate trigger the correct end screen, a mid-
  game refresh restores the session via the URL, and a match result appears
  in `caritahub_scores:<memberId>` and (if a `callbackUrl` is present) fires
  the POST — plus confirming the old vanilla Chess page at
  `caritahub-games.fly.dev/chess-game.html` still works unmodified.

## Non-regression constraints (hard requirement)

- `server/` is read-only in this change except for the `CORS_ORIGIN`
  env var/secret update needed for cross-origin Socket.IO — no code changes
  to `server.js`, `roomManager.js`, or any engine file.
- The old `lobby.html`/`chess-game.html` pages and their JS
  (`lobby.js`, `chess-game.js`, `chess-board.js`, `chess-moves.js` as served
  from `server/public/`) are untouched. `chess/ChessBoardCanvas.js` in
  `cgames` is a **new, separate copy** adapted for ES module import — not a
  shared file — so the Fly-served vanilla page and the React port can evolve
  independently without one breaking the other.
- Xiangqi, Gin Rummy, Crazy Eights, and Singapore Trivia keep working exactly
  as they do today (same-origin Fly serving, `mp-report-result.js` bridge,
  `multiplayerGameUrl()` hard navigation) — this spec does not touch their
  code paths.
- Solo games, `GameShell`, `scoreStore.js`, `buildPayload.js`, and
  `useGameCallback.js` are unmodified (`saveScore`/`buildPayload` gain a new
  *caller*, not new behavior).
- Verification before calling this done: `npm test`, `npm run build` stay
  green, plus the manual playthrough described in Testing above.

## Open questions / risks

- **CORS + Socket.IO transport behind Fly's proxy for a genuinely
  cross-origin browser client** (today's CORS config is exercised by
  same-origin/no-origin requests in practice, even though the config exists)
  — needs a real end-to-end check against the deployed Fly app once this
  ships, not just local dev.
- **`chess-board.js`/`chess-moves.js`'s exact global-variable structure**
  needs a quick read during implementation to confirm they have no hidden
  dependency on being loaded as classic scripts (e.g. relying on load order
  or other globals `chess-game.js` sets up) before wrapping them as an ES
  module.
- **QR code library choice** (keep `qrcodejs` via CDN script tag inside the
  React component, or switch to an npm package like `qrcode.react`) is an
  implementation detail to resolve during the plan, not a design fork —
  either works.
- **Local dev cross-origin setup**: running `npm run dev` (Vite on 5174)
  against a local `npm --prefix server run dev` (Fly server on 3000) already
  works for the existing vanilla flow; this port needs the same two-process
  local setup, now exercised via a real cross-origin Socket.IO connection
  instead of a page navigation — worth confirming CORS defaults
  (`CORS_ORIGIN=*` in `.env.example`) already cover `localhost:5174`.
