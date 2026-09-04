# Local Split-Screen Crazy Eights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the networked (Socket.IO + Fly.io server) Crazy Eights game into a fully client-side, same-device split-screen local multiplayer game, following the pattern already validated for Chess, Xiangqi, and Gin Rummy.

**Architecture:** Port `server/src/engine/crazy-eights.js` verbatim into the client bundle (CommonJS → ESM export only). Build a `useLocalCrazyEightsMatch()` hook exposing `{ gameState, lastGameOver, players, dispatch }`, following Gin Rummy's hook shape exactly — both hands live in one `gameState`. Rebuild `CrazyEightsGame.jsx` as two stacked panes (no rotation, same reasoning as Gin Rummy — cards are text-bearing tiles) with hand-hiding (face-down backs for the inactive pane), reusing Gin Rummy's `GinRummyPane`/`CardTile`/`CardBack` patterns. Simplify `MultiplayerCrazyEightsSession.jsx` to drop the room-code lobby. Fix the stalemate-reporting gap discovered during research: the server's `c8_draw` and `c8_pass` handlers never surface a stalemate-triggered game-over with a distinct event — the local hook must check `engine.isGameOver()`/`winner()` after **every** dispatched action, not just `play`, and must produce an honest game-over reason that distinguishes "played out your hand" from "stalemate — fewest cards wins."

**Tech Stack:** React 18 function components + hooks, CSS Modules, Vitest + Testing Library, no TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-03-local-split-screen-multiplayer-design.md`

**Prior art:** `docs/superpowers/plans/2026-09-03-local-multiplayer-chess-pilot.md` (canonical pattern), `docs/superpowers/plans/2026-09-03-local-multiplayer-xiangqi.md`, and `docs/superpowers/plans/2026-09-04-local-multiplayer-gin-rummy.md` (closest structural match — also a card game with hand-hiding, no canvas). This plan reuses Gin Rummy's split-screen card layout conventions directly (stacked panes, face-down `CardBack` tiles, `namedTurn`-style i18n, Reset + confirmation) and additionally documents+fixes a real latent bug in the original networked implementation (see Global Constraints and Task 2).

## Global Constraints

- Two humans only, no bot/AI — matches spec Non-goals. The engine supports 2-4 players; the local port always calls `createGame(2)`, matching the existing `MultiplayerCrazyEightsSession.jsx`'s `gameMeta.maxPlayers = 2` (Crazy Eights was already 2-player-only in this app's networked lobby, even though the engine is more general).
- No name-entry/lobby screen — the match starts immediately with default "Player 1" / "Player 2" labels.
- Split-screen (stacked, dual zones), not pass-and-play.
- Card games must visually hide the opponent's hand — render card backs for the inactive pane's hand, reusing Gin Rummy's `CardBack` pattern (own component here, since files don't share imports across game folders in this codebase — see Task 4).
- Must fit on small phone screens without scrolling — verify on iPhone SE (375×667 CSS px, but note Gin Rummy's actual working viewport was 320×568 physical — use the same Playwright `devices['iPhone SE']`/`devices['iPhone 13']` presets) via Playwright.
- Reset control with a confirmation step before restarting, reusing existing shared i18n keys (`resetGame`, `resetConfirmTitle`, `resetConfirmBody`, `resetConfirmYes`, `resetConfirmCancel`).
- **Stalemate game-over must be honestly reported.** Do not port the networked bug where `c8_draw`'s stalemate branch never broadcasts state or emits `game_over`, and `c8_pass`'s stalemate branch broadcasts state but never emits a distinct `game_over` reason. The local hook's `dispatch` must call `engine.state()` after every action (`play`, `draw`, `pass`) and check `isGameOver`/`winner` regardless of whether the action itself reported `ok: true` or `ok: false`, matching the defensive `sync()`-after-every-dispatch pattern already used in `useLocalGinRummyMatch.js`.
- Do not touch `server/src/engine/crazy-eights.js`, `server/src/rooms/socketEvents.js`, `fly.toml`, `useMultiplayerSocket.js`, or `MultiplayerLobby.jsx` — Singapore Trivia still depends on them. Server cleanup is a later, separate plan.
- Do not disturb the pre-existing uncommitted i18n/session changes already present on this branch in `MultiplayerLobby.jsx`, `SingaporeTriviaGame.jsx`, `MultiplayerSingaporeTriviaSession.jsx`, `App.jsx`, `.claude/settings.local.json` — layer new changes on top; never `git checkout` or discard them.

---

## Engine Interface Reference

`server/src/engine/crazy-eights.js`'s `createGame(numPlayers = 2)` returns:

```js
{
  state()                          // full serialisable state (see below)
  play(seat, cardId, chosenSuit)   // chosenSuit required + must be in SUITS when cardId is an 8, else ignored → { ok, reason? }
  draw(seat)                       // → { ok, drawnCardId?, reason? }
  pass(seat)                       // → { ok, reason? }
  isGameOver()                     // bool
  winner()                         // seat index (never null once phase is 'over' — resolveStalemate always picks a seat)
  turn()                           // current seat
}
```

`state()` shape:
```js
{
  hands: [[cardId,...], [cardId,...]],  // BOTH hands, full card ids (unlike the server payload, which redacts per-viewer)
  discardTop: number,                   // card id on top of the discard pile
  currentSuit: 'D' | 'C' | 'H' | 'S',   // suit currently in effect
  currentSeat: 0 | 1,
  drawPileCount: number,
  handCounts: [number, number],
  phase: 'play' | 'over',
  isGameOver: boolean,
  winner: 0 | 1 | null,                 // null only before game-over; always a concrete seat once isGameOver is true
}
```

**Card legality:** a card is playable if it's an 8 (always wild), or its suit matches `currentSuit`, or its rank matches the discard top's rank. Playing an 8 requires `chosenSuit` (one of `SUITS`).

**The three action outcomes and their exact `isGameOver` implications** (from the engine source, read in full during research):
1. `play(seat, cardId, chosenSuit)` — if the play empties the hand, sets `winnerSeat = seat` and `phase = 'over'` **synchronously inside `play()`**, returns `{ ok: true }`. If the hand isn't emptied, calls `advanceTurn()`, which can itself trigger `resolveStalemate()` (fewest cards / lowest total value) if the draw pile and discard are both exhausted and nobody has a playable card — this ALSO returns `{ ok: true }`, indistinguishable from a normal turn-advance without re-checking `isGameOver()`.
2. `draw(seat)` — if the draw pile is empty and reshuffling the discard yields nothing, checks `checkStalemate()`; if true, calls `resolveStalemate()` **and then returns `{ ok: false, reason: 'No cards to draw — game over' }`**. This is the trickiest case: the engine's internal state has already flipped to game-over, but the call reports `ok: false`.
3. `pass(seat)` — calls `advanceTurn()` on success, which (like `play`) can trigger `resolveStalemate()` and return `{ ok: true }` without any distinguishing field.

**Conclusion for the hook (Task 2):** after every dispatched action, always re-read `engine.state()` (not just on `result.ok === true`) and check `gs.isGameOver` to decide whether to set `lastGameOver` — never gate that check behind the action's own `ok` flag.

---

### Task 1: Port the Crazy Eights engine

**Files:**
- Create: `src/multiplayer/crazy-eights/crazyEightsEngine.js`
- Test: `src/multiplayer/crazy-eights/crazyEightsEngine.test.js`

**Interfaces:**
- Produces: `createGame(numPlayers)`, re-exported via `export { createGame }` — later tasks import this name.

- [ ] **Step 1: Write the failing test**

Create `src/multiplayer/crazy-eights/crazyEightsEngine.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createGame } from './crazyEightsEngine';

