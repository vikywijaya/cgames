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
import { useMusic }         from './hooks/useMusic';
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
};

// Games grouped by cognitive category
const GAME_GROUPS = [
  {
    category: 'Memory',
    icon: '🧠',
    games: [
      { id: 'memory-match',  title: 'Memory Match',   icon: '🃏', domain: 'Visual Memory',  description: 'Flip cards to find matching pairs.' },
      { id: 'word-recall',   title: 'Word Recall',    icon: '📝', domain: 'Verbal Memory',  description: 'Study a list, then recall as many words as you can.' },
      { id: 'colour-memory', title: 'Colour Memory',  icon: '🎨', domain: 'Sequence Memory', description: 'Watch a colour sequence light up, then repeat it back.' },
    ],
  },
  {
    category: 'Attention & Reflexes',
    icon: '⚡',
    games: [
      { id: 'pattern-sequence', title: 'Pattern Sequence', icon: '🎵', domain: 'Attention',     description: 'Watch and repeat a light-pad sequence.' },
      { id: 'balloon-pop',      title: 'Balloon Pop',      icon: '🎈', domain: 'Reaction Speed', description: 'Tap balloons before they float away!' },
      { id: 'whack-a-mole',     title: 'Whack-a-Mole',    icon: '🐹', domain: 'Reaction Speed', description: 'Tap the moles before they disappear!' },
    ],
  },
  {
    category: 'Numbers & Logic',
    icon: '🔢',
    games: [
      { id: 'daily-arithmetic', title: 'Daily Arithmetic', icon: '🔢', domain: 'Numeric Reasoning', description: 'Solve simple maths questions at your own pace.' },
      { id: 'number-sort',      title: 'Number Sort',      icon: '🔢', domain: 'Numeric Ordering',   description: 'Tap numbers from smallest to largest.' },
    ],
  },
  {
    category: 'Visual & Spatial',
    icon: '👁',
    games: [
      { id: 'word-search',        title: 'Word Search',  icon: '🔍', domain: 'Visual Scanning',  description: 'Find hidden words in a letter grid.' },
      { id: 'right-time',         title: 'Right Time',   icon: '🕐', domain: 'Visual Cognition', description: 'Read the analog clock and choose the correct time.' },
      { id: 'catch-falling-fruit',title: 'Catch the Fruit', icon: '🧺', domain: 'Coordination', description: 'Slide to catch falling fruit in your basket.' },
      { id: 'odd-one-out',        title: 'Odd One Out',  icon: '🔎', domain: 'Visual Reasoning', description: 'Spot the one emoji that doesn\'t belong.' },
    ],
  },
  {
    category: 'General Knowledge',
    icon: '🌍',
    games: [
      { id: 'flag-quiz',    title: 'Flag Quiz',         icon: '🏳️', domain: 'Geography', description: 'Identify countries by their flags.' },
      { id: 'capital-quiz', title: 'Capital City Quiz', icon: '🗺️', domain: 'Geography', description: 'Name the capital city of each country.' },
    ],
  },
];

// Flat list for embedded mode lookup
const ALL_GAMES = GAME_GROUPS.flatMap(g => g.games);

// Read URL params for iframe / embedded mode
const params = new URLSearchParams(window.location.search);
const urlGameId      = params.get('gameId');
const urlMemberId    = params.get('memberId')    ?? 'anonymous';
const urlDifficulty  = params.get('difficulty')  ?? 'easy';
const urlCallbackUrl = params.get('callbackUrl') ?? undefined;

export function App() {
  const [selectedGame,       setSelectedGame]       = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState('easy');
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

  // Embedded mode
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

  // Playing a game
  if (selectedGame) {
    const GameComponent = GAME_MAP[selectedGame];
    return (
      <GameComponent
        memberId="demo-user"
        difficulty={selectedDifficulty}
        callbackUrl={undefined}
        musicMuted={muted}
        onToggleMusic={toggleMusic}
        onComplete={(result) => console.log('[CaritaHub Game Result]', result)}
        onBack={() => setSelectedGame(null)}
      />
    );
  }

  // Lobby
  return (
    <div className={styles.lobby}>
      <header className={styles.lobbyHeader}>
        <div className={styles.lobbyIcon} aria-hidden="true">🧠</div>
        <h1 className={styles.lobbyTitle}>CaritaHub Cognitive Games</h1>
        <hr className={styles.lobbyDivider} />
        <p className={styles.lobbySubtitle}>
          Fun exercises to keep your mind sharp. Choose a game to begin.
        </p>
        {musicBtn}
      </header>

      <div className={styles.difficultyRow}>
        <label className={styles.difficultyLabel} htmlFor="difficulty-select">Difficulty:</label>
        <select
          id="difficulty-select"
          className={styles.difficultySelect}
          value={selectedDifficulty}
          onChange={(e) => setSelectedDifficulty(e.target.value)}
          aria-label="Select difficulty"
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      {/* Grouped sections */}
      {GAME_GROUPS.map(group => (
        <section key={group.category} className={styles.gameSection} aria-label={group.category}>
          <h2 className={styles.sectionTitle}>
            <span aria-hidden="true">{group.icon}</span> {group.category}
          </h2>
          <div className={styles.gameGrid} role="list">
            {group.games.map(game => (
              <div key={game.id} className={styles.gameCard} role="listitem">
                <div className={styles.gameIcon} aria-hidden="true">{game.icon}</div>
                <div className={styles.gameMeta}>
                  <span className={styles.gameDomain}>{game.domain}</span>
                  <h3 className={styles.gameCardTitle}>{game.title}</h3>
                  <p className={styles.gameCardDesc}>{game.description}</p>
                </div>
                <button
                  className={styles.playButton}
                  onClick={() => setSelectedGame(game.id)}
                  aria-label={`Play ${game.title}`}
                >
                  Play
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
