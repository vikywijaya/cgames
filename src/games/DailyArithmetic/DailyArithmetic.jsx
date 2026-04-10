import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { useGameCallback } from '../../hooks/useGameCallback';
import { GAME_IDS } from '../../utils/gameIds';
import { useDailyArithmetic } from './useDailyArithmetic';
import styles from './DailyArithmetic.module.css';
import { useTranslation } from '../../i18n/useTranslation';


function ArithmeticGame({ difficulty, onComplete, reportScore, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const {
    question,
    currentIndex,
    totalQuestions,
    selectedChoice,
    feedback,
    score,
    maxScore,
    done,
    selectChoice,
  } = useDailyArithmetic(difficulty);

  const prevFeedbackRef = useRef(null);

  // Play sound when feedback changes
  useEffect(() => {
    if (feedback && feedback !== prevFeedbackRef.current) {
      if (feedback === 'correct') { playSuccess(); }
      else if (feedback === 'wrong') { playFail(); }
    }
    prevFeedbackRef.current = feedback;
  }, [feedback, playSuccess, playFail]);

  // Keep HUD score in sync
  useEffect(() => { reportScore?.(score); }, [score, reportScore]);

  // Trigger game completion
  useEffect(() => {
    if (done) {
      onComplete({ finalScore: score, maxScore, completed: true });
    }
  }, [done, score, maxScore, onComplete]);

  return (
    <div className={styles.container}>
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderLabel}>{t.games['daily-arithmetic'].label}</span>
          <span className={styles.infoHeaderSub}>{t.common.question} {currentIndex + 1} {t.common.of} {totalQuestions}</span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>/ {totalQuestions}</span>
        </div>
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

      <div className={styles.choicesGrid} role="group" aria-label="Answer choices">
        {question.choices.map((choice) => {
          const isSelected = selectedChoice === choice;
          const choiceClass = isSelected
            ? feedback === 'correct'
              ? styles.choiceCorrect
              : styles.choiceWrong
            : feedback !== null && choice === question.answer
            ? styles.choiceCorrect
            : styles.choiceDefault;

          return (
            <button
              key={choice}
              className={`${styles.choiceBtn} ${choiceClass}`}
              onClick={() => { playClick(); selectChoice(choice); }}
              disabled={feedback !== null || done}
              aria-pressed={isSelected}
            >
              {choice}
            </button>
          );
        })}
      </div>

      <p className={styles.scoreDisplay}>
        Score: <strong>{score}</strong> / {maxScore}
      </p>
    </div>
  );
}

ArithmeticGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
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
  const t = useTranslation();
  const { fireComplete } = useGameCallback({
    memberId,
    gameId: GAME_IDS.DAILY_ARITHMETIC,
    callbackUrl,
    onComplete,
  });

  return (
    <GameShell
      gameId={GAME_IDS.DAILY_ARITHMETIC}
      title={t.games['daily-arithmetic'].title}
      instructions={t.games['daily-arithmetic'].instructions}
      difficulty={difficulty}
      timeLimits={{ easy: null, medium: null, hard: null }}
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore, difficulty: diff, playClick, playSuccess, playFail }) => (
        <ArithmeticGame difficulty={diff} onComplete={shellComplete} reportScore={reportScore} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
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