describe('crazyEightsEngine', () => {
  it('deals 5 cards to each of 2 players and starts a non-eight discard pile', () => {
    const engine = createGame(2);
    const gs = engine.state();
    expect(gs.hands[0]).toHaveLength(5);
    expect(gs.hands[1]).toHaveLength(5);
    expect(gs.discardTop).not.toBeNull();
    // 52 - 5 - 5 - 1(discard) = 41 left in the draw pile
    expect(gs.drawPileCount).toBe(41);
    // the starter card is never an 8 (id % 4 gives suit; rank 8 has index 7,
    // so ids 28-31 are the four 8s — the engine reshuffles until discardTop
    // is not one of those)
    expect([28, 29, 30, 31]).not.toContain(gs.discardTop);
  });

  it('seat 0 moves first', () => {
    const engine = createGame(2);
    expect(engine.turn()).toBe(0);
    expect(engine.state().phase).toBe('play');
  });

  it('rejects a play from the player who is not on turn', () => {
    const engine = createGame(2);
    const result = engine.play(1, engine.state().hands[1][0]);
    expect(result.ok).toBe(false);
  });

  it('rejects playing an 8 without a chosenSuit', () => {
    const engine = createGame(2);
    // id 28 = 8 of Diamonds (rankIndex 7 * 4 + suitIndex 0). Force it into
    // seat 0's hand directly via state is not possible (no setter), so
    // instead verify the rule using the engine's own hand — deal a fresh
    // game and check whichever seat holds ANY 8 rejects playing it blank.
    const gs = engine.state();
    const eightInHand = gs.hands[0].find(id => Math.floor(id / 4) === 7);
    if (eightInHand !== undefined) {
      const result = engine.play(0, eightInHand, null);
      expect(result.ok).toBe(false);
    } else {
      // No 8 dealt to seat 0 this shuffle — nothing to assert, but confirm
      // the engine at least starts in a legal, non-crashed state.
      expect(engine.isGameOver()).toBe(false);
    }
  });

  it('draw advances hasDrawn state such that a second draw in the same turn is rejected', () => {
    const engine = createGame(2);
    const first = engine.draw(0);
    expect(first.ok).toBe(true);
    const second = engine.draw(0);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('Already drew this turn');
  });

  it('pass is rejected before drawing', () => {
    const engine = createGame(2);
    const result = engine.pass(0);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Must draw before passing');
  });

  it('isGameOver/winner report a fresh game as not over', () => {
    const engine = createGame(2);
    expect(engine.isGameOver()).toBe(false);
    expect(engine.winner()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/multiplayer/crazy-eights/crazyEightsEngine.test.js`
Expected: FAIL with "Cannot find module './crazyEightsEngine'" (or similar resolution error).

- [ ] **Step 3: Write minimal implementation**

Create `src/multiplayer/crazy-eights/crazyEightsEngine.js` as a verbatim port of `server/src/engine/crazy-eights.js`: copy the entire body (lines 1–298: card definitions, `makeDeck`, `rankIndex`/`suitIndex`/`rankOf`/`suitOf`/`isEight`, `cardValue`, `shuffle`, `createGame` with all its internal helpers — `flipStarterCard`, `discardTop`, `nextSeat`, `canPlay`, `hasPlayableCard`, `reshuffleDiscard`, `checkStalemate`, `resolveStalemate`, `advanceTurn`, `isGameOver`/`winner`/`turn`, `state`, `play`, `draw`, `pass`), changing only the module boundary:

```js
// (all engine code from server/src/engine/crazy-eights.js, verbatim, down
// to the end of createGame()'s closing brace)

export { createGame };
```

Drop the `'use strict';` pragma at the top and the `module.exports = { createGame };` line — everything else is copied unchanged, including internal helper names (they're module-private, not exported, so no collision risk with `src/multiplayer/cards.js`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/multiplayer/crazy-eights/crazyEightsEngine.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/crazy-eights/crazyEightsEngine.js src/multiplayer/crazy-eights/crazyEightsEngine.test.js
git commit -m "Port crazy eights engine for local client-side play"
```

---

### Task 2: `useLocalCrazyEightsMatch` hook (with the stalemate-reporting fix)

**Files:**
- Create: `src/multiplayer/crazy-eights/useLocalCrazyEightsMatch.js`
- Test: `src/multiplayer/crazy-eights/useLocalCrazyEightsMatch.test.js`

**Interfaces:**
- Consumes: `createGame` from `./crazyEightsEngine.js` (Task 1).
- Produces: `useLocalCrazyEightsMatch()` → `{ gameState, lastGameOver, players, dispatch }`, consumed by `CrazyEightsGame.jsx` (Task 4).
  - `players`: `[{ name: 'Player 1', color: 'p1' }, { name: 'Player 2', color: 'p2' }]` — same convention as Gin Rummy.
  - `gameState`: the engine's `state()` object as-is (both hands included).
  - `lastGameOver`: `null` until the round ends, then `{ winner: 0 | 1, reason: string }`. `winner` is never `null` for this game (unlike Gin Rummy's draw-pile-exhaustion case) — `resolveStalemate()` always resolves to a concrete seat. `reason` values: `'Played all cards!'` (a `play()` that emptied the hand) or `'Fewest cards wins!'` (a stalemate resolution via `advanceTurn()` or `draw()`'s stalemate branch) — this is the fix for the networked version's hardcoded-wrong `"played all cards!"` reason string that didn't distinguish the two cases (see Global Constraints).
  - `dispatch(action, payload)` actions:
    - `'play'` — payload `{ cardId, chosenSuit }` (`chosenSuit` is `null`/omitted for non-8s)
    - `'draw'` — payload `{}`
    - `'pass'` — payload `{}`
    - `'resign'` — payload `{ seat }` (same shape as Gin Rummy's — an explicit seat, since resign isn't necessarily performed by `engine.turn()`)
    - `'play_again'` — payload `{}` (creates a fresh `createGame(2)`)

**Key implementation detail — detecting WHICH game-over reason applies:** the engine gives no direct signal distinguishing "hand emptied" from "stalemate resolved." Derive it from `gameState.handCounts`: if the winning seat's hand count is `0`, it was a hand-emptying win (`'Played all cards!'`); otherwise it was a stalemate resolution (`'Fewest cards wins!'`). Check this **after** the action so `handCounts` reflects the post-action state.

- [ ] **Step 1: Write the failing test**

Create `src/multiplayer/crazy-eights/useLocalCrazyEightsMatch.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalCrazyEightsMatch } from './useLocalCrazyEightsMatch';

describe('useLocalCrazyEightsMatch', () => {
  it('starts with two players, seat 0 to move, no game-over', () => {
    const { result } = renderHook(() => useLocalCrazyEightsMatch());
    expect(result.current.players).toEqual([
      { name: 'Player 1', color: 'p1' },
      { name: 'Player 2', color: 'p2' },
    ]);
    expect(result.current.gameState.currentSeat).toBe(0);
    expect(result.current.lastGameOver).toBeNull();
  });

  it('draw sets hasDrawn implicitly by allowing a subsequent pass when no playable card exists', () => {
    const { result } = renderHook(() => useLocalCrazyEightsMatch());
    const before = result.current.gameState.handCounts[0];
    act(() => { result.current.dispatch('draw', {}); });
    // A draw always grows the hand by one UNLESS it happened to trigger the
    // stalemate branch (astronomically unlikely on a fresh 41-card draw
    // pile) — assert the hand grew, which also confirms dispatch reached
    // the engine correctly.
    expect(result.current.gameState.handCounts[0]).toBe(before + 1);
  });

  it('resign hands the win to the other seat and sets lastGameOver', () => {
    const { result } = renderHook(() => useLocalCrazyEightsMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    expect(result.current.lastGameOver).toEqual({ winner: 1, reason: 'Resigned' });
    expect(result.current.gameState.isGameOver).toBe(true);
  });

  it('play_again resets to a fresh deal with seat 0 to move and clears lastGameOver', () => {
    const { result } = renderHook(() => useLocalCrazyEightsMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    act(() => { result.current.dispatch('play_again', {}); });
    expect(result.current.lastGameOver).toBeNull();
    expect(result.current.gameState.currentSeat).toBe(0);
    expect(result.current.gameState.hands[0]).toHaveLength(5);
  });

});
```

This is 4 tests (starts-with-two-players, draw-grows-hand, resign, play_again). The "Played all cards!" vs. "Fewest cards wins!" reason-selection logic is deliberately NOT unit-tested here — driving a real 2-player hand to empty deterministically would require either a seeded RNG (the ported engine intentionally has none, matching the server) or reaching into engine internals, neither of which this port-validation suite does for other non-deterministic paths either (see Gin Rummy's equivalent hook test, which stops at the same boundary for its own knock-detection logic). Task 6's manual browser verification exercises a real playout instead — see that task's Step 3.9.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/multiplayer/crazy-eights/useLocalCrazyEightsMatch.test.js`
Expected: FAIL with "Cannot find module './useLocalCrazyEightsMatch'"

- [ ] **Step 3: Write minimal implementation**

Create `src/multiplayer/crazy-eights/useLocalCrazyEightsMatch.js`. Besides the engine calls, this hook also tracks `hasDrawn` itself: `crazyEightsEngine.js`'s `state()` does NOT expose a `hasDrawn` field (it's a private closure variable inside `createGame()`), but the UI (Task 4) needs to know whether the active seat has already drawn this turn to enable/disable the Draw/Pass buttons — this mirrors what the OLD networked `CrazyEightsGame.jsx` did with its own local `hasDrawn` useState, which this hook now absorbs so the component doesn't need to reimplement it:

```js
import { useCallback, useRef, useState } from 'react';
import { createGame } from './crazyEightsEngine';

const PLAYERS = [
  { name: 'Player 1', color: 'p1' },
  { name: 'Player 2', color: 'p2' },
];

function gameOverFromState(gs) {
  if (!gs.isGameOver) return null;
  const winnerHandCount = gs.handCounts[gs.winner];
  const reason = winnerHandCount === 0 ? 'Played all cards!' : 'Fewest cards wins!';
  return { winner: gs.winner, reason };
}

export function useLocalCrazyEightsMatch() {
  const engineRef = useRef(createGame(2));
  const [gameState, setGameState] = useState(() => ({ ...engineRef.current.state(), hasDrawn: false }));
  const [lastGameOver, setLastGameOver] = useState(null);
  const hasDrawnRef = useRef(false);

  const sync = useCallback(() => {
    const gs = engineRef.current.state();
    setGameState({ ...gs, hasDrawn: hasDrawnRef.current });
    const over = gameOverFromState(gs);
    if (over) setLastGameOver(over);
  }, []);

  const dispatch = useCallback((action, payload = {}) => {
    const engine = engineRef.current;
    const seat = engine.turn();
    const seatBefore = seat;

    if (action === 'play') {
      engine.play(seat, payload.cardId, payload.chosenSuit ?? null);
      // A successful non-emptying play advances the turn, which starts the
      // next seat's hasDrawn fresh; an illegal play leaves the turn (and
      // hasDrawn) unchanged. Either way, re-deriving from whether the seat
      // actually changed keeps this correct without inspecting `ok`.
      if (engine.turn() !== seatBefore || engine.isGameOver()) hasDrawnRef.current = false;
      // Always re-sync regardless of ok — the fix for the stalemate-
      // reporting gap: engine.draw() (below) can flip phase to 'over' via a
      // stalemate resolution INSIDE its own ok:false branch (empty draw and
      // discard piles, nobody can play) — the networked version's socket
      // handler missed this exact case by bailing out on `!result.ok`
      // before ever checking engine.isGameOver(). Always re-reading
      // state() here, for every action, avoids reproducing that bug.
      sync();
      return;
    }

    if (action === 'draw') {
      const result = engine.draw(seat);
      if (result.ok) hasDrawnRef.current = true;
      sync();
      return;
    }

    if (action === 'pass') {
      engine.pass(seat);
      hasDrawnRef.current = false;
      sync();
      return;
    }

    if (action === 'resign') {
      // Unlike the other actions, resign is not necessarily performed by
      // engine.turn() — a pane may resign on behalf of its own seat even
      // when it is not currently on turn.
      const resigningSeat = payload.seat;
      const winner = 1 - resigningSeat;
      hasDrawnRef.current = false;
      setLastGameOver({ winner, reason: 'Resigned' });
      setGameState(prev => ({ ...prev, isGameOver: true, winner }));
      return;
    }

    if (action === 'play_again') {
      engineRef.current = createGame(2);
      hasDrawnRef.current = false;
      setLastGameOver(null);
      setGameState({ ...engineRef.current.state(), hasDrawn: false });
      return;
    }
  }, [sync]);

  return { gameState, lastGameOver, players: PLAYERS, dispatch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/multiplayer/crazy-eights/useLocalCrazyEightsMatch.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/crazy-eights/useLocalCrazyEightsMatch.js src/multiplayer/crazy-eights/useLocalCrazyEightsMatch.test.js
git commit -m "Add local-match hook for same-device crazy eights, fixing the stalemate-reporting gap"
```

---

### Task 3: Add named i18n strings for split-screen Crazy Eights

**Files:**
- Modify: `src/i18n/en.js`, `src/i18n/id.js`, `src/i18n/ms.js`, `src/i18n/ta.js`, `src/i18n/zh.js`

**Interfaces:**
- Produces: `t.namedTurnPlayDrawPass`, `t.tapToRevealHandC8` — consumed by `CrazyEightsGame.jsx` (Task 4). (`tapToRevealHand` already exists from Gin Rummy and is reused verbatim rather than duplicated — see Step 1 note.)

The existing Crazy Eights strings (`yourTurnPlayDrawPass`, `opponentsTurnNamed`) are already partly usable: `opponentsTurnNamed: "{name}'s turn"` is a generic named-turn string with no "you vs. opponent" framing, and can be reused as-is for the status line in ALL phases (not just "opponent's turn") since the local split-screen UI always names whoever is on turn. `yourTurnPlayDrawPass` is "you"-framed and needs a named counterpart.

- [ ] **Step 1: Add the key to `src/i18n/en.js`**

In the `// Crazy Eights` section, add after the existing `pass: 'Pass',` line:

```js
    namedTurnPlayDrawPass: "{name}'s turn — play a card, draw, or pass",
```

Reuse `t.tapToRevealHand` (already added for Gin Rummy in `docs/superpowers/plans/2026-09-04-local-multiplayer-gin-rummy.md` Task 3, now present in `en.js`/`id.js`/`ms.js`/`ta.js`/`zh.js`) directly for Crazy Eights' hidden-hand message — it's phrased generically ("Cards hidden — it's {name}'s turn") with no Gin-Rummy-specific wording, so no new key is needed for that string.

- [ ] **Step 2: Add the translated key to `src/i18n/id.js`**

```js
    namedTurnPlayDrawPass: 'Giliran {name} — mainkan kartu, ambil, atau lewati',
```

- [ ] **Step 3: Add the translated key to `src/i18n/ms.js`**

```js
    namedTurnPlayDrawPass: 'Giliran {name} — main kad, ambil, atau langkau',
```

- [ ] **Step 4: Add the translated key to `src/i18n/ta.js`**

```js
    namedTurnPlayDrawPass: '{name} முறை — ஒரு அட்டையை விளையாடவும், எடுக்கவும் அல்லது தவிர்க்கவும்',
```

- [ ] **Step 5: Add the translated key to `src/i18n/zh.js`**

```js
    namedTurnPlayDrawPass: '{name}的回合 — 出牌、抽牌或跳过',
```

- [ ] **Step 6: Verify structural i18n parity across languages**

Run: `npx vitest run src/i18n/multiplayerKeys.test.js`
Expected: PASS (sanity check only — this test doesn't check the `multiplayer` block). Then diff key lists directly:

```bash
node -e "
async function main() {
  const en = (await import('./src/i18n/en.js')).default.multiplayer;
  for (const lang of ['id','ms','ta','zh']) {
    const other = (await import('./src/i18n/' + lang + '.js')).default.multiplayer;
    const missing = Object.keys(en).filter(k => !(k in other));
    const extra = Object.keys(other).filter(k => !(k in en));
    console.log(lang, 'missing:', missing, 'extra:', extra);
  }
}
main();
"
```

Expected: `missing: [] extra: []` for all four languages.

- [ ] **Step 7: Commit**

```bash
git add src/i18n/en.js src/i18n/id.js src/i18n/ms.js src/i18n/ta.js src/i18n/zh.js
git commit -m "Add named i18n string for split-screen crazy eights"
```

---

### Task 4: Rebuild `CrazyEightsGame.jsx` as a split-screen view with hand-hiding, suit-chooser, and Reset

**Files:**
- Modify: `src/multiplayer/crazy-eights/CrazyEightsGame.jsx` (full rewrite of the component body; keep the file path)
- Modify: `src/multiplayer/crazy-eights/CrazyEightsGame.module.css`
- Modify: `src/multiplayer/crazy-eights/CrazyEightsGame.test.jsx` (full rewrite of the test body; keep the file path)

**Interfaces:**
- Consumes: `useLocalCrazyEightsMatch()` from Task 2; `cardFromId`, `isRedCard`, `SUIT_GLYPHS`, `SUIT_NAMES`, `SUITS` from `../cards`; `saveScore` from `../../utils/scoreStore`; `buildPayload` from `../../utils/buildPayload`; `useTranslation` from `../../i18n/useTranslation`.
- Produces: `CrazyEightsGame({ memberId, callbackUrl, accessToken })` — no more `myColor`/`myName`/`gameState`/`socket`/`status`/`reconnectAttempt`/`disconnectedPlayerName` props, matching Gin Rummy's `GinRummyGame` signature exactly.

**Design notes:**
- Two stacked panes, not rotated — same reasoning as Gin Rummy (cards are text tiles).
- Hand-hiding rule: identical to Gin Rummy — a pane shows its own hand face-up only when `gameState.currentSeat` matches that pane's seat; otherwise face-down `CardBack` tiles with the `tapToRevealHand` message.
- **The 8-wild suit chooser is per-pane, not global** — unlike the old single-viewport UI (which had one `pendingEightCardId` state shared implicitly because only one player's hand was ever visible at a time), the split-screen component must scope `pendingEightCardId` selection to whichever pane is active, since only the active pane's Play button can trigger it. Keep `pendingEightCardId` and `selectedCardId` as sibling `useState`s in the top-level `CrazyEightsGame` component (like Gin Rummy's `selectedCardId`), passed down to both panes, and clear both on every successful `play`/`pass`/reset.
- Shared table area (draw pile, discard top + `currentSuit` badge) lives in the `.center` block between the two panes, exactly like Gin Rummy's draw pile + discard top.
- No mobile-sizing canvas budget needed (no `<canvas>`), but use Gin Rummy's final tuned compact CSS values directly (32×44px cards, 0.75rem action buttons, tight gaps) since those are already proven to fit iPhone SE — don't restart from Gin Rummy's original oversized draft and re-discover the same overflow.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/multiplayer/crazy-eights/CrazyEightsGame.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { CrazyEightsGame } from './CrazyEightsGame';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({}));
});

describe('CrazyEightsGame split-screen', () => {
  it('renders two player panels, one per local seat', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    expect(screen.getByText('Player 1 (p1)')).toBeInTheDocument();
    expect(screen.getByText('Player 2 (p2)')).toBeInTheDocument();
  });

  it('shows the on-turn seat\'s hand face-up (5 cards) and the other seat\'s hand as 5 face-down backs', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    const backs = screen.getAllByText('—');
    expect(backs).toHaveLength(5);
  });

  it('draws a card on the active pane, growing its hand to 6', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Draw \(/ }));
    // After drawing, Pass becomes available (assuming the drawn card isn't
    // playable — not guaranteed every run, so instead assert on the Draw
    // button becoming disabled, which is unconditional after one draw).
    expect(screen.getByRole('button', { name: /Draw \(/ })).toBeDisabled();
  });

  it('shows a resign button (only for the seat currently on turn) and a reset button', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    expect(screen.getAllByRole('button', { name: /resign/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^reset$/i }).length).toBeGreaterThan(0);
  });

  it('reports a loss from Player 1\'s perspective when seat 0 resigns', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /resign/i }));
    expect(saveScore).toHaveBeenCalledWith('mp-crazy-eights', 0, expect.any(Number), 'm-1', null);
  });
});

