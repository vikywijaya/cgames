import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './WhackAMole.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { showMs: 1800, intervalMs: 1600, timeLimitSeconds: 60,  holes: 6 },
  medium: { showMs: 1200, intervalMs: 1100, timeLimitSeconds: 60,  holes: 9 },
  hard:   { showMs: 800,  intervalMs: 750,  timeLimitSeconds: 60,  holes: 9 },
};

const MOLE_EMOJI  = '🐹';
const BOMBA_EMOJI = '💣'; // don't tap — costs a life (medium/hard only)

function WhackGame({ difficulty, onComplete, reportScore, secondsLeft }) {
  const config   = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const holes    = config.holes;
  const useBombs = difficulty !== 'easy';

  const [active, setActive]       = useState({}); // { [index]: 'mole' | 'bomb' }
  const [whacked, setWhacked]     = useState({}); // { [index]: true } — brief flash
  const [score, setScore]         = useState(0);
  const [lives, setLives]         = useState(3);
  const scoreRef  = useRef(0);
  const livesRef  = useRef(3);
  const activeRef = useRef({});
  const doneRef   = useRef(false);
  const timerRef  = useRef(null);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearInterval(timerRef.current);
    onComplete({ finalScore: scoreRef.current, maxScore: 30, completed: true });
  }, [onComplete]);

  // Time-up via secondsLeft
  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) finish();
  }, [secondsLeft, finish]);

  // Mole popping loop
  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (doneRef.current) return;

      // Pick a free hole
      const freeHoles = Array.from({ length: holes }, (_, i) => i)
        .filter(i => !activeRef.current[i]);
      if (freeHoles.length === 0) return;

      const idx  = freeHoles[Math.floor(Math.random() * freeHoles.length)];
      const type = useBombs && Math.random() < 0.25 ? 'bomb' : 'mole';

      // Pop up
      activeRef.current = { ...activeRef.current, [idx]: type };
      setActive({ ...activeRef.current });

      // Auto-hide after showMs
      setTimeout(() => {
        if (doneRef.current) return;
        // If mole escaped (wasn't whacked), no penalty here — just hide
        activeRef.current = { ...activeRef.current };
        delete activeRef.current[idx];
        setActive({ ...activeRef.current });
      }, config.showMs);
    }, config.intervalMs);

    return () => clearInterval(timerRef.current);
  }, [holes, config.showMs, config.intervalMs, useBombs]);

  const handleTap = useCallback((idx) => {
    if (doneRef.current) return;
    const type = activeRef.current[idx];
    if (!type) return;

    // Hide immediately
    activeRef.current = { ...activeRef.current };
    delete activeRef.current[idx];
    setActive({ ...activeRef.current });

    if (type === 'mole') {
      scoreRef.current += 1;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      // Brief whacked flash
      setWhacked(prev => ({ ...prev, [idx]: true }));
      setTimeout(() => setWhacked(prev => { const n = { ...prev }; delete n[idx]; return n; }), 300);
    } else {
      // Bomb tapped
      livesRef.current -= 1;
      setLives(livesRef.current);
      if (livesRef.current <= 0) finish();
    }
  }, [finish, reportScore]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.statusRow}>
        <div className={styles.livesRow} aria-label={`${lives} lives`}>
          {Array.from({ length: 3 }).map((_, i) => (
            <span key={i} className={i < lives ? styles.heartFull : styles.heartEmpty}>
              {i < lives ? '❤️' : '🖤'}
            </span>
          ))}
        </div>
        <div className={styles.scoreDisplay} aria-live="polite" aria-atomic="true">
          Score: <strong>{score}</strong>
        </div>
      </div>

      <div
        className={styles.grid}
        style={{ '--cols': Math.sqrt(holes) === 3 ? 3 : 3 }}
        role="application"
        aria-label="Whack-a-mole grid"
      >
        {Array.from({ length: holes }).map((_, i) => {
          const type = active[i];
          const isWhacked = whacked[i];
          return (
            <button
              key={i}
              className={`${styles.hole} ${type ? styles.holeActive : ''} ${isWhacked ? styles.holeWhacked : ''}`}
              onPointerDown={() => handleTap(i)}
              aria-label={type === 'mole' ? 'Whack the mole!' : type === 'bomb' ? 'Avoid the bomb!' : 'Empty hole'}
            >
              <span className={styles.mound} aria-hidden="true" />
              {type && (
                <span className={styles.creature} aria-hidden="true">
                  {type === 'mole' ? MOLE_EMOJI : BOMBA_EMOJI}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {useBombs && (
        <p className={styles.hint}>Tap {MOLE_EMOJI} moles — avoid {BOMBA_EMOJI} bombs!</p>
      )}
      {!useBombs && (
        <p className={styles.hint}>Tap the moles as fast as you can!</p>
      )}
    </div>
  );
}

WhackGame.propTypes = {
  difficulty: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
};

export function WhackAMole({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'whack-a-mole', callbackUrl, onComplete });
  const useBombs = difficulty !== 'easy';

  return (
    <GameShell
      gameId="whack-a-mole"
      title="Whack-a-Mole"
      instructions={useBombs
        ? `Tap the 🐹 moles quickly — but avoid the 💣 bombs! You have 3 lives. Score as many as you can in ${config.timeLimitSeconds} seconds.`
        : `Tap the 🐹 moles as fast as you can! Score as many as you can in ${config.timeLimitSeconds} seconds.`}
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft }) => (
        <WhackGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} />
      )}
    </GameShell>
  );
}

WhackAMole.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
