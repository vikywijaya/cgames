import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { GameCountdown } from '../../components/GameCountdown/GameCountdown';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SpeedTap.module.css';
import { useTranslation } from '../../i18n/useTranslation';

const DIFFICULTY_CONFIG = {
  //  rounds  showMs  gridSize  distractors  timeLimitSeconds
  easy:   { rounds: 10, showMs: 4000, gridSize: 4, distractors: 1 },
  medium: { rounds: 14, showMs: 2500, gridSize: 6, distractors: 3, timeLimitSeconds: 90 },
  hard:   { rounds: 18, showMs: 1500, gridSize: 9, distractors: 5, timeLimitSeconds: 60 },
};

// Easy: one clear star target, very different-looking distractors
const TARGETS      = ['⭐', '🌟', '💎', '🎯'];
const DISTRACTORS  = ['🍎', '🐶', '🌸', '🚗', '🎈', '🏠', '🐱', '🌈', '🎵', '🍦'];

function SpeedTapGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [counting,  setCounting]  = useState(true);
  const [round,     setRound]     = useState(0);
  const [score,     setScore]     = useState(0);
  const [items,     setItems]     = useState([]);
  const [target,    setTarget]    = useState('');
  const [feedback,  setFeedback]  = useState(null); // 'correct' | 'wrong' | 'miss'
  const [waiting,   setWaiting]   = useState(false);
  const scoreRef = useRef(0);
  const doneRef  = useRef(false);
  const timerRef = useRef(null);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    onComplete({ finalScore: scoreRef.current, maxScore: config.rounds, completed: true });
  }, [onComplete, config.rounds]);

  useEffect(() => {
    if (!counting && secondsLeft === 0 && !doneRef.current) finish();
  }, [counting, secondsLeft, finish]);

  const nextRound = useCallback((currentRound) => {
    if (doneRef.current) return;
    if (currentRound >= config.rounds) { finish(); return; }

    const t = TARGETS[Math.floor(Math.random() * TARGETS.length)];
    const distPool = DISTRACTORS.filter(d => d !== t);
    const dist = [];
    while (dist.length < config.distractors) {
      const d = distPool[Math.floor(Math.random() * distPool.length)];
      if (!dist.includes(d)) dist.push(d);
    }

    const size = config.gridSize;
    const targetPos = Math.floor(Math.random() * size);
    const grid = Array.from({ length: size }, (_, i) =>
      i === targetPos ? t : dist[i % dist.length]
    );

    setTarget(t);
    setItems(grid);
    setFeedback(null);
    setWaiting(false);

    // Auto-advance if no tap within showMs
    timerRef.current = setTimeout(() => {
      if (doneRef.current) return;
      playFail();
      setFeedback('miss');
      setWaiting(true);
      // Give extra recovery time before next round
      setTimeout(() => {
        setRound(r => { nextRound(r + 1); return r + 1; });
      }, 900);
    }, config.showMs);
  }, [config, finish, playFail]);

  // Start first round only after countdown
  useEffect(() => {
    if (counting) return;
    nextRound(0);
    return () => clearTimeout(timerRef.current);
  }, [counting]); // eslint-disable-line

  const handleTap = useCallback((emoji) => {
    if (feedback || waiting || doneRef.current) return;
    playClick();
    clearTimeout(timerRef.current);
    const correct = emoji === target;
    if (correct) {
      playSuccess();
      scoreRef.current += 1;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
    } else {
      playFail();
    }
    setFeedback(correct ? 'correct' : 'wrong');
    setWaiting(true);
    // Longer pause so seniors can see the result before next round
    setTimeout(() => {
      setRound(r => { nextRound(r + 1); return r + 1; });
    }, 800);
  }, [feedback, waiting, target, reportScore, nextRound, playClick, playSuccess, playFail]);

  const cols = Math.ceil(Math.sqrt(config.gridSize));

  return (
    <div className={styles.wrapper} style={{ position: 'relative' }}>
      {counting && <GameCountdown onDone={() => setCounting(false)} />}

      {/* Target display — large and prominent */}
      <div className={styles.targetCard}>
        <span className={styles.targetHint}>Find this:</span>
        <span className={styles.targetEmoji}>{target}</span>
      </div>

      {/* Round progress dots */}
      <div className={styles.progressDots} aria-label={`Round ${round + 1} of ${config.rounds}`}>
        {Array.from({ length: config.rounds }, (_, i) => (
          <span
            key={i}
            className={`${styles.dot} ${i < round ? styles.dotDone : i === round ? styles.dotActive : styles.dotPending}`}
          />
        ))}
      </div>

      {/* Tap grid */}
      <div className={styles.grid} style={{ '--cols': cols }}>
        {items.map((emoji, i) => (
          <button
            key={i}
            style={{ '--idx': i }}
            className={`${styles.cell}
              ${feedback === 'correct' && emoji === target ? styles.cellHit : ''}
              ${feedback === 'wrong'   && emoji === target ? styles.cellReveal : ''}
            `}
            onPointerDown={() => handleTap(emoji)}
            disabled={!!feedback}
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Score + feedback row */}
      <div className={styles.bottomRow}>
        <span className={styles.scoreLabel}>Score: <strong>{score}</strong></span>
        <p className={
          feedback === 'correct' ? styles.feedbackOk :
          feedback === 'wrong'   ? styles.feedbackBad :
          feedback === 'miss'    ? styles.feedbackBad :
          styles.feedbackSlot
        }>
          {feedback === 'correct' ? '✓ Great!'
           : feedback === 'wrong' ? '✗ Try again!'
           : feedback === 'miss'  ? 'Keep going!'
           : '\u00A0'}
        </p>
      </div>
    </div>
  );
}

SpeedTapGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

const TIME_LIMITS = {
  easy:   null, // no time limit on easy — seniors get as long as they need
  medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds,
  hard:   DIFFICULTY_CONFIG.hard.timeLimitSeconds,
};

export function SpeedTap({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'speed-tap', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="speed-tap"
      title={t.games['speed-tap'].title}
      instructions={t.games['speed-tap'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playClick, playSuccess, playFail }) => (
        <SpeedTapGame
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          secondsLeft={secondsLeft}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
        />
      )}
    </GameShell>
  );
}

SpeedTap.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
