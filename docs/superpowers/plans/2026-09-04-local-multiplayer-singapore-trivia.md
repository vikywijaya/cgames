# Local Split-Screen Singapore Trivia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the networked (Socket.IO + Fly.io server) Singapore Trivia game into a fully client-side, same-device split-screen local multiplayer game — the fifth and last of the five games, completing the conversion started with Chess.

**Architecture:** Port `server/src/engine/singapore-trivia.js` verbatim into the client bundle (CommonJS → ESM export only) — this includes the embedded 24-question `QUESTION_BANK`, since there is no separate data file to reuse. Unlike the other four games, this engine's `state()` alone is not enough to drive the UI: the 20-second auto-reveal timer and the "everyone answered → reveal early" short-circuit currently live in `server/src/rooms/socketEvents.js`'s `trivia_next`/`trivia_answer` handlers, not in the engine. Both must be reimplemented client-side inside `useLocalSingaporeTriviaMatch()` using `setTimeout`/`useEffect`, replicating the exact behavior: `startQuestion()` schedules a 20s timer; the timer's callback guards `phase === 'question'` before revealing (in case reveal already happened another way) and is always cleared before starting a new one or on unmount; `submitAnswer()`'s `allAnswered` flag triggers an immediate reveal and cancels the pending timer. The UI is two side-by-side (not stacked — see Design decision below) panes sharing one `gameState`, each showing its own answer-selection state; the engine's `answers` array is not hidden by the engine itself (confirmed during research — only `correctIndex` is masked while `phase === 'question'`), so the split-screen render logic is what must avoid showing one pane which option the other pane picked before reveal.

**Tech Stack:** React 18 function components + hooks, CSS Modules, Vitest + Testing Library, no TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-03-local-split-screen-multiplayer-design.md`

**Prior art:** `docs/superpowers/plans/2026-09-03-local-multiplayer-chess-pilot.md` (canonical pattern), `docs/superpowers/plans/2026-09-03-local-multiplayer-xiangqi.md`, `docs/superpowers/plans/2026-09-04-local-multiplayer-gin-rummy.md`, `docs/superpowers/plans/2026-09-04-local-multiplayer-crazy-eights.md` (closest precedent for the "fix a networked-version gap while porting" pattern — Crazy Eights' hook fixed a stalemate-reporting gap the same way this plan's Task 2 must fix nothing broken, but must faithfully reproduce timer semantics that used to live server-side).

## Design decision: side-by-side panes, not stacked

Every other converted game stacks two panes vertically (board/hand on top, board/hand on bottom) because the content itself is spatial (a rotated board) or a compact card row. Trivia's content is a question block with up to 4 multi-word answer options, which reads far more naturally in a single portrait column — stacking two of those vertically on a small phone screen would force heavy scrolling or unreadably small text. Instead, this plan places both players' answer panels **side by side in a row**, wrapping to stack only if the viewport is too narrow, with the question text, image, timer, and host controls shared in a **single row above both panes** (not between them, since there's no "upper pane / lower pane" split here — both panes read the same question at the same time). This still satisfies the spec's "dual zones" interaction model (two simultaneous, independently-interactive input zones) without forcing the stacked-pane convention onto content it doesn't fit. If mobile-fit verification (Task 6) finds two side-by-side option columns too cramped, the fallback is stacking them after all — decide empirically, not in advance.

## Global Constraints

- Two humans only, no bot/AI. The engine supports 2-6 players; the local port always calls `createGame(2)`, matching the existing `MultiplayerSingaporeTriviaSession.jsx`'s `gameMeta.maxPlayers = 2` (the app never exposed more than 2 seats in its lobby even though the engine/server room logic support up to 6).
- No name-entry/lobby screen — the match starts immediately with default "Player 1" / "Player 2" labels.
- Answer options must not reveal the other player's pick, or the correct answer, before reveal — the split-screen equivalent of "visually hide the opponent's hand," adapted to a quiz format instead of cards. `tapToRevealHand`-style masking is not reused verbatim (there's no "hand" here), but the same underlying rule applies: don't leak information across panes before it's supposed to be visible.
- No "host" concept — the networked version gated Reveal/Next/Finish controls behind `myColor === 'p1'` because only one browser tab needed to drive room-wide state. In local split-screen play there is one shared `gameState` and one physical device, so these controls are simply always available (no host check) — anyone at the table can tap Reveal/Next/Finish, matching how Resign/Reset work in the other four converted games (available to whichever pane's button is clicked, not gated by a "whose turn" concept for these specific actions).
- Must fit on small phone screens without scrolling — verify on iPhone SE and iPhone 13 via Playwright, same bar as all four prior games.
- Reset control with a confirmation step before restarting, reusing existing shared i18n keys (`resetGame`, `resetConfirmTitle`, `resetConfirmBody`, `resetConfirmYes`, `resetConfirmCancel`).
- The 20-second auto-reveal timer and the "all answered → reveal early" logic must be faithfully reproduced client-side (see Architecture above) — this is the one piece of real game logic that doesn't exist in the ported engine itself and must be written fresh in the hook.
- Do not touch `server/src/engine/singapore-trivia.js`, `server/src/rooms/socketEvents.js`, `fly.toml`, `useMultiplayerSocket.js`, or `MultiplayerLobby.jsx` in this plan — final server/lobby cleanup happens in a separate plan once all 5 games are confirmed converted and verified (this is the last game, so that cleanup plan is the very next piece of work after this one, not deferred indefinitely).
- Do not disturb the pre-existing uncommitted i18n/session changes already present on this branch in `App.jsx`, `MultiplayerLobby.jsx`, `.claude/settings.local.json` — layer new changes on top; never `git checkout` or discard them. (Note: research confirmed the uncommitted edits to `SingaporeTriviaGame.jsx`/`MultiplayerSingaporeTriviaSession.jsx` themselves are i18n-wiring only, not game logic — Task 4/5 below fully rewrite both files' bodies regardless, so those specific uncommitted edits are superseded, not preserved, exactly as happened for the other four games' pre-conversion uncommitted edits.)

---

## Engine Interface Reference

`server/src/engine/singapore-trivia.js`'s `createGame(playerCount = 2)` returns:

```js
{
  state()                          // full state payload (see below)
  startQuestion()                  // → { ok, reason? } — 'waiting'|'reveal' → 'question'
  submitAnswer(seat, answerIndex)  // → { ok, reason? } or { ok: true, allAnswered }
  revealAnswers()                  // → { ok, reason? } — 'question' → 'reveal', scores this question
  nextQuestion()                   // → { ok, reason? } or { ok: true, finished } — 'reveal' → 'waiting' or 'finished'
  isGameOver()                     // bool
  winner()                         // seat index (highest score, ties go to the lower seat index) | null before game-over
  QUESTION_TIME                    // 20 (seconds), also available as a module-level export
}
```

Module also exports `QUESTIONS_PER_ROUND = 10` at the top level.

`state()` shape:
```js
{
  gameType: 'singapore-trivia',
  phase: 'waiting' | 'question' | 'reveal' | 'finished',
  questionIndex: number,           // -1 before the first question starts, then 0..9
  totalQuestions: 10,
  currentQuestion: {                // null only before the first startQuestion()
    text: string,
    imageUrl: string | null,
    options: [string, string, string, string],
    category: string,
    correctIndex: number | null,   // null while phase === 'question' (hidden); real index once phase is 'reveal'/'finished'
  } | null,
  answers: [number|null, number|null],   // per-seat chosen option index; NOT masked by the engine — UI must hide this itself
  answeredCount: number,
  pointsGained: [number, number],  // per-seat points earned on the CURRENT question, populated after reveal (0 before)
  scores: [number, number],        // cumulative
  timeLeft: number,                // seconds remaining; 0 unless phase === 'question'
  isGameOver: boolean,
  playerCount: 2,
}
```

**Scoring** (inside `revealAnswers()`): iterates `answerOrder` (the order players actually answered in, not seat order) — the first correct answerer gets 3pts, the second correct answerer gets 2pts, everyone else correct gets 1pt, wrong answers get 0. **This means answer speed matters** even in the local port, where both players share one screen and one clock — this is an accepted, unchanged behavior carried over from the networked version (first to tap their answer, not first to finish thinking, wins the point tiebreak).

**Two-step finish** (carried over faithfully from the networked handlers' behavior, reproduced in the hook rather than needing two socket round-trips): after the last question's `revealAnswers()`, calling `nextQuestion()` sets `phase = 'finished'` and `isGameOver() === true` — the hook must map this directly into `lastGameOver`, no separate "trivia_finish" step is needed locally (the networked version split this into two socket events only because the host needed a moment to see the last reveal before ending the room; the local hook can synchronously flip `lastGameOver` the instant `nextQuestion()` reports `finished: true`, but the UI still shows a distinct "Finish" button so players get the same "look at the last reveal, then click to end" pacing rather than snapping straight to results — see Task 4).

---

### Task 1: Port the Singapore Trivia engine (including the question bank)

**Files:**
- Create: `src/multiplayer/singapore-trivia/singaporeTriviaEngine.js`
- Test: `src/multiplayer/singapore-trivia/singaporeTriviaEngine.test.js`

**Interfaces:**
- Produces: `createGame(playerCount)`, `QUESTION_TIME`, `QUESTIONS_PER_ROUND`, all re-exported via `export { createGame, QUESTION_TIME, QUESTIONS_PER_ROUND }` — later tasks import these names.

- [ ] **Step 1: Write the failing test**

Create `src/multiplayer/singapore-trivia/singaporeTriviaEngine.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createGame, QUESTION_TIME, QUESTIONS_PER_ROUND } from './singaporeTriviaEngine';

