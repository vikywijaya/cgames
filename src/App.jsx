import { useState } from 'react';
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
import { useMusic }         from './hooks/useMusic';
import { saveScore, getAllScores } from './utils/scoreStore';
import './design/globals.css';
import styles from './App.module.css';

const MUSIC_SRC = import.meta.env.BASE_URL + 'music.mp3';

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
};

// Games grouped by cognitive category
const GAME_GROUPS = [
  {
    category: 'Memory',
    icon: '🧠',
    games: [
      { id: 'memory-match',  title: 'Memory Match',   icon: '🃏', domain: 'Visual Memory',    description: 'Flip cards to find matching pairs.' },
      { id: 'word-recall',   title: 'Word Recall',    icon: '📝', domain: 'Verbal Memory',    description: 'Study a list, then recall as many words as you can.' },
      { id: 'colour-memory', title: 'Colour Memory',  icon: '🎨', domain: 'Sequence Memory',  description: 'Watch a colour sequence light up, then repeat it back.' },
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
      { id: 'snake-lite', title: 'Snake',     icon: '🐍', domain: 'Coordination',   description: 'Guide the snake to eat fruit. Don\'t hit the walls or yourself!' },
      { id: 'tile-flip',  title: 'Tile Flip', icon: '🟨', domain: 'Spatial Memory', description: 'Memorise which tiles light up, then tap them all from memory.' },
    ],
  },
];

const ALL_GAMES = GAME_GROUPS.flatMap(g => g.games);

// Read URL params for iframe / embedded mode
const params        = new URLSearchParams(window.location.search);
const urlGameId     = params.get('gameId');
const urlMemberId   = params.get('memberId')    ?? 'anonymous';
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

  const { muted, toggle: toggleMusic } = useMusic(MUSIC_SRC);

  const musicBtn = (
    <button
      className={styles.musicToggle}
      onClick={toggleMusic}
      aria-label={muted ? 'Unmute background music' : 'Mute background music'}
      title={muted ? 'Turn music on' : 'Turn music off'}
    >
      {muted ? '🔇' : '🎵'}
    </button>
  );

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
        musicMuted={muted}
        onToggleMusic={toggleMusic}
        onComplete={(result) => console.log('[CaritaHub Game Result]', result)}
      />
    );
  }

  /* ── Playing a game from the lobby ── */
  if (selectedGame) {
    const GameComponent = GAME_MAP[selectedGame];
    return (
      <GameComponent
        memberId="demo-user"
        difficulty={selectedDifficulty}
        callbackUrl={undefined}
        musicMuted={muted}
        onToggleMusic={toggleMusic}
        onComplete={(result) => {
          const pct = computePct(result);
          saveScore(selectedGame, pct, result.durationSeconds ?? null);
          console.log('[CaritaHub Game Result]', result);
        }}
        onBack={() => setSelectedGame(null)}
      />
    );
  }

  /* ── Daily challenge: playing a game ── */
  if (view === 'daily-playing' && dailyChallenge && dailyChallenge.index < dailyChallenge.games.length) {
    const game = dailyChallenge.games[dailyChallenge.index];
    const GameComponent = GAME_MAP[game.id];
    const { games, index } = dailyChallenge;

    return (
      <div className={styles.dailyWrapper}>
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
          memberId="demo-user"
          difficulty={selectedDifficulty}
          callbackUrl={undefined}
          musicMuted={muted}
          onToggleMusic={toggleMusic}
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
            <button className={styles.outlineBtn} onClick={abortDailyChallenge}>
              🏠 Back to Home
            </button>
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
          <button className={styles.outlineBtn} onClick={() => { setView('home'); setDailyChallenge(null); }}>
            🏠 Home
          </button>
        </div>
      </div>
    );
  }

  /* ── Scores dashboard ── */
  if (view === 'scores') {
    const allScores   = getAllScores();
    const totalPlayed = ALL_GAMES.filter(g => allScores[g.id]).length;

    return (
      <div className={styles.scoresView}>
        <div className={styles.scoresHeader}>
          <button className={styles.backBtn} onClick={() => setView('home')}>← Back</button>
          <div className={styles.scoresHero}>
            <div className={styles.scoresHeroIcon}>🏆</div>
            <div>
              <h1 className={styles.scoresTitle}>Your Scores</h1>
              <p className={styles.scoresMeta}>{totalPlayed} of {ALL_GAMES.length} games played</p>
            </div>
          </div>
          {musicBtn}
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
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  }

  /* ── Games lobby ── */
  if (view === 'games') {
    return (
      <div className={styles.lobby}>
        <header className={styles.lobbyHeader}>
          <button className={styles.backBtn} onClick={() => setView('home')}>← Back</button>
          <div className={styles.lobbyIcon} aria-hidden="true">🎮</div>
          <h1 className={styles.lobbyTitle}>Cognitive Games</h1>
          <hr className={styles.lobbyDivider} />
          <p className={styles.lobbySubtitle}>Browse all {ALL_GAMES.length} games and choose one to play.</p>
          {musicBtn}
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
                <div key={game.id} className={styles.gameCard} role="listitem">
                  <div className={styles.gameIconBox} aria-hidden="true">{game.icon}</div>
                  <div className={styles.gameMeta}>
                    <h3 className={styles.gameCardTitle}>{game.title}</h3>
                    <p className={styles.gameCardDesc}>{game.description}</p>
                    <div className={styles.gameCardFooter}>
                      <span className={styles.gameDomain}>{game.domain}</span>
                      <button
                        className={styles.playButton}
                        onClick={() => setSelectedGame(game.id)}
                        aria-label={`Play ${game.title}`}
                      >
                        Play
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  /* ── Home screen (default) ── */
  return (
    <div className={styles.homeScreen}>
      <div className={styles.homeHeader}>
        <div className={styles.homeIcon} aria-hidden="true">🧠</div>
        <h1 className={styles.homeTitle}>CaritaHub Cognitive Games</h1>
        <p className={styles.homeSubtitle}>Fun brain exercises to keep your mind sharp and healthy.</p>
        {musicBtn}
      </div>

      <nav className={styles.homeMenu} aria-label="Main menu">

        <button
          className={`${styles.menuBtn} ${styles.menuBtnDaily}`}
          onClick={startDailyChallenge}
          aria-label="Start Daily Challenge"
        >
          <span className={styles.menuBtnIcon}>📅</span>
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
            <span className={styles.menuBtnTitle}>Cognitive Games</span>
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
              View your best scores, completion times, and performance for every game you've played.
            </span>
            <span className={styles.menuBtnFooter}>
              <span className={styles.menuBtnCta}>View →</span>
            </span>
          </span>
        </button>

      </nav>
    </div>
  );
}
