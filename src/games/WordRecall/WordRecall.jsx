import { useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { Button } from '../../components/Button/Button';
import { ProgressBar } from '../../components/ProgressBar/ProgressBar';
import { useGameCallback } from '../../hooks/useGameCallback';
import { useCountdown } from '../../hooks/useCountdown';
import { GAME_IDS } from '../../utils/gameIds';
import { useWordRecall } from './useWordRecall';
import styles from './WordRecall.module.css';
import { useTranslation } from '../../i18n/useTranslation';


function WordRecallGame({ difficulty, onComplete, reportScore, playClick, playSuccess, playFail }) {
  const {
    wordList,
    phase,
    recalled,
    inputValue,
    setInputValue,
    lastResult,
    studySeconds,
    recallSeconds,
    enterRecall,
    submitWord,
    score,
    maxScore,
  } = useWordRecall(difficulty);

  const inputRef = useRef(null);

  // Study countdown — transitions to recall automatically
  const { secondsLeft: studyLeft } = useCountdown({
    seconds: studySeconds,
    active: phase === 'study',
    onExpire: enterRecall,
  });

  // Recall countdown — ends the game
  const { secondsLeft: recallLeft } = useCountdown({
    seconds: recallSeconds,
    active: phase === 'recall',
    onExpire: () => onComplete({ finalScore: score, maxScore, completed: true }),
  });

  useEffect(() => { reportScore?.(score); }, [score, reportScore]);

  useEffect(() => {
    if (lastResult === 'found') { playSuccess(); }
    else if (lastResult === 'notFound') { playFail(); }
  }, [lastResult, playSuccess, playFail]);

  useEffect(() => {
    if (phase === 'recall') inputRef.current?.focus();
  }, [phase]);

  // End game if all words recalled
  useEffect(() => {
    if (phase === 'recall' && recalled.size === maxScore) {
      onComplete({ finalScore: score, maxScore, completed: true });
    }
  }, [recalled.size, maxScore, phase, score, onComplete]);

  const feedbackClass =
    lastResult === 'found'
      ? styles.feedbackFound
      : lastResult === 'already'
      ? styles.feedbackAlready
      : styles.feedbackNotFound;

  const feedbackText =
    lastResult === 'found'
      ? 'Correct!'
      : lastResult === 'already'
      ? 'Already recalled'
      : lastResult === 'notFound'
      ? 'Not on the list'
      : '';

  const isUrgentRecall = (recallLeft ?? recallSeconds) <= 10;

  return (
    <div className={styles.container}>

      {/* ── STUDY PHASE ── */}
      {phase === 'study' && (
        <div className={styles.studyPhase}>
          <div className={styles.studyHeader}>
            <div className={styles.studyHeaderText}>
              <span className={styles.studyHeaderLabel}>Study Phase</span>
              <span className={styles.studyHeaderSub}>Memorise all the words</span>
            </div>
            <div className={styles.studyTimerBadge} aria-live="polite" aria-label={`${studyLeft} seconds remaining`}>
              <span className={styles.studyTimerNum}>{studyLeft ?? studySeconds}</span>
              <span className={styles.studyTimerUnit}>s</span>
            </div>
          </div>

          <div className={styles.timerBar}>
            <ProgressBar
              value={studyLeft ?? studySeconds}
              max={studySeconds}
              ariaLabel="Study time remaining"
              colorVariant={(studyLeft ?? studySeconds) <= 5 ? 'warning' : 'default'}
            />
          </div>

          <ul className={styles.wordGrid} role="list" aria-label="Words to remember">
            {wordList.map((word, i) => (
              <li key={word} className={styles.wordChip} style={{ '--idx': i }} role="listitem">
                {word}
              </li>
            ))}
          </ul>

          <Button size="large" onClick={enterRecall} className={styles.readyBtn}>
            I&apos;m ready!
          </Button>
        </div>
      )}

      {/* ── RECALL PHASE ── */}
      {phase === 'recall' && (
        <div className={styles.recallPhase}>

          <div className={styles.recallHeader}>
            <div className={styles.recallScorePill} aria-live="polite" aria-atomic="true">
              <span className={styles.recallScoreNum}>{recalled.size}</span>
              <span className={styles.recallScoreMax}>/ {maxScore} words</span>
            </div>
            <div className={`${styles.recallTimerPill} ${isUrgentRecall ? styles.recallTimerPillUrgent : ''}`}
              role="timer" aria-live="off" aria-label={`${recallLeft} seconds remaining`}>
              <span className={`${styles.recallTimerNum} ${isUrgentRecall ? styles.recallTimerNumUrgent : ''}`}>
                {recallLeft ?? recallSeconds}s
              </span>
              <span className={styles.recallTimerLabel}>left</span>
            </div>
          </div>

          <div className={styles.inputCard}>
            <div className={styles.inputRow}>
              <input
                ref={inputRef}
                type="text"
                className={styles.recallInput}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { playClick(); submitWord(); } }}
                placeholder="Type a word and press Enter…"
                aria-label="Type a word you remember"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <Button size="large" onClick={() => { playClick(); submitWord(); }} disabled={!inputValue.trim()} className={styles.submitBtn}>
                Submit
              </Button>
            </div>
            {lastResult && (
              <div className={`${styles.feedbackRow} ${feedbackClass}`} aria-live="polite" aria-atomic="true">
                <span className={styles.feedbackDot} />
                <span className={styles.feedbackMsg}>{feedbackText}</span>
              </div>
            )}
          </div>

          {recalled.size > 0 && (
            <div className={styles.recalledSection}>
              <span className={styles.recalledHeader}>Recalled so far</span>
              <ul className={styles.recalledGrid} role="list" aria-label="Words recalled so far">
                {[...recalled].map((word) => (
                  <li key={word} className={styles.recalledWord}>{word}</li>
                ))}
              </ul>
            </div>
          )}

          <Button variant="secondary" onClick={() => onComplete({ finalScore: score, maxScore, completed: true })} className={styles.finishBtn}>
            Finish
          </Button>
        </div>
      )}
    </div>
  );
}

WordRecallGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function WordRecall({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete } = useGameCallback({
    memberId,
    gameId: GAME_IDS.WORD_RECALL,
    callbackUrl,
    onComplete,
  });

  return (
    <GameShell
      gameId={GAME_IDS.WORD_RECALL}
      title={t.games['word-recall'].title}
      instructions={t.games['word-recall'].instructions}
      difficulty={difficulty}
      timeLimits={{ easy: null, medium: null, hard: null }}
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore, difficulty: diff, playClick, playSuccess, playFail }) => (
        <WordRecallGame difficulty={diff} onComplete={shellComplete} reportScore={reportScore} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

WordRecall.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
