import { useState, useRef, useEffect } from 'react';
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
  const [animating, setAnimating] = useState(false); // true while entry animations play
  const [result, setResult] = useState(null);
  const [liveScore, setLiveScore] = useState(0);
  const startTimeRef = useRef(null);
  const animTimerRef = useRef(null);
  const { playClick, playSuccess, playFail, playComplete } = useSoundFx();

  // 0.5s max stagger delay + 0.4s animation duration + 50ms buffer
  const ANIM_LOCK_MS = 950;

  const { secondsLeft } = useCountdown({
    seconds: timeLimitSeconds,
    active: phase === 'playing' && !animating,
    onExpire: () => {
      if (phase === 'playing') {
        handleComplete({ finalScore: liveScore, maxScore: 0, completed: false });
      }
    },
  });

  // Clear animation lock timer on unmount
  useEffect(() => () => clearTimeout(animTimerRef.current), []);

  function handleStart() {
    startTimeRef.current = Date.now();
    setResult(null);
    setLiveScore(0);
    setAnimating(true);
    setPhase('playing');
    animTimerRef.current = setTimeout(() => setAnimating(false), ANIM_LOCK_MS);
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

  // Convert instruction strings to bullet list
  function renderInstructions(inst) {
    if (typeof inst === 'string') {
      const bullets = inst
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);
      return (
        <ul className={styles.instructionsList}>
          {bullets.map((bullet, idx) => (
            <li key={idx}>{bullet}</li>
          ))}
        </ul>
      );
    }
    return inst;
  }

  const isUrgent = secondsLeft !== null && secondsLeft <= 10;

  const pct = phase === 'finished' && result.maxScore > 0 ? result.score / result.maxScore : 0;
  const headline =
    pct >= 0.9 ? 'Excellent!' : pct >= 0.7 ? 'Well done!' : pct >= 0.5 ? 'Great effort!' : 'Keep practising!';

  return (
    <div className={styles.shell}>
      {phase === 'idle' && (
        <div className={styles.startScreen}>
          <h1 className={styles.gameTitle}>{title}</h1>
          <span className={`${styles.difficultyBadge} ${diffBadgeClass}`}>{diffLabel}</span>
          {timeLimitSeconds && (
            <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              Time limit: {timeLimitSeconds} seconds
            </p>
          )}
          <div className={styles.instructionsFrame} role="region" aria-label="Game instructions">
            <div className={styles.instructions}>
              <h2 className={styles.instructionsTitle}>How to play</h2>
              {renderInstructions(instructions)}
            </div>
            <Button size="large" onClick={handleStart} autoFocus className={styles.playBtn}>
              Play
            </Button>
          </div>
        </div>
      )}

      {phase === 'finished' && (
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
      )}

      {phase === 'playing' && (
        <>
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
          </div>
          <div className={`${styles.gameBody} ${animating ? styles.gameBodyLocked : ''}`}>
            {children({
              onComplete: handleComplete,
              reportScore: setLiveScore,
              secondsLeft,
              playClick,
              playSuccess,
              playFail,
            })}
          </div>
        </>
      )}

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
