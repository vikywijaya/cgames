import { useState, useEffect, useRef } from 'react';
import { House, CheckCircle, PlayCircle, Check, Sparkle, CaretDown, Heart, GameController, PuzzlePiece, UsersThree, Trophy, Target, Lightning, SquaresFour, Brain, Calculator, Shapes, Globe, Joystick } from '@phosphor-icons/react';
import { DifficultyIcon } from './components/DifficultyIcon/DifficultyIcon';

// Phosphor icons for GAME_GROUPS categories, by index (gameData.js keeps its emoji for the API).
const CATEGORY_ICONS = [Brain, Target, Calculator, Shapes, Globe, Joystick];
const CATEGORY_COLORS = ['#8154f6', '#E07820', '#3D72E8', '#0F9E8E', '#2DAF7B', '#E5484D'];
function CategoryIcon({ index, bare = false }) {
  const Icon = CATEGORY_ICONS[index] || SquaresFour;
  return <Icon size="1em" weight="fill" color={CATEGORY_COLORS[index] || '#3D72E8'} aria-hidden="true" style={bare ? undefined : { verticalAlign: '-0.125em' }} />;
}
import { MemoryMatch }      from './games/MemoryMatch/MemoryMatch';
import { WordRecall }       from './games/WordRecall/WordRecall';
import { DailyArithmetic }  from './games/DailyArithmetic/DailyArithmetic';
import { WordSearch }       from './games/WordSearch/WordSearch';
import { CatchFallingFruit }from './games/CatchFallingFruit/CatchFallingFruit';
import { RightTime }        from './games/RightTime/RightTime';
import { BalloonPop }       from './games/BalloonPop/BalloonPop';
import { FlagQuiz }         from './games/FlagQuiz/FlagQuiz';
import { ColourMemory }     from './games/ColourMemory/ColourMemory';
import { WhackAMole }       from './games/WhackAMole/WhackAMole';
import { OddOneOut }        from './games/OddOneOut/OddOneOut';
import { CapitalQuiz }      from './games/CapitalQuiz/CapitalQuiz';
import { NumberSort }       from './games/NumberSort/NumberSort';
import { FaceMemory }       from './games/FaceMemory/FaceMemory';
import { ShoppingList }     from './games/ShoppingList/ShoppingList';
import { SpeedTap }         from './games/SpeedTap/SpeedTap';
import { StroopColour }     from './games/StroopColour/StroopColour';
import { MissingNumber }    from './games/MissingNumber/MissingNumber';
import { QuickMaths }       from './games/QuickMaths/QuickMaths';
import { SpotDifference }   from './games/SpotDifference/SpotDifference';
import { LetterCount }      from './games/LetterCount/LetterCount';
import { CurrencyQuiz }     from './games/CurrencyQuiz/CurrencyQuiz';
import { LandmarkQuiz }     from './games/LandmarkQuiz/LandmarkQuiz';
import { SnakeLite }        from './games/SnakeLite/SnakeLite';
import { TileFlip }         from './games/TileFlip/TileFlip';
import { Lumeno }           from './games/Lumeno/Lumeno';
import { PipePuzzle }       from './games/PipePuzzle/PipePuzzle';
import { Sumix }            from './games/Sumix/Sumix';
import { BlockPuzzle }      from './games/BlockPuzzle/BlockPuzzle';
import { RingSort }         from './games/RingSort/RingSort';
import { MathCross }       from './games/MathCross/MathCross';
import { Tangram }         from './games/Tangram/Tangram';
import { SlitherEscape }  from './games/SlitherEscape/SlitherEscape';
import { FlappyNumbers }  from './games/FlappyNumbers/FlappyNumbers';
import { Zip }            from './games/Zip/Zip';
import { Sokoban }        from './games/Sokoban/Sokoban';
import { saveScore, getAllScores, getFavorites, toggleFavorite, saveTotalScore, getTotalScore } from './utils/scoreStore';
import { GAME_GROUPS, buildDailyGames } from './shared/gameData';
import { MULTIPLAYER_GAMES } from './shared/multiplayerGames';
import { MultiplayerGames } from './components/MultiplayerGames/MultiplayerGames';
import { MultiplayerChessSession } from './multiplayer/chess/MultiplayerChessSession';
import { MultiplayerXiangqiSession } from './multiplayer/xiangqi/MultiplayerXiangqiSession';
import { MultiplayerGinRummySession } from './multiplayer/gin-rummy/MultiplayerGinRummySession';
import { MultiplayerCrazyEightsSession } from './multiplayer/crazy-eights/MultiplayerCrazyEightsSession';
import { MultiplayerSingaporeTriviaSession } from './multiplayer/singapore-trivia/MultiplayerSingaporeTriviaSession';
import { MultiplayerCongkakSession } from './multiplayer/congkak/MultiplayerCongkakSession';
import { GameContext } from './context/GameContext';
import translations from './i18n/index';
import './design/globals.css';
import styles from './App.module.css';

// Pre-generated square card covers (src/assets/games/<id>.{jpg,png,svg}).
// Prefer the square .jpg cover art; fall back to png/svg, then emoji.
const gameImages = import.meta.glob('./assets/games/*.{jpg,png,svg}', { eager: true, query: '?url', import: 'default' });
function getGameImage(id) {
  return gameImages[`./assets/games/${id}.jpg`]
    ?? gameImages[`./assets/games/${id}.png`]
    ?? gameImages[`./assets/games/${id}.svg`]
    ?? null;
}

const GAME_MAP = {
  'memory-match':      MemoryMatch,
  'word-recall':       WordRecall,
  'daily-arithmetic':  DailyArithmetic,
  'word-search':       WordSearch,
  'catch-falling-fruit': CatchFallingFruit,
  'right-time':        RightTime,
  'balloon-pop':       BalloonPop,
  'flag-quiz':         FlagQuiz,
  'colour-memory':     ColourMemory,
  'whack-a-mole':      WhackAMole,
  'odd-one-out':       OddOneOut,
  'capital-quiz':      CapitalQuiz,
  'number-sort':       NumberSort,
  'face-memory':       FaceMemory,
  'shopping-list':     ShoppingList,
  'speed-tap':         SpeedTap,
  'stroop-colour':     StroopColour,
  'missing-number':    MissingNumber,
  'quick-maths':       QuickMaths,
  'spot-difference':   SpotDifference,
  'letter-count':      LetterCount,
  'currency-quiz':     CurrencyQuiz,
  'landmark-quiz':     LandmarkQuiz,
  'snake-lite':        SnakeLite,
  'tile-flip':         TileFlip,
  'lumeno':            Lumeno,
  'pipe-puzzle':       PipePuzzle,
  'sumix':             Sumix,
  'block-puzzle':      BlockPuzzle,
  'ring-sort':         RingSort,
  'math-cross':        MathCross,
  'tangram':           Tangram,
  'slither-escape':    SlitherEscape,
  'flappy-numbers':    FlappyNumbers,
  'zip':               Zip,
  'sokoban':           Sokoban,
};

