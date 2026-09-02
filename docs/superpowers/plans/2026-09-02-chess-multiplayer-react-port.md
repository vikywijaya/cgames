# Chess Multiplayer React Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chess playable start-to-finish inside the cgames React SPA (room creation/join/QR + gameplay), connecting cross-origin to the existing Fly-hosted Socket.IO server, with match results saved via the same `scoreStore`/`buildPayload` calls solo games use — no page navigation, no `/shared` bridge, for Chess.

**Architecture:** A generic `useMultiplayerSocket` hook owns one Socket.IO connection per session; a generic `MultiplayerLobby` component (parameterized by a small `gameMeta` object) handles room creation/join/QR; a Chess-specific `ChessGame` component wraps the existing canvas board/move-legality logic (adapted into ES modules, otherwise unchanged) as React state; `MultiplayerChessSession` ties the three together and reflects room/color/name into the URL so refresh doesn't lose the match. `App.jsx` gains one new view (`'mp-chess'`) and `MultiplayerGames` gains an escape hatch to render in-app instead of hard-navigating, for games opted into that behavior.

**Tech Stack:** React 18, `socket.io-client` (new dependency, pin to `^4.8.3` to match the server's version), Vitest + Testing Library, `qrcodejs` (existing CDN-loaded library, reused via the same `<script>` approach already proven in `server/public/lobby.html`).

**Spec:** [docs/superpowers/specs/2026-09-02-chess-multiplayer-react-port-design.md](../specs/2026-09-02-chess-multiplayer-react-port-design.md)

## Global Constraints

- `server/` is read-only in this plan (verified via `git diff --stat server/` showing no changes after each task) — no changes to `server.js`, `roomManager.js`, `socketEvents.js`, or any engine file. A `CORS_ORIGIN` Fly secret update is a deployment step, not a code change, and is called out at the end of this plan rather than as a task.
- The existing Fly-hosted `lobby.html`/`chess-game.html`/`chess-board.js`/`chess-moves.js`/`chess-game.js` under `server/public/` are untouched — this plan only ever *reads* them as reference, never edits them.
- `GAME_MAP`, `GAME_GROUPS`, `GameShell`, and the daily-challenge contract are unmodified. New code lives under `src/multiplayer/`, never under `src/games/`.
- Xiangqi, Gin Rummy, Crazy Eights, and Singapore Trivia keep using `multiplayerGameUrl()`'s hard-navigation path and the `mp-report-result.js` bridge — this plan does not touch their code paths.
- `npm test` and `npm run build` must stay green after every task.

---

## Task 1: Add `socket.io-client` dependency

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `socket.io-client`'s default export (`io`), importable as `import { io } from 'socket.io-client'` in later tasks.

- [ ] **Step 1: Install the dependency**

```bash
npm install socket.io-client@^4.8.3
```

- [ ] **Step 2: Verify it installed at the pinned major version**

Run: `node -e "console.log(require('./node_modules/socket.io-client/package.json').version)"`
Expected: prints a `4.8.x` version.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add socket.io-client dependency for in-app multiplayer"
```

---

## Task 2: Port `chess-moves.js` as an ES module

**Files:**
- Create: `src/multiplayer/chess/chessMoves.js`
- Test: `src/multiplayer/chess/chessMoves.test.js`

**Interfaces:**
- Produces: `parseFenState(fen)`, `legalMovesFor(board, state, r, c)`, `isPawnPromotion(board, r, c, nr)` — same names and signatures as the existing `window.ChessMoves` global in `server/public/js/chess-moves.js`, exported instead of attached to `window`.

- [ ] **Step 1: Write the failing test**

```js
// src/multiplayer/chess/chessMoves.test.js
import { describe, it, expect } from 'vitest';
import { parseFenState, legalMovesFor, isPawnPromotion } from './chessMoves';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

describe('chessMoves', () => {
  it('parses the standard starting FEN into an 8x8 board with white to move', () => {
    const { board, turn } = parseFenState(START_FEN);
    expect(turn).toBe('w');
    expect(board[0]).toEqual(['r','n','b','q','k','b','n','r']);
    expect(board[1]).toEqual(['p','p','p','p','p','p','p','p']);
    expect(board[6]).toEqual(['P','P','P','P','P','P','P','P']);
  });

  it('gives the e2 pawn two legal moves from the starting position', () => {
    const state = parseFenState(START_FEN);
    const moves = legalMovesFor(state.board, state, 6, 4); // e2 = row 6, col 4
    expect(moves).toEqual(expect.arrayContaining([[5, 4], [4, 4]]));
    expect(moves).toHaveLength(2);
  });

  it('flags a white pawn reaching rank 0 as a promotion', () => {
    const board = parseFenState(START_FEN).board;
    expect(isPawnPromotion(board, 1, 0, 0)).toBe(false); // starting position, no promotion yet
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/multiplayer/chess/chessMoves.test.js`
Expected: FAIL — `Cannot find module './chessMoves'` (file doesn't exist yet).

- [ ] **Step 3: Create the module by adapting the existing file**

Read `server/public/js/chess-moves.js` in full, copy its contents verbatim into the new file, and change only the final line:

```js
// src/multiplayer/chess/chessMoves.js
// Adapted from server/public/js/chess-moves.js — same logic, ES module instead
// of a classic script attaching to `window.ChessMoves`. Do not diverge from
// the vendored version's move-legality behavior; the server re-validates
// every move regardless, this is UX-highlighting only (see file header).

'use strict';

// ... (paste the full body of server/public/js/chess-moves.js here, lines 8-188 —
// parseFenState, isWhite, sameColor, inBounds, getCandidates, isAttacked,
// applyLocal, findKing, inCheckLocal, legalMovesFor, isPawnPromotion,
// unchanged) ...

export { legalMovesFor, parseFenState, isPawnPromotion };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/multiplayer/chess/chessMoves.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/chess/chessMoves.js src/multiplayer/chess/chessMoves.test.js
git commit -m "Port chess move-legality logic into an ES module"
```

---

## Task 3: Port `chess-board.js` as an ES module

**Files:**
- Create: `src/multiplayer/chess/ChessBoardCanvas.js`
- Test: `src/multiplayer/chess/ChessBoardCanvas.test.js`

**Interfaces:**
- Consumes: `isPawnPromotion` from `./chessMoves` (Task 2) — the original `chess-board.js` calls the global `ChessMoves.isPawnPromotion(...)` directly inside `_handleClick`; this hidden dependency becomes an explicit import.
- Produces: `ChessBoard` class with the same public interface as `server/public/js/chess-board.js`: `constructor(canvas, playerColor)`, `.onMove`, `.onPieceSelect`, `.onPromotionNeeded` (assignable callbacks), `.updateBoard(board, fenState, lastMove)`, `.resize()`, `.draw()`.

- [ ] **Step 1: Write the failing test**

Canvas drawing itself isn't meaningfully unit-testable (per the spec), but the coordinate-transform math is pure and worth locking down since it's easy to break silently when flipping the board for Black:

```js
// src/multiplayer/chess/ChessBoardCanvas.test.js
import { describe, it, expect, vi } from 'vitest';
import { ChessBoard } from './ChessBoardCanvas';

function makeFakeCanvas() {
  return {
    getContext: () => ({
      fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    }),
    width: 560, height: 560,
    addEventListener: vi.fn(),
  };
}

describe('ChessBoard coordinate transforms', () => {
  it('does not flip the board for the white player', () => {
    const board = new ChessBoard(makeFakeCanvas(), 'white');
    expect(board.flipped).toBe(false);
    expect(board._toCanvas(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('flips the board 180 degrees for the black player', () => {
    const board = new ChessBoard(makeFakeCanvas(), 'black');
    expect(board.flipped).toBe(true);
    // row 0, col 0 (a8) should render in the bottom-right corner when flipped
    const { x, y } = board._toCanvas(0, 0);
    expect(x).toBe(7 * board.cellSize);
    expect(y).toBe(7 * board.cellSize);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/multiplayer/chess/ChessBoardCanvas.test.js`
Expected: FAIL — `Cannot find module './ChessBoardCanvas'`.

- [ ] **Step 3: Create the module**

Read `server/public/js/chess-board.js` in full and adapt it: same class body, but replace the bare `ChessMoves.isPawnPromotion(...)` call inside `_handleClick` with the imported `isPawnPromotion`, and export the class instead of assigning to `window`.

```js
// src/multiplayer/chess/ChessBoardCanvas.js
// Adapted from server/public/js/chess-board.js — same rendering logic, ES
// module instead of a classic script. The only functional change is
// replacing the implicit `ChessMoves` global with an explicit import.

'use strict';

import { isPawnPromotion } from './chessMoves';

const PIECE_UNICODE = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
};

const LIGHT_SQ = '#f0d9b5';
const DARK_SQ  = '#b58863';
const COLS = 8, ROWS = 8;

export class ChessBoard {
  // ... (paste the full body of the ChessBoard class from
  // server/public/js/chess-board.js here, unchanged, EXCEPT inside
  // _handleClick change:
  //   if (this.onPromotionNeeded &&
  //       ChessMoves.isPawnPromotion(this.board, from[0], from[1], r)) {
  // to:
  //   if (this.onPromotionNeeded &&
  //       isPawnPromotion(this.board, from[0], from[1], r)) {
  // ) ...
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/multiplayer/chess/ChessBoardCanvas.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/chess/ChessBoardCanvas.js src/multiplayer/chess/ChessBoardCanvas.test.js
git commit -m "Port chess canvas board renderer into an ES module"
```

---

## Task 4: `useMultiplayerSocket` hook

**Files:**
- Create: `src/multiplayer/useMultiplayerSocket.js`
- Test: `src/multiplayer/useMultiplayerSocket.test.js`

**Interfaces:**
- Consumes: `io` from `socket.io-client` (Task 1), `MULTIPLAYER_BASE_URL` from `src/shared/multiplayerGames.js` (already exists).
- Produces:
  ```ts
  useMultiplayerSocket(gameSlug: string): {
    status: 'connecting' | 'connected' | 'disconnected' | 'error',
    reconnectAttempt: number,       // 0 when not currently reconnecting
    roomId: string | null,
    myColor: string | null,
    players: Array<{ name: string, color: string, connected: boolean }>,
    gameState: object | null,       // latest game_started/game_state payload
    lastGameOver: object | null,    // latest game_over payload, or null
    errorMessage: string | null,
    disconnectedPlayerName: string | null, // set on player_disconnected, cleared on next game_state
    socketInstance: import('socket.io-client').Socket | null, // raw client, for game-specific emits (e.g. ChessGame's make_move/resign)
    createRoom: (playerName: string) => void,
    joinRoom: (playerName: string, inviteRoomId: string) => void,
    startGame: () => void,
  }
  ```
  Later tasks (`MultiplayerLobby`, `ChessGame`) consume exactly this shape.

- [ ] **Step 1: Write the failing test**

```js
// src/multiplayer/useMultiplayerSocket.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiplayerSocket } from './useMultiplayerSocket';

class FakeSocket {
  constructor() { this.handlers = {}; this.emitted = []; }
  on(event, cb) { (this.handlers[event] ??= []).push(cb); return this; }
  emit(event, payload) { this.emitted.push([event, payload]); }
  disconnect() {}
  _trigger(event, payload) { (this.handlers[event] || []).forEach(cb => cb(payload)); }
}

let fakeSocket;
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => fakeSocket),
}));

beforeEach(() => { fakeSocket = new FakeSocket(); });

describe('useMultiplayerSocket', () => {
  it('starts in the connecting status', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    expect(result.current.status).toBe('connecting');
  });

  it('moves to connected status on the socket connect event', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('connect'); });
    expect(result.current.status).toBe('connected');
  });

  it('captures roomId and myColor from the joined event', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('joined', { roomId: 'ABC123', color: 'white' }); });
    expect(result.current.roomId).toBe('ABC123');
    expect(result.current.myColor).toBe('white');
  });

  it('updates players from room_update', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    const players = [{ name: 'A', color: 'white', connected: true }];
    act(() => { fakeSocket._trigger('room_update', { players }); });
    expect(result.current.players).toEqual(players);
  });

  it('sets gameState from game_started', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    const state = { fen: 'x', turn: 'w', isGameOver: false };
    act(() => { fakeSocket._trigger('game_started', state); });
    expect(result.current.gameState).toEqual(state);
  });

  it('sets gameState from game_state too', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    const state = { fen: 'y', turn: 'b', isGameOver: false };
    act(() => { fakeSocket._trigger('game_state', state); });
    expect(result.current.gameState).toEqual(state);
  });

  it('sets lastGameOver from game_over', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('game_over', { winner: 'white', reason: 'Checkmate' }); });
    expect(result.current.lastGameOver).toEqual({ winner: 'white', reason: 'Checkmate' });
  });

  it('moves to disconnected status on disconnect', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('connect'); });
    act(() => { fakeSocket._trigger('disconnect'); });
    expect(result.current.status).toBe('disconnected');
  });

  it('captures the error message from an error event', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('error', { message: 'Room not found' }); });
    expect(result.current.errorMessage).toBe('Room not found');
  });

  it('tracks reconnect attempts and resets to 0 on reconnecting connect', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('reconnect_attempt', 2); });
    expect(result.current.reconnectAttempt).toBe(2);
    act(() => { fakeSocket._trigger('connect'); });
    expect(result.current.reconnectAttempt).toBe(0);
  });

  it('captures the disconnected player name from player_disconnected', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('player_disconnected', { playerName: 'Opponent' }); });
    expect(result.current.disconnectedPlayerName).toBe('Opponent');
  });

  it('clears disconnectedPlayerName once a new game_state arrives', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { fakeSocket._trigger('player_disconnected', { playerName: 'Opponent' }); });
    act(() => { fakeSocket._trigger('game_state', { fen: 'z', turn: 'w', isGameOver: false }); });
    expect(result.current.disconnectedPlayerName).toBe(null);
  });

  it('exposes the raw socket instance for game-specific emits', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    expect(result.current.socketInstance).toBe(fakeSocket);
  });

  it('createRoom emits join_game with no roomId and the given gameType', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { result.current.createRoom('Tester'); });
    expect(fakeSocket.emitted).toContainEqual(
      ['join_game', { roomId: null, playerName: 'Tester', gameType: 'chess' }]
    );
  });

  it('joinRoom emits join_game with the given roomId', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { result.current.joinRoom('Tester', 'ABC123'); });
    expect(fakeSocket.emitted).toContainEqual(
      ['join_game', { roomId: 'ABC123', playerName: 'Tester', gameType: 'chess' }]
    );
  });

  it('startGame emits start_game', () => {
    const { result } = renderHook(() => useMultiplayerSocket('chess'));
    act(() => { result.current.startGame(); });
    expect(fakeSocket.emitted).toContainEqual(['start_game', undefined]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/multiplayer/useMultiplayerSocket.test.js`
Expected: FAIL — `Cannot find module './useMultiplayerSocket'`.

- [ ] **Step 3: Write the implementation**

```js
// src/multiplayer/useMultiplayerSocket.js
import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { MULTIPLAYER_BASE_URL } from '../shared/multiplayerGames';

/**
 * Owns one Socket.IO connection for a Play with a Friend session. Generic
 * across all 5 ready games — only the shape of `gameState` differs per game,
 * which is why it's returned opaquely rather than parsed here.
 */
export function useMultiplayerSocket(gameSlug) {
  const socketRef = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [roomId, setRoomId] = useState(null);
  const [myColor, setMyColor] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [lastGameOver, setLastGameOver] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [disconnectedPlayerName, setDisconnectedPlayerName] = useState(null);
  const [socketInstance, setSocketInstance] = useState(null);

  useEffect(() => {
    const socket = io(MULTIPLAYER_BASE_URL, { reconnectionAttempts: 5, reconnectionDelay: 1000 });
    socketRef.current = socket;
    setSocketInstance(socket);

    socket.on('connect', () => { setStatus('connected'); setReconnectAttempt(0); });
    socket.on('disconnect', () => setStatus('disconnected'));
    socket.on('connect_error', () => setStatus('error'));
    socket.on('reconnect_attempt', n => setReconnectAttempt(n));
    socket.on('joined', ({ roomId, color }) => { setRoomId(roomId); setMyColor(color); });
    socket.on('room_update', ({ players }) => setPlayers(players));
    socket.on('game_started', state => setGameState(state));
    socket.on('game_state',   state => { setGameState(state); setDisconnectedPlayerName(null); });
    socket.on('game_over', payload => setLastGameOver(payload));
    socket.on('error', ({ message }) => setErrorMessage(message));
    socket.on('player_disconnected', ({ playerName }) => setDisconnectedPlayerName(playerName));

    return () => socket.disconnect();
  }, [gameSlug]);

  const createRoom = useCallback((playerName) => {
    socketRef.current?.emit('join_game', { roomId: null, playerName, gameType: gameSlug });
  }, [gameSlug]);

  const joinRoom = useCallback((playerName, inviteRoomId) => {
    socketRef.current?.emit('join_game', { roomId: inviteRoomId, playerName, gameType: gameSlug });
  }, [gameSlug]);

  const startGame = useCallback(() => {
    socketRef.current?.emit('start_game');
  }, []);

  return {
    status, reconnectAttempt, roomId, myColor, players, gameState, lastGameOver,
    errorMessage, disconnectedPlayerName, socketInstance,
    createRoom, joinRoom, startGame,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/multiplayer/useMultiplayerSocket.test.js`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/useMultiplayerSocket.js src/multiplayer/useMultiplayerSocket.test.js
git commit -m "Add useMultiplayerSocket hook for in-app realtime game sessions"
```

---

## Task 5: `MultiplayerLobby` component

**Files:**
- Create: `src/multiplayer/MultiplayerLobby.jsx`
- Create: `src/multiplayer/MultiplayerLobby.module.css`
- Test: `src/multiplayer/MultiplayerLobby.test.jsx`

**Interfaces:**
- Consumes: the return shape of `useMultiplayerSocket` (Task 4) — passed in as props, not called internally, so this component stays testable without mocking sockets.
- Produces: `<MultiplayerLobby gameMeta={{ title, subtitle, maxPlayers, hostColors }} status roomId myColor players errorMessage onCreateRoom={(name) => void} onJoinRoom={(name) => void} inviteRoomId={string|null} onStart={() => void} />`. Calls `onStart` when the host clicks "Start Game"; the parent (`MultiplayerChessSession`, Task 7) decides what "starting" means.

- [ ] **Step 1: Write the failing test**

```jsx
// src/multiplayer/MultiplayerLobby.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MultiplayerLobby } from './MultiplayerLobby';

const gameMeta = { title: 'CaritaHub Chess', subtitle: 'Western Chess — Multiplayer', maxPlayers: 2, hostColors: ['white'] };

describe('MultiplayerLobby', () => {
  it('shows a room-not-found error when the socket reports one', () => {
    render(
      <MultiplayerLobby gameMeta={gameMeta} status="connected" roomId={null} myColor={null}
        players={[]} errorMessage="Room not found" onCreateRoom={vi.fn()} onJoinRoom={vi.fn()}
        inviteRoomId={null} onStart={vi.fn()} />
    );
    expect(screen.getByText('Room not found')).toBeInTheDocument();
  });

  it('disables the create button until a name is entered', () => {
    render(
      <MultiplayerLobby gameMeta={gameMeta} status="connected" roomId={null} myColor={null}
        players={[]} errorMessage={null} onCreateRoom={vi.fn()} onJoinRoom={vi.fn()}
        inviteRoomId={null} onStart={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Create Game' })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Tester' } });
    expect(screen.getByRole('button', { name: 'Create Game' })).not.toBeDisabled();
  });

  it('calls onCreateRoom with the entered name when there is no invite room', () => {
    const onCreateRoom = vi.fn();
    render(
      <MultiplayerLobby gameMeta={gameMeta} status="connected" roomId={null} myColor={null}
        players={[]} errorMessage={null} onCreateRoom={onCreateRoom} onJoinRoom={vi.fn()}
        inviteRoomId={null} onStart={vi.fn()} />
    );
    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Tester' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Game' }));
    expect(onCreateRoom).toHaveBeenCalledWith('Tester');
  });

  it('shows "Join Game" and calls onJoinRoom when an inviteRoomId is present', () => {
    const onJoinRoom = vi.fn();
    render(
      <MultiplayerLobby gameMeta={gameMeta} status="connected" roomId={null} myColor={null}
        players={[]} errorMessage={null} onCreateRoom={vi.fn()} onJoinRoom={onJoinRoom}
        inviteRoomId="ABC123" onStart={vi.fn()} />
    );
    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Opponent' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Game' }));
    expect(onJoinRoom).toHaveBeenCalledWith('Opponent');
  });

  it('shows the Start Game button only once enough players have connected', () => {
    const players = [
      { name: 'Tester', color: 'white', connected: true },
      { name: 'Opponent', color: 'black', connected: true },
    ];
    render(
      <MultiplayerLobby gameMeta={gameMeta} status="connected" roomId="ABC123" myColor="white"
        players={players} errorMessage={null} onCreateRoom={vi.fn()} onJoinRoom={vi.fn()}
        inviteRoomId={null} onStart={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeInTheDocument();
  });

  it('does not show Start Game while waiting for the opponent', () => {
    const players = [{ name: 'Tester', color: 'white', connected: true }];
    render(
      <MultiplayerLobby gameMeta={gameMeta} status="connected" roomId="ABC123" myColor="white"
        players={players} errorMessage={null} onCreateRoom={vi.fn()} onJoinRoom={vi.fn()}
        inviteRoomId={null} onStart={vi.fn()} />
    );
    expect(screen.queryByRole('button', { name: 'Start Game' })).not.toBeInTheDocument();
    expect(screen.getByText(/waiting for 1 more player/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/multiplayer/MultiplayerLobby.test.jsx`
Expected: FAIL — `Cannot find module './MultiplayerLobby'`.

- [ ] **Step 3: Write the implementation**

```jsx
// src/multiplayer/MultiplayerLobby.jsx
import { useState } from 'react';
import PropTypes from 'prop-types';
import styles from './MultiplayerLobby.module.css';

export function MultiplayerLobby({
  gameMeta, status, roomId, myColor, players, errorMessage,
  onCreateRoom, onJoinRoom, inviteRoomId, onStart,
}) {
  const [name, setName] = useState('');

  const connectedCount = players.filter(p => p.connected).length;
  const isHost = myColor !== null && gameMeta.hostColors.includes(myColor);
  const allReady = connectedCount >= gameMeta.maxPlayers;
  const hasJoined = roomId !== null;

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (inviteRoomId) onJoinRoom(trimmed);
    else onCreateRoom(trimmed);
  };

  return (
    <div className={styles.lobby}>
      <h2 className={styles.title}>{gameMeta.title}</h2>
      <p className={styles.subtitle}>{gameMeta.subtitle}</p>

      {errorMessage && <p className={styles.error}>{errorMessage}</p>}

      {!hasJoined && (
        <div className={styles.joinForm}>
          <label htmlFor="mp-name">Your Name</label>
          <input
            id="mp-name"
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <button
            className={styles.primaryBtn}
            disabled={name.trim().length === 0 || status !== 'connected'}
            onClick={handleSubmit}
          >
            {inviteRoomId ? 'Join Game' : 'Create Game'}
          </button>
        </div>
      )}

      {hasJoined && (
        <div className={styles.waitingRoom}>
          {players.map(p => (
            <div key={p.color} className={styles.playerRow}>
              {p.name} ({p.color}){!p.connected && ' — disconnected'}
            </div>
          ))}
          {isHost && allReady && (
            <button className={styles.primaryBtn} onClick={onStart}>Start Game</button>
          )}
          {isHost && !allReady && (
            <p>Waiting for {gameMeta.maxPlayers - connectedCount} more player{gameMeta.maxPlayers - connectedCount > 1 ? 's' : ''}…</p>
          )}
        </div>
      )}
    </div>
  );
}

MultiplayerLobby.propTypes = {
  gameMeta: PropTypes.shape({
    title: PropTypes.string.isRequired,
    subtitle: PropTypes.string.isRequired,
    maxPlayers: PropTypes.number.isRequired,
    hostColors: PropTypes.arrayOf(PropTypes.string).isRequired,
  }).isRequired,
  status: PropTypes.string.isRequired,
  roomId: PropTypes.string,
  myColor: PropTypes.string,
  players: PropTypes.array.isRequired,
  errorMessage: PropTypes.string,
  onCreateRoom: PropTypes.func.isRequired,
  onJoinRoom: PropTypes.func.isRequired,
  inviteRoomId: PropTypes.string,
  onStart: PropTypes.func.isRequired,
};
```

```css
/* src/multiplayer/MultiplayerLobby.module.css */
.lobby { max-width: 480px; margin: 0 auto; padding: 24px 16px; text-align: center; }
.title { margin: 0 0 4px; }
.subtitle { color: var(--color-text-muted, #666); margin: 0 0 20px; }
.error { color: var(--color-danger, #c0392b); font-weight: 600; }
.joinForm { display: flex; flex-direction: column; gap: 12px; }
.joinForm input { padding: 10px 12px; font-size: 1rem; border: 1px solid #ccc; border-radius: 8px; }
.primaryBtn { padding: 12px; font-size: 1rem; font-weight: 700; border: none; border-radius: 8px;
  background: var(--color-primary, #1155cc); color: #fff; cursor: pointer; }
.primaryBtn:disabled { opacity: 0.5; cursor: not-allowed; }
.waitingRoom { display: flex; flex-direction: column; gap: 8px; }
.playerRow { padding: 8px; background: #f5f5f5; border-radius: 6px; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/multiplayer/MultiplayerLobby.test.jsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/MultiplayerLobby.jsx src/multiplayer/MultiplayerLobby.module.css src/multiplayer/MultiplayerLobby.test.jsx
git commit -m "Add generic MultiplayerLobby component"
```

---

## Task 6: `ChessGame` component

**Files:**
- Create: `src/multiplayer/chess/ChessGame.jsx`
- Create: `src/multiplayer/chess/ChessGame.module.css`
- Test: `src/multiplayer/chess/ChessGame.test.jsx`

**Interfaces:**
- Consumes: `ChessBoard` from `./ChessBoardCanvas` (Task 3), `legalMovesFor`/`parseFenState` from `./chessMoves` (Task 2), `saveScore` from `../../utils/scoreStore`, `buildPayload` from `../../utils/buildPayload`, and from `useMultiplayerSocket`'s return value (Task 4): `socketInstance`, `status`, `reconnectAttempt`, `disconnectedPlayerName`.
- Produces: `<ChessGame myColor myName gameState lastGameOver socket status reconnectAttempt disconnectedPlayerName memberId callbackUrl accessToken />` where `socket` is the raw Socket.IO client instance (`socketInstance` from the hook — the one place the raw socket escapes the hook, since move-emission is Chess-specific and doesn't belong in the generic hook).

- [ ] **Step 1: Write the failing test**

This test focuses on the score-reporting side effect (the actual new behavior this port introduces), not on canvas rendering:

```jsx
// src/multiplayer/chess/ChessGame.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChessGame } from './ChessGame';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';

function makeSocket() { return { emit: vi.fn(), on: vi.fn(), off: vi.fn() }; }

const baseState = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', turn: 'w', isGameOver: false, inCheck: false };

// jsdom has no real 2D canvas context; ChessGame mounts the real ChessBoard
// class (deliberately not mocked — this is the integration point worth
// exercising for real), so stub just enough of the context for `draw()` to
// run without throwing. Same approach as ChessBoardCanvas.test.js's fake canvas.
beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() => Promise.resolve({}));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
  }));
});

describe('ChessGame scoring', () => {
  it('saves a win (100%) when I am the winner', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 'white', reason: 'Checkmate' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-chess', 100, expect.any(Number), 'm-1', null);
  });

  it('saves a loss (0%) when the opponent wins', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 'black', reason: 'Checkmate' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-chess', 0, expect.any(Number), 'm-1', null);
  });

  it('saves a draw (50%) on stalemate', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 'draw', reason: 'Stalemate' }}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).toHaveBeenCalledWith('mp-chess', 50, expect.any(Number), 'm-1', null);
  });

  it('posts to callbackUrl when one is provided', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState}
        lastGameOver={{ winner: 'white', reason: 'Checkmate' }}
        socket={makeSocket()} memberId="m-1" callbackUrl="https://host.example/callback" accessToken="tok" />
    );
    expect(buildPayload).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://host.example/callback',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('does not report a result when there is no lastGameOver yet', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState}
        lastGameOver={null}
        socket={makeSocket()} memberId="m-1" callbackUrl={undefined} accessToken={undefined} />
    );
    expect(saveScore).not.toHaveBeenCalled();
  });
});

describe('ChessGame connection banners', () => {
  it('shows a reconnecting banner when status is disconnected', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" status="disconnected" reconnectAttempt={2}
        disconnectedPlayerName={null} />
    );
    expect(screen.getByText(/reconnecting.*attempt 2/i)).toBeInTheDocument();
  });

  it('shows an opponent-disconnected notice', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" status="connected" reconnectAttempt={0}
        disconnectedPlayerName="Opponent" />
    );
    expect(screen.getByText(/opponent disconnected/i)).toBeInTheDocument();
  });

  it('shows no banner when connected and no one has disconnected', () => {
    render(
      <ChessGame myColor="white" myName="Tester" gameState={baseState} lastGameOver={null}
        socket={makeSocket()} memberId="m-1" status="connected" reconnectAttempt={0}
        disconnectedPlayerName={null} />
    );
    expect(screen.queryByText(/reconnecting/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/disconnected/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/multiplayer/chess/ChessGame.test.jsx`
Expected: FAIL — `Cannot find module './ChessGame'`.

- [ ] **Step 3: Write the implementation**

```jsx
// src/multiplayer/chess/ChessGame.jsx
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ChessBoard } from './ChessBoardCanvas';
import { legalMovesFor, parseFenState } from './chessMoves';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import styles from './ChessGame.module.css';

const RESULT_PCT = { win: 100, draw: 50, loss: 0 };

export function ChessGame({
  myColor, myName, gameState, lastGameOver, socket, memberId, callbackUrl, accessToken,
  status = 'connected', reconnectAttempt = 0, disconnectedPlayerName = null,
}) {
  const canvasRef = useRef(null);
  const boardRef = useRef(null);
  const startedAtRef = useRef(null);
  const reportedRef = useRef(false);
  const [turnStatus, setTurnStatus] = useState('Your turn');

  const opponentColor = myColor === 'white' ? 'black' : 'white';

  // Mount the canvas board once.
  useEffect(() => {
    const board = new ChessBoard(canvasRef.current, myColor);
    board.onPieceSelect = ([r, c]) => {
      const parsed = boardRef.current?.fenState;
      const currentBoard = boardRef.current?.board;
      if (!currentBoard || !parsed) return [];
      const piece = currentBoard[r][c];
      if (!piece) return [];
      const pieceIsWhite = piece === piece.toUpperCase();
      if ((myColor === 'white') !== pieceIsWhite) return [];
      return legalMovesFor(currentBoard, parsed, r, c);
    };
    board.onMove = (from, to, promotion) => {
      socket.emit('make_move', { from, to, promotion: promotion || null });
    };
    boardRef.current = board;
    const onResize = () => board.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [myColor, socket]);

  // Apply each new game_started/game_state payload to the board.
  useEffect(() => {
    if (!gameState || !boardRef.current) return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();

    const parsed = parseFenState(gameState.fen);
    boardRef.current.updateBoard(parsed.board, parsed, gameState.lastMove || null);

    const myTurn = (gameState.turn === 'w' && myColor === 'white') ||
                   (gameState.turn === 'b' && myColor === 'black');
    if (gameState.inCheck) setTurnStatus(myTurn ? 'You are in CHECK!' : 'Opponent is in CHECK!');
    else setTurnStatus(myTurn ? 'Your turn' : "Opponent's turn");
  }, [gameState, myColor]);

  // Report the result exactly once when the match ends.
  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const result = lastGameOver.winner === 'draw' ? 'draw'
      : lastGameOver.winner === myColor ? 'win' : 'loss';
    const durationSeconds = startedAtRef.current !== null
      ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;

    saveScore('mp-chess', RESULT_PCT[result], durationSeconds, memberId, null);

    if (!callbackUrl) return;
    const payload = buildPayload({
      memberId, gameId: 'mp-chess',
      score: RESULT_PCT[result], maxScore: 100,
      completed: true, durationSeconds,
    });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[ChessGame] callback failed:', e));
  }, [lastGameOver, myColor, memberId, callbackUrl, accessToken]);

  return (
    <div className={styles.game}>
      <div className={styles.panel}>{myName} ({myColor})</div>

      {status === 'disconnected' && (
        <div className={styles.banner}>Reconnecting… (attempt {reconnectAttempt})</div>
      )}
      {disconnectedPlayerName && (
        <div className={styles.banner}>{disconnectedPlayerName} disconnected. Waiting for reconnection…</div>
      )}

      <div className={styles.status}>{turnStatus}</div>
      <canvas ref={canvasRef} className={styles.canvas} />
      {lastGameOver && (
        <div className={styles.gameOver}>
          <h3>
            {lastGameOver.winner === 'draw' ? 'Draw!'
              : lastGameOver.winner === myColor ? 'You Win!' : 'You Lose'}
          </h3>
          <p>{lastGameOver.reason}</p>
          <button className={styles.primaryBtn} onClick={() => socket.emit('play_again')}>Play Again</button>
        </div>
      )}
      {!lastGameOver && (
        <button className={styles.resignBtn} onClick={() => socket.emit('resign')}>Resign</button>
      )}
    </div>
  );
}

ChessGame.propTypes = {
  myColor: PropTypes.oneOf(['white', 'black']).isRequired,
  myName: PropTypes.string.isRequired,
  gameState: PropTypes.object,
  lastGameOver: PropTypes.object,
  socket: PropTypes.shape({ emit: PropTypes.func.isRequired }).isRequired,
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
  status: PropTypes.string,
  reconnectAttempt: PropTypes.number,
  disconnectedPlayerName: PropTypes.string,
};
```

```css
/* src/multiplayer/chess/ChessGame.module.css */
.game { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px; }
.panel { font-weight: 700; }
.status { font-size: 1.1rem; }
.canvas { max-width: 100%; touch-action: none; }
.banner { background: #fff3cd; color: #664d03; padding: 8px 12px; border-radius: 8px; font-weight: 600; }
.gameOver { text-align: center; background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
.primaryBtn { padding: 10px 20px; border-radius: 8px; border: none; background: var(--color-primary, #1155cc); color: #fff; cursor: pointer; font-weight: 700; }
.resignBtn { padding: 8px 16px; border-radius: 8px; border: 1px solid #c0392b; color: #c0392b; background: #fff; cursor: pointer; }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/multiplayer/chess/ChessGame.test.jsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/chess/ChessGame.jsx src/multiplayer/chess/ChessGame.module.css src/multiplayer/chess/ChessGame.test.jsx
git commit -m "Add ChessGame component with direct scoreStore/buildPayload reporting"
```

---

## Task 7: `MultiplayerChessSession` — ties lobby, game, and the URL together

**Files:**
- Create: `src/multiplayer/chess/MultiplayerChessSession.jsx`
- Test: `src/multiplayer/chess/MultiplayerChessSession.test.jsx`

**Interfaces:**
- Consumes: `useMultiplayerSocket` (Task 4), `MultiplayerLobby` (Task 5), `ChessGame` (Task 6).
- Produces: `<MultiplayerChessSession memberId callbackUrl accessToken />` — the component `App.jsx` (Task 9) renders for `view === 'mp-chess'`. Reads `room`/`color`/`name` from the URL on mount (for refresh-restore) and writes them back via `history.replaceState` once known.

- [ ] **Step 1: Write the failing test**

```jsx
// src/multiplayer/chess/MultiplayerChessSession.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const mockHookReturn = {
  status: 'connected', reconnectAttempt: 0, roomId: null, myColor: null, players: [],
  gameState: null, lastGameOver: null, errorMessage: null, disconnectedPlayerName: null,
  socketInstance: { emit: vi.fn() },
  createRoom: vi.fn(), joinRoom: vi.fn(), startGame: vi.fn(),
};
vi.mock('../useMultiplayerSocket', () => ({
  useMultiplayerSocket: vi.fn(() => mockHookReturn),
}));

// ChessGame mounts the real canvas board, which needs a working 2D context
// jsdom doesn't provide — irrelevant to what this test verifies (lobby vs.
// game switching), so it's mocked out here the same way useMultiplayerSocket is.
vi.mock('./ChessGame', () => ({
  ChessGame: () => <div>chess game screen</div>,
}));

import { MultiplayerChessSession } from './MultiplayerChessSession';

describe('MultiplayerChessSession', () => {
  it('renders the lobby while no game has started', () => {
    render(<MultiplayerChessSession memberId="m-1" />);
    expect(screen.getByText('CaritaHub Chess')).toBeInTheDocument();
  });

  it('renders the game once gameState is present', () => {
    mockHookReturn.gameState = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', turn: 'w', isGameOver: false };
    mockHookReturn.myColor = 'white';
    render(<MultiplayerChessSession memberId="m-1" />);
    expect(screen.queryByText('CaritaHub Chess')).not.toBeInTheDocument();
    expect(screen.getByText('chess game screen')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/multiplayer/chess/MultiplayerChessSession.test.jsx`
Expected: FAIL — `Cannot find module './MultiplayerChessSession'`.

- [ ] **Step 3: Write the implementation**

```jsx
// src/multiplayer/chess/MultiplayerChessSession.jsx
import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useMultiplayerSocket } from '../useMultiplayerSocket';
import { MultiplayerLobby } from '../MultiplayerLobby';
import { ChessGame } from './ChessGame';

const CHESS_META = {
  title: 'CaritaHub Chess',
  subtitle: 'Western Chess — Multiplayer',
  maxPlayers: 2,
  hostColors: ['white'],
};

function reflectInUrl(params) {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, v);
  });
  window.history.replaceState({}, '', url);
}

export function MultiplayerChessSession({ memberId, callbackUrl, accessToken }) {
  const socket = useMultiplayerSocket('chess');
  const nameRef = useRef('');
  const initialParams = useRef(new URLSearchParams(window.location.search));
  const inviteRoomId = initialParams.current.get('room');

  useEffect(() => {
    reflectInUrl({ view: 'mp-chess', game: 'chess' });
  }, []);

  useEffect(() => {
    if (socket.roomId) reflectInUrl({ room: socket.roomId, color: socket.myColor, name: nameRef.current });
  }, [socket.roomId, socket.myColor]);

  const handleCreateRoom = (name) => { nameRef.current = name; socket.createRoom(name); };
  const handleJoinRoom   = (name) => { nameRef.current = name; socket.joinRoom(name, inviteRoomId); };

  const hasStarted = socket.gameState !== null;

  if (!hasStarted) {
    return (
      <MultiplayerLobby
        gameMeta={CHESS_META}
        status={socket.status}
        roomId={socket.roomId}
        myColor={socket.myColor}
        players={socket.players}
        errorMessage={socket.errorMessage}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
        inviteRoomId={inviteRoomId}
        onStart={socket.startGame}
      />
    );
  }

  return (
    <ChessGame
      myColor={socket.myColor}
      myName={nameRef.current}
      gameState={socket.gameState}
      lastGameOver={socket.lastGameOver}
      socket={socket.socketInstance}
      status={socket.status}
      reconnectAttempt={socket.reconnectAttempt}
      disconnectedPlayerName={socket.disconnectedPlayerName}
      memberId={memberId}
      callbackUrl={callbackUrl}
      accessToken={accessToken}
    />
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
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/chess/MultiplayerChessSession.jsx src/multiplayer/chess/MultiplayerChessSession.test.jsx
git commit -m "Add MultiplayerChessSession tying lobby, game, and URL state together"
```

---

## Task 8: Let `MultiplayerGames` render a game in-app instead of navigating

**Files:**
- Modify: `src/components/MultiplayerGames/MultiplayerGames.jsx`
- Modify: `src/components/MultiplayerGames/MultiplayerGames.test.jsx`

**Interfaces:**
- Produces: `<MultiplayerGames ... inAppSlugs={['chess']} onPlayInApp={(slug) => void} />` — when a clicked game's slug is in `inAppSlugs` and `onPlayInApp` is provided, call it instead of `window.location.href = multiplayerGameUrl(...)`. Games not in `inAppSlugs` keep today's hard-navigation behavior exactly.

- [ ] **Step 1: Write the failing test**

Add to the existing test file. Its current import line is
`import { describe, it, expect, beforeEach, afterEach } from 'vitest';` — change it to also
import `vi` (used by the new tests below):

```js
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
```

Then add the two new tests:

```jsx
// append to src/components/MultiplayerGames/MultiplayerGames.test.jsx
it('calls onPlayInApp instead of navigating for a game in inAppSlugs', () => {
  const onPlayInApp = vi.fn();
  render(
    <MultiplayerGames t={translations} games={games} inAppSlugs={['chess']} onPlayInApp={onPlayInApp} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Play Chess' }));
  expect(onPlayInApp).toHaveBeenCalledWith('chess');
  expect(window.location.href).toBe('');
});

it('still navigates for a game not in inAppSlugs even when onPlayInApp is provided', () => {
  const onPlayInApp = vi.fn();
  render(
    <MultiplayerGames t={translations} games={games} inAppSlugs={['chess']} onPlayInApp={onPlayInApp} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Play Xiangqi' }));
  expect(onPlayInApp).not.toHaveBeenCalled();
  expect(window.location.href).toBe('http://localhost:3000/lobby.html?game=xiangqi');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/MultiplayerGames/MultiplayerGames.test.jsx`
Expected: FAIL — `onPlayInApp` never called; `TypeError` or assertion failure since the prop doesn't exist yet.

- [ ] **Step 3: Update the implementation**

```jsx
// src/components/MultiplayerGames/MultiplayerGames.jsx
export function MultiplayerGames({ t, games, memberId, callbackUrl, accessToken, inAppSlugs = [], onPlayInApp }) {
  return (
    <div className={appStyles.lobby}>
      {/* ...unchanged header... */}
      <div className={appStyles.gameGrid} role="list">
        {games.map(game => (
          <button
            key={game.id}
            className={appStyles.gameCard}
            onClick={() => {
              if (inAppSlugs.includes(game.slug) && onPlayInApp) {
                onPlayInApp(game.slug);
              } else {
                window.location.href = multiplayerGameUrl(game.slug, { memberId, callbackUrl, accessToken });
              }
            }}
            aria-label={`Play ${game.title}`}
          >
            {/* ...unchanged card contents... */}
          </button>
        ))}
      </div>
    </div>
  );
}

MultiplayerGames.propTypes = {
  // ...existing propTypes...
  inAppSlugs: PropTypes.arrayOf(PropTypes.string),
  onPlayInApp: PropTypes.func,
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/MultiplayerGames/MultiplayerGames.test.jsx`
Expected: PASS (all 7 tests — 5 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/MultiplayerGames/MultiplayerGames.jsx src/components/MultiplayerGames/MultiplayerGames.test.jsx
git commit -m "Let MultiplayerGames render opted-in games in-app instead of navigating"
```

---

## Task 9: Wire `App.jsx` — new `mp-chess` view + URL hydration

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `MultiplayerChessSession` (Task 7), the updated `MultiplayerGames` (Task 8).

- [ ] **Step 1: Add the import**

```js
// near the other component imports in src/App.jsx
import { MultiplayerChessSession } from './multiplayer/chess/MultiplayerChessSession';
```

- [ ] **Step 2: Hydrate the initial view from the URL (for refresh restore)**

Find the `useState('home')` at line 254 and change it to read `?view=` on first render:

```js
const [view, setView] = useState(() => (params.get('view') === 'mp-chess' ? 'mp-chess' : 'home'));
```

- [ ] **Step 3: Add the `mp-chess` view branch**

Add this alongside the existing `if (view === 'multiplayer') { ... }` block (around line 686):

```jsx
if (view === 'mp-chess') {
  return (
    <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
      {showBackButtons && (
        <button className={styles.floatingBack} onClick={() => setView('multiplayer')} aria-label="Home" title="Home"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{verticalAlign:'middle'}}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></button>
      )}
      <MultiplayerChessSession memberId={urlMemberId} callbackUrl={urlCallbackUrl} accessToken={urlAccessToken} />
    </div>
  );
}
```

- [ ] **Step 4: Pass the in-app opt-in to `MultiplayerGames`**

Update the existing render call (around line 697):

```jsx
<MultiplayerGames
  t={t}
  games={translatedMultiplayerGames}
  memberId={urlMemberId}
  callbackUrl={urlCallbackUrl}
  accessToken={urlAccessToken}
  inAppSlugs={['chess']}
  onPlayInApp={(slug) => setView(`mp-${slug}`)}
/>
```

- [ ] **Step 5: Verify manually**

Run: `npm run dev` (and `npm --prefix server run dev` in a second terminal). Open `http://localhost:5174`, click "Play with a Friend" → "Chess". Confirm the lobby renders inline (no navigation to `localhost:3000`) and the URL updates to include `?view=mp-chess&game=chess`.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new ones from Tasks 2–8.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "Wire Chess multiplayer session into App.jsx as an in-app view"
```

---

## Task 10: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Start both dev servers**

```bash
npm run dev
```
```bash
npm --prefix server run dev
```

- [ ] **Step 2: Play a full match across two browser contexts**

Open the cgames SPA in two separate browser profiles/incognito windows (so each gets independent `localStorage`). In the first, go to "Play with a Friend" → Chess, enter a name, click "Create Game" — confirm the QR/room-code UI renders inline (no navigation away from `localhost:5174`). In the second, use the room code/QR URL to join. Confirm both windows show "Start Game" once connected, click it as host, and confirm both boards render and sync moves in real time.

- [ ] **Step 3: Verify refresh-restore**

Mid-match, refresh the tab that's mid-game. Confirm the URL contains `?view=mp-chess&room=...&color=...&name=...` and the session reconnects to the same room and board state rather than returning to the home screen.

- [ ] **Step 4: Verify scoring**

Resign or play to checkmate. In the browser devtools console, run `localStorage.getItem('caritahub_scores:guest')` (or the relevant `memberId`) and confirm a `mp-chess` entry appears with the expected percentage. If launched with a `callbackUrl` query param, confirm (via the Network tab) a `POST` fires to that URL.

- [ ] **Step 5: Verify the untouched vanilla path still works**

Open `http://localhost:3000/lobby.html?game=chess` directly (bypassing cgames) and confirm the original vanilla-JS Chess flow still works exactly as before — proving `server/public/` was never modified by this plan.

- [ ] **Step 6: Run the non-regression suite**

```bash
npm test
npm run build
```
Expected: both succeed with no errors.

---

## After this plan

- `CORS_ORIGIN` on the deployed Fly app needs the production Vercel domain added before this works against production (local dev already works since `.env.example` defaults `CORS_ORIGIN=*`). This is a Fly secrets change (`fly secrets set CORS_ORIGIN=...`), not a code task — do it as part of deploying this work, not before.
- Xiangqi, Gin Rummy, Crazy Eights, and Singapore Trivia are natural follow-up plans once this one is verified in production — each should mostly reuse `useMultiplayerSocket` and `MultiplayerLobby` unchanged, needing only a game-specific `<Game>` component per the pattern `ChessGame` establishes here.
