import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './CatchFallingFruit.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * Mechanic overview (tuned for seniors)
 * - Fruit falls from the orchard tree; slide the basket to catch it.
 *   Every falling item casts a shadow on the grass showing where it lands.
 * - Fruit +1, star +3, heart +1 life (only drops while a life is missing),
 *   bomb (medium/hard) costs a life. A missed fruit costs a life.
 * - Combo: consecutive catches raise the multiplier (x2 at 5, x3 at 10).
 *   A missed fruit or a bomb resets it.
 * - Big Basket power-up: the basket is much wider for a few seconds.
 * - Fruit Shower: every so often a burst of fruit rains down; fruit
 *   missed during a shower never costs a life.
 * - Pace ramps up gently over the round.
 */
const DIFFICULTY_CONFIG = {
  easy:   { fall: 1.5, spawnMs: 1500, ramp: 0.35, timeLimitSeconds: 60, lives: 5, basketWidth: 120, star: 0.08, bomb: 0,    heart: 0.05, big: 0.04, showerEveryMs: 16000 },
  medium: { fall: 2.0, spawnMs: 1250, ramp: 0.40, timeLimitSeconds: 60, lives: 5, basketWidth: 105, star: 0.07, bomb: 0.12, heart: 0.05, big: 0.035, showerEveryMs: 20000 },
  hard:   { fall: 2.6, spawnMs: 1000, ramp: 0.45, timeLimitSeconds: 60, lives: 3, basketWidth: 92,  star: 0.06, bomb: 0.18, heart: 0.05, big: 0.03, showerEveryMs: 22000 },
};

const FRUITS = ['🍎', '🍊', '🍋', '🍇', '🍓', '🍑', '🍒', '🍐', '🍌'];
const EMOJI = { star: '⭐', bomb: '💣', heart: '💖', big: '🧺' };
const POINTS = { fruit: 1, star: 3 };
const ITEM = 44;          // px, item box
const BASKET_H = 56;      // px
const GROUND_H = 34;      // px of grass under the basket
const TAP_STEP = 0.16;
const BIG_MS = 6000;
const BIG_FACTOR = 1.6;
const SHOWER_MS = 3500;
const SHOWER_SPAWN_MS = 330;

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

let nextId = 0;

function BasketSVG() {
  return (
    <svg viewBox="0 0 120 56" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <path d="M4 14 L116 14 L104 54 L16 54 Z" fill="#c98a4b" />
      <g stroke="#a86c33" strokeWidth="3" opacity="0.8">
        <line x1="8" y1="26" x2="112" y2="26" />
        <line x1="11" y1="38" x2="109" y2="38" />
      </g>
      <g stroke="#e0a868" strokeWidth="2.2" opacity="0.7">
        {[22, 38, 54, 70, 86, 102].map(x => <line key={x} x1={x} y1="15" x2={x - (x - 60) * 0.12} y2="53" />)}
      </g>
      <rect x="0" y="8" width="120" height="10" rx="5" fill="#8d5a2b" />
      <rect x="4" y="9" width="112" height="3" rx="1.5" fill="rgba(255,255,255,0.25)" />
    </svg>
  );
}

