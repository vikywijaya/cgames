import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './BalloonPop.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * Mechanic overview
 * - Balloons rise from the grass; tap to pop before they float off the top.
 * - Golden balloon: +3. Rainbow balloon: +2 and pops every other good
 *   balloon on screen (each scores). Bunches: three balloons side by side.
 * - Storm balloon (medium/hard): don't pop it — it costs a life and
 *   breaks the combo. Letting it float away is correct.
 * - Colour challenge (medium/hard): a banner names the colour to pop, and
 *   it changes every so often. Only that colour scores and only that
 *   colour costs a life when it escapes; popping another colour only
 *   breaks the combo. Balloons already in the air when the colour
 *   changes never cost a life, so a change is never a trap.
 * - Combo: consecutive good pops raise the multiplier (x2 at 5, x3 at 10).
 * - Pace ramps up over the round: balloons rise faster and appear sooner.
 */
// Tuned for seniors: readable rises and a gentle ramp. At the start a
// balloon takes roughly 11s (easy/medium) to 8s (hard) to cross the sky.
// bunch: chance a spawn is a trio floating up side by side.
// rainbow: chance of a rainbow balloon, which pops every good balloon on
// screen at once. Both are pure bonuses and never cost a life.
const DIFFICULTY_CONFIG = {
  easy:   { rise: 0.85, spawnMs: 1250, ramp: 0.35, timeLimitSeconds: 60, lives: 5, maxBalloons: 7, golden: 0.10, storm: 0,    rainbow: 0.05, bunch: 0.16, target: false, targetEveryMs: 0 },
  medium: { rise: 0.85, spawnMs: 1350, ramp: 0.35, timeLimitSeconds: 60, lives: 5, maxBalloons: 6, golden: 0.08, storm: 0.08, rainbow: 0.04, bunch: 0.08, target: true,  targetEveryMs: 20000 },
  hard:   { rise: 1.15, spawnMs: 1100, ramp: 0.40, timeLimitSeconds: 60, lives: 3, maxBalloons: 8, golden: 0.07, storm: 0.10, rainbow: 0.04, bunch: 0.06, target: true,  targetEveryMs: 15000 },
};

// Four clearly distinct, nameable colours for the colour challenge. No
// yellow or orange: they'd read as the golden +3 balloon.
const COLOURS = {
  red:    { fill: '#ef4444', dark: '#b91c1c' },
  blue:   { fill: '#3b82f6', dark: '#1d4ed8' },
  purple: { fill: '#a855f7', dark: '#7e22ce' },
  green:  { fill: '#22c55e', dark: '#15803d' },
};
const COLOUR_KEYS = Object.keys(COLOURS);
const GOLD  = { fill: '#f5b50a', dark: '#b27900' };
const STORM = { fill: '#475569', dark: '#1e293b' };
const TARGET_SHARE = 0.5; // share of plain balloons in the target colour

const BALLOON_W = 64;
const BALLOON_H = 92; // includes the string
const POINTS = { plain: 1, golden: 3, rainbow: 2 };
const pointsFor = (b) => POINTS[b.kind] ?? 1;

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

let nextId = 0;