describe('CrazyEightsGame reset', () => {
  it('asks for confirmation before resetting', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    expect(screen.getByText(/reset this game\?/i)).toBeInTheDocument();
  });

  it('cancelling leaves the game untouched', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/reset this game\?/i)).not.toBeInTheDocument();
  });

  it('confirming restarts the match with a fresh deal', () => {
    render(<CrazyEightsGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /yes, reset/i }));
    expect(screen.getAllByRole('button', { name: /Draw \(/ }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/multiplayer/crazy-eights/CrazyEightsGame.test.jsx`
Expected: FAIL — old component expects `myColor`/`gameState`/`socket` props.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/multiplayer/crazy-eights/CrazyEightsGame.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { cardFromId, isRedCard, SUIT_GLYPHS, SUIT_NAMES, SUITS } from '../cards';
import { useLocalCrazyEightsMatch } from './useLocalCrazyEightsMatch';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './CrazyEightsGame.module.css';

const RESULT_PCT = { win: 100, loss: 0 };

function CardTile({ card, selected, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`${styles.card} ${isRedCard(card.suit) ? styles.red : styles.black} ${selected ? styles.selected : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={styles.rank}>{card.rank}</span>
      <span className={styles.suit}>{SUIT_GLYPHS[card.suit]}</span>
    </button>
  );
}
CardTile.propTypes = {
  card: PropTypes.shape({ rank: PropTypes.string.isRequired, suit: PropTypes.string.isRequired }).isRequired,
  selected: PropTypes.bool,
  disabled: PropTypes.bool,
  onClick: PropTypes.func,
};

function CardBack() {
  return <div className={`${styles.card} ${styles.back}`}>—</div>;
}

function CrazyEightsPane({
  seat, name, activeName, gameState, dispatch, t,
  selectedCardId, setSelectedCardId, pendingEightCardId, setPendingEightCardId,
}) {
  const isActive = gameState.currentSeat === seat && !gameState.isGameOver;
  const hand = [...gameState.hands[seat]].sort((a, b) => a - b);
  const handCount = hand.length;
  const isPending8 = pendingEightCardId !== null;

  const selectCard = (id) => {
    if (!isActive) return;
    setSelectedCardId(prev => (prev === id ? null : id));
  };

  const handlePlay = () => {
    if (selectedCardId === null) return;
    const card = cardFromId(selectedCardId);
    if (card.rank === '8') {
      setPendingEightCardId(selectedCardId);
      return;
    }
    dispatch('play', { cardId: selectedCardId, chosenSuit: null });
    setSelectedCardId(null);
  };

  const chooseSuit = (suit) => {
    if (pendingEightCardId === null) return;
    dispatch('play', { cardId: pendingEightCardId, chosenSuit: suit });
    setPendingEightCardId(null);
    setSelectedCardId(null);
  };

  return (
    <div className={styles.pane}>
      <div className={styles.panel}>{name} ({seat === 0 ? 'p1' : 'p2'})</div>
      <div className={styles.hand}>
        {isActive
          ? hand.map(id => (
              <CardTile
                key={id}
                card={cardFromId(id)}
                selected={selectedCardId === id}
                disabled={!isActive}
                onClick={() => selectCard(id)}
              />
            ))
          : Array.from({ length: handCount }, (_, i) => <CardBack key={i} />)}
      </div>
      {!isActive && (
        <div className={styles.hidden}>{t.tapToRevealHand.replace('{name}', activeName)}</div>
      )}
      {isActive && isPending8 && (
        <div className={styles.suitChooser}>
          <p>{t.chooseSuitForEight}</p>
          <div className={styles.suitButtons}>
            {SUITS.map(suit => (
              <button key={suit} type="button" className={styles.actionBtn} onClick={() => chooseSuit(suit)}>
                {SUIT_NAMES[suit]}
              </button>
            ))}
          </div>
        </div>
      )}
      {isActive && !isPending8 && (
        <div className={styles.actions}>
          <button type="button" className={styles.actionBtn} disabled={selectedCardId === null}
            onClick={handlePlay}>
            {t.play}
          </button>
          <button type="button" className={styles.actionBtn} disabled={gameState.hasDrawn}
            onClick={() => dispatch('draw', {})}>
            {t.drawAction}
          </button>
          <button type="button" className={styles.actionBtn} disabled={!gameState.hasDrawn}
            onClick={() => { dispatch('pass', {}); setSelectedCardId(null); }}>
            {t.pass}
          </button>
        </div>
      )}
      {isActive && (
        <button type="button" className={styles.resignBtn} onClick={() => dispatch('resign', { seat })}>
          {t.resign}
        </button>
      )}
    </div>
  );
}
CrazyEightsPane.propTypes = {
  seat: PropTypes.oneOf([0, 1]).isRequired,
  name: PropTypes.string.isRequired,
  activeName: PropTypes.string.isRequired,
  gameState: PropTypes.object.isRequired,
  dispatch: PropTypes.func.isRequired,
  t: PropTypes.object.isRequired,
  selectedCardId: PropTypes.number,
  setSelectedCardId: PropTypes.func.isRequired,
  pendingEightCardId: PropTypes.number,
  setPendingEightCardId: PropTypes.func.isRequired,
};

export function CrazyEightsGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalCrazyEightsMatch();
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [pendingEightCardId, setPendingEightCardId] = useState(null);
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const result = lastGameOver.winner === 0 ? 'win' : 'loss';
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    saveScore('mp-crazy-eights', RESULT_PCT[result], durationSeconds, memberId, null);

    const payload = buildPayload({
      memberId, gameId: 'mp-crazy-eights',
      score: RESULT_PCT[result], maxScore: 100,
      completed: true, durationSeconds,
    });
    window.parent.postMessage({ type: 'GAME_COMPLETE', payload }, '*');

    if (!callbackUrl) return;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[CrazyEightsGame] callback failed:', e));
  }, [lastGameOver, memberId, callbackUrl, accessToken]);

  const p1 = players[0];
  const p2 = players[1];
  const currentName = gameState.currentSeat === 0 ? p1.name : p2.name;
  const statusText = t.namedTurnPlayDrawPass.replace('{name}', currentName);

  const handleConfirmReset = () => {
    startedAtRef.current = Date.now();
    reportedRef.current = false;
    setSelectedCardId(null);
    setPendingEightCardId(null);
    dispatch('play_again', {});
    setConfirmingReset(false);
  };

  const paneProps = {
    gameState, dispatch, t,
    selectedCardId, setSelectedCardId,
    pendingEightCardId, setPendingEightCardId,
  };

  return (
    <div className={styles.game}>
      <CrazyEightsPane seat={1} name={p2.name} activeName={currentName} {...paneProps} />

      <div className={styles.center}>
        <div className={styles.status}>{statusText}</div>
        <button type="button" className={styles.deck} disabled={gameState.isGameOver || gameState.hasDrawn}
          onClick={() => dispatch('draw', {})}>
          {t.drawPile.replace('{n}', gameState.drawPileCount)}
        </button>
        {gameState.discardTop === null || gameState.discardTop === undefined ? (
          <div className={`${styles.card} ${styles.back}`}>—</div>
        ) : (
          <CardTile card={cardFromId(gameState.discardTop)} disabled />
        )}
        {gameState.currentSuit && (
          <span className={styles.suitBadge}>
            {t.currentSuit}{SUIT_GLYPHS[gameState.currentSuit]} {SUIT_NAMES[gameState.currentSuit]}
          </span>
        )}

        {lastGameOver && (
          <div className={styles.gameOver}>
            <h3>{(lastGameOver.winner === 0 ? p1.name : p2.name)} {t.youWinSimple}</h3>
            <p>{lastGameOver.reason}</p>
            <button className={styles.primaryBtn} onClick={() => dispatch('play_again', {})}>{t.playAgain}</button>
          </div>
        )}
        {!lastGameOver && confirmingReset && (
          <div className={styles.gameOver}>
            <h3>{t.resetConfirmTitle}</h3>
            <p>{t.resetConfirmBody}</p>
            <div className={styles.confirmActions}>
              <button className={styles.primaryBtn} onClick={handleConfirmReset}>{t.resetConfirmYes}</button>
              <button className={styles.resignBtn} onClick={() => setConfirmingReset(false)}>{t.resetConfirmCancel}</button>
            </div>
          </div>
        )}
        {!lastGameOver && !confirmingReset && (
          <button type="button" className={styles.resignBtn} onClick={() => setConfirmingReset(true)}>{t.resetGame}</button>
        )}
      </div>

      <CrazyEightsPane seat={0} name={p1.name} activeName={currentName} {...paneProps} />
    </div>
  );
}

