import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './ShoppingList.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 6, listSize: 5,  studySec: 10, choicesSize: 8  },
  medium: { rounds: 8, listSize: 8,  studySec: 12, choicesSize: 12 },
  hard:   { rounds: 10,listSize: 11, studySec: 12, choicesSize: 16 },
};

const ALL_ITEMS = [
  { emoji: '🍎', name: 'Apples' },    { emoji: '🍞', name: 'Bread' },
  { emoji: '🥛', name: 'Milk' },      { emoji: '🧀', name: 'Cheese' },
  { emoji: '🥚', name: 'Eggs' },      { emoji: '🍗', name: 'Chicken' },
  { emoji: '🥦', name: 'Broccoli' },  { emoji: '🍅', name: 'Tomatoes' },
  { emoji: '🫙', name: 'Jam' },       { emoji: '🍋', name: 'Lemons' },
  { emoji: '🧅', name: 'Onions' },    { emoji: '🥕', name: 'Carrots' },
  { emoji: '🧈', name: 'Butter' },    { emoji: '🫒', name: 'Olives' },
  { emoji: '🍇', name: 'Grapes' },    { emoji: '🥩', name: 'Beef' },
  { emoji: '🍓', name: 'Strawberries'},{ emoji: '🫐', name: 'Blueberries' },
  { emoji: '🥑', name: 'Avocado' },   { emoji: '🥬', name: 'Lettuce' },
  { emoji: '🍊', name: 'Oranges' },   { emoji: '🥜', name: 'Peanuts' },
  { emoji: '🍕', name: 'Pizza' },     { emoji: '🧃', name: 'Juice' },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRound(listSize, choicesSize) {
  const pool = shuffle(ALL_ITEMS);
  const list = pool.slice(0, listSize);
  const distractors = pool.slice(listSize, choicesSize);
  const choices = shuffle([...list, ...distractors]);
  return { list, choices };
}

// phase: 'study' | 'recall'
function ShoppingListGame({ difficulty, onComplete, reportScore, secondsLeft }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [round,   setRound]   = useState(0);
  const [score,   setScore]   = useState(0);
  const [phase,   setPhase]   = useState('study');
  const [timer,   setTimer]   = useState(config.studySec);
  const [data,    setData]    = useState(() => buildRound(config.listSize, config.choicesSize));
  const [ticked,  setTicked]  = useState(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [result,  setResult]  = useState(null);

  // Study countdown
  useEffect(() => {
    if (phase !== 'study') return;
    if (timer <= 0) { setPhase('recall'); return; }
    const id = setTimeout(() => setTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, timer]);

  // Global time-up
  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: config.rounds, completed: false });
  }, [secondsLeft, score, config.rounds, onComplete]);

  const handleTick = useCallback((name) => {
    if (submitted) return;
    setTicked(prev => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }, [submitted]);

  const handleSubmit = useCallback(() => {
    if (submitted) return;
    setSubmitted(true);
    const listNames = new Set(data.list.map(i => i.name));
    const correct = [...ticked].filter(n => listNames.has(n)).length;
    const missed  = [...listNames].filter(n => !ticked.has(n)).length;
    const wrong   = [...ticked].filter(n => !listNames.has(n)).length;
    const roundScore = Math.max(0, correct - wrong - missed);
    const newScore = score + (roundScore > 0 ? 1 : 0);
    setResult({ correct, missed, wrong, roundScore });
    setScore(newScore);
    reportScore(newScore);

    setTimeout(() => {
      const next = round + 1;
      if (next >= config.rounds) {
        onComplete({ finalScore: newScore, maxScore: config.rounds, completed: true });
      } else {
        setRound(next);
        setPhase('study');
        setTimer(config.studySec);
        setData(buildRound(config.listSize, config.choicesSize));
        setTicked(new Set());
        setSubmitted(false);
        setResult(null);
      }
    }, 1800);
  }, [submitted, ticked, data, score, round, config, reportScore, onComplete]);

  if (phase === 'study') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.meta}>
          <span>Round <strong>{round + 1}</strong> / {config.rounds}</span>
          <span className={styles.countdown}>Memorise in <strong>{timer}s</strong></span>
        </div>
        <p className={styles.prompt}>Remember these items!</p>
        <div className={styles.studyList}>
          {data.list.map((item, i) => (
            <div key={i} className={styles.studyItem}>
              <span>{item.emoji}</span> {item.name}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span>Round <strong>{round + 1}</strong> / {config.rounds}</span>
        <span className={styles.tickCount}>{ticked.size} ticked</span>
      </div>
      <p className={styles.prompt}>Tick everything that was on the list</p>
      <div className={styles.choiceGrid}>
        {data.choices.map((item, i) => {
          const isTicked = ticked.has(item.name);
          const listNames = new Set(data.list.map(x => x.name));
          let cls = styles.choiceBtn;
          if (submitted && isTicked && listNames.has(item.name))  cls = `${styles.choiceBtn} ${styles.choiceCorrect}`;
          if (submitted && isTicked && !listNames.has(item.name)) cls = `${styles.choiceBtn} ${styles.choiceWrong}`;
          if (submitted && !isTicked && listNames.has(item.name)) cls = `${styles.choiceBtn} ${styles.choiceMissed}`;
          return (
            <button key={i} className={cls} onClick={() => handleTick(item.name)} disabled={submitted}>
              <span className={styles.choiceEmoji}>{item.emoji}</span>
              <span className={styles.choiceName}>{item.name}</span>
              {isTicked && <span className={styles.tick}>✓</span>}
            </button>
          );
        })}
      </div>
      {!submitted && (
        <button className={styles.submitBtn} onClick={handleSubmit}>Done</button>
      )}
      {result && (
        <p className={result.roundScore > 0 ? styles.feedbackOk : styles.feedbackBad}>
          {result.correct} correct · {result.missed} missed · {result.wrong} wrong
        </p>
      )}
    </div>
  );
}

ShoppingListGame.propTypes = { difficulty: PropTypes.string.isRequired, onComplete: PropTypes.func.isRequired, reportScore: PropTypes.func.isRequired, secondsLeft: PropTypes.number };

export function ShoppingList({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'shopping-list', callbackUrl, onComplete });
  return (
    <GameShell gameId="shopping-list" title="Shopping List"
      instructions={`Study the shopping list for ${config.studySec} seconds. Then tick every item you remember from the choices shown.`}
      difficulty={difficulty} timeLimitSeconds={null} onGameComplete={fireCallback}
      onBack={onBack} musicMuted={musicMuted} onToggleMusic={onToggleMusic}>
      {({ onComplete: sc, reportScore, secondsLeft }) => (
        <ShoppingListGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} />
      )}
    </GameShell>
  );
}
ShoppingList.propTypes = { memberId: PropTypes.string.isRequired, difficulty: PropTypes.oneOf(['easy','medium','hard']), onComplete: PropTypes.func.isRequired, callbackUrl: PropTypes.string, onBack: PropTypes.func, musicMuted: PropTypes.bool, onToggleMusic: PropTypes.func };
