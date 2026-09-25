import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './WhackAMole.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * Mechanic overview
 * - Targets: mole (+1), golden mole (+3, shows briefly), helmet mole
 *   (needs two taps, +2), bomb (costs a life, breaks the combo).
 * - Combo: consecutive hits raise the multiplier (x2 at 5, x3 at 10).
 *   A missed mole or a bomb resets it. Taps on empty holes are free.
 * - Pace ramps up over the round: moles appear faster and stay up for
 *   less time, and on hard two can rise at once near the end.
 * - Lives: easy has none (misses only break the combo); medium and hard
 *   lose a life per escaped mole or tapped bomb.
 */
const DIFFICULTY_CONFIG = {
  easy:   { showMs: 1900, intervalMs: 1500, ramp: 0.25, timeLimitSeconds: 60, holes: 6, lives: null, bomb: 0,    golden: 0.10, helmet: 0,    double: 0 },
  medium: { showMs: 1400, intervalMs: 1150, ramp: 0.35, timeLimitSeconds: 60, holes: 9, lives: 3,    bomb: 0.15, golden: 0.10, helmet: 0.12, double: 0 },
  hard:   { showMs: 1050, intervalMs: 850,  ramp: 0.40, timeLimitSeconds: 60, holes: 9, lives: 3,    bomb: 0.22, golden: 0.08, helmet: 0.18, double: 0.25 },
};

const POINTS = { mole: 1, golden: 3, helmet: 2 };
const GOLDEN_SHOW_FACTOR = 0.7;
const HELMET_SHOW_FACTOR = 1.35;

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

const SKINS = {
  mole:   { body: '#8a6a45', belly: '#c8a97e', ear: '#b98d64', paw: '#a4805a', snout: '#e8c39a', line: '#6f5233' },
  helmet: { body: '#8a6a45', belly: '#c8a97e', ear: '#b98d64', paw: '#a4805a', snout: '#e8c39a', line: '#6f5233' },
  golden: { body: '#e0a21b', belly: '#fbe08a', ear: '#f3c651', paw: '#eab236', snout: '#fdeeb8', line: '#9a6a0c' },
};

