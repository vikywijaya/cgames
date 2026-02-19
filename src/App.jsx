import { useState } from 'react';
import { MemoryMatch } from './games/MemoryMatch/MemoryMatch';
import { WordRecall } from './games/WordRecall/WordRecall';
import { PatternSequence } from './games/PatternSequence/PatternSequence';
import { DailyArithmetic } from './games/DailyArithmetic/DailyArithmetic';
import { WordSearch } from './games/WordSearch/WordSearch';
import './design/globals.css';
import styles from './App.module.css';

const GAME_MAP = {
  'memory-match': MemoryMatch,
  'word-recall': WordRecall,
  'pattern-sequence': PatternSequence,
  'daily-arithmetic': DailyArithmetic,
  'word-search': WordSearch,
};

const GAME_INFO = [
  {
    id: 'memory-match',
    title: 'Memory Match',
    description: 'Flip cards to find matching pairs. Exercises visual working memory.',
    icon: '🃏',
    domain: 'Visual Memory',
  },
  {
    id: 'word-recall',
    title: 'Word Recall',
    description: 'Study a word list, then type as many as you remember. Exercises verbal memory.',
    icon: '📝',
    domain: 'Verbal Memory',
  },
  {
    id: 'pattern-sequence',
    title: 'Pattern Sequence',
    description: 'Watch and repeat a sequence of coloured pads. Exercises attention and sequencing.',
    icon: '🎵',
    domain: 'Attention',
  },
  {
    id: 'daily-arithmetic',
    title: 'Daily Arithmetic',
    description: 'Solve simple maths questions at your own pace. Exercises numeric reasoning.',
    icon: '🔢',
    domain: 'Numeric Reasoning',
  },
  {
    id: 'word-search',
    title: 'Word Search',
    description: 'Find hidden words in a letter grid. Exercises visual scanning and vocabulary.',
    icon: '🔍',
    domain: 'Visual Scanning',
  },
];

// Read URL params for iframe / embedded mode
const params = new URLSearchParams(window.location.search);
const urlGameId = params.get('gameId');
const urlMemberId = params.get('memberId') ?? 'anonymous';
const urlDifficulty = params.get('difficulty') ?? 'easy';
const urlCallbackUrl = params.get('callbackUrl') ?? undefined;

/**
 * If a gameId is specified in the URL, render that game directly (embedded/iframe mode).
 * Otherwise render the full game lobby (development / standalone demo).
 */
export function App() {
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState('easy');

  // Embedded mode — render single game from URL params
  if (urlGameId && GAME_MAP[urlGameId]) {
    const GameComponent = GAME_MAP[urlGameId];
    return (
      <GameComponent
        memberId={urlMemberId}
        difficulty={urlDifficulty}
        callbackUrl={urlCallbackUrl}
        onComplete={(result) => {
          console.log('[CaritaHub Game Result]', result);
        }}
      />
    );
  }

  // Lobby mode — show selected game or game selector
  if (selectedGame) {
    const GameComponent = GAME_MAP[selectedGame];
    return (
      <GameComponent
        memberId="demo-user"
        difficulty={selectedDifficulty}
        callbackUrl={undefined}
        onComplete={(result) => {
          console.log('[CaritaHub Game Result]', result);
        }}
        onBack={() => setSelectedGame(null)}
      />
    );
  }

  return (
    <div className={styles.lobby}>
      <header className={styles.lobbyHeader}>
        <div className={styles.lobbyIcon} aria-hidden="true">🧠</div>
        <h1 className={styles.lobbyTitle}>CaritaHub Cognitive Games</h1>
        <hr className={styles.lobbyDivider} />
        <p className={styles.lobbySubtitle}>
          Fun exercises to keep your mind sharp. Choose a game to begin.
        </p>
      </header>

      <div className={styles.difficultyRow}>
        <label className={styles.difficultyLabel} htmlFor="difficulty-select">
          Difficulty:
        </label>
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

      <div className={styles.gameGrid} role="list" aria-label="Available games">
        {GAME_INFO.map((game) => (
          <div key={game.id} className={styles.gameCard} role="listitem">
            <div className={styles.gameIcon} aria-hidden="true">
              {game.icon}
            </div>
            <div className={styles.gameMeta}>
              <span className={styles.gameDomain}>{game.domain}</span>
              <h2 className={styles.gameCardTitle}>{game.title}</h2>
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
    </div>
  );
}