function BalloonSVG({ fill, dark, kind = 'plain' }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 64 92" aria-hidden="true">
      <path className={styles.string} d="M32 66 Q27 74 32 81 Q37 87 32 92" stroke="#94a3b8" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M32 4 C48 4 58 17 58 32 C58 50 44 62 32 64 C20 62 6 50 6 32 C6 17 16 4 32 4 Z" fill={fill} />
      <path d="M44 10 C53 16 57 26 55 38 C52 52 42 60 32 64 C40 56 47 44 47 30 C47 21 46 15 44 10 Z" fill={dark} opacity="0.28" />
      <ellipse cx="21" cy="22" rx="6" ry="10" transform="rotate(-22 21 22)" fill="rgba(255,255,255,0.45)" />
      <circle cx="17" cy="36" r="2.4" fill="rgba(255,255,255,0.35)" />
      <path d="M28 64 L36 64 L34 68 L30 68 Z" fill={dark} />
      {kind === 'rainbow' && (
        <>
          <defs>
            <linearGradient id="bp-rainbow" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ef4444" />
              <stop offset="0.25" stopColor="#f59e0b" />
              <stop offset="0.5" stopColor="#22c55e" />
              <stop offset="0.75" stopColor="#3b82f6" />
              <stop offset="1" stopColor="#a855f7" />
            </linearGradient>
          </defs>
          <path d="M32 4 C48 4 58 17 58 32 C58 50 44 62 32 64 C20 62 6 50 6 32 C6 17 16 4 32 4 Z" fill="url(#bp-rainbow)" />
          <ellipse cx="21" cy="22" rx="6" ry="10" transform="rotate(-22 21 22)" fill="rgba(255,255,255,0.5)" />
          <path d="M32 24 L34 30 L40 32 L34 34 L32 40 L30 34 L24 32 L30 30 Z" fill="#fff" />
        </>
      )}
      {kind === 'golden' && (
        <path d="M32 21 L35.5 29 L44 29.8 L37.6 35.4 L39.6 44 L32 39.4 L24.4 44 L26.4 35.4 L20 29.8 L28.5 29 Z" fill="#fff7d1" />
      )}
      {kind === 'storm' && (
        <path d="M35 17 L24 36 L31 36 L27 50 L40 29 L33 29 Z" fill="#fde047" stroke="#1e293b" strokeWidth="1.2" strokeLinejoin="round" />
      )}
    </svg>
  );
}
BalloonSVG.propTypes = {
  fill: PropTypes.string.isRequired,
  dark: PropTypes.string.isRequired,
  kind: PropTypes.oneOf(['plain', 'golden', 'storm', 'rainbow']),
};

const RAINBOW = { fill: '#ec4899', dark: '#7e22ce' };

function paletteFor(b) {
  if (b.kind === 'rainbow') return RAINBOW;
  if (b.kind === 'golden') return GOLD;
  if (b.kind === 'storm') return STORM;
  return COLOURS[b.colour];
}

