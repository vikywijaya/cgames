import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './CatchFallingFruit.module.css';

// ── Difficulty config ──────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
  easy:   { fallSpeed: 2,   spawnMs: 2000, timeLimitSeconds: null, lives: 5, basketWidth: 110 },
  medium: { fallSpeed: 3.5, spawnMs: 1400, timeLimitSeconds: 120,  lives: 3, basketWidth: 90  },
  hard:   { fallSpeed: 5,   spawnMs: 900,  timeLimitSeconds: 90,   lives: 3, basketWidth: 70  },
};

const FRUITS = ['🍎', '🍊', '🍋', '🍇', '🍓', '🍑', '🍒', '🥝'];
const FRUIT_SIZE = 40; // px
const BASKET_H   = 44; // px
const TAP_STEP   = 0.18; // how far a side-button tap moves the basket (normalised)

let nextId = 0;

// ── Inner game ─────────────────────────────────────────────────────
function CatchGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const areaRef       = useRef(null);
  const rafRef        = useRef(null);
  const fruitsRef     = useRef([]);
  const basketXRef    = useRef(0.5);   // 0–1 normalised centre of basket
  const scoreRef      = useRef(0);
  const livesRef      = useRef(config.lives);
  const spawnRef      = useRef(null);
  const doneRef       = useRef(false);
  const totalRef      = useRef(0);

  const [displayScore, setDisplayScore] = useState(0);
  const [displayLives, setDisplayLives] = useState(config.lives);
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
      fruitsRef.current.push({
        id:    nextId++,
        emoji: FRUITS[Math.floor(Math.random() * FRUITS.length)],
        x:     Math.random() * 0.8 + 0.1,
        y:     -FRUIT_SIZE,
      });
      totalRef.current += 1;
    }, config.spawnMs);
    return () => clearInterval(spawnRef.current);
  }, [config.spawnMs]);

  // ── rAF loop ─────────────────────────────────────────────────────
  useEffect(() => {
    let lastTime = null;
    function tick(ts) {
      if (doneRef.current) return;
      const dt = lastTime ? Math.min((ts - lastTime) / 16.67, 3) : 1;
      lastTime = ts;

      const area = areaRef.current;
      if (!area) { rafRef.current = requestAnimationFrame(tick); return; }
      const areaH = area.clientHeight;
      const areaW = area.clientWidth;
      const bx    = basketXRef.current * areaW;
      const catchBottom = areaH - BASKET_H - 4;
      const catchTop    = catchBottom - FRUIT_SIZE;
      const halfBasket  = config.basketWidth / 2 + FRUIT_SIZE / 2;

      let scoreChanged = false;
      let livesChanged = false;
      const survived = [];

      for (const fruit of fruitsRef.current) {
        fruit.y += config.fallSpeed * dt;

        // Catch zone check
        if (fruit.y >= catchTop && fruit.y <= catchBottom + config.fallSpeed * dt + 4) {
          if (Math.abs(fruit.x * areaW - bx) <= halfBasket) {
            playSuccess();
            scoreRef.current += 1;
            scoreChanged = true;
            continue;
          }
        }

        // Missed — past bottom
        if (fruit.y > areaH) {
          playFail();
          livesRef.current -= 1;
          livesChanged = true;
          continue;
        }

        survived.push(fruit);
      }
      fruitsRef.current = survived;

      if (scoreChanged) {
        setDisplayScore(scoreRef.current);
        reportScore(scoreRef.current);
      }
      if (livesChanged) {
        setDisplayLives(livesRef.current);
        if (livesRef.current <= 0) { finish(true); return; }
      }

      forceUpdate(n => n + 1);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [config.fallSpeed, config.basketWidth, finish, reportScore, playSuccess, playFail]);

  // ── Touch input: attach with { passive: false } so preventDefault works ──
  // This is the critical fix — React's onTouchMove uses passive listeners
  // which silently ignore preventDefault(), letting the page scroll instead.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    function getX(e) {
      const rect = area.getBoundingClientRect();
      const touch = e.touches[0] ?? e.changedTouches[0];
      return Math.max(0.05, Math.min(0.95, (touch.clientX - rect.left) / rect.width));
    }

    function onTouchStart(e) {
      e.preventDefault();
      basketXRef.current = getX(e);
    }
    function onTouchMove(e) {
      e.preventDefault();
      basketXRef.current = getX(e);
    }

    area.addEventListener('touchstart', onTouchStart, { passive: false });
    area.addEventListener('touchmove',  onTouchMove,  { passive: false });
    return () => {
      area.removeEventListener('touchstart', onTouchStart);
      area.removeEventListener('touchmove',  onTouchMove);
    };
  }, []);

  // ── Mouse input ───────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    basketXRef.current = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
  }, []);

  // ── Keyboard input ────────────────────────────────────────────────
  useEffect(() => {
    const step = 0.06;
    function onKey(e) {
      if (e.key === 'ArrowLeft')  basketXRef.current = Math.max(0.05, basketXRef.current - step);
      if (e.key === 'ArrowRight') basketXRef.current = Math.min(0.95, basketXRef.current + step);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Side-button tap handler (pointer, not touch, avoids duplicate events) ──
  const tapLeft  = useCallback(() => {
    playClick();
    basketXRef.current = Math.max(0.05, basketXRef.current - TAP_STEP);
  }, [playClick]);
  const tapRight = useCallback(() => {
    playClick();
    basketXRef.current = Math.min(0.95, basketXRef.current + TAP_STEP);
  }, [playClick]);

  return (
    <div className={styles.wrapper}>
      {/* Lives + score */}
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

      {/* Controls row: left button | game area | right button */}
      <div className={styles.gameRow}>
        <button
          className={`${styles.sideBtn} ${styles.sideBtnLeft}`}
          onPointerDown={tapLeft}
          aria-label="Move basket left"
          tabIndex={-1}
        >‹</button>

        <div
          ref={areaRef}
          className={styles.gameArea}
          onMouseMove={handleMouseMove}
          role="application"
          aria-label="Catch the fruit game area"
        >
          {/* Falling fruit */}
          {fruitsRef.current.map(fruit => (
            <span
              key={fruit.id}
              className={styles.fruit}
              style={{ left: `calc(${fruit.x * 100}% - ${FRUIT_SIZE / 2}px)`, top: fruit.y }}
              aria-hidden="true"
            >
              {fruit.emoji}
            </span>
          ))}

          {/* Basket */}
          <div
            className={styles.basket}
            style={{
              left:  `calc(${basketXRef.current * 100}% - ${config.basketWidth / 2}px)`,
              width: config.basketWidth,
            }}
            aria-hidden="true"
          >
            🧺
          </div>
        </div>

        <button
          className={`${styles.sideBtn} ${styles.sideBtnRight}`}
          onPointerDown={tapRight}
          aria-label="Move basket right"
          tabIndex={-1}
        >›</button>
      </div>

      <p className={styles.hint}>Slide your finger across the game area to move the basket</p>
    </div>
  );
}

CatchGame.propTypes = {
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']).isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

// ── Outer wrapper ──────────────────────────────────────────────────
export function CatchFallingFruit({
  memberId,
  difficulty = 'easy',
  onComplete,
  callbackUrl,
  onBack,
  musicMuted,
  onToggleMusic,
}) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'catch-falling-fruit', callbackUrl, onComplete });

  const instructions = (
    <>
      <p>Fruit will fall from the sky — catch them in the basket!</p>
      <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 1.8 }}>
        <li><strong>Touch:</strong> slide your finger across the game area</li>
        <li><strong>Buttons:</strong> tap ‹ › on either side to jump the basket</li>
        <li><strong>Keyboard:</strong> ← → arrow keys</li>
      </ul>
      <p style={{ marginTop: 8 }}>
        You have {config.lives === 5 ? '❤️❤️❤️❤️❤️' : '❤️❤️❤️'} lives.
        Miss a fruit and lose one!
      </p>
    </>
  );

  return (
    <GameShell
      gameId="catch-falling-fruit"
      title="Catch the Falling Fruit"
      instructions={instructions}
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <CatchGame
          difficulty={difficulty}
          onComplete={shellComplete}
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

CatchFallingFruit.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
