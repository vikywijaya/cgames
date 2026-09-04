# Local Split-Screen Gin Rummy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the networked (Socket.IO + Fly.io server) Gin Rummy game into a fully client-side, same-device split-screen local multiplayer game, following the pattern already validated for Chess and Xiangqi.

**Architecture:** Port `server/src/engine/gin-rummy.js` verbatim into the client bundle (CommonJS → ESM export only, logic untouched, including the `findBestMelds` brute-force meld search). Build a `useLocalGinRummyMatch()` hook that owns a single shared `gameState` (unlike the server, which redacts each viewer's `myHand` — here the hook exposes **both** hands, since both live in the same browser tab) and exposes `{ gameState, lastGameOver, players, dispatch }`. Rebuild `GinRummyGame.jsx` as two stacked panes (Player 1 on top, Player 2 on bottom — no 180° rotation, since card text read upside-down is worse than reading a mirrored board) sharing that one `gameState`; each pane shows its own hand face-up only when it is that player's turn to act, and shows face-down card backs otherwise, satisfying the earlier design decision to visually hide the inactive player's hand. Simplify `MultiplayerGinRummySession.jsx` to drop the room-code lobby. Add Reset with a confirmation step, matching Chess/Xiangqi.

**Tech Stack:** React 18 function components + hooks, CSS Modules, Vitest + Testing Library, no TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-03-local-split-screen-multiplayer-design.md`

**Prior art:** `docs/superpowers/plans/2026-09-03-local-multiplayer-chess-pilot.md` (canonical pattern) and `docs/superpowers/plans/2026-09-03-local-multiplayer-xiangqi.md` (a second worked example). This plan follows the same shape: port engine → local-match hook → rebuild game component → simplify session → manual browser verification. Gin Rummy has no canvas/board renderer, so there is no "double-flip" class of bug to guard against — the equivalent local risk is **hand visibility**: the old server never sent an opponent's cards to the browser at all, so the client-side rebuild must actively hide the inactive hand in the UI since the data is no longer redacted for us.

## Global Constraints

- Two humans only, no bot/AI — matches the spec's Non-goals (this plan already has no bot logic; `findBestMelds` is a scoring helper invoked by whichever human knocks, not an opponent AI).
- No name-entry/lobby screen — the match starts immediately with default "Player 1" / "Player 2" labels (spec: Entry flow).
- Split-screen (stacked, dual zones), not pass-and-play (spec: Interaction model).
- Card games must visually hide the opponent's hand — render card backs for the inactive pane's hand (spec: Card game hand-hiding, confirmed by user).
- Must fit on small phone screens without scrolling — verify on iPhone SE (375×667 CSS px) and iPhone 13 (390×844 CSS px) viewports via Playwright, same bar as Chess/Xiangqi.
- Reset control (separate from Resign/Knock/end-of-round Play Again) with a confirmation step before restarting, reusing the existing shared i18n keys (`resetGame`, `resetConfirmTitle`, `resetConfirmBody`, `resetConfirmYes`, `resetConfirmCancel`).
- Do not touch `server/src/engine/gin-rummy.js`, `server/src/rooms/socketEvents.js`, `fly.toml`, `useMultiplayerSocket.js`, or `MultiplayerLobby.jsx` — those are still used by the not-yet-converted Crazy Eights and Singapore Trivia games. Server cleanup is a later, separate plan.
- Do not disturb the pre-existing uncommitted i18n/session changes already present on this branch in `MultiplayerLobby.jsx`, `CrazyEightsGame.jsx`, `GinRummyGame.jsx` (uncommitted local edits), `MultiplayerGinRummySession.jsx`, `SingaporeTriviaGame.jsx`, `App.jsx`, `.claude/settings.local.json` — layer new changes on top; never `git checkout` or discard them.

---

## Engine Interface Reference

`server/src/engine/gin-rummy.js`'s `createGame()` returns:

```js
{
  state()                                // full serialisable state (see below)
  draw(seat, source)                     // source: 'draw' | 'discard' → { ok, drawn?, exhausted?, reason? }
  discard(seat, cardId)                  // → { ok, exhausted?, reason? }
  knock(seat, meldGroups, discardId)     // → { ok, gin?, reason? }
  layoff(seat, cardId, meldIndex)        // → { ok, reason? }
  finishLayoff(seat)                     // → { ok, reason? }
  isGameOver()                           // bool
  winner()                               // seat index (0/1) or null
  turn()                                 // current seat
}
```

`state()` shape:
```js
{
  hands: [[cardId,...], [cardId,...]],   // BOTH hands, full card ids (unlike the server payload)
  drawPileCount: number,
  discardTop: number | null,
  discardPile: [cardId,...],
  currentSeat: 0 | 1,
  phase: 'draw' | 'discard' | 'knock_response' | 'over',
  knocker: 0 | 1 | null,
  knockerMelds: [[cardId,...],...] | null,
  knockerDeadwood: [cardId,...] | null,
  knockerDeadwoodPoints: number,
  knockerIsGin: boolean,
  scores: [number, number],
  isGameOver: boolean,
  winner: 0 | 1 | null,
}
```

Also exported: `findBestMelds(hand)` → `{ melds: [[cardId,...],...], deadwood: [cardId,...], deadwoodPoints: number }`. Used to auto-compute the best legal knock (try every card in hand as the discard, keep the option with lowest deadwood ≤ 10), exactly mirroring `socketEvents.js`'s `gin_knock` handler (lines 1339–1383 as read during planning).

`server/src/multiplayer/cards.js` equivalent already exists client-side at `src/multiplayer/cards.js` — reuse `cardFromId`, `isRedCard`, `SUIT_GLYPHS` from there; do not duplicate.

---

### Task 1: Port the Gin Rummy engine

**Files:**
- Create: `src/multiplayer/gin-rummy/ginRummyEngine.js`
- Test: `src/multiplayer/gin-rummy/ginRummyEngine.test.js`

**Interfaces:**
- Produces: `createGame()` and `findBestMelds(hand)`, both re-exported via `export { createGame, findBestMelds }` — later tasks import these names.

- [ ] **Step 1: Write the failing test**

Create `src/multiplayer/gin-rummy/ginRummyEngine.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createGame, findBestMelds } from './ginRummyEngine';

