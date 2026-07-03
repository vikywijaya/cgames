import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './WhackAMole.module.css';
import { useTranslation } from '../../i18n/useTranslation';

const DIFFICULTY_CONFIG = {
  easy:   { showMs: 1800, intervalMs: 1600, timeLimitSeconds: 60,  holes: 6 },
  medium: { showMs: 1200, intervalMs: 1100, timeLimitSeconds: 60,  holes: 9 },
  hard:   { showMs: 800,  intervalMs: 750,  timeLimitSeconds: 60,  holes: 9 },
};

function MoleSVG() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      {/* Body */}
      <ellipse cx="24" cy="34" rx="13" ry="10" fill="#7B5E3A" />
      {/* Head */}
      <ellipse cx="24" cy="22" rx="12" ry="11" fill="#9B7653" />
      {/* Ears */}
      <ellipse cx="13" cy="16" rx="5" ry="4" fill="#9B7653" />
      <ellipse cx="13" cy="16" rx="3" ry="2.5" fill="#D4956B" />
      <ellipse cx="35" cy="16" rx="5" ry="4" fill="#9B7653" />
      <ellipse cx="35" cy="16" rx="3" ry="2.5" fill="#D4956B" />
      {/* Eyes */}
      <circle cx="19" cy="21" r="3" fill="#1a1a1a" />
      <circle cx="29" cy="21" r="3" fill="#1a1a1a" />
      <circle cx="20" cy="20" r="1" fill="white" />
      <circle cx="30" cy="20" r="1" fill="white" />
      {/* Snout */}
      <ellipse cx="24" cy="27" rx="5" ry="3.5" fill="#D4956B" />
      {/* Nose */}
      <ellipse cx="24" cy="25.5" rx="2.5" ry="1.8" fill="#4a2020" />
      {/* Smile */}
      <path d="M21 28.5 Q24 31 27 28.5" stroke="#4a2020" strokeWidth="1" fill="none" strokeLinecap="round" />
      {/* Claws peeking */}
      <line x1="13" y1="38" x2="11" y2="43" stroke="#7B5E3A" strokeWidth="2" strokeLinecap="round" />
      <line x1="17" y1="40" x2="16" y2="45" stroke="#7B5E3A" strokeWidth="2" strokeLinecap="round" />
      <line x1="31" y1="40" x2="32" y2="45" stroke="#7B5E3A" strokeWidth="2" strokeLinecap="round" />
      <line x1="35" y1="38" x2="37" y2="43" stroke="#7B5E3A" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BombSVG() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      {/* Fuse spark */}
      <line x1="32" y1="10" x2="36" y2="6" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" />
      <circle cx="37" cy="5" r="2.5" fill="#FF6B00" />
      {/* Fuse */}
      <path d="M28 14 Q31 10 32 10" stroke="#8B6914" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Body */}
      <circle cx="22" cy="28" r="16" fill="#2d2d2d" />
      <circle cx="22" cy="28" r="15" fill="#1a1a1a" />
      {/* Shine */}
      <ellipse cx="16" cy="22" rx="4" ry="3" fill="rgba(255,255,255,0.12)" transform="rotate(-20,16,22)" />
      {/* Skull */}
      <circle cx="22" cy="26" r="6" fill="white" opacity="0.85" />
      <rect x="17" y="30" width="10" height="4" rx="1" fill="white" opacity="0.85" />
      <rect x="18.5" y="31" width="2" height="3.5" fill="#1a1a1a" />
      <rect x="21.5" y="31" width="2" height="3.5" fill="#1a1a1a" />
      <circle cx="19.5" cy="25.5" r="2" fill="#1a1a1a" />
      <circle cx="24.5" cy="25.5" r="2" fill="#1a1a1a" />
      {/* Nose */}
      <path d="M21 28.5 L22 27 L23 28.5 Z" fill="#1a1a1a" />
    </svg>
  );
}

function HammerSVG({ visible }) {
  if (!visible) return null;
  return (
    // Hammer head at bottom, handle goes up — slams DOWN onto mole
    <svg viewBox="0 0 56 88" width="56" height="88" xmlns="http://www.w3.org/2000/svg" className={styles.hammerSvg}>
      {/* Handle going up */}
      <rect x="24" y="4" width="8" height="54" rx="4" fill="#8B5E3C" />
      <rect x="25" y="4" width="3" height="54" rx="2" fill="rgba(255,255,255,0.18)" />
      {/* Head at bottom */}
      <rect x="4" y="56" width="48" height="28" rx="7" fill="#4a4a4a" />
      {/* Top highlight */}
      <rect x="4" y="56" width="48" height="11" rx="7" fill="#6e6e6e" />
      {/* Striking face shine */}
      <rect x="7" y="58" width="42" height="7" rx="4" fill="#888" />
      {/* Side bolt detail */}
      <circle cx="12" cy="70" r="3" fill="#333" />
      <circle cx="44" cy="70" r="3" fill="#333" />
    </svg>
  );
}

