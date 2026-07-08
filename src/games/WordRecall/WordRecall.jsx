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
  const t = useTranslation();
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
    enterReview,
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

  // Recall countdown — ends the recall phase and shows the review
  const { secondsLeft: recallLeft } = useCountdown({
    seconds: recallSeconds,
    active: phase === 'recall',
    onExpire: enterReview,
  });

  useEffect(() => { reportScore?.(score); }, [score, reportScore]);

  useEffect(() => {
    if (lastResult === 'found') { playSuccess(); }
    else if (lastResult === 'notFound') { playFail(); }
  }, [lastResult, playSuccess, playFail]);

  useEffect(() => {
    if (phase === 'recall') inputRef.current?.focus();
  }, [phase]);

  // End recall phase if all words recalled — show the review
  useEffect(() => {
    if (phase === 'recall' && recalled.size === maxScore) {
      enterReview();
    }
  }, [recalled.size, maxScore, phase, enterReview]);

  const feedbackClass =
    lastResult === 'found'
      ? styles.feedbackFound
      : lastResult === 'already'
      ? styles.feedbackAlready
      : styles.feedbackNotFound;

  const feedbackText =
    lastResult === 'found'
      ? t.common.correct
      : lastResult === 'already'
      ? t.common.alreadyRecalled
      : lastResult === 'notFound'
      ? t.common.notOnList
      : '';

  const isUrgentRecall = (recallLeft ?? recallSeconds) <= 10;

  return (
    <div className={styles.container}>

      {/* ── STUDY PHASE ── */}
      {phase === 'study' && (
        <div className={styles.studyPhase}>
          <div className={styles.infoHeader}>
            <div className={styles.infoHeaderText}>
              <span className={styles.infoHeaderLabel}>{t.common.studyPhase}</span>
              <span className={styles.infoHeaderSub}>{t.common.memoriseWords}</span>
            </div>
            <div className={styles.infoBadge} aria-live="polite" aria-label={`${studyLeft} seconds remaining`}>
              <span className={styles.infoBadgeNum}>{studyLeft ?? studySeconds}</span>
              <span className={styles.infoBadgeSub}>s</span>
            </div>
          </div>

          <div className={styles.playArea}>
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
              {t.common.imReady}
            </Button>
          </div>
        </div>
      )}

      {/* ── RECALL PHASE ── */}
      {phase === 'recall' && (
        <div className={styles.recallPhase}>

          <div className={styles.infoHeader}>
            <div className={styles.infoHeaderText} aria-live="polite" aria-atomic="true">
              <span className={styles.infoHeaderSub}>{recalled.size} / {maxScore} {t.common.words}</span>
            </div>
            <div className={`${styles.infoBadge} ${isUrgentRecall ? styles.infoBadgeUrgent : ''}`}
              role="timer" aria-live="off" aria-label={`${recallLeft} seconds remaining`}>
              <span className={`${styles.infoBadgeNum} ${isUrgentRecall ? styles.infoBadgeNumUrgent : ''}`}>
                {recallLeft ?? recallSeconds}
              </span>
              <span className={styles.infoBadgeSub}>s</span>
            </div>
          </div>

          <div className={styles.playArea}>
            <div className={styles.inputCard}>
              <div className={styles.inputRow}>
                <input
                  ref={inputRef}
                  type="text"
                  className={styles.recallInput}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { playClick(); submitWord(); } }}
                  placeholder={t.games['word-recall'].placeholder}
                  aria-label="Type a word you remember"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <Button size="large" onClick={() => { playClick(); submitWord(); }} disabled={!inputValue.trim()} className={styles.submitBtn}>
                  {t.common.submit}
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
                <span className={styles.recalledHeader}>{t.common.recalledSoFar}</span>
                <ul className={styles.recalledGrid} role="list" aria-label="Words recalled so far">
                  {[...recalled].map((word) => (
                    <li key={word} className={styles.recalledWord}>{word}</li>
                  ))}
                </ul>
              </div>
            )}

            <Button variant="secondary" onClick={enterReview} className={styles.finishBtn}>
              {t.common.finish}
            </Button>
          </div>
        </div>
      )}

      {/* ── REVIEW PHASE ── */}
      {phase === 'review' && (
        <div className={styles.reviewPhase}>
          <div className={styles.reviewHeader}>
            <span className={styles.reviewScoreNum}>{score}</span>
            <span className={styles.reviewScoreMax}>/ {maxScore} {t.common.words}</span>
          </div>

          <ul className={styles.reviewGrid} role="list" aria-label="Word review">
            {wordList.map((word) => {
              const got = recalled.has(word);
              return (
                <li
                  key={word}
                  className={`${styles.reviewWord} ${got ? styles.reviewWordFound : styles.reviewWordMissed}`}
                >
                  <span className={styles.reviewMark} aria-hidden="true">{got ? '✓' : '✗'}</span>
                  <span className={styles.reviewWordText}>{word}</span>
                </li>
              );
            })}
          </ul>

          <Button size="large" onClick={() => onComplete({ finalScore: score, maxScore, completed: true })} className={styles.finishBtn}>
            {t.common.finish}
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
      flushTop
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
