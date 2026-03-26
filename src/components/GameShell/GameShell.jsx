import { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useCountdown } from '../../hooks/useCountdown';
import { useSoundFx } from '../../hooks/useSoundFx';
import { Button } from '../Button/Button';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import { useGameContext } from '../../context/GameContext';
import styles from './GameShell.module.css';

/**
 * Shared game shell that handles the idle → playing → finished state machine.
 * All games delegate their start/end/HUD rendering to this component.
 *
 * Games use the render prop pattern:
 *   children({ onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail })
 *   - onComplete({ finalScore, maxScore, completed }) — triggers the end screen
 *   - reportScore(n) — push current score into the HUD live display
 *   - reportRound(current, total) — update round counter in HUD
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
  timeLimits = null,
  hideDifficulty = false,
  children,
  onGameComplete,
  onBack,
}) {
  const { hideDifficulty: ctxHideDifficulty } = useGameContext();
  const shouldHideDifficulty = hideDifficulty || ctxHideDifficulty;
  const [localDifficulty, setLocalDifficulty] = useState(difficulty);
  const [phase, setPhase] = useState('idle'); // 'idle' | 'playing' | 'finished'
  const [animating, setAnimating] = useState(false); // true while entry animations play
  const [result, setResult] = useState(null);
  const [liveScore, setLiveScore] = useState(0);
  const [round, setRound] = useState({ current: 0, total: 0 });
  const [gameKey, setGameKey] = useState(0); // bump to force full child remount on Play Again
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const startTimeRef = useRef(null);
  const animTimerRef = useRef(null);
  const { playClick, playSuccess, playFail, playComplete, playPop, playReveal, playBoing, playTick } = useSoundFx();

  // Compute effective time limit from timeLimits map or legacy prop
  const effectiveTimeLimit = timeLimits ? (timeLimits[localDifficulty] ?? null) : timeLimitSeconds;

  // 0.5s max stagger delay + 0.4s animation duration + 50ms buffer
  const ANIM_LOCK_MS = 950;

  const { secondsLeft } = useCountdown({
    seconds: effectiveTimeLimit,
    active: phase === 'playing' && !animating,
    resetKey: gameKey,
    onExpire: () => {
      if (phase === 'playing') {
        handleComplete({ finalScore: liveScore, maxScore: 0, completed: false });
      }
    },
  });

  // Clear animation lock timer on unmount
  useEffect(() => () => clearTimeout(animTimerRef.current), []);

  // Countdown tick for the last 5 seconds
  useEffect(() => {
    if (phase === 'playing' && !animating && secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 5) {
      playTick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  function handleStart() {
    startTimeRef.current = Date.now();
    setResult(null);
    setLiveScore(0);
    setRound({ current: 0, total: 0 });
    setAnimating(true);
    setPhase('playing');
    animTimerRef.current = setTimeout(() => setAnimating(false), ANIM_LOCK_MS);
  }

  function handleComplete({ finalScore, maxScore, completed = true }) {
    const durationSeconds = Math.round((Date.now() - (startTimeRef.current ?? Date.now())) / 1000);
    const r = { score: finalScore, maxScore, completed, durationSeconds, difficulty: localDifficulty };
    setResult(r);
    setPhase('finished');
    playComplete();
    onGameComplete?.({ ...r });
  }

  function handlePlayAgain() {
    setGameKey(k => k + 1); // force child remount so refs/state are fully fresh
    setPhase('idle');
    setResult(null);
    setLiveScore(0);
    setRound({ current: 0, total: 0 });
  }

  // Format seconds as MM:SS
  function formatTime(secs) {
    if (secs === null) return null;
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

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

      {/* ── How To Play overlay (shown during game via ? button) ── */}
      {showHowToPlay && (
        <div className={styles.howToPlayOverlay} role="dialog" aria-modal="true" aria-label="How to play">
          <div className={styles.howToPlayOverlayCard}>
            <div className={styles.howToPlayOverlayHeader}>
              <h2 className={styles.howToPlayOverlayTitle}>How To Play</h2>
              <button
                className={styles.howToPlayCloseBtn}
                onClick={() => setShowHowToPlay(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className={styles.howToPlayOverlayBody}>
              {renderInstructions(instructions)}
            </div>
          </div>
        </div>
      )}

      {/* ── TOP BAR (all phases) ── */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          {onBack && (
            <button className={styles.topBarBack} onClick={onBack} aria-label="Go back">
              ‹ Back
            </button>
          )}
        </div>
        <div className={styles.topBarCenter}>
          <span className={styles.topBarTitle}>{title}</span>
        </div>
        <div className={styles.topBarRight}>
          {phase === 'playing' && (
            <button
              className={styles.helpBtn}
              onClick={() => setShowHowToPlay(true)}
              aria-label="How to play"
            >
              ?
            </button>
          )}
        </div>
      </header>

      {/* ── HOW TO PLAY (idle) ── */}
      {phase === 'idle' && (
        <div className={styles.startScreen}>
          {!shouldHideDifficulty && (
            <div className={styles.difficultyPicker} role="radiogroup" aria-label="Select difficulty">
              {['easy', 'medium', 'hard'].map(level => (
                <button
                  key={level}
                  className={`${styles.difficultyOption} ${styles[`difficultyOption_${level}`]} ${localDifficulty === level ? styles.difficultyOptionActive : ''}`}
                  onClick={() => { playClick(); setLocalDifficulty(level); }}
                  role="radio"
                  aria-checked={localDifficulty === level}
                >
                  {level === 'easy' ? '🟢' : level === 'medium' ? '🟡' : '🔴'} {level.charAt(0).toUpperCase() + level.slice(1)}
                </button>
              ))}
            </div>
          )}

          <div className={styles.instructionsFrame} role="region" aria-label="Game instructions">
            <h2 className={styles.instructionsTitle}>How To Play</h2>
            <div className={styles.instructions}>
              {renderInstructions(instructions)}
            </div>
            <div className={styles.playBtnWrapper}>
              <Button size="large" onClick={handleStart} autoFocus className={styles.playBtn}>
                Play
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── PLAYING ── */}
      {phase === 'playing' && (
        <>
          {/* Timer HUD bar */}
          {effectiveTimeLimit !== null && (
            <div className={`${styles.timerHud} ${isUrgent ? styles.timerHudUrgent : ''}`}>
              <span className={styles.timerIcon}>⏱</span>
              <span className={styles.timerValue}>{formatTime(secondsLeft)}</span>
              <div className={styles.timerTrack}>
                <div
                  className={`${styles.timerFill} ${isUrgent ? styles.timerFillUrgent : ''}`}
                  style={{ width: `${Math.max(0, (secondsLeft / effectiveTimeLimit) * 100)}%` }}
                />
              </div>
            </div>
          )}
          <div className={`${styles.gameBody} ${animating ? styles.gameBodyLocked : ''}`}>
            <div key={gameKey}>
              {children({
                difficulty: localDifficulty,
                onComplete: handleComplete,
                reportScore: setLiveScore,
                reportRound: (current, total) => setRound({ current, total }),
                secondsLeft: animating ? effectiveTimeLimit : secondsLeft,
                playClick,
                playSuccess,
                playFail,
                playPop,
                playReveal,
                playBoing,
              })}
            </div>
          </div>
        </>
      )}

      {/* ── END SCREEN ── */}
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

    </div>
  );
}

GameShell.propTypes = {
  gameId: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  instructions: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  timeLimitSeconds: PropTypes.number,
  timeLimits: PropTypes.object,
  children: PropTypes.func.isRequired,
  hideDifficulty: PropTypes.bool,
  onGameComplete: PropTypes.func,
  onBack: PropTypes.func,
};
