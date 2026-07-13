# Play with a Friend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Play with a Friend" entry point to the `cgames` home screen that links out to 5 already-live 2-player games (Chess, Xiangqi, Gin Rummy, Crazy Eights, Singapore Trivia) hosted on the separate `caritahub-games` Socket.IO server.

**Architecture:** A new static data module lists the 5 games and builds room-lobby URLs. A new home-screen card and a new `view === 'multiplayer'` screen (mirroring the existing `games`/`scores` view pattern in `App.jsx`) render a grid of game cards. Clicking a card opens `https://caritahub-games.fly.dev/lobby.html?game=<slug>` in a new browser tab via `window.open` — no iframe, no new backend code, no score/callback integration.

**Tech Stack:** React 18 (no router), Vite, CSS Modules, PropTypes, Vitest + Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-play-with-a-friend-design.md` — read it before starting; every task below implements a section of it.
- Only these 5 games are in scope: `chess`, `xiangqi`, `gin-rummy`, `crazy-eights`, `singapore-trivia`. Do not add Higher-or-Lower or Rummikub (not ready on the live server — see spec).
- No changes to `scoreStore.js`, `buildPayload.js`, `useGameCallback.js`, `vite-api-plugin.js`, or `api/daily-challenge.js` — multiplayer games are intentionally outside the completion/callback/daily-challenge contract.
- Every user-facing string must be a translation key added to **all 5** language files: `src/i18n/en.js`, `ms.js`, `zh.js`, `ta.js`, `id.js`.
- No iframe embedding of `caritahub-games` pages — always `window.open(..., '_blank', 'noopener,noreferrer')`.
- Default multiplayer server base URL is `https://caritahub-games.fly.dev`, overridable via `import.meta.env.VITE_MULTIPLAYER_URL`.

---

### Task 1: Multiplayer games data module

**Files:**
- Create: `src/shared/multiplayerGames.js`
- Test: `src/shared/multiplayerGames.test.js`

