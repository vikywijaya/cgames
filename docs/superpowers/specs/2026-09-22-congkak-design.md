# Congkak — 2-player same-device design

**Date:** 2026-09-22
**Status:** Approved, ready for implementation planning
**Game id:** `mp-congkak` · **Slug:** `congkak`

## Purpose

Add Congkak (Malay/Indonesian mancala) as an on-device 2-player game in the
CaritaHub games catalogue, for two seniors sharing one tablet laid flat
between them.

Congkak was chosen over other traditional games because it clears every
constraint at once: it is familiar to Malay and Indonesian seniors and is a
near-sibling of Tamil Pallanguzhi, it needs no text at all (so the five-language
requirement costs almost nothing), it is turn-based (so a mismatch in reaction
speed between the two players does not matter), and it exercises counting and
forward planning rather than reflex.

## Scope

In scope: a simplified single-round Congkak, traditional 7×7 board, animated
seed-by-seed sowing, on-device pass-and-play only.

Out of scope: networked play, an AI opponent, the traditional simultaneous
first move, multi-round matches with burnt holes, and Pallanguzhi rule
variants. The engine is structured so a Pallanguzhi variant could reuse it
later, but that is a separate piece of work.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Rule fidelity | Simplified single round | Alternating turns from move one. Traditional simultaneous opening and burnt-hole multi-round play are authentic but add a special turn model and a much harder rules explanation. |
| Board | Traditional 7 houses per side, 7 seeds each | The board seniors actually picture. Games run 15–25 min, which suits a sit-down social game. |
| Sowing | Animated seed-by-seed | The rhythm of sowing *is* the nostalgia, and it makes the rules self-teaching — you see why a capture or free turn happened. |
| Match controls | No clock. Undo, Resign, Reset | Congkak has no traditional time control and a clock adds stress that works against the therapeutic goal. Undo matters because mis-taps happen. Offer Draw is dropped — draws are rare and the concept needs explaining. |
| Engine shape | Move returns a step list | Keeps the engine pure and synchronous, testable without timers, and impossible to desync from an interrupted animation. |
| Rendering | DOM/CSS, not canvas | 16 elements, each needing to be a real focusable, labelled button. Canvas would cost accessibility and buy nothing. |

## Rules

### Board representation

A flat array of 16 integers:

- `0–6` — P1's houses
- `7` — P1's store
- `8–14` — P2's houses
- `15` — P2's store

Sowing runs anticlockwise as increasing index mod 16, **skipping the
opponent's store**. Opposite-hole mapping is symmetric: `opposite(i) = 14 - i`
(so house `0` faces house `14`, and house `6` faces house `8`).

Initial state: every house holds 7 seeds, both stores hold 0. P1 (seat 0)
moves first.

### A move

A player taps one of their own non-empty houses. All its seeds are lifted and
sown one per hole. Resolution depends on where the **last** seed lands:

1. **Own store** → extra turn. The same player moves again.
2. **A non-empty hole**, either side → lift that hole's entire contents,
   including the seed just dropped, and continue sowing. (Continuous sow.)
3. **An empty house on the player's own side** → capture. That seed plus every
   seed in the opposite opponent house moves to the player's store. Turn passes.
   **If the opposite house is empty there is no capture** — the seed stays
   where it landed and the turn passes. Capturing a single lone seed is
   degenerate and would surprise players.
4. **An empty house on the opponent's side** → *mati*. Turn passes, nothing
   captured.

### Game end

After a turn resolves, if the player now due to move has no seeds in any of
their own houses, the game ends. The opponent sweeps their own remaining house
seeds into their own store. The larger store wins; equal stores are a draw.

### Termination guard

Rule 2 has no trivial termination proof. In practice relay chains resolve
quickly, but the engine carries a hard cap of **10,000 sow steps per move**,
after which the undistributed hand returns to the mover's store (so seeds stay
conserved), the move force-ends, and the turn passes. This should never fire in
real play; it exists so that "never" is guaranteed rather than assumed, and so
a pathological position cannot hang the tablet.

The cap is injectable — `createGame({ maxSowSteps })` — so tests can exercise
the guard with a small value instead of constructing a 10,000-step position.

## Engine API

`src/multiplayer/congkak/congkakEngine.js` — pure, synchronous, framework-free,
matching the existing `xiangqiEngine` / `crazyEightsEngine` style.

```js
createGame()               // → engine
engine.state()             // → { board: number[16], turn: 0|1, isGameOver, winner }
engine.legalMoves(seat)    // → number[]   indices of that seat's non-empty houses
engine.move(seat, hole)    // → { ok, steps: Step[], state }
```

`Step` is a small tagged record the UI walks:

| Step | Shape | Meaning |
|---|---|---|
| `pickup` | `{ type, hole, count }` | Seeds lifted from the tapped house |
| `sow` | `{ type, hole, seedsRemaining }` | One seed dropped — emitted once per seed |
| `relay` | `{ type, hole, count }` | Landed on a non-empty hole; lifting again |
| `capture` | `{ type, hole, oppositeHole, count, store }` | Capture resolved |
| `extraTurn` | `{ type, seat }` | Landed in own store |
| `sweep` | `{ type, seat, holes, count }` | End-of-game sweep |
| `end` | `{ type, winner }` | `0`, `1`, or `'draw'` |

