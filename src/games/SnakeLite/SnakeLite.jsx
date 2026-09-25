import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SnakeLite.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * Mechanic overview (tuned for seniors)
 * - Guide the snake to the fruit. Each fruit +1 and grows the snake.
 * - A golden fruit (+3) sometimes appears and fades after a few seconds.
 * - Combo: fruit eaten without a bump raises the multiplier
 *   (x2 at 5, x3 at 10). A bump or a bite resets it.
 * - Mistakes are forgiving and scale with difficulty:
 *     easy   — walls wrap to the other side; biting your tail trims it.
 *     medium — walls bump (−1 life, snake pauses and turns around);
 *              biting your tail trims it.
 *     hard   — walls and tail bites both cost a life.
 *   The game ends when time runs out, or when the lives run out.
 * - Speed starts slow and rises a little with each fruit.
 */
const DIFFICULTY_CONFIG = {
  easy:   { gridSize: 10, startMs: 430, minMs: 300, timeLimitSeconds: 90, lives: null, wrap: true,  biteCostsLife: false, par: 25 },
  medium: { gridSize: 12, startMs: 360, minMs: 240, timeLimitSeconds: 90, lives: 3,    wrap: false, biteCostsLife: false, par: 32 },
  hard:   { gridSize: 13, startMs: 300, minMs: 190, timeLimitSeconds: 90, lives: 3,    wrap: false, biteCostsLife: true,  par: 40 },
};

const SPEEDUP_PER_FRUIT = 6; // ms faster per fruit eaten, down to minMs
const GOLDEN_CHANCE = 0.18;
const GOLDEN_MS = 7000;
const BUMP_PAUSE_MS = 900;
const MIN_LEN = 3;

const DIRS = { UP: { x: 0, y: -1 }, DOWN: { x: 0, y: 1 }, LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 } };
const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
const ANGLE = { RIGHT: 0, DOWN: 90, LEFT: 180, UP: 270 };
const FOOD_EMOJIS = ['🍎', '🍊', '🍇', '🍓', '🍉', '🍑', '🍐', '🍒'];

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

function randomCell(gridSize, exclude = []) {
  const taken = new Set(exclude.map(c => `${c.x},${c.y}`));
  const cells = [];
  for (let y = 0; y < gridSize; y++)
    for (let x = 0; x < gridSize; x++)
      if (!taken.has(`${x},${y}`)) cells.push({ x, y });
  return cells[Math.floor(Math.random() * cells.length)];
}

