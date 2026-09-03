# Convert multiplayer games to same-device split-screen (drop Fly.io)

Date: 2026-09-03

## Context

The 5 "Play with a Friend" games (Chess, Xiangqi, Gin Rummy, Crazy Eights,
Singapore Trivia) currently run over Socket.IO against a Fly.io-hosted
Express server (`server/`, app `caritahub-games`). Every `Multiplayer<Game>Session.jsx`
wrapper uses one shared hook, `src/multiplayer/useMultiplayerSocket.js`, to
join a room and exchange `make_move`/`game_state`/`game_over` events; the
server holds the authoritative rules engine for each game under
`server/src/engine/*.js` and validates every move.

This spec changes the interaction model entirely: instead of two people on
two devices connecting over a room code, both players sit at the **same
device** and play **split-screen** — each player's half of the screen shows
their own oriented view, updating live as moves happen, no network involved.
Concretely this means:

- The Fly.io round trip is removed for these 5 games. Game logic runs
  entirely in the browser.
- The room-code lobby (`MultiplayerLobby.jsx`) is removed; there's no one to
  wait for.
- Each game's UI is restructured into two stacked panes (opponent's pane
  rotated 180°) instead of one board.

A separate Flutter app (`flutter-2p-games-main`) also depends on the same
Fly-hosted server for its own 7 games, hitting `/lobby.html` and the
Socket.IO backend directly. That dependency is **out of scope and accepted
as broken** by this change — see Non-goals.

## Goals

- All 5 games are playable start-to-finish on one device with no network
  calls: two local players share a screen, each sees their own oriented
  half, and moves are validated by client-side rules engines ported from
  `server/src/engine/*.js`.
- `src/multiplayer/useMultiplayerSocket.js` is replaced by a local-only hook
  (`useLocalMultiplayer` or per-game equivalent) that plays the same role
  (owns game state, exposes an `emit`-like function for moves) without any
  Socket.IO/network dependency. Existing `*Game.jsx` components are adapted
  to render two panes rather than rewritten from scratch.
- Card games (Gin Rummy, Crazy Eights) visually hide the non-active player's
  hand (card backs) in their pane, since both hands now live in the same
  local state.
- Singapore Trivia's server-side timer/state-machine (20s auto-reveal,
  "all answered → early reveal") is reproduced with local `setTimeout`
  logic — same player-visible behavior, no server.
- Entry into a match skips any lobby/room/name-entry screen — tapping the
  game starts the split-screen match immediately with default seat labels
  (e.g. "Player 1" / "Player 2").
- `fly.toml` is removed from this repo, and the 5 games' cases are retired
  from `server/src/rooms/socketEvents.js` / `server/src/engine/*.js` once
  their client-side equivalents are verified working. The app deploys as a
  single Vercel project, same as the solo games.
- Completion reporting (`saveScore`, `buildPayload`, `postMessage`,
  `callbackUrl` POST) keeps working unchanged — this is purely a transport
  and UI change, not a change to the scoring contract.

## Non-goals

- **No bot/AI opponent.** This stays strictly two local humans, matching the
  original feature's scope. No game gains single-player-vs-computer logic
  as part of this change.
- **No pass-and-play mode.** Split-screen (simultaneous dual panes) is the
  only interaction model built here; a single shared upright view with
  turn-based handoff is not implemented.
- **No concern for the Flutter app's dependency on the Fly server.** The
  Flutter app (`flutter-2p-games-main`) is not part of this repo and its
  breakage from removing `fly.toml`/retiring the server routes is accepted.
- **No visual security beyond "don't peek."** Hiding the opponent's hand is
  a rendering rule (show card backs), not a technical guarantee — both
  hands exist in the same local React state and are inspectable via
  devtools. This is acceptable for a casual same-device game.
- **No changes to `GAME_MAP`, `GAME_GROUPS`, `GameShell`, i18n keys beyond
  what's needed for new/removed UI strings, or the daily-challenge
  contract.** These games stay outside `GameShell` exactly as they are
  today.
- **No changes to the in-flight i18n work** currently uncommitted in
  `MultiplayerLobby.jsx`/`*Game.jsx`/`*Session.jsx` (translation-key
  wiring). That work lands independently; this spec's changes should be
  layered on top of it, not conflict with it.
- **Not deleting `server/src/engine/*.js` in the same pass as the client
  port.** Server-side removal happens only after each client engine is
  verified working end-to-end, to avoid a window with neither in place.

## Design

### Local multiplayer hook

Each game's session wrapper (`Multiplayer<Game>Session.jsx`) currently calls
`useMultiplayerSocket(gameType)`, which returns `{ status, roomId, myColor,
players, gameState, lastGameOver, socket }` and manages room join/reconnect.

This is replaced by a local hook — `useLocalMatch(gameType)` — that:

- Calls `createGame()` from the ported client-side engine
  (`src/multiplayer/<game>/engine.js`) to produce initial `gameState`.
- Exposes the same shape the game components already read (`gameState`,
  `lastGameOver`, `players` as two fixed local seats), so `*Game.jsx`
  components need minimal changes to their data-reading logic.
- Exposes `emit(event, payload)` that calls straight into the engine
  (`engine.move()`, `engine.resign()`, etc.), synchronously updates React
  state, and computes `lastGameOver` when the engine reports the game is
  over. No Socket.IO, no room, no reconnect/rate-limit logic — those
  concepts don't apply without a network.
