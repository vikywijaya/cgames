# Play with a Friend — wire into the scoring system

Date: 2026-07-20

## Context

The original ["Play with a Friend" design](2026-07-13-play-with-a-friend-design.md)
explicitly made score/callback sync a **non-goal**, because at the time
`caritahub-games` was a separate Fly.io deployment with no callback mechanism,
and rooms were fully anonymous.

Since then, `caritahub-games` (Express + Socket.IO + ~40 vanilla-JS game
clients, including the 5 "Play with a Friend" games) has been vendored into
this repo as `server/`, and `cgames`' own build output is now served by that
same process under `/games` (see the uncommitted `Dockerfile`, `fly.toml`,
`server/`, and the `base: '/games/'` change in `vite.config.js`). Both apps
now share one origin and one deployment, which removes the original blocker:
there's no longer a cross-origin/no-callback reason to skip score sync.

This spec covers wiring match results from the 5 ready 2-player games (Chess,
Xiangqi, Gin Rummy, Crazy Eights, Singapore Trivia) into the same scoring
primitives solo `GameShell` games already use — `scoreStore.js` (local
best-score tracking) and `buildPayload.js`/the CaritaHub REST callback
contract.

## Goals

- When a Play with a Friend match ends, save a result into the same
  `caritahub_scores:<memberId>` localStorage bucket solo games write to, using
  the existing `saveScore()` function unmodified.
- Also POST the result to the host platform's `callbackUrl` (when the session
  was launched with one), using the existing `buildPayload()` shape and the
  same `Access-Token` header convention `App.jsx` already sends.
- Thread `memberId` (and `callbackUrl`/`accessToken` when present) from
  `cgames` → the `caritahub-games` room lobby → the specific game client, so a
  result can be attributed to the member who launched the game.

## Non-goals

- No changes to `GAME_MAP`, `GAME_GROUPS`, `GameShell`, or the daily-challenge
  contract — multiplayer games stay outside that system, exactly as the
  original spec decided.
- No accounts/auth added to the room-join flow itself — a player still just
  types a display name to join; `memberId` only travels along for attribution
  if the browser arrived with one already (i.e. launched from within `cgames`
  with a `memberId` in the URL). A room joined by scanning a QR code / raw
  invite link with no `memberId` simply won't attribute a score (falls back to
  `'guest'`, matching how `App.jsx` already defaults `urlMemberId`).
- No changes to the 2 currently-unready games (Higher-or-Lower, Rummikub) —
  still out of scope per the original spec.
- No change to any other game on the `server/` deployment (Bingo, Boggle,
  Ludo, Hearts, Chordaidi, all TV games) — they are untouched by this feature.

## Non-regression constraints (hard requirement)

This feature must not touch the behavior of existing solo games or the
existing scoring pipeline. Concretely:

- `src/utils/scoreStore.js` and `src/utils/buildPayload.js` are **read-only**
  in this change — they get a new static Express route exposing the existing
  files verbatim, never a modified copy or a forked implementation. Solo games
  keep importing them exactly as today.
- `src/hooks/useGameCallback.js` and `GameShell`'s completion flow are
  untouched.
- `multiplayerGameUrl(slug, opts)`'s new `opts` argument is optional and
  additive — existing calls with just `(slug)` keep returning the exact same
  URL shape as today (verified by keeping the existing
  `multiplayerGames.test.js` cases passing unmodified, plus new cases for the
  `opts` form).
- `server.js` changes are additive only: one new static route, and appending
  extra (optional) query params in `lobby.js`'s existing redirect. No existing
  route, static mount, or Socket.IO event handler is modified. Games other
  than the 5 in scope ignore the new unknown query params harmlessly (they
  already ignore params they don't read).
- Each of the 5 game clients gets exactly one additive call to
  `reportMultiplayerResult(...)` inserted at the point where they already
  compute win/loss/draw — no change to the existing game logic, rendering, or
  the `game_over`/`showGameOver` control flow itself.
- Verification before calling this done: run `npm test`, `npm run lint`, and
  `npm run build` in `cgames/` (must all stay green — this is the existing
  solo-game safety net), plus a manual playthrough of at least one solo game
  end-to-end (confirm `caritahub_scores` still updates correctly) and one
  multiplayer game end-to-end (confirm both the local save and the callback
  fire, and that an untouched multiplayer game like Bingo still loads and
  plays normally).

## Design

### 1. Identity threading (URL params)

`src/shared/multiplayerGames.js`:

```js
export function multiplayerGameUrl(slug, { memberId, callbackUrl, accessToken } = {}) {
  const url = new URL(`${MULTIPLAYER_BASE_URL}/lobby.html`);
  url.searchParams.set('game', slug);
  if (memberId)    url.searchParams.set('memberId', memberId);
  if (callbackUrl) url.searchParams.set('callbackUrl', callbackUrl);
  if (accessToken) url.searchParams.set('accessToken', accessToken);
  return url.toString();
}
```

Called from `App.jsx`'s `translatedMultiplayerGames` construction (or wherever
`MultiplayerGames` builds the click URL) with the already-in-scope
`urlMemberId`, `urlCallbackUrl`, `urlAccessToken`.

