import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './QuickMaths.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 10, ops: ['+'],         maxA: 10,  maxB: 10,  timeLimitSeconds: null },
  medium: { rounds: 14, ops: ['+', '-'],    maxA: 20,  maxB: 20,  timeLimitSeconds: 120  },
  hard:   { rounds: 18, ops: ['+', '-', '×'], maxA: 12, maxB: 12, timeLimitSeconds: 90   },
};

function generateQuestion(ops, maxA, maxB) {
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a = Math.floor(Math.random() * maxA) + 1;
  let b = Math.floor(Math.random() * maxB) + 1;

  // For subtraction, ensure non-negative result
  if (op === '-' && b > a) [a, b] = [b, a];

  const answer = op === '+' ? a + b : op === '-' ? a - b : a * b;

  // Build 4 options: correct + 3 plausible wrongs
  const wrongs = new Set();
  const offsets = [1, -1, 2, -2, 3, -3, 4, 5, -4, -5];
  for (const off of offsets) {
    const w = answer + off;
    if (w !== answer && w >= 0) wrongs.add(w);
    if (wrongs.size === 3) break;
  }
  const options = [answer, ...[...wrongs].slice(0, 3)];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { a, b, op, answer, options };
}

function QuickMathsGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [round,    setRound]    = useState(0);
  const [score,    setScore]    = useState(0);
  const [q,        setQ]        = useState(() => generateQuestion(config.ops, config.maxA, config.maxB));
  const [feedback, setFeedback] = useState(null);
  const [picked,   setPicked]   = useState(null);
  const scoreRef = useRef(0);
  const doneRef  = useRef(false);

  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: scoreRef.current, maxScore: config.rounds, completed: false });
    }
  }, [secondsLeft, onComplete, config.rounds]);

  const nextRound = useCallback((newRound, newScore) => {
    if (doneRef.current) return;
    if (newRound >= config.rounds) {
      doneRef.current = true;
      onComplete({ finalScore: newScore, maxScore: config.rounds, completed: true });
      return;
    }
    setRound(newRound);
    setQ(generateQuestion(config.ops, config.maxA, config.maxB));
    setFeedback(null);
    setPicked(null);
  }, [config, onComplete]);

  const handlePick = useCallback((val) => {
    if (feedback || doneRef.current) return;
    playClick();
    setPicked(val);
    const correct = val === q.answer;
    if (correct) { playSuccess(); } else { playFail(); }
    setFeedback(correct ? 'correct' : 'wrong');
    let newScore = scoreRef.current;
    if (correct) {
      newScore += 1;
      scoreRef.current = newScore;
      setScore(newScore);
      reportScore(newScore);
    }
    setTimeout(() => nextRound(round + 1, newScore), 600);
  }, [feedback, q, round, reportScore, nextRound, playClick, playSuccess, playFail]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Round <strong>{round + 1}</strong> / {config.rounds}</span>
        <span className={styles.scoreLabel}>Score: <strong>{score}</strong></span>
      </div>

      <div className={styles.questionCard}>
        <span className={styles.operand}>{q.a}</span>
        <span className={styles.operator}>{q.op}</span>
        <span className={styles.operand}>{q.b}</span>
        <span className={styles.equals}>=</span>
        <span className={styles.blank}>?</span>
      </div>

      <div className={styles.options}>
        {q.options.map((opt, i) => {
          let cls = styles.optBtn;
          if (feedback && opt === q.answer)        cls = `${styles.optBtn} ${styles.optCorrect}`;
          else if (feedback === 'wrong' && opt === picked) cls = `${styles.optBtn} ${styles.optWrong}`;
          return (
            <button key={i} className={cls} onClick={() => handlePick(opt)} disabled={!!feedback} aria-label={String(opt)}>
              {opt}
            </button>
          );
        })}
      </div>

      {feedback === 'correct' && <p className={styles.feedbackOk}>✓ Correct!</p>}
      {feedback === 'wrong'   && <p className={styles.feedbackBad}>✗ Answer: {q.answer}</p>}
    </div>
  );
}

QuickMathsGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function QuickMaths({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'quick-maths', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="quick-maths"
      title="Quick Maths"
      instructions={`Solve each arithmetic problem and tap the correct answer. ${config.rounds} rounds total.`}
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <QuickMathsGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

QuickMaths.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