function MoleSVG({ kind = 'mole', bonked = false, helmet = false }) {
  const s = SKINS[kind] ?? SKINS.mole;
  if (bonked) {
    return (
      <svg viewBox="0 0 48 52" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet">
        <path d="M8 52 L8 34 Q8 20 24 20 Q40 20 40 34 L40 52 Z" fill={s.body} />
        <path d="M15 52 L15 40 Q15 32 24 32 Q33 32 33 40 L33 52 Z" fill={s.belly} />
        <circle cx="12" cy="22" r="4" fill={s.body} />
        <circle cx="36" cy="22" r="4" fill={s.body} />
        <g stroke="#2b2018" strokeWidth="2" strokeLinecap="round">
          <line x1="15" y1="28" x2="19" y2="32" />
          <line x1="19" y1="28" x2="15" y2="32" />
          <line x1="29" y1="28" x2="33" y2="32" />
          <line x1="33" y1="28" x2="29" y2="32" />
        </g>
        <ellipse cx="24" cy="35" rx="6" ry="4" fill={s.snout} />
        <ellipse cx="24" cy="33" rx="2.6" ry="1.8" fill="#e2707f" />
        <path d="M22 37.5 Q24 39.5 26 37.5" stroke="#5a3d28" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 52" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet">
      <path d="M9 52 L9 24 Q9 6 24 6 Q39 6 39 24 L39 52 Z" fill={s.body} />
      <path d="M33 8.5 Q39 13 39 24 L39 52 L33 52 Z" fill="rgba(0,0,0,0.08)" />
      <path d="M16 52 L16 34 Q16 25 24 25 Q32 25 32 34 L32 52 Z" fill={s.belly} />
      <circle cx="13" cy="12" r="4.2" fill={s.body} />
      <circle cx="13.5" cy="12.5" r="2.2" fill={s.ear} />
      <circle cx="35" cy="12" r="4.2" fill={s.body} />
      <circle cx="34.5" cy="12.5" r="2.2" fill={s.ear} />
      <circle cx="17.5" cy="18" r="3.4" fill="#2b2018" />
      <circle cx="30.5" cy="18" r="3.4" fill="#2b2018" />
      <circle cx="18.6" cy="16.8" r="1.2" fill="white" />
      <circle cx="31.6" cy="16.8" r="1.2" fill="white" />
      <ellipse cx="24" cy="23.5" rx="6" ry="4.4" fill={s.snout} />
      <ellipse cx="24" cy="21.5" rx="2.8" ry="2" fill="#e2707f" />
      <ellipse cx="23.2" cy="20.9" rx="0.9" ry="0.6" fill="#f4a9b4" />
      <path d="M21 25.5 Q24 28 27 25.5" stroke="#5a3d28" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <g stroke={s.line} strokeWidth="1" strokeLinecap="round" opacity="0.7">
        <line x1="15" y1="22" x2="8.5" y2="20.5" />
        <line x1="15" y1="24" x2="8.5" y2="24.5" />
        <line x1="33" y1="22" x2="39.5" y2="20.5" />
        <line x1="33" y1="24" x2="39.5" y2="24.5" />
      </g>
      <ellipse cx="13.5" cy="47" rx="5" ry="4.5" fill={s.paw} />
      <ellipse cx="34.5" cy="47" rx="5" ry="4.5" fill={s.paw} />
      <g stroke={s.line} strokeWidth="1" strokeLinecap="round" opacity="0.7">
        <line x1="11.5" y1="43.5" x2="11.5" y2="46" />
        <line x1="14" y1="43" x2="14" y2="45.5" />
        <line x1="32.5" y1="43" x2="32.5" y2="45.5" />
        <line x1="35" y1="43.5" x2="35" y2="46" />
      </g>
      {kind === 'golden' && (
        <g fill="#fff8d6">
          <path d="M6 6 L7 9 L10 10 L7 11 L6 14 L5 11 L2 10 L5 9 Z" />
          <path d="M42 2 L42.8 4.2 L45 5 L42.8 5.8 L42 8 L41.2 5.8 L39 5 L41.2 4.2 Z" />
        </g>
      )}
      {helmet && (
        <g>
          {/* Hard hat: dome, brim, ridge */}
          <path d="M8 14 Q8 1 24 1 Q40 1 40 14 Z" fill="#f2b705" />
          <rect x="5" y="12.5" width="38" height="4" rx="2" fill="#d99a00" />
          <rect x="21.5" y="1.5" width="5" height="11" rx="2" fill="#ffd54a" />
          <path d="M13 6 Q16 3 20 2.6" stroke="rgba(255,255,255,0.6)" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

MoleSVG.propTypes = {
  kind: PropTypes.oneOf(['mole', 'golden', 'helmet']),
  bonked: PropTypes.bool,
  helmet: PropTypes.bool,
};

function HelmetSVG() {
  return (
    <svg viewBox="0 0 48 20" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 16 Q8 3 24 3 Q40 3 40 16 Z" fill="#f2b705" />
      <rect x="5" y="14.5" width="38" height="4" rx="2" fill="#d99a00" />
      <rect x="21.5" y="3.5" width="5" height="11" rx="2" fill="#ffd54a" />
    </svg>
  );
}

function BombSVG() {
  return (
    <svg viewBox="0 0 48 48" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <line x1="32" y1="10" x2="36" y2="6" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" />
      <circle cx="37" cy="5" r="2.5" fill="#FF6B00" className={styles.fuseSpark} />
      <path d="M28 14 Q31 10 32 10" stroke="#8B6914" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="22" cy="28" r="16" fill="#2d2d2d" />
      <circle cx="22" cy="28" r="15" fill="#1a1a1a" />
      <ellipse cx="16" cy="22" rx="4" ry="3" fill="rgba(255,255,255,0.12)" transform="rotate(-20,16,22)" />
      <circle cx="22" cy="26" r="6" fill="white" opacity="0.85" />
      <rect x="17" y="30" width="10" height="4" rx="1" fill="white" opacity="0.85" />
      <rect x="18.5" y="31" width="2" height="3.5" fill="#1a1a1a" />
      <rect x="21.5" y="31" width="2" height="3.5" fill="#1a1a1a" />
      <circle cx="19.5" cy="25.5" r="2" fill="#1a1a1a" />
      <circle cx="24.5" cy="25.5" r="2" fill="#1a1a1a" />
      <path d="M21 28.5 L22 27 L23 28.5 Z" fill="#1a1a1a" />
    </svg>
  );
}

// When the hammer head lands: 42% of the 420ms swing in .hammerWrap.
// The mole reacts (sound, dazed face, squash, +N) at this moment, not at
// the tap. Keep in step with the CSS keyframes and .whackStars delay.
const HAMMER_IMPACT_MS = 175;
const HAMMER_TOTAL_MS = 450;
const LEAVE_MS = 200;

function HammerSVG() {
  return (
    // Side-on mallet: head on the left, handle running right to the grip.
    // It swings around the grip (see .hammerWrap), so the head arcs down.
    <svg viewBox="0 0 96 48" width="96" height="48" xmlns="http://www.w3.org/2000/svg" className={styles.hammerSvg}>
      <rect x="34" y="20" width="58" height="8" rx="4" fill="#9a6a43" />
      <rect x="34" y="21" width="58" height="2.5" rx="1.25" fill="rgba(255,255,255,0.22)" />
      <rect x="74" y="19" width="18" height="10" rx="5" fill="#3d5a99" />
      <rect x="6" y="4" width="30" height="40" rx="8" fill="#d9443b" />
      <rect x="10" y="4" width="8" height="40" rx="4" fill="rgba(255,255,255,0.28)" />
      <rect x="6" y="4" width="30" height="7" rx="3.5" fill="#f0e6d8" />
      <rect x="6" y="37" width="30" height="7" rx="3.5" fill="#f0e6d8" />
    </svg>
  );
}

function pickKind(config) {
  const r = Math.random();
  if (r < config.bomb) return 'bomb';
  if (r < config.bomb + config.golden) return 'golden';
  if (r < config.bomb + config.golden + config.helmet) return 'helmet';
  return 'mole';
}

function WhackGame({ countingDown = false, difficulty, onComplete, reportScore, secondsLeft, playBoing, playFail, playPop, playSuccess, playReveal }) {
  const t = useTranslation();
  const tw = t.games['whack-a-mole'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const holes = config.holes;
  const hasLives = config.lives !== null;

  // Hole contents: { [idx]: { id, kind, hp } } — hp is 2 for a helmeted mole.
  const [active, setActive]   = useState({});
  // Post-tap / post-escape visuals: { [idx]: { phase, kind } }
  //   phase: 'incoming' (hammer swinging) | 'bonked' | 'bomb' | 'leaving'
  const [effects, setEffects] = useState({});
  const [hammers, setHammers] = useState({}); // { [idx]: swingId }
  const [popups, setPopups]   = useState([]); // [{ id, idx, text, tone }]
  const [helmetsOff, setHelmetsOff] = useState({}); // { [idx]: id } flying helmet
  const [shaking, setShaking] = useState(false);
  const [score, setScore]     = useState(0);
  const [lives, setLives]     = useState(config.lives ?? 0);
  const [streak, setStreak]   = useState(0);
  const [banner, setBanner]   = useState(null); // { id, mult }

  const scoreRef   = useRef(0);
  const perfectRef = useRef(0); // score a flawless player would have by now
  const perfectStreakRef = useRef(0);
  const streakRef  = useRef(0);
  const livesRef   = useRef(config.lives ?? 0);
  const activeRef  = useRef({});
  const doneRef    = useRef(false);
  const idRef      = useRef(0);
  const startRef   = useRef(Date.now());
  const timersRef  = useRef(new Set());

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete({
      finalScore: scoreRef.current,
      maxScore: Math.max(perfectRef.current, scoreRef.current, 1),
      completed: true,
    });
  }, [onComplete]);

  // Latest callbacks in refs: GameShell re-renders every second for the
  // countdown, which would otherwise restart the spawn loop each tick.
  const cbRef = useRef({});
  cbRef.current = { finish, playFail, reportScore, playReveal };

  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) finish();
  }, [secondsLeft, finish]);

  const setEffect = useCallback((idx, value) => {
    setEffects(prev => {
      const n = { ...prev };
      if (value) n[idx] = value; else delete n[idx];
      return n;
    });
  }, []);

  const addPopup = useCallback((idx, text, tone) => {
    const id = ++idRef.current;
    setPopups(prev => [...prev, { id, idx, text, tone }]);
    later(() => setPopups(prev => prev.filter(p => p.id !== id)), 850);
  }, [later]);

  const breakStreak = useCallback(() => {
    streakRef.current = 0;
    setStreak(0);
  }, []);

  const loseLife = useCallback(() => {
    if (!hasLives) return;
    livesRef.current -= 1;
    setLives(livesRef.current);
    if (livesRef.current <= 0) later(() => cbRef.current.finish(), 500);
  }, [hasLives, later]);

  // ── Spawning ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (countingDown) return undefined;
    const totalMs = config.timeLimitSeconds * 1000;
    let spawnTimer = null;
    startRef.current = Date.now();

    const pace = () => {
      const progress = Math.min(1, (Date.now() - startRef.current) / totalMs);
      return 1 - config.ramp * progress; // 1 → (1 - ramp)
    };

    const spawnOne = (speed) => {
      const free = Array.from({ length: holes }, (_, i) => i).filter(i => !activeRef.current[i]);
      if (free.length === 0) return;
      const idx = free[Math.floor(Math.random() * free.length)];
      const kind = pickKind(config);
      const id = ++idRef.current;

      let showMs = config.showMs * speed;
      if (kind === 'golden') showMs *= GOLDEN_SHOW_FACTOR;
      if (kind === 'helmet') showMs *= HELMET_SHOW_FACTOR;

      if (kind !== 'bomb') {
        perfectStreakRef.current += 1;
        perfectRef.current += POINTS[kind] * comboMultiplier(perfectStreakRef.current);
      }

      activeRef.current = { ...activeRef.current, [idx]: { id, kind, hp: kind === 'helmet' ? 2 : 1 } };
      setActive(activeRef.current);

      later(() => {
        if (doneRef.current) return;
        const cur = activeRef.current[idx];
        if (!cur || cur.id !== id) return; // already whacked (or replaced)
        const n = { ...activeRef.current };
        delete n[idx];
        activeRef.current = n;
        setActive(n);
        if (kind !== 'bomb') {
          // Mole escaped: duck back down, lose the streak (and a life).
          setEffect(idx, { phase: 'leaving', kind, helmet: cur.hp > 1 });
          later(() => setEffects(prev => (prev[idx]?.phase === 'leaving' ? (({ [idx]: _, ...rest }) => rest)(prev) : prev)), LEAVE_MS);
          breakStreak();
          if (hasLives) cbRef.current.playFail();
          loseLife();
        } else {
          setEffect(idx, { phase: 'leaving', kind: 'bomb' });
          later(() => setEffects(prev => (prev[idx]?.phase === 'leaving' ? (({ [idx]: _, ...rest }) => rest)(prev) : prev)), LEAVE_MS);
        }
      }, showMs);
    };

    const tick = () => {
      if (doneRef.current) return;
      const speed = pace();
      spawnOne(speed);
      if (config.double && speed < 1 - config.ramp / 2 && Math.random() < config.double) spawnOne(speed);
      spawnTimer = setTimeout(tick, config.intervalMs * speed);
    };

    spawnTimer = setTimeout(tick, 400);
    return () => clearTimeout(spawnTimer);
  }, [countingDown, config, holes, hasLives, later, setEffect, breakStreak, loseLife]);

  // ── Tapping ───────────────────────────────────────────────────────────
  const swingHammer = useCallback((idx) => {
    const swing = ++idRef.current;
    setHammers(prev => ({ ...prev, [idx]: swing }));
    later(() => setHammers(prev => {
      if (prev[idx] !== swing) return prev;
      const n = { ...prev }; delete n[idx]; return n;
    }), HAMMER_TOTAL_MS);
  }, [later]);

  const handleTap = useCallback((idx) => {
    if (doneRef.current || countingDown) return;
    const target = activeRef.current[idx];
    if (!target) return;

    // Helmet takes the first hit: it flies off, the mole stays up.
    if (target.hp > 1) {
      activeRef.current = { ...activeRef.current, [idx]: { ...target, hp: target.hp - 1 } };
      setActive(activeRef.current);
      swingHammer(idx);
      later(() => {
        playPop();
        const hid = ++idRef.current;
        setHelmetsOff(prev => ({ ...prev, [idx]: hid }));
        later(() => setHelmetsOff(prev => {
          if (prev[idx] !== hid) return prev;
          const n = { ...prev }; delete n[idx]; return n;
        }), 600);
      }, HAMMER_IMPACT_MS);
      return;
    }

    const n = { ...activeRef.current };
    delete n[idx];
    activeRef.current = n;
    setActive(n);

    if (target.kind === 'bomb') {
      playFail();
      setEffect(idx, { phase: 'bomb', kind: 'bomb' });
      setShaking(true);
      later(() => setShaking(false), 500);
      later(() => setEffect(idx, null), 600);
      breakStreak();
      addPopup(idx, hasLives ? '−❤️' : '✗', 'bad');
      loseLife();
      return;
    }

    // Score counts at the tap so a last-second hit isn't lost.
    streakRef.current += 1;
    const mult = comboMultiplier(streakRef.current);
    const gained = POINTS[target.kind] * mult;
    scoreRef.current += gained;
    setScore(scoreRef.current);
    setStreak(streakRef.current);
    reportScore(scoreRef.current);
    if (mult > comboMultiplier(streakRef.current - 1)) {
      const bid = ++idRef.current;
      setBanner({ id: bid, mult });
      later(() => setBanner(b => (b?.id === bid ? null : b)), 1100);
      later(() => playSuccess(), HAMMER_IMPACT_MS + 60);
    }

    // The mole stays standing while the hammer swings, and reacts on impact.
    setEffect(idx, { phase: 'incoming', kind: target.kind });
    swingHammer(idx);
    later(() => {
      playBoing();
      addPopup(idx, `+${gained}`, target.kind === 'golden' ? 'gold' : mult > 1 ? `x${mult}` : 'good');
      setEffect(idx, { phase: 'bonked', kind: target.kind });
    }, HAMMER_IMPACT_MS);
    later(() => setEffects(prev => (prev[idx]?.phase === 'bonked' ? (({ [idx]: _, ...rest }) => rest)(prev) : prev)), HAMMER_IMPACT_MS + 450);
  }, [countingDown, addPopup, breakStreak, hasLives, later, loseLife, playBoing, playFail, playPop, playSuccess, reportScore, setEffect, swingHammer]);

  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          {hasLives ? (
            <span className={styles.livesRow} aria-label={`${lives} ${t.common.livesRemaining}`}>
              {Array.from({ length: config.lives }).map((_, i) => (
                <span key={i} className={i < lives ? styles.heartFull : styles.heartEmpty} aria-hidden="true">❤️</span>
              ))}
            </span>
          ) : null}
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${tw.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
            <span className={styles.comboLabel}>{tw.combo} {streak}</span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tw.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <div className={styles.field}>
          {banner && (
            <div key={banner.id} className={`${styles.banner} ${styles[`banner${banner.mult}`]}`} aria-live="polite">
              {tw.combo} x{banner.mult}!
            </div>
          )}
          <div
            className={`${styles.grid} ${holes === 6 ? styles.gridSix : ''} ${shaking ? styles.gridShake : ''}`}
            role="application"
            aria-label="Whack-a-mole grid"
          >
            {Array.from({ length: holes }).map((_, i) => {
              const target = active[i];
              const fx = effects[i];
              const swing = hammers[i];
              const holePopups = popups.filter(p => p.idx === i);
              const lit = target && target.kind !== 'bomb';
              return (
                <button
                  key={i}
                  type="button"
                  style={{ '--idx': i }}
                  className={[
                    styles.hole,
                    lit ? styles.holeActive : '',
                    target?.kind === 'golden' ? styles.holeGolden : '',
                    target?.kind === 'bomb' ? styles.holeBomb : '',
                    fx && fx.phase !== 'incoming' && fx.phase !== 'leaving' ? styles.holeWhacked : '',
                  ].join(' ')}
                  onPointerDown={() => handleTap(i)}
                  aria-label={target ? (target.kind === 'bomb' ? tw.ariaBomb : tw.ariaMole) : tw.ariaEmpty}
                >
                  <span className={styles.dirtRim} aria-hidden="true" />
                  <span className={styles.holeOpening} aria-hidden="true" />
                  <span className={styles.moleClip} aria-hidden="true">
                    {target && (
                      <span
                        key={target.id}
                        className={`${styles.creature} ${target.kind === 'bomb' ? styles.creatureBomb : ''} ${target.kind === 'golden' ? styles.creatureGolden : ''}`}
                      >
                        {target.kind === 'bomb'
                          ? <BombSVG />
                          : <MoleSVG kind={target.kind} helmet={target.hp > 1} />}
                      </span>
                    )}
                    {!target && fx?.phase === 'incoming' && (
                      <span className={`${styles.creature} ${styles.creatureHeld}`}>
                        <MoleSVG kind={fx.kind} />
                      </span>
                    )}
                    {!target && fx?.phase === 'bonked' && (
                      <span className={`${styles.creature} ${styles.creatureBonked}`}>
                        <MoleSVG kind={fx.kind} bonked />
                      </span>
                    )}
                    {!target && fx?.phase === 'leaving' && (
                      <span className={`${styles.creature} ${styles.creatureLeaving} ${fx.kind === 'bomb' ? styles.creatureBomb : ''}`}>
                        {fx.kind === 'bomb' ? <BombSVG /> : <MoleSVG kind={fx.kind} helmet={fx.helmet} />}
                      </span>
                    )}
                  </span>
                  {fx?.phase === 'bomb' && (
                    <span className={styles.explosion} aria-hidden="true">💥</span>
                  )}
                  <span className={styles.dirtFront} aria-hidden="true" />
                  {helmetsOff[i] && (
                    <span key={helmetsOff[i]} className={`${styles.helmetFly} ${i % 3 === 2 ? styles.helmetFlyLeft : ''}`} aria-hidden="true">
                      <HelmetSVG />
                    </span>
                  )}
                  {swing && (
                    <>
                      {/* Right-column holes swing a mirrored hammer so the
                          handle points into the board. */}
                      <span key={swing} className={`${styles.hammerSpace} ${i % 3 === 2 ? styles.hammerMirror : ''}`} aria-hidden="true">
                        <span className={styles.hammerWrap}>
                          <HammerSVG />
                        </span>
                      </span>
                      <span key={`s${swing}`} className={styles.whackStars} aria-hidden="true">✦ ✦ ✦</span>
                    </>
                  )}
                  {holePopups.map(p => (
                    <span key={p.id} className={`${styles.plusOne} ${styles[`tone_${p.tone}`] ?? ''}`} aria-hidden="true">{p.text}</span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.legend}>
          <span className={styles.legendItem}><span className={styles.legendIcon}><MoleSVG /></span>+1</span>
          <span className={styles.legendItem}><span className={styles.legendIcon}><MoleSVG kind="golden" /></span>+3</span>
          {config.helmet > 0 && (
            <span className={styles.legendItem}><span className={styles.legendIcon}><MoleSVG kind="helmet" helmet /></span>{tw.twoTaps}</span>
          )}
          {config.bomb > 0 && (
            <span className={`${styles.legendItem} ${styles.legendBad}`}><span className={styles.legendIcon}><BombSVG /></span>{tw.avoid}</span>
          )}
        </div>
      </div>
    </div>
  );
}

WhackGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playBoing:   PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playPop:     PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playReveal:  PropTypes.func,
};

const TIME_LIMITS = {
  easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds,
  medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds,
  hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds,
};

export function WhackAMole({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tw = t.games['whack-a-mole'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'whack-a-mole', callbackUrl, onComplete });

  return (
    <GameShell
      startCountdown
      gameId="whack-a-mole"
      title={tw.title}
      instructions={difficulty === 'easy' ? tw.instructions : `${tw.instructions} ${tw.instructionsHard}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playBoing, playFail, playPop, playSuccess, playReveal, countingDown }) => (
        <WhackGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          secondsLeft={secondsLeft}
          playBoing={playBoing}
          playFail={playFail}
          playPop={playPop}
          playSuccess={playSuccess}
          playReveal={playReveal}
        />
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
