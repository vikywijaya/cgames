# Local Split-Screen Multiplayer — Chess Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Chess from a Socket.IO/Fly.io networked "Play with a Friend" game into a fully client-side, same-device split-screen game (two local players, one stacked-and-rotated board, no network), and prove the local-match pattern that Xiangqi/Gin Rummy/Crazy Eights/Singapore Trivia will each follow in their own subsequent plans.

**Architecture:** Port `server/src/engine/chess.js` into the client bundle as-is (it's already framework-agnostic plain JS). Replace `useMultiplayerSocket('chess')` with a new local hook, `useLocalChessMatch()`, that owns the engine instance in React state and exposes the same `{ gameState, lastGameOver, players, dispatch }` shape the game component needs — no room, no socket, no reconnect. Rebuild `ChessGame.jsx` to render two stacked `<ChessBoard>` panes (bottom upright, top rotated 180°) sharing one `gameState`, replacing the single-pane networked view. Delete the room-code lobby entirely — `MultiplayerChessSession` renders straight into the match.

**Tech Stack:** React 18, Vitest + Testing Library (jsdom), CSS Modules, no new dependencies.

**Spec:** [docs/superpowers/specs/2026-09-03-local-split-screen-multiplayer-design.md](../specs/2026-09-03-local-split-screen-multiplayer-design.md)

## Global Constraints

- No Socket.IO, no network calls, no `MULTIPLAYER_BASE_URL`, no room codes, no `?room=`/`?color=`/`?name=` URL state for Chess after this plan lands.
- Two local humans only — no bot/AI opponent (spec Non-goals).
- Split-screen layout: two stacked panes, opponent's pane rotated 180°, both reading from one shared `gameState` (spec Design → Split-screen UI).
- No name-entry/setup screen — the match starts immediately with default labels "Player 1" (white) / "Player 2" (black) (spec Design → Entry flow).
- Completion reporting (`saveScore`, `buildPayload`, `postMessage`, `callbackUrl` POST) must keep firing exactly as it does today — this is a transport/UI change only, not a scoring-contract change.
- Do not touch the in-flight, currently-uncommitted i18n edits already applied to `MultiplayerLobby.jsx`/`ChessGame.jsx`/`MultiplayerChessSession.jsx` (translation-key wiring) — layer this plan's changes on top of whatever state those files are in when work starts; if a conflict arises, preserve the i18n keys and re-apply this plan's structural changes around them.
- Do not delete `server/src/engine/chess.js`, `server/src/rooms/socketEvents.js`'s chess handlers, or `fly.toml` in this plan — server-side/deploy cleanup is explicitly sequenced after all 5 games are ported (spec Non-goals), not part of the Chess pilot.

---

## File Structure

**Create:**
- `src/multiplayer/chess/chessEngine.js` — ported copy of `server/src/engine/chess.js`, converted from CommonJS (`module.exports`) to an ES module export. Pure game logic, no React.
- `src/multiplayer/chess/chessEngine.test.js` — unit tests for the ported engine (move legality, check/checkmate/stalemate, resign-equivalent via game-over detection).
- `src/multiplayer/chess/useLocalChessMatch.js` — the local-match hook replacing `useMultiplayerSocket('chess')` for this game.
- `src/multiplayer/chess/useLocalChessMatch.test.js` — unit tests for the hook (move dispatch, turn state, game-over/winner shape, resign, play-again/reset).

**Modify:**
- `src/multiplayer/chess/ChessGame.jsx` — rebuilt to render two stacked, oppositely-oriented panes off one `gameState`, and to call the hook's `dispatch` instead of `socket.emit`.
- `src/multiplayer/chess/ChessGame.module.css` — add split-screen layout rules (stacked panes, 180° rotation on the top pane).
- `src/multiplayer/chess/MultiplayerChessSession.jsx` — drop the lobby/URL-reflection logic, use `useLocalChessMatch()` directly, render `ChessGame` immediately.
- `src/multiplayer/chess/ChessGame.test.jsx` — rewritten to remove socket/reconnect-banner tests, add split-screen-pane assertions and win/loss/draw scoring assertions per new prop shape.
- `src/multiplayer/chess/MultiplayerChessSession.test.jsx` — rewritten to assert the match renders immediately (no lobby step).
- `src/i18n/en.js`, `src/i18n/id.js`, `src/i18n/ms.js`, `src/i18n/ta.js`, `src/i18n/zh.js` — **add** two new keys (`namedTurn`, `namedInCheck`) needed by the local split-screen turn-status copy (Task 3). Removing now-dead lobby/reconnect keys is explicitly **not** done in this plan (see Task 6) — `MultiplayerLobby.jsx` and the other 4 still-networked games depend on the full existing key set, so nothing is safe to delete until every game is converted.

**Not modified in this plan (left for the cleanup phase after all 5 games are ported, per spec Non-goals):**
- `server/src/engine/chess.js`, `server/src/rooms/socketEvents.js`, `fly.toml`, `src/multiplayer/useMultiplayerSocket.js` (still used by the other 4 un-converted games), `src/shared/multiplayerGames.js`.

---

### Task 1: Port the chess engine to the client

**Files:**
- Create: `src/multiplayer/chess/chessEngine.js`
- Test: `src/multiplayer/chess/chessEngine.test.js`

**Interfaces:**
- Produces: `createGame()` → `{ move(from, to, promotion), undo(), fen(), turn(), inCheck(), isGameOver(), winner(), legalMoves(square), boardState() }`, and `export const INITIAL_FEN`. Exact same interface as `server/src/engine/chess.js`'s `createGame()` (verified: `move`/`undo`/`fen`/`turn`/`inCheck`/`isGameOver`/`winner`/`legalMoves`/`boardState`), so downstream tasks can treat it as a drop-in.
- Consumes: nothing (pure module, no imports beyond itself).

- [ ] **Step 1: Copy the server engine file verbatim, converting the export**

Copy the full body of `server/src/engine/chess.js` (all functions: `parseFen`, `boardToFen`, `isWhite`, `isBlack`, `sameColor`, `inBounds`, `cloneBoard`, `cloneState`, `getCandidateMoves`, `isSquareAttacked`, `applyMove`, `findKing`, `isInCheck`, `legalMovesFor`, `hasAnyLegalMove`, `isGameOver`, `createGame`) into `src/multiplayer/chess/chessEngine.js` unchanged, **except** the final export line:

```js
// server/src/engine/chess.js ends with:
module.exports = { createGame, INITIAL_FEN };
```

becomes, in `src/multiplayer/chess/chessEngine.js`:

```js
export { createGame, INITIAL_FEN };
```

Also delete the leading `'use strict';` line (ES modules are implicitly strict) and update the file's top comment to:

```js
/**
 * Client-side Western Chess engine — ported verbatim from
 * server/src/engine/chess.js for local (same-device) play. No server
 * involvement: this is now the sole source of truth for move legality.
 * Board: 8x8 array, row 0 = rank 8 (Black's back rank), row 7 = rank 1 (White's back rank).
 * Uppercase = White (K Q R B N P), lowercase = Black (k q r b n p).
 */
```

- [ ] **Step 2: Write failing tests for the ported engine**

```js
// src/multiplayer/chess/chessEngine.test.js
import { describe, it, expect } from 'vitest';
import { createGame, INITIAL_FEN } from './chessEngine';

describe('chessEngine', () => {
  it('starts at the standard initial position with white to move', () => {
    const game = createGame();
    expect(game.fen()).toBe(INITIAL_FEN);
    expect(game.turn()).toBe('w');
    expect(game.isGameOver()).toBe(false);
    expect(game.winner()).toBe(null);
  });

  it('accepts a legal opening move and switches turn', () => {
    const game = createGame();
    const result = game.move([6, 4], [4, 4], null); // e2-e4
    expect(result).toEqual({ ok: true });
    expect(game.turn()).toBe('b');
  });

  it('rejects moving a piece that is not yours', () => {
    const game = createGame();
    const result = game.move([1, 4], [3, 4], null); // black pawn, white's turn
    expect(result.ok).toBe(false);
  });

  it('rejects an illegal move for the piece', () => {
    const game = createGame();
    const result = game.move([6, 4], [3, 4], null); // pawn can't jump 3 squares
    expect(result.ok).toBe(false);
  });

  it('detects checkmate (fool\'s mate) and reports the winning color', () => {
    const game = createGame();
    game.move([6, 5], [5, 5], null); // 1. f3
    game.move([1, 4], [3, 4], null); // 1... e5
    game.move([6, 6], [4, 6], null); // 2. g4
    game.move([0, 3], [4, 7], null); // 2... Qh4#
    expect(game.isGameOver()).toBe(true);
    expect(game.inCheck()).toBe(true);
    expect(game.winner()).toBe('black');
  });

  it('legalMoves returns an empty array for an empty square', () => {
    const game = createGame();
    expect(game.legalMoves([4, 4])).toEqual([]);
  });

  it('undo reverts the last move', () => {
    const game = createGame();
    game.move([6, 4], [4, 4], null);
    expect(game.turn()).toBe('b');
    const undone = game.undo();
    expect(undone).toBe(true);
    expect(game.fen()).toBe(INITIAL_FEN);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail (or pass, since this is a verbatim port)**

Run: `npx vitest run src/multiplayer/chess/chessEngine.test.js`
Expected: All tests PASS immediately, since Step 1 copied working, already-tested-in-production logic. This is a port, not new logic — the test suite here exists to catch a transcription mistake, not to drive new design. If any test fails, the copy in Step 1 diverged from the server source; diff against `server/src/engine/chess.js` and fix.

- [ ] **Step 4: Commit**

```bash
git add src/multiplayer/chess/chessEngine.js src/multiplayer/chess/chessEngine.test.js
git commit -m "Port chess rules engine to the client for local play"
```

---

### Task 2: Build the local match hook

**Files:**
- Create: `src/multiplayer/chess/useLocalChessMatch.js`
- Test: `src/multiplayer/chess/useLocalChessMatch.test.js`

**Interfaces:**
- Consumes: `createGame` from `./chessEngine` (Task 1).
- Produces: `useLocalChessMatch()` → `{ gameState, lastGameOver, players, dispatch }` where:
  - `gameState` is `{ fen, turn, inCheck, isGameOver, winner, lastMove }` (mirrors the server's `gameStatePayload()` shape minus the `players` field, which is returned separately below) or `null` before the first render (never actually null here since the match starts immediately, but keep the shape optional for the test/prop-types boundary).
  - `lastGameOver` is `null` until the game ends, then `{ winner: 'white'|'black'|'draw', reason: string }`.
  - `players` is `[{ name: 'Player 1', color: 'white' }, { name: 'Player 2', color: 'black' }]` (fixed local seats, no `connected` field).
  - `dispatch(action, payload)` where `action` is `'make_move'` (`payload: { from, to, promotion }`), `'resign'` (no payload — resigning player is inferred from whichever color's turn it currently is, since only the player to move can meaningfully resign in this local UI; see Task 3's resign button placement), or `'play_again'` (no payload, resets the match).

- [ ] **Step 1: Write the failing test**

```js
// src/multiplayer/chess/useLocalChessMatch.test.js
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useLocalChessMatch } from './useLocalChessMatch';

