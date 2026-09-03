# Local Split-Screen Multiplayer — Xiangqi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Xiangqi from a Socket.IO/Fly.io networked "Play with a Friend" game into a fully client-side, same-device split-screen game (two local players, one stacked-and-rotated board, no network), following the exact pattern validated by the Chess pilot.

**Architecture:** Port `server/src/engine/xiangqi.js` into the client bundle as-is. Replace `useMultiplayerSocket('xiangqi')` with a new local hook, `useLocalXiangqiMatch()`, exposing the same `{ gameState, lastGameOver, players, dispatch }` shape the Chess pilot established. Rebuild `XiangqiGame.jsx` to render two stacked `<XiangqiBoard>` panes (bottom upright, top rotated 180°) sharing one `gameState`, sized to fit small phone screens from the start (learned from the Chess pilot's follow-up fix, not re-discovered here). Delete the room-code lobby — `MultiplayerXiangqiSession` renders straight into the match. Add the same confirmed Reset control the Chess pilot added.

**Tech Stack:** React 18, Vitest + Testing Library (jsdom), CSS Modules, no new dependencies.

**Spec:** [docs/superpowers/specs/2026-09-03-local-split-screen-multiplayer-design.md](../specs/2026-09-03-local-split-screen-multiplayer-design.md)

**Prior art:** [docs/superpowers/plans/2026-09-03-local-multiplayer-chess-pilot.md](2026-09-03-local-multiplayer-chess-pilot.md) — the validated pattern this plan follows. Notable lessons carried forward from executing that plan:
- **Double-flip bug:** `ChessBoard`'s constructor took the actual seat color and internally flipped its drawing for black, which combined with the pane's CSS 180° rotation to visually cancel out but broke click-to-square hit-testing (clicks landed on the mirrored square). The fix was to always construct the board with the upright orientation regardless of seat, letting CSS be the *only* source of the rotated pane's flip. **`XiangqiBoard` has the identical `flipped = playerColor === 'black'` pattern — this plan's Task 3 applies the same fix from the start.**
- **Mobile sizing:** boards sized purely from `window.innerWidth` don't leave room for two stacked panes plus controls on a phone screen without scrolling. The fix added a `maxSize` constructor parameter and a `setMaxSize()` method, driven by a parent-computed `perPaneHeightBudget = (window.innerHeight - RESERVED_VERTICAL_SPACE) / 2`. **`XiangqiBoardCanvas.js` has the identical sizing gap — this plan's Task 1 applies the fix from the start.**
- **Reset control:** the Chess pilot added a confirmed Reset button (separate from Resign) after initial delivery. This plan includes it from the start (Task 4) rather than as a follow-up.

## Global Constraints

- No Socket.IO, no network calls, no `MULTIPLAYER_BASE_URL`, no room codes, no `?room=`/`?color=`/`?name=` URL state for Xiangqi after this plan lands.
- Two local humans only — no bot/AI opponent (spec Non-goals).
- Split-screen layout: two stacked panes, opponent's (black's) pane rotated 180°, both reading from one shared `gameState` (spec Design → Split-screen UI).
- Both boards must fit one phone screen without scrolling (learned from the Chess pilot — not stated in the original spec, but now a binding constraint for every game in this conversion).
- No name-entry/setup screen — the match starts immediately with default labels "Player 1" (red, since Xiangqi's `hostColors: ['red']`) / "Player 2" (black).
- A confirmed Reset control (separate from Resign) must be present from the start, matching the Chess pilot's final shape: clicking Reset shows an inline confirmation before restarting; cancelling leaves the game untouched.
- Completion reporting (`saveScore`, `buildPayload`, `postMessage`, `callbackUrl` POST) must keep firing exactly as it does today.
- Do not touch the in-flight, currently-uncommitted i18n edits already applied to `XiangqiGame.jsx` — layer this plan's changes on top of whatever state that file is in when work starts.
- Do not delete `server/src/engine/xiangqi.js`, `server/src/rooms/socketEvents.js`'s xiangqi handlers, or `fly.toml` in this plan — server-side/deploy cleanup is deferred until all 5 games are ported (spec Non-goals).
- **Xiangqi's ported engine has no `winner()` method** (unlike chess.js) — the local hook must infer the winner from whose turn it is when `isGameOver()` is true: the side to move when no legal moves remain is the loser, so `winner = engine.turn() === 'w' ? 'black' : 'red'`. This mirrors `server/src/rooms/socketEvents.js`'s `gameStatePayload()` fallback (`typeof engine.winner === 'function'` is false for xiangqi). Xiangqi has no stalemate-as-draw concept in this engine — every game-over has a winner.
- **Xiangqi's `move()` takes only `(from, to)`** — no promotion parameter (xiangqi pawns don't promote).
- Colors are `'red'` / `'black'`, not `'white'` / `'black'`. `gameState.turn === 'w'` means **red's** turn.

---

## File Structure