describe('singaporeTriviaEngine', () => {
  it('exports the expected constants', () => {
    expect(QUESTION_TIME).toBe(20);
    expect(QUESTIONS_PER_ROUND).toBe(10);
  });

  it('starts in the waiting phase with no current question and zero scores', () => {
    const engine = createGame(2);
    const gs = engine.state();
    expect(gs.phase).toBe('waiting');
    expect(gs.questionIndex).toBe(-1);
    expect(gs.currentQuestion).toBeNull();
    expect(gs.scores).toEqual([0, 0]);
    expect(gs.totalQuestions).toBe(10);
  });

  it('startQuestion moves to the question phase with the correct answer hidden', () => {
    const engine = createGame(2);
    const result = engine.startQuestion();
    expect(result.ok).toBe(true);
    const gs = engine.state();
    expect(gs.phase).toBe('question');
    expect(gs.questionIndex).toBe(0);
    expect(gs.currentQuestion).not.toBeNull();
    expect(gs.currentQuestion.correctIndex).toBeNull();
    expect(gs.currentQuestion.options).toHaveLength(4);
    expect(gs.timeLeft).toBeGreaterThan(0);
  });

  it('submitAnswer records a per-seat answer and reports allAnswered once both seats have answered', () => {
    const engine = createGame(2);
    engine.startQuestion();
    const first = engine.submitAnswer(0, 1);
    expect(first.ok).toBe(true);
    expect(first.allAnswered).toBe(false);
    const second = engine.submitAnswer(1, 2);
    expect(second.ok).toBe(true);
    expect(second.allAnswered).toBe(true);
    expect(engine.state().answers).toEqual([1, 2]);
  });

  it('rejects a second answer from the same seat', () => {
    const engine = createGame(2);
    engine.startQuestion();
    engine.submitAnswer(0, 0);
    const result = engine.submitAnswer(0, 1);
    expect(result.ok).toBe(false);
  });

  it('revealAnswers moves to reveal phase and unmasks the correct answer', () => {
    const engine = createGame(2);
    engine.startQuestion();
    const beforeCorrect = engine.state().currentQuestion.correctIndex;
    expect(beforeCorrect).toBeNull();
    const result = engine.revealAnswers();
    expect(result.ok).toBe(true);
    const gs = engine.state();
    expect(gs.phase).toBe('reveal');
    expect(gs.currentQuestion.correctIndex).not.toBeNull();
  });

  it('scores 3pts for the first correct answerer and 1pt for a later correct answerer', () => {
    const engine = createGame(2);
    engine.startQuestion();
    const correctIndex = /* not directly knowable pre-reveal */ null;
    // Answer both seats with the SAME option — whichever seat answered
    // first gets scored higher IF that option happens to be correct; since
    // we can't know the correct index before reveal without reaching into
    // engine internals, assert the more robust invariant instead: exactly
    // one of the two seats scores strictly more than the other only when
    // both picked the correct answer, and no seat scores when both are
    // wrong. Simplify by checking the engine's own pointsGained/scores stay
    // internally consistent rather than predicting the random question.
    engine.submitAnswer(0, 0);
    engine.submitAnswer(1, 0);
    engine.revealAnswers();
    const gs = engine.state();
    const totalPoints = gs.pointsGained[0] + gs.pointsGained[1];
    // Both seats picked the SAME option, so either both are wrong (0 total)
    // or both are "correct" for the same option, in which case the first
    // answerer (seat 0, since it called submitAnswer first) gets 3 and the
    // second (seat 1) gets 2 — this is deterministic given identical answers.
    expect([0, 5]).toContain(totalPoints);
    if (totalPoints === 5) {
      expect(gs.pointsGained[0]).toBe(3);
      expect(gs.pointsGained[1]).toBe(2);
      expect(gs.scores).toEqual([3, 2]);
    }
  });

  it('nextQuestion returns to waiting for a non-final question', () => {
    const engine = createGame(2);
    engine.startQuestion();
    engine.submitAnswer(0, 0);
    engine.submitAnswer(1, 0);
    engine.revealAnswers();
    const result = engine.nextQuestion();
    expect(result.ok).toBe(true);
    expect(result.finished).toBe(false);
    expect(engine.state().phase).toBe('waiting');
  });

  it('isGameOver/winner report a fresh game as not over', () => {
    const engine = createGame(2);
    expect(engine.isGameOver()).toBe(false);
    expect(engine.winner()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/multiplayer/singapore-trivia/singaporeTriviaEngine.test.js`
Expected: FAIL with "Cannot find module './singaporeTriviaEngine'" (or similar resolution error).

- [ ] **Step 3: Write minimal implementation**

Create `src/multiplayer/singapore-trivia/singaporeTriviaEngine.js` as a verbatim port of `server/src/engine/singapore-trivia.js`: copy the entire body (lines 1–456: the full 24-entry `QUESTION_BANK` array, `QUESTIONS_PER_ROUND`, `QUESTION_TIME`, `shuffle`, `createGame` with all its internal helpers — `currentQuestion`, `state`, `startQuestion`, `submitAnswer`, `revealAnswers`, `nextQuestion`, `isGameOver`, `winner`), changing only the module boundary:

```js
// (all engine code from server/src/engine/singapore-trivia.js, verbatim,
// including the full QUESTION_BANK array, down to the end of createGame()'s
// closing brace)

export { createGame, QUESTION_TIME, QUESTIONS_PER_ROUND };
```

Drop the `'use strict';` pragma at the top and the `module.exports = { createGame, QUESTION_TIME: QUESTION_TIME, QUESTIONS_PER_ROUND };` line — everything else, including the full question bank text (all 24 questions, exact wording, `imageUrl`s, `correctIndex`es), is copied unchanged. Do not paraphrase or abbreviate the question bank — copy it byte-for-byte from the server file so answer keys stay correct.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/multiplayer/singapore-trivia/singaporeTriviaEngine.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/singapore-trivia/singaporeTriviaEngine.js src/multiplayer/singapore-trivia/singaporeTriviaEngine.test.js
git commit -m "Port singapore trivia engine and question bank for local client-side play"
```

---

### Task 2: `useLocalSingaporeTriviaMatch` hook (with client-side timer + early-reveal logic)

**Files:**
- Create: `src/multiplayer/singapore-trivia/useLocalSingaporeTriviaMatch.js`
- Test: `src/multiplayer/singapore-trivia/useLocalSingaporeTriviaMatch.test.js`

**Interfaces:**
- Consumes: `createGame`, `QUESTION_TIME` from `./singaporeTriviaEngine.js` (Task 1).
- Produces: `useLocalSingaporeTriviaMatch()` → `{ gameState, lastGameOver, players, dispatch }`, consumed by `SingaporeTriviaGame.jsx` (Task 4).
  - `players`: `[{ name: 'Player 1', color: 'p1' }, { name: 'Player 2', color: 'p2' }]` — same convention as every other converted game.
  - `gameState`: the engine's `state()` object as-is.
  - `lastGameOver`: `null` until the match ends, then `{ winner: 0 | 1, reason: string }`. `winner` is never `null` once set — `winner()` always resolves via `scores.indexOf(Math.max(...scores))`, which returns the lower seat index on an exact tie (both engine and hook accept this as the existing, unchanged tiebreak rule — do not invent a "draw" case that doesn't exist in the engine). `reason`: `` `${winnerName} wins with ${winnerScore} points!` `` (mirrors the networked `trivia_finish` handler's reason string, substituting the local player's name).
  - `dispatch(action, payload)` actions:
    - `'start_question'` — payload `{}` — calls `engine.startQuestion()`, and (the key client-side addition) schedules the 20s auto-reveal timer.
    - `'submit_answer'` — payload `{ seat, answerIndex }` — calls `engine.submitAnswer(seat, answerIndex)`; if the result's `allAnswered` is true, cancels the pending timer and immediately calls `engine.revealAnswers()`.
    - `'reveal'` — payload `{}` — manual reveal (mirrors the old "Reveal" button): cancels the pending timer, calls `engine.revealAnswers()`.
    - `'next_question'` — payload `{}` — calls `engine.nextQuestion()`; if the result reports `finished: true`, sets `lastGameOver` (see reason string above) instead of leaving the caller to make a separate "finish" call — Task 4's UI still shows a distinct "Finish" button gating this dispatch so pacing matches the networked version's two-step feel (see Engine Interface Reference's "Two-step finish" note), but the hook itself only needs the one action.
    - `'resign'` — payload `{ seat }` — same shape as every other converted game's hook.
    - `'play_again'` — payload `{}` — creates a fresh `createGame(2)` and clears any pending timer.

**Timer implementation detail:** track the pending timeout's id in a `useRef` (not `useState` — the id itself is never rendered) so it survives across renders without triggering re-renders, and so it can be reliably cleared from multiple dispatch branches and from a `useEffect` unmount cleanup. Structure:

```js
const timerRef = useRef(null);

function clearPendingTimer() {
  if (timerRef.current !== null) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

// inside dispatch('start_question', ...):
clearPendingTimer(); // defensive — should already be null, but never leave two timers racing
engine.startQuestion();
sync();
timerRef.current = setTimeout(() => {
  timerRef.current = null;
  // Guard: only auto-reveal if still in the question phase — if the
  // question was already revealed manually or via all-answered, this
  // timer's job is already done (this exact guard is what the networked
  // handler's setTimeout callback does with `if (eng.state().phase !==
  // 'question') return;`).
  if (engineRef.current.state().phase !== 'question') return;
  engineRef.current.revealAnswers();
  sync();
}, QUESTION_TIME * 1000);

// on unmount (useEffect return) and on every dispatch('play_again', ...)
// and dispatch('resign', ...): clearPendingTimer().
```

- [ ] **Step 1: Write the failing test**

Create `src/multiplayer/singapore-trivia/useLocalSingaporeTriviaMatch.test.js`. Use Vitest's fake timers (`vi.useFakeTimers()`) to deterministically test the 20s auto-reveal without a real 20-second wait:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalSingaporeTriviaMatch } from './useLocalSingaporeTriviaMatch';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('useLocalSingaporeTriviaMatch', () => {
  it('starts with two players, waiting phase, no game-over', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    expect(result.current.players).toEqual([
      { name: 'Player 1', color: 'p1' },
      { name: 'Player 2', color: 'p2' },
    ]);
    expect(result.current.gameState.phase).toBe('waiting');
    expect(result.current.lastGameOver).toBeNull();
  });

  it('start_question moves to the question phase', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('start_question', {}); });
    expect(result.current.gameState.phase).toBe('question');
  });

  it('auto-reveals after 20 seconds if not everyone has answered', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('start_question', {}); });
    expect(result.current.gameState.phase).toBe('question');
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current.gameState.phase).toBe('reveal');
  });

  it('reveals immediately once both seats answer, without waiting for the timer', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('start_question', {}); });
    act(() => { result.current.dispatch('submit_answer', { seat: 0, answerIndex: 0 }); });
    expect(result.current.gameState.phase).toBe('question');
    act(() => { result.current.dispatch('submit_answer', { seat: 1, answerIndex: 1 }); });
    expect(result.current.gameState.phase).toBe('reveal');
  });

  it('does not double-reveal when the 20s timer fires after an early reveal already happened', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('start_question', {}); });
    act(() => { result.current.dispatch('submit_answer', { seat: 0, answerIndex: 0 }); });
    act(() => { result.current.dispatch('submit_answer', { seat: 1, answerIndex: 1 }); });
    expect(result.current.gameState.phase).toBe('reveal');
    const scoresAfterReveal = result.current.gameState.scores;
    // Advancing time should be a no-op now — the pending timer was cancelled
    // by the early reveal, and even if it somehow fired, the phase guard
    // inside the callback prevents a second revealAnswers() call (which
    // would double-score or throw against the engine's own phase check).
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current.gameState.phase).toBe('reveal');
    expect(result.current.gameState.scores).toEqual(scoresAfterReveal);
  });

  it('resign hands the win to the other seat and sets lastGameOver', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    expect(result.current.lastGameOver).toEqual({ winner: 1, reason: 'Resigned' });
    expect(result.current.gameState.isGameOver).toBe(true);
  });

  it('play_again resets to a fresh waiting-phase game and clears lastGameOver', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('resign', { seat: 0 }); });
    act(() => { result.current.dispatch('play_again', {}); });
    expect(result.current.lastGameOver).toBeNull();
    expect(result.current.gameState.phase).toBe('waiting');
    expect(result.current.gameState.scores).toEqual([0, 0]);
  });

  it('play_again cancels a pending auto-reveal timer from the previous question', () => {
    const { result } = renderHook(() => useLocalSingaporeTriviaMatch());
    act(() => { result.current.dispatch('start_question', {}); });
    act(() => { result.current.dispatch('play_again', {}); });
    // If the old timer weren't cancelled, advancing time here would call
    // revealAnswers() on the OLD engine instance, which no longer matters,
    // but could still throw if that engine's phase somehow reset — assert
    // the new game is unaffected either way.
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(result.current.gameState.phase).toBe('waiting');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/multiplayer/singapore-trivia/useLocalSingaporeTriviaMatch.test.js`
Expected: FAIL with "Cannot find module './useLocalSingaporeTriviaMatch'"

- [ ] **Step 3: Write minimal implementation**

Create `src/multiplayer/singapore-trivia/useLocalSingaporeTriviaMatch.js`:

```js
import { useCallback, useEffect, useRef, useState } from 'react';
import { createGame, QUESTION_TIME } from './singaporeTriviaEngine';

const PLAYERS = [
  { name: 'Player 1', color: 'p1' },
  { name: 'Player 2', color: 'p2' },
];

export function useLocalSingaporeTriviaMatch() {
  const engineRef = useRef(createGame(2));
  const [gameState, setGameState] = useState(() => engineRef.current.state());
  const [lastGameOver, setLastGameOver] = useState(null);
  const timerRef = useRef(null);

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const sync = useCallback(() => {
    setGameState(engineRef.current.state());
  }, []);

  const scheduleAutoReveal = useCallback(() => {
    clearPendingTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      // Guard against a reveal that already happened another way (manual
      // reveal or all-answered early reveal) between scheduling and firing.
      if (engineRef.current.state().phase !== 'question') return;
      engineRef.current.revealAnswers();
      sync();
    }, QUESTION_TIME * 1000);
  }, [clearPendingTimer, sync]);

  useEffect(() => clearPendingTimer, [clearPendingTimer]);

  const dispatch = useCallback((action, payload = {}) => {
    const engine = engineRef.current;

    if (action === 'start_question') {
      const result = engine.startQuestion();
      if (result.ok) {
        sync();
        scheduleAutoReveal();
      }
      return;
    }

    if (action === 'submit_answer') {
      const result = engine.submitAnswer(payload.seat, payload.answerIndex);
      if (!result.ok) return;
      if (result.allAnswered) {
        clearPendingTimer();
        engine.revealAnswers();
      }
      sync();
      return;
    }

    if (action === 'reveal') {
      clearPendingTimer();
      const result = engine.revealAnswers();
      if (result.ok) sync();
      return;
    }

    if (action === 'next_question') {
      const result = engine.nextQuestion();
      if (!result.ok) return;
      sync();
      if (result.finished) {
        const winnerSeat = engine.winner();
        const winnerName = PLAYERS[winnerSeat].name;
        const winnerScore = engine.state().scores[winnerSeat];
        setLastGameOver({ winner: winnerSeat, reason: `${winnerName} wins with ${winnerScore} points!` });
      }
      return;
    }

    if (action === 'resign') {
      clearPendingTimer();
      const resigningSeat = payload.seat;
      const winner = 1 - resigningSeat;
      setLastGameOver({ winner, reason: 'Resigned' });
      setGameState(prev => ({ ...prev, isGameOver: true, winner }));
      return;
    }

    if (action === 'play_again') {
      clearPendingTimer();
      engineRef.current = createGame(2);
      setLastGameOver(null);
      setGameState(engineRef.current.state());
      return;
    }
  }, [sync, scheduleAutoReveal, clearPendingTimer]);

  return { gameState, lastGameOver, players: PLAYERS, dispatch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/multiplayer/singapore-trivia/useLocalSingaporeTriviaMatch.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/singapore-trivia/useLocalSingaporeTriviaMatch.js src/multiplayer/singapore-trivia/useLocalSingaporeTriviaMatch.test.js
git commit -m "Add local-match hook for same-device singapore trivia with client-side auto-reveal timer"
```

---

### Task 3: Add i18n strings for split-screen Singapore Trivia

**Files:**
- Modify: `src/i18n/en.js`, `src/i18n/id.js`, `src/i18n/ms.js`, `src/i18n/ta.js`, `src/i18n/zh.js`

**Interfaces:**
- Produces: `t.tapToAnswer` (a generic "your turn to pick" style prompt shown per-pane before that seat has answered) and `t.answeredWaiting` (shown after that seat has answered but the question hasn't been revealed yet), both consumed by `SingaporeTriviaGame.jsx` (Task 4). All 9 existing trivia keys (`hostStartNext`, `waitingForHost`, `questionProgress`, `pointsSuffix`, `trophyYouWin`, `trophyNamedWins`, `reveal`, `nextQuestion`, `finish`) are already present in all 5 locales (confirmed during research) and are reused; two of them (`hostStartNext`, `waitingForHost`) become unused after this conversion since there's no host concept anymore — leave them in place rather than deleting (Singapore Trivia is the last game, so a dedicated i18n-key sweep for now-dead keys across all 5 games is exactly the kind of cleanup the deferred final-cleanup plan should do in one pass, not piecemeal per-game).

- [ ] **Step 1: Add the keys to `src/i18n/en.js`**

In the `// Singapore Trivia` section, add after the existing `finish: 'Finish',` line:

```js
    tapToAnswer: 'Pick an answer!',
    answeredWaiting: '✓ Answered — waiting…',
```

`tapToAnswer` replaces the old per-viewer framing (the networked version never needed this string because each browser tab only ever showed its own answer options — there was no "wait for the other pane" state to word) with a neutral per-pane prompt shown while that pane's seat hasn't answered yet. `answeredWaiting` covers the state right after that seat answers but before reveal.

- [ ] **Step 2: Add the translated keys to `src/i18n/id.js`**

```js
    tapToAnswer: 'Pilih jawaban!',
    answeredWaiting: '✓ Terjawab — menunggu…',
```

- [ ] **Step 3: Add the translated keys to `src/i18n/ms.js`**

```js
    tapToAnswer: 'Pilih jawapan!',
    answeredWaiting: '✓ Telah dijawab — menunggu…',
```

- [ ] **Step 4: Add the translated keys to `src/i18n/ta.js`**

```js
    tapToAnswer: 'ஒரு பதிலைத் தேர்ந்தெடுக்கவும்!',
    answeredWaiting: '✓ பதிலளிக்கப்பட்டது — காத்திருக்கிறது…',
```

- [ ] **Step 5: Add the translated keys to `src/i18n/zh.js`**

```js
    tapToAnswer: '选择一个答案！',
    answeredWaiting: '✓ 已回答 — 等待中…',
```

- [ ] **Step 6: Verify structural i18n parity across languages**

Run: `npx vitest run src/i18n/multiplayerKeys.test.js`
Expected: PASS (sanity check only). Then diff key lists directly:

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
git commit -m "Add tapToAnswer/answeredWaiting i18n strings for split-screen singapore trivia"
```

---

### Task 4: Rebuild `SingaporeTriviaGame.jsx` as a side-by-side split-screen view with Reset

**Files:**
- Modify: `src/multiplayer/singapore-trivia/SingaporeTriviaGame.jsx` (full rewrite of the component body; keep the file path)
- Modify: `src/multiplayer/singapore-trivia/SingaporeTriviaGame.module.css`
- Modify: `src/multiplayer/singapore-trivia/SingaporeTriviaGame.test.jsx` (full rewrite of the test body; keep the file path)

**Interfaces:**
- Consumes: `useLocalSingaporeTriviaMatch()` from Task 2; `saveScore` from `../../utils/scoreStore`; `buildPayload` from `../../utils/buildPayload`; `useTranslation` from `../../i18n/useTranslation`.
- Produces: `SingaporeTriviaGame({ memberId, callbackUrl, accessToken })` — no more `myColor`/`myName`/`gameState`/`socket`/`status`/`reconnectAttempt`/`disconnectedPlayerName` props, matching every other converted game's signature.

**Design notes:**
- Layout per the Design decision above: a shared top block (question text + optional image + timer + progress + Reveal/Next/Finish controls), then a row of two side-by-side answer panes below it. On narrow viewports the panes stack (CSS `flex-wrap`), matching how the other games already degrade gracefully.
- Each pane renders its OWN seat's answer buttons: 4 options, each clickable only if `gameState.phase === 'question'` AND that seat hasn't answered yet (`gameState.answers[seat] === null`). Once that seat has answered but `phase` is still `'question'` (waiting on the other seat or the timer), show a "waiting" state — not the other seat's pick, not the correct answer — using the new `tapToAnswer`-adjacent messaging (show a simple "✓ Answered — waiting…" style line; reuse `t.tapToAnswer` inverted or add inline text, whichever reads more naturally — this is a UI wording call, not a new required i18n key beyond `tapToAnswer` itself, which is shown BEFORE that seat answers).
- Once `phase === 'reveal'` or `'finished'`, both panes show the same revealed state: correct option highlighted green, each seat's own wrong pick (if any) highlighted red, matching the color logic already in the old single-pane version (`isCorrect`/`isWrong`/`selected` CSS classes carry over unchanged in spirit).
- No host gating — Reveal/Next Question/Finish buttons in the shared top block are always available per the Global Constraints (no host concept locally).
- Score header: reuse the existing player-chip row style (`Player 1 (p1) — N pt` / `Player 2 (p2) — N pt`), highlighting neither as "you" (no `youSuffix`, since both are visible to both).
- Reset button + confirmation card, same pattern as all four prior games.
- Resign per-pane, same pattern (only render for a pane if the match isn't already over; unlike the other games' `isActive`-gated Resign — which only shows for whoever is "on turn" — trivia has no strict turn order during `'question'` phase (both seats can answer simultaneously), so **both panes' Resign buttons are visible whenever the game isn't over**, not gated to one at a time. This is a deliberate, documented difference from the turn-gated Resign pattern in Chess/Xiangqi/Gin Rummy/Crazy Eights — call it out in a code comment so a future maintainer doesn't "fix" it into a turn-gated pattern that doesn't fit this game.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/multiplayer/singapore-trivia/SingaporeTriviaGame.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/scoreStore', () => ({ saveScore: vi.fn() }));
vi.mock('../../utils/buildPayload', () => ({ buildPayload: vi.fn(() => ({ mocked: true })) }));

import { saveScore } from '../../utils/scoreStore';
import { SingaporeTriviaGame } from './SingaporeTriviaGame';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  global.fetch = vi.fn(() => Promise.resolve({}));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SingaporeTriviaGame split-screen', () => {
  it('renders two player panels before any question has started', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    expect(screen.getByText(/Player 1/)).toBeInTheDocument();
    expect(screen.getByText(/Player 2/)).toBeInTheDocument();
  });

  it('shows a Next Question control while waiting, and starts a question when clicked', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    // Once a question has started, 8 answer option buttons exist (4 per pane).
    const optionButtons = screen.getAllByRole('button').filter(b => /^[A-D]\)/.test(b.textContent || ''));
    expect(optionButtons.length).toBe(8);
  });

  it('answering on one pane does not reveal the other pane\'s pick or the correct answer', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    const optionButtons = screen.getAllByRole('button').filter(b => /^[A-D]\)/.test(b.textContent || ''));
    fireEvent.click(optionButtons[0]); // seat 0's first option
    // No green/red highlighting classes should exist yet — reveal hasn't happened.
    expect(document.querySelector('[class*="correct"]')).toBeNull();
    expect(document.querySelector('[class*="wrong"]')).toBeNull();
  });

  it('auto-reveals after 20 seconds', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getByRole('button', { name: /next question/i }));
    vi.advanceTimersByTime(20_000);
    expect(document.querySelector('[class*="correct"]')).not.toBeNull();
  });

  it('shows resign buttons for both panes and a reset button', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    expect(screen.getAllByRole('button', { name: /resign/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^reset$/i }).length).toBeGreaterThan(0);
  });

  it('reports a loss from Player 1\'s perspective when seat 0 resigns', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /resign/i })[0]);
    expect(saveScore).toHaveBeenCalledWith('mp-singapore-trivia', 0, expect.any(Number), 'm-1', null);
  });
});

describe('SingaporeTriviaGame reset', () => {
  it('asks for confirmation before resetting', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    expect(screen.getByText(/reset this game\?/i)).toBeInTheDocument();
  });

  it('cancelling leaves the game untouched', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/reset this game\?/i)).not.toBeInTheDocument();
  });

  it('confirming restarts the match at the waiting phase', () => {
    render(<SingaporeTriviaGame memberId="m-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^reset$/i })[0]);
    fireEvent.click(screen.getByRole('button', { name: /yes, reset/i }));
    expect(screen.getByRole('button', { name: /next question/i })).toBeInTheDocument();
  });
});
```

Note: the option-button text-matching regex (`/^[A-D]\)/`) assumes Task 4's implementation renders each option prefixed with its letter label followed by `)` (e.g. `"A) Victoria Theatre"`), reusing the old `OPTION_LETTERS` array's intent but with a `)` separator instead of the old version's `<span>` + plain text split (which isn't distinguishable by `.textContent` regex the same way) — implement the option button's visible text accordingly in Step 3 below so this test's selector matches.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/multiplayer/singapore-trivia/SingaporeTriviaGame.test.jsx`
Expected: FAIL — old component expects `myColor`/`gameState`/`socket` props.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/multiplayer/singapore-trivia/SingaporeTriviaGame.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useLocalSingaporeTriviaMatch } from './useLocalSingaporeTriviaMatch';
import { saveScore } from '../../utils/scoreStore';
import { buildPayload } from '../../utils/buildPayload';
import { useTranslation } from '../../i18n/useTranslation';
import styles from './SingaporeTriviaGame.module.css';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

function AnswerPane({ seat, name, gameState, dispatch, t }) {
  const myAnswer = gameState.answers[seat];
  const phase = gameState.phase;
  const canAnswer = phase === 'question' && myAnswer === null;
  const revealed = phase === 'reveal' || phase === 'finished';
  const question = gameState.currentQuestion;

  return (
    <div className={styles.pane}>
      <div className={styles.panel}>
        {name} ({seat === 0 ? 'p1' : 'p2'}){t.pointsSuffix.replace('{n}', gameState.scores[seat] || 0)}
      </div>
      {question && (phase === 'question' || revealed) && (
        <div className={styles.options}>
          {question.options.map((text, idx) => {
            const isCorrect = revealed && idx === question.correctIndex;
            const iSelected = myAnswer === idx;
            const isWrong = revealed && iSelected && idx !== question.correctIndex;
            return (
              <button
                key={idx}
                type="button"
                className={`${styles.optionBtn} ${isCorrect ? styles.correct : ''} ${isWrong ? styles.wrong : ''} ${!revealed && iSelected ? styles.selected : ''}`}
                disabled={!canAnswer}
                onClick={() => dispatch('submit_answer', { seat, answerIndex: idx })}
              >
                {OPTION_LETTERS[idx]}) {text}
              </button>
            );
          })}
        </div>
      )}
      {phase === 'question' && myAnswer !== null && (
        <p className={styles.waitingNote}>{t.answeredWaiting}</p>
      )}
      {phase === 'question' && myAnswer === null && (
        <p className={styles.waitingNote}>{t.tapToAnswer}</p>
      )}
      {/* Resign is available on both panes whenever the match isn't over —
          unlike Chess/Xiangqi/Gin Rummy/Crazy Eights, trivia has no strict
          turn order (both seats can answer the same question at once), so
          gating Resign to "whoever is on turn" doesn't apply here. Do not
          change this to an isActive-style gate without re-checking this. */}
      {!gameState.isGameOver && (
        <button type="button" className={styles.resignBtn} onClick={() => dispatch('resign', { seat })}>
          {t.resign}
        </button>
      )}
    </div>
  );
}
AnswerPane.propTypes = {
  seat: PropTypes.oneOf([0, 1]).isRequired,
  name: PropTypes.string.isRequired,
  gameState: PropTypes.object.isRequired,
  dispatch: PropTypes.func.isRequired,
  t: PropTypes.object.isRequired,
};

export function SingaporeTriviaGame({ memberId, callbackUrl, accessToken }) {
  const t = useTranslation().multiplayer;
  const { gameState, lastGameOver, players, dispatch } = useLocalSingaporeTriviaMatch();
  const startedAtRef = useRef(Date.now());
  const reportedRef = useRef(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => {
    if (!lastGameOver || reportedRef.current) return;
    reportedRef.current = true;

    const score = gameState.scores[0] || 0;
    const maxScore = (gameState.totalQuestions || 0) * 3;
    const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);

    saveScore('mp-singapore-trivia', pct, durationSeconds, memberId, null);

    const payload = buildPayload({
      memberId, gameId: 'mp-singapore-trivia',
      score, maxScore,
      completed: true, durationSeconds,
    });
    window.parent.postMessage({ type: 'GAME_COMPLETE', payload }, '*');

    if (!callbackUrl) return;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (accessToken) headers['Access-Token'] = accessToken;
    fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
      .catch(e => console.warn('[SingaporeTriviaGame] callback failed:', e));
  }, [lastGameOver, gameState, memberId, callbackUrl, accessToken]);

  const p1 = players[0];
  const p2 = players[1];
  const { phase, currentQuestion, scores = [0, 0] } = gameState;

  const ranked = players
    .map((p, i) => ({ name: p.name, score: scores[i] || 0, seat: i }))
    .sort((a, b) => b.score - a.score);

  const handleConfirmReset = () => {
    startedAtRef.current = Date.now();
    reportedRef.current = false;
    dispatch('play_again', {});
    setConfirmingReset(false);
  };

  return (
    <div className={styles.game}>
      <div className={styles.progress}>
        {t.questionProgress.replace('{current}', String(gameState.questionIndex + 1)).replace('{total}', String(gameState.totalQuestions))}
      </div>

      {phase === 'question' && <p className={styles.timer}>⏱ {gameState.timeLeft}s</p>}

      {(phase === 'question' || phase === 'reveal') && currentQuestion && (
        <div className={styles.question}>
          <p className={styles.questionText}>{currentQuestion.text}</p>
          {currentQuestion.imageUrl && (
            <img className={styles.questionImage} src={currentQuestion.imageUrl} alt="" />
          )}
          <p className={styles.answeredCount}>{gameState.answeredCount} / {gameState.playerCount} answered</p>
        </div>
      )}

      {!lastGameOver && (
        <div className={styles.hostControls}>
          {phase === 'waiting' && (
            <button type="button" className={styles.actionBtn} onClick={() => dispatch('start_question', {})}>{t.nextQuestion}</button>
          )}
          {phase === 'question' && (
            <button type="button" className={styles.actionBtn} onClick={() => dispatch('reveal', {})}>{t.reveal}</button>
          )}
          {phase === 'reveal' && gameState.questionIndex < gameState.totalQuestions - 1 && (
            <button type="button" className={styles.actionBtn} onClick={() => dispatch('start_question', {})}>{t.nextQuestion}</button>
          )}
          {phase === 'reveal' && gameState.questionIndex >= gameState.totalQuestions - 1 && (
            <button type="button" className={styles.actionBtn} onClick={() => dispatch('next_question', {})}>{t.finish}</button>
          )}
        </div>
      )}

      <div className={styles.panes}>
        <AnswerPane seat={0} name={p1.name} gameState={gameState} dispatch={dispatch} t={t} />
        <AnswerPane seat={1} name={p2.name} gameState={gameState} dispatch={dispatch} t={t} />
      </div>

      {lastGameOver && (
        <div className={styles.gameOver}>
          <h3>{ranked[0].score === ranked[1].score ? t.trophyNamedWins.replace('{name}', players[lastGameOver.winner].name) : t.trophyNamedWins.replace('{name}', ranked[0].name)}</h3>
          {ranked.map((p, i) => (
            <div key={p.seat} className={styles.resultRow}>
              {i === 0 ? '🥇' : '🥈'} {p.name}{t.pointsSuffix.replace('{n}', p.score)}
            </div>
          ))}
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
  );
}

SingaporeTriviaGame.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
```

Create `src/multiplayer/singapore-trivia/SingaporeTriviaGame.module.css` (full rewrite):

```css
.game { display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 4px; }
.progress { font-size: 0.8rem; text-align: center; font-weight: 600; }
.timer { font-size: 0.9rem; text-align: center; font-weight: 700; margin: 0; }
.question { text-align: center; }
.questionText { font-size: 0.85rem; font-weight: 600; margin: 2px 0; }
.questionImage { max-width: 100%; max-height: 90px; object-fit: contain; border-radius: 6px; margin: 2px 0; }
.answeredCount { font-size: 0.7rem; color: #666; margin: 0; }
.hostControls { display: flex; justify-content: center; gap: 6px; }
.actionBtn { padding: 5px 12px; border-radius: 6px; border: none; background: var(--color-primary, #1155cc); color: #fff; cursor: pointer; font-weight: 700; font-size: 0.8rem; }
.panes { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
.pane { flex: 1 1 160px; min-width: 140px; display: flex; flex-direction: column; align-items: stretch; gap: 3px; border: 1px solid #eee; border-radius: 8px; padding: 4px; }
.panel { font-weight: 700; font-size: 0.75rem; text-align: center; }
.options { display: flex; flex-direction: column; gap: 3px; }
.optionBtn { padding: 5px 6px; border-radius: 6px; border: 1px solid #ccc; background: #fff; cursor: pointer; text-align: left; font-size: 0.7rem; }
.optionBtn:disabled { opacity: 0.7; cursor: not-allowed; }
.optionBtn.selected { border-color: #1155cc; box-shadow: 0 0 0 2px rgba(17,85,204,0.3); }
.optionBtn.correct { border-color: #2e7d32; background: #e8f5e9; }
.optionBtn.wrong { border-color: #c0392b; background: #fdecea; }
.waitingNote { font-size: 0.7rem; color: #666; font-style: italic; text-align: center; margin: 0; }
.resignBtn { padding: 4px 12px; border-radius: 6px; border: 1px solid #c0392b; color: #c0392b; background: #fff; cursor: pointer; font-size: 0.75rem; align-self: center; }
.primaryBtn { padding: 8px 18px; border-radius: 8px; border: none; background: var(--color-primary, #1155cc); color: #fff; cursor: pointer; font-weight: 700; }
.confirmActions { display: flex; gap: 8px; justify-content: center; }
.gameOver { text-align: center; background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.15); }
.resultRow { font-size: 0.85rem; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/multiplayer/singapore-trivia/SingaporeTriviaGame.test.jsx`
Expected: PASS (9 tests). Pay particular attention to the two fake-timer tests (auto-reveal at 20s) — if they hang or time out, confirm `vi.useFakeTimers()`/`vi.advanceTimersByTime()` are wrapped in `act()` correctly, matching the pattern already proven in Task 2's hook test.

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/singapore-trivia/SingaporeTriviaGame.jsx src/multiplayer/singapore-trivia/SingaporeTriviaGame.module.css src/multiplayer/singapore-trivia/SingaporeTriviaGame.test.jsx
git commit -m "Rebuild SingaporeTriviaGame as a local side-by-side split-screen match with Reset"
```

---

### Task 5: Simplify `MultiplayerSingaporeTriviaSession.jsx` — drop the lobby

**Files:**
- Modify: `src/multiplayer/singapore-trivia/MultiplayerSingaporeTriviaSession.jsx` (full rewrite)
- Modify: `src/multiplayer/singapore-trivia/MultiplayerSingaporeTriviaSession.test.jsx` (full rewrite)

**Interfaces:**
- Consumes: `SingaporeTriviaGame` from `./SingaporeTriviaGame` (Task 4).
- Produces: `MultiplayerSingaporeTriviaSession({ memberId, callbackUrl, accessToken })` — same signature as all four other converted sessions.

- [ ] **Step 1: Write the failing test**

Replace the full contents of `src/multiplayer/singapore-trivia/MultiplayerSingaporeTriviaSession.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('./SingaporeTriviaGame', () => ({
  SingaporeTriviaGame: ({ memberId }) => <div>singapore trivia match for {memberId}</div>,
}));

import { MultiplayerSingaporeTriviaSession } from './MultiplayerSingaporeTriviaSession';

describe('MultiplayerSingaporeTriviaSession', () => {
  it('renders the match immediately, with no lobby step', () => {
    render(<MultiplayerSingaporeTriviaSession memberId="m-1" />);
    expect(screen.getByText('singapore trivia match for m-1')).toBeInTheDocument();
    expect(screen.queryByText(/join game/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/multiplayer/singapore-trivia/MultiplayerSingaporeTriviaSession.test.jsx`
Expected: FAIL — old component renders `MultiplayerLobby` and requires different props/mocks.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `src/multiplayer/singapore-trivia/MultiplayerSingaporeTriviaSession.jsx`:

```jsx
import PropTypes from 'prop-types';
import { SingaporeTriviaGame } from './SingaporeTriviaGame';

export function MultiplayerSingaporeTriviaSession({ memberId, callbackUrl, accessToken }) {
  return (
    <SingaporeTriviaGame memberId={memberId} callbackUrl={callbackUrl} accessToken={accessToken} />
  );
}

MultiplayerSingaporeTriviaSession.propTypes = {
  memberId: PropTypes.string.isRequired,
  callbackUrl: PropTypes.string,
  accessToken: PropTypes.string,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/multiplayer/singapore-trivia/MultiplayerSingaporeTriviaSession.test.jsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/multiplayer/singapore-trivia/MultiplayerSingaporeTriviaSession.jsx src/multiplayer/singapore-trivia/MultiplayerSingaporeTriviaSession.test.jsx
git commit -m "Drop the room-code lobby for local singapore trivia matches"
```

---

### Task 6: Manual browser verification

No new files — verification gate, matching all four prior games' Task 6.

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: All tests pass, including the new Singapore Trivia ones (engine 9, hook 9, component 9, session 1 — 28 new tests across Tasks 1, 2, 4, 5).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: Builds successfully with no errors.

- [ ] **Step 3: Start the dev server and open the game in a real Chrome window via Playwright**

Start: `npm run dev` (background). Navigate to `http://localhost:5173/?view=mp-singapore-trivia&memberId=demo-1` (confirmed correct during research — `App.jsx`'s render block for `mp-singapore-trivia` needs no changes and already unconditionally renders `MultiplayerSingaporeTriviaSession`, which after Task 5 renders the game directly with no lobby gate).

Verify, in order:
1. The match loads directly showing both panes side by side (or stacked, if that's what mobile-fit tuning settled on) — no lobby, no name entry, phase `'waiting'`.
2. Click "Next Question" → a question (with image, if the randomly-selected question has one) appears above both panes, a 20s timer counts down, both panes show 4 clickable options each.
3. Click an option in Player 1's pane → that option highlights as selected in Player 1's pane ONLY; Player 2's pane is unaffected and still shows all 4 options clickable; no correct/wrong coloring appears yet in either pane (the core hiding requirement — confirm carefully, this is the one behavior most likely to leak state across panes if the render logic has a bug).
4. Click an option in Player 2's pane → since both seats have now answered, reveal should fire IMMEDIATELY (not wait for the 20s timer) — confirm both panes now show green/red highlighting and the timer disappears.
5. Click "Next Question" again → advances to question 2, phase `'waiting'` briefly then `'question'` once clicked, `answers` reset to both-null, both panes' selections clear.
6. On a later question, deliberately wait without answering and confirm the 20s timer visibly counts down and, when it hits 0, auto-reveals with whatever was answered (or nothing, if neither pane answered) — this is the one behavior Task 2's fake-timer unit tests could exercise deterministically but is worth a real-time confirmation here too (accept a real ~20s wait for this one check).
7. Progress through all 10 questions (use the "Reveal" button after a few to skip ahead without waiting, once the core auto-reveal has been confirmed once) until the last question's reveal shows a "Finish" button instead of "Next Question" — click it, confirm the game-over screen shows a ranked result list, correct trophy/winner text, and calls `saveScore`/the completion callback (check via console or network tab if `callbackUrl` were set — with none set here, just confirm no console errors from the attempted `postMessage`).
8. Click "Play Again" → fresh waiting-phase game, scores reset to 0/0.
9. Mid-match, click Resign on one pane → game-over card appears crediting the OTHER seat as winner with reason "Resigned".
10. Click Reset → confirmation card appears; Cancel leaves state unchanged; Reset → Yes, reset → fresh waiting-phase game.
11. Confirm zero console errors/warnings throughout, and specifically confirm no "Warning: Can't perform a React state update on an unmounted component" style warnings that would indicate the 20s timer's cleanup isn't wired correctly.

- [ ] **Step 4: Verify mobile fit**

Using the same Playwright pattern as all four prior games (`devices['iPhone SE']`, `devices['iPhone 13']`), load the game, start a question, and assert `document.documentElement.scrollHeight <= window.innerHeight` on both — check this specifically WHILE a question with 4 options per pane is showing (the highest-content state), not just at the idle `'waiting'` phase. If the side-by-side layout doesn't fit (per the Design decision's stated fallback), switch `.panes` from `flex-direction: row` (implicit default) to `flex-direction: column` in `SingaporeTriviaGame.module.css` and re-verify — this was flagged upfront as the acceptable fallback, so don't treat needing it as a failure, just implement it and re-check.

- [ ] **Step 5: Stop the dev server**

Kill the background `npm run dev` process started in Step 3.

- [ ] **Step 6: Fix any issues found, then re-run Steps 1-4 until clean**

If manual verification surfaces a bug, fix it directly in the relevant file from Tasks 1-5, re-run the affected unit tests, then repeat this task's Steps 1-4 in full before proceeding.

- [ ] **Step 7: Commit any fixes made during verification**

```bash
git add -A
git commit -m "Fix issues found during singapore trivia manual verification"
```

(Skip this step if Steps 1-4 were clean on the first pass — do not create an empty commit.)

---

## Next Steps

This is the fifth and final game conversion. Once this plan is complete and verified, all five networked multiplayer games (Chess, Xiangqi, Gin Rummy, Crazy Eights, Singapore Trivia) are fully converted to local split-screen play with no remaining dependency on Socket.IO or the Fly.io server for gameplay. The next and final piece of work is the deferred cleanup plan (referenced in every prior game's plan's own "Next Steps" section): delete `fly.toml`; retire all 5 games' cases from `server/src/rooms/socketEvents.js` (or delete the file/its trivia-timer-map entirely if nothing else in it is still load-bearing — verify this, since `socketEvents.js` may still register other non-multiplayer-game socket handlers that must stay); delete the now-fully-unused `server/src/engine/{chess,xiangqi,gin-rummy,crazy-eights,singapore-trivia}.js`; delete `src/multiplayer/useMultiplayerSocket.js` and the `MULTIPLAYER_BASE_URL`/`multiplayerGameUrl` exports from `src/shared/multiplayerGames.js`; delete `MultiplayerLobby.jsx`/`.module.css`/`.test.jsx`; and sweep now-fully-dead i18n keys across all 5 locale files (candidates identified during this and prior plans: `reconnecting`, `opponentDisconnectedWaiting`, `opponentDisconnectedReconnecting`, `hostStartNext`, `waitingForHost`, and any other "you"-framed/host-framed/reconnect-framed keys superseded by their `named*`-prefixed local-mode equivalents — grep each candidate across all `src/multiplayer/**/*.jsx` before deleting to confirm zero remaining references). That cleanup plan should also verify the separate Flutter app's dependency on the Fly server (explicitly accepted as broken per the original architecture decision) doesn't need any coordination before the server-side deletions proceed.
