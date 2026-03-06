import { useState, useEffect, useRef } from 'react';
import { MemoryMatch }      from './games/MemoryMatch/MemoryMatch';
import { WordRecall }       from './games/WordRecall/WordRecall';
import { PatternSequence }  from './games/PatternSequence/PatternSequence';
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
import { saveScore, getAllScores } from './utils/scoreStore';
import cognitiveGameTitle from './assets/cognitive-game-title.png';
import { TopBar } from './components/TopBar/TopBar.jsx';
import './design/globals.css';
import styles from './App.module.css';

// Pre-generated card images (src/assets/games/<id>.png).
// Falls back to the emoji icon when an image isn't present yet.
const gameImages = import.meta.glob('./assets/games/*.png', { eager: true, query: '?url', import: 'default' });
function getGameImage(id) { return gameImages[`./assets/games/${id}.png`] ?? null; }

const GAME_MAP = {
  'memory-match':      MemoryMatch,
  'word-recall':       WordRecall,
  'pattern-sequence':  PatternSequence,
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
};

// Games grouped by cognitive category
const GAME_GROUPS = [
  {
    category: 'Memory',
    icon: '🧠',
    games: [
      { id: 'memory-match',  title: 'Memory Match',   icon: '🃏', domain: 'Visual Memory',    description: 'Flip cards to find matching pairs.' },
      { id: 'word-recall',   title: 'Word Recall',    icon: '📝', domain: 'Verbal Memory',    description: 'Study a list, then recall as many words as you can.' },
      { id: 'colour-memory', title: 'Color Memory',   icon: '🎨', domain: 'Sequence Memory',  description: 'Watch a colour sequence light up, then repeat it back.' },
      { id: 'face-memory',   title: 'Face Memory',    icon: '🧑', domain: 'Visual Memory',    description: 'Study faces and names, then match them from memory.' },
      { id: 'shopping-list', title: 'Shopping List',  icon: '🛒', domain: 'Working Memory',   description: 'Memorise a shopping list, then pick the items from a larger grid.' },
    ],
  },
  {
    category: 'Attention & Reflexes',
    icon: '⚡',
    games: [
      { id: 'pattern-sequence', title: 'Pattern Sequence', icon: '🎵', domain: 'Attention',          description: 'Watch and repeat a light-pad sequence.' },
      { id: 'balloon-pop',      title: 'Balloon Pop',      icon: '🎈', domain: 'Reaction Speed',      description: 'Tap balloons before they float away!' },
      { id: 'whack-a-mole',     title: 'Whack-a-Mole',    icon: '🐹', domain: 'Reaction Speed',      description: 'Tap the moles before they disappear!' },
      { id: 'speed-tap',        title: 'Speed Tap',        icon: '⭐', domain: 'Selective Attention', description: 'A target emoji appears among distractors — tap it fast!' },
      { id: 'stroop-colour',    title: 'Stroop Colour',    icon: '🎨', domain: 'Inhibitory Control',  description: 'Tap the ink colour of the word, not what it says.' },
    ],
  },
  {
    category: 'Numbers & Logic',
    icon: '🔢',
    games: [
      { id: 'daily-arithmetic', title: 'Daily Arithmetic', icon: '🔢', domain: 'Numeric Reasoning',  description: 'Solve simple maths questions at your own pace.' },
      { id: 'number-sort',      title: 'Number Sort',      icon: '🔢', domain: 'Numeric Ordering',    description: 'Tap numbers from smallest to largest.' },
      { id: 'missing-number',   title: 'Missing Number',   icon: '❓', domain: 'Pattern Recognition', description: 'Find the missing number in an arithmetic sequence.' },
      { id: 'quick-maths',      title: 'Quick Maths',      icon: '➕', domain: 'Mental Arithmetic',   description: 'Solve addition, subtraction and multiplication problems fast.' },
    ],
  },
  {
    category: 'Visual & Spatial',
    icon: '👁',
    games: [
      { id: 'word-search',         title: 'Word Search',         icon: '🔍', domain: 'Visual Scanning',  description: 'Find hidden words in a letter grid.' },
      { id: 'right-time',          title: 'Right Time',          icon: '🕐', domain: 'Visual Cognition', description: 'Read the analog clock and choose the correct time.' },
      { id: 'catch-falling-fruit', title: 'Catch the Fruit',     icon: '🧺', domain: 'Coordination',     description: 'Slide to catch falling fruit in your basket.' },
      { id: 'odd-one-out',         title: 'Odd One Out',         icon: '🔎', domain: 'Visual Reasoning', description: 'Spot the one emoji that doesn\'t belong.' },
      { id: 'spot-difference',     title: 'Spot the Difference', icon: '🔍', domain: 'Visual Scanning',  description: 'Find the tiles that differ between two emoji grids.' },
      { id: 'letter-count',        title: 'Letter Count',        icon: '🔠', domain: 'Visual Attention', description: 'Count how many times a letter appears in a word.' },
    ],
  },
  {
    category: 'General Knowledge',
    icon: '🌍',
    games: [
      { id: 'flag-quiz',     title: 'Flag Quiz',         icon: '🏳️', domain: 'Geography', description: 'Identify countries by their flags.' },
      { id: 'capital-quiz',  title: 'Capital City Quiz', icon: '🗺️', domain: 'Geography', description: 'Name the capital city of each country.' },
      { id: 'currency-quiz', title: 'Currency Quiz',     icon: '💰', domain: 'Geography', description: 'Name the currency used in each country.' },
      { id: 'landmark-quiz', title: 'Landmark Quiz',     icon: '🗼', domain: 'Geography', description: 'Identify which country each famous landmark is in.' },
    ],
  },
  {
    category: 'Arcade',
    icon: '🕹️',
    games: [
      { id: 'snake-lite',  title: 'Snake',        icon: '🐍', domain: 'Coordination',    description: 'Guide the snake to eat fruit. Don\'t hit the walls or yourself!' },
      { id: 'tile-flip',   title: 'Tile Flip',    icon: '🟨', domain: 'Spatial Memory',  description: 'Memorise which tiles light up, then tap them all from memory.' },
      { id: 'lumeno',      title: 'Lumeno',       icon: '🔮', domain: 'Visual Pattern',  description: 'Drag through 3 or more same-colour orbs to clear them. Longer chains score more!' },
      { id: 'pipe-puzzle', title: 'Pipe Puzzle',  icon: '🔧', domain: 'Spatial Reasoning', description: 'Rotate tiles to connect the same-coloured dots with an unbroken pipe.' },
    ],
  },
];

