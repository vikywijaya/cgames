import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SpeedTap.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 12, showMs: 1400, gridSize: 4, distractors: 2, timeLimitSeconds: 60 },
  medium: { rounds: 16, showMs: 1000, gridSize: 6, distractors: 4, timeLimitSeconds: 60 },
  hard:   { rounds: 20, showMs: 700,  gridSize: 9, distractors: 6, timeLimitSeconds: 60 },
};

const TARGETS  = ['⭐','🎯','🌟','💎','🔥','🎪'];
const DISTRACTORS = ['🔵','🔴','🟢','🟡','🟠','🟣','⚫','⚪','🔶','🔷','🔸','🔹'];

function SpeedTapGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [round,    setRound]    = useState(0);
  const [score,    setScore]    = useState(0);
  const [items,    setItems]    = useState([]);
  const [target,   setTarget]   = useState('');
  const [feedback, setFeedback] = useState(null); // 'correct' | 'wrong' | null
  const [waiting,  setWaiting]  = useState(false);
  const scoreRef  = useRef(0);
  const doneRef   = useRef(false);
  const timerRef  = useRef(null);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(timerRef.current);
    onComplete({ finalScore: scoreRef.current, maxScore: config.rounds, completed: true });
  }, [onComplete, config.rounds]);

  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) finish();
  }, [secondsLeft, finish]);

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
    // Fill grid: one target, rest distractors (cycled)
    const size = config.gridSize;
    const targetPos = Math.floor(Math.random() * size);
    const grid = Array.from({ length: size }, (_, i) => i === targetPos ? t : dist[i % dist.length]);
    setTarget(t);
    setItems(grid);
    setFeedback(null);
    setWaiting(false);

    // Auto-miss if no tap within showMs
    timerRef.current = setTimeout(() => {
      if (doneRef.current) return;
      playFail();
      setFeedback('miss');
      setWaiting(true);
      setTimeout(() => { setRound(r => { nextRound(r + 1); return r + 1; }); }, 500);
    }, config.showMs);
  }, [config, finish, playFail]);

  // Start first round
  useEffect(() => { nextRound(0); return () => clearTimeout(timerRef.current); }, []); // eslint-disable-line

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
    setTimeout(() => { setRound(r => { nextRound(r + 1); return r + 1; }); }, 400);
  }, [feedback, waiting, target, reportScore, nextRound, playClick, playSuccess, playFail]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span>Tap: <strong className={styles.targetLabel}>{target}</strong></span>
        <span className={styles.scoreLabel}>Score: <strong>{score}</strong></span>
      </div>
      <div className={styles.grid} style={{ '--cols': Math.ceil(Math.sqrt(config.gridSize)) }}>
        {items.map((emoji, i) => (
          <button
            key={i}
            className={`${styles.cell} ${feedback === 'correct' && emoji === target ? styles.cellHit : ''} ${feedback === 'wrong' && emoji !== target ? '' : ''}`}
            onPointerDown={() => handleTap(emoji)}
            disabled={!!feedback}
            aria-label={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
      {feedback === 'wrong' && <p className={styles.feedbackBad}>Wrong one!</p>}
      {feedback === 'miss'  && <p className={styles.feedbackBad}>Too slow!</p>}
      {feedback === 'correct' && <p className={styles.feedbackOk}>✓</p>}
    </div>
  );
}

SpeedTapGame.propTypes = { difficulty: PropTypes.string.isRequired, onComplete: PropTypes.func.isRequired, reportScore: PropTypes.func.isRequired, secondsLeft: PropTypes.number, playClick: PropTypes.func.isRequired, playSuccess: PropTypes.func.isRequired, playFail: PropTypes.func.isRequired };

export function SpeedTap({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'speed-tap', callbackUrl, onComplete });
  return (
    <GameShell gameId="speed-tap" title="Speed Tap"
      instructions="A target emoji appears among distractors — tap it as fast as you can! Each round lasts only a moment."
      difficulty={difficulty} timeLimitSeconds={config.timeLimitSeconds} onGameComplete={fireCallback}
      onBack={onBack} musicMuted={musicMuted} onToggleMusic={onToggleMusic}>
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <SpeedTapGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}
SpeedTap.propTypes = { memberId: PropTypes.string.isRequired, difficulty: PropTypes.oneOf(['easy','medium','hard']), onComplete: PropTypes.func.isRequired, callbackUrl: PropTypes.string, onBack: PropTypes.func, musicMuted: PropTypes.bool, onToggleMusic: PropTypes.func };