function WhackGame({ difficulty, onComplete, reportScore, secondsLeft, playBoing, playFail }) {
  const t = useTranslation();
  const config   = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const holes    = config.holes;
  const useBombs = difficulty !== 'easy';

  const [active, setActive]       = useState({}); // { [index]: 'mole' | 'bomb' }
  const [whacked, setWhacked]     = useState({}); // { [index]: true } — brief flash
  const [hammer, setHammer]       = useState(null); // index of last tapped hole
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
        // Only penalise a missed MOLE (a missed bomb is correctly avoided).
        const escapedType = activeRef.current[idx];
        activeRef.current = { ...activeRef.current };
        delete activeRef.current[idx];
        setActive({ ...activeRef.current });
        if (escapedType === 'mole') {
          playFail();
          livesRef.current -= 1;
          setLives(livesRef.current);
          if (livesRef.current <= 0) finish();
        }
      }, config.showMs);
    }, config.intervalMs);

    return () => clearInterval(timerRef.current);
  }, [holes, config.showMs, config.intervalMs, useBombs, finish, playFail]);

  const handleTap = useCallback((idx) => {
    if (doneRef.current) return;
    const type = activeRef.current[idx];
    if (!type) return;

    // Hide immediately
    activeRef.current = { ...activeRef.current };
    delete activeRef.current[idx];
    setActive({ ...activeRef.current });

    if (type === 'mole') {
      playBoing();
      scoreRef.current += 1;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      // Brief whacked flash + hammer
      setWhacked(prev => ({ ...prev, [idx]: true }));
      setHammer(idx);
      setTimeout(() => {
        setWhacked(prev => { const n = { ...prev }; delete n[idx]; return n; });
        setHammer(null);
      }, 350);
    } else {
      // Bomb tapped — ends the game immediately
      playFail();
      livesRef.current = 0;
      setLives(0);
      finish();
    }
  }, [finish, reportScore, playBoing, playFail]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderLabel}>{t.games['whack-a-mole'].label}</span>
          <span className={styles.infoHeaderSub}>{lives} {t.common.livesRemaining}</span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>pts</span>
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
          const showHammer = hammer === i;
          return (
            <button
              key={i}
              style={{ '--idx': i }}
              className={`${styles.hole} ${type ? styles.holeActive : ''} ${isWhacked ? styles.holeWhacked : ''}`}
              onPointerDown={() => handleTap(i)}
              aria-label={type === 'mole' ? 'Whack the mole!' : type === 'bomb' ? 'Avoid the bomb!' : 'Empty hole'}
            >
              {/* Dark oval hole */}
              <span className={styles.holeOpening} aria-hidden="true" />
              {type && (
                <span className={`${styles.creature} ${type === 'bomb' ? styles.creatureBomb : ''}`} aria-hidden="true">
                  {type === 'mole' ? <MoleSVG /> : <BombSVG />}
                </span>
              )}
              {/* Grass lip in front */}
              <span className={styles.mound} aria-hidden="true" />
              {showHammer && (
                <>
                  <span className={styles.hammerWrap} aria-hidden="true">
                    <HammerSVG visible />
                  </span>
                  <span className={styles.whackStars} aria-hidden="true">✦ ✦ ✦</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {useBombs && (
        <p className={styles.hint}>Tap the moles — avoid the bombs!</p>
      )}
      {!useBombs && (
        <p className={styles.hint}>Tap the moles as fast as you can!</p>
      )}
    </div>
  );
}

WhackGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playBoing:   PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

const TIME_LIMITS = { easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds ?? null, medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds ?? null, hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds ?? null };

export function WhackAMole({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'whack-a-mole', callbackUrl, onComplete });
  const useBombs = difficulty !== 'easy';

  return (
    <GameShell
      gameId="whack-a-mole"
      title={t.games['whack-a-mole'].title}
      instructions={useBombs
        ? `Tap the moles quickly — but avoid the bombs! You have 3 lives. Score as many as you can in ${config.timeLimitSeconds} seconds.`
        : `Tap the moles as fast as you can! Score as many as you can in ${config.timeLimitSeconds} seconds.`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playBoing, playFail }) => (
        <WhackGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playBoing={playBoing} playFail={playFail} />
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