**Create:**
- `src/multiplayer/xiangqi/xiangqiEngine.js` — ported copy of `server/src/engine/xiangqi.js`, converted from CommonJS to an ES module export. Pure game logic, no React.
- `src/multiplayer/xiangqi/xiangqiEngine.test.js` — unit tests for the ported engine (move legality, check/checkmate detection via `isGameOver`, flying-general rule).
- `src/multiplayer/xiangqi/useLocalXiangqiMatch.js` — the local-match hook replacing `useMultiplayerSocket('xiangqi')`.
- `src/multiplayer/xiangqi/useLocalXiangqiMatch.test.js` — unit tests for the hook (move dispatch, turn state, game-over/winner inference, resign, reset).

**Modify:**
- `src/multiplayer/xiangqi/XiangqiBoardCanvas.js` — add the `maxSize` constructor parameter and `setMaxSize()` method (identical shape to Chess's `ChessBoard` fix).
- `src/multiplayer/xiangqi/XiangqiGame.jsx` — rebuilt to render two stacked, oppositely-oriented panes off one `gameState`, call the hook's `dispatch` instead of `socket.emit`, size boards to fit the viewport height, and include the confirmed Reset control.
- `src/multiplayer/xiangqi/XiangqiGame.module.css` — split-screen layout rules (stacked panes, 180° rotation, mobile-fit spacing) — copy the tuned values from `ChessGame.module.css` since both boards have similar aspect ratios and control strips.
- `src/multiplayer/xiangqi/MultiplayerXiangqiSession.jsx` — drop the lobby/URL-reflection logic, use `useLocalXiangqiMatch()` directly, render `XiangqiGame` immediately.
- `src/multiplayer/xiangqi/XiangqiGame.test.jsx` — rewritten to remove socket/reconnect-banner tests, add split-screen-pane assertions, win/loss/draw scoring assertions, and Reset-confirmation assertions per the Chess pilot's test shape.
- `src/multiplayer/xiangqi/MultiplayerXiangqiSession.test.jsx` — rewritten to assert the match renders immediately (no lobby step).
- `src/i18n/en.js`, `src/i18n/id.js`, `src/i18n/ms.js`, `src/i18n/ta.js`, `src/i18n/zh.js` — no new keys needed. `namedTurn`/`namedInCheck`/`resetGame`/`resetConfirmTitle`/`resetConfirmBody`/`resetConfirmYes`/`resetConfirmCancel` already exist (added during the Chess pilot, under the shared `// Chess / Xiangqi` and "Shared in-game" comment groups) and are reused verbatim.

**Not modified in this plan (left for the final cleanup phase after all 5 games are ported, per spec Non-goals):**
- `server/src/engine/xiangqi.js`, `server/src/rooms/socketEvents.js`, `fly.toml`, `src/multiplayer/useMultiplayerSocket.js` (still used by the 3 remaining un-converted games), `src/shared/multiplayerGames.js`, `src/multiplayer/MultiplayerLobby.jsx` (still used by Gin Rummy/Crazy Eights/Singapore Trivia).

---

### Task 1: Port the xiangqi engine to the client

**Files:**
- Create: `src/multiplayer/xiangqi/xiangqiEngine.js`
- Test: `src/multiplayer/xiangqi/xiangqiEngine.test.js`

**Interfaces:**
- Produces: `createGame()` → `{ move(from, to), undo(), fen(), turn(), inCheck(), isGameOver(), legalMoves(square), boardState() }`, and `export const INITIAL_FEN`. **No `winner()` method** — this is intentional and matches the server engine exactly; winner inference happens in the hook (Task 2), not here.
- Consumes: nothing (pure module, no imports beyond itself).

- [ ] **Step 1: Copy the server engine file verbatim, converting the export**

Copy the full body of `server/src/engine/xiangqi.js` (all functions: `parseFen`, `boardToFen`, `isRed`, `isBlack`, `sameColor`, `inBoard`, `inPalace`, `getLegalMoves`, `findKing`, `isInCheck`, `applyMove`, `isGameOver`, `createGame`) into `src/multiplayer/xiangqi/xiangqiEngine.js` unchanged, **except** the final export line:

```js
// server/src/engine/xiangqi.js ends with:
module.exports = { createGame, INITIAL_FEN };
```

becomes, in `src/multiplayer/xiangqi/xiangqiEngine.js`:

```js
export { createGame, INITIAL_FEN };
```

Also delete the leading `'use strict';` line, and update the file's top comment to:

```js
/**
 * Client-side Xiangqi engine — ported verbatim from
 * server/src/engine/xiangqi.js for local (same-device) play. No server
 * involvement: this is now the sole source of truth for move legality.
 * Board is a 10-row x 9-col array (row 0 = Black's back rank, row 9 = Red's back rank).
 * Piece notation: uppercase = Red, lowercase = Black
 *   K/k = General (將/帅)  A/a = Advisor (士)  B/b = Elephant/Bishop (象)
 *   N/n = Horse (馬)       R/r = Chariot (車)  C/c = Cannon (炮)  P/p = Pawn (兵/卒)
 */
```

- [ ] **Step 2: Write failing tests for the ported engine**

```js
// src/multiplayer/xiangqi/xiangqiEngine.test.js
import { describe, it, expect } from 'vitest';
import { createGame, INITIAL_FEN } from './xiangqiEngine';

describe('xiangqiEngine', () => {
  it('starts at the standard initial position with red to move', () => {
    const game = createGame();
    expect(game.fen()).toBe(INITIAL_FEN);
    expect(game.turn()).toBe('w'); // 'w' = red
    expect(game.isGameOver()).toBe(false);
  });

  it('accepts a legal cannon move and switches turn', () => {
    const game = createGame();
    // Red cannon at row7,col1 moves along the row to row7,col4 (no pieces in the way)
    const result = game.move([7, 1], [7, 4]);
    expect(result).toEqual({ ok: true });
    expect(game.turn()).toBe('b');
  });

  it('rejects moving a piece that is not yours', () => {
    const game = createGame();
    const result = game.move([2, 1], [2, 4]); // black cannon, red's turn
    expect(result.ok).toBe(false);
  });

  it('rejects an illegal move for the piece', () => {
    const game = createGame();
    // Advisor can't move outside the palace
    const result = game.move([9, 3], [8, 2]);
    expect(result.ok).toBe(false);
  });

  it('legalMoves returns an empty array for an empty square', () => {
    const game = createGame();
    expect(game.legalMoves([4, 4])).toEqual([]);
  });

  it('undo reverts the last move', () => {
    const game = createGame();
    game.move([7, 1], [7, 4]);
    expect(game.turn()).toBe('b');
    const undone = game.undo();
    expect(undone).toBe(true);
    expect(game.fen()).toBe(INITIAL_FEN);
  });

  it('has no winner() method — winner inference happens in the local hook', () => {
    const game = createGame();
    expect(typeof game.winner).toBe('undefined');
  });
});
```

- [ ] **Step 3: Run the tests to verify they pass (verbatim port, not new logic)**

Run: `npx vitest run src/multiplayer/xiangqi/xiangqiEngine.test.js`
Expected: All tests PASS immediately, since Step 1 copied working, already-tested-in-production logic. If any test fails, the copy in Step 1 diverged from the server source; diff against `server/src/engine/xiangqi.js` and fix.

- [ ] **Step 4: Commit**

```bash
git add src/multiplayer/xiangqi/xiangqiEngine.js src/multiplayer/xiangqi/xiangqiEngine.test.js
git commit -m "Port xiangqi rules engine to the client for local play"
```

---

### Task 2: Build the local match hook

**Files:**
- Create: `src/multiplayer/xiangqi/useLocalXiangqiMatch.js`
- Test: `src/multiplayer/xiangqi/useLocalXiangqiMatch.test.js`

**Interfaces:**
- Consumes: `createGame` from `./xiangqiEngine` (Task 1).
- Produces: `useLocalXiangqiMatch()` → `{ gameState, lastGameOver, players, dispatch }` where:
  - `gameState` is `{ fen, turn, inCheck, isGameOver, lastMove }` (no `winner` field here — that only exists on `lastGameOver`, computed by the hook since the engine has no `winner()`).
  - `lastGameOver` is `null` until the game ends, then `{ winner: 'red'|'black', reason: string }`. Unlike chess, there is no `'draw'` case — `isGameOver()` true always means the side to move has no legal moves, so the other side wins.
  - `players` is `[{ name: 'Player 1', color: 'red' }, { name: 'Player 2', color: 'black' }]`.
  - `dispatch(action, payload)` where `action` is `'make_move'` (`payload: { from, to }` — **no `promotion` field**), `'resign'` (no payload — resigns whichever color is currently to move), or `'play_again'` (no payload, resets the match).

- [ ] **Step 1: Write the failing test**

```js
// src/multiplayer/xiangqi/useLocalXiangqiMatch.test.js
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLocalXiangqiMatch } from './useLocalXiangqiMatch';

describe('useLocalXiangqiMatch', () => {
  it('starts with the initial position and two fixed local players', () => {
    const { result } = renderHook(() => useLocalXiangqiMatch());
    expect(result.current.gameState.turn).toBe('w');
    expect(result.current.gameState.isGameOver).toBe(false);
    expect(result.current.lastGameOver).toBe(null);
    expect(result.current.players).toEqual([
      { name: 'Player 1', color: 'red' },
      { name: 'Player 2', color: 'black' },
    ]);
  });

  it('applies a legal move and updates turn/lastMove', () => {
    const { result } = renderHook(() => useLocalXiangqiMatch());
    act(() => {
      result.current.dispatch('make_move', { from: [7, 1], to: [7, 4] });
    });
    expect(result.current.gameState.turn).toBe('b');
    expect(result.current.gameState.lastMove).toEqual({ from: [7, 1], to: [7, 4] });
  });

  it('ignores an illegal move and leaves state unchanged', () => {
    const { result } = renderHook(() => useLocalXiangqiMatch());
    const before = result.current.gameState;
    act(() => {
      result.current.dispatch('make_move', { from: [9, 3], to: [8, 2] }); // advisor out of palace
    });
    expect(result.current.gameState.fen).toBe(before.fen);
    expect(result.current.gameState.turn).toBe('w');
  });

  it('resign ends the game with the other color as winner', () => {
    const { result } = renderHook(() => useLocalXiangqiMatch());
    act(() => { result.current.dispatch('resign'); }); // red to move resigns
    expect(result.current.lastGameOver).toEqual({ winner: 'black', reason: 'Red resigned' });
  });

  it('play_again resets to a fresh initial position', () => {
    const { result } = renderHook(() => useLocalXiangqiMatch());
    act(() => { result.current.dispatch('make_move', { from: [7, 1], to: [7, 4] }); });
    act(() => { result.current.dispatch('play_again'); });
    expect(result.current.gameState.turn).toBe('w');
    expect(result.current.lastGameOver).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/multiplayer/xiangqi/useLocalXiangqiMatch.test.js`
Expected: FAIL with "Failed to resolve import './useLocalXiangqiMatch'" (module doesn't exist yet).

- [ ] **Step 3: Implement the hook**

```js
// src/multiplayer/xiangqi/useLocalXiangqiMatch.js
import { useCallback, useRef, useState } from 'react';
import { createGame } from './xiangqiEngine';

const PLAYERS = [
  { name: 'Player 1', color: 'red' },
  { name: 'Player 2', color: 'black' },
];

function snapshot(engine, lastMove) {
  return {
    fen: engine.fen(),
    turn: engine.turn(),
    inCheck: engine.inCheck(),
    isGameOver: engine.isGameOver(),
    lastMove: lastMove || null,
  };
}

// xiangqi.js has no winner() — the side to move when isGameOver() is true
// has no legal moves left, so the OTHER side wins. There is no draw case.
function gameOverResult(engine) {
  if (!engine.isGameOver()) return null;
  const winner = engine.turn() === 'w' ? 'black' : 'red';
  return { winner, reason: 'Checkmate' };
}

export function useLocalXiangqiMatch() {
  const engineRef = useRef(createGame());
  const [gameState, setGameState] = useState(() => snapshot(engineRef.current, null));
  const [lastGameOver, setLastGameOver] = useState(null);

  const dispatch = useCallback((action, payload) => {
    const engine = engineRef.current;

    if (action === 'make_move') {
      const { from, to } = payload;
      const result = engine.move(from, to);
      if (!result.ok) return;
      setGameState(snapshot(engine, { from, to }));
      const over = gameOverResult(engine);
      if (over) setLastGameOver(over);
      return;
    }

    if (action === 'resign') {
      const resigningColor = engine.turn() === 'w' ? 'Red' : 'Black';
      const winner = engine.turn() === 'w' ? 'black' : 'red';
      setLastGameOver({ winner, reason: `${resigningColor} resigned` });
      return;
    }

    if (action === 'play_again') {
      engineRef.current = createGame();
      setGameState(snapshot(engineRef.current, null));
      setLastGameOver(null);
    }
  }, []);

  return { gameState, lastGameOver, players: PLAYERS, dispatch };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/multiplayer/xiangqi/useLocalXiangqiMatch.test.js`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/xiangqi/useLocalXiangqiMatch.js src/multiplayer/xiangqi/useLocalXiangqiMatch.test.js
git commit -m "Add local-match hook for same-device xiangqi"
```

---

### Task 3: Add mobile-fit sizing to XiangqiBoardCanvas

**Files:**
- Modify: `src/multiplayer/xiangqi/XiangqiBoardCanvas.js`

**Interfaces:**
- Produces: `XiangqiBoard`'s constructor gains a third parameter, `maxSize = 560`, used as the width cap (height is derived as `size * 10/9` exactly as today, just from the new capped width). A new `setMaxSize(maxSize)` method updates the cap and calls `resize()`. This exactly mirrors the Chess pilot's `ChessBoard` fix (`src/multiplayer/chess/ChessBoardCanvas.js`).

This task exists as its own step (rather than folded into Task 5's UI rebuild) because it's a self-contained, independently testable change to the canvas class, following the plan's own file-structure guidance to split by responsibility.

- [ ] **Step 1: Modify the constructor and `_setupCanvas`**

In `src/multiplayer/xiangqi/XiangqiBoardCanvas.js`, change:

```js
  constructor(canvas, playerColor) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.playerColor = playerColor; // 'red' | 'black' | 'spectator'
    this.flipped = playerColor === 'black'; // Black sees board flipped
```

to:

```js
  constructor(canvas, playerColor, maxSize = 560) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.playerColor = playerColor; // 'red' | 'black' | 'spectator'
    this.flipped = playerColor === 'black'; // Black sees board flipped
    this.maxSize = maxSize;
```

and change:

```js
  _setupCanvas() {
    const size = Math.min(window.innerWidth - 32, 560);
    this.canvas.width = size;
    this.canvas.height = Math.round(size * 10 / 9);
    this._calcMetrics();
  }
```

to:

```js
  _setupCanvas() {
    const size = Math.min(window.innerWidth - 32, this.maxSize);
    this.canvas.width = size;
    this.canvas.height = Math.round(size * 10 / 9);
    this._calcMetrics();
  }

  /** Update the size cap (e.g. on window resize) and redraw at the new size. */
  setMaxSize(maxSize) {
    this.maxSize = maxSize;
    this.resize();
  }
```

- [ ] **Step 2: Run the existing canvas test to verify no regression**

Run: `npx vitest run src/multiplayer/xiangqi/XiangqiBoardCanvas.test.js`
Expected: PASS — the existing test constructs `new XiangqiBoard(canvas, color)` with 2 args, which still works since `maxSize` defaults to 560.

- [ ] **Step 3: Commit**

```bash
git add src/multiplayer/xiangqi/XiangqiBoardCanvas.js
git commit -m "Add mobile-fit size cap to XiangqiBoard"
```

---

### Task 4: Rebuild XiangqiGame.jsx as a split-screen view with Reset

**Files:**
- Modify: `src/multiplayer/xiangqi/XiangqiGame.jsx`
- Modify: `src/multiplayer/xiangqi/XiangqiGame.module.css`
- Test: `src/multiplayer/xiangqi/XiangqiGame.test.jsx` (rewritten)

**Interfaces:**
- Consumes: `useLocalXiangqiMatch()`'s return shape from Task 2; `XiangqiBoard` from `./XiangqiBoardCanvas` (Task 3's `maxSize`-aware constructor and `setMaxSize()`); `legalMovesFor`, `parseFenBoard` from `./xiangqiMoves` (unchanged); `saveScore` from `../../utils/scoreStore`; `buildPayload` from `../../utils/buildPayload`; `useTranslation` from `../../i18n/useTranslation` (reusing `namedTurn`/`namedInCheck`/`draw`/`youWinSimple`/`resign`/`playAgain`/`resetGame`/`resetConfirmTitle`/`resetConfirmBody`/`resetConfirmYes`/`resetConfirmCancel` — all already defined in every locale file from the Chess pilot).
- Produces: `XiangqiGame` takes `{ memberId, callbackUrl, accessToken }` only (no `myColor`/`gameState`/`socket`/`status`/`reconnectAttempt`/`disconnectedPlayerName` props) — identical shape to `ChessGame`.

Scoring note: report from **red's perspective** (the seat mapped to engine turn `'w'`), matching Chess's white-perspective convention: `result = lastGameOver.winner === 'red' ? 'win' : 'loss'` (no draw case for xiangqi, per the Global Constraints above).

Board-orientation note: exactly like the Chess pilot's fix, **always construct `XiangqiBoard` with `'red'`** (the upright orientation) regardless of which pane it's in — the CSS 180° rotation on black's pane is the sole source of that pane's visual flip. Passing the actual seat color would reintroduce the double-flip click-mapping bug the Chess pilot found and fixed.

- [ ] **Step 1: Write the failing test**

```jsx
// src/multiplayer/xiangqi/XiangqiGame.test.jsx (replaces the old socket-based file)
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { XiangqiGame } from './XiangqiGame';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({}));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  }));
});