// GAME_GROUPS is imported from ./shared/gameData

const ALL_GAMES = GAME_GROUPS.flatMap(g => g.games);

// Read URL params — support both ?gameId=x and path-based /x
const params          = new URLSearchParams(window.location.search);
// Production build is served under /games (see server/server.js) — strip that
// mount prefix before treating the remainder as a path-based game id.
const pathGameId      = window.location.pathname.replace(/^\/(games\/)?/, '');
const urlGameId       = params.get('gameId') || (GAME_MAP[pathGameId] ? pathGameId : null);
const urlMemberId     = params.get('memberId')     ?? 'guest';
const urlDifficulty   = params.get('difficulty')   ?? 'easy';
const urlCallbackUrl  = params.get('callbackUrl')  ?? undefined;
const urlAccessToken  = params.get('access_token') ?? undefined;
const urlTotalScore   = params.get('total_score');
const urlLangCode     = params.get('langCode')     ?? 'en';
const urlMode         = params.get('mode') === 'mobile' ? 'mobile' : 'web';
const showBackButtons = urlMode === 'web';
const urlHideHeader   = params.get('header') === 'hide';

// Persist total_score from URL into localStorage on every load (if provided)
if (urlTotalScore !== null && !isNaN(Number(urlTotalScore))) {
  saveTotalScore(urlMemberId, Number(urlTotalScore));
}

/** POST game result to callbackUrl with Authorization header */
async function sendCallback(gameId, result) {
  if (!urlCallbackUrl) return;
  const payload = {
    memberId:        urlMemberId,
    gameId,
    score:           result.score        ?? 0,
    maxScore:        result.maxScore     ?? 0,
    completed:       result.completed    ?? true,
    durationSeconds: result.durationSeconds ?? 0,
    timestamp:       new Date().toISOString(),
  };
  const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
  if (urlAccessToken) headers['Access-Token'] = urlAccessToken;
  try {
    await fetch(urlCallbackUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
  } catch (e) {
    console.warn('[CaritaHub] Callback failed:', e);
  }
  // Also fire postMessage for iframe hosts
  try {
    window.parent.postMessage({ type: 'GAME_COMPLETE', payload }, '*');
  } catch {}
}

/* ──────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────── */
function computePct(result) {
  const score    = result.score    ?? 0;
  const maxScore = result.maxScore ?? score;
  if (maxScore <= 0) return score > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((score / maxScore) * 100)));
}


// `min` gates on average best score (%), `minPlayed` gates on breadth (games played) so
// a single lucky/high-scoring game can't vault a brand-new player straight to the top rank.
const ACHIEVEMENT_LEVELS_BASE = [
  { min: 0,  minPlayed: 0,  icon: '🌱', nameKey: 'newcomer',    descKey: 'newcomerDesc' },
  { min: 10, minPlayed: 3,  icon: '🔭', nameKey: 'explorer',    descKey: 'explorerDesc' },
  { min: 30, minPlayed: 6,  icon: '⚡', nameKey: 'challenger',  descKey: 'challengerDesc' },
  { min: 50, minPlayed: 10, icon: '🎯', nameKey: 'achiever',    descKey: 'achieverDesc' },
  { min: 70, minPlayed: 15, icon: '🏆', nameKey: 'champion',    descKey: 'championDesc' },
  { min: 90, minPlayed: 20, icon: '🧠', nameKey: 'brainMaster', descKey: 'brainMasterDesc' },
];

function buildAchievementLevels(t) {
  return ACHIEVEMENT_LEVELS_BASE.map(l => ({
    ...l,
    name: t.app[l.nameKey],
    desc: t.app[l.descKey],
  }));
}

function computeAchievement(allScores, memberId, levels) {
  const ACHIEVEMENT_LEVELS = levels;
  const played     = Object.keys(allScores).length;
  const bests      = Object.values(allScores).map(s => s.best);
  const totalPlays = Object.values(allScores).reduce((sum, s) => sum + s.playCount, 0);
  // avgBest = average best % across all played games (drives level)
  const avgBest = bests.length > 0
    ? Math.round(bests.reduce((a, b) => a + b, 0) / bests.length)
    : 0;
  // displayScore = total_score from URL/localStorage if available, else avgBest
  const storedTotal = getTotalScore(memberId);
  const score = storedTotal !== null ? storedTotal : avgBest;

  const levelIdx  = ACHIEVEMENT_LEVELS.reduce((best, l, i) => (avgBest >= l.min && played >= l.minPlayed) ? i : best, 0);
  const level     = ACHIEVEMENT_LEVELS[levelIdx];
  const nextLevel = ACHIEVEMENT_LEVELS[levelIdx + 1] ?? null;
  const progressPct = nextLevel
    ? Math.round(Math.max(0, Math.min(1, Math.min(
        (avgBest - level.min) / (nextLevel.min - level.min),
        nextLevel.minPlayed > level.minPlayed
          ? (played - level.minPlayed) / (nextLevel.minPlayed - level.minPlayed)
          : 1
      ))) * 100)
    : 100;

  return { score, level, nextLevel, progressPct, played, avgBest, totalPlays };
}

function getProgressHint(scores, totalGames, t) {
  const played     = Object.keys(scores).length;
  const totalPlays = Object.values(scores).reduce((sum, s) => sum + s.playCount, 0);
  const bests      = Object.values(scores).map(s => s.best);
  const avgBest    = bests.length > 0
    ? Math.round(bests.reduce((a, b) => a + b, 0) / bests.length)
    : 0;

  if (played === 0)    return `${t.app.motiv0} 🚀`;
  if (totalPlays === 1) return `${t.app.motiv1} 💪`;
  if (played === 1)     return `${t.app.motivTry.replace('{plays}', totalPlays)} 🎯`;
  if (avgBest >= 80)    return `${t.app.motivHigh.replace('{played}', played).replace('{avg}', avgBest)} 🔥`;
  if (played >= Math.ceil(totalGames * 0.5))
    return `${t.app.motivExplore.replace('{played}', played).replace('{total}', totalGames).replace('{avg}', avgBest)} ⭐`;
  return `${t.app.motivDefault.replace('{plays}', totalPlays).replace('{played}', played).replace('{remaining}', totalGames - played)} 🌟`;
}