- For Singapore Trivia specifically, additionally owns the local
  timer/state-machine (20s auto-reveal `setTimeout`, cleared on
  unmount/advance; early-reveal when `engine`'s "all answered" check
  passes) that today lives in `socketEvents.js`.

`players` becomes a fixed 2-entry local array (`[{ name: 'Player 1', color:
'white' }, { name: 'Player 2', color: 'black' }]` for chess, etc.) with no
`connected` field — there's nothing to disconnect from.

### Ported engines

`server/src/engine/{chess,xiangqi,gin-rummy,crazy-eights,singapore-trivia}.js`
are plain JS (`'use strict'`, no `require`, no Node built-ins) and are
copied into `src/multiplayer/<game>/engine.js` with no structural changes.
Two pieces of orchestration logic that today live in
`server/src/rooms/socketEvents.js` (not the engine files) move with them:

- **Gin Rummy's auto-find-best-melds helper** (used when a client sends
  `gin_knock` without explicit melds) — ported alongside the engine so
  `emit('gin_knock')` behaves identically to today.
- **Singapore Trivia's round state machine** — ported into the local hook
  as described above, since it was orchestration in `socketEvents.js`
  rather than inside `singapore-trivia.js` itself.

Everything else that lived outside the engine in `socketEvents.js` — rate
limiting, per-socket hand-hiding, room lifecycle, reconnect grace periods,
disconnect debounce — is dropped, since none of it has meaning without a
network. `resign`'s existing "generic 2-player winner" logic is replaced
per-game inline in the local hook (trivial for 2-seat games; not reused for
Crazy Eights' 4-seat case, which can define its own resign rule or omit
resign if it doesn't need one for 2 local players).

### Split-screen UI

Each `*Game.jsx` is restructured into two stacked panes:

```
┌────────────────────────────┐
│   Opponent pane (rotated    │
│   180° to face their side)  │
├────────────────────────────┤
│   Active player's pane      │
│   (upright)                 │
└────────────────────────────┘
```

Both panes render from the same `gameState`; only orientation (a CSS
`transform: rotate(180deg)` on the top pane's container) and, for card
games, hand visibility differ between panes. Board/card renderers
(`ChessBoardCanvas`, `XiangqiBoardCanvas`, card layout in Gin
Rummy/Crazy Eights) are reused, parameterized by which seat's pane is
rendering.

For Gin Rummy and Crazy Eights, each pane shows its own hand face-up and
the *other* seat's hand as face-down card backs — this is a pure rendering
rule (`isOwnPane ? renderFace(card) : renderBack()`), not a data-hiding
concern, since both hands already live in the same local `gameState`.

Singapore Trivia (not a spatial board game) keeps a single shared view but
still needs a per-question "yield to the other player" moment if input
needs to be exclusive; if simultaneous answering is acceptable there, this
degrades to two answer-input panes rather than a spatial split. (Left to
the implementation plan to confirm per existing trivia UI structure.)

### Entry flow

`MultiplayerLobby.jsx`'s room-code/name-entry/waiting-room UI is removed.
Each `Multiplayer<Game>Session.jsx` wrapper drops its `reflectInUrl()` /
`?room=` URL-state logic (nothing to resume — a local match has no
cross-device link to share) and renders directly into the split-screen
match on mount, using default seat labels ("Player 1" / "Player 2", or the
existing per-game seat names like "White"/"Black").

### Cleanup (sequenced after client verification)

1. Verify each ported client engine + local hook produces correct gameplay
   (tests + manual play) for all 5 games.
2. Remove the 5 games' event handlers from `server/src/rooms/socketEvents.js`
   and delete `server/src/engine/{chess,xiangqi,gin-rummy,crazy-eights,singapore-trivia}.js`.
   Other (non-2P-multiplayer) server games are untouched.
3. Delete `src/multiplayer/useMultiplayerSocket.js` and the
   `MULTIPLAYER_BASE_URL` export from `src/shared/multiplayerGames.js` once
   nothing imports them.
4. Delete `fly.toml` (and any now-unused Fly-specific Dockerfile/deploy
   config in this repo). The app deploys to Vercel as a single project,
   same pipeline as the solo games.

## Testing

- Existing colocated `*.test.jsx`/`*.test.js` files for each session/game
  component are updated to drive the new local hook instead of mocking
  Socket.IO.
- New unit tests for each ported `engine.js` (move legality, win/check
  detection, resign, play-again) mirroring whatever server-side engine
  tests exist today, if any.
- New test for Singapore Trivia's local timer state machine (auto-reveal
  fires after 20s; early reveal fires when all local answers are in).
- Manual verification: play each of the 5 games start-to-finish in the
  browser in split-screen, confirm win/draw/resign end states, confirm
  score reporting (`saveScore`/`buildPayload`/`postMessage`) still fires
  correctly, confirm card games hide the inactive hand visually.

## Open questions for the implementation plan

- Exact per-game pane layout for Singapore Trivia (spatial split vs. two
  answer zones) — noted above as left for implementation to confirm
  against the current trivia UI.
- Whether Crazy Eights needs a resign affordance at all for 2 local
  players, or whether "Play Again" alone suffices.