describe('XiangqiGame split-screen', () => {
  it('renders two player panels, one per local seat', () => {
    render(<XiangqiGame memberId="m-1" />);
    expect(screen.getByText('Player 1 (red)')).toBeInTheDocument();
    expect(screen.getByText('Player 2 (black)')).toBeInTheDocument();
  });

  it('renders two canvases (one board per pane)', () => {
    const { container } = render(<XiangqiGame memberId="m-1" />);
    expect(container.querySelectorAll('canvas')).toHaveLength(2);
  });

  it('shows a resign button and a reset button while the game is in progress', () => {
    render(<XiangqiGame memberId="m-1" />);
    expect(screen.getAllByRole('button', { name: /resign/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^reset$/i }).length).toBeGreaterThan(0);
  });

  it('reports red-perspective score on red win', () => {
    render(<XiangqiGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]); // red is to move, resigns
    expect(saveScore).toHaveBeenCalledWith('mp-xiangqi', 0, expect.any(Number), 'm-1', null);
  });
});

describe('XiangqiGame reset', () => {
  it('asks for confirmation before resetting', () => {
    render(<XiangqiGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    expect(screen.getByText(/reset this game\?/i)).toBeInTheDocument();
  });

  it('cancelling leaves the game untouched', () => {
    render(<XiangqiGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/reset this game\?/i)).not.toBeInTheDocument();
  });

  it('confirming restarts the match', () => {
    render(<XiangqiGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /yes, reset/i }));
    expect(screen.getByText("Player 1's turn")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/multiplayer/xiangqi/XiangqiGame.test.jsx`
Expected: FAIL — `XiangqiGame` still requires the old socket-based props and renders a single pane with no Reset button.

- [ ] **Step 3: Implement the split-screen component**

```jsx
// src/multiplayer/xiangqi/XiangqiGame.jsx
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { XiangqiBoard } from './XiangqiBoardCanvas';
import { legalMovesFor, parseFenBoard } from './xiangqiMoves';
import { useLocalXiangqiMatch } from './useLocalXiangqiMatch';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './XiangqiGame.module.css';

const RESULT_PCT = { win: 100, loss: 0 };

// Vertical space reserved for the two panel name labels and the middle
// status/resign/reset/game-over strip, so both boards fit on one screen
// without scrolling. Same value as the Chess pilot (similar control strip).
const RESERVED_VERTICAL_SPACE = 260;

function computeMaxBoardSize() {
  // Xiangqi's board is 10 rows x 9 cols (height = width * 10/9), so the
  // width cap must leave room for the taller aspect ratio within the
  // per-pane height budget.
  const perPaneHeightBudget = (window.innerHeight - RESERVED_VERTICAL_SPACE) / 2;
  const widthFromHeightBudget = perPaneHeightBudget * 9 / 10;
  return Math.max(160, Math.min(560, widthFromHeightBudget));
}

function XiangqiPane({ color, name, gameState, dispatch, rotated, maxSize }) {
  const canvasRef = useRef(null);
  const boardRef = useRef(null);

  useEffect(() => {
    // Always draw upright ('red' orientation) — the CSS 180° rotation on the
    // black pane (via `rotated`) is the sole source of that pane's visual
    // flip. See the Chess pilot's ChessGame.jsx for the full rationale:
    // passing the actual seat color here would double-flip rendering
    // (harmlessly) but NOT click coordinates, since hit-testing reflects the
    // rotated element while `_toBoard` assumes an unrotated, unflipped canvas.
    const board = new XiangqiBoard(canvasRef.current, 'red', maxSize);
    board.onPieceSelect = ([r, c]) => {
      const currentBoard = boardRef.current?.board;
      if (!currentBoard) return [];
      const piece = currentBoard[r][c];
      if (!piece) return [];
      const pieceIsRed = piece === piece.toUpperCase();
      if ((color === 'red') !== pieceIsRed) return [];
      return legalMovesFor(currentBoard, r, c);
    };
    board.onMove = (from, to) => {
      dispatch('make_move', { from, to });
    };
    boardRef.current = board;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, dispatch]);

  useEffect(() => {
    boardRef.current?.setMaxSize(maxSize);
  }, [maxSize]);

  useEffect(() => {
    if (!gameState || !boardRef.current) return;
    const board = parseFenBoard(gameState.fen);
    boardRef.current.updateBoard(board, gameState.lastMove || null);
  }, [gameState]);

  return (
    <div className={`${styles.pane} ${rotated ? styles.paneRotated : ''}`}>
      <div className={styles.panel}>{name} ({color})</div>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
XiangqiPane.propTypes = {
  color: PropTypes.oneOf(['red', 'black']).isRequired,
  name: PropTypes.string.isRequired,
  gameState: PropTypes.object,
  dispatch: PropTypes.func.isRequired,
  rotated: PropTypes.bool,
  maxSize: PropTypes.number.isRequired,
};

export function XiangqiGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalXiangqiMatch();
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);
  const [maxBoardSize, setMaxBoardSize] = useState(computeMaxBoardSize);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    const onResize = () => setMaxBoardSize(computeMaxBoardSize());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const result = lastGameOver.winner === 'red' ? 'win' : 'loss';
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    saveScore('mp-xiangqi', RESULT_PCT[result], durationSeconds, memberId, null);

    const payload = buildPayload({
      memberId, gameId: 'mp-xiangqi',
      score: RESULT_PCT[result], maxScore: 100,
      completed: true, durationSeconds,
    });
    window.parent.postMessage({ type: 'GAME_COMPLETE', payload }, '*');

    if (!callbackUrl) return;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[XiangqiGame] callback failed:', e));
  }, [lastGameOver, memberId, callbackUrl, accessToken]);

  const red = players.find(p => p.color === 'red');
  const black = players.find(p => p.color === 'black');
  const turnLabel = gameState.turn === 'w' ? red.name : black.name;
  const turnStatus = gameState.inCheck
    ? t.namedInCheck.replace('{name}', turnLabel)
    : t.namedTurn.replace('{name}', turnLabel);

  const handleConfirmReset = () => {
    startedAtRef.current = Date.now();
    reportedRef.current = false;
    dispatch('play_again');
    setConfirmingReset(false);
  };

  return (
    <div className={styles.game}>
      <XiangqiPane color="black" name={black.name} gameState={gameState} dispatch={dispatch} maxSize={maxBoardSize} rotated />

      <div className={styles.center}>
        <div className={styles.status}>{turnStatus}</div>
        {lastGameOver && (
          <div className={styles.gameOver}>
            <h3>{(lastGameOver.winner === 'red' ? red.name : black.name)} {t.youWinSimple}</h3>
            <p>{lastGameOver.reason}</p>
            <button className={styles.primaryBtn} onClick={() => dispatch('play_again')}>{t.playAgain}</button>
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
          <div className={styles.controls}>
            <button className={styles.resignBtn} onClick={() => dispatch('resign')}>{t.resign}</button>
            <button className={styles.resignBtn} onClick={() => setConfirmingReset(true)}>{t.resetGame}</button>
          </div>
        )}
      </div>

      <XiangqiPane color="red" name={red.name} gameState={gameState} dispatch={dispatch} maxSize={maxBoardSize} />
    </div>
  );
}

XiangqiGame.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
```

- [ ] **Step 4: Write the split-screen + mobile-fit CSS**

Create/replace `src/multiplayer/xiangqi/XiangqiGame.module.css` with (copied from the Chess pilot's tuned `ChessGame.module.css`, keeping any existing xiangqi-specific rules for `.canvas`/`.banner`/`.gameOver`/`.primaryBtn`/`.resignBtn` if they differ cosmetically — check the current file first and merge rather than blindly overwrite):

```css
.game { display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 4px; }
.pane { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.paneRotated { transform: rotate(180deg); }
.center { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 4px 0; }
.panel { font-weight: 700; font-size: 0.95rem; }
.status { font-size: 1rem; }
.canvas { max-width: 100%; touch-action: none; }
.banner { background: #fff3cd; color: #664d03; padding: 8px 12px; border-radius: 8px; font-weight: 600; }
.gameOver { text-align: center; background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
.primaryBtn { padding: 10px 20px; border-radius: 8px; border: none; background: var(--color-primary, #1155cc); color: #fff; cursor: pointer; font-weight: 700; }
.resignBtn { padding: 8px 16px; border-radius: 8px; border: 1px solid #c0392b; color: #c0392b; background: #fff; cursor: pointer; }
.controls { display: flex; gap: 8px; }
.confirmActions { display: flex; gap: 8px; justify-content: center; }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/multiplayer/xiangqi/XiangqiGame.test.jsx`
Expected: PASS (all 7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/multiplayer/xiangqi/XiangqiGame.jsx src/multiplayer/xiangqi/XiangqiGame.module.css src/multiplayer/xiangqi/XiangqiGame.test.jsx
git commit -m "Rebuild XiangqiGame as a local split-screen match with Reset"
```

---

### Task 5: Simplify MultiplayerXiangqiSession (drop the lobby)

**Files:**
- Modify: `src/multiplayer/xiangqi/MultiplayerXiangqiSession.jsx`
- Test: `src/multiplayer/xiangqi/MultiplayerXiangqiSession.test.jsx` (rewritten)

**Interfaces:**
- Consumes: `XiangqiGame` from `./XiangqiGame` (Task 4), which now takes `{ memberId, callbackUrl, accessToken }` only.
- Produces: `MultiplayerXiangqiSession` keeps its existing external prop contract (`{ memberId, callbackUrl, accessToken }`, consumed by `App.jsx`'s `view === 'mp-xiangqi'` branch — no change needed there).

- [ ] **Step 1: Write the failing test**

```jsx
// src/multiplayer/xiangqi/MultiplayerXiangqiSession.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./XiangqiGame', () => ({
  XiangqiGame: ({ memberId }) => <div>xiangqi match for {memberId}</div>,
}));

import { MultiplayerXiangqiSession } from './MultiplayerXiangqiSession';

describe('MultiplayerXiangqiSession', () => {
  it('renders the match immediately, with no lobby step', () => {
    render(<MultiplayerXiangqiSession memberId="m-1" />);
    expect(screen.getByText('xiangqi match for m-1')).toBeInTheDocument();
    expect(screen.queryByText('CaritaHub 象棋')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/multiplayer/xiangqi/MultiplayerXiangqiSession.test.jsx`
Expected: FAIL — the current implementation still renders `MultiplayerLobby` first.

- [ ] **Step 3: Implement the simplified session wrapper**

```jsx
// src/multiplayer/xiangqi/MultiplayerXiangqiSession.jsx
import PropTypes from 'prop-types';
import { XiangqiGame } from './XiangqiGame';

export function MultiplayerXiangqiSession({ memberId, callbackUrl, accessToken }) {
  return (
    <XiangqiGame memberId={memberId} callbackUrl={callbackUrl} accessToken={accessToken} />
  );
}

MultiplayerXiangqiSession.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/multiplayer/xiangqi/MultiplayerXiangqiSession.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/xiangqi/MultiplayerXiangqiSession.jsx src/multiplayer/xiangqi/MultiplayerXiangqiSession.test.jsx
git commit -m "Drop the room-code lobby for local xiangqi matches"
```

---

### Task 6: Manual verification in the browser

**Files:** none (manual QA task, no code changes)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the untouched Gin Rummy/Crazy Eights/Singapore Trivia/lobby suites (still on the networked path) and all Chess pilot suites.

- [ ] **Step 2: Start the dev server and navigate to Xiangqi**

Run: `npm run dev`, then navigate to the app and open Xiangqi from "Play with a Friend" (or directly via the URL param that sets `view=mp-xiangqi`).

- [ ] **Step 3: Confirm split-screen renders immediately, fitting one screen**

Expected: no lobby/name-entry screen; two boards render immediately (bottom upright/red, top rotated 180°/black), both showing the starting position. Resize the browser window down to a phone width (e.g. 375px) and confirm both boards, both name labels, the turn status, and the Resign/Reset buttons are all visible without scrolling — this is the constraint the Chess pilot's follow-up fix established.

- [ ] **Step 4: Play a full game to a king-capture end state**

Make moves alternately from each pane, confirming clicks on the rotated (black) pane land on the correct square (this is exactly the bug class the Chess pilot found — verify carefully, e.g. by moving a piece near a board edge/corner on the black pane and confirming it lands where clicked, not mirrored). Play until one side has no legal moves (or use Resign to reach an end state faster).

- [ ] **Step 5: Confirm the end screen, Play Again, and Reset-with-confirmation**

Expected: winner's name shown with a reason, "Play Again" resets both boards to the initial position. Mid-game (before any game-over), click Reset — confirm the inline confirmation appears and the board is untouched; click Cancel and confirm the board is still untouched; click Reset again and confirm — confirm the board resets to the initial position with red to move.

- [ ] **Step 6: Confirm scoring fires**

Confirm a `caritahub_scores` entry for `mp-xiangqi` is written to `localStorage` after a match ends, with no console errors related to `callbackUrl`/`postMessage`.

---

## Self-Review Notes

- **Spec coverage:** Engine port (Task 1), local hook with correct winner-inference for xiangqi's no-`winner()` engine (Task 2), mobile-fit board sizing applied from the start (Task 3, informed directly by the Chess pilot's follow-up fix rather than re-discovering it), split-screen two-pane UI with the double-flip bug avoided from the start (Task 4), confirmed Reset control included from the start (Task 4), dropped lobby/entry screen (Task 5), and manual verification of gameplay + scoring + mobile fit (Task 6) all map directly to the spec's Goals/Design sections plus the two lessons the Chess pilot's execution surfaced.
- **Placeholder scan:** every step has literal, complete code or an exact shell command; no "TODO"/"similar to Task N" placeholders.
- **Type consistency:** `dispatch(action, payload)` signature (`make_move: {from, to}` — no `promotion`), `gameState` shape (`fen/turn/inCheck/isGameOver/lastMove`), and `lastGameOver` shape (`{winner, reason}`, no `'draw'` case) are used identically across Task 2's hook, Task 4's component, and Task 4's tests. `color` values (`'red'`/`'black'`) are used consistently and never confused with Chess's `'white'`/`'black'`.
- **Not re-litigated:** this plan does not re-decide split-screen vs. pass-and-play, entry-flow design, or the Reset-confirmation UX — those were already decided (respectively) in the design spec and validated by the Chess pilot's execution; this plan only applies them to a new game.

## Next Steps (separate plans, not part of this one)

- **Gin Rummy** — port `server/src/engine/gin-rummy.js` and the `gin_knock` handler's auto-best-meld search client-side; card games need hand-hiding as a rendering rule (face-down backs for the inactive pane) rather than a board-orientation fix, since there's no canvas rotation involved — a different UI shape than Chess/Xiangqi's.
- **Crazy Eights** — port `server/src/engine/crazy-eights.js` (already numPlayers-agnostic, call `createGame(2)`); fix the latent gap where the networked version never emitted a distinct `game_over` reason for a stalemate ending.
- **Singapore Trivia** — reproduce the 20-second auto-reveal timer and "all answered → early reveal" logic client-side; not a spatial board, so no rotation/double-flip concern applies here either.
- **Final cleanup plan** — once all 5 are ported and manually verified: delete `fly.toml`, retire all 5 games' cases from `server/src/rooms/socketEvents.js`, delete the now-fully-unused `server/src/engine/*.js` for these 5 games, delete `src/multiplayer/useMultiplayerSocket.js`, `MULTIPLAYER_BASE_URL`/`multiplayerGameUrl` from `src/shared/multiplayerGames.js`, delete `MultiplayerLobby.jsx`/`.module.css`/`.test.jsx`, and sweep any now-fully-dead i18n keys.