function BalloonGame({ countingDown = false, difficulty, onComplete, reportScore, secondsLeft, playPop, playFail, playSuccess, playReveal }) {
  const t = useTranslation();
  const tb = t.games['balloon-pop'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const areaRef     = useRef(null);
  const rafRef      = useRef(null);
  const balloonsRef = useRef([]);
  const scoreRef    = useRef(0);
  const perfectRef  = useRef(0);
  const perfectStreakRef = useRef(0);
  const streakRef   = useRef(0);
  const livesRef    = useRef(config.lives);
  const doneRef     = useRef(false);
  const startRef    = useRef(Date.now());
  const targetRef   = useRef(config.target ? COLOUR_KEYS[Math.floor(Math.random() * COLOUR_KEYS.length)] : null);
  const timersRef   = useRef(new Set());

  const [score, setScore]   = useState(0);
  const [lives, setLives]   = useState(config.lives);
  const [streak, setStreak] = useState(0);
  const [target, setTarget] = useState(targetRef.current);
  const [targetFlash, setTargetFlash] = useState(0);
  const [effects, setEffects] = useState([]); // bursts + floating text
  const [banner, setBanner]   = useState(null);
  const [hurt, setHurt]       = useState(0);
  const [, forceUpdate] = useState(0);

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  const finish = useCallback((completed) => {
    if (doneRef.current) return;
    doneRef.current = true;
    cancelAnimationFrame(rafRef.current);
    onComplete({
      finalScore: scoreRef.current,
      maxScore: Math.max(perfectRef.current, scoreRef.current, 1),
      completed,
    });
  }, [onComplete]);

  const cbRef = useRef({});
  cbRef.current = { finish, playFail, playReveal };

  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) finish(false);
  }, [secondsLeft, finish]);

  const isGood = (b) => b.kind === 'golden' || b.kind === 'rainbow' || (b.kind === 'plain' && (!targetRef.current || b.colour === targetRef.current));

  const breakStreak = useCallback(() => {
    streakRef.current = 0;
    setStreak(0);
  }, []);

  const loseLife = useCallback(() => {
    livesRef.current -= 1;
    setLives(livesRef.current);
    setHurt(h => h + 1);
    cbRef.current.playFail();
    if (livesRef.current <= 0) later(() => cbRef.current.finish(true), 450);
  }, [later]);

  const addEffect = useCallback((fx, ms) => {
    const id = ++nextId;
    setEffects(prev => [...prev, { ...fx, id }]);
    later(() => setEffects(prev => prev.filter(e => e.id !== id)), ms);
  }, [later]);

  // ── Target colour rotation ─────────────────────────────────────────
  useEffect(() => {
    if (countingDown || !config.target) return undefined;
    const id = setInterval(() => {
      if (doneRef.current) return;
      const others = COLOUR_KEYS.filter(c => c !== targetRef.current);
      targetRef.current = others[Math.floor(Math.random() * others.length)];
      setTarget(targetRef.current);
      setTargetFlash(f => f + 1);
      cbRef.current.playReveal?.();
    }, config.targetEveryMs);
    return () => clearInterval(id);
  }, [countingDown, config.target, config.targetEveryMs]);

  // ── Spawning ──────────────────────────────────────────────────────
  useEffect(() => {
    if (countingDown) return undefined;
    startRef.current = Date.now();
    const totalMs = config.timeLimitSeconds * 1000;
    let timer = null;

    const spawn = () => {
      if (doneRef.current) return;
      const progress = Math.min(1, (Date.now() - startRef.current) / totalMs);
      if (balloonsRef.current.length < config.maxBalloons) {
        const area = areaRef.current;
        const areaW = area?.clientWidth ?? 320;
        const areaH = area?.clientHeight ?? 440;
        const pickColour = () => {
          if (!targetRef.current) return COLOUR_KEYS[Math.floor(Math.random() * COLOUR_KEYS.length)];
          return Math.random() < TARGET_SHARE
            ? targetRef.current
            : COLOUR_KEYS.filter(c => c !== targetRef.current)[Math.floor(Math.random() * 3)];
        };
        const speed = config.rise * (1 + config.ramp * progress);
        const add = (kind, x, speedFactor) => {
          const b = {
            id: ++nextId,
            kind,
            colour: pickColour(),
            x,
            y: areaH + 4,
            speed: speed * speedFactor,
            sway: 0.25 + Math.random() * 0.35,
            phase: Math.random() * Math.PI * 2,
            tilt: 0,
            // Target at birth: an escape only hurts if the target hasn't
            // changed since this balloon appeared.
            bornTarget: targetRef.current,
          };
          balloonsRef.current.push(b);
          if (isGood(b)) {
            perfectStreakRef.current += 1;
            perfectRef.current += pointsFor(b) * comboMultiplier(perfectStreakRef.current);
          }
        };
        const r = Math.random();
        const maxX = Math.max(0, areaW - BALLOON_W - 12);
        if (r < config.bunch && areaW >= BALLOON_W * 3 + 24) {
          // A trio rising together, slightly staggered.
          const x0 = 6 + Math.random() * (maxX - BALLOON_W * 2 - 8);
          const f = 0.95 + Math.random() * 0.1;
          [0, 1, 2].forEach(i => add('plain', x0 + i * (BALLOON_W + 4), f - i * 0.03));
        } else {
          let kind = 'plain';
          const k = Math.random();
          if (k < config.storm) kind = 'storm';
          else if (k < config.storm + config.golden) kind = 'golden';
          else if (k < config.storm + config.golden + config.rainbow) kind = 'rainbow';
          add(kind, 6 + Math.random() * maxX, (kind === 'golden' ? 1.3 : 1) * (0.9 + Math.random() * 0.2));
        }
      }
      timer = setTimeout(spawn, config.spawnMs * (1 - (config.ramp * 0.6) * progress));
    };
    timer = setTimeout(spawn, 300);
    return () => clearTimeout(timer);
  }, [countingDown, config]);

  // ── Motion loop ───────────────────────────────────────────────────
  useEffect(() => {
    let last = null;
    function tick(ts) {
      if (doneRef.current) return;
      const dt = last ? Math.min((ts - last) / 16.67, 3) : 1;
      last = ts;
      const areaW = areaRef.current?.clientWidth ?? 320;
      const survivors = [];
      for (const b of balloonsRef.current) {
        b.y -= b.speed * dt;
        b.phase += 0.035 * dt;
        b.x += Math.sin(b.phase) * b.sway * dt;
        b.x = Math.max(2, Math.min(areaW - BALLOON_W - 2, b.x));
        b.tilt = Math.cos(b.phase) * 6;
        if (b.y + BALLOON_H < 0) {
          // Floated away. Only a balloon you should have popped hurts.
          if ((b.kind === 'plain' || b.kind === 'golden') && isGood(b) && b.bornTarget === targetRef.current) {
            breakStreak();
            loseLife();
            addEffect({ type: 'escape', x: b.x + BALLOON_W / 2 }, 900);
          }
          continue;
        }
        survivors.push(b);
      }
      balloonsRef.current = survivors;
      forceUpdate(n => (n + 1) % 1e6);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Popping ───────────────────────────────────────────────────────
  const handlePop = useCallback((e, b) => {
    e.stopPropagation();
    if (doneRef.current || countingDown) return;
    if (!balloonsRef.current.includes(b)) return;
    balloonsRef.current = balloonsRef.current.filter(x => x !== b);
    playPop();

    const cx = b.x + BALLOON_W / 2;
    const cy = b.y + 34;
    const pal = paletteFor(b);
    addEffect({ type: 'burst', x: cx, y: cy, colour: pal.fill }, 600);

    if (b.kind === 'storm') {
      breakStreak();
      addEffect({ type: 'text', x: cx, y: cy, text: '−❤️', tone: 'bad' }, 900);
      loseLife();
      return;
    }
    if (!isGood(b)) {
      breakStreak();
      addEffect({ type: 'text', x: cx, y: cy, text: '✗', tone: 'bad' }, 900);
      playFail();
      return;
    }

    const scoreOne = (x, px, py) => {
      streakRef.current += 1;
      const m = comboMultiplier(streakRef.current);
      const gained = pointsFor(x) * m;
      scoreRef.current += gained;
      addEffect({ type: 'text', x: px, y: py, text: `+${gained}`, tone: x.kind === 'golden' || x.kind === 'rainbow' ? 'gold' : m > 1 ? `x${m}` : 'good' }, 900);
    };
    const before = comboMultiplier(streakRef.current);
    scoreOne(b, cx, cy);

    if (b.kind === 'rainbow') {
      // Pop every good balloon still on screen, rippling out from this one.
      // Each stays up until its own pop; one the player taps first (or that
      // floats off) in the meantime is simply skipped.
      const others = balloonsRef.current.filter(isGood);
      addEffect({ type: 'flash' }, 500);
      others.forEach((x, i) => {
        later(() => {
          if (doneRef.current || !balloonsRef.current.includes(x)) return;
          balloonsRef.current = balloonsRef.current.filter(o => o !== x);
          const ox = x.x + BALLOON_W / 2;
          const oy = x.y + 34;
          playPop();
          addEffect({ type: 'burst', x: ox, y: oy, colour: paletteFor(x).fill }, 600);
          scoreOne(x, ox, oy);
          setScore(scoreRef.current);
          setStreak(streakRef.current);
          reportScore(scoreRef.current);
        }, 90 * (i + 1));
      });
    }

    setScore(scoreRef.current);
    setStreak(streakRef.current);
    reportScore(scoreRef.current);
    const mult = comboMultiplier(streakRef.current);
    if (mult > before) {
      const bid = ++nextId;
      setBanner({ id: bid, mult });
      later(() => setBanner(x => (x?.id === bid ? null : x)), 1100);
      playSuccess();
    }
  }, [countingDown, addEffect, breakStreak, loseLife, later, playFail, playPop, playSuccess, reportScore]);

  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span key={hurt} className={`${styles.livesRow} ${hurt ? styles.livesHurt : ''}`} aria-label={`${lives} ${t.common.livesRemaining}`}>
            {Array.from({ length: config.lives }).map((_, i) => (
              <span key={i} className={i < lives ? styles.heartFull : styles.heartEmpty} aria-hidden="true">❤️</span>
            ))}
          </span>
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${tb.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tb.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        {target && (
          <div key={targetFlash} className={`${styles.targetBar} ${targetFlash ? styles.targetBarChanged : ''}`} aria-live="polite">
            <span className={styles.targetLabel}>{tb.popOnly}</span>
            <span className={styles.targetChip} style={{ '--chip': COLOURS[target].fill, '--chipDark': COLOURS[target].dark }}>
              <span className={styles.targetIcon}><BalloonSVG {...COLOURS[target]} /></span>
              {tb.colours[target]}
            </span>
          </div>
        )}

        <div
          ref={areaRef}
          className={styles.sky}
          role="application"
          aria-label={tb.ariaArea}
        >
          <span className={`${styles.cloud} ${styles.cloudA}`} aria-hidden="true" />
          <span className={`${styles.cloud} ${styles.cloudB}`} aria-hidden="true" />
          <span className={`${styles.cloud} ${styles.cloudC}`} aria-hidden="true" />
          <span className={styles.sun} aria-hidden="true" />
          <span className={styles.hills} aria-hidden="true" />

          {banner && (
            <div key={banner.id} className={`${styles.banner} ${styles[`banner${banner.mult}`]}`}>
              {tb.combo} x{banner.mult}!
            </div>
          )}

          {balloonsRef.current.map(b => {
            const pal = paletteFor(b);
            return (
              <button
                key={b.id}
                type="button"
                className={`${styles.balloon} ${b.kind === 'golden' ? styles.balloonGolden : ''} ${b.kind === 'rainbow' ? styles.balloonRainbow : ''}`}
                style={{ transform: `translate(${b.x}px, ${b.y}px) rotate(${b.tilt}deg)` }}
                onPointerDown={(e) => handlePop(e, b)}
                aria-label={b.kind === 'storm' ? tb.ariaStorm : tb.ariaBalloon}
              >
                <BalloonSVG fill={pal.fill} dark={pal.dark} kind={b.kind} />
              </button>
            );
          })}

          {effects.map(fx => {
            if (fx.type === 'burst') {
              return (
                <span key={fx.id} className={styles.burst} style={{ left: fx.x, top: fx.y, '--c': fx.colour }} aria-hidden="true">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <span key={i} className={styles.shard} style={{ '--a': `${i * 45}deg` }} />
                  ))}
                  <span className={styles.ring} />
                </span>
              );
            }
            if (fx.type === 'text') {
              return (
                <span key={fx.id} className={`${styles.floatText} ${styles[`tone_${fx.tone}`] ?? ''}`} style={{ left: fx.x, top: fx.y }} aria-hidden="true">
                  {fx.text}
                </span>
              );
            }
            if (fx.type === 'flash') {
              return <span key={fx.id} className={styles.rainbowFlash} aria-hidden="true" />;
            }
            return (
              <span key={fx.id} className={styles.escape} style={{ left: fx.x }} aria-hidden="true">−❤️</span>
            );
          })}
        </div>

        <div className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={styles.legendIcon}><BalloonSVG {...(target ? COLOURS[target] : COLOURS.blue)} /></span>+1
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendIcon}><BalloonSVG {...GOLD} kind="golden" /></span>+3
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendIcon}><BalloonSVG {...RAINBOW} kind="rainbow" /></span>{tb.popAll}
          </span>
          {config.storm > 0 && (
            <span className={`${styles.legendItem} ${styles.legendBad}`}>
              <span className={styles.legendIcon}><BalloonSVG {...STORM} kind="storm" /></span>{tb.avoid}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

BalloonGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']).isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playPop:     PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playReveal:  PropTypes.func,
};

const TIME_LIMITS = {
  easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds,
  medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds,
  hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds,
};

export function BalloonPop({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tb = t.games['balloon-pop'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'balloon-pop', callbackUrl, onComplete });

  return (
    <GameShell
      startCountdown
      gameId="balloon-pop"
      title={tb.title}
      instructions={difficulty === 'easy' ? tb.instructions : `${tb.instructions} ${tb.instructionsHard}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playPop, playFail, playSuccess, playReveal, countingDown }) => (
        <BalloonGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          secondsLeft={secondsLeft}
          playPop={playPop}
          playFail={playFail}
          playSuccess={playSuccess}
          playReveal={playReveal}
        />
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
