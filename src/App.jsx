import { useState, useEffect, useRef } from 'react';
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
import { DotEd }          from './games/DotEd/DotEd';
import { Zip }            from './games/Zip/Zip';
import { Sokoban }        from './games/Sokoban/Sokoban';
import { saveScore, getAllScores, getFavorites, toggleFavorite, saveTotalScore, getTotalScore } from './utils/scoreStore';
import { GAME_GROUPS, buildDailyGames } from './shared/gameData';
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
  'dot-ed':            DotEd,
  'zip':               Zip,
  'sokoban':           Sokoban,
};

// GAME_GROUPS is imported from ./shared/gameData

const ALL_GAMES = GAME_GROUPS.flatMap(g => g.games);

// Read URL params — support both ?gameId=x and path-based /x
const params          = new URLSearchParams(window.location.search);
const pathGameId      = window.location.pathname.replace(/^\//, '');
const urlGameId       = params.get('gameId') || (GAME_MAP[pathGameId] ? pathGameId : null);
const urlMemberId     = params.get('memberId')     ?? 'guest';
const urlDifficulty   = params.get('difficulty')   ?? 'easy';
const urlCallbackUrl  = params.get('callbackUrl')  ?? undefined;
const urlAccessToken  = params.get('access_token') ?? undefined;
const urlTotalScore   = params.get('total_score');
const urlLangCode     = params.get('langCode')     ?? 'en';
const urlMode         = params.get('mode') === 'mobile' ? 'mobile' : 'web';
const showBackButtons = urlMode === 'web';

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


const ACHIEVEMENT_LEVELS_BASE = [
  { min: 0,  icon: '🌱', nameKey: 'newcomer',    descKey: 'newcomerDesc' },
  { min: 10, icon: '🔭', nameKey: 'explorer',    descKey: 'explorerDesc' },
  { min: 30, icon: '⚡', nameKey: 'challenger',  descKey: 'challengerDesc' },
  { min: 50, icon: '🎯', nameKey: 'achiever',    descKey: 'achieverDesc' },
  { min: 70, icon: '🏆', nameKey: 'champion',    descKey: 'championDesc' },
  { min: 90, icon: '🧠', nameKey: 'brainMaster', descKey: 'brainMasterDesc' },
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

  const levelIdx  = ACHIEVEMENT_LEVELS.reduce((best, l, i) => avgBest >= l.min ? i : best, 0);
  const level     = ACHIEVEMENT_LEVELS[levelIdx];
  const nextLevel = ACHIEVEMENT_LEVELS[levelIdx + 1] ?? null;
  const progressPct = nextLevel
    ? Math.round(((avgBest - level.min) / (nextLevel.min - level.min)) * 100)
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

  // view: 'home' | 'games' | 'scores' | 'daily' | 'daily-playing' | 'daily-inter' | 'daily-result'
  const [view,               setView]               = useState('home');
  const [selectedGame,       setSelectedGame]       = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState('easy');
  const [selectedCategory,   setSelectedCategory]   = useState('All');
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
      <GameContext.Provider value={{ hideDifficulty: false, langCode: urlLangCode }}>
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
      <GameContext.Provider value={{ hideDifficulty: false, langCode: urlLangCode }}>
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
      <div className={styles.dailyWrapper}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => { setView('home'); setDailyChallenge(null); }} aria-label="Home" title="Home"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{verticalAlign:'middle'}}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></button>
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
                      <svg className={styles.playedCheck} width="18" height="18" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Played"><g clipPath="url(#pc3)"><path d="M15 0C6.76113 0 0 6.76113 0 15C0 23.2389 6.76113 30 15 30C23.2389 30 30 23.2389 30 15C30 6.76113 23.2389 0 15 0ZM13.1847 21.8227L6.61605 15.2541L9.10172 12.7684L13.2997 16.9664L21.7274 9.30516L24.0929 11.9058L13.1847 21.8227Z" fill="#1CB37C"/></g><defs><clipPath id="pc3"><rect width="30" height="30" fill="white"/></clipPath></defs></svg>
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
        <GameContext.Provider value={{ hideDifficulty: true, langCode: urlLangCode }}>
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
      <div className={styles.dailyWrapper}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={abortDailyChallenge} aria-label="Home" title="Home"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{verticalAlign:'middle'}}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></button>
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
      <div className={styles.dailyWrapper}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => { setView('home'); setDailyChallenge(null); }} aria-label="Home" title="Home"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{verticalAlign:'middle'}}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></button>
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
      <div className={styles.dailyWrapper}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => setView('home')} aria-label="Home" title="Home"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{verticalAlign:'middle'}}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></button>
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
                  <div className={styles.rankBarFill} style={{ width: `${achievement.progressPct}%` }} />
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
                <span className={`${styles.rankStatIcon} ${styles.rankStatIconGames}`} aria-hidden="true">🎮</span>
                <span className={styles.rankStatVal}>{achievement.played}</span>
                <span className={styles.rankStatLabel}>{t.app.statGamesPlayed}</span>
              </div>
              <div className={styles.rankStat}>
                <span className={`${styles.rankStatIcon} ${styles.rankStatIconAvg}`} aria-hidden="true">🎯</span>
                <span className={styles.rankStatVal}>{achievement.avgBest}%</span>
                <span className={styles.rankStatLabel}>{t.app.statAvgBest}</span>
              </div>
              <div className={styles.rankStat}>
                <span className={`${styles.rankStatIcon} ${styles.rankStatIconSessions}`} aria-hidden="true">⚡</span>
                <span className={styles.rankStatVal}>{achievement.totalPlays}</span>
                <span className={styles.rankStatLabel}>{t.app.statSessions}</span>
              </div>
            </div>
          </div>
        </div>

        {translatedGroups.map(group => (
          <section key={group.category} className={styles.scoreSection}>
            <h2 className={styles.scoreSectionTitle}>
              <span aria-hidden="true">{group.icon}</span> {group.category}
            </h2>
            <div className={styles.scoreTable}>
              {group.games.map(game => {
                const sc = allScores[game.id] || null;
                return (
                  <div key={game.id} className={styles.scoreRow}>
                    <div className={styles.scoreRowIcon} aria-hidden="true">
                      {getGameImage(game.id)
                        ? <img src={getGameImage(game.id)} alt="" className={styles.scoreRowIconImg} />
                        : game.icon}
                    </div>
                    <div className={styles.scoreRowInfo}>
                      <span className={styles.scoreRowName}>{game.title}</span>
                      <span className={styles.scoreRowDomain}>{game.domain}</span>
                      {sc ? (
                        <div className={styles.scoreRowStats}>
                          <span className={styles.scoreBest}
                            style={{ color: sc.best >= 75 ? 'var(--color-success)' : sc.best >= 50 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                            {t.app.bestScore}: {sc.best}
                          </span>
                          {(sc.bestTime != null || sc.lastTime != null) && (
                            <span className={styles.scoreTime}>{t.app.bestTime}: {sc.bestTime ?? sc.lastTime}s</span>
                          )}
                          {(sc.bestDifficulty || sc.lastDifficulty) && (
                            <span className={styles.scoreDifficulty}>
                              {t.shell[sc.bestDifficulty || sc.lastDifficulty] || (sc.bestDifficulty || sc.lastDifficulty)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className={styles.scoreUnplayed}>{t.app.noPlays}</span>
                      )}
                    </div>
                    <div className={styles.scoreRowActions}>
                      {game.comingSoon ? (
                        <span className={styles.comingSoonBadge}>{t.app.comingSoon}</span>
                      ) : (
                        <button
                          className={styles.playBtnSm}
                          onClick={() => { setView('games'); setSelectedGame(game.id); }}
                          aria-label={`Play ${game.title}`}
                        >
                          <svg width="36" height="36" viewBox="0 0 57 57" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <g clipPath="url(#clip0_score_play)">
                              <path d="M57 28.5C57 44.2403 44.2403 57 28.5 57C12.7597 57 0 44.2403 0 28.5C0 12.7597 12.7597 0 28.5 0C44.2403 0 57 12.7597 57 28.5Z" fill="#3777FF"/>
                              <path d="M40.1751 27.0179L24.1439 16.3304C23.5972 15.9665 22.8949 15.9325 22.3156 16.2422C21.7368 16.5522 21.375 17.1558 21.375 17.8125V39.1875C21.375 39.8442 21.7368 40.4478 22.3156 40.7578C22.8949 41.0675 23.5972 41.0335 24.1439 40.6696L40.1751 29.9821C40.6709 29.6515 40.9683 29.0953 40.9683 28.5C40.9683 27.9047 40.6709 27.3484 40.1751 27.0179Z" fill="white"/>
                            </g>
                            <defs>
                              <clipPath id="clip0_score_play">
                                <rect width="57" height="57" fill="white"/>
                              </clipPath>
                            </defs>
                          </svg>
                        </button>
                      )}
                    </div>
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

  /* ── Games lobby ── */
  if (view === 'games') {
    const lobbyScores = getAllScores(urlMemberId);
    return (
      <div className={styles.dailyWrapper}>
        {showBackButtons && (
          <button className={styles.floatingBack} onClick={() => setView('home')} aria-label="Home" title="Home"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{verticalAlign:'middle'}}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></button>
        )}
        <div className={styles.lobby}>
        <div className={styles.categoryRow}>
          <select
            className={styles.categorySelect}
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="Filter by category"
          >
            {['All', 'Favorites', ...translatedGroups.map(g => g.category)].map(cat => {
              const isFav = cat === 'Favorites';
              const group = translatedGroups.find(g => g.category === cat);
              const count = cat === 'All' ? translatedAllGames.length : isFav ? favorites.size : group?.games.length;
              const icon = isFav ? '❤️' : group ? group.icon : '📋';
              const displayName = cat === 'All' ? t.app.all : cat === 'Favorites' ? t.app.favorites : cat;
              return (
                <option key={cat} value={cat}>
                  {icon} {displayName} ({count})
                </option>
              );
            })}
          </select>
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
              <span className={styles.difficultyDot} aria-hidden="true">
                {level === 'easy' ? '🟢' : level === 'medium' ? '🟡' : '🔴'}
              </span>
              {t.shell[level]}
            </label>
          ))}
        </div>

        {selectedCategory === 'Favorites' ? (
          <section className={styles.gameSection} aria-label="Favorites">
            <h2 className={styles.sectionTitle}>
              <span aria-hidden="true">❤️</span> {t.app.favorites}
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
                    <svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor"/></svg>
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
                        <svg className={styles.playedCheck} width="18" height="18" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Played"><g clipPath="url(#pc1)"><path d="M15 0C6.76113 0 0 6.76113 0 15C0 23.2389 6.76113 30 15 30C23.2389 30 30 23.2389 30 15C30 6.76113 23.2389 0 15 0ZM13.1847 21.8227L6.61605 15.2541L9.10172 12.7684L13.2997 16.9664L21.7274 9.30516L24.0929 11.9058L13.1847 21.8227Z" fill="#1CB37C"/></g><defs><clipPath id="pc1"><rect width="30" height="30" fill="white"/></clipPath></defs></svg>
                      )}
                    </h3>
                      <div className={styles.gameCardFooter}>
                      {game.beta && <span className={styles.betaBadge}>Beta</span>}
                      {game.comingSoon
                        ? <span className={styles.comingSoonBadge}>{t.app.comingSoon}</span>
                        : <span className={styles.playButton} aria-hidden="true"><svg width="52" height="52" viewBox="0 0 57 57" fill="none" xmlns="http://www.w3.org/2000/svg"><g clipPath="url(#pb)"><path d="M57 28.5C57 44.2403 44.2403 57 28.5 57C12.7597 57 0 44.2403 0 28.5C0 12.7597 12.7597 0 28.5 0C44.2403 0 57 12.7597 57 28.5Z" fill="#3777FF"/><path d="M40.1751 27.0179L24.1439 16.3304C23.5972 15.9665 22.8949 15.9325 22.3156 16.2422C21.7368 16.5522 21.375 17.1558 21.375 17.8125V39.1875C21.375 39.8442 21.7368 40.4478 22.3156 40.7578C22.8949 41.0675 23.5972 41.0335 24.1439 40.6696L40.1751 29.9821C40.6709 29.6515 40.9683 29.0953 40.9683 28.5C40.9683 27.9047 40.6709 27.3484 40.1751 27.0179Z" fill="white"/></g><defs><clipPath id="pb"><rect width="57" height="57" fill="white"/></clipPath></defs></svg></span>}
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
              <span aria-hidden="true">{group.icon}</span> {group.category}
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
                    <svg viewBox="0 0 24 24" width="20" height="20">
                      {favorites.has(game.id)
                        ? <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="currentColor"/>
                        : <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" fill="currentColor"/>}
                    </svg>
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
                        <svg className={styles.playedCheck} width="18" height="18" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Played"><g clipPath="url(#pc2)"><path d="M15 0C6.76113 0 0 6.76113 0 15C0 23.2389 6.76113 30 15 30C23.2389 30 30 23.2389 30 15C30 6.76113 23.2389 0 15 0ZM13.1847 21.8227L6.61605 15.2541L9.10172 12.7684L13.2997 16.9664L21.7274 9.30516L24.0929 11.9058L13.1847 21.8227Z" fill="#1CB37C"/></g><defs><clipPath id="pc2"><rect width="30" height="30" fill="white"/></clipPath></defs></svg>
                      )}
                    </h3>
                      <div className={styles.gameCardFooter}>
                      {game.beta && <span className={styles.betaBadge}>Beta</span>}
                      {game.comingSoon
                        ? <span className={styles.comingSoonBadge}>{t.app.comingSoon}</span>
                        : <span className={styles.playButton} aria-hidden="true"><svg width="52" height="52" viewBox="0 0 57 57" fill="none" xmlns="http://www.w3.org/2000/svg"><g clipPath="url(#pb)"><path d="M57 28.5C57 44.2403 44.2403 57 28.5 57C12.7597 57 0 44.2403 0 28.5C0 12.7597 12.7597 0 28.5 0C44.2403 0 57 12.7597 57 28.5Z" fill="#3777FF"/><path d="M40.1751 27.0179L24.1439 16.3304C23.5972 15.9665 22.8949 15.9325 22.3156 16.2422C21.7368 16.5522 21.375 17.1558 21.375 17.8125V39.1875C21.375 39.8442 21.7368 40.4478 22.3156 40.7578C22.8949 41.0675 23.5972 41.0335 24.1439 40.6696L40.1751 29.9821C40.6709 29.6515 40.9683 29.0953 40.9683 28.5C40.9683 27.9047 40.6709 27.3484 40.1751 27.0179Z" fill="white"/></g><defs><clipPath id="pb"><rect width="57" height="57" fill="white"/></clipPath></defs></svg></span>}
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
              <div className={styles.heroBarFill} style={{ width: `${achievement.progressPct}%` }} />
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
              <span className={styles.focusIconBox} aria-hidden="true">🧩</span>
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
            <span className={`${styles.tileIconBox} ${styles.tileIconGames}`} aria-hidden="true">🎮</span>
            <span className={styles.tileText}>
              <span className={styles.tileTitle}>{t.app.browseGames}</span>
              <span className={styles.tileSub}>
                {t.app.browseGamesShort.replace('{count}', translatedAllGames.length).replace('{categories}', translatedGroups.length)}
              </span>
            </span>
          </button>
          <button className={styles.tile} onClick={() => setView('scores')} aria-label="View your scores">
            <span className={`${styles.tileIconBox} ${styles.tileIconScores}`} aria-hidden="true">🏆</span>
            <span className={styles.tileText}>
              <span className={styles.tileTitle}>{t.app.yourScores}</span>
              <span className={styles.tileSub}>{t.app.scoresShort}</span>
            </span>
          </button>
        </div>

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