function CatchGame({ countingDown = false, difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail, playPop, playReveal }) {
  const t = useTranslation();
  const tc = t.games['catch-falling-fruit'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const areaRef     = useRef(null);
  const controlRef  = useRef(null);
  const draggingRef = useRef(false);
  const rafRef      = useRef(null);
  const itemsRef    = useRef([]);
  const basketXRef  = useRef(0.5);
  const scoreRef    = useRef(0);
  const perfectRef  = useRef(0);
  const perfectStreakRef = useRef(0);
  const streakRef   = useRef(0);
  const livesRef    = useRef(config.lives);
  const doneRef     = useRef(false);
  const startRef    = useRef(Date.now());
  const bigUntilRef = useRef(0);
  const showerUntilRef = useRef(0);
  const timersRef   = useRef(new Set());

  const [score, setScore]   = useState(0);
  const [lives, setLives]   = useState(config.lives);
  const [streak, setStreak] = useState(0);
  const [effects, setEffects] = useState([]);
  const [banner, setBanner] = useState(null); // { id, text, tone }
  const [catchPulse, setCatchPulse] = useState(0);
  const [hurt, setHurt] = useState(0);
  const [moved, setMoved] = useState(false); // hide the slide hint once used
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

  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) finish(false);
  }, [secondsLeft, finish]);

  // Latest callbacks for the rAF loop and timers.
  const cbRef = useRef({});
  cbRef.current = { finish, playSuccess, playFail, playPop, playReveal, reportScore };

  const addEffect = useCallback((fx, ms) => {
    const id = ++nextId;
    setEffects(prev => [...prev, { ...fx, id }]);
    later(() => setEffects(prev => prev.filter(e => e.id !== id)), ms);
  }, [later]);

  const showBanner = useCallback((text, tone, ms = 1200) => {
    const id = ++nextId;
    setBanner({ id, text, tone });
    later(() => setBanner(b => (b?.id === id ? null : b)), ms);
  }, [later]);

  // ── Spawning ──────────────────────────────────────────────────────
  useEffect(() => {
    if (countingDown) return undefined;
    startRef.current = Date.now();
    const totalMs = config.timeLimitSeconds * 1000;
    let timer = null;
    let showerTimer = null;

    const addItem = (type, x) => {
      const progress = Math.min(1, (Date.now() - startRef.current) / totalMs);
      const item = {
        id: ++nextId,
        type,
        emoji: type === 'fruit' ? FRUITS[Math.floor(Math.random() * FRUITS.length)] : EMOJI[type],
        x: x ?? 0.1 + Math.random() * 0.8,
        y: -ITEM,
        speed: config.fall * (1 + config.ramp * progress) * (0.92 + Math.random() * 0.16),
        spin: (Math.random() - 0.5) * 3,
        rot: 0,
        shower: showerUntilRef.current > Date.now(),
      };
      itemsRef.current.push(item);
      if (type === 'fruit' || type === 'star') {
        perfectStreakRef.current += 1;
        perfectRef.current += POINTS[type] * comboMultiplier(perfectStreakRef.current);
      }
    };

    const spawn = () => {
      if (doneRef.current) return;
      const progress = Math.min(1, (Date.now() - startRef.current) / totalMs);
      if (showerUntilRef.current <= Date.now()) {
        const r = Math.random();
        let type = 'fruit';
        const heartOk = livesRef.current < config.lives;
        if (r < config.bomb) type = 'bomb';
        else if (r < config.bomb + config.star) type = 'star';
        else if (r < config.bomb + config.star + config.big && bigUntilRef.current < Date.now()) type = 'big';
        else if (heartOk && r < config.bomb + config.star + config.big + config.heart) type = 'heart';
        addItem(type);
      }
      timer = setTimeout(spawn, config.spawnMs * (1 - 0.3 * progress));
    };

    // Fruit Shower: a short burst of fruit only, in a gentle left-right sweep.
    const shower = () => {
      if (doneRef.current) return;
      showerUntilRef.current = Date.now() + SHOWER_MS;
      cbRef.current.playReveal?.();
      showBanner(tc.shower, 'shower', 1400);
      let i = 0;
      const n = Math.floor(SHOWER_MS / SHOWER_SPAWN_MS);
      const start = Math.random() < 0.5 ? 0.15 : 0.85;
      const dir = start < 0.5 ? 1 : -1;
      const drop = () => {
        if (doneRef.current || i >= n) return;
        const x = start + dir * (i / n) * 0.7 + (Math.random() - 0.5) * 0.08;
        addItem('fruit', Math.max(0.08, Math.min(0.92, x)));
        i += 1;
        later(drop, SHOWER_SPAWN_MS);
      };
      drop();
      showerTimer = setTimeout(shower, config.showerEveryMs);
    };

    timer = setTimeout(spawn, 300);
    showerTimer = setTimeout(shower, config.showerEveryMs);
    return () => { clearTimeout(timer); clearTimeout(showerTimer); };
  }, [countingDown, config, later, showBanner, tc.shower]);

  // ── Motion + catching ─────────────────────────────────────────────
  useEffect(() => {
    let last = null;
    function tick(ts) {
      if (doneRef.current) return;
      const dt = last ? Math.min((ts - last) / 16.67, 3) : 1;
      last = ts;
      const area = areaRef.current;
      if (!area) { rafRef.current = requestAnimationFrame(tick); return; }
      const areaH = area.clientHeight;
      const areaW = area.clientWidth;
      const now = Date.now();
      const basketW = config.basketWidth * (bigUntilRef.current > now ? BIG_FACTOR : 1);
      const bx = basketXRef.current * areaW;
      const rimY = areaH - GROUND_H - BASKET_H + 10; // top of the basket opening
      const groundY = areaH - GROUND_H + 6;
      const cb = cbRef.current;

      let scoreChanged = false;
      let livesChanged = false;
      const survivors = [];

      const breakStreak = () => { streakRef.current = 0; };
      const loseLife = () => {
        livesRef.current -= 1;
        livesChanged = true;
        setHurt(h => h + 1);
        cb.playFail();
      };

      for (const item of itemsRef.current) {
        const prevBottom = item.y + ITEM;
        item.y += item.speed * dt;
        item.rot += item.spin * dt;
        const bottom = item.y + ITEM;
        const cx = item.x * areaW;

        // Crossed the basket rim this frame, within the basket's width.
        if (prevBottom < rimY + 18 && bottom >= rimY && Math.abs(cx - bx) <= basketW / 2 + ITEM * 0.3) {
          setCatchPulse(p => p + 1);
          if (item.type === 'fruit' || item.type === 'star') {
            streakRef.current += 1;
            const m = comboMultiplier(streakRef.current);
            const gained = POINTS[item.type] * m;
            scoreRef.current += gained;
            scoreChanged = true;
            cb.playSuccess();
            addEffect({ type: 'text', x: cx, y: rimY - 10, text: `+${gained}`, tone: item.type === 'star' ? 'gold' : m > 1 ? `x${m}` : 'good' }, 900);
            if (m > comboMultiplier(streakRef.current - 1)) showBanner(`${tc.combo} x${m}!`, `x${m}`);
          } else if (item.type === 'heart') {
            livesRef.current = Math.min(config.lives, livesRef.current + 1);
            livesChanged = true;
            cb.playSuccess();
            addEffect({ type: 'text', x: cx, y: rimY - 10, text: '+❤️', tone: 'good' }, 900);
          } else if (item.type === 'big') {
            bigUntilRef.current = Date.now() + BIG_MS;
            cb.playReveal?.();
            showBanner(tc.bigBasket, 'big', 1300);
          } else if (item.type === 'bomb') {
            breakStreak();
            addEffect({ type: 'boom', x: cx, y: rimY }, 600);
            addEffect({ type: 'text', x: cx, y: rimY - 10, text: '−❤️', tone: 'bad' }, 900);
            loseLife();
          }
          continue;
        }

        if (item.y > groundY - ITEM * 0.4) {
          // Landed on the grass.
          if (item.type === 'fruit') {
            addEffect({ type: 'splat', x: cx, y: groundY }, 700);
            breakStreak();
            if (!item.shower) loseLife(); else cb.playPop?.();
          }
          continue;
        }
        survivors.push(item);
      }
      itemsRef.current = survivors;

      if (scoreChanged) {
        setScore(scoreRef.current);
        cb.reportScore(scoreRef.current);
      }
      setStreak(streakRef.current);
      if (livesChanged) {
        setLives(livesRef.current);
        if (livesRef.current <= 0) {
          // Stop the loop now; end the game a beat later so the last hit is seen.
          doneRef.current = true;
          later(() => { doneRef.current = false; cbRef.current.finish(true); }, 450);
          return;
        }
      }
      forceUpdate(n => (n + 1) % 1e6);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [config, addEffect, showBanner, later, tc.combo, tc.bigBasket]);

  // ── Control track input ───────────────────────────────────────────
  // A dedicated track below the orchard drives the basket so the player's
  // finger never covers the falling fruit.
  useEffect(() => {
    const track = controlRef.current;
    if (!track) return undefined;
    const posFromEvent = (clientX) => {
      const rect = track.getBoundingClientRect();
      return Math.max(0.06, Math.min(0.94, (clientX - rect.left) / rect.width));
    };
    const onDown = (e) => {
      e.preventDefault();
      draggingRef.current = true;
      setMoved(true);
      track.setPointerCapture?.(e.pointerId);
      basketXRef.current = posFromEvent(e.clientX);
    };
    const onMove = (e) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      basketXRef.current = posFromEvent(e.clientX);
    };
    const onUp = (e) => {
      draggingRef.current = false;
      track.releasePointerCapture?.(e.pointerId);
    };
    track.addEventListener('pointerdown', onDown, { passive: false });
    track.addEventListener('pointermove', onMove, { passive: false });
    track.addEventListener('pointerup', onUp);
    track.addEventListener('pointercancel', onUp);
    return () => {
      track.removeEventListener('pointerdown', onDown);
      track.removeEventListener('pointermove', onMove);
      track.removeEventListener('pointerup', onUp);
      track.removeEventListener('pointercancel', onUp);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (countingDown) return;
      if (e.key === 'ArrowLeft')  basketXRef.current = Math.max(0.06, basketXRef.current - 0.06);
      if (e.key === 'ArrowRight') basketXRef.current = Math.min(0.94, basketXRef.current + 0.06);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [countingDown]);

  const tapLeft = useCallback(() => {
    playClick();
    setMoved(true);
    basketXRef.current = Math.max(0.06, basketXRef.current - TAP_STEP);
  }, [playClick]);
  const tapRight = useCallback(() => {
    playClick();
    setMoved(true);
    basketXRef.current = Math.min(0.94, basketXRef.current + TAP_STEP);
  }, [playClick]);

  const now = Date.now();
  const big = bigUntilRef.current > now;
  const basketW = config.basketWidth * (big ? BIG_FACTOR : 1);
  const areaH = areaRef.current?.clientHeight ?? 0;
  const groundY = areaH - GROUND_H + 6;

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
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${tc.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tc.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <div ref={areaRef} className={styles.orchard} role="application" aria-label={tc.ariaArea}>
          <span className={styles.sun} aria-hidden="true" />
          <span className={`${styles.cloud} ${styles.cloudA}`} aria-hidden="true" />
          <span className={`${styles.cloud} ${styles.cloudB}`} aria-hidden="true" />
          <span className={styles.canopy} aria-hidden="true" />
          <span className={styles.ground} aria-hidden="true" />

          {/* Landing shadows: where each item will hit the grass */}
          {areaH > 0 && itemsRef.current.map(item => {
            const k = Math.max(0, Math.min(1, (item.y + ITEM) / groundY));
            return (
              <span
                key={`s${item.id}`}
                className={`${styles.shadow} ${item.type === 'bomb' ? styles.shadowBomb : ''}`}
                style={{ left: `${item.x * 100}%`, top: groundY - 4, transform: `translateX(-50%) scale(${0.35 + 0.65 * k})`, opacity: 0.3 + 0.5 * k }}
                aria-hidden="true"
              />
            );
          })}

          {itemsRef.current.map(item => (
            <span
              key={item.id}
              className={`${styles.item} ${styles[`item_${item.type}`] ?? ''}`}
              style={{ left: `calc(${item.x * 100}% - ${ITEM / 2}px)`, transform: `translateY(${item.y}px) rotate(${item.rot}deg)` }}
              aria-hidden="true"
            >
              {item.emoji}
            </span>
          ))}

          <div
            key={catchPulse}
            className={`${styles.basket} ${catchPulse ? styles.basketCatch : ''} ${big ? styles.basketBig : ''}`}
            style={{ left: `calc(${basketXRef.current * 100}% - ${basketW / 2}px)`, width: basketW, bottom: GROUND_H - 8 }}
            aria-hidden="true"
          >
            <BasketSVG />
          </div>

          {banner && (
            <div key={banner.id} className={`${styles.banner} ${styles[`banner_${banner.tone}`] ?? ''}`}>
              {banner.text}
            </div>
          )}

          {effects.map(fx => {
            if (fx.type === 'text') {
              return (
                <span key={fx.id} className={`${styles.floatText} ${styles[`tone_${fx.tone}`] ?? ''}`} style={{ left: fx.x, top: fx.y }} aria-hidden="true">{fx.text}</span>
              );
            }
            if (fx.type === 'splat') {
              return <span key={fx.id} className={styles.splat} style={{ left: fx.x, top: fx.y }} aria-hidden="true" />;
            }
            return <span key={fx.id} className={styles.boom} style={{ left: fx.x, top: fx.y }} aria-hidden="true">💥</span>;
          })}
        </div>

        <div className={styles.controlRow}>
          <button type="button" className={styles.sideBtn} onPointerDown={tapLeft} aria-label={tc.ariaLeft} tabIndex={-1}>‹</button>
          <div
            ref={controlRef}
            className={styles.controlTrack}
            role="slider"
            aria-label={tc.ariaSlider}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(basketXRef.current * 100)}
            tabIndex={-1}
          >
            {!moved && <span className={styles.controlHint}>{tc.slideHint}</span>}
            <span className={styles.controlThumb} style={{ left: `${basketXRef.current * 100}%` }} aria-hidden="true">🧺</span>
          </div>
          <button type="button" className={styles.sideBtn} onPointerDown={tapRight} aria-label={tc.ariaRight} tabIndex={-1}>›</button>
        </div>

        <div className={styles.legend}>
          <span className={styles.legendItem}><span className={styles.legendIcon}>🍎</span>+1</span>
          <span className={styles.legendItem}><span className={styles.legendIcon}>⭐</span>+3</span>
          <span className={styles.legendItem}><span className={styles.legendIcon}>🧺</span>{tc.bigShort}</span>
          {config.bomb > 0 && (
            <span className={`${styles.legendItem} ${styles.legendBad}`}><span className={styles.legendIcon}>💣</span>{tc.avoid}</span>
          )}
        </div>
      </div>
    </div>
  );
}

CatchGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']).isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playPop:     PropTypes.func,
  playReveal:  PropTypes.func,
};

const TIME_LIMITS = {
  easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds,
  medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds,
  hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds,
};

export function CatchFallingFruit({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tc = t.games['catch-falling-fruit'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'catch-falling-fruit', callbackUrl, onComplete });

  return (
    <GameShell
      startCountdown
      gameId="catch-falling-fruit"
      title={tc.title}
      instructions={difficulty === 'easy' ? tc.instructions : `${tc.instructions} ${tc.instructionsHard}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore, secondsLeft, difficulty: diff, playClick, playSuccess, playFail, playPop, playReveal, countingDown }) => (
        <CatchGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={shellComplete}
          reportScore={reportScore}
          secondsLeft={secondsLeft}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
          playPop={playPop}
          playReveal={playReveal}
        />
      )}
    </GameShell>
  );
}

CatchFallingFruit.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
