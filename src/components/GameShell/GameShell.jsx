import { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import { useCountdown } from '../../hooks/useCountdown';
import { useSoundFx } from '../../hooks/useSoundFx';
import { Button } from '../Button/Button';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import styles from './GameShell.module.css';

/**
 * Shared game shell that handles the idle → playing → finished state machine.
 * All games delegate their start/end/HUD rendering to this component.
 *
 * Games use the render prop pattern:
 *   children({ onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail })
 *   - onComplete({ finalScore, maxScore, completed }) — triggers the end screen
 *   - reportScore(n) — push current score into the HUD live display
 *   - playClick()   — short UI tick (button / card tap)
 *   - playSuccess() — rising chime (correct answer / match)
 *   - playFail()    — descending buzz (wrong answer / miss)
 */
export function GameShell({
  gameId,
  title,
  instructions,
  difficulty = 'easy',
  timeLimitSeconds = null,
  children,
  onGameComplete,
  onBack,
  musicMuted,
  onToggleMusic,
}) {
  const [phase, setPhase] = useState('idle'); // 'idle' | 'playing' | 'finished'
  const [result, setResult] = useState(null);
  const [liveScore, setLiveScore] = useState(0);
  const startTimeRef = useRef(null);
  const { playClick, playSuccess, playFail, playComplete } = useSoundFx();

  const { secondsLeft } = useCountdown({
    seconds: timeLimitSeconds,
    active: phase === 'playing',
    onExpire: () => {
      if (phase === 'playing') {
        handleComplete({ finalScore: liveScore, maxScore: 0, completed: false });
      }
    },
  });

  function handleStart() {
    startTimeRef.current = Date.now();
    setResult(null);
    setLiveScore(0);
    setPhase('playing');
  }

  function handleComplete({ finalScore, maxScore, completed = true }) {
    const durationSeconds = Math.round((Date.now() - (startTimeRef.current ?? Date.now())) / 1000);
    const r = { score: finalScore, maxScore, completed, durationSeconds };
    setResult(r);
    setPhase('finished');
    playComplete();
    onGameComplete?.({ ...r });
  }

  function handlePlayAgain() {
    setPhase('idle');
    setResult(null);
    setLiveScore(0);
  }

  const diffBadgeClass =
    difficulty === 'hard'
      ? styles.badgeHard
      : difficulty === 'medium'
      ? styles.badgeMedium
      : styles.badgeEasy;

  const diffLabel = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

  if (phase === 'idle') {
    return (
      <div className={styles.shell}>
        <div className={styles.startScreen}>
          <h1 className={styles.gameTitle}>{title}</h1>
          <span className={`${styles.difficultyBadge} ${diffBadgeClass}`}>{diffLabel}</span>
          {timeLimitSeconds && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              Time limit: {timeLimitSeconds} seconds
            </p>
          )}
          <div className={styles.instructions} role="region" aria-label="Game instructions">
            <p className={styles.instructionsTitle}>How to play</p>
            {typeof instructions === 'string' ? <p>{instructions}</p> : instructions}
          </div>
          <Button size="large" onClick={handleStart} autoFocus>
            Start Game
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'finished') {
    const pct = result.maxScore > 0 ? result.score / result.maxScore : 0;
    const headline =
      pct >= 0.9
        ? 'Excellent!'
        : pct >= 0.7
        ? 'Well done!'
        : pct >= 0.5
        ? 'Great effort!'
        : 'Keep practising!';

    return (
      <div className={styles.shell}>
        <div className={styles.endScreen}>
          <h1 className={styles.endHeadline}>{headline}</h1>
          {!result.completed && (
            <span className={styles.timedOutBadge}>Time ran out</span>
          )}
          <div className={styles.endScoreCard} role="region" aria-label="Your results">
            <div aria-live="polite">
              <div className={styles.endScoreValue}>{result.score}</div>
              <div className={styles.endScoreMax}>out of {result.maxScore}</div>
            </div>
            <ProgressBar
              value={result.score}
              max={result.maxScore || 1}
              ariaLabel="Score"
              colorVariant={pct >= 0.7 ? 'success' : pct >= 0.4 ? 'default' : 'warning'}
            />
            <p className={styles.endDuration}>
              Completed in {result.durationSeconds} second{result.durationSeconds !== 1 ? 's' : ''}
            </p>
          </div>
          <div className={styles.endButtonGroup}>
            <Button size="large" onClick={handlePlayAgain} autoFocus>
              Play Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // phase === 'playing'
  const isUrgent = secondsLeft !== null && secondsLeft <= 10;

  return (
    <div className={styles.shell}>
      <div className={styles.hud} role="banner" aria-label="Game status">
        <div className={styles.hudScore} aria-live="polite" aria-atomic="true">
          <span className={styles.hudScoreLabel}>Score </span>
          <span>{liveScore}</span>
        </div>
        <div className={styles.hudTimer}>
          {secondsLeft !== null ? (
            <>
              <span className={styles.hudTimerLabel}>Time</span>
              <span
                className={`${styles.hudTimerValue} ${isUrgent ? styles.hudTimerUrgent : styles.hudTimerNormal}`}
                role="timer"
                aria-live="off"
                aria-label={`${secondsLeft} seconds remaining`}
              >
                {secondsLeft}s
              </span>
            </>
          ) : (
            <span className={styles.hudTimerLabel}>Untimed</span>
          )}
        </div>
        {onToggleMusic && (
          <button
            className={styles.hudMusic}
            onClick={onToggleMusic}
            aria-label={musicMuted ? 'Unmute background music' : 'Mute background music'}
            title={musicMuted ? 'Turn music on' : 'Turn music off'}
          >
            {musicMuted ? '🔇' : '🎵'}
          </button>
        )}
      </div>
      <div className={styles.gameBody}>
        {children({
          onComplete: handleComplete,
          reportScore: setLiveScore,
          secondsLeft,
          playClick,
          playSuccess,
          playFail,
        })}
      </div>
    </div>
  );
}

GameShell.propTypes = {
  gameId: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  instructions: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  timeLimitSeconds: PropTypes.number,
  children: PropTypes.func.isRequired,
  onGameComplete: PropTypes.func,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
