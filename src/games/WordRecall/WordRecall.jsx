import { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { Button } from '../../components/Button/Button';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { useGameCallback } from '../../hooks/useGameCallback';
import { useCountdown } from '../../hooks/useCountdown';
import { GAME_IDS } from '../../utils/gameIds';
import { useWordRecall } from './useWordRecall';
import styles from './WordRecall.module.css';

const INSTRUCTIONS =
  'You will see a list of words. Study them carefully! When the time is up, ' +
  'the words will disappear and you will type as many as you can remember. ' +
  'Spelling counts, but upper and lower case do not matter.';

function WordRecallGame({ difficulty, onComplete, reportScore }) {
  const {
    wordList,
    phase,
    recalled,
    inputValue,
    setInputValue,
    lastResult,
    studySeconds,
    recallSeconds,
    enterRecall,
    submitWord,
    score,
    maxScore,
  } = useWordRecall(difficulty);

  const inputRef = useRef(null);

  // Study countdown — transitions to recall automatically
  const { secondsLeft: studyLeft } = useCountdown({
    seconds: studySeconds,
    active: phase === 'study',
    onExpire: enterRecall,
  });

  // Recall countdown — ends the game
  const { secondsLeft: recallLeft } = useCountdown({
    seconds: recallSeconds,
    active: phase === 'recall',
    onExpire: () => onComplete({ finalScore: score, maxScore, completed: true }),
  });

  useEffect(() => { reportScore?.(score); }, [score, reportScore]);

  useEffect(() => {
    if (phase === 'recall') inputRef.current?.focus();
  }, [phase]);

  // End game if all words recalled
  useEffect(() => {
    if (phase === 'recall' && recalled.size === maxScore) {
      onComplete({ finalScore: score, maxScore, completed: true });
    }
  }, [recalled.size, maxScore, phase, score, onComplete]);

  const feedbackClass =
    lastResult === 'found'
      ? styles.feedbackFound
      : lastResult === 'already'
      ? styles.feedbackAlready
      : styles.feedbackNotFound;

  const feedbackText =
    lastResult === 'found'
      ? 'Found!'
      : lastResult === 'already'
      ? 'Already recalled'
      : lastResult === 'notFound'
      ? 'Not on the list'
      : '';

  return (
    <div className={styles.container}>
      {phase === 'study' && (
        <div className={styles.studyPhase}>
          <p className={styles.studyLabel}>
            Study these words — {studyLeft} second{studyLeft !== 1 ? 's' : ''} remaining
          </p>
          <ul className={styles.wordList} role="list" aria-label="Words to remember">
            {wordList.map((word) => (
              <li key={word} className={styles.wordChip} role="listitem">
                {word}
              </li>
            ))}
          </ul>
          <div className={styles.timerBar}>
            <ProgressBar
              value={studyLeft ?? studySeconds}
              max={studySeconds}
              ariaLabel="Study time remaining"
              colorVariant={
                (studyLeft ?? studySeconds) <= 5 ? 'danger' : 'default'
              }
            />
          </div>
          <Button variant="secondary" onClick={enterRecall}>
            I&apos;m ready — start recall
          </Button>
        </div>
      )}

      {phase === 'recall' && (
        <div className={styles.recallPhase}>
          <p className={styles.recallLabel} aria-live="polite">
            Type the words you remember — {recallLeft} second{recallLeft !== 1 ? 's' : ''} left
          </p>

          <div className={styles.recallInputRow}>
            <input
              ref={inputRef}
              type="text"
              className={styles.recallInput}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitWord()}
              placeholder="Type a word…"
              aria-label="Type a word you remember"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <Button onClick={submitWord} disabled={!inputValue.trim()}>
              Submit
            </Button>
          </div>

          <p
            className={`${styles.feedbackMsg} ${lastResult ? feedbackClass : ''}`}
            aria-live="polite"
            aria-atomic="true"
          >
            {feedbackText}
          </p>

          <p className={styles.scoreCount}>
            <strong>{recalled.size}</strong> / {maxScore} words recalled
          </p>

          {recalled.size > 0 && (
            <ul className={styles.recalledList} role="list" aria-label="Words recalled so far">
              {[...recalled].map((word) => (
                <li key={word} className={styles.recalledWord}>
                  {word}
                </li>
              ))}
            </ul>
          )}

          <Button variant="secondary" onClick={() => onComplete({ finalScore: score, maxScore, completed: true })}>
            Finish
          </Button>
        </div>
      )}
    </div>
  );
}

WordRecallGame.propTypes = {
  difficulty: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  reportScore: PropTypes.func,
};

export function WordRecall({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const { fireComplete } = useGameCallback({
    memberId,
    gameId: GAME_IDS.WORD_RECALL,
    callbackUrl,
    onComplete,
  });

  return (
    <GameShell
      gameId={GAME_IDS.WORD_RECALL}
      title="Word Recall"
      instructions={INSTRUCTIONS}
      difficulty={difficulty}
      timeLimitSeconds={null}
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore }) => (
        <WordRecallGame difficulty={difficulty} onComplete={shellComplete} reportScore={reportScore} />
      )}
    </GameShell>
  );
}

WordRecall.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
