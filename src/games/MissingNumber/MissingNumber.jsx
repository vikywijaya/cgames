import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './MissingNumber.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  seqLen: 5,  maxStep: 5,  negatives: false, timeLimitSeconds: null },
  medium: { rounds: 10, seqLen: 6,  maxStep: 10, negatives: false, timeLimitSeconds: 120  },
  hard:   { rounds: 12, seqLen: 7,  maxStep: 15, negatives: true,  timeLimitSeconds: 90   },
};

/**
 * Generate an arithmetic sequence, blank out one position (not the first or last),
 * and produce 4 answer options.
 */
function generateSequence(seqLen, maxStep, negatives) {
  const step = Math.floor(Math.random() * (maxStep - 1)) + 2; // 2..maxStep
  const goDown = negatives && Math.random() < 0.4;
  const actualStep = goDown ? -step : step;
  const start = negatives
    ? Math.floor(Math.random() * 20) - 10
    : Math.floor(Math.random() * 10) + 1;

  const seq = Array.from({ length: seqLen }, (_, i) => start + actualStep * i);

  // Pick a position to blank (not first, not last)
  const blankIdx = Math.floor(Math.random() * (seqLen - 2)) + 1;
  const answer = seq[blankIdx];

  // Build wrong options: answer ± step, answer ± step*2, ensuring unique
  const wrongs = new Set();
  const candidates = [answer + step, answer - step, answer + step * 2, answer - step * 2,
                      answer + 1, answer - 1, answer + step + 1];
  for (const c of candidates) {
    if (c !== answer) wrongs.add(c);
    if (wrongs.size === 3) break;
  }
  const options = [answer, ...[...wrongs].slice(0, 3)];
  // Shuffle options
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  const display = seq.map((n, i) => ({ value: n, blank: i === blankIdx }));
  return { display, answer, options };
}

function MissingNumberGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [round,    setRound]    = useState(0);
  const [score,    setScore]    = useState(0);
  const [puzzle,   setPuzzle]   = useState(() => generateSequence(config.seqLen, config.maxStep, config.negatives));
  const [feedback, setFeedback] = useState(null); // null | 'correct' | 'wrong'
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
    setPuzzle(generateSequence(config.seqLen, config.maxStep, config.negatives));
    setFeedback(null);
    setPicked(null);
  }, [config, onComplete]);

  const handlePick = useCallback((val) => {
    if (feedback || doneRef.current) return;
    playClick();
    setPicked(val);
    const correct = val === puzzle.answer;
    if (correct) { playSuccess(); } else { playFail(); }
    setFeedback(correct ? 'correct' : 'wrong');
    let newScore = scoreRef.current;
    if (correct) {
      newScore += 1;
      scoreRef.current = newScore;
      setScore(newScore);
      reportScore(newScore);
    }
    setTimeout(() => nextRound(round + 1, newScore), 700);
  }, [feedback, puzzle, round, reportScore, nextRound, playClick, playSuccess, playFail]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Round <strong>{round + 1}</strong> / {config.rounds}</span>
        <span className={styles.scoreLabel}>Score: <strong>{score}</strong></span>
      </div>

      <p className={styles.prompt}>What number fills the blank?</p>

      <div className={styles.sequence}>
        {puzzle.display.map((item, i) => (
          <span key={i} className={item.blank ? styles.blank : styles.seqNum}>
            {item.blank ? '?' : item.value}
          </span>
        ))}
      </div>

      <div className={styles.options}>
        {puzzle.options.map((opt, i) => {
          let cls = styles.optBtn;
          if (feedback && opt === puzzle.answer) cls = `${styles.optBtn} ${styles.optCorrect}`;
          else if (feedback === 'wrong' && opt === picked) cls = `${styles.optBtn} ${styles.optWrong}`;
          return (
            <button key={i} className={cls} onClick={() => handlePick(opt)} disabled={!!feedback} aria-label={String(opt)}>
              {opt}
            </button>
          );
        })}
      </div>

      {feedback === 'correct' && <p className={styles.feedbackOk}>✓ Correct!</p>}
      {feedback === 'wrong'   && <p className={styles.feedbackBad}>✗ Answer: {puzzle.answer}</p>}
    </div>
  );
}

MissingNumberGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function MissingNumber({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'missing-number', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="missing-number"
      title="Missing Number"
      instructions={`Find the missing number in each sequence. You have ${config.rounds} rounds.`}
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <MissingNumberGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

MissingNumber.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