The `state` returned is the authoritative post-move state. An animation that is
interrupted, skipped, or never run at all therefore cannot desync the rules —
which is also what makes reduced-motion support fall out for free.

## Match hook

`useLocalCongkakMatch.js` holds the engine in a ref and returns
`{ gameState, lastGameOver, players, dispatch }` — the same shape as the other
four local-match hooks.

`dispatch(action, payload)` handles:

- `move` — `{ seat, hole }`; exposes the returned step list for the UI to walk
- `undo` — restores the previous snapshot
- `resign` — `{ seat }`; opponent wins
- `reset` / `play_again` — fresh `createGame()`

Undo pushes a snapshot (the 16-integer board plus `turn`) before each move.
That is cheap enough to retain the whole game's history, and one undo steps
back exactly one move, extra turns included. Undo is disabled during an
animation and after game over.

## Animation and interaction

The UI walks the step list on an interval:

- `sow` — 120ms each
- `relay` and `capture` — a 350ms beat, so the player registers what happened

The board is locked while the walk runs, and Undo/Resign are disabled. If a
chain exceeds ~60 steps the interval halves so a long relay does not stall the
game.

Under `prefers-reduced-motion`, the move resolves instantly with a highlight
trail over the sown path. This is a different way of consuming the same step
list, not a separate code path in the engine.

Sound reuses `useSoundFx`: `playTick` per seed, `playSuccess` on capture,
`playComplete` at game end.

## Layout and accessibility

Landscape, tablet flat between the two players. P2's store sits on the left,
P1's on the right, with the two rows of seven houses between them. P2's player
card is at the top, rotated 180° via the existing `.cardSlotRotated`
convention, exactly as `XiangqiGame` does. Only the card rotates; the shared
board does not.

- **Every hole shows its seed count as a large numeral.** Seeds also render as
  dots up to 8, after which the dots stop and the numeral carries it. Asking a
  senior to count fifteen overlapping dots is a failure mode, not a feature.
- Tap targets are a minimum of 64px.
- On the active player's turn, their legal holes carry a pulsing ring.
  Everything else is dimmed and `aria-disabled`.
- Each hole is a `<button>` with a translated label ("Your hole 3, 7 seeds").
- An `aria-live="polite"` region announces outcomes ("Captured 8 seeds",
  "Free turn").

## Scoring and payload

`gameId: 'mp-congkak'`, following `XiangqiGame` exactly:

```js
const RESULT_PCT = { win: 100, draw: 50, loss: 0 };
```

Scored from P1's perspective and fired exactly once behind a `reportedRef`:
`saveScore` → `buildPayload` → `window.parent.postMessage({ type: 'GAME_COMPLETE', payload })`
→ optional `callbackUrl` POST carrying the `Access-Token` header.

This keeps the existing convention that on a shared device, P1 (seat 0) is the
member of record. That is a convention rather than a truth, but changing it is
a platform-wide decision and out of scope here.

## Files

```
src/multiplayer/congkak/
  congkakEngine.js
  congkakEngine.test.js
  useLocalCongkakMatch.js
  useLocalCongkakMatch.test.js
  CongkakBoard.jsx              presentational board
  CongkakGame.jsx
  CongkakGame.module.css
  CongkakGame.test.jsx
  MultiplayerCongkakSession.jsx
  MultiplayerCongkakSession.test.jsx
```

## Registration (must move in lockstep)

1. `src/shared/multiplayerGames.js` — add `{ id: 'mp-congkak', slug: 'congkak', icon: '🌰' }`
2. `src/App.jsx` — import `MultiplayerCongkakSession`, add `'mp-congkak'` to
   `IN_APP_MULTIPLAYER_VIEWS` and `'congkak'` to `inAppSlugs`, add the view branch
3. `src/i18n/{en,ms,zh,ta,id}.js` — a `games['mp-congkak']` entry plus the
   congkak strings under `multiplayer`. All five files stay structurally in sync.
4. `src/assets/games/mp-congkak.jpg` — card cover, same convention as the other
   multiplayer cards

### Display name per language

| Language | Title |
|---|---|
| `en` | Congkak |
| `ms` | Congkak |
| `id` | Congklak |
| `ta` | பல்லாங்குழி (Pallanguzhi) |
| `zh` | 播棋 (Congkak) |

## Testing

Engine tests are the backbone — one per landing rule:

- extra turn when the last seed lands in the player's own store
- relay continues off a non-empty hole
- capture on an empty house on the player's own side
- *mati* on an empty house on the opponent's side
- the opponent's store is skipped while sowing
- sweep-and-end when the side to move is empty
- draw detection on equal stores
- the 10,000-step iteration cap force-ends a move

Hook tests: undo across an extra turn, resign, reset.

Component tests: tapping a legal hole runs the animation and updates the board;
opponent holes are not tappable; the completion payload fires exactly once on
game over.
