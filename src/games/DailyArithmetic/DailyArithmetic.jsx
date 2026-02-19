import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { Button } from '../../components/Button/Button';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { useGameCallback } from '../../hooks/useGameCallback';
import { GAME_IDS } from '../../utils/gameIds';
import { useDailyArithmetic } from './useDailyArithmetic';
import styles from './DailyArithmetic.module.css';

const INSTRUCTIONS =
  'Answer each arithmetic question by typing your answer and pressing Enter or clicking "Check". ' +
  'Take your time — there is no time limit. A green tick means correct, a red cross means try the next one!';

function ArithmeticGame({ difficulty, onComplete, reportScore }) {
  const {
    question,
    currentIndex,
    totalQuestions,
    inputValue,
    setInputValue,
    feedback,
    score,
    maxScore,
    done,
    submit,
  } = useDailyArithmetic(difficulty);

  const inputRef = useRef(null);

  // Focus input when question changes
  useEffect(() => {
    if (!done) inputRef.current?.focus();
  }, [currentIndex, done]);

  // Keep HUD score in sync
  useEffect(() => { reportScore?.(score); }, [score, reportScore]);

  // Trigger game completion
  useEffect(() => {
    if (done) {
      onComplete({ finalScore: score, maxScore, completed: true });
    }
  }, [done, score, maxScore, onComplete]);

  const inputClass = feedback === 'correct'
    ? styles.correct
    : feedback === 'wrong'
    ? styles.wrong
    : '';

  return (
    <div className={styles.container}>
      <div className={styles.progress}>
        <ProgressBar
          value={currentIndex}
          max={totalQuestions}
          label={`Question ${currentIndex + 1} of ${totalQuestions}`}
          showValues={false}
          ariaLabel={`Question ${currentIndex + 1} of ${totalQuestions}`}
        />
      </div>

      <div className={styles.questionCard}>
        <p
          className={styles.questionText}
          aria-live="polite"
          aria-label={`What is ${question.a} ${question.op} ${question.b}?`}
        >
          {question.a} {question.op} {question.b} = ?
        </p>
      </div>

      <div className={styles.inputRow}>
        <input
          ref={inputRef}
          type="number"
          className={`${styles.numberInput} ${inputClass}`}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={feedback !== null || done}
          aria-label="Your answer"
          inputMode="numeric"
          autoComplete="off"
        />
        <span className={styles.feedbackIcon} aria-live="polite" aria-atomic="true">
          {feedback === 'correct' ? '✅' : feedback === 'wrong' ? '❌' : null}
        </span>
        <Button
          onClick={submit}
          disabled={feedback !== null || done || inputValue === ''}
        >
          Check
        </Button>
      </div>

      <p className={styles.scoreDisplay}>
        Score: <strong>{score}</strong> / {maxScore}
      </p>
    </div>
  );
}

ArithmeticGame.propTypes = {
  difficulty: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  reportScore: PropTypes.func,
};

export function DailyArithmetic({
  memberId,
  difficulty = 'easy',
  onComplete,
  callbackUrl,
  onBack,
  musicMuted,
  onToggleMusic,
}) {
  const { fireComplete } = useGameCallback({
    memberId,
    gameId: GAME_IDS.DAILY_ARITHMETIC,
    callbackUrl,
    onComplete,
  });

  return (
    <GameShell
      gameId={GAME_IDS.DAILY_ARITHMETIC}
      title="Daily Arithmetic"
      instructions={INSTRUCTIONS}
      difficulty={difficulty}
      timeLimitSeconds={null}
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore }) => (
        <ArithmeticGame difficulty={difficulty} onComplete={shellComplete} reportScore={reportScore} />
      )}
    </GameShell>
  );
}

DailyArithmetic.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