function startSnake(gridSize) {
  const mid = Math.floor(gridSize / 2);
  return [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
}

let nextId = 0;

function SnakeLiteGame({ countingDown = false, difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail, playPop, playReveal }) {
  const t = useTranslation();
  const ts = t.games['snake-lite'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { gridSize } = config;
  const hasLives = config.lives !== null;

  const snakeRef   = useRef(startSnake(gridSize));
  const prevRef    = useRef(snakeRef.current); // positions before the last step
  const dirRef     = useRef('RIGHT');
  const queueRef   = useRef([]);               // up to 2 buffered turns
  const foodRef    = useRef({ ...randomCell(gridSize, snakeRef.current), kind: 'fruit', emoji: FOOD_EMOJIS[0], id: 0 });
  const scoreRef   = useRef(0);
  const streakRef  = useRef(0);
  const livesRef   = useRef(config.lives ?? 0);
  const eatenRef   = useRef(0);
  const doneRef    = useRef(false);
  const pausedUntilRef = useRef(0);
  const timersRef  = useRef(new Set());
  const snapRef    = useRef(false); // render the next frame without gliding

  const [, setFrame]        = useState(0);
  const [score, setScore]   = useState(0);
  const [lives, setLives]   = useState(config.lives ?? 0);
  const [streak, setStreak] = useState(0);
  const [effects, setEffects] = useState([]);
  const [banner, setBanner] = useState(null);
  const [bump, setBump]     = useState(0);
  const [chomp, setChomp]   = useState(0);
  const [stepMs, setStepMs] = useState(config.startMs);

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
    onComplete({
      finalScore: scoreRef.current,
      maxScore: Math.max(config.par, scoreRef.current),
      completed,
    });
  }, [onComplete, config.par]);

  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) finish(false);
  }, [secondsLeft, finish]);

  const cbRef = useRef({});
  cbRef.current = { finish, playSuccess, playFail, playPop, playReveal, reportScore };

  const addEffect = useCallback((fx, ms) => {
    const id = ++nextId;
    setEffects(prev => [...prev, { ...fx, id }]);
    later(() => setEffects(prev => prev.filter(e => e.id !== id)), ms);
  }, [later]);

  const showBanner = useCallback((text, tone, ms = 1100) => {
    const id = ++nextId;
    setBanner({ id, text, tone });
    later(() => setBanner(b => (b?.id === id ? null : b)), ms);
  }, [later]);

  const placeFood = useCallback(() => {
    const cell = randomCell(gridSize, snakeRef.current);
    if (!cell) return;
    const golden = eatenRef.current > 0 && Math.random() < GOLDEN_CHANCE;
    const id = ++nextId;
    foodRef.current = {
      ...cell,
      id,
      kind: golden ? 'golden' : 'fruit',
      emoji: golden ? '⭐' : FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)],
      until: golden ? Date.now() + GOLDEN_MS : null,
    };
    if (golden) {
      cbRef.current.playReveal?.();
      // Golden fruit fades; replace it with a normal one if not eaten.
      later(() => {
        if (doneRef.current || foodRef.current.id !== id) return;
        const c = randomCell(gridSize, snakeRef.current);
        foodRef.current = { ...c, id: ++nextId, kind: 'fruit', emoji: FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)] };
        setFrame(f => f + 1);
      }, GOLDEN_MS);
    }
  }, [gridSize, later]);

  // ── Input ─────────────────────────────────────────────────────────
  const turn = useCallback((d) => {
    if (doneRef.current) return;
    const q = queueRef.current;
    const last = q.length ? q[q.length - 1] : dirRef.current;
    if (d === last || d === OPPOSITE[last] || q.length >= 2) return;
    q.push(d);
  }, []);

  useEffect(() => {
    const map = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', w: 'UP', s: 'DOWN', a: 'LEFT', d: 'RIGHT' };
    const onKey = (e) => {
      const d = map[e.key];
      if (!d || countingDown) return;
      e.preventDefault();
      turn(d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn, countingDown]);

  // ── Game loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (countingDown) return undefined;
    let timer = null;

    const loseLife = (reason) => {
      const cb = cbRef.current;
      streakRef.current = 0;
      setStreak(0);
      setBump(b => b + 1);
      cb.playFail();
      if (hasLives) {
        livesRef.current -= 1;
        setLives(livesRef.current);
        if (livesRef.current <= 0) {
          doneRef.current = true;
          later(() => { doneRef.current = false; cbRef.current.finish(true); }, 700);
          return true;
        }
      }
      showBanner(reason, 'bad', 900);
      return false;
    };

    const step = () => {
      if (doneRef.current) return;
      const delay = Math.max(config.minMs, config.startMs - eatenRef.current * SPEEDUP_PER_FRUIT);
      if (Date.now() < pausedUntilRef.current) { timer = setTimeout(step, 80); return; }

      if (queueRef.current.length) dirRef.current = queueRef.current.shift();
      const dir = DIRS[dirRef.current];
      const snake = snakeRef.current;
      const head = snake[0];
      let nx = head.x + dir.x;
      let ny = head.y + dir.y;

      const hitsWall = nx < 0 || nx >= gridSize || ny < 0 || ny >= gridSize;
      if (hitsWall) {
        if (config.wrap) {
          nx = (nx + gridSize) % gridSize;
          ny = (ny + gridSize) % gridSize;
        } else {
          // Bump: stay put, turn around to face open space, pause a beat.
          addEffect({ type: 'text', x: head.x, y: head.y, text: hasLives ? '−❤️' : '!', tone: 'bad' }, 900);
          const over = loseLife(ts.ouch);
          if (over) { setFrame(f => f + 1); return; }
          snakeRef.current = [...snake].reverse();
          prevRef.current = snakeRef.current;
          snapRef.current = true;
          const tail = snakeRef.current;
          const d = { x: tail[0].x - tail[1].x, y: tail[0].y - tail[1].y };
          dirRef.current = Object.keys(DIRS).find(k => DIRS[k].x === d.x && DIRS[k].y === d.y) ?? OPPOSITE[dirRef.current];
          queueRef.current = [];
          pausedUntilRef.current = Date.now() + BUMP_PAUSE_MS;
          setFrame(f => f + 1);
          timer = setTimeout(step, delay);
          return;
        }
      }

      const food = foodRef.current;
      const ate = nx === food.x && ny === food.y;
      // The tail moves out of the way this step unless we're growing.
      const body = ate ? snake : snake.slice(0, -1);
      const biteAt = body.findIndex(c => c.x === nx && c.y === ny);

      prevRef.current = snake;
      snapRef.current = false;
      let next = [{ x: nx, y: ny }, ...body];

      if (biteAt !== -1) {
        // Bit its own tail: the bitten part drops off.
        const keep = Math.max(MIN_LEN, biteAt + 1);
        next = next.slice(0, keep);
        addEffect({ type: 'text', x: nx, y: ny, text: config.biteCostsLife ? '−❤️' : '✂️', tone: 'bad' }, 900);
        if (config.biteCostsLife) {
          const over = loseLife(ts.ouch);
          snakeRef.current = next;
          if (over) { setFrame(f => f + 1); return; }
          pausedUntilRef.current = Date.now() + BUMP_PAUSE_MS;
        } else {
          streakRef.current = 0;
          setStreak(0);
          cbRef.current.playPop?.();
          showBanner(ts.bite, 'bad', 900);
        }
      }
      snakeRef.current = next;

      if (ate) {
        const cb = cbRef.current;
        eatenRef.current += 1;
        streakRef.current += 1;
        const m = comboMultiplier(streakRef.current);
        const gained = (food.kind === 'golden' ? 3 : 1) * m;
        scoreRef.current += gained;
        setScore(scoreRef.current);
        setStreak(streakRef.current);
        setChomp(c => c + 1);
        cb.reportScore(scoreRef.current);
        cb.playSuccess();
        addEffect({ type: 'text', x: nx, y: ny, text: `+${gained}`, tone: food.kind === 'golden' ? 'gold' : m > 1 ? `x${m}` : 'good' }, 900);
        if (m > comboMultiplier(streakRef.current - 1)) showBanner(`${ts.combo} x${m}!`, `x${m}`);
        placeFood();
      }

      setStepMs(delay);
      setFrame(f => f + 1);
      timer = setTimeout(step, delay);
    };

    timer = setTimeout(step, config.startMs);
    return () => clearTimeout(timer);
  }, [countingDown, config, gridSize, hasLives, addEffect, later, placeFood, showBanner, ts.ouch, ts.bite, ts.combo]);

  // Lock page scroll so swipes turn the snake instead of scrolling.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, []);

  const touchStart = useRef(null);
  const boardRef = useRef(null);
  // Shake the board on a bump (no remount, so the touch listener stays).
  useEffect(() => {
    if (!bump || !boardRef.current?.animate) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    boardRef.current.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }],
      { duration: 360, easing: 'ease-out' },
    );
  }, [bump]);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return undefined;
    const onMove = (e) => { if (touchStart.current) e.preventDefault(); };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, []);
  const onTouchStart = (e) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'RIGHT' : 'LEFT') : (dy > 0 ? 'DOWN' : 'UP'));
  };

  const press = (d) => { playClick(); turn(d); };

  // ── Render ────────────────────────────────────────────────────────
  const snake = snakeRef.current;
  const prev = prevRef.current;
  const food = foodRef.current;
  const cell = 100 / gridSize;
  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;
  const len = snake.length;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          {hasLives && (
            <span key={bump} className={`${styles.livesRow} ${bump ? styles.livesHurt : ''}`} aria-label={`${lives} ${t.common.livesRemaining}`}>
              {Array.from({ length: config.lives }).map((_, i) => (
                <span key={i} className={i < lives ? styles.heartFull : styles.heartEmpty} aria-hidden="true">❤️</span>
              ))}
            </span>
          )}
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${ts.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{ts.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <div
          ref={boardRef}
          className={`${styles.board} ${config.wrap ? styles.boardWrap : ''}`}
          style={{ '--size': gridSize, '--step': `${stepMs}ms` }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          role="application"
          aria-label={ts.ariaBoard}
        >
          {/* Food */}
          <span
            key={food.id}
            className={`${styles.food} ${food.kind === 'golden' ? styles.foodGolden : ''}`}
            style={{ left: `${food.x * cell}%`, top: `${food.y * cell}%`, width: `${cell}%`, height: `${cell}%`, '--life': `${GOLDEN_MS}ms` }}
            aria-hidden="true"
          >
            {food.kind === 'golden' && <span className={styles.foodTimer} />}
            <span className={styles.foodEmoji}>{food.emoji}</span>
          </span>

          {/* Snake: tail first so the head draws on top */}
          {snake.slice().reverse().map((c, ri) => {
            const i = len - 1 - ri;
            const p = prev[i] ?? c;
            const jumped = snapRef.current || Math.abs(p.x - c.x) > 1 || Math.abs(p.y - c.y) > 1; // wrapped or turned around
            const isHead = i === 0;
            const shade = len > 1 ? i / (len - 1) : 0;
            return (
              <span
                key={i}
                className={`${styles.seg} ${isHead ? styles.head : ''} ${jumped ? styles.noAnim : ''}`}
                style={{
                  width: `${cell}%`,
                  height: `${cell}%`,
                  transform: `translate(${c.x * 100}%, ${c.y * 100}%)`,
                  '--shade': shade,
                }}
                aria-hidden="true"
              >
                {isHead ? (
                  <span key={chomp} className={`${styles.face} ${chomp ? styles.faceChomp : ''}`} style={{ transform: `rotate(${ANGLE[dirRef.current]}deg)` }}>
                    <span className={`${styles.eye} ${styles.eyeA}`} />
                    <span className={`${styles.eye} ${styles.eyeB}`} />
                    <span className={styles.tongue} />
                  </span>
                ) : <span className={styles.segInner} />}
              </span>
            );
          })}

          {effects.map(fx => (
            <span
              key={fx.id}
              className={`${styles.floatText} ${styles[`tone_${fx.tone}`] ?? ''}`}
              style={{ left: `${(fx.x + 0.5) * cell}%`, top: `${(fx.y + 0.5) * cell}%` }}
              aria-hidden="true"
            >
              {fx.text}
            </span>
          ))}

          {banner && (
            <div key={banner.id} className={`${styles.banner} ${styles[`banner_${banner.tone}`] ?? ''}`}>{banner.text}</div>
          )}
        </div>

        <div className={styles.dpad} aria-label={ts.ariaControls}>
          <button type="button" className={`${styles.dpadBtn} ${styles.dUp}`} onPointerDown={() => press('UP')} aria-label={ts.up}>▲</button>
          <button type="button" className={`${styles.dpadBtn} ${styles.dLeft}`} onPointerDown={() => press('LEFT')} aria-label={ts.left}>◀</button>
          <span className={styles.dpadCenter} aria-hidden="true">🐍</span>
          <button type="button" className={`${styles.dpadBtn} ${styles.dRight}`} onPointerDown={() => press('RIGHT')} aria-label={ts.right}>▶</button>
          <button type="button" className={`${styles.dpadBtn} ${styles.dDown}`} onPointerDown={() => press('DOWN')} aria-label={ts.down}>▼</button>
        </div>
      </div>
    </div>
  );
}

SnakeLiteGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
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

export function SnakeLite({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const ts = t.games['snake-lite'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'snake-lite', callbackUrl, onComplete });
  const rules = { easy: ts.rulesEasy, medium: ts.rulesMedium, hard: ts.rulesHard }[difficulty] ?? ts.rulesEasy;
  return (
    <GameShell
      startCountdown
      gameId="snake-lite"
      title={ts.title}
      instructions={`${ts.instructions} ${rules}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playClick, playSuccess, playFail, playPop, playReveal, countingDown }) => (
        <SnakeLiteGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={sc}
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

SnakeLite.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
