import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { Button } from '../../components/Button/Button';
import { useGameCallback } from '../../hooks/useGameCallback';
import { GAME_IDS } from '../../utils/gameIds';
import { useWordSearch } from './useWordSearch';
import styles from './WordSearch.module.css';

const INSTRUCTIONS = (
  <>
    <p>
      Find all the hidden words in the letter grid. Click a <strong>starting letter</strong> then
      click the <strong>ending letter</strong> of the word. Words can go across, down, or diagonally.
    </p>
    <p style={{ marginTop: '8px' }}>
      Click <em>Clear Selection</em> to cancel if you misclick.
    </p>
  </>
);

function WordSearchGame({ difficulty, onComplete, reportScore }) {
  const {
    grid,
    words,
    foundWords,
    foundCellSet,
    selectionCellSet,
    selectionStart,
    lastResult,
    clickCell,
    clearSelection,
    score,
    maxScore,
    done,
  } = useWordSearch(difficulty);

  const cols = grid[0]?.length ?? 8;

  useEffect(() => { reportScore?.(score); }, [score, reportScore]);

  useEffect(() => {
    if (done) {
      onComplete({ finalScore: maxScore, maxScore, completed: true });
    }
  }, [done, maxScore, onComplete]);

  const statusText =
    lastResult === 'found'
      ? '✓ Found!'
      : lastResult === 'miss'
      ? '✗ Not a word — try again'
      : selectionStart
      ? 'Now click the last letter'
      : 'Click the first letter of a word';

  const statusClass =
    lastResult === 'found'
      ? styles.statusFound
      : lastResult === 'miss'
      ? styles.statusMiss
      : '';

  return (
    <div className={styles.container}>
      {/* Word chips — horizontal row above grid */}
      <ul className={styles.wordChips} role="list" aria-live="polite" aria-label="Words to find">
        {words.map((word) => (
          <li
            key={word}
            className={`${styles.wordChip} ${foundWords.has(word) ? styles.wordFound : styles.wordPending}`}
            aria-label={`${word}${foundWords.has(word) ? ', found' : ''}`}
          >
            {word}
          </li>
        ))}
      </ul>

      {/* Grid */}
      <div
        className={styles.grid}
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
        role="grid"
        aria-label="Word search grid"
      >
        {grid.map((row, r) =>
          row.map((letter, c) => {
            const key = `${r},${c}`;
            const isFound = foundCellSet.has(key);
            const isSelected = selectionCellSet.has(key);
            const isStart = selectionStart && selectionStart.row === r && selectionStart.col === c;

            const cellClass = [
              styles.cell,
              isFound ? styles.found : '',
              isSelected && !isFound ? styles.selected : '',
              isStart ? styles.start : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={key}
                className={cellClass}
                onClick={() => clickCell(r, c)}
                aria-label={`Row ${r + 1} Col ${c + 1}: ${letter}${isFound ? ', found' : ''}`}
                aria-pressed={isSelected || isFound}
              >
                {letter}
              </button>
            );
          })
        )}
      </div>

      {/* Status + controls */}
      <div className={styles.status}>
        <p
          className={`${styles.statusText} ${statusClass}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {statusText}
        </p>
        {selectionStart && (
          <Button variant="ghost" size="small" onClick={clearSelection}>
            Clear
          </Button>
        )}
      </div>

      <p className={styles.scoreCount}>
        <strong>{score}</strong> / {maxScore} found
      </p>

      <Button
        variant="secondary"
        onClick={() => onComplete({ finalScore: score, maxScore, completed: score === maxScore })}
      >
        Finish
      </Button>
    </div>
  );
}

WordSearchGame.propTypes = {
  difficulty: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  reportScore: PropTypes.func,
};

export function WordSearch({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const { fireComplete } = useGameCallback({
    memberId,
    gameId: GAME_IDS.WORD_SEARCH,
    callbackUrl,
    onComplete,
  });

  return (
    <GameShell
      gameId={GAME_IDS.WORD_SEARCH}
      title="Word Search"
      instructions={INSTRUCTIONS}
      difficulty={difficulty}
      timeLimitSeconds={null}
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore }) => (
        <WordSearchGame difficulty={difficulty} onComplete={shellComplete} reportScore={reportScore} />
      )}
    </GameShell>
  );
}

WordSearch.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