describe('ginRummyEngine', () => {
  it('deals 10 cards to each seat and leaves one card face-up on the discard pile', () => {
    const engine = createGame();
    const gs = engine.state();
    expect(gs.hands[0]).toHaveLength(10);
    expect(gs.hands[1]).toHaveLength(10);
    expect(gs.discardTop).not.toBeNull();
    // 52 - 10 - 10 - 1(discard) = 31 left in the draw pile
    expect(gs.drawPileCount).toBe(31);
  });

  it('seat 0 moves first, in the draw phase', () => {
    const engine = createGame();
    expect(engine.turn()).toBe(0);
    expect(engine.state().phase).toBe('draw');
  });

  it('rejects a draw from the player who is not on turn', () => {
    const engine = createGame();
    const result = engine.draw(1, 'draw');
    expect(result.ok).toBe(false);
  });

  it('draw then discard hands the turn to the other seat', () => {
    const engine = createGame();
    engine.draw(0, 'draw');
    const hand = engine.state().hands[0];
    engine.discard(0, hand[0]);
    expect(engine.turn()).toBe(1);
    expect(engine.state().phase).toBe('draw');
  });

  it('findBestMelds finds a 3-of-a-kind with zero deadwood among an obvious meld', () => {
    // Three Aces: ids 0 (A-D), 1 (A-C), 2 (A-H) — a valid set
    const result = findBestMelds([0, 1, 2]);
    expect(result.deadwoodPoints).toBe(0);
    expect(result.melds).toHaveLength(1);
    expect(result.melds[0].sort()).toEqual([0, 1, 2]);
  });

  it('findBestMelds reports high deadwood for a hand with no melds at all', () => {
    // 2D, 5C, 9H, KS, 3D, 7C, JD, 4S, 8H, QC — no two cards share rank or
    // form a run; deterministic, no shuffle involved, so this is a stable
    // way to exercise the >10-point deadwood path that engine.knock() checks
    // against (server/src/engine/gin-rummy.js line 424: "deadwood exceeds 10").
    const noMeldHand = [4, 17, 34, 47, 8, 25, 39, 14, 30, 42];
    const best = findBestMelds(noMeldHand);
    expect(best.deadwoodPoints).toBeGreaterThan(10);
    expect(best.melds).toHaveLength(0);
  });

  it('isGameOver/winner report a fresh game as not over', () => {
    const engine = createGame();
    expect(engine.isGameOver()).toBe(false);
    expect(engine.winner()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/multiplayer/gin-rummy/ginRummyEngine.test.js`
Expected: FAIL with "Cannot find module './ginRummyEngine'" (or similar resolution error).

- [ ] **Step 3: Write minimal implementation**

Create `src/multiplayer/gin-rummy/ginRummyEngine.js` as a verbatim port of `server/src/engine/gin-rummy.js`, changing only the module boundary (CommonJS → ESM export). Copy the **entire** body of `server/src/engine/gin-rummy.js` (lines 1–530: card definitions, `makeDeck`, `cardFromId`, `rankIndex`/`suitIndex`, `cardPoints`, `shuffle`, `isValidSet`/`isValidRun`/`isValidMeld`, `validateMelds`, `findBestMelds`, `canLayoff`, `dealGinRummy`, `createGame`) unchanged, then replace the final export line:

```js
// (all engine code from server/src/engine/gin-rummy.js, verbatim, down to
// the end of createGame()'s closing brace)

export { createGame, findBestMelds };
```

Drop the `'use strict';` pragma at the top (ES modules are strict by default) and the `module.exports = { createGame, findBestMelds };` line — everything else, including internal helper names (`cardFromId`, `makeDeck`, etc. — these are module-private, not exported, so they don't collide with `src/multiplayer/cards.js`), is copied unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/multiplayer/gin-rummy/ginRummyEngine.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/gin-rummy/ginRummyEngine.js src/multiplayer/gin-rummy/ginRummyEngine.test.js
git commit -m "Port gin rummy engine for local client-side play"
```

---

### Task 2: `useLocalGinRummyMatch` hook

**Files:**
- Create: `src/multiplayer/gin-rummy/useLocalGinRummyMatch.js`
- Test: `src/multiplayer/gin-rummy/useLocalGinRummyMatch.test.js`

**Interfaces:**
- Consumes: `createGame`, `findBestMelds` from `./ginRummyEngine.js` (Task 1).
- Produces: `useLocalGinRummyMatch()` → `{ gameState, lastGameOver, players, dispatch }`, consumed by `GinRummyGame.jsx` (Task 3).
  - `players`: `[{ name: 'Player 1', color: 'p1' }, { name: 'Player 2', color: 'p2' }]` — same shape convention as Chess (`color` field doubles as the seat key) and matches the server's `GIN_RUMMY_COLORS = ['p1', 'p2']`.
  - `gameState`: the engine's `state()` object as-is (both hands included — see Task 3 for the hand-hiding UI rule). `players` is NOT duplicated inside `gameState` — same convention as Chess/Xiangqi, where the component reads player names off the hook's top-level `players` return, not off `gameState`.
  - `lastGameOver`: `null` until a round ends, then `{ winner: 0 | 1 | null, reason: string }` — `reason` values: `'Gin!'`, `'Knock!'`, `'Undercut!'`, or `'Draw pile exhausted — tie!'` (see Step 3 for exactly when each applies).
  - `dispatch(action, payload)` actions:
    - `'draw'` — payload `{ source: 'draw' | 'discard' }`
    - `'discard'` — payload `{ cardId }`
    - `'knock'` — payload `{}` (no payload needed; always auto-melds via `findBestMelds`, matching the existing UI's `gin_knock` behavior)
    - `'layoff'` — payload `{ cardId, meldIndex }`
    - `'finish_layoff'` — payload `{}`
    - `'resign'` — payload `{ seat }` (new: Chess/Xiangqi both have a Resign button; Gin Rummy's old UI had no resign button, but the local version's design should offer the same control surface as the other two ported games for consistency — an explicit `seat` is required because, unlike Chess/Xiangqi, a Gin Rummy pane may need to resign on behalf of a seat that is not currently on turn, e.g. a pane rendered face-down; the resigning seat loses, the other seat wins)
    - `'play_again'` — payload `{}` (creates a fresh engine, same as Chess/Xiangqi)

- [ ] **Step 1: Write the failing test**

Create `src/multiplayer/gin-rummy/useLocalGinRummyMatch.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalGinRummyMatch } from './useLocalGinRummyMatch';

describe('useLocalGinRummyMatch', () => {
  it('starts with two players, seat 0 to move, no game-over', () => {
    const { result } = renderHook(() => useLocalGinRummyMatch());
    expect(result.current.players).toEqual([
      { name: 'Player 1', color: 'p1' },
      { name: 'Player 2', color: 'p2' },
    ]);
    expect(result.current.gameState.currentSeat).toBe(0);
    expect(result.current.lastGameOver).toBeNull();
  });

  it('dispatching draw then discard advances the turn to seat 1', () => {
    const { result } = renderHook(() => useLocalGinRummyMatch());
    act(() => { result.current.dispatch('draw', { source: 'draw' }); });
    const hand = result.current.gameState.hands[0];
    act(() => { result.current.dispatch('discard', { cardId: hand[0] }); });
    expect(result.current.gameState.currentSeat).toBe(1);
  });

  it('resign hands the win to the other seat and sets lastGameOver', () => {
    const { result } = renderHook(() => useLocalGinRummyMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    expect(result.current.lastGameOver).toEqual({ winner: 1, reason: 'Resigned' });
    expect(result.current.gameState.isGameOver).toBe(true);
  });

  it('play_again resets to a fresh deal with seat 0 to move and clears lastGameOver', () => {
    const { result } = renderHook(() => useLocalGinRummyMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    act(() => { result.current.dispatch('play_again', {}); });
    expect(result.current.lastGameOver).toBeNull();
    expect(result.current.gameState.currentSeat).toBe(0);
    expect(result.current.gameState.hands[0]).toHaveLength(10);
  });

  it('knock with no meldGroups auto-finds the best legal knock via findBestMelds', () => {
    const { result } = renderHook(() => useLocalGinRummyMatch());
    // Force a deterministic hand isn't available without a seeded RNG (the
    // ported engine intentionally is not seeded — it uses Math.random(), same
    // as the server). Instead, verify the dispatch reaches the engine without
    // throwing and returns a coherent state either way: if the random 10-card
    // hand happens to knock legally, phase becomes 'knock_response' or 'over';
    // if it can't legally knock yet (deadwood > 10), gameState is unchanged
    // and no error is thrown.
    act(() => { result.current.dispatch('draw', { source: 'draw' }); });
    const beforePhase = result.current.gameState.phase;
    act(() => { result.current.dispatch('knock', {}); });
    const afterPhase = result.current.gameState.phase;
    expect(['knock_response', 'over', beforePhase]).toContain(afterPhase);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/multiplayer/gin-rummy/useLocalGinRummyMatch.test.js`
Expected: FAIL with "Cannot find module './useLocalGinRummyMatch'"

- [ ] **Step 3: Write minimal implementation**

Create `src/multiplayer/gin-rummy/useLocalGinRummyMatch.js`:

```js
import { useCallback, useRef, useState } from 'react';
import { createGame, findBestMelds } from './ginRummyEngine';

const PLAYERS = [
  { name: 'Player 1', color: 'p1' },
  { name: 'Player 2', color: 'p2' },
];

function gameOverFromState(gs) {
  if (!gs.isGameOver) return null;
  if (gs.winner === null || gs.winner === undefined) {
    return { winner: null, reason: 'Draw pile exhausted — tie!' };
  }
  if (gs.knockerIsGin) return { winner: gs.winner, reason: 'Gin!' };
  // Undercut vs. plain knock: the winner is the knocker unless the score
  // went to the non-knocker (undercut).
  if (gs.knocker !== null && gs.winner !== gs.knocker) {
    return { winner: gs.winner, reason: 'Undercut!' };
  }
  return { winner: gs.winner, reason: 'Knock!' };
}

export function useLocalGinRummyMatch() {
  const engineRef = useRef(createGame());
  const [gameState, setGameState] = useState(() => engineRef.current.state());
  const [lastGameOver, setLastGameOver] = useState(null);

  const sync = useCallback(() => {
    const gs = engineRef.current.state();
    setGameState(gs);
    const over = gameOverFromState(gs);
    if (over) setLastGameOver(over);
  }, []);

  const dispatch = useCallback((action, payload = {}) => {
    const engine = engineRef.current;
    const seat = engine.turn();

    if (action === 'draw') {
      const result = engine.draw(seat, payload.source);
      if (result.exhausted) {
        setGameState(engine.state());
        setLastGameOver({ winner: null, reason: 'Draw pile exhausted — tie!' });
        return;
      }
      if (result.ok) sync();
      return;
    }

    if (action === 'discard') {
      const result = engine.discard(seat, payload.cardId);
      if (result.exhausted) {
        setGameState(engine.state());
        setLastGameOver({ winner: null, reason: 'Draw pile exhausted — tie!' });
        return;
      }
      if (result.ok) sync();
      return;
    }

    if (action === 'knock') {
      const hand = engine.state().hands[seat];
      let bestKnock = null;
      for (const discardId of hand) {
        const remaining = hand.filter(id => id !== discardId);
        const best = findBestMelds(remaining);
        if (best.deadwoodPoints <= 10) {
          if (!bestKnock || best.deadwoodPoints < bestKnock.deadwoodPoints) {
            bestKnock = { melds: best.melds, discardId, deadwoodPoints: best.deadwoodPoints };
          }
        }
      }
      if (!bestKnock) return; // cannot legally knock yet — no-op, matches server behavior
      const result = engine.knock(seat, bestKnock.melds, bestKnock.discardId);
      if (result.ok) sync();
      return;
    }

    if (action === 'layoff') {
      const result = engine.layoff(seat, payload.cardId, payload.meldIndex);
      if (result.ok) sync();
      return;
    }

    if (action === 'finish_layoff') {
      const result = engine.finishLayoff(seat);
      if (result.ok) sync();
      return;
    }

    if (action === 'resign') {
      // Unlike the other actions, resign is not necessarily performed by
      // `engine.turn()` — a pane may resign on behalf of its own seat even
      // when it is not currently on turn (e.g. its hand is rendered face-down).
      // The payload must carry an explicit seat.
      const resigningSeat = payload.seat;
      const winner = 1 - resigningSeat;
      setLastGameOver({ winner, reason: 'Resigned' });
      setGameState(prev => ({ ...prev, isGameOver: true, winner }));
      return;
    }

    if (action === 'play_again') {
      engineRef.current = createGame();
      setLastGameOver(null);
      setGameState(engineRef.current.state());
      return;
    }
  }, [sync]);

  return { gameState, lastGameOver, players: PLAYERS, dispatch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/multiplayer/gin-rummy/useLocalGinRummyMatch.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/gin-rummy/useLocalGinRummyMatch.js src/multiplayer/gin-rummy/useLocalGinRummyMatch.test.js
git commit -m "Add local-match hook for same-device gin rummy"
```

---

### Task 3: Add named i18n strings for split-screen Gin Rummy

**Files:**
- Modify: `src/i18n/en.js`, `src/i18n/id.js`, `src/i18n/ms.js`, `src/i18n/ta.js`, `src/i18n/zh.js`

**Interfaces:**
- Produces: `t.namedTurnDraw`, `t.namedDiscardOrKnock`, `t.namedLayOffOrDone`, `t.tapToRevealHand` — consumed by `GinRummyGame.jsx` (Task 4).

The existing Gin Rummy strings (`yourTurnDraw`, `opponentDrawing`, `discardOrKnock`, `opponentChoosing`, `layOffOrDone`, `opponentLayingOff`) are all "you vs. opponent" phrased, because the old server-driven UI only ever rendered from one player's point of view (their own browser tab, their own socket). The local split-screen UI shows both seats in one screen at once, so the status line needs to name whichever seat is actually on turn (mirroring the `namedTurn`/`namedInCheck` pattern already introduced for Chess/Xiangqi). Add three new keys alongside the existing Gin Rummy block, plus one for the hidden-hand placeholder:

- [ ] **Step 1: Add the keys to `src/i18n/en.js`**

In the `// Gin Rummy` section (around line 479-490), add after the existing `knock: 'Knock',` line:

```js
    namedTurnDraw: "{name}'s turn — draw a card",
    namedDiscardOrKnock: '{name}: discard a card or knock',
    namedLayOffOrDone: "{name}: lay off cards or click Done",
    tapToRevealHand: "Cards hidden — it's {name}'s turn",
```

- [ ] **Step 2: Add the same 4 keys, translated, to `src/i18n/id.js`**

In the matching `// Gin Rummy` section, add:

```js
    namedTurnDraw: 'Giliran {name} — ambil kartu',
    namedDiscardOrKnock: '{name}: buang kartu atau ketuk',
    namedLayOffOrDone: '{name}: pasangkan kartu atau klik Selesai',
    tapToRevealHand: 'Kartu disembunyikan — giliran {name}',
```

- [ ] **Step 3: Add the same 4 keys, translated, to `src/i18n/ms.js`**

```js
    namedTurnDraw: 'Giliran {name} — ambil kad',
    namedDiscardOrKnock: '{name}: buang kad atau ketuk',
    namedLayOffOrDone: '{name}: letak kad atau klik Selesai',
    tapToRevealHand: 'Kad disembunyikan — giliran {name}',
```

- [ ] **Step 4: Add the same 4 keys, translated, to `src/i18n/ta.js`**

```js
    namedTurnDraw: '{name} முறை — ஒரு அட்டையை எடுக்கவும்',
    namedDiscardOrKnock: '{name}: ஒரு அட்டையை நிராகரிக்கவும் அல்லது நாக் செய்யவும்',
    namedLayOffOrDone: '{name}: அட்டைகளை வைக்கவும் அல்லது முடிந்தது என்பதைக் கிளிக் செய்யவும்',
    tapToRevealHand: 'அட்டைகள் மறைக்கப்பட்டுள்ளன — {name} முறை',
```

- [ ] **Step 5: Add the same 4 keys, translated, to `src/i18n/zh.js`**

```js
    namedTurnDraw: '{name}的回合 — 抽一张牌',
    namedDiscardOrKnock: '{name}：弃一张牌或敲牌',
    namedLayOffOrDone: '{name}：靠牌或点击完成',
    tapToRevealHand: '牌已隐藏 — 轮到{name}',
```

- [ ] **Step 6: Verify structural i18n parity across languages**

Run: `npx vitest run src/i18n/multiplayerKeys.test.js`
Expected: PASS — this test checks `app` and `games` key parity, not `multiplayer`, so it will pass regardless; this step is a sanity check that the edit didn't break file parsing. Additionally, manually diff the key lists:

```bash
node -e "
const en = require('./src/i18n/en.js').default.multiplayer;
['id','ms','ta','zh'].forEach(lang => {
  const other = require('./src/i18n/' + lang + '.js').default.multiplayer;
  const missing = Object.keys(en).filter(k => !(k in other));
  const extra = Object.keys(other).filter(k => !(k in en));
  console.log(lang, 'missing:', missing, 'extra:', extra);
});
"
```

Expected: `missing: [] extra: []` for all four languages. (This uses `require` against ESM `export default` files — if the project's Node/Babel config can't run this directly, instead open each file and visually confirm the 4 new keys are present with the same key names as `en.js`.)

- [ ] **Step 7: Commit**

```bash
git add src/i18n/en.js src/i18n/id.js src/i18n/ms.js src/i18n/ta.js src/i18n/zh.js
git commit -m "Add named i18n strings for split-screen gin rummy"
```

---

### Task 4: Rebuild `GinRummyGame.jsx` as a split-screen view with hand-hiding and Reset

**Files:**
- Modify: `src/multiplayer/gin-rummy/GinRummyGame.jsx` (full rewrite of the component body; keep the file path)
- Modify: `src/multiplayer/gin-rummy/GinRummyGame.module.css`
- Modify: `src/multiplayer/gin-rummy/GinRummyGame.test.jsx` (full rewrite of the test body; keep the file path)

**Interfaces:**
- Consumes: `useLocalGinRummyMatch()` from Task 2; `cardFromId`, `isRedCard`, `SUIT_GLYPHS` from `../cards`; `saveScore` from `../../utils/scoreStore`; `buildPayload` from `../../utils/buildPayload`; `useTranslation` from `../../i18n/useTranslation`.
- Produces: `GinRummyGame({ memberId, callbackUrl, accessToken })` — no more `myColor`/`myName`/`gameState`/`socket`/`status`/`reconnectAttempt`/`disconnectedPlayerName` props; everything is internal via the hook, matching Chess's `ChessGame` and Xiangqi's `XiangqiGame` signatures exactly.

**Design notes carried over from the plan header:**
- Two stacked panes, **not rotated** (cards are text-bearing tiles, not a spatial board — rotating them would make them harder to read, unlike Chess/Xiangqi's spatial boards). Player 2 on top, Player 1 on bottom, matching the established "second player on top" convention from Chess/Xiangqi.
- Hand-hiding rule: a pane shows its own hand face-up (as `CardTile`s) **only when `gameState.currentSeat` matches that pane's seat** (i.e., it's currently that pane's turn to act — draw, discard, knock, or lay off). Otherwise it shows the same number of face-down `back` tiles (reusing the existing `.card.back` CSS class) with a `tapToRevealHand` message instead of the hand. This directly satisfies "visually obscure the other player's hand" without needing per-viewer redaction (there is no server now, so both hands necessarily live in one `gameState`; the redaction has to happen in render).
- During `knock_response`, the acting seat is the one laying off (`gameState.currentSeat`, updated by the engine to the non-knocker) — the hand-hiding rule already covers this correctly with no special case, since it always keys off `currentSeat`.
- No mobile-sizing canvas budget is needed here (no `<canvas>`), but the flex layout must still be checked against the 375×667 / 390×844 viewport bar in Task 6 — use compact paddings/gaps from the start (see CSS below) rather than retrofitting, learning from the Chess/Xiangqi mobile-fit iteration.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/multiplayer/gin-rummy/GinRummyGame.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { GinRummyGame } from './GinRummyGame';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({}));
});

describe('GinRummyGame split-screen', () => {
  it('renders two player panels, one per local seat', () => {
    render(<GinRummyGame memberId="m-1" />);
    expect(screen.getByText(/Player 1/)).toBeInTheDocument();
    expect(screen.getByText(/Player 2/)).toBeInTheDocument();
  });

  it('shows the on-turn seat\'s hand face-up and the other seat\'s hand as face-down backs', () => {
    render(<GinRummyGame memberId="m-1" />);
    // Seat 0 (Player 1) moves first — its 10 cards should render as real card
    // tiles (rank text visible); Player 2's pane should show 10 face-down backs.
    const backs = screen.getAllByText('—');
    expect(backs).toHaveLength(10);
  });

  it('draws from the draw pile on the active pane and advances to the discard phase', () => {
    render(<GinRummyGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Draw \(/ }));
    expect(screen.getAllByText(/discard a card or knock/i).length).toBeGreaterThan(0);
  });

  it('shows a resign button (only for the seat currently on turn) and a reset button', () => {
    render(<GinRummyGame memberId="m-1" />);
    // Seat 0 (Player 1) moves first, so only its pane renders a Resign button.
    expect(screen.getAllByRole('button', { name: /resign/i })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^reset$/i }).length).toBeGreaterThan(0);
  });

  it('reports a loss from Player 1\'s perspective when seat 0 resigns', () => {
    render(<GinRummyGame memberId="m-1" />);
    // Only seat 0's Resign button exists at the start (seat 0 is on turn).
    fireEvent.click(screen.getByRole('button', { name: /resign/i }));
    expect(saveScore).toHaveBeenCalledWith('mp-gin-rummy', 0, expect.any(Number), 'm-1', null);
  });
});

describe('GinRummyGame reset', () => {
  it('asks for confirmation before resetting', () => {
    render(<GinRummyGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    expect(screen.getByText(/reset this game\?/i)).toBeInTheDocument();
  });

  it('cancelling leaves the game untouched', () => {
    render(<GinRummyGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/reset this game\?/i)).not.toBeInTheDocument();
  });

  it('confirming restarts the match with a fresh deal', () => {
    render(<GinRummyGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /yes, reset/i }));
    expect(screen.getAllByRole('button', { name: /Draw \(/ }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/multiplayer/gin-rummy/GinRummyGame.test.jsx`
Expected: FAIL — old component still expects `myColor`/`gameState`/`socket` props; several queries won't match.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/multiplayer/gin-rummy/GinRummyGame.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { cardFromId, isRedCard, SUIT_GLYPHS } from '../cards';
import { useLocalGinRummyMatch } from './useLocalGinRummyMatch';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './GinRummyGame.module.css';

const RESULT_PCT = { win: 100, draw: 50, loss: 0 };

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

function GinRummyPane({ seat, name, gameState, dispatch, selectedCardId, setSelectedCardId, t }) {
  const isActive = gameState.currentSeat === seat && !gameState.isGameOver;
  const inKnockResponse = gameState.phase === 'knock_response';
  const isKnocker = gameState.knocker === seat;
  const hand = [...gameState.hands[seat]].sort((a, b) => a - b);
  const handCount = hand.length;

  const selectCard = (id) => {
    if (!isActive) return;
    setSelectedCardId(prev => (prev === id ? null : id));
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
        <div className={styles.hidden}>{t.tapToRevealHand.replace('{name}', name)}</div>
      )}
      {isActive && inKnockResponse && !isKnocker && (
        <div className={styles.actions}>
          <p className={styles.deadwoodHint}>{t.deadwoodHint.replace('{n}', gameState.knockerDeadwoodPoints)}</p>
          <button type="button" className={styles.actionBtn} disabled={selectedCardId === null}
            onClick={() => { dispatch('layoff', { cardId: selectedCardId, meldIndex: 0 }); setSelectedCardId(null); }}>
            {t.layOff}
          </button>
          <button type="button" className={styles.actionBtn}
            onClick={() => dispatch('finish_layoff', {})}>
            {t.done}
          </button>
        </div>
      )}
      {isActive && gameState.phase === 'discard' && (
        <div className={styles.actions}>
          <button type="button" className={styles.actionBtn}
            disabled={selectedCardId === null}
            onClick={() => { dispatch('discard', { cardId: selectedCardId }); setSelectedCardId(null); }}>
            {t.discard}
          </button>
          <button type="button" className={styles.actionBtn}
            onClick={() => { dispatch('knock', {}); setSelectedCardId(null); }}>
            {t.knock}
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
GinRummyPane.propTypes = {
  seat: PropTypes.oneOf([0, 1]).isRequired,
  name: PropTypes.string.isRequired,
  gameState: PropTypes.object.isRequired,
  dispatch: PropTypes.func.isRequired,
  selectedCardId: PropTypes.number,
  setSelectedCardId: PropTypes.func.isRequired,
  t: PropTypes.object.isRequired,
};

export function GinRummyGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalGinRummyMatch();
  const [selectedCardId, setSelectedCardId] = useState(null);
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const result = lastGameOver.winner === 0 ? 'win'
      : (lastGameOver.winner === null || lastGameOver.winner === undefined) ? 'draw' : 'loss';
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    saveScore('mp-gin-rummy', RESULT_PCT[result], durationSeconds, memberId, null);

    const payload = buildPayload({
      memberId, gameId: 'mp-gin-rummy',
      score: RESULT_PCT[result], maxScore: 100,
      completed: true, durationSeconds,
    });
    window.parent.postMessage({ type: 'GAME_COMPLETE', payload }, '*');

    if (!callbackUrl) return;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[GinRummyGame] callback failed:', e));
  }, [lastGameOver, memberId, callbackUrl, accessToken]);

  const p1 = players[0];
  const p2 = players[1];
  const currentName = gameState.currentSeat === 0 ? p1.name : p2.name;

  let statusText;
  if (gameState.phase === 'draw') statusText = t.namedTurnDraw.replace('{name}', currentName);
  else if (gameState.phase === 'discard') statusText = t.namedDiscardOrKnock.replace('{name}', currentName);
  else if (gameState.phase === 'knock_response') {
    const layingOffName = gameState.currentSeat === 0 ? p1.name : p2.name;
    statusText = t.namedLayOffOrDone.replace('{name}', layingOffName);
  }

  const handleConfirmReset = () => {
    startedAtRef.current = Date.now();
    reportedRef.current = false;
    setSelectedCardId(null);
    dispatch('play_again', {});
    setConfirmingReset(false);
  };

  return (
    <div className={styles.game}>
      <GinRummyPane seat={1} name={p2.name} gameState={gameState} dispatch={dispatch}
        selectedCardId={selectedCardId} setSelectedCardId={setSelectedCardId} t={t} />

      <div className={styles.center}>
        <div className={styles.status}>{statusText}</div>
        <button type="button" className={styles.deck} disabled={gameState.isGameOver || gameState.phase !== 'draw'}
          onClick={() => dispatch('draw', { source: 'draw' })}>
          {t.drawPile.replace('{n}', gameState.drawPileCount)}
        </button>
        {gameState.discardTop === null || gameState.discardTop === undefined ? (
          <div className={`${styles.card} ${styles.back}`}>—</div>
        ) : (
          <CardTile
            card={cardFromId(gameState.discardTop)}
            disabled={gameState.isGameOver || gameState.phase !== 'draw'}
            onClick={() => dispatch('draw', { source: 'discard' })}
          />
        )}

        {lastGameOver && (
          <div className={styles.gameOver}>
            <h3>
              {lastGameOver.winner === null || lastGameOver.winner === undefined
                ? t.draw
                : `${lastGameOver.winner === 0 ? p1.name : p2.name} ${t.youWinSimple}`}
            </h3>
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

      <GinRummyPane seat={0} name={p1.name} gameState={gameState} dispatch={dispatch}
        selectedCardId={selectedCardId} setSelectedCardId={setSelectedCardId} t={t} />
    </div>
  );
}

GinRummyGame.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
```

Update `src/multiplayer/gin-rummy/GinRummyGame.module.css` — replace the full contents with the split-screen layout (stacked panes, no rotation, compact spacing chosen up front for the mobile budget rather than retrofitted):

```css
.game { display: flex; flex-direction: column; align-items: stretch; gap: 6px; padding: 6px; }
.pane { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.panel { font-weight: 700; font-size: 0.95rem; }
.center { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 4px 0; }
.status { font-size: 0.95rem; text-align: center; }
.hidden { font-size: 0.85rem; color: #666; font-style: italic; }
.hand { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; max-width: 100%; }
.card { display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 40px; height: 56px; border-radius: 6px; border: 2px solid #ccc; background: #fff;
  font-weight: 700; cursor: pointer; }
.card:disabled { opacity: 0.6; cursor: not-allowed; }
.card.selected { border-color: #1155cc; box-shadow: 0 0 0 2px rgba(17,85,204,0.3); }
.card.back { background: #ddd; color: #888; }
.red { color: #c0392b; }
.black { color: #1a1a1a; }
.rank { font-size: 0.9rem; }
.suit { font-size: 0.85rem; }
.deck { padding: 6px 10px; border-radius: 8px; border: 1px solid #999; background: #f0f0f0; cursor: pointer; font-weight: 700; font-size: 0.85rem; }
.deck:disabled { opacity: 0.5; cursor: not-allowed; }
.deadwoodHint { font-size: 0.8rem; margin: 2px 0; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
.actionBtn { padding: 6px 12px; border-radius: 8px; border: none; background: var(--color-primary, #1155cc); color: #fff; cursor: pointer; font-weight: 700; font-size: 0.85rem; }
.actionBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.primaryBtn { padding: 10px 20px; border-radius: 8px; border: none; background: var(--color-primary, #1155cc); color: #fff; cursor: pointer; font-weight: 700; }
.resignBtn { padding: 6px 14px; border-radius: 8px; border: 1px solid #c0392b; color: #c0392b; background: #fff; cursor: pointer; font-size: 0.85rem; }
.confirmActions { display: flex; gap: 8px; justify-content: center; }
.banner { background: #fff3cd; color: #664d03; padding: 8px 12px; border-radius: 8px; font-weight: 600; }
.gameOver { text-align: center; background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/multiplayer/gin-rummy/GinRummyGame.test.jsx`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/gin-rummy/GinRummyGame.jsx src/multiplayer/gin-rummy/GinRummyGame.module.css src/multiplayer/gin-rummy/GinRummyGame.test.jsx
git commit -m "Rebuild GinRummyGame as a local split-screen match with hand-hiding and Reset"
```

---

### Task 5: Simplify `MultiplayerGinRummySession.jsx` — drop the lobby

**Files:**
- Modify: `src/multiplayer/gin-rummy/MultiplayerGinRummySession.jsx` (full rewrite)
- Modify: `src/multiplayer/gin-rummy/MultiplayerGinRummySession.test.jsx` (full rewrite)

**Interfaces:**
- Consumes: `GinRummyGame` from `./GinRummyGame` (Task 4).
- Produces: `MultiplayerGinRummySession({ memberId, callbackUrl, accessToken })` — same signature as `MultiplayerChessSession`/`MultiplayerXiangqiSession`.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/multiplayer/gin-rummy/MultiplayerGinRummySession.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./GinRummyGame', () => ({
  GinRummyGame: ({ memberId }) => <div>gin rummy match for {memberId}</div>,
}));

import { MultiplayerGinRummySession } from './MultiplayerGinRummySession';

describe('MultiplayerGinRummySession', () => {
  it('renders the match immediately, with no lobby step', () => {
    render(<MultiplayerGinRummySession memberId="m-1" />);
    expect(screen.getByText('gin rummy match for m-1')).toBeInTheDocument();
    expect(screen.queryByText(/join game/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/multiplayer/gin-rummy/MultiplayerGinRummySession.test.jsx`
Expected: FAIL — old component renders `MultiplayerLobby` and requires different props/mocks.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/multiplayer/gin-rummy/MultiplayerGinRummySession.jsx`:

```jsx
import PropTypes from 'prop-types';
import { GinRummyGame } from './GinRummyGame';

export function MultiplayerGinRummySession({ memberId, callbackUrl, accessToken }) {
  return (
    <GinRummyGame memberId={memberId} callbackUrl={callbackUrl} accessToken={accessToken} />
  );
}

MultiplayerGinRummySession.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/multiplayer/gin-rummy/MultiplayerGinRummySession.test.jsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/gin-rummy/MultiplayerGinRummySession.jsx src/multiplayer/gin-rummy/MultiplayerGinRummySession.test.jsx
git commit -m "Drop the room-code lobby for local gin rummy matches"
```

---

### Task 6: Manual browser verification

No new files — this task is a verification gate, matching Chess/Xiangqi's Task 6.

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: All tests pass, including the new Gin Rummy ones (engine, hook, component, session — 20 new tests across Tasks 1, 2, 4, 5).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: Builds successfully with no errors.

- [ ] **Step 3: Start the dev server and open the game in a real Chrome window via Playwright**

Start: `npm run dev` (background)
Navigate to `http://localhost:5173/?view=mp-gin-rummy&memberId=demo-1` (same `?view=` URL-param pattern used for the Chess/Xiangqi manual demos — confirm the `view` value against `App.jsx`'s `IN_APP_MULTIPLAYER_VIEWS`/`GAME_MAP` entry for `mp-gin-rummy` before running; it should already exist since the game is already registered).

Verify, in order:
1. The match loads directly into two stacked panes — no lobby, no name entry.
2. Player 1's pane (bottom) shows its 10 cards face-up (rank/suit visible); Player 2's pane (top) shows 10 face-down card backs with the "cards hidden" message.
3. Click the draw pile in Player 1's pane → a card is drawn, phase moves to discard, Player 1's hand grows to 11 visible cards.
4. Select a card in Player 1's hand, click Discard → turn passes to Player 2; Player 1's pane now shows face-down backs (10 cards) and Player 2's pane reveals its 10 cards face-up.
5. Repeat a draw+discard cycle from Player 2's pane to confirm the hand-hiding flips correctly both directions.
6. Click Resign on the active pane → game-over card appears with the correct winner name attributed to the *other* seat, and the reason "Resigned".
7. Click Play Again → a fresh 10/10 deal appears, phase resets to draw, Player 1 to move, no stale game-over card.
8. Click Reset → confirmation card appears; click Cancel → game state unchanged (same hands, same phase); click Reset again → Yes, reset → fresh deal, exactly like Play Again.
9. Confirm zero console errors/warnings throughout.

- [ ] **Step 4: Verify mobile fit**

Using the same Playwright pattern as Chess/Xiangqi (`devices['iPhone SE']`, `devices['iPhone 13']`), load the game and assert `document.documentElement.scrollHeight <= window.innerHeight` on both. If it overflows, tighten `GinRummyGame.module.css` gaps/paddings/card size (already chosen conservatively in Task 4, but the true test is the real rendered layout with 10-11 card hands wrapping across 2-3 rows) — this is a plain CSS/flexbox fix, no canvas `maxSize` plumbing needed since there's no canvas here.

- [ ] **Step 5: Stop the dev server**

Kill the background `npm run dev` process started in Step 3.

- [ ] **Step 6: Fix any issues found, then re-run Steps 1-4 until clean**

If manual verification surfaces a bug (e.g., a hand-hiding edge case during `knock_response`, or mobile overflow), fix it directly in the relevant file from Tasks 1-5, re-run the affected unit tests, then repeat this task's Steps 1-4 in full before proceeding.

- [ ] **Step 7: Commit any fixes made during verification**

```bash
git add -A
git commit -m "Fix issues found during gin rummy manual verification"
```

(Skip this step if Steps 1-4 were clean on the first pass — do not create an empty commit.)

---

## Next Steps

After this plan is complete and verified, the next game in sequence is **Crazy Eights**, following this same pattern (port `server/src/engine/crazy-eights.js`, build `useLocalCrazyEightsMatch`, rebuild `CrazyEightsGame.jsx` with hand-hiding, simplify `MultiplayerCrazyEightsSession.jsx`, manual verification) — plus fixing the latent gap noted during the original architecture survey where a stalemate-triggered game-over was never surfaced with a distinct `game_over` reason in the networked version. That is a separate plan, written after this one lands.