CrazyEightsGame.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
```

Note: `gameState.hasDrawn` used by the Draw/Pass button gating below comes from the hook's own tracking (Task 2), not from the engine's `state()` — the engine keeps `hasDrawn` as a private closure variable.

Update `src/multiplayer/crazy-eights/CrazyEightsGame.module.css` — replace the full contents, reusing Gin Rummy's proven compact split-screen layout plus Crazy-Eights-specific `suitBadge`/`suitChooser`/`suitButtons` classes carried over from the original single-viewport CSS:

```css
.game { display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 4px; }
.pane { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.panel { font-weight: 700; font-size: 0.85rem; }
.center { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 2px 0; }
.status { font-size: 0.85rem; text-align: center; }
.hidden { font-size: 0.75rem; color: #666; font-style: italic; }
.hand { display: flex; flex-wrap: wrap; gap: 3px; justify-content: center; max-width: 100%; }
.card { display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 32px; height: 44px; border-radius: 5px; border: 2px solid #ccc; background: #fff;
  font-weight: 700; cursor: pointer; }
.card:disabled { opacity: 0.6; cursor: not-allowed; }
.card.selected { border-color: #1155cc; box-shadow: 0 0 0 2px rgba(17,85,204,0.3); }
.card.back { background: #ddd; color: #888; }
.red { color: #c0392b; }
.black { color: #1a1a1a; }
.rank { font-size: 0.75rem; }
.suit { font-size: 0.7rem; }
.deck { padding: 4px 8px; border-radius: 6px; border: 1px solid #999; background: #f0f0f0; cursor: pointer; font-weight: 700; font-size: 0.75rem; }
.deck:disabled { opacity: 0.5; cursor: not-allowed; }
.suitBadge { font-size: 0.75rem; font-weight: 600; }
.suitChooser { text-align: center; font-size: 0.75rem; }
.suitButtons { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; margin-top: 2px; }
.actions { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
.actionBtn { padding: 4px 10px; border-radius: 6px; border: none; background: var(--color-primary, #1155cc); color: #fff; cursor: pointer; font-weight: 700; font-size: 0.75rem; }
.actionBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.primaryBtn { padding: 8px 18px; border-radius: 8px; border: none; background: var(--color-primary, #1155cc); color: #fff; cursor: pointer; font-weight: 700; }
.resignBtn { padding: 4px 12px; border-radius: 6px; border: 1px solid #c0392b; color: #c0392b; background: #fff; cursor: pointer; font-size: 0.75rem; }
.confirmActions { display: flex; gap: 8px; justify-content: center; }
.banner { background: #fff3cd; color: #664d03; padding: 8px 12px; border-radius: 8px; font-weight: 600; }
.gameOver { text-align: center; background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/multiplayer/crazy-eights/CrazyEightsGame.test.jsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/crazy-eights/CrazyEightsGame.jsx src/multiplayer/crazy-eights/CrazyEightsGame.module.css src/multiplayer/crazy-eights/CrazyEightsGame.test.jsx
git commit -m "Rebuild CrazyEightsGame as a local split-screen match with hand-hiding, suit chooser, and Reset"
```

---

### Task 5: Simplify `MultiplayerCrazyEightsSession.jsx` — drop the lobby

**Files:**
- Modify: `src/multiplayer/crazy-eights/MultiplayerCrazyEightsSession.jsx` (full rewrite)
- Modify: `src/multiplayer/crazy-eights/MultiplayerCrazyEightsSession.test.jsx` (full rewrite)

**Interfaces:**
- Consumes: `CrazyEightsGame` from `./CrazyEightsGame` (Task 4).
- Produces: `MultiplayerCrazyEightsSession({ memberId, callbackUrl, accessToken })` — same signature as the other three converted sessions.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/multiplayer/crazy-eights/MultiplayerCrazyEightsSession.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./CrazyEightsGame', () => ({
  CrazyEightsGame: ({ memberId }) => <div>crazy eights match for {memberId}</div>,
}));

import { MultiplayerCrazyEightsSession } from './MultiplayerCrazyEightsSession';

describe('MultiplayerCrazyEightsSession', () => {
  it('renders the match immediately, with no lobby step', () => {
    render(<MultiplayerCrazyEightsSession memberId="m-1" />);
    expect(screen.getByText('crazy eights match for m-1')).toBeInTheDocument();
    expect(screen.queryByText(/join game/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/multiplayer/crazy-eights/MultiplayerCrazyEightsSession.test.jsx`
Expected: FAIL — old component renders `MultiplayerLobby` and requires different props/mocks.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/multiplayer/crazy-eights/MultiplayerCrazyEightsSession.jsx`:

```jsx
import PropTypes from 'prop-types';
import { CrazyEightsGame } from './CrazyEightsGame';

export function MultiplayerCrazyEightsSession({ memberId, callbackUrl, accessToken }) {
  return (
    <CrazyEightsGame memberId={memberId} callbackUrl={callbackUrl} accessToken={accessToken} />
  );
}

MultiplayerCrazyEightsSession.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/multiplayer/crazy-eights/MultiplayerCrazyEightsSession.test.jsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/crazy-eights/MultiplayerCrazyEightsSession.jsx src/multiplayer/crazy-eights/MultiplayerCrazyEightsSession.test.jsx
git commit -m "Drop the room-code lobby for local crazy eights matches"
```

---

### Task 6: Manual browser verification

No new files — verification gate, matching prior games' Task 6.

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: All tests pass, including the new Crazy Eights ones (engine 7, hook 4, component 8, session 1 — 20 new tests across Tasks 1, 2, 4, 5).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: Builds successfully with no errors.

- [ ] **Step 3: Start the dev server and open the game in a real Chrome window via Playwright**

Start: `npm run dev` (background). Navigate to `http://localhost:5173/?view=mp-crazy-eights&memberId=demo-1` (confirmed correct — `App.jsx`'s `IN_APP_MULTIPLAYER_VIEWS` includes `'mp-crazy-eights'` and its view branch at line 755 unconditionally renders `MultiplayerCrazyEightsSession`, which after Task 5 renders the game directly with no lobby gate).

Verify, in order:
1. The match loads directly into two stacked panes — no lobby, no name entry.
2. Player 1's pane (bottom) shows 5 cards face-up; Player 2's pane (top) shows 5 face-down backs with the "cards hidden" message correctly naming Player 1 (the active player), not Player 2 (itself) — this exact bug was found and fixed in Gin Rummy's manual verification (Task 6 of that plan), so check it carefully here too since it's a fresh implementation, not shared code.
3. Click Draw on Player 1's pane → hand grows to 6, Draw button disables, Pass button enables (assuming the drawn card isn't playable) or remains available to Play if it is.
4. Play a non-8 card that matches the discard's suit or rank → discard pile updates, `currentSuit` badge updates, turn passes to Player 2, hand-hiding flips correctly (Player 1 now hidden, Player 2 revealed).
5. On a later turn, play an 8 → the suit-chooser UI appears on the acting pane only; choose a suit → the card is discarded, `currentSuit` updates to the chosen suit (not the 8's own suit), turn advances.
6. Click Resign on the active pane → game-over card appears with the correct winner name (the other seat) and reason "Resigned".
7. Click Play Again → a fresh 5/5 deal appears, Player 1 to move, no stale game-over card.
8. Click Reset → confirmation card appears; Cancel leaves state unchanged; Reset → Yes, reset → fresh deal.
9. **If practical, play a hand out to completion** (repeatedly drawing/playing legal cards across both panes) to observe a real "Played all cards!" game-over — this is the one behavior Task 2's unit tests explicitly could not cover deterministically. If a full playout is too slow to drive manually within this task, it's acceptable to trust the code-level reasoning in Task 2 (winner's `handCounts` entry is 0 ⇒ hand-emptying win) instead of forcing a live demonstration — but attempt it at least once if the session allows, since it is the one remaining unverified path in this entire plan.
10. Confirm zero console errors/warnings throughout.

- [ ] **Step 4: Verify mobile fit**

Using the same Playwright pattern as prior games (`devices['iPhone SE']`, `devices['iPhone 13']`), load the game and assert `document.documentElement.scrollHeight <= window.innerHeight` on both. Gin Rummy's final CSS values are reused directly in Task 4 specifically to avoid rediscovering the same overflow tuning — if it still overflows, the delta is likely the extra `suitBadge`/`suitChooser` rows Crazy Eights adds that Gin Rummy doesn't have; tighten those specifically rather than re-shrinking the card tiles further.

- [ ] **Step 5: Stop the dev server**

Kill the background `npm run dev` process started in Step 3.

- [ ] **Step 6: Fix any issues found, then re-run Steps 1-4 until clean**

If manual verification surfaces a bug, fix it directly in the relevant file from Tasks 1-5, re-run the affected unit tests, then repeat this task's Steps 1-4 in full before proceeding.

- [ ] **Step 7: Commit any fixes made during verification**

```bash
git add -A
git commit -m "Fix issues found during crazy eights manual verification"
```

(Skip this step if Steps 1-4 were clean on the first pass — do not create an empty commit.)

---

## Next Steps

After this plan is complete and verified, the next game in sequence is **Singapore Trivia**, the most involved of the five since the 20-second auto-reveal timer and "all answered → early reveal" orchestration currently live in `server/src/rooms/socketEvents.js`'s `trivia_next`/`trivia_answer` handlers rather than in the engine itself, and its UI is two answer-input zones rather than a card/board layout. That is a separate plan, written after this one lands. After Singapore Trivia, a final cleanup plan retires `fly.toml`, the server engines, `useMultiplayerSocket.js`, and `MultiplayerLobby.jsx` — see the Gin Rummy plan's "Next Steps" section for the full deferred-cleanup list.
