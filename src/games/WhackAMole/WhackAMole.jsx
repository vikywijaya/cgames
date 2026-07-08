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

function MoleSVG({ bonked = false }) {
  if (bonked) {
    return (
      <svg viewBox="0 0 48 52" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet">
        {/* Flattened body capsule */}
        <path d="M8 52 L8 34 Q8 20 24 20 Q40 20 40 34 L40 52 Z" fill="#8a6a45" />
        {/* Belly */}
        <path d="M15 52 L15 40 Q15 32 24 32 Q33 32 33 40 L33 52 Z" fill="#c8a97e" />
        {/* Ears squashed low */}
        <circle cx="12" cy="22" r="4" fill="#8a6a45" />
        <circle cx="36" cy="22" r="4" fill="#8a6a45" />
        {/* Dizzy X eyes */}
        <g stroke="#2b2018" strokeWidth="2" strokeLinecap="round">
          <line x1="15" y1="28" x2="19" y2="32" />
          <line x1="19" y1="28" x2="15" y2="32" />
          <line x1="29" y1="28" x2="33" y2="32" />
          <line x1="33" y1="28" x2="29" y2="32" />
        </g>
        {/* Snout + tongue out */}
        <ellipse cx="24" cy="35" rx="6" ry="4" fill="#e8c39a" />
        <ellipse cx="24" cy="33" rx="2.6" ry="1.8" fill="#e2707f" />
        <path d="M22 37.5 Q24 39.5 26 37.5" stroke="#5a3d28" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 52" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet">
      {/* Body — rounded capsule rising out of the hole, no legs */}
      <path d="M9 52 L9 24 Q9 6 24 6 Q39 6 39 24 L39 52 Z" fill="#8a6a45" />
      {/* Side shading */}
      <path d="M33 8.5 Q39 13 39 24 L39 52 L33 52 Z" fill="rgba(0,0,0,0.08)" />
      {/* Belly */}
      <path d="M16 52 L16 34 Q16 25 24 25 Q32 25 32 34 L32 52 Z" fill="#c8a97e" />
      {/* Ears */}
      <circle cx="13" cy="12" r="4.2" fill="#8a6a45" />
      <circle cx="13.5" cy="12.5" r="2.2" fill="#b98d64" />
      <circle cx="35" cy="12" r="4.2" fill="#8a6a45" />
      <circle cx="34.5" cy="12.5" r="2.2" fill="#b98d64" />
      {/* Eyes — big and friendly */}
      <circle cx="17.5" cy="18" r="3.4" fill="#2b2018" />
      <circle cx="30.5" cy="18" r="3.4" fill="#2b2018" />
      <circle cx="18.6" cy="16.8" r="1.2" fill="white" />
      <circle cx="31.6" cy="16.8" r="1.2" fill="white" />
      {/* Snout */}
      <ellipse cx="24" cy="23.5" rx="6" ry="4.4" fill="#e8c39a" />
      {/* Pink nose */}
      <ellipse cx="24" cy="21.5" rx="2.8" ry="2" fill="#e2707f" />
      <ellipse cx="23.2" cy="20.9" rx="0.9" ry="0.6" fill="#f4a9b4" />
      {/* Smile */}
      <path d="M21 25.5 Q24 28 27 25.5" stroke="#5a3d28" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      {/* Whiskers */}
      <g stroke="#6f5233" strokeWidth="1" strokeLinecap="round" opacity="0.7">
        <line x1="15" y1="22" x2="8.5" y2="20.5" />
        <line x1="15" y1="24" x2="8.5" y2="24.5" />
        <line x1="33" y1="22" x2="39.5" y2="20.5" />
        <line x1="33" y1="24" x2="39.5" y2="24.5" />
      </g>
      {/* Paws gripping the edge */}
      <ellipse cx="13.5" cy="47" rx="5" ry="4.5" fill="#a4805a" />
      <ellipse cx="34.5" cy="47" rx="5" ry="4.5" fill="#a4805a" />
      <g stroke="#6f5233" strokeWidth="1" strokeLinecap="round" opacity="0.7">
        <line x1="11.5" y1="43.5" x2="11.5" y2="46" />
        <line x1="14" y1="43" x2="14" y2="45.5" />
        <line x1="32.5" y1="43" x2="32.5" y2="45.5" />
        <line x1="35" y1="43.5" x2="35" y2="46" />
      </g>
    </svg>
  );
}

MoleSVG.propTypes = {
  bonked: PropTypes.bool,
};

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
  const [whacked, setWhacked]     = useState({}); // { [index]: 'mole' | 'bomb' } — brief bonk/explosion
  const [hammer, setHammer]       = useState(null); // index of last tapped hole
  const [popups, setPopups]       = useState([]);  // floating +1 markers [{ id, idx }]
  const [shaking, setShaking]     = useState(false);
  const popupIdRef = useRef(0);
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

  // Keep latest callbacks in refs so the popping-loop effect below doesn't
  // need them as dependencies — onComplete (and therefore finish) gets a new
  // identity on every parent tick (GameShell re-renders every second for the
  // countdown), which would otherwise tear down and recreate the interval
  // before it ever fires.
  const finishRef   = useRef(finish);
  finishRef.current = finish;
  const playFailRef   = useRef(playFail);
  playFailRef.current = playFail;

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
          playFailRef.current();
          livesRef.current -= 1;
          setLives(livesRef.current);
          if (livesRef.current <= 0) finishRef.current();
        }
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
      playBoing();
      scoreRef.current += 1;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      // Bonked mole stays visible briefly + hammer + floating +1
      const popupId = ++popupIdRef.current;
      setPopups(prev => [...prev, { id: popupId, idx }]);
      setWhacked(prev => ({ ...prev, [idx]: 'mole' }));
      setHammer(idx);
      setTimeout(() => {
        setWhacked(prev => { const n = { ...prev }; delete n[idx]; return n; });
        setHammer(null);
      }, 450);
      setTimeout(() => {
        setPopups(prev => prev.filter(p => p.id !== popupId));
      }, 800);
    } else {
      // Bomb tapped — explosion + shake, then game over
      playFail();
      livesRef.current = 0;
      setLives(0);
      setWhacked(prev => ({ ...prev, [idx]: 'bomb' }));
      setShaking(true);
      setTimeout(() => finish(), 600);
    }
  }, [finish, reportScore, playBoing, playFail]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.livesRow} aria-label={`${lives} ${t.common.livesRemaining}`}>
            {Array.from({ length: 3 }).map((_, i) => (
              <span key={i} className={i < lives ? styles.heartFull : styles.heartEmpty} aria-hidden="true">❤️</span>
            ))}
          </span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>pts</span>
        </div>
      </div>

      <div className={styles.playArea}>
      <div
        className={`${styles.grid} ${shaking ? styles.gridShake : ''}`}
        role="application"
        aria-label="Whack-a-mole grid"
      >
        {Array.from({ length: holes }).map((_, i) => {
          const type = active[i];
          const whackType = whacked[i];
          const showHammer = hammer === i;
          const hasPopup = popups.some(p => p.idx === i);
          return (
            <button
              key={i}
              style={{ '--idx': i }}
              className={`${styles.hole} ${type ? styles.holeActive : ''} ${whackType ? styles.holeWhacked : ''}`}
              onPointerDown={() => handleTap(i)}
              aria-label={type === 'mole' ? 'Whack the mole!' : type === 'bomb' ? 'Avoid the bomb!' : 'Empty hole'}
            >
              {/* Dirt rim behind the opening */}
              <span className={styles.dirtRim} aria-hidden="true" />
              {/* Dark oval opening */}
              <span className={styles.holeOpening} aria-hidden="true" />
              {/* Clip window — mole rises out of the hole, lower body hidden inside it */}
              <span className={styles.moleClip} aria-hidden="true">
                {type && (
                  <span className={`${styles.creature} ${type === 'bomb' ? styles.creatureBomb : ''}`}>
                    {type === 'mole' ? <MoleSVG /> : <BombSVG />}
                  </span>
                )}
                {/* Bonked mole stays flattened in the hole for a beat */}
                {!type && whackType === 'mole' && (
                  <span className={`${styles.creature} ${styles.creatureBonked}`}>
                    <MoleSVG bonked />
                  </span>
                )}
              </span>
              {whackType === 'bomb' && (
                <span className={styles.explosion} aria-hidden="true">💥</span>
              )}
              {/* Front lip of the dirt rim, drawn over the mole's base */}
              <span className={styles.dirtFront} aria-hidden="true" />
              {showHammer && (
                <>
                  <span className={styles.hammerWrap} aria-hidden="true">
                    <HammerSVG visible />
                  </span>
                  <span className={styles.whackStars} aria-hidden="true">✦ ✦ ✦</span>
                </>
              )}
              {hasPopup && (
                <span className={styles.plusOne} aria-hidden="true">+1</span>
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
      flushTop
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
