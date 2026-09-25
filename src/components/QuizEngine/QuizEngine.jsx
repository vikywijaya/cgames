import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import styles from './QuizEngine.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * QuizEngine — the shared play screen for the four-choice quizzes (flags,
 * capitals, currencies, landmarks).
 *
 * Tuned for seniors:
 * - No clock. After each answer a short line says what was learned
 *   ("Tokyo is the capital of Japan") and the player taps Next when ready.
 * - "Remove 2" help, twice per game: two wrong answers disappear and the
 *   question is then worth 1 point instead of 2.
 * - Combo: correct answers in a row raise the multiplier (x2 at 5, x3 at 10).
 *
 * A quiz supplies makeQuestion(index, usedIds) returning
 *   { id, visual, prompt, options: [{ id, label }], answerId, reveal }
 * where visual/prompt/reveal are nodes and reveal is shown after answering.
 */
export const POINTS = 2;
export const HELP_POINTS = 1;
const HELPS = 2;

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

export function quizPerfectScore(questions) {
  let total = 0;
  for (let i = 1; i <= questions; i++) total += POINTS * comboMultiplier(i);
  return total;
}

export function QuizEngine({ questions, makeQuestion, countingDown = false, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playPop }) {
  const t = useTranslation();
  const tq = t.quiz;

  const usedRef = useRef(new Set());
  const [qIndex, setQIndex] = useState(0);
  const [q, setQ] = useState(() => {
    const first = makeQuestion(0, usedRef.current);
    usedRef.current.add(first.id);
    return first;
  });
  const [picked, setPicked]   = useState(null);
  const [removed, setRemoved] = useState([]);
  const [helpsLeft, setHelpsLeft] = useState(HELPS);
  const [score, setScore]     = useState(0);
  const [streak, setStreak]   = useState(0);
  const [popup, setPopup]     = useState(null);

  const scoreRef  = useRef(0);
  const streakRef = useRef(0);
  const doneRef   = useRef(false);
  const reported  = useRef(-1);

  useEffect(() => {
    if (countingDown || reported.current === qIndex) return;
    reported.current = qIndex;
    reportRound?.(qIndex + 1, questions);
  }, [countingDown, qIndex, questions, reportRound]);

  const choose = useCallback((id) => {
    if (countingDown || picked !== null || doneRef.current || removed.includes(id)) return;
    playClick();
    setPicked(id);
    if (id === q.answerId) {
      streakRef.current += 1;
      const m = comboMultiplier(streakRef.current);
      const gained = (removed.length ? HELP_POINTS : POINTS) * m;
      scoreRef.current += gained;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      setPopup({ id: Date.now(), text: `+${gained}`, tone: m > 1 ? `x${m}` : 'good' });
      playSuccess();
    } else {
      streakRef.current = 0;
      playFail();
    }
    setStreak(streakRef.current);
  }, [countingDown, picked, removed, q, playClick, playSuccess, playFail, reportScore]);

  const takeHelp = useCallback(() => {
    if (picked !== null || helpsLeft <= 0 || removed.length) return;
    playPop?.();
    const wrong = q.options.filter(o => o.id !== q.answerId).map(o => o.id);
    for (let i = wrong.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
    }
    setRemoved(wrong.slice(0, 2));
    setHelpsLeft(h => h - 1);
  }, [picked, helpsLeft, removed, q, playPop]);

  const next = useCallback(() => {
    if (doneRef.current) return;
    playClick();
    const n = qIndex + 1;
    if (n >= questions) {
      doneRef.current = true;
      onComplete({ finalScore: scoreRef.current, maxScore: Math.max(quizPerfectScore(questions), scoreRef.current), completed: true });
      return;
    }
    const nq = makeQuestion(n, usedRef.current);
    usedRef.current.add(nq.id);
    setQIndex(n);
    setQ(nq);
    setPicked(null);
    setRemoved([]);
    setPopup(null);
  }, [qIndex, questions, makeQuestion, onComplete, playClick]);

  const answered = picked !== null;
  const correct = answered && picked === q.answerId;
  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.question} {qIndex + 1}/{questions}</span>
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${tq.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tq.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <div key={`q${qIndex}`} className={`${styles.card} ${answered ? (correct ? styles.cardGood : styles.cardSoft) : ''}`}>
          <div className={styles.visual}>{q.visual}</div>
          <p className={styles.prompt}>{q.prompt}</p>
          {popup && <span key={popup.id} className={`${styles.floatText} ${styles[`tone_${popup.tone}`] ?? ''}`} aria-hidden="true">{popup.text}</span>}
        </div>

        <div key={`o${qIndex}`} className={styles.options}>
          {q.options.map((opt, i) => {
            const gone = removed.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                style={{ '--idx': i }}
                className={[
                  styles.opt,
                  gone ? styles.optGone : '',
                  answered && opt.id === q.answerId ? styles.optCorrect : '',
                  answered && opt.id === picked && opt.id !== q.answerId ? styles.optWrong : '',
                  answered && opt.id !== q.answerId && opt.id !== picked ? styles.optDim : '',
                ].join(' ')}
                onClick={() => choose(opt.id)}
                disabled={answered || gone}
                aria-label={opt.label}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {answered ? (
          <div className={styles.revealRow} aria-live="polite">
            <p className={`${styles.reveal} ${correct ? styles.revealGood : ''}`}>
              <span aria-hidden="true">{correct ? '✓ ' : '💡 '}</span>{q.reveal}
            </p>
            <button type="button" className={styles.nextBtn} onClick={next}>
              {qIndex + 1 >= questions ? tq.finish : tq.next} ›
            </button>
          </div>
        ) : (
          <button type="button" className={styles.removeBtn} onClick={takeHelp} disabled={helpsLeft <= 0 || removed.length > 0 || countingDown}>
            <span aria-hidden="true">✂️</span> {tq.removeTwo} <span className={styles.removeCount}>{helpsLeft}</span>
          </button>
        )}
      </div>
    </div>
  );
}

QuizEngine.propTypes = {
  questions:    PropTypes.number.isRequired,
  makeQuestion: PropTypes.func.isRequired,
  countingDown: PropTypes.bool,
  onComplete:   PropTypes.func.isRequired,
  reportScore:  PropTypes.func.isRequired,
  reportRound:  PropTypes.func,
  playClick:    PropTypes.func.isRequired,
  playSuccess:  PropTypes.func.isRequired,
  playFail:     PropTypes.func.isRequired,
  playPop:      PropTypes.func,
};