// dailySeed, seededRandom, buildDailyGames are imported from ./shared/gameData

/* ──────────────────────────────────────────────────────────────
   App
────────────────────────────────────────────────────────────── */
// Progress bars fill their track and are scaled down, so their transition
// runs on transform instead of width (animating width re-lays-out and
// repaints every frame). The floor replaces the old `min-width: 4px`, which
// stops working once the element is always full width: it keeps a sliver
// visible at 0% so an untouched bar still reads as a bar. ~2% is about 4px
// on these tracks.
const BAR_MIN_SCALE = 0.02;
function barScale(pct) {
  return Math.max(BAR_MIN_SCALE, Math.min(1, (Number(pct) || 0) / 100));
}

export function App() {
  const t = translations[urlLangCode] || translations.en;

  const achievementLevels = buildAchievementLevels(t);

  // Helper: translate game title/description using i18n
  const tGame = (game) => {
    const gt = t.games[game.id];
    const domain = t.app.domains?.[game.domain] || game.domain;
    return gt ? { ...game, title: gt.title, description: gt.description, domain } : { ...game, domain };
  };
  const categoryNames = [
    t.app.categories.memory,
    t.app.categories.attention,
    t.app.categories.numbers,
    t.app.categories.visual,
    t.app.categories.knowledge,
    t.app.categories.arcade,
  ];
  const translatedGroups = GAME_GROUPS.map((g, i) => ({
    ...g,
    category: categoryNames[i] || g.category,
    games: g.games.map(tGame),
  }));
  const translatedAllGames = translatedGroups.flatMap(g => g.games);

  // view: 'home' | 'games' | 'scores' | 'multiplayer' | 'mp-chess' | 'mp-xiangqi' | 'daily' | 'daily-playing' | 'daily-inter' | 'daily-result'
  const IN_APP_MULTIPLAYER_VIEWS = ['mp-chess', 'mp-xiangqi', 'mp-gin-rummy', 'mp-crazy-eights', 'mp-singapore-trivia', 'mp-congkak'];
  const [view,               setView]               = useState(() => (IN_APP_MULTIPLAYER_VIEWS.includes(params.get('view')) ? params.get('view') : 'home'));
  const [selectedGame,       setSelectedGame]       = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState('easy');
  const [selectedCategory,   setSelectedCategory]   = useState('All');
  const [categoryMenuOpen,   setCategoryMenuOpen]   = useState(false);
  const categoryMenuRef = useRef(null);

  useEffect(() => {
    if (!categoryMenuOpen) return;
    const handleClickOutside = (e) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target)) {
        setCategoryMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setCategoryMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [categoryMenuOpen]);
  // dailyChallenge: { games: Array, index: number, scores: { gameId: pct }, lastPct: number|null }
  const [dailyChallenge,     setDailyChallenge]     = useState(null);

  const [favorites, setFavorites] = useState(() => getFavorites(urlMemberId));

  // Preserve lobby scroll position when entering/returning from a game
  const lobbyScrollRef = useRef(0);
  useEffect(() => {
    if (view === 'games' && !selectedGame) {
      window.scrollTo(0, lobbyScrollRef.current);
    }
  }, [view, selectedGame]);

  /* ── Daily challenge handlers ── */
  function startDailyChallenge() {
    const games = buildDailyGames().map(tGame);
    setDailyChallenge({ games, index: 0, scores: {}, lastPct: null });
    setView('daily');
  }

  function confirmDailyChallenge() {
    setView('daily-playing');
  }

  function handleDailyComplete(result) {
    const game = dailyChallenge.games[dailyChallenge.index];
    const pct  = computePct(result);
    saveScore(game.id, pct, result.durationSeconds ?? null, urlMemberId, result.difficulty ?? null);
    sendCallback(game.id, result);
    setDailyChallenge(prev => ({
      ...prev,
      scores: { ...prev.scores, [game.id]: pct },
      lastPct: pct,
    }));
    setView('daily-inter'); // show inter-game result before advancing
  }

  function advanceDailyChallenge() {
    const newIndex = dailyChallenge.index + 1;
    setDailyChallenge(prev => ({ ...prev, index: newIndex, lastPct: null }));
    if (newIndex >= dailyChallenge.games.length) {
      setView('daily-result');
    } else {
      setView('daily-playing');
    }
  }

  function abortDailyChallenge() {
    setView('home');
    setDailyChallenge(null);
  }

  function returnToDailyChallenge() {
    setView('daily');
  }

  /* ── Embedded mode ── */
  if (urlGameId && GAME_MAP[urlGameId]) {
    const GameComponent = GAME_MAP[urlGameId];
    return (
      <GameContext.Provider value={{ hideDifficulty: false, hideHeader: urlHideHeader, langCode: urlLangCode }}>
        <GameComponent
          memberId={urlMemberId}
          difficulty={urlDifficulty}
          callbackUrl={urlCallbackUrl}
          onComplete={(result) => {
              const pct = computePct(result);
              saveScore(urlGameId, pct, result.durationSeconds ?? null, urlMemberId, result.difficulty ?? null);
              sendCallback(urlGameId, result);
            }}
        />
      </GameContext.Provider>
    );
  }

  /* ── Playing a game from the lobby ── */
  if (selectedGame) {
    const GameComponent = GAME_MAP[selectedGame];
    return (
      <GameContext.Provider value={{ hideDifficulty: false, hideHeader: urlHideHeader, langCode: urlLangCode }}>
        <div className={styles.gameWrapper}>
          <GameComponent
            memberId={urlMemberId}
            difficulty={selectedDifficulty}
            onComplete={(result) => {
              const pct = computePct(result);
              saveScore(selectedGame, pct, result.durationSeconds ?? null, urlMemberId, result.difficulty ?? null);
              sendCallback(selectedGame, result);
            }}
            onBack={showBackButtons ? () => setSelectedGame(null) : undefined}
          />
        </div>
      </GameContext.Provider>
    );
  }

  /* ── Daily challenge: preview screen ── */
  if (view === 'daily' && dailyChallenge) {
    const { games } = dailyChallenge;
    const previewScores = getAllScores(urlMemberId);
    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => { setView('home'); setDailyChallenge(null); }} aria-label="Home" title="Home"><House size={24} weight="fill" aria-hidden="true" style={{verticalAlign:'middle'}} /></button>
        )}
        <div className={styles.dailyPreview}>
          <h2 className={styles.dailyPreviewTitle}>{t.app.todaysChallenge}</h2>
          <p className={styles.dailyPreviewSub}>{t.app.playTheseGames}</p>
          <div className={styles.dailyPreviewGrid}>
            {games.map((game, i) => (
              <div key={`${game.id}-${i}`} className={styles.gameCard} style={{ cursor: 'default' }}>
                <span className={styles.gameDomain}>{game.domain}</span>
                <div className={styles.gameIconBox} aria-hidden="true">
                  {getGameImage(game.id)
                    ? <img src={getGameImage(game.id)} alt="" className={styles.gameIconImg} />
                    : game.icon}
                </div>
                <div className={styles.gameMeta}>
                  <h3 className={styles.gameCardTitle}>
                    {game.title}
                    {previewScores[game.id] != null && (
                      <CheckCircle className={styles.playedCheck} size={18} weight="fill" color="#1CB37C" aria-label="Played" />
                    )}
                  </h3>
                  <div className={styles.gameCardFooter}>
                    <span className={styles.dailyGameNum}>{t.app.game} {i + 1}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button className={styles.primaryBtn} onClick={confirmDailyChallenge}>
            {t.app.startChallenge}
          </button>
        </div>
      </div>
    );
  }

  /* ── Daily challenge: playing a game ── */
  if (view === 'daily-playing' && dailyChallenge && dailyChallenge.index < dailyChallenge.games.length) {
    const game = dailyChallenge.games[dailyChallenge.index];
    const GameComponent = GAME_MAP[game.id];
    const { games, index } = dailyChallenge;

    return (
      <div className={styles.gameWrapper}>
        <GameContext.Provider value={{ hideDifficulty: true, hideHeader: urlHideHeader, langCode: urlLangCode, isDailyChallenge: true }}>
          <GameComponent
            key={`daily-${game.id}-${index}`}
            memberId={urlMemberId}
            difficulty={selectedDifficulty}
            onComplete={handleDailyComplete}
            onBack={showBackButtons ? returnToDailyChallenge : undefined}
          />
        </GameContext.Provider>
      </div>
    );
  }

  /* ── Daily challenge: inter-game result ── */
  if (view === 'daily-inter' && dailyChallenge) {
    const { games, index, scores, lastPct } = dailyChallenge;
    const game   = games[index];
    const isLast = index + 1 >= games.length;

    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={abortDailyChallenge} aria-label="Home" title="Home"><House size={24} weight="fill" aria-hidden="true" style={{verticalAlign:'middle'}} /></button>
        )}
        <div className={styles.interResult}>
        <div className={styles.interProgress}>
          {games.map((g, i) => (
            <div
              key={`${g.id}-${i}`}
              className={[
                styles.dailyDot,
                i <= index ? styles.dailyDotDone   : '',
              ].join(' ')}
              aria-hidden="true"
            >
              <span className={styles.dailyDotMark}>{i <= index ? '✓' : i + 1}</span>
              <span className={styles.dailyDotLabel}>{g.title}</span>
            </div>
          ))}
        </div>

        <div className={styles.interBody}>
          <div className={styles.interIcon}>{game.icon}</div>
          <h2 className={styles.interGameName}>{game.title}</h2>
          <div
            className={styles.interScore}
            style={{
              color: lastPct >= 75 ? 'var(--color-success)'
                   : lastPct >= 50 ? 'var(--color-warning)'
                   :                 'var(--color-error)',
            }}
          >
            {lastPct ?? 0}
            <small className={styles.interPct}>%</small>
          </div>
          <p className={styles.interSub}>
            {lastPct >= 75 ? t.shell.excellent : lastPct >= 50 ? t.shell.wellDone : t.app.keepGoing}
          </p>

          <div className={styles.interActions}>
            <button className={styles.primaryBtn} onClick={advanceDailyChallenge}>
              {isLast ? t.app.seeResults : t.app.nextGame}
            </button>
          </div>
        </div>
        </div>
      </div>
    );
  }

  /* ── Daily challenge: final result ── */
  if (view === 'daily-result' && dailyChallenge) {
    const { games, scores } = dailyChallenge;
    const completed = games.filter(g => scores[g.id] != null);
    const avg = completed.length
      ? Math.round(completed.reduce((sum, g) => sum + scores[g.id], 0) / completed.length)
      : 0;
    const trophy = avg >= 75 ? '🏆' : avg >= 50 ? '🌟' : '💪';

    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => { setView('home'); setDailyChallenge(null); }} aria-label="Home" title="Home"><House size={24} weight="fill" aria-hidden="true" style={{verticalAlign:'middle'}} /></button>
        )}
        <div className={styles.dailyResult}>
        <div className={styles.resultTrophy}>{trophy}</div>
        <h2 className={styles.resultHeadline}>{t.app.challengeComplete}</h2>
        <div className={styles.resultAvgScore}>{avg}<small className={styles.resultPct}>%</small></div>
        <p className={styles.resultSub}>
          {avg >= 75 ? t.app.excellentWork :
           avg >= 50 ? t.app.greatEffortChallenge :
           t.app.wellDoneChallenge}
        </p>

        <div className={styles.resultList}>
          {games.map((g, i) => {
            const sc = scores[g.id];
            return (
              <div key={`${g.id}-${i}`} className={styles.resultRow}>
                <span className={styles.resultRowIcon}>{g.icon}</span>
                <span className={styles.resultRowName}>{g.title}</span>
                <span
                  className={styles.resultRowScore}
                  style={{
                    color: sc == null ? 'var(--color-text-muted)'
                         : sc >= 75   ? 'var(--color-success)'
                         : sc >= 50   ? 'var(--color-warning)'
                         :              'var(--color-error)',
                  }}
                >
                  {sc != null ? `${sc}%` : '—'}
                </span>
              </div>
            );
          })}
        </div>

        <div className={styles.resultActions}>
          <button className={styles.primaryBtn} onClick={startDailyChallenge}>
            {t.app.playAgainDaily}
          </button>
        </div>
        </div>
      </div>
    );
  }

  /* ── Scores dashboard ── */
  if (view === 'scores') {
    const allScores   = getAllScores(urlMemberId);
    const totalPlayed = translatedAllGames.filter(g => allScores[g.id]).length;
    const achievement = computeAchievement(allScores, urlMemberId, achievementLevels);

    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => setView('home')} aria-label="Home" title="Home"><House size={24} weight="fill" aria-hidden="true" style={{verticalAlign:'middle'}} /></button>
        )}
        <div className={styles.scoresView}>
        <div className={styles.scoresHeader}>
          <p className={styles.scoresMeta}>{totalPlayed} / {translatedAllGames.length} {t.app.gamesPlayed}</p>

          {/* ── Score Card — Option 1B: compact hero + white stat cards ── */}
          <div className={styles.rankCard}>
            <div className={styles.rankHero}>
              <span className={styles.rankHeroBlob} aria-hidden="true" />
              <div className={styles.rankHeroTop}>
                <div className={styles.rankHeroLeft}>
                  <span className={styles.rankAvatar} aria-hidden="true">{achievement.level.icon}</span>
                  <div className={styles.rankHeroText}>
                    <span className={styles.rankEyebrow}>{t.app.currentRank}</span>
                    <span className={styles.rankName}>{achievement.level.name}</span>
                  </div>
                </div>
                <div className={styles.rankPoints}>
                  <span className={styles.rankPointsNum}>{achievement.score}</span>
                  <span className={styles.rankPointsLabel}>{t.app.points}</span>
                </div>
              </div>
              <div className={styles.rankProgress}>
                <div className={styles.rankBarTrack}>
                  <div className={styles.rankBarFill} style={{ transform: `scaleX(${barScale(achievement.progressPct)})` }} />
                </div>
                <div className={styles.rankProgressRow}>
                  <span>
                    {achievement.played > 0
                      ? t.app.pctOfTheWay.replace('{pct}', achievement.progressPct)
                      : t.app.playFirstGame}
                  </span>
                  {achievement.nextLevel && (
                    <span>{t.app.next}: <strong>{achievement.nextLevel.name}</strong> {achievement.nextLevel.icon}</span>
                  )}
                </div>
              </div>
            </div>
            <div className={styles.rankStats}>
              <div className={styles.rankStat}>
                <span className={`${styles.rankStatIcon} ${styles.rankStatIconGames}`} aria-hidden="true"><GameController size="1em" weight="fill" /></span>
                <span className={styles.rankStatVal}>{achievement.played}</span>
                <span className={styles.rankStatLabel}>{t.app.statGamesPlayed}</span>
              </div>
              <div className={styles.rankStat}>
                <span className={`${styles.rankStatIcon} ${styles.rankStatIconAvg}`} aria-hidden="true"><Target size="1em" weight="fill" /></span>
                <span className={styles.rankStatVal}>{achievement.avgBest}%</span>
                <span className={styles.rankStatLabel}>{t.app.statAvgBest}</span>
              </div>
              <div className={styles.rankStat}>
                <span className={`${styles.rankStatIcon} ${styles.rankStatIconSessions}`} aria-hidden="true"><Lightning size="1em" weight="fill" /></span>
                <span className={styles.rankStatVal}>{achievement.totalPlays}</span>
                <span className={styles.rankStatLabel}>{t.app.statSessions}</span>
              </div>
            </div>
          </div>
        </div>

        {translatedGroups.map(group => (
          <section key={group.category} className={styles.scoreSection}>
            <h2 className={styles.scoreSectionTitle}>
              <CategoryIcon index={translatedGroups.indexOf(group)} /> {group.category}
            </h2>
            <div className={styles.scoreTable}>
              {group.games.map(game => {
                const sc = allScores[game.id] || null;
                const tierColor = sc == null ? null
                  : sc.best >= 75 ? 'var(--color-success)'
                  : sc.best >= 50 ? 'var(--color-warning)'
                  :                 'var(--color-error)';
                return (
                  <div key={game.id} className={styles.scoreRow}>
                    <div className={styles.scoreThumbWrap}>
                      {getGameImage(game.id)
                        ? <img src={getGameImage(game.id)} alt="" className={styles.scoreThumb} />
                        : <span className={styles.scoreThumbEmoji} aria-hidden="true">{game.icon}</span>}
                      {sc && (
                        <span className={styles.scoreCheck} style={{ background: tierColor }} aria-label="Played">
                          <Check size={13} weight="bold" color="#fff" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <div className={styles.scoreBody}>
                      <span className={styles.scoreName}>{game.title}</span>
                      <span className={styles.scoreDomain}>{game.domain}</span>
                      {sc ? (
                        <div className={styles.scoreBarRow}>
                          <div className={styles.scoreBarTrack}>
                            <div className={styles.scoreBarFill} style={{ transform: `scaleX(${barScale(sc.best)})`, background: tierColor }} />
                          </div>
                          <span className={styles.scoreBarPct} style={{ color: tierColor }}>{t.app.best} {sc.best}%</span>
                        </div>
                      ) : (
                        <span className={styles.scoreNewPill}>
                          <Sparkle size={13} weight="fill" aria-hidden="true" />
                          {t.app.newTryIt}
                        </span>
                      )}
                    </div>
                    {game.comingSoon ? (
                      <span className={styles.comingSoonBadge}>{t.app.comingSoon}</span>
                    ) : (
                      <button
                        className={styles.scorePlayBtn}
                        onClick={() => { setView('games'); setSelectedGame(game.id); }}
                        aria-label={`Play ${game.title}`}
                      >
                        <PlayCircle size={52} weight="fill" color="#3777FF" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        </div>
      </div>
    );
  }

  if (view === 'multiplayer') {
    const translatedMultiplayerGames = MULTIPLAYER_GAMES.map(game => ({
      ...game,
      title: t.games[game.id]?.title ?? game.id,
      description: t.games[game.id]?.description ?? '',
    }));
    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => setView('home')} aria-label="Home" title="Home"><House size={24} weight="fill" aria-hidden="true" style={{verticalAlign:'middle'}} /></button>
        )}
        <MultiplayerGames
          t={t}
          games={translatedMultiplayerGames}
          memberId={urlMemberId}
          callbackUrl={urlCallbackUrl}
          accessToken={urlAccessToken}
          inAppSlugs={['chess', 'xiangqi', 'gin-rummy', 'crazy-eights', 'singapore-trivia', 'congkak']}
          onPlayInApp={(slug) => setView(`mp-${slug}`)}
        />
      </div>
    );
  }

  if (view === 'mp-chess') {
    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => setView('multiplayer')} aria-label="Home" title="Home"><House size={24} weight="fill" aria-hidden="true" style={{verticalAlign:'middle'}} /></button>
        )}
        <GameContext.Provider value={{ hideDifficulty: false, hideHeader: urlHideHeader, langCode: urlLangCode }}>
          <MultiplayerChessSession memberId={urlMemberId} callbackUrl={urlCallbackUrl} accessToken={urlAccessToken} />
        </GameContext.Provider>
      </div>
    );
  }

  if (view === 'mp-xiangqi') {
    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => setView('multiplayer')} aria-label="Home" title="Home"><House size={24} weight="fill" aria-hidden="true" style={{verticalAlign:'middle'}} /></button>
        )}
        <GameContext.Provider value={{ hideDifficulty: false, hideHeader: urlHideHeader, langCode: urlLangCode }}>
          <MultiplayerXiangqiSession memberId={urlMemberId} callbackUrl={urlCallbackUrl} accessToken={urlAccessToken} />
        </GameContext.Provider>
      </div>
    );
  }

  if (view === 'mp-gin-rummy') {
    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => setView('multiplayer')} aria-label="Home" title="Home"><House size={24} weight="fill" aria-hidden="true" style={{verticalAlign:'middle'}} /></button>
        )}
        <GameContext.Provider value={{ hideDifficulty: false, hideHeader: urlHideHeader, langCode: urlLangCode }}>
          <MultiplayerGinRummySession memberId={urlMemberId} callbackUrl={urlCallbackUrl} accessToken={urlAccessToken} />
        </GameContext.Provider>
      </div>
    );
  }

  if (view === 'mp-crazy-eights') {
    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => setView('multiplayer')} aria-label="Home" title="Home"><House size={24} weight="fill" aria-hidden="true" style={{verticalAlign:'middle'}} /></button>
        )}
        <GameContext.Provider value={{ hideDifficulty: false, hideHeader: urlHideHeader, langCode: urlLangCode }}>
          <MultiplayerCrazyEightsSession memberId={urlMemberId} callbackUrl={urlCallbackUrl} accessToken={urlAccessToken} />
        </GameContext.Provider>
      </div>
    );
  }

  if (view === 'mp-singapore-trivia') {
    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => setView('multiplayer')} aria-label="Home" title="Home"><House size={24} weight="fill" aria-hidden="true" style={{verticalAlign:'middle'}} /></button>
        )}
        <GameContext.Provider value={{ hideDifficulty: false, hideHeader: urlHideHeader, langCode: urlLangCode }}>
          <MultiplayerSingaporeTriviaSession memberId={urlMemberId} callbackUrl={urlCallbackUrl} accessToken={urlAccessToken} />
        </GameContext.Provider>
      </div>
    );
  }

  if (view === 'mp-congkak') {
    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => setView('multiplayer')} aria-label="Home" title="Home"><House size={24} weight="fill" aria-hidden="true" style={{verticalAlign:'middle'}} /></button>
        )}
        <GameContext.Provider value={{ hideDifficulty: false, hideHeader: urlHideHeader, langCode: urlLangCode }}>
          <MultiplayerCongkakSession memberId={urlMemberId} callbackUrl={urlCallbackUrl} accessToken={urlAccessToken} />
        </GameContext.Provider>
      </div>
    );
  }

  /* ── Games lobby ── */
  if (view === 'games') {
    const lobbyScores = getAllScores(urlMemberId);
    return (
      <div className={`${styles.dailyWrapper} ${!showBackButtons ? styles.dailyWrapperNoBack : ''}`}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => setView('home')} aria-label="Home" title="Home"><House size={24} weight="fill" aria-hidden="true" style={{verticalAlign:'middle'}} /></button>
        )}
        <div className={styles.lobby}>
        <div className={styles.categoryRow} ref={categoryMenuRef}>
          {(() => {
            const categories = ['All', 'Favorites', ...translatedGroups.map(g => g.category)];
            const categoryInfo = (cat) => {
              const isFav = cat === 'Favorites';
              const group = translatedGroups.find(g => g.category === cat);
              const count = cat === 'All' ? translatedAllGames.length : isFav ? favorites.size : group?.games.length;
              const icon = isFav ? <Heart size="1em" weight="fill" color="#E5484D" /> : group ? <CategoryIcon index={translatedGroups.indexOf(group)} bare /> : <SquaresFour size="1em" weight="fill" color="#3D72E8" />;
              const displayName = cat === 'All' ? t.app.all : cat === 'Favorites' ? t.app.favorites : cat;
              return { icon, displayName, count };
            };
            const current = categoryInfo(selectedCategory);
            return (
              <div className={styles.categoryDropdown}>
                <button
                  type="button"
                  className={styles.categoryTrigger}
                  onClick={() => setCategoryMenuOpen(o => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={categoryMenuOpen}
                  aria-label="Filter by category"
                >
                  <span className={styles.categoryIconBadge} aria-hidden="true">{current.icon}</span>
                  <span className={styles.categoryTriggerLabel}>{current.displayName}</span>
                  <span className={styles.categoryCountBadge}>{current.count}</span>
                  <CaretDown className={`${styles.categoryCaret} ${categoryMenuOpen ? styles.categoryCaretOpen : ''}`} size={14} weight="fill" aria-hidden="true" />
                </button>
                {categoryMenuOpen && (
                  <ul className={styles.categoryMenu} role="listbox" aria-label="Filter by category">
                    {categories.map(cat => {
                      const info = categoryInfo(cat);
                      return (
                        <li key={cat} role="presentation">
                          <button
                            type="button"
                            role="option"
                            aria-selected={selectedCategory === cat}
                            className={`${styles.categoryOption} ${selectedCategory === cat ? styles.categoryOptionActive : ''}`}
                            onClick={() => { setSelectedCategory(cat); setCategoryMenuOpen(false); }}
                          >
                            <span className={styles.categoryIconBadge} aria-hidden="true">{info.icon}</span>
                            <span className={styles.categoryTriggerLabel}>{info.displayName}</span>
                            <span className={styles.categoryCountBadge}>{info.count}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })()}
        </div>

        <div className={styles.difficultyRow} role="radiogroup" aria-label="Select difficulty">
          {['easy', 'medium', 'hard'].map(level => (
            <label
              key={level}
              className={`${styles.difficultyBtn} ${styles[`difficultyBtn_${level}`]} ${selectedDifficulty === level ? styles.difficultyBtnActive : ''}`}
            >
              <input
                type="radio"
                name="difficulty"
                value={level}
                checked={selectedDifficulty === level}
                onChange={() => setSelectedDifficulty(level)}
              />
              <span className={styles.difficultyIcon} aria-hidden="true">
                <DifficultyIcon level={level} />
              </span>
              {t.shell[level]}
            </label>
          ))}
        </div>

        {selectedCategory === 'Favorites' ? (
          <section className={styles.gameSection} aria-label="Favorites">
            <h2 className={styles.sectionTitle}>
              <Heart size="1em" weight="fill" color="#E5484D" aria-hidden="true" style={{verticalAlign:'-0.125em'}} /> {t.app.favorites}
            </h2>
            {favorites.size === 0 ? (
              <p className={styles.favoritesEmpty}>{t.app.favoritesEmpty}</p>
            ) : (
            <div className={styles.gameGrid} role="list">
              {translatedAllGames.filter(g => favorites.has(g.id)).map(game => (
                <button
                  key={game.id}
                  className={`${styles.gameCard} ${game.comingSoon ? styles.gameCardDisabled : ''}`}
                  onClick={game.comingSoon ? undefined : () => { lobbyScrollRef.current = window.scrollY; setSelectedGame(game.id); }}
                  disabled={game.comingSoon}
                  aria-label={game.comingSoon ? `${game.title} — Coming Soon` : `Play ${game.title}`}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    className={`${styles.favBtn} ${styles.favBtnActive}`}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFavorites(toggleFavorite(game.id, urlMemberId)); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setFavorites(toggleFavorite(game.id, urlMemberId)); } }}
                    aria-label={`Remove ${game.title} from favorites`}
                  >
                    <Heart size={20} weight="fill" aria-hidden="true" />
                  </span>
                  <span className={styles.gameDomain}>{game.domain}</span>
                  <div className={styles.gameIconBox} aria-hidden="true">
                    {getGameImage(game.id)
                      ? <img src={getGameImage(game.id)} alt="" className={styles.gameIconImg} />
                      : game.icon}
                  </div>
                  <div className={styles.gameMeta}>
                    <h3 className={styles.gameCardTitle}>
                      {game.title}
                      {lobbyScores[game.id] != null && (
                        <CheckCircle className={styles.playedCheck} size={18} weight="fill" color="#1CB37C" aria-label="Played" />
                      )}
                    </h3>
                      <div className={styles.gameCardFooter}>
                      {game.beta && <span className={styles.betaBadge}>Beta</span>}
                      {game.comingSoon
                        ? <span className={styles.comingSoonBadge}>{t.app.comingSoon}</span>
                        : <span className={styles.playButton} aria-hidden="true"><PlayCircle size={52} weight="fill" color="#3777FF" aria-hidden="true" /></span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            )}
          </section>
        ) : translatedGroups
          .filter(group => selectedCategory === 'All' || group.category === selectedCategory)
          .map(group => (
          <section key={group.category} className={styles.gameSection} aria-label={group.category}>
            <h2 className={styles.sectionTitle}>
              <CategoryIcon index={translatedGroups.indexOf(group)} /> {group.category}
            </h2>
            <div className={styles.gameGrid} role="list">
              {group.games.map(game => (
                <button
                  key={game.id}
                  className={`${styles.gameCard} ${game.comingSoon ? styles.gameCardDisabled : ''}`}
                  onClick={game.comingSoon ? undefined : () => { lobbyScrollRef.current = window.scrollY; setSelectedGame(game.id); }}
                  disabled={game.comingSoon}
                  aria-label={game.comingSoon ? `${game.title} — Coming Soon` : `Play ${game.title}`}
                >
                  <span
                    role="button"
                    tabIndex={0}
                    className={`${styles.favBtn} ${favorites.has(game.id) ? styles.favBtnActive : ''}`}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFavorites(toggleFavorite(game.id, urlMemberId)); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setFavorites(toggleFavorite(game.id, urlMemberId)); } }}
                    aria-label={favorites.has(game.id) ? `Remove ${game.title} from favorites` : `Add ${game.title} to favorites`}
                  >
                    <Heart size={20} weight={favorites.has(game.id) ? 'fill' : 'bold'} aria-hidden="true" />
                  </span>
                  <span className={styles.gameDomain}>{game.domain}</span>
                  <div className={styles.gameIconBox} aria-hidden="true">
                    {getGameImage(game.id)
                      ? <img src={getGameImage(game.id)} alt="" className={styles.gameIconImg} />
                      : game.icon}
                  </div>
                  <div className={styles.gameMeta}>
                    <h3 className={styles.gameCardTitle}>
                      {game.title}
                      {lobbyScores[game.id] != null && (
                        <CheckCircle className={styles.playedCheck} size={18} weight="fill" color="#1CB37C" aria-label="Played" />
                      )}
                    </h3>
                      <div className={styles.gameCardFooter}>
                      {game.beta && <span className={styles.betaBadge}>Beta</span>}
                      {game.comingSoon
                        ? <span className={styles.comingSoonBadge}>{t.app.comingSoon}</span>
                        : <span className={styles.playButton} aria-hidden="true"><PlayCircle size={52} weight="fill" color="#3777FF" aria-hidden="true" /></span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
        </div>
      </div>
    );
  }

  /* ── Home screen (default) — Option 1A: Focus & Delight ── */
  const achievement = computeAchievement(getAllScores(urlMemberId), urlMemberId, achievementLevels);
  const levelIndex  = achievementLevels.findIndex(l => l.nameKey === achievement.level.nameKey);
  const totalLevels = achievementLevels.length;

  const getDaytimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: t.app.goodMorning, emoji: '🌤️' };
    if (hour < 17) return { text: t.app.goodAfternoon, emoji: '🌤️' };
    if (hour < 21) return { text: t.app.goodEvening, emoji: '🌆' };
    return { text: t.app.goodNight, emoji: '🌙' };
  };
  const greeting = getDaytimeGreeting();

  // Favorite games → shown in the "Your Favorites" row (max 3)
  const favoriteGames = translatedAllGames.filter(g => favorites.has(g.id)).slice(0, 3);

  return (
    <div className={styles.homeWrapper}>
      <div className={styles.homeScreen}>

        {/* ── Greeting + level hero ── */}
        <div className={styles.hero}>
          <span className={styles.heroBlob1} aria-hidden="true" />
          <span className={styles.heroBlob2} aria-hidden="true" />
          <div className={styles.heroInner}>
            <div className={styles.heroGreeting}>{greeting.text} {greeting.emoji}</div>
            <div className={styles.heroRow}>
              <div className={styles.heroIdentity}>
                <div className={styles.heroAvatar} aria-hidden="true">{achievement.level.icon}</div>
                <div className={styles.heroLevelText}>
                  <div className={styles.heroLevelName}>{achievement.level.name}</div>
                  <div className={styles.heroLevelSub}>
                    {t.app.levelOf.replace('{current}', levelIndex + 1).replace('{total}', totalLevels)}
                  </div>
                </div>
              </div>
              <div className={styles.heroScore}>
                <div className={styles.heroScoreNum}>{achievement.score}</div>
                <div className={styles.heroScoreLabel}>{t.app.score.toUpperCase()}</div>
              </div>
            </div>
            <div className={styles.heroBarTrack}>
              <div className={styles.heroBarFill} style={{ transform: `scaleX(${barScale(achievement.progressPct)})` }} />
            </div>
            <div className={styles.heroToNext}>
              {achievement.nextLevel
                ? <>{t.app.progressToNext.replace('{pct}', achievement.progressPct)} <strong>{achievement.nextLevel.name}</strong> {achievement.nextLevel.icon}</>
                : t.app.maxLevel}
            </div>
          </div>
        </div>

        {/* ── Daily Challenge focus card ── */}
        <button className={styles.focusCard} onClick={startDailyChallenge} aria-label="Start Daily Challenge">
          <span className={styles.focusBlob} aria-hidden="true" />
          <span className={styles.focusInner}>
            <span className={styles.focusHead}>
              <span className={styles.focusIconBox} aria-hidden="true"><PuzzlePiece size="1em" weight="fill" color="#fff" /></span>
              <span className={styles.focusHeadText}>
                <span className={styles.focusTitle}>{t.app.dailyChallenge}</span>
                <span className={styles.focusEyebrow}>{t.app.dailyChallengeCardDesc}</span>
              </span>
            </span>
            <span className={styles.focusFooter}>
              <span className={styles.focusPlayBtn}>{t.app.playNow} <span aria-hidden="true">›</span></span>
            </span>
          </span>
        </button>

        {/* ── Two secondary tiles ── */}
        <div className={styles.tileRow}>
          <button className={styles.tile} onClick={() => setView('games')} aria-label="Browse all cognitive games">
            <span className={`${styles.tileIconBox} ${styles.tileIconGames}`} aria-hidden="true">
              <GameController size={40} weight="fill" color="#3777FF" />
            </span>
            <span className={styles.tileText}>
              <span className={styles.tileTitle}>{t.app.browseGames}</span>
              <span className={styles.tileSub}>
                {t.app.browseGamesShort.replace('{count}', translatedAllGames.length).replace('{categories}', translatedGroups.length)}
              </span>
            </span>
          </button>
          <button className={styles.tile} onClick={() => setView('multiplayer')} aria-label="Play with a friend online">
            <span className={`${styles.tileIconBox} ${styles.tileIconMultiplayer}`} aria-hidden="true"><UsersThree size="1em" weight="fill" color="#8154f6" /></span>
            <span className={styles.tileText}>
              <span className={styles.tileTitle}>{t.app.playWithFriend}</span>
              <span className={styles.tileSub}>{t.app.playWithFriendShort}</span>
            </span>
          </button>
        </div>

        {/* ── Your Scores: compact one-row card ── */}
        <button className={`${styles.focusCard} ${styles.scoresCard}`} onClick={() => setView('scores')} aria-label="View your scores">
          <span className={styles.focusBlob} aria-hidden="true" />
          <span className={`${styles.focusInner} ${styles.scoresInner}`}>
            <span className={styles.focusHead}>
              <span className={styles.focusIconBox} aria-hidden="true"><Trophy size="1em" weight="fill" color="#fff" /></span>
              <span className={styles.focusHeadText}>
                <span className={styles.focusTitle}>{t.app.yourScores}</span>
                <span className={styles.focusEyebrow}>{t.app.scoresShort}</span>
              </span>
              <span className={styles.scoresMiniBtn}>{t.app.seeAll} <span aria-hidden="true">›</span></span>
            </span>
          </span>
        </button>


        {/* ── Your favorites ── */}
        <div className={styles.favSection}>
          <div className={styles.favHeader}>
            <span className={styles.favHeaderLabel}>{t.app.yourFavorites}</span>
            {favoriteGames.length > 0 && (
              <button
                className={styles.favSeeAll}
                onClick={() => { setSelectedCategory('Favorites'); setView('games'); }}
              >
                {t.app.seeAll}
              </button>
            )}
          </div>
          {favoriteGames.length > 0 ? (
            <div className={styles.favRow}>
              {favoriteGames.map(game => (
                <button
                  key={game.id}
                  className={styles.favItem}
                  onClick={() => { lobbyScrollRef.current = window.scrollY; setSelectedGame(game.id); }}
                  aria-label={`Play ${game.title}`}
                >
                  {getGameImage(game.id)
                    ? <img src={getGameImage(game.id)} alt="" className={styles.favThumb} />
                    : <span className={styles.favThumbEmoji} aria-hidden="true">{game.icon}</span>}
                  <span className={styles.favName}>{game.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <button
              className={styles.favEmpty}
              onClick={() => setView('games')}
              aria-label={t.app.favoritesEmptyHomeCta}
            >
              <span className={styles.favEmptyIcon} aria-hidden="true">🤍</span>
              <span className={styles.favEmptyText}>
                <span className={styles.favEmptyTitle}>{t.app.favoritesEmptyHomeTitle}</span>
                <span className={styles.favEmptyDesc}>{t.app.favoritesEmptyHomeDesc}</span>
              </span>
              <span className={styles.favEmptyArrow} aria-hidden="true">›</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
