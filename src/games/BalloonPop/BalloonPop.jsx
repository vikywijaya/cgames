import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './BalloonPop.module.css';

// ── Config ─────────────────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
  easy:   { riseSpeed: 1.2, spawnMs: 2200, timeLimitSeconds: null, lives: 5, maxBalloons: 6 },
  medium: { riseSpeed: 2,   spawnMs: 1600, timeLimitSeconds: 120,  lives: 3, maxBalloons: 8 },
  hard:   { riseSpeed: 3,   spawnMs: 1000, timeLimitSeconds: 90,   lives: 3, maxBalloons: 10 },
};

const BALLOON_COLORS = ['#f87171','#fb923c','#fbbf24','#34d399','#60a5fa','#a78bfa','#f472b6'];
const BALLOON_W = 52;
const BALLOON_H = 64;

let nextId = 0;

// ── Inner game ─────────────────────────────────────────────────────
function BalloonGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const areaRef     = useRef(null);
  const rafRef      = useRef(null);
  const balloonsRef = useRef([]);
  const scoreRef    = useRef(0);
  const livesRef    = useRef(config.lives);
  const spawnRef    = useRef(null);
  const doneRef     = useRef(false);
  const totalRef    = useRef(0);
  const poppedIdsRef = useRef(new Set()); // track client-side pops to skip in loop

  const [displayScore, setDisplayScore] = useState(0);
  const [displayLives, setDisplayLives] = useState(config.lives);
  const [popEffects, setPopEffects] = useState([]); // brief flash on pop
  const [, forceUpdate] = useState(0);

  // ── Finish ──────────────────────────────────────────────────────
  const finish = useCallback((completed) => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearInterval(spawnRef.current);
    cancelAnimationFrame(rafRef.current);
    onComplete({ finalScore: scoreRef.current, maxScore: totalRef.current || 1, completed });
  }, [onComplete]);

  // ── Time-up ─────────────────────────────────────────────────────
  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) finish(false);
  }, [secondsLeft, finish]);

  // ── Spawn ────────────────────────────────────────────────────────
  useEffect(() => {
    spawnRef.current = setInterval(() => {
      if (doneRef.current) return;
      if (balloonsRef.current.length >= config.maxBalloons) return;
      const area = areaRef.current;
      const areaW = area?.clientWidth ?? 300;
      const x = Math.random() * (areaW - BALLOON_W - 20) + 10;
      balloonsRef.current.push({
        id:    nextId++,
        x,
        y:     (area?.clientHeight ?? 400) + 20, // start below visible area
        color: BALLOON_COLORS[Math.floor(Math.random() * BALLOON_COLORS.length)],
        sway:  (Math.random() - 0.5) * 0.4, // gentle horizontal drift
        swayPhase: Math.random() * Math.PI * 2,
      });
      totalRef.current += 1;
    }, config.spawnMs);
    return () => clearInterval(spawnRef.current);
  }, [config.spawnMs, config.maxBalloons]);

  // ── rAF loop ─────────────────────────────────────────────────────
  useEffect(() => {
    let lastTime = null;
    let frame = 0;
    function tick(ts) {
      if (doneRef.current) return;
      const dt = lastTime ? Math.min((ts - lastTime) / 16.67, 3) : 1;
      lastTime = ts;
      frame++;

      const area = areaRef.current;
      const areaH = area?.clientHeight ?? 400;
      const areaW = area?.clientWidth  ?? 300;

      let livesChanged = false;
      const survived = [];

      for (const b of balloonsRef.current) {
        if (poppedIdsRef.current.has(b.id)) continue; // already tapped
        b.y -= config.riseSpeed * dt;
        // gentle horizontal sway
        b.x += Math.sin(frame * 0.03 + b.swayPhase) * b.sway;
        b.x = Math.max(4, Math.min(areaW - BALLOON_W - 4, b.x));

        if (b.y + BALLOON_H < -20) {
          // escaped
          playFail();
          livesRef.current -= 1;
          livesChanged = true;
          continue;
        }
        survived.push(b);
      }
      balloonsRef.current = survived;

      if (livesChanged) {
        setDisplayLives(livesRef.current);
        if (livesRef.current <= 0) { finish(true); return; }
      }

      forceUpdate(n => n + 1);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [config.riseSpeed, finish]);

  // ── Pop handler ───────────────────────────────────────────────────
  const handlePop = useCallback((e, balloon) => {
    e.stopPropagation();
    if (doneRef.current) return;
    if (poppedIdsRef.current.has(balloon.id)) return;
    poppedIdsRef.current.add(balloon.id);
    playClick();

    // Remove from active list immediately
    balloonsRef.current = balloonsRef.current.filter(b => b.id !== balloon.id);

    playSuccess();
    scoreRef.current += 1;
    setDisplayScore(scoreRef.current);
    reportScore(scoreRef.current);

    // Pop flash effect
    const effect = { id: balloon.id, x: balloon.x, y: balloon.y, color: balloon.color };
    setPopEffects(prev => [...prev, effect]);
    setTimeout(() => setPopEffects(prev => prev.filter(p => p.id !== effect.id)), 400);
  }, [reportScore]);

  return (
    <div className={styles.wrapper}>
      {/* Status */}
      <div className={styles.statusRow}>
        <div className={styles.livesRow} aria-label={`${displayLives} lives remaining`}>
          {Array.from({ length: config.lives }).map((_, i) => (
            <span key={i} className={i < displayLives ? styles.heartFull : styles.heartEmpty}>
              {i < displayLives ? '❤️' : '🖤'}
            </span>
          ))}
        </div>
        <div className={styles.scoreDisplay} aria-live="polite" aria-atomic="true">
          Score: <strong>{displayScore}</strong>
        </div>
      </div>

      {/* Game area */}
      <div
        ref={areaRef}
        className={styles.gameArea}
        role="application"
        aria-label="Balloon pop game — tap balloons to pop them"
      >
        {/* Balloons */}
        {balloonsRef.current.map(b => (
          <button
            key={b.id}
            className={styles.balloon}
            style={{ left: b.x, top: b.y, '--bcolor': b.color }}
            onPointerDown={(e) => handlePop(e, b)}
            aria-label="Pop this balloon"
          >
            <BalloonSVG color={b.color} />
          </button>
        ))}

        {/* Pop flash effects */}
        {popEffects.map(p => (
          <div
            key={p.id}
            className={styles.popBurst}
            style={{ left: p.x + BALLOON_W / 2, top: p.y + BALLOON_H / 2, '--bcolor': p.color }}
            aria-hidden="true"
          />
        ))}
      </div>

      <p className={styles.hint}>Tap the balloons before they float away!</p>
    </div>
  );
}

function BalloonSVG({ color }) {
  return (
    <svg width={BALLOON_W} height={BALLOON_H} viewBox="0 0 52 64" aria-hidden="true">
      {/* String */}
      <path d="M26 54 Q24 58 26 62" stroke="#9ca3af" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* Balloon body */}
      <ellipse cx="26" cy="28" rx="20" ry="24" fill={color} />
      {/* Shine */}
      <ellipse cx="19" cy="20" rx="6" ry="8" fill="rgba(255,255,255,0.28)" />
      {/* Knot */}
      <ellipse cx="26" cy="52" rx="3" ry="2.5" fill={color} />
    </svg>
  );
}
BalloonSVG.propTypes = { color: PropTypes.string.isRequired };

BalloonGame.propTypes = {
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']).isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

// ── Outer wrapper ──────────────────────────────────────────────────
export function BalloonPop({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'balloon-pop', callbackUrl, onComplete });

  return (
    <GameShell
      gameId="balloon-pop"
      title="Balloon Pop"
      instructions={`Tap the balloons to pop them before they float away! You have ${config.lives} lives — each balloon that escapes costs one life. Exercises attention and reaction speed.`}
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <BalloonGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

BalloonPop.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
