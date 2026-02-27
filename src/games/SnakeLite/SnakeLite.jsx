import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SnakeLite.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { gridSize: 12, intervalMs: 260, timeLimitSeconds: null },
  medium: { gridSize: 14, intervalMs: 180, timeLimitSeconds: 120  },
  hard:   { gridSize: 16, intervalMs: 120, timeLimitSeconds: 90   },
};

const DIRS = { UP: { x: 0, y: -1 }, DOWN: { x: 0, y: 1 }, LEFT: { x: -1, y: 0 }, RIGHT: { x: 1, y: 0 } };
const OPPOSITE = { UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT' };
const FOOD_EMOJIS = ['🍎','🍊','🍋','🍇','🍓','🍉','🍑','🫐'];

function randomCell(gridSize, exclude = []) {
  const cells = [];
  for (let y = 0; y < gridSize; y++)
    for (let x = 0; x < gridSize; x++)
      if (!exclude.some(c => c.x === x && c.y === y)) cells.push({ x, y });
  return cells[Math.floor(Math.random() * cells.length)];
}

function SnakeLiteGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { gridSize } = config;
  const mid = Math.floor(gridSize / 2);

  const initSnake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }];
  const [snake,    setSnake]    = useState(initSnake);
  const [food,     setFood]     = useState(() => randomCell(gridSize, initSnake));
  const [foodEmoji,setFoodEmoji]= useState(FOOD_EMOJIS[0]);
  const [score,    setScore]    = useState(0);
  const [dead,     setDead]     = useState(false);

  const dirRef   = useRef('RIGHT');
  const nextDir  = useRef('RIGHT');
  const scoreRef = useRef(0);
  const doneRef  = useRef(false);
  const snakeRef = useRef(initSnake);
  const foodRef  = useRef(food);

  const finish = useCallback((completed) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete({ finalScore: scoreRef.current, maxScore: 99, completed });
  }, [onComplete]);

  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) finish(false);
  }, [secondsLeft, finish]);

  // Keyboard control
  useEffect(() => {
    const onKey = (e) => {
      const map = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT' };
      const d = map[e.key];
      if (d && d !== OPPOSITE[dirRef.current]) { nextDir.current = d; e.preventDefault(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Game tick
  useEffect(() => {
    if (dead) return;
    const id = setInterval(() => {
      if (doneRef.current) return;
      dirRef.current = nextDir.current;
      const dir = DIRS[dirRef.current];
      const head = snakeRef.current[0];
      const newHead = { x: head.x + dir.x, y: head.y + dir.y };

      // Wall collision
      if (newHead.x < 0 || newHead.x >= gridSize || newHead.y < 0 || newHead.y >= gridSize) {
        playFail();
        clearInterval(id);
        setDead(true);
        finish(true);
        return;
      }
      // Self collision
      if (snakeRef.current.some(c => c.x === newHead.x && c.y === newHead.y)) {
        playFail();
        clearInterval(id);
        setDead(true);
        finish(true);
        return;
      }

      const ate = newHead.x === foodRef.current.x && newHead.y === foodRef.current.y;
      const newSnake = [newHead, ...snakeRef.current];
      if (!ate) newSnake.pop();

      snakeRef.current = newSnake;
      setSnake([...newSnake]);

      if (ate) {
        playSuccess();
        const ns = scoreRef.current + 1;
        scoreRef.current = ns;
        setScore(ns);
        reportScore(ns);
        const newFood = randomCell(gridSize, newSnake);
        foodRef.current = newFood;
        setFood(newFood);
        setFoodEmoji(FOOD_EMOJIS[Math.floor(Math.random() * FOOD_EMOJIS.length)]);
      }
    }, config.intervalMs);
    return () => clearInterval(id);
  }, [dead, config.intervalMs, gridSize, finish, reportScore, playSuccess, playFail]);

  // Touch swipe
  const touchStart = useRef(null);
  const handleTouchStart = useCallback((e) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const handleTouchEnd = useCallback((e) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
    let d;
    if (Math.abs(dx) > Math.abs(dy)) d = dx > 0 ? 'RIGHT' : 'LEFT';
    else                              d = dy > 0 ? 'DOWN'  : 'UP';
    if (d !== OPPOSITE[dirRef.current]) nextDir.current = d;
    touchStart.current = null;
  }, []);

  const snakeSet = new Set(snake.map(c => `${c.x},${c.y}`));

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.tip}>Swipe or use arrow keys</span>
        <span className={styles.scoreLabel}>🍎 <strong>{score}</strong></span>
      </div>

      <div
        className={styles.grid}
        style={{ '--size': gridSize }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        aria-label="Snake game grid"
      >
        {Array.from({ length: gridSize * gridSize }, (_, i) => {
          const x = i % gridSize;
          const y = Math.floor(i / gridSize);
          const key = `${x},${y}`;
          const isHead = snake[0]?.x === x && snake[0]?.y === y;
          const isBody = !isHead && snakeSet.has(key);
          const isFood = food.x === x && food.y === y;
          let cls = styles.cell;
          if (isHead)  cls = `${styles.cell} ${styles.head}`;
          if (isBody)  cls = `${styles.cell} ${styles.body}`;
          if (isFood)  cls = `${styles.cell} ${styles.food}`;
          return (
            <span key={key} className={cls}>
              {isHead  ? '🟢' : ''}
              {isFood  ? foodEmoji : ''}
            </span>
          );
        })}
      </div>

      <div className={styles.dpad} aria-label="Directional controls">
        <button className={styles.dpadBtn} onClick={() => { playClick(); if ('UP' !== OPPOSITE[dirRef.current]) nextDir.current = 'UP'; }} aria-label="Up">▲</button>
        <div className={styles.dpadRow}>
          <button className={styles.dpadBtn} onClick={() => { playClick(); if ('LEFT' !== OPPOSITE[dirRef.current]) nextDir.current = 'LEFT'; }} aria-label="Left">◀</button>
          <span className={styles.dpadCenter} />
          <button className={styles.dpadBtn} onClick={() => { playClick(); if ('RIGHT' !== OPPOSITE[dirRef.current]) nextDir.current = 'RIGHT'; }} aria-label="Right">▶</button>
        </div>
        <button className={styles.dpadBtn} onClick={() => { playClick(); if ('DOWN' !== OPPOSITE[dirRef.current]) nextDir.current = 'DOWN'; }} aria-label="Down">▼</button>
      </div>
    </div>
  );
}

SnakeLiteGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function SnakeLite({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'snake-lite', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="snake-lite"
      title="Snake"
      instructions="Guide the snake to eat as much fruit as possible. Swipe or use arrow keys to turn — don't hit the walls or yourself!"
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <SnakeLiteGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
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