describe('useLocalChessMatch', () => {
  it('starts with the initial position and two fixed local players', () => {
    const { result } = renderHook(() => useLocalChessMatch());
    expect(result.current.gameState.turn).toBe('w');
    expect(result.current.gameState.isGameOver).toBe(false);
    expect(result.current.lastGameOver).toBe(null);
    expect(result.current.players).toEqual([
      { name: 'Player 1', color: 'white' },
      { name: 'Player 2', color: 'black' },
    ]);
  });

  it('applies a legal move and updates turn/lastMove', () => {
    const { result } = renderHook(() => useLocalChessMatch());
    act(() => {
      result.current.dispatch('make_move', { from: [6, 4], to: [4, 4], promotion: null });
    });
    expect(result.current.gameState.turn).toBe('b');
    expect(result.current.gameState.lastMove).toEqual({ from: [6, 4], to: [4, 4] });
  });

  it('ignores an illegal move and leaves state unchanged', () => {
    const { result } = renderHook(() => useLocalChessMatch());
    const before = result.current.gameState;
    act(() => {
      result.current.dispatch('make_move', { from: [6, 4], to: [3, 4], promotion: null });
    });
    expect(result.current.gameState.fen).toBe(before.fen);
    expect(result.current.gameState.turn).toBe('w');
  });

  it('sets lastGameOver on checkmate with the winning color', () => {
    const { result } = renderHook(() => useLocalChessMatch());
    act(() => { result.current.dispatch('make_move', { from: [6, 5], to: [5, 5], promotion: null }); }); // f3
    act(() => { result.current.dispatch('make_move', { from: [1, 4], to: [3, 4], promotion: null }); }); // e5
    act(() => { result.current.dispatch('make_move', { from: [6, 6], to: [4, 6], promotion: null }); }); // g4
    act(() => { result.current.dispatch('make_move', { from: [0, 3], to: [4, 7], promotion: null }); }); // Qh4#
    expect(result.current.lastGameOver).toEqual({ winner: 'black', reason: 'Checkmate' });
  });

  it('resign ends the game with the other color as winner', () => {
    const { result } = renderHook(() => useLocalChessMatch());
    act(() => { result.current.dispatch('resign'); }); // white to move resigns
    expect(result.current.lastGameOver).toEqual({ winner: 'black', reason: 'White resigned' });
  });

  it('play_again resets to a fresh initial position', () => {
    const { result } = renderHook(() => useLocalChessMatch());
    act(() => { result.current.dispatch('make_move', { from: [6, 4], to: [4, 4], promotion: null }); });
    act(() => { result.current.dispatch('play_again'); });
    expect(result.current.gameState.turn).toBe('w');
    expect(result.current.lastGameOver).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/multiplayer/chess/useLocalChessMatch.test.js`
Expected: FAIL with "Failed to resolve import './useLocalChessMatch'" (module doesn't exist yet).

- [ ] **Step 3: Implement the hook**

```js
// src/multiplayer/chess/useLocalChessMatch.js
import { useCallback, useRef, useState } from 'react';
import { createGame } from './chessEngine';

const PLAYERS = [
  { name: 'Player 1', color: 'white' },
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

function checkmateOrStalemateResult(engine) {
  const winner = engine.winner(); // 'white' | 'black' | 'draw' | null
  if (winner === null) return null;
  if (winner === 'draw') return { winner: 'draw', reason: 'Stalemate' };
  return { winner, reason: 'Checkmate' };
}

export function useLocalChessMatch() {
  const engineRef = useRef(createGame());
  const [gameState, setGameState] = useState(() => snapshot(engineRef.current, null));
  const [lastGameOver, setLastGameOver] = useState(null);

  const dispatch = useCallback((action, payload) => {
    const engine = engineRef.current;

    if (action === 'make_move') {
      const { from, to, promotion } = payload;
      const result = engine.move(from, to, promotion);
      if (!result.ok) return;
      setGameState(snapshot(engine, { from, to }));
      const over = checkmateOrStalemateResult(engine);
      if (over) setLastGameOver(over);
      return;
    }

    if (action === 'resign') {
      const resigningColor = engine.turn() === 'w' ? 'White' : 'Black';
      const winner = engine.turn() === 'w' ? 'black' : 'white';
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

Run: `npx vitest run src/multiplayer/chess/useLocalChessMatch.test.js`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/chess/useLocalChessMatch.js src/multiplayer/chess/useLocalChessMatch.test.js
git commit -m "Add local-match hook for same-device chess"
```

---

### Task 3: Rebuild ChessGame.jsx as a split-screen view

**Files:**
- Modify: `src/multiplayer/chess/ChessGame.jsx`
- Modify: `src/multiplayer/chess/ChessGame.module.css`
- Modify: `src/i18n/en.js`, `src/i18n/id.js`, `src/i18n/ms.js`, `src/i18n/ta.js`, `src/i18n/zh.js` (add two new keys — see Step 1)
- Test: `src/multiplayer/chess/ChessGame.test.jsx` (rewritten)

**Interfaces:**
- Consumes: `useLocalChessMatch()`'s return shape from Task 2 (`gameState`, `lastGameOver`, `players`, `dispatch`); `ChessBoard` from `./ChessBoardCanvas` (unchanged — its constructor `new ChessBoard(canvas, playerColor)` and `onPieceSelect`/`onMove`/`updateBoard(board, fenState, lastMove)` are reused as-is, one instance per pane); `legalMovesFor`, `parseFenState` from `./chessMoves` (unchanged); `saveScore` from `../../utils/scoreStore`; `buildPayload` from `../../utils/buildPayload`; `useTranslation` from `../../i18n/useTranslation`.
- Produces: `ChessGame` now takes **no props** (it owns its own hook internally) — `MultiplayerChessSession.jsx` (Task 4) renders `<ChessGame memberId={memberId} callbackUrl={callbackUrl} accessToken={accessToken} />` with only the completion-reporting identifiers, since `myColor`/`gameState`/`socket`/`status`/`reconnectAttempt`/`disconnectedPlayerName` no longer apply (no per-viewer color, no connection state).

Note on scoring: with two local players sharing one device, "my score" no longer means anything — the existing `saveScore('mp-chess', RESULT_PCT[result], ...)` call was always relative to `myColor`. For local play, report from **white's perspective** (`result = lastGameOver.winner === 'draw' ? 'draw' : lastGameOver.winner === 'white' ? 'win' : 'loss'`) — an arbitrary but consistent choice, since the completion payload contract (`buildPayload`) still needs exactly one score. This keeps `scoreStore`/`buildPayload`/`postMessage`/`callbackUrl` firing unchanged in shape.

Note on turn-status copy: the old networked UI always spoke from "my" perspective (`t.yourTurn`/`t.opponentsTurn`/`t.inCheck`, all written as "you"/"opponent"). With no per-viewer identity, the local UI instead names whichever local player is to move. This needs two new i18n keys with a `{name}` placeholder (same `.replace('{name}', …)` convention already used elsewhere in the `multiplayer` block, e.g. `opponentDisconnectedReconnecting`) rather than string-mangling the existing `you`-oriented keys.

- [ ] **Step 1: Add the two new i18n keys**

In `src/i18n/en.js`, inside the `multiplayer` block, add two keys next to the existing `// Chess / Xiangqi` group (they'll be reused by the Xiangqi follow-up plan too):

```js
    // Chess / Xiangqi
    yourTurn: 'Your turn',
    opponentsTurn: "Opponent's turn",
    inCheck: 'You are in CHECK!',
    opponentInCheck: 'Opponent is in CHECK!',
    namedTurn: "{name}'s turn",
    namedInCheck: '{name} is in CHECK!',
    youWinSimple: 'You Win!',
    youLose: 'You Lose',
    resign: 'Resign',
```

(`namedTurn`/`namedInCheck` are new; every other line already exists — insert the two new lines in place, do not duplicate the existing ones.)

Add the same two keys, translated, at the equivalent position in `src/i18n/id.js`, `src/i18n/ms.js`, `src/i18n/ta.js`, `src/i18n/zh.js`'s `multiplayer` blocks, matching each file's existing translation style for `yourTurn`/`opponentsTurn` in that file (per CLAUDE.md: "every language file must stay structurally in sync (same keys)"). Use straightforward literal translations of "{name}'s turn" / "{name} is in CHECK!" consistent with each file's existing tone — do not leave English text in the non-English files.

- [ ] **Step 2: Write the failing test**

```jsx
// src/multiplayer/chess/ChessGame.test.jsx (replaces the old socket-based file)
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { ChessGame } from './ChessGame';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({}));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
  }));
});

describe('ChessGame split-screen', () => {
  it('renders two player panels, one per local seat', () => {
    render(<ChessGame memberId="m-1" />);
    expect(screen.getByText('Player 1 (white)')).toBeInTheDocument();
    expect(screen.getByText('Player 2 (black)')).toBeInTheDocument();
  });

  it('renders two canvases (one board per pane)', () => {
    const { container } = render(<ChessGame memberId="m-1" />);
    expect(container.querySelectorAll('canvas')).toHaveLength(2);
  });

  it('shows a resign button for the side to move', () => {
    render(<ChessGame memberId="m-1" />);
    expect(screen.getAllByRole('button', { name: /resign/i }).length).toBeGreaterThan(0);
  });

  it('reports white-perspective score on white win', () => {
    render(<ChessGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]); // black is not to move; this resigns white (side to move)
    expect(saveScore).toHaveBeenCalledWith('mp-chess', 0, expect.any(Number), 'm-1', null);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/multiplayer/chess/ChessGame.test.jsx`
Expected: FAIL — `ChessGame` still requires the old socket-based props and renders a single pane; `screen.getByText('Player 1 (white)')` will not be found.

- [ ] **Step 4: Implement the split-screen component**

```jsx
// src/multiplayer/chess/ChessGame.jsx
import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { ChessBoard } from './ChessBoardCanvas';
import { legalMovesFor, parseFenState } from './chessMoves';
import { useLocalChessMatch } from './useLocalChessMatch';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './ChessGame.module.css';

const RESULT_PCT = { win: 100, draw: 50, loss: 0 };

function ChessPane({ color, name, gameState, dispatch, rotated }) {
  const canvasRef = useRef(null);
  const boardRef = useRef(null);

  useEffect(() => {
    const board = new ChessBoard(canvasRef.current, color);
    board.onPieceSelect = ([r, c]) => {
      const parsed = boardRef.current?.fenState;
      const currentBoard = boardRef.current?.board;
      if (!currentBoard || !parsed) return [];
      const piece = currentBoard[r][c];
      if (!piece) return [];
      const pieceIsWhite = piece === piece.toUpperCase();
      if ((color === 'white') !== pieceIsWhite) return [];
      return legalMovesFor(currentBoard, parsed, r, c);
    };
    board.onMove = (from, to, promotion) => {
      dispatch('make_move', { from, to, promotion: promotion || null });
    };
    boardRef.current = board;
    const onResize = () => board.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [color, dispatch]);

  useEffect(() => {
    if (!gameState || !boardRef.current) return;
    const parsed = parseFenState(gameState.fen);
    boardRef.current.updateBoard(parsed.board, parsed, gameState.lastMove || null);
  }, [gameState]);

  return (
    <div className={`${styles.pane} ${rotated ? styles.paneRotated : ''}`}>
      <div className={styles.panel}>{name} ({color})</div>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
ChessPane.propTypes = {
  color: PropTypes.oneOf(['white', 'black']).isRequired,
  name: PropTypes.string.isRequired,
  gameState: PropTypes.object,
  dispatch: PropTypes.func.isRequired,
  rotated: PropTypes.bool,
};

export function ChessGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalChessMatch();
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const result = lastGameOver.winner === 'draw' ? 'draw'
      : lastGameOver.winner === 'white' ? 'win' : 'loss';
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    saveScore('mp-chess', RESULT_PCT[result], durationSeconds, memberId, null);

    const payload = buildPayload({
      memberId, gameId: 'mp-chess',
      score: RESULT_PCT[result], maxScore: 100,
      completed: true, durationSeconds,
    });
    window.parent.postMessage({ type: 'GAME_COMPLETE', payload }, '*');

    if (!callbackUrl) return;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[ChessGame] callback failed:', e));
  }, [lastGameOver, memberId, callbackUrl, accessToken]);

  const white = players.find(p => p.color === 'white');
  const black = players.find(p => p.color === 'black');
  const turnLabel = gameState.turn === 'w' ? white.name : black.name;
  const turnStatus = gameState.inCheck
    ? t.namedInCheck.replace('{name}', turnLabel)
    : t.namedTurn.replace('{name}', turnLabel);

  return (
    <div className={styles.game}>
      <ChessPane color="black" name={black.name} gameState={gameState} dispatch={dispatch} rotated />

      <div className={styles.center}>
        <div className={styles.status}>{turnStatus}</div>
        {lastGameOver && (
          <div className={styles.gameOver}>
            <h3>
              {lastGameOver.winner === 'draw' ? t.draw
                : `${lastGameOver.winner === 'white' ? white.name : black.name} ${t.youWinSimple}`}
            </h3>
            <p>{lastGameOver.reason}</p>
            <button className={styles.primaryBtn} onClick={() => dispatch('play_again')}>{t.playAgain}</button>
          </div>
        )}
        {!lastGameOver && (
          <button className={styles.resignBtn} onClick={() => dispatch('resign')}>{t.resign}</button>
        )}
      </div>

      <ChessPane color="white" name={white.name} gameState={gameState} dispatch={dispatch} />
    </div>
  );
}

ChessGame.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
```

- [ ] **Step 5: Add split-screen layout CSS**

Append to `src/multiplayer/chess/ChessGame.module.css` (keep the existing `.panel`, `.canvas`, `.gameOver`, `.primaryBtn`, `.resignBtn` rules as-is; add):

```css
.game { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 8px; }
.pane { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.paneRotated { transform: rotate(180deg); }
.center { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 8px 0; }
```

Remove the old `.status { font-size: 1.1rem; }` rule's assumption of a single top-level status line if it conflicts visually — keep the class, it's reused inside `.center` unchanged.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/multiplayer/chess/ChessGame.test.jsx`
Expected: PASS (all 4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/multiplayer/chess/ChessGame.jsx src/multiplayer/chess/ChessGame.module.css src/multiplayer/chess/ChessGame.test.jsx src/i18n/en.js src/i18n/id.js src/i18n/ms.js src/i18n/ta.js src/i18n/zh.js
git commit -m "Rebuild ChessGame as a local split-screen match"
```

---

### Task 4: Simplify MultiplayerChessSession (drop the lobby)

**Files:**
- Modify: `src/multiplayer/chess/MultiplayerChessSession.jsx`
- Test: `src/multiplayer/chess/MultiplayerChessSession.test.jsx` (rewritten)

**Interfaces:**
- Consumes: `ChessGame` from `./ChessGame` (Task 3), which now takes `{ memberId, callbackUrl, accessToken }` only.
- Produces: `MultiplayerChessSession` keeps its existing external prop contract (`{ memberId, callbackUrl, accessToken }`, all consumed by `App.jsx`'s `view === 'mp-chess'` branch — no change needed there).

- [ ] **Step 1: Write the failing test**

```jsx
// src/multiplayer/chess/MultiplayerChessSession.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./ChessGame', () => ({
  ChessGame: ({ memberId }) => <div>chess match for {memberId}</div>,
}));

import { MultiplayerChessSession } from './MultiplayerChessSession';

describe('MultiplayerChessSession', () => {
  it('renders the match immediately, with no lobby step', () => {
    render(<MultiplayerChessSession memberId="m-1" />);
    expect(screen.getByText('chess match for m-1')).toBeInTheDocument();
    expect(screen.queryByText('CaritaHub Chess')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/multiplayer/chess/MultiplayerChessSession.test.jsx`
Expected: FAIL — the current implementation still renders `MultiplayerLobby` first (no `gameState` exists to trigger the game view under the old socket hook).

- [ ] **Step 3: Implement the simplified session wrapper**

```jsx
// src/multiplayer/chess/MultiplayerChessSession.jsx
import PropTypes from 'prop-types';
import { ChessGame } from './ChessGame';

export function MultiplayerChessSession({ memberId, callbackUrl, accessToken }) {
  return (
    <ChessGame memberId={memberId} callbackUrl={callbackUrl} accessToken={accessToken} />
  );
}

MultiplayerChessSession.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/multiplayer/chess/MultiplayerChessSession.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/chess/MultiplayerChessSession.jsx src/multiplayer/chess/MultiplayerChessSession.test.jsx
git commit -m "Drop the room-code lobby for local chess matches"
```

---

### Task 5: Manual verification in the browser

**Files:** none (manual QA task, no code changes)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Navigate to the Chess multiplayer view**

Open the app, go to "Play with a Friend" → Chess (or navigate directly to whatever URL sets `view=mp-chess`, e.g. append `?gameId=mp-chess` or use the in-app button per `App.jsx`'s `onPlayInApp` wiring).

- [ ] **Step 3: Confirm split-screen renders immediately**

Expected: no lobby/name-entry screen; two boards render immediately, one upright (bottom, white's perspective) and one rotated 180° (top, black's perspective), both showing the same starting position.

- [ ] **Step 4: Play a full game to checkmate**

Make moves alternately from each pane (click own pieces, confirm only the correct color's legal moves highlight on each attempt — e.g., trying to move a black piece from the white/bottom pane should show no legal-move dots, since `onPieceSelect` filters by `color`). Play to checkmate or use resign.

- [ ] **Step 5: Confirm the end screen and Play Again**

Expected: winner's name shown, "Play Again" resets both boards to the initial position with turn back to white, no page reload.

- [ ] **Step 6: Confirm scoring fires**

Open browser devtools → Application → Local Storage, confirm a `caritahub_scores` (or equivalent, per `scoreStore.js`'s key convention) entry for `mp-chess` was written after the match ends. Confirm no console errors about `callbackUrl`/`postMessage` (harmless without a real parent frame, but should not throw).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the untouched Xiangqi/Gin Rummy/Crazy Eights/Singapore Trivia/lobby suites (still on the networked path, unaffected by this plan).

---

### Task 6: i18n cleanup — remove Chess-only lobby copy that's now dead

**Files:**
- Modify: `src/i18n/en.js`, `src/i18n/id.js`, `src/i18n/ms.js`, `src/i18n/ta.js`, `src/i18n/zh.js`

**Interfaces:** none (data-only change, no code consumes removed keys after Task 3/4 land).

Before touching any key, grep for other consumers — the `multiplayer` block is shared across all 5 games, and only Chess is converted in this plan.

- [ ] **Step 1: Confirm which keys became unused**

Run: `grep -rn "t\.yourName\|t\.enterYourName\|t\.joinGame\|t\.createGame\|t\.disconnectedSuffix\|t\.startGame\|t\.waitingForPlayer\b\|t\.waitingForPlayers\|t\.reconnecting\|t\.opponentDisconnectedReconnecting" src/multiplayer/`

Expected: after Task 3/4, no remaining reference in `src/multiplayer/chess/`. `MultiplayerLobby.jsx` itself still uses `yourName`/`enterYourName`/`joinGame`/`createGame`/`disconnectedSuffix`/`startGame`/`waitingForPlayer`/`waitingForPlayers` for the other 4 still-networked games, and `opponentDisconnectedReconnecting`/`reconnecting` are still used by `XiangqiGame.jsx` (`reconnecting`) and other games — **do not remove any key still matched by this grep outside `chess/`**. In practice this means: no keys are safe to delete yet, since `MultiplayerLobby.jsx` and the other 4 games still depend on the full existing key set. Skip deletion for this plan; leave a note instead.

- [ ] **Step 2: Leave the i18n files unchanged, note the deferral**

No edit needed. The `multiplayer` i18n block stays exactly as-is until the last of the 5 games (whichever is converted last across the follow-up plans) makes `MultiplayerLobby.jsx` and its lobby/reconnect keys fully unreferenced — that cleanup belongs in the final follow-up plan, not this one. This step exists only to make the decision explicit rather than silently skipped.

- [ ] **Step 3: Commit (only if Step 1's grep changes nothing to commit, skip this step)**

No commit — no files changed in this task.

---

## Self-Review Notes

- **Spec coverage:** Engine port (Task 1), local hook replacing the socket hook (Task 2), split-screen two-pane UI with rotation (Task 3), dropped lobby/entry screen (Task 4), manual verification of gameplay + scoring contract (Task 5) all map directly to the spec's Goals and Design sections for the one game this plan covers. Server/Fly.io/i18n-wide cleanup is correctly deferred (spec Non-goals: "Not deleting `server/src/engine/*.js` in the same pass," "No changes to... i18n keys beyond what's needed").
- **Card-game-specific spec items (hand-hiding, gin-rummy melds, trivia timers)** do not apply to Chess and are intentionally absent from this plan — they belong in the Xiangqi/Gin Rummy/Crazy Eights/Singapore Trivia follow-up plans.
- **Type consistency:** `dispatch(action, payload)` signature, `gameState` shape (`fen/turn/inCheck/isGameOver/lastMove`), and `lastGameOver` shape (`{winner, reason}`) are used identically across Task 2's hook, Task 3's component, and Task 3's tests.
- **No placeholders:** every step has literal, complete code or an exact shell command; Task 6 documents a real decision (defer) rather than leaving a "TODO."

## Next Steps (separate plans, not part of this one)

Once this pilot is validated end-to-end (Task 5 passes manually and `npm test`/`npm run lint`/`npm run build` are clean), write one follow-up plan per remaining game, each following this same shape (engine port → local hook → split-screen or dual-zone UI → dropped lobby → manual verification):

- **Xiangqi** — nearly identical to Chess; `xiangqiMoves.js` already contains a portable pure move-generator, and the ported engine lacks a `winner()` method (the hook must infer the winner from whose turn it is at game-over, matching `server/src/rooms/socketEvents.js`'s `gameStatePayload()` fallback logic).
- **Gin Rummy** — port `server/src/engine/gin-rummy.js` and the `gin_knock` handler's auto-best-meld search (`findBestMelds`, iterating every card as a candidate discard) client-side; split-screen panes must show the other player's hand as face-down card backs (spec Design → card games hand hiding), since the local engine's `state()` exposes both hands directly (no per-socket hiding needed/possible locally).
- **Crazy Eights** — port `server/src/engine/crazy-eights.js` (already numPlayers-agnostic, call `createGame(2)`); fix the latent gap where the networked version never emitted a distinct `game_over` reason for a stalemate ending — the local hook should synthesize one; also hides the inactive hand per pane like Gin Rummy.
- **Singapore Trivia** — the most involved port: reproduce the 20-second auto-reveal `setTimeout` and "all answered → early reveal" logic from `trivia_next`/`trivia_answer` client-side; UI is two answer-input zones rather than a spatial rotated board (per spec's open question, to be resolved when writing that plan).
- **Final cleanup plan** — once all 5 are ported and manually verified: delete `fly.toml`, retire the 5 games' cases from `server/src/rooms/socketEvents.js`, delete the now-fully-unused `server/src/engine/{chess,xiangqi,gin-rummy,crazy-eights,singapore-trivia}.js`, delete `src/multiplayer/useMultiplayerSocket.js` and `MULTIPLAYER_BASE_URL`/`multiplayerGameUrl` from `src/shared/multiplayerGames.js`, delete `MultiplayerLobby.jsx`/`.module.css`/`.test.jsx`, and sweep the now-fully-dead i18n keys identified but deferred in this plan's Task 6.
