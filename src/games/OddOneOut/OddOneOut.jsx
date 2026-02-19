import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './OddOneOut.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { questions: 8,  gridSize: 3, timeLimitSeconds: null },
  medium: { questions: 10, gridSize: 4, timeLimitSeconds: 120  },
  hard:   { questions: 12, gridSize: 5, timeLimitSeconds: 90   },
};

// Pools of grouped emoji sets — each array has many similar items, one "odd" category
const SETS = [
  { group: ['🍎','🍊','🍋','🍇','🍓','🍑','🍒','🍉','🥭','🍍'], odd: ['🥕','🥦','🧅','🫛','🥬'] },
  { group: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯'], odd: ['🐟','🦈','🐬','🐙','🦞'] },
  { group: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🛻'], odd: ['✈️','🚀','🚁','🛸','🛩️'] },
  { group: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱'], odd: ['🎻','🥁','🎸','🎺','🎷'] },
  { group: ['🌹','🌷','🌸','💐','🌺','🌻','🌼','🪷','🌝','🍀'], odd: ['🌊','⛰️','🌋','🏔️','🌪️'] },
  { group: ['🍕','🍔','🌮','🌯','🥪','🥙','🧆','🥗','🍜','🍣'], odd: ['🎂','🍰','🍩','🍪','🧁'] },
  { group: ['🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶'], odd: ['🔷','🔸','🔹','🔺','🔻'] },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestion(gridSize) {
  const set = SETS[Math.floor(Math.random() * SETS.length)];
  const total = gridSize * gridSize;
  const majorCount = total - 1;
  const majors = shuffle(set.group).slice(0, majorCount);
  const oddItem = set.odd[Math.floor(Math.random() * set.odd.length)];
  const items = shuffle([...majors, oddItem]);
  const oddIndex = items.indexOf(oddItem);
  return { items, oddIndex };
}

function OddOneOutGame({ difficulty, onComplete, reportScore, secondsLeft }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [qIndex,   setQIndex]   = useState(0);
  const [score,    setScore]    = useState(0);
  const [feedback, setFeedback] = useState(null); // null | { correct: bool, chosen: int }
  const [question, setQuestion] = useState(() => buildQuestion(config.gridSize));

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: config.questions, completed: false });
  }, [secondsLeft, score, config.questions, onComplete]);

  const nextQ = useCallback((newScore) => {
    const next = qIndex + 1;
    if (next >= config.questions) {
      onComplete({ finalScore: newScore, maxScore: config.questions, completed: true });
      return;
    }
    setQIndex(next);
    setFeedback(null);
    setQuestion(buildQuestion(config.gridSize));
  }, [qIndex, config, onComplete]);

  const handleTap = useCallback((idx) => {
    if (feedback) return;
    const correct = idx === question.oddIndex;
    const newScore = correct ? score + 1 : score;
    if (correct) setScore(newScore);
    reportScore(newScore);
    setFeedback({ correct, chosen: idx });
    setTimeout(() => nextQ(newScore), 900);
  }, [feedback, question.oddIndex, score, reportScore, nextQ]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.progress}>
        Question <strong>{qIndex + 1}</strong> / {config.questions}
      </div>

      <p className={styles.prompt}>Tap the one that doesn't belong</p>

      <div
        className={styles.grid}
        style={{ '--cols': config.gridSize }}
        role="application"
        aria-label="Odd one out grid"
      >
        {question.items.map((emoji, i) => {
          let cls = styles.cell;
          if (feedback) {
            if (i === question.oddIndex) cls = `${styles.cell} ${styles.cellCorrect}`;
            else if (i === feedback.chosen && !feedback.correct) cls = `${styles.cell} ${styles.cellWrong}`;
          }
          return (
            <button
              key={i}
              className={cls}
              onClick={() => handleTap(i)}
              disabled={!!feedback}
              aria-label={`Item ${i + 1}: ${emoji}`}
            >
              {emoji}
            </button>
          );
        })}
      </div>

      {feedback && (
        <p className={feedback.correct ? styles.feedbackOk : styles.feedbackBad}>
          {feedback.correct ? '✓ Correct!' : '✗ That was the odd one!'}
        </p>
      )}
    </div>
  );
}

OddOneOutGame.propTypes = {
  difficulty: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
};

export function OddOneOut({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'odd-one-out', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="odd-one-out"
      title="Odd One Out"
      instructions="Look at the grid of emoji and tap the one that doesn't belong with the others. Exercises visual categorisation and attention to detail."
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft }) => (
        <OddOneOutGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} />
      )}
    </GameShell>
  );
}

OddOneOut.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