const ALL_GAMES = GAME_GROUPS.flatMap(g => g.games);

// Read URL params for iframe / embedded mode
const params        = new URLSearchParams(window.location.search);
const urlGameId     = params.get('gameId');
const urlMemberId   = params.get('memberId')    ?? 'Abdul Khadir';
const urlDifficulty = params.get('difficulty')  ?? 'easy';
const urlCallbackUrl= params.get('callbackUrl') ?? undefined;

/* ──────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────── */
function computePct(result) {
  const score    = result.score    ?? 0;
  const maxScore = result.maxScore ?? score;
  if (maxScore <= 0) return score > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((score / maxScore) * 100)));
}

function timeAgo(ts) {
  if (!ts) return '—';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const ACHIEVEMENT_LEVELS = [
  { min: 0,  icon: '🌱', name: 'Newcomer',     desc: 'Play your first game to get started!' },
  { min: 1,  icon: '🔭', name: 'Explorer',     desc: 'Discovering new brain challenges.' },
  { min: 21, icon: '⚡', name: 'Challenger',   desc: 'Building consistency and skill.' },
  { min: 41, icon: '🎯', name: 'Achiever',     desc: 'Strong performance across many games.' },
  { min: 61, icon: '🏆', name: 'Champion',     desc: 'Outstanding cognitive performance!' },
  { min: 81, icon: '🧠', name: 'Brain Master', desc: 'Your mind is truly exceptional!' },
];

function computeAchievement(allScores, totalGames) {
  const played   = Object.keys(allScores).length;
  const bests    = Object.values(allScores).map(s => s.best);
  const avgBest  = bests.length > 0
    ? Math.round(bests.reduce((a, b) => a + b, 0) / bests.length)
    : 0;
  const totalPlays = Object.values(allScores).reduce((sum, s) => sum + s.playCount, 0);
  // achievement score: 50% breadth, 50% performance
  const score = Math.round((played / totalGames) * 50 + (avgBest / 100) * 50);

  const levelIdx  = ACHIEVEMENT_LEVELS.reduce((best, l, i) => score >= l.min ? i : best, 0);
  const level     = ACHIEVEMENT_LEVELS[levelIdx];
  const nextLevel = ACHIEVEMENT_LEVELS[levelIdx + 1] ?? null;
  const progressPct = nextLevel
    ? Math.round(((score - level.min) / (nextLevel.min - level.min)) * 100)
    : 100;

  return { score, level, nextLevel, progressPct, played, avgBest, totalPlays };
}

function getProgressHint(scores, totalGames) {
  const played     = Object.keys(scores).length;
  const totalPlays = Object.values(scores).reduce((sum, s) => sum + s.playCount, 0);
  const bests      = Object.values(scores).map(s => s.best);
  const avgBest    = bests.length > 0
    ? Math.round(bests.reduce((a, b) => a + b, 0) / bests.length)
    : 0;

  if (played === 0)    return "Ready to start your brain workout? Pick a game below! 🚀";
  if (totalPlays === 1) return "Great first session! Explore more games to keep your mind active. 💪";
  if (played === 1)     return `You've played ${totalPlays} sessions — try a different game today to mix it up! 🎯`;
  if (avgBest >= 80)    return `Impressive! ${played} games played, average best score ${avgBest}% — you're on fire! 🔥`;
  if (played >= Math.ceil(totalGames * 0.5))
    return `You've explored ${played} of ${totalGames} games with an average best of ${avgBest}%. Keep discovering! ⭐`;
  return `${totalPlays} sessions across ${played} games — ${totalGames - played} more games await you! 🌟`;
}

function buildDailyGames() {
  // Pick one random game from each category
  return GAME_GROUPS.map(group => {
    const idx = Math.floor(Math.random() * group.games.length);
    return { ...group.games[idx], categoryIcon: group.icon, categoryName: group.category };
  });
}

/* ──────────────────────────────────────────────────────────────
   App
────────────────────────────────────────────────────────────── */
export function App() {
  // view: 'home' | 'games' | 'scores' | 'daily-playing' | 'daily-inter' | 'daily-result'
  const [view,               setView]               = useState('home');
  const [selectedGame,       setSelectedGame]       = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState('easy');
  // dailyChallenge: { games: Array, index: number, scores: { gameId: pct }, lastPct: number|null }
  const [dailyChallenge,     setDailyChallenge]     = useState(null);

  // Preserve lobby scroll position when entering/returning from a game
  const lobbyScrollRef = useRef(0);
  useEffect(() => {
    if (view === 'games' && !selectedGame) {
      window.scrollTo(0, lobbyScrollRef.current);
    }
  }, [view, selectedGame]);

  /* ── Daily challenge handlers ── */
  function startDailyChallenge() {
    const games = buildDailyGames();
    setDailyChallenge({ games, index: 0, scores: {}, lastPct: null });
    setView('daily-playing');
  }

  function handleDailyComplete(result) {
    const game = dailyChallenge.games[dailyChallenge.index];
    const pct  = computePct(result);
    saveScore(game.id, pct, result.durationSeconds ?? null);
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

  /* ── Embedded mode ── */
  if (urlGameId && GAME_MAP[urlGameId]) {
    const GameComponent = GAME_MAP[urlGameId];
    return (
      <GameComponent
        memberId={urlMemberId}
        difficulty={urlDifficulty}
        callbackUrl={urlCallbackUrl}
        onComplete={(result) => console.log('[CaritaHub Game Result]', result)}
      />
    );
  }

  /* ── Playing a game from the lobby ── */
  if (selectedGame) {
    const GameComponent = GAME_MAP[selectedGame];
    const gameInfo = ALL_GAMES.find(g => g.id === selectedGame);
    return (
      <div className={styles.dailyWrapper}>
        <TopBar
          title={gameInfo?.title ?? 'Game'}
          onBack={() => setSelectedGame(null)}
          memberId={urlMemberId}
          noBleed
        />
        <GameComponent
          memberId="Abdul Khadir"
          difficulty={selectedDifficulty}
          callbackUrl={undefined}
          onComplete={(result) => {
            const pct = computePct(result);
            saveScore(selectedGame, pct, result.durationSeconds ?? null);
            console.log('[CaritaHub Game Result]', result);
          }}
          onBack={() => setSelectedGame(null)}
        />
      </div>
    );
  }

  /* ── Daily challenge: playing a game ── */
  if (view === 'daily-playing' && dailyChallenge && dailyChallenge.index < dailyChallenge.games.length) {
    const game = dailyChallenge.games[dailyChallenge.index];
    const GameComponent = GAME_MAP[game.id];
    const { games, index } = dailyChallenge;

    return (
      <div className={styles.dailyWrapper}>
        <TopBar
          title="Daily Challenge"
          onBack={abortDailyChallenge}
          memberId={urlMemberId}
          noBleed
        />
        {/* Progress strip */}
        <div className={styles.dailyProgress} role="progressbar"
          aria-label={`Game ${index + 1} of ${games.length}`}>
          {games.map((g, i) => (
            <div
              key={`${g.id}-${i}`}
              className={[
                styles.dailyDot,
                i < index  ? styles.dailyDotDone   : '',
                i === index ? styles.dailyDotActive : '',
              ].join(' ')}
              aria-hidden="true"
            >
              <span className={styles.dailyDotMark}>{i < index ? '✓' : i + 1}</span>
              <span className={styles.dailyDotLabel}>{g.title}</span>
            </div>
          ))}
        </div>

        <GameComponent
          key={`daily-${game.id}-${index}`}
          memberId="Abdul Khadir"
          difficulty={selectedDifficulty}
          callbackUrl={undefined}
          onComplete={handleDailyComplete}
          onBack={abortDailyChallenge}
        />
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
        <TopBar
          title="Daily Challenge"
          onBack={abortDailyChallenge}
          memberId={urlMemberId}
          noBleed
        />
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
            {lastPct >= 75 ? 'Excellent!' : lastPct >= 50 ? 'Well done!' : 'Keep going!'}
          </p>

          <div className={styles.interActions}>
            <button className={styles.primaryBtn} onClick={advanceDailyChallenge}>
              {isLast ? '🏁 See Results' : 'Next Game →'}
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
        <TopBar
          title="Daily Challenge"
          onBack={() => { setView('home'); setDailyChallenge(null); }}
          memberId={urlMemberId}
          noBleed
        />
        <div className={styles.dailyResult}>
        <div className={styles.resultTrophy}>{trophy}</div>
        <h2 className={styles.resultHeadline}>Challenge Complete!</h2>
        <div className={styles.resultAvgScore}>{avg}<small className={styles.resultPct}>%</small></div>
        <p className={styles.resultSub}>
          {avg >= 75 ? 'Excellent work! Your mind is sharp!' :
           avg >= 50 ? 'Great effort! Keep practising!' :
           'Well done for completing the challenge!'}
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
            🔄 New Challenge
          </button>
        </div>
        </div>
      </div>
    );
  }

  /* ── Scores dashboard ── */
  if (view === 'scores') {
    const allScores   = getAllScores();
    const totalPlayed = ALL_GAMES.filter(g => allScores[g.id]).length;
    const achievement = computeAchievement(allScores, ALL_GAMES.length);

    return (
      <div className={styles.dailyWrapper}>
        <TopBar
          title="Your Scores"
          onBack={() => setView('home')}
          memberId={urlMemberId}
          noBleed
        />
        <div className={styles.scoresView}>
        <div className={styles.scoresHeader}>
          <img
            src={cognitiveGameTitle}
            alt="Cognitive Games"
            className={styles.scoresTitleImg}
          />
          <p className={styles.scoresMeta}>{totalPlayed} of {ALL_GAMES.length} games played</p>

          {/* ── Achievement Card ── */}
          <div className={styles.achievementCard}>
            <div className={styles.achievementTop}>
              <span className={styles.achievementIcon}>{achievement.level.icon}</span>
              <div className={styles.achievementInfo}>
                <span className={styles.achievementName}>{achievement.level.name}</span>
                <span className={styles.achievementDesc}>{achievement.level.desc}</span>
              </div>
              <span className={styles.achievementScore}>{achievement.score}<small>/100</small></span>
            </div>
            <div className={styles.achievementStatsRow}>
              <div className={styles.achievementStat}>
                <span className={styles.achievementStatVal}>{achievement.played}</span>
                <span className={styles.achievementStatLabel}>games played</span>
              </div>
              <div className={styles.achievementStat}>
                <span className={styles.achievementStatVal}>{achievement.avgBest}%</span>
                <span className={styles.achievementStatLabel}>avg best score</span>
              </div>
              <div className={styles.achievementStat}>
                <span className={styles.achievementStatVal}>{achievement.totalPlays}</span>
                <span className={styles.achievementStatLabel}>total sessions</span>
              </div>
            </div>
            <div className={styles.achievementProgressWrap}>
              <div
                className={styles.achievementProgressBar}
                style={{ width: `${achievement.progressPct}%` }}
              />
            </div>
            {achievement.nextLevel && (
              <p className={styles.achievementNextLabel}>
                {achievement.progressPct}% to <strong>{achievement.nextLevel.name}</strong> {achievement.nextLevel.icon}
              </p>
            )}
          </div>
        </div>

        {GAME_GROUPS.map(group => (
          <section key={group.category} className={styles.scoreSection}>
            <h2 className={styles.scoreSectionTitle}>
              <span aria-hidden="true">{group.icon}</span> {group.category}
            </h2>
            <div className={styles.scoreTable}>
              {group.games.map(game => {
                const sc = allScores[game.id] || null;
                return (
                  <div key={game.id} className={styles.scoreRow}>
                    <span className={styles.scoreRowIcon} aria-hidden="true">{game.icon}</span>
                    <div className={styles.scoreRowInfo}>
                      <span className={styles.scoreRowName}>{game.title}</span>
                      <span className={styles.scoreRowDomain}>{game.domain}</span>
                    </div>
                    <div className={styles.scoreRowActions}>
                      {sc ? (
                        <div className={styles.scoreRowStats}>
                          <span className={styles.scoreBest}
                            style={{ color: sc.best >= 75 ? 'var(--color-success)' : sc.best >= 50 ? 'var(--color-warning)' : 'var(--color-error)' }}>
                            Best {sc.best}%
                          </span>
                          <span className={styles.scoreLast}>Last {sc.last}%</span>
                          <span className={styles.scorePlays}>{sc.playCount}× · {timeAgo(sc.ts)}</span>
                          {sc.lastTime != null && (
                            <span className={styles.scoreTime}>{sc.lastTime}s</span>
                          )}
                        </div>
                      ) : (
                        <span className={styles.scoreUnplayed}>Not played yet</span>
                      )}
                      <button
                        className={styles.playBtnSm}
                        onClick={() => { setView('games'); setSelectedGame(game.id); }}
                        aria-label={`Play ${game.title}`}
                      >
                        ▶ Play
                      </button>
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
    return (
      <div className={styles.dailyWrapper}>
        <TopBar
          title="Cognitive Games"
          onBack={() => setView('home')}
          memberId={urlMemberId}
          noBleed
        />
        <div className={styles.lobby}>
        <header className={styles.lobbyHeader}>
          <img
            src={cognitiveGameTitle}
            alt="Cognitive Games"
            className={styles.lobbyTitleImg}
          />
          <hr className={styles.lobbyDivider} />
          <p className={styles.lobbySubtitle}>Browse all {ALL_GAMES.length} games and choose one to play.</p>
        </header>

        <div className={styles.difficultyRow}>
          <span className={styles.difficultyLabel}>Difficulty</span>
          <div className={styles.difficultyRadioGroup} role="radiogroup" aria-label="Select difficulty">
            {['easy', 'medium', 'hard'].map(level => (
              <label
                key={level}
                className={`${styles.difficultyRadio} ${selectedDifficulty === level ? styles.difficultyRadioActive : ''}`}
              >
                <input
                  type="radio"
                  name="difficulty"
                  value={level}
                  checked={selectedDifficulty === level}
                  onChange={() => setSelectedDifficulty(level)}
                />
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </label>
            ))}
          </div>
        </div>

        {GAME_GROUPS.map(group => (
          <section key={group.category} className={styles.gameSection} aria-label={group.category}>
            <h2 className={styles.sectionTitle}>
              <span aria-hidden="true">{group.icon}</span> {group.category}
            </h2>
            <div className={styles.gameGrid} role="list">
              {group.games.map(game => (
                <button
                  key={game.id}
                  className={styles.gameCard}
                  onClick={() => { lobbyScrollRef.current = window.scrollY; setSelectedGame(game.id); }}
                  aria-label={`Play ${game.title}`}
                >
                  <div className={styles.gameIconBox} aria-hidden="true">
                    {getGameImage(game.id)
                      ? <img src={getGameImage(game.id)} alt="" className={styles.gameIconImg} />
                      : game.icon}
                  </div>
                  <div className={styles.gameMeta}>
                    <h3 className={styles.gameCardTitle}>{game.title}</h3>
                    <p className={styles.gameCardDesc}>{game.description}</p>
                    <div className={styles.gameCardFooter}>
                      <span className={styles.gameDomain}>{game.domain}</span>
                      <span className={styles.playButton} aria-hidden="true">Play</span>
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

  /* ── Home screen (default) ── */
  const achievement = computeAchievement(getAllScores(), ALL_GAMES.length);

  const getDaytimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: 'Good morning', emoji: '🌤️' };
    if (hour < 17) return { text: 'Good afternoon', emoji: '☀️' };
    if (hour < 21) return { text: 'Good evening', emoji: '🌆' };
    return { text: 'Good night', emoji: '🌙' };
  };
  const greeting = getDaytimeGreeting();

  return (
    <div className={styles.homeWrapper}>
      <TopBar
        title=""
        onBack={null}
        memberId={urlMemberId}
        noBleed
        home
      />
      <div className={styles.homeScreen}>
        <div className={styles.homeHeader}>
          <img
            src={cognitiveGameTitle}
            alt="CaritaHub Cognitive Games"
            className={styles.homeTitle}
          />
          <p className={styles.homeGreeting}>{greeting.text}, {urlMemberId}! {greeting.emoji}</p>

          {/* Player Level Status */}
          <div className={styles.levelCard}>
            <div className={styles.levelCardTop}>
              <div className={styles.levelCardLeft}>
                <span className={styles.levelIcon}>{achievement.level.icon}</span>
                <div className={styles.levelInfo}>
                  <span className={styles.levelName}>{achievement.level.name}</span>
                  <span className={styles.levelSubtitle}>{achievement.level.desc}</span>
                </div>
              </div>
              <div className={styles.levelScore}>
                <span className={styles.levelScoreNum}>{achievement.score}</span>
                <span className={styles.levelScoreLabel}>score</span>
              </div>
            </div>
            <div className={styles.levelBarTrack}>
              <div
                className={styles.levelBarFill}
                style={{ width: `${achievement.progressPct}%` }}
              />
            </div>
            <div className={styles.levelBarFooter}>
              <span className={styles.levelBarNextLabel}>
                {achievement.nextLevel
                  ? `Next: ${achievement.nextLevel.name} ${achievement.nextLevel.icon}`
                  : '🎉 Max level reached!'}
              </span>
              <span className={styles.levelBarPct}>
                {achievement.nextLevel ? `${achievement.progressPct}%` : '100%'}
              </span>
            </div>
          </div>
        </div>

        <nav className={styles.homeMenu} aria-label="Main menu">

          <button
            className={`${styles.menuBtn} ${styles.menuBtnDaily}`}
            onClick={startDailyChallenge}
            aria-label="Start Daily Challenge"
          >
            <span className={styles.menuBtnIcon}>🧩</span>
            <span className={styles.menuBtnBody}>
              <span className={styles.menuBtnTitle}>Daily Challenge</span>
              <span className={styles.menuBtnDesc}>
                Play {GAME_GROUPS.length} random games — one from each category. Track your daily progress!
              </span>
              <span className={styles.menuBtnFooter}>
                <span className={styles.menuBtnCta}>Start →</span>
              </span>
            </span>
          </button>

          <button
            className={`${styles.menuBtn} ${styles.menuBtnGames}`}
            onClick={() => setView('games')}
            aria-label="Browse all cognitive games"
          >
            <span className={styles.menuBtnIcon}>🎮</span>
            <span className={styles.menuBtnBody}>
              <span className={styles.menuBtnTitle}>Browse Games</span>
              <span className={styles.menuBtnDesc}>
                Browse all {ALL_GAMES.length} games across {GAME_GROUPS.length} categories and play any game you like.
              </span>
              <span className={styles.menuBtnFooter}>
                <span className={styles.menuBtnCta}>Browse →</span>
              </span>
            </span>
          </button>

          <button
            className={`${styles.menuBtn} ${styles.menuBtnScores}`}
            onClick={() => setView('scores')}
            aria-label="View your scores"
          >
            <span className={styles.menuBtnIcon}>🏆</span>
            <span className={styles.menuBtnBody}>
              <span className={styles.menuBtnTitle}>Score</span>
              <span className={styles.menuBtnDesc}>
                View your best scores, completion times, and performance.
              </span>
              <span className={styles.menuBtnFooter}>
                <span className={styles.menuBtnCta}>View →</span>
              </span>
            </span>
          </button>

        </nav>
      </div>
    </div>
  );
}