**Interfaces:**
- Consumes: nothing (pure data module, no React/browser imports — matches `src/shared/gameData.js`'s convention).
- Produces:
  - `export const MULTIPLAYER_GAMES` — array of `{ id: string, slug: string, icon: string }`, exactly 5 entries in this order: `mp-chess`/`chess`, `mp-xiangqi`/`xiangqi`, `mp-gin-rummy`/`gin-rummy`, `mp-crazy-eights`/`crazy-eights`, `mp-singapore-trivia`/`singapore-trivia`.
  - `export function multiplayerGameUrl(slug: string): string` — returns `${baseUrl}/lobby.html?game=${slug}`.

- [ ] **Step 1: Write the failing test**

Create `src/shared/multiplayerGames.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MULTIPLAYER_GAMES, multiplayerGameUrl } from './multiplayerGames';

describe('multiplayerGames', () => {
  it('lists exactly the 5 ready games with expected ids and slugs', () => {
    expect(MULTIPLAYER_GAMES.map(g => ({ id: g.id, slug: g.slug }))).toEqual([
      { id: 'mp-chess', slug: 'chess' },
      { id: 'mp-xiangqi', slug: 'xiangqi' },
      { id: 'mp-gin-rummy', slug: 'gin-rummy' },
      { id: 'mp-crazy-eights', slug: 'crazy-eights' },
      { id: 'mp-singapore-trivia', slug: 'singapore-trivia' },
    ]);
  });

  it('every game has a non-empty icon', () => {
    for (const game of MULTIPLAYER_GAMES) {
      expect(typeof game.icon).toBe('string');
      expect(game.icon.length).toBeGreaterThan(0);
    }
  });

  it('builds the room-lobby URL for a game slug using the default server', () => {
    expect(multiplayerGameUrl('chess')).toBe('https://caritahub-games.fly.dev/lobby.html?game=chess');
    expect(multiplayerGameUrl('singapore-trivia')).toBe('https://caritahub-games.fly.dev/lobby.html?game=singapore-trivia');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/multiplayerGames.test.js`
Expected: FAIL — `Cannot find module './multiplayerGames'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/shared/multiplayerGames.js`:

```js
// Static catalog of ready-to-play 2-player games hosted on the separate
// caritahub-games Socket.IO server (see docs/superpowers/specs/2026-07-13-play-with-a-friend-design.md).
// Keep this module free of React / browser dependencies, matching gameData.js.

export const MULTIPLAYER_BASE_URL =
  import.meta.env.VITE_MULTIPLAYER_URL || 'https://caritahub-games.fly.dev';

export const MULTIPLAYER_GAMES = [
  { id: 'mp-chess',            slug: 'chess',            icon: '♟️' },
  { id: 'mp-xiangqi',          slug: 'xiangqi',          icon: '🀄' },
  { id: 'mp-gin-rummy',        slug: 'gin-rummy',        icon: '🃏' },
  { id: 'mp-crazy-eights',     slug: 'crazy-eights',     icon: '🎴' },
  { id: 'mp-singapore-trivia', slug: 'singapore-trivia', icon: '🇸🇬' },
];

export function multiplayerGameUrl(slug) {
  return `${MULTIPLAYER_BASE_URL}/lobby.html?game=${slug}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/multiplayerGames.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/shared/multiplayerGames.js src/shared/multiplayerGames.test.js
git commit -m "Add multiplayer games data module for Play with a Friend"
```

---

### Task 2: i18n keys for all 5 languages

**Files:**
- Modify: `src/i18n/en.js`, `src/i18n/ms.js`, `src/i18n/zh.js`, `src/i18n/ta.js`, `src/i18n/id.js`
- Test: `src/i18n/multiplayerKeys.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: for every language in `src/i18n/index.js`'s `translations` map —
  - `t.app.playWithFriend`, `t.app.playWithFriendDesc`, `t.app.multiplayerTitle`, `t.app.multiplayerSubtitle`, `t.app.multiplayerExternalBadge`, `t.app.multiplayerPlayers` (all non-empty strings).
  - `t.games['mp-chess'|'mp-xiangqi'|'mp-gin-rummy'|'mp-crazy-eights'|'mp-singapore-trivia']` — each `{ title, description }` with non-empty strings.

These are consumed by Task 3's `MultiplayerGames` component and Task 4's home-screen card.

- [ ] **Step 1: Write the failing test**

Create `src/i18n/multiplayerKeys.test.js`:

```js
import { describe, it, expect } from 'vitest';
import translations from './index';

const APP_KEYS = [
  'playWithFriend', 'playWithFriendDesc',
  'multiplayerTitle', 'multiplayerSubtitle',
  'multiplayerExternalBadge', 'multiplayerPlayers',
];

const GAME_IDS = [
  'mp-chess', 'mp-xiangqi', 'mp-gin-rummy', 'mp-crazy-eights', 'mp-singapore-trivia',
];

describe('multiplayer i18n keys', () => {
  for (const lang of Object.keys(translations)) {
    it(`${lang} has all multiplayer app keys`, () => {
      for (const key of APP_KEYS) {
        expect(translations[lang].app[key]).toBeTruthy();
      }
    });

    it(`${lang} has all multiplayer game entries`, () => {
      for (const id of GAME_IDS) {
        expect(translations[lang].games[id]?.title).toBeTruthy();
        expect(translations[lang].games[id]?.description).toBeTruthy();
      }
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/i18n/multiplayerKeys.test.js`
Expected: FAIL — `translations[lang].app[key]` is `undefined` for all 5 languages.

- [ ] **Step 3: Add the keys to `src/i18n/en.js`**

In the `app: { ... }` block, immediately after the `favoritesEmptyHomeCta:` line, add:

```js
    playWithFriend: 'Play with a Friend',
    playWithFriendDesc: '5 online 2-player games — chess, cards & more.',
    multiplayerTitle: 'Play with a Friend',
    multiplayerSubtitle: 'Tap a game to open it in a new tab, then create or join with a 6-character room code — no account needed.',
    multiplayerExternalBadge: 'Opens in a new tab ↗',
    multiplayerPlayers: '2 Players',
```

In the `games: { ... }` block, immediately before the closing `},` of the object (after the `'sokoban'` entry), add:

```js
    'mp-chess': { title: 'Chess', description: 'Classic chess against a friend — create a room and share the code.' },
    'mp-xiangqi': { title: 'Xiangqi (Chinese Chess)', description: 'Traditional Chinese chess for two, played online.' },
    'mp-gin-rummy': { title: 'Gin Rummy', description: 'Draw, discard, and knock in this classic 2-player card game.' },
    'mp-crazy-eights': { title: 'Crazy Eights', description: 'Match suits or ranks, and play wild eights to win.' },
    'mp-singapore-trivia': { title: 'Singapore Trivia', description: 'Race a friend to answer Singapore-themed quiz questions.' },
```

- [ ] **Step 4: Add the keys to `src/i18n/ms.js`**

In `app: { ... }`, after `favoritesEmptyHomeCta:`:

```js
    playWithFriend: 'Main Bersama Rakan',
    playWithFriendDesc: '5 permainan 2 pemain dalam talian — catur, kad & banyak lagi.',
    multiplayerTitle: 'Main Bersama Rakan',
    multiplayerSubtitle: 'Ketik permainan untuk buka dalam tab baharu, kemudian cipta atau sertai dengan kod bilik 6 aksara — tiada akaun diperlukan.',
    multiplayerExternalBadge: 'Buka dalam tab baharu ↗',
    multiplayerPlayers: '2 Pemain',
```

In `games: { ... }`, before the closing `},`:

```js
    'mp-chess': { title: 'Catur', description: 'Catur klasik bersama rakan — cipta bilik dan kongsi kod.' },
    'mp-xiangqi': { title: 'Catur Cina (Xiangqi)', description: 'Catur tradisional Cina untuk dua orang, dimain dalam talian.' },
    'mp-gin-rummy': { title: 'Gin Rummy', description: 'Ambil, buang dan "knock" dalam permainan kad klasik dua pemain ini.' },
    'mp-crazy-eights': { title: 'Crazy Eights', description: 'Padankan sut atau nilai, dan mainkan lapan liar untuk menang.' },
    'mp-singapore-trivia': { title: 'Kuiz Singapura', description: 'Bersaing dengan rakan untuk menjawab soalan kuiz bertemakan Singapura.' },
```

- [ ] **Step 5: Add the keys to `src/i18n/zh.js`**

In `app: { ... }`, after `favoritesEmptyHomeCta:`:

```js
    playWithFriend: '和朋友一起玩',
    playWithFriendDesc: '5款在线双人游戏——国际象棋、纸牌等。',
    multiplayerTitle: '和朋友一起玩',
    multiplayerSubtitle: '点按游戏可在新标签页中打开，然后用6位房间代码创建或加入——无需帐户。',
    multiplayerExternalBadge: '在新标签页中打开 ↗',
    multiplayerPlayers: '2人游戏',
```

In `games: { ... }`, before the closing `},`:

```js
    'mp-chess': { title: '国际象棋', description: '与朋友对弈经典国际象棋——创建房间并分享代码。' },
    'mp-xiangqi': { title: '象棋', description: '传统中国象棋双人对战，在线进行。' },
    'mp-gin-rummy': { title: '金拉米纸牌', description: '在这款经典双人纸牌游戏中抽牌、弃牌并叫牌。' },
    'mp-crazy-eights': { title: 'Crazy Eights 纸牌', description: '匹配花色或点数，出百搭8获胜。' },
    'mp-singapore-trivia': { title: '新加坡问答', description: '与朋友比赛回答新加坡主题的问答题。' },
```

- [ ] **Step 6: Add the keys to `src/i18n/ta.js`**

In `app: { ... }`, after `favoritesEmptyHomeCta:`:

```js
    playWithFriend: 'நண்பருடன் விளையாடுங்கள்',
    playWithFriendDesc: '5 ஆன்லைன் இரு-வீரர் விளையாட்டுகள் — சதுரங்கம், கார்டுகள் மற்றும் பல.',
    multiplayerTitle: 'நண்பருடன் விளையாடுங்கள்',
    multiplayerSubtitle: 'ஒரு விளையாட்டைத் தட்டி புதிய தாவலில் திறக்கவும், பின்னர் 6-எழுத்து அறை குறியீட்டுடன் உருவாக்கவும் அல்லது சேரவும் — கணக்கு தேவையில்லை.',
    multiplayerExternalBadge: 'புதிய தாவலில் திறக்கிறது ↗',
    multiplayerPlayers: '2 வீரர்கள்',
```

In `games: { ... }`, before the closing `},`:

```js
    'mp-chess': { title: 'சதுரங்கம்', description: 'நண்பருடன் பாரம்பரிய சதுரங்கம் — அறையை உருவாக்கி குறியீட்டைப் பகிரவும்.' },
    'mp-xiangqi': { title: 'சீன சதுரங்கம் (சியாங்கி)', description: 'இருவருக்கான பாரம்பரிய சீன சதுரங்கம், ஆன்லைனில் விளையாடப்படுகிறது.' },
    'mp-gin-rummy': { title: 'ஜின் ரம்மி', description: 'இந்த கிளாசிக் இரு-வீரர் கார்டு விளையாட்டில் இழுத்து, கைவிட்டு, நாக் செய்யுங்கள்.' },
    'mp-crazy-eights': { title: 'கிரேசி எய்ட்ஸ்', description: 'சூட் அல்லது தரத்தைப் பொருத்தி, வெல்ல வைல்டு எட்டுகளை விளையாடுங்கள்.' },
    'mp-singapore-trivia': { title: 'சிங்கப்பூர் வினாடி வினா', description: 'சிங்கப்பூர் தொடர்பான வினாடி வினா கேள்விகளுக்கு நண்பருடன் போட்டியிடுங்கள்.' },
```

- [ ] **Step 7: Add the keys to `src/i18n/id.js`**

In `app: { ... }`, after `favoritesEmptyHomeCta:`:

```js
    playWithFriend: 'Main dengan Teman',
    playWithFriendDesc: '5 permainan 2 pemain online — catur, kartu & lainnya.',
    multiplayerTitle: 'Main dengan Teman',
    multiplayerSubtitle: 'Ketuk permainan untuk membukanya di tab baru, lalu buat atau gabung dengan kode ruangan 6 karakter — tanpa akun.',
    multiplayerExternalBadge: 'Buka di tab baru ↗',
    multiplayerPlayers: '2 Pemain',
```

In `games: { ... }`, before the closing `},`:

```js
    'mp-chess': { title: 'Catur', description: 'Catur klasik bersama teman — buat ruangan dan bagikan kodenya.' },
    'mp-xiangqi': { title: 'Catur Cina (Xiangqi)', description: 'Catur tradisional Tiongkok untuk dua pemain, dimainkan online.' },
    'mp-gin-rummy': { title: 'Gin Rummy', description: 'Ambil kartu, buang, dan "knock" dalam permainan kartu klasik dua pemain ini.' },
    'mp-crazy-eights': { title: 'Crazy Eights', description: 'Cocokkan jenis atau angka kartu, dan mainkan delapan liar untuk menang.' },
    'mp-singapore-trivia': { title: 'Trivia Singapura', description: 'Berlomba dengan teman menjawab soal trivia bertema Singapura.' },
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/i18n/multiplayerKeys.test.js`
Expected: PASS (10 tests — 2 per language × 5 languages)

- [ ] **Step 9: Run the full test suite to check nothing else broke**

Run: `npm test`
Expected: all existing tests still PASS (i18n key additions are additive only).

- [ ] **Step 10: Commit**

```bash
git add src/i18n/en.js src/i18n/ms.js src/i18n/zh.js src/i18n/ta.js src/i18n/id.js src/i18n/multiplayerKeys.test.js
git commit -m "Add i18n keys for Play with a Friend across all 5 languages"
```

---

### Task 3: `MultiplayerGames` screen component

**Files:**
- Create: `src/components/MultiplayerGames/MultiplayerGames.jsx`
- Create: `src/components/MultiplayerGames/MultiplayerGames.module.css`
- Test: `src/components/MultiplayerGames/MultiplayerGames.test.jsx`

**Interfaces:**
- Consumes:
  - `multiplayerGameUrl(slug)` from `src/shared/multiplayerGames.js` (Task 1).
  - Reuses existing classes from `src/App.module.css`: `.lobby`, `.sectionTitle`, `.gameGrid`, `.gameCard`, `.gameDomain`, `.gameIconBox`, `.gameMeta`, `.gameCardTitle`, `.gameCardFooter`.
- Produces: `export function MultiplayerGames({ t, games })` —
  - `t`: the full translation object for the current language (e.g. `translations.en`, same shape App.jsx already computes as its local `t`).
  - `games`: array of `{ id, slug, icon, title, description }` (already translated — the caller in Task 4 is responsible for merging `MULTIPLAYER_GAMES` with `t.games[id]`).
  - Renders a header (title + subtitle) and a grid of cards; clicking a card calls `window.open(multiplayerGameUrl(game.slug), '_blank', 'noopener,noreferrer')`.

- [ ] **Step 1: Write the failing test**

Create `src/components/MultiplayerGames/MultiplayerGames.test.jsx`:

```jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiplayerGames } from './MultiplayerGames';
import translations from '../../i18n/en';

const games = [
  { id: 'mp-chess', slug: 'chess', icon: '♟️', title: 'Chess', description: 'Classic chess against a friend.' },
  { id: 'mp-xiangqi', slug: 'xiangqi', icon: '🀄', title: 'Xiangqi', description: 'Traditional Chinese chess.' },
];

describe('MultiplayerGames', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockImplementation(() => {});
  });

  it('renders the header title and subtitle', () => {
    render(<MultiplayerGames t={translations} games={games} />);
    expect(screen.getByText(translations.app.multiplayerTitle)).toBeInTheDocument();
    expect(screen.getByText(translations.app.multiplayerSubtitle)).toBeInTheDocument();
  });

  it('renders a card for every game with its translated title and description', () => {
    render(<MultiplayerGames t={translations} games={games} />);
    expect(screen.getByRole('button', { name: 'Play Chess' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Xiangqi' })).toBeInTheDocument();
    expect(screen.getByText('Classic chess against a friend.')).toBeInTheDocument();
  });

  it('opens the correct room-lobby URL in a new tab when a card is clicked', () => {
    render(<MultiplayerGames t={translations} games={games} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Chess' }));
    expect(window.open).toHaveBeenCalledWith(
      'https://caritahub-games.fly.dev/lobby.html?game=chess',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('opens a different game\'s URL for a different card', () => {
    render(<MultiplayerGames t={translations} games={games} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play Xiangqi' }));
    expect(window.open).toHaveBeenCalledWith(
      'https://caritahub-games.fly.dev/lobby.html?game=xiangqi',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/MultiplayerGames/MultiplayerGames.test.jsx`
Expected: FAIL — `Cannot find module './MultiplayerGames'` (component doesn't exist yet).

- [ ] **Step 3: Write `MultiplayerGames.module.css`**

Create `src/components/MultiplayerGames/MultiplayerGames.module.css`:

```css
.header {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.subtitle {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
  line-height: 1.5;
}

.cardDescription {
  margin: 0;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.82);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.externalBadge {
  min-height: 28px;
  padding: 0 var(--space-3);
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #ffffff;
  border-radius: var(--radius-full);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
```

- [ ] **Step 4: Write `MultiplayerGames.jsx`**

Create `src/components/MultiplayerGames/MultiplayerGames.jsx`:

```jsx
import PropTypes from 'prop-types';
import appStyles from '../../App.module.css';
import styles from './MultiplayerGames.module.css';
import { multiplayerGameUrl } from '../../shared/multiplayerGames';

export function MultiplayerGames({ t, games }) {
  return (
    <div className={appStyles.lobby}>
      <div className={styles.header}>
        <h2 className={appStyles.sectionTitle}>
          <span aria-hidden="true">👥</span> {t.app.multiplayerTitle}
        </h2>
        <p className={styles.subtitle}>{t.app.multiplayerSubtitle}</p>
      </div>
      <div className={appStyles.gameGrid} role="list">
        {games.map(game => (
          <button
            key={game.id}
            className={appStyles.gameCard}
            onClick={() => window.open(multiplayerGameUrl(game.slug), '_blank', 'noopener,noreferrer')}
            aria-label={`Play ${game.title}`}
          >
            <span className={appStyles.gameDomain}>{t.app.multiplayerPlayers}</span>
            <div className={appStyles.gameIconBox} aria-hidden="true">{game.icon}</div>
            <div className={appStyles.gameMeta}>
              <h3 className={appStyles.gameCardTitle}>{game.title}</h3>
              <p className={styles.cardDescription}>{game.description}</p>
              <div className={appStyles.gameCardFooter}>
                <span className={styles.externalBadge}>{t.app.multiplayerExternalBadge}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

MultiplayerGames.propTypes = {
  t: PropTypes.object.isRequired,
  games: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    slug: PropTypes.string.isRequired,
    icon: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
  })).isRequired,
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/MultiplayerGames/MultiplayerGames.test.jsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/MultiplayerGames/
git commit -m "Add MultiplayerGames screen component"
```

---

### Task 4: Wire into `App.jsx` — home card + `multiplayer` view

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.module.css`

**Interfaces:**
- Consumes:
  - `MULTIPLAYER_GAMES` from `src/shared/multiplayerGames.js` (Task 1).
  - `MultiplayerGames` component from `src/components/MultiplayerGames/MultiplayerGames.jsx` (Task 3), props `{ t, games }`.
  - i18n keys from Task 2 (`t.app.playWithFriend`, `t.app.playWithFriendDesc`, and per-game `t.games['mp-*']`).
- Produces: nothing consumed by later tasks (this is the last task).

No new automated test is added in this task — `App.jsx` has no existing test file (`App.test.jsx` doesn't exist in this codebase) and creating one is out of scope for this feature. Verification is a manual walkthrough in Step 6.

- [ ] **Step 1: Add imports**

In `src/App.jsx`, after the existing line:

```js
import { GAME_GROUPS, buildDailyGames } from './shared/gameData';
```

add:

```js
import { MULTIPLAYER_GAMES } from './shared/multiplayerGames';
import { MultiplayerGames } from './components/MultiplayerGames/MultiplayerGames';
```

- [ ] **Step 2: Update the view-state comment**

Change:

```js
  // view: 'home' | 'games' | 'scores' | 'daily' | 'daily-playing' | 'daily-inter' | 'daily-result'
```

to:

```js
  // view: 'home' | 'games' | 'scores' | 'multiplayer' | 'daily' | 'daily-playing' | 'daily-inter' | 'daily-result'
```

- [ ] **Step 3: Add the home-screen "Play with a Friend" card**

In `src/App.jsx`, find the Daily Challenge focus card block (it ends with the line containing `{t.app.playNow} <span aria-hidden="true">›</span></span>` immediately followed by `</span></button>` and then the `{/* ── Two secondary tiles ── */}` comment). Immediately after that focus card's closing `</button>` and before the `{/* ── Two secondary tiles ── */}` comment, insert:

```jsx
        {/* ── Play with a Friend focus card ── */}
        <button className={`${styles.focusCard} ${styles.multiplayerCard}`} onClick={() => setView('multiplayer')} aria-label="Play with a friend online">
          <span className={styles.focusBlob} aria-hidden="true" />
          <span className={styles.focusInner}>
            <span className={styles.focusHead}>
              <span className={styles.focusIconBox} aria-hidden="true">👥</span>
              <span className={styles.focusHeadText}>
                <span className={styles.focusTitle}>{t.app.playWithFriend}</span>
                <span className={styles.focusEyebrow}>{t.app.playWithFriendDesc}</span>
              </span>
            </span>
            <span className={styles.focusFooter}>
              <span className={`${styles.focusPlayBtn} ${styles.multiplayerPlayBtn}`}>{t.app.playNow} <span aria-hidden="true">›</span></span>
            </span>
          </span>
        </button>
```

- [ ] **Step 4: Add the `multiplayer` view branch**

In `src/App.jsx`, find `if (view === 'games') {` — insert a new block immediately before it:

```jsx
  if (view === 'multiplayer') {
    const translatedMultiplayerGames = MULTIPLAYER_GAMES.map(game => ({
      ...game,
      title: t.games[game.id]?.title ?? game.id,
      description: t.games[game.id]?.description ?? '',
    }));
    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => setView('home')} aria-label="Home" title="Home"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{verticalAlign:'middle'}}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></button>
        )}
        <MultiplayerGames t={t} games={translatedMultiplayerGames} />
      </div>
    );
  }