`server/public/js/lobby.js`: read the same three params off its own
`window.location.search` (already has a `params` object at line 154), and
append them to the existing redirect at line 269:

```js
const identityQS = new URLSearchParams();
if (memberId)    identityQS.set('memberId', memberId);
if (callbackUrl) identityQS.set('callbackUrl', callbackUrl);
if (accessToken) identityQS.set('accessToken', accessToken);
window.location.href =
  `${gameMeta.gamePage}?room=${myRoomId}&color=${myColor}&name=${encodeURIComponent(myName)}&game=${gameId}` +
  (identityQS.toString() ? `&${identityQS}` : '');
```

### 2. Shared scoring bridge (no duplication)

`src/utils/scoreStore.js` and `src/utils/buildPayload.js` have zero imports
and no JSX/bundler-specific syntax — they're already valid standalone ES
modules. `server.js` exposes them as-is:

```js
app.use('/shared', express.static(path.join(__dirname, '..', 'src/utils')));
```

New `server/public/js/mp-report-result.js`:

```js
import { saveScore } from '/shared/scoreStore.js';
import { buildPayload } from '/shared/buildPayload.js';

export async function reportMultiplayerResult({ gameId, result, score, maxScore, durationSeconds }) {
  const params      = new URLSearchParams(location.search);
  const memberId    = params.get('memberId') || 'guest';
  const callbackUrl = params.get('callbackUrl');
  const accessToken = params.get('accessToken');

  const pct = typeof score === 'number' && typeof maxScore === 'number' && maxScore > 0
    ? Math.round((score / maxScore) * 100)
    : result === 'win' ? 100 : result === 'draw' ? 50 : 0;

  saveScore(gameId, pct, durationSeconds ?? null, memberId, null);

  if (!callbackUrl) return;
  const payload = buildPayload({
    memberId, gameId,
    score: score ?? (result === 'win' ? 1 : 0),
    maxScore: maxScore ?? 1,
    completed: true,
    durationSeconds: durationSeconds ?? 0,
  });
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (accessToken) headers['Access-Token'] = accessToken;
  try {
    await fetch(callbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
  } catch (e) {
    console.warn('[mp-report-result] callback failed:', e);
  }
}
```

Each of the 5 game HTML pages adds `<script type="module" src="/js/mp-report-result.js"></script>`
(or imports it from within their existing `type="module"` script, whichever
each file already uses).

### 3. Per-game hook points + duration tracking

| Game | File | Hook |
|---|---|---|
| Chess | `chess-game.js` | `showGameOver(winner, reason)` — compare `winner` to `myColor` |
| Xiangqi | `game.js` | same pattern (verify exact function name during implementation) |
| Gin Rummy | `gin-rummy-game.js` | `showGameOver(winnerSeat, reason)` — compare to `mySeat` |
| Crazy Eights | `crazy-eights-game.js` | `showGameOver(winnerSeat, reason)` — compare to `mySeat` |
| Singapore Trivia | `singapore-trivia-game.js` | `game_over` handler — `gameState.scores[mySeat]` vs `totalQuestions * 3` |

Each file captures `const startedAt = Date.now()` once (at `game_started`/first
`joined`/`game_state` receipt — implementation picks the earliest reliable
point per file) and computes `durationSeconds = Math.round((Date.now() - startedAt) / 1000)`
at the hook point.

`gameId` passed to `reportMultiplayerResult` is the existing `mp-*` id from
`src/shared/multiplayerGames.js` (`mp-chess`, `mp-xiangqi`, `mp-gin-rummy`,
`mp-crazy-eights`, `mp-singapore-trivia`) — these already exist as
localStorage keys are free-form strings, no registration needed elsewhere.

### 4. Score normalization

- Chess / Xiangqi / Gin Rummy / Crazy Eights: win → 100%, draw → 50%
  (chess/xiangqi only), loss → 0%.
- Singapore Trivia: `pct = round(100 * myScore / (totalQuestions * 3))`, using
  the engine's real fixed max (`QUESTIONS_PER_ROUND = 10`, 3 pts max per
  question).

### 5. Testing

- `src/shared/multiplayerGames.test.js`: extend to cover `multiplayerGameUrl(slug, opts)`
  — no-opts case unchanged, plus new cases asserting `memberId`/`callbackUrl`/`accessToken`
  appear when passed.
- No new Vitest coverage for the `server/` vanilla-JS files — they're outside
  the jsdom/Vitest setup this repo uses. Manual verification (Non-regression
  constraints section) is the test plan there, called out explicitly rather
  than silently skipped.

## Open questions / risks

- Xiangqi's client file is `game.js` (not `xiangqi-game.js`) — its exact
  win/loss function name needs a quick check during implementation before
  adding the hook (same `myColor`-comparison pattern is expected, per the
  other 3 win/loss games, but not yet confirmed to have the same function
  name).
- `callbackUrl`/`accessToken` traveling through as plain URL query params
  (rather than e.g. a signed token) matches the existing solo-game convention
  (`App.jsx` already does this), so this isn't a new exposure — but it's
  worth noting the callback URL and token are visible in the multiplayer
  room's browser history/URL bar for the duration of the match.
