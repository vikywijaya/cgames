# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server (also serves /api/daily-challenge via vite-api-plugin.js)
npm run build    # Production build → dist/
npm run preview  # Preview the production build
npm test         # Vitest (jsdom). Single file: npx vitest run src/path/to/file.test.js
npm run lint     # ESLint over src/
```

To exercise the Vercel serverless API route locally (`api/daily-challenge.js`), run `npx vercel dev` — see `NOTE.md` for the manual verification checklist.

## What this is

A collection of ~38 standalone cognitive/brain-training mini-games for the **CaritaHub** senior-care platform, built as a single Vite + React 18 SPA (no router, no TypeScript, no state library). Games are embedded into the host platform via iframe/URL params or played directly in a lobby UI.

## Architecture

**Single-page app, three render modes** decided in `src/App.jsx` based on URL:
- **Embedded mode** — `?gameId=x` or path `/x` renders one game fullscreen, no lobby chrome. This is how CaritaHub embeds individual games.
- **Lobby mode** — default `/` shows the home screen, game grid, daily challenge, and achievements.
- **Daily challenge** — `/api/daily-challenge` returns 2 games seeded by the current date (same picks all day).

URL params consumed at module load in `App.jsx`: `gameId`, `memberId`, `difficulty`, `callbackUrl`, `access_token`, `total_score`, `langCode`, `mode` (`mobile` hides back buttons; `web` shows them).

**The GameShell contract is central.** Every game in `src/games/<Name>/` is a self-contained component that wraps its play area in `src/components/GameShell/GameShell.jsx`. GameShell owns the `idle → playing → finished` state machine, the difficulty picker, instructions/how-to-play, the countdown timer, sound effects, and the end screen. Games pass their logic via a **render-prop child**:

```jsx
<GameShell gameId="..." title={...} instructions={...} timeLimits={{easy,medium,hard}} onGameComplete={fireComplete}>
  {({ difficulty, onComplete, reportScore, reportRound, secondsLeft, playClick, playSuccess, playFail, ... }) => (
    /* game UI; call onComplete({ finalScore, maxScore, completed }) when done */
  )}
</GameShell>
```

A game **must** call the injected `onComplete({ finalScore, maxScore, completed })` to reach the end screen — do not roll your own end state. Use `reportScore`/`reportRound` to update the live HUD, and the injected `play*` sound functions rather than importing audio directly.

**Completion data flow.** `GameShell` calls its `onGameComplete` prop, which games wire to `fireComplete` from `src/hooks/useGameCallback.js`. That hook fans the result out three ways, in order: (1) the JS `onComplete` prop, (2) `window.parent.postMessage({type:'GAME_COMPLETE', payload})` for iframe hosts, (3) a REST `POST` to `callbackUrl` if provided. The payload shape is defined once in `src/utils/buildPayload.js` — this is the data contract with the platform; keep it stable. `App.jsx` additionally persists a percentage best-score to localStorage via `src/utils/scoreStore.js` (keyed per `memberId`).

**Game registration requires three edits in lockstep:**
1. `src/shared/gameData.js` — add the game to a `GAME_GROUPS` category (`id`, `title`, `icon`, `domain`, `description`; `comingSoon: true` to hide from daily challenge). This module is **framework-free** — it is imported by both React and the Vercel serverless function, so never add React/browser code here.
2. `src/App.jsx` — add the import and an entry in `GAME_MAP` (keyed by id).
3. `src/i18n/*.js` — add a `games['<id>']` entry (`title`, `description`) to each language file.

`src/shared/gameData.js` is the single source of truth for the game catalog. `buildDailyGames()` uses a date-seeded PRNG (`dailySeed` + `seededRandom`) so the daily selection is deterministic per day. `gameIconFilename()` maps ids to icon files in `public/games/` (PNG for a hardcoded set, SVG otherwise).

**i18n.** 5 languages (`en`, `ms`, `zh`, `ta`, `id`) in `src/i18n/`. Components call `useTranslation()` which reads `langCode` from `GameContext`. All user-facing strings must be translation keys, not hardcoded — every language file must stay structurally in sync (same keys). `GameContext` also carries `hideDifficulty`.

**The dev API plugin mirrors the serverless function.** `vite-api-plugin.js` (dev) and `api/daily-challenge.js` (Vercel prod) must return identical responses — both import from `src/shared/gameData.js`. If you change the daily-challenge response shape, update both.

## Conventions

- CSS Modules per component/game (`*.module.css`); design tokens in `src/design/tokens.css`, base styles in `src/design/globals.css`.
- PropTypes for runtime prop validation (no TypeScript).
- Game assets: card images in `src/assets/games/<id>.{png,svg}` (bundled, used by the lobby), stable icons in `public/games/` (served for API `icon_url`).
- `vercel.json` rewrites all routes to `index.html` so path-based game URLs (`/math-cross`) work as client-side routes.
- Tests are colocated `*.test.js(x)` using Vitest + Testing Library; `src/test/setup.js` loads jest-dom.