```

- [ ] **Step 5: Add CSS for the new card**

In `src/App.module.css`, immediately after the existing `.focusPlayBtn { ... }` block (right before the `/* ── Two secondary tiles ── */` comment), add:

```css
.multiplayerCard {
  background: linear-gradient(135deg, #14b8a6 0%, #0d7d76 100%);
  box-shadow: 0 10px 30px rgba(20, 184, 166, 0.34);
}
@media (hover: hover) and (pointer: fine) {
.multiplayerCard:hover { box-shadow: 0 14px 36px rgba(20, 184, 166, 0.42); }
}
.multiplayerPlayBtn { color: #0d7d76; }
```

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open the printed local URL in a browser.

1. On the home screen, confirm a teal "Play with a Friend" card appears below the purple Daily Challenge card.
2. Click it — confirm the app navigates to a "Play with a Friend" screen with a back button, an explainer sentence, and 5 game cards (Chess, Xiangqi, Gin Rummy, Crazy Eights, Singapore Trivia), each showing a "2 Players" badge and an "Opens in a new tab ↗" badge.
3. Click the Chess card — confirm a new browser tab opens to `https://caritahub-games.fly.dev/lobby.html?game=chess` and the caritahub-games lobby page loads (name entry + Create Game button).
4. Click the back button on the "Play with a Friend" screen — confirm it returns to the home screen.

- [ ] **Step 7: Run full verification**

Run: `npm test && npm run lint && npm run build`
Expected: all tests pass, lint is clean, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/App.module.css
git commit -m "Wire Play with a Friend card and screen into the home lobby"
```

---

## Self-Review Notes

- **Spec coverage:** data module (Task 1) ✓, i18n across all 5 languages (Task 2) ✓, `MultiplayerGames` screen + card visuals + new-tab behavior (Task 3) ✓, home card + view wiring (Task 4) ✓, non-goals (no score sync, no iframe, no Higher-or-Lower/Rummikub, no server work) — respected by omission in every task above.
- **Placeholder scan:** no TBD/TODO; every step has complete code or an exact command with expected output.
- **Type/name consistency:** `MULTIPLAYER_GAMES` (Task 1) → imported by name in Task 4; `multiplayerGameUrl(slug)` (Task 1) → imported by name in Task 3; `MultiplayerGames({ t, games })` (Task 3) → called with exactly those two props in Task 4; i18n keys named in Task 2 (`playWithFriend`, `playWithFriendDesc`, `multiplayerTitle`, `multiplayerSubtitle`, `multiplayerExternalBadge`, `multiplayerPlayers`, `games['mp-*']`) are the exact keys read in Tasks 3 and 4 — verified matching throughout.
