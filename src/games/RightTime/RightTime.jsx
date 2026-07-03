import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './RightTime.module.css';
import { useTranslation } from '../../i18n/useTranslation';

// ── Difficulty config ──────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
  easy:   { questions: 8,  timeLimitSeconds: null, minuteStep: 15 }, // times on the hour/quarter
  medium: { questions: 10, timeLimitSeconds: 120,  minuteStep: 5  }, // times on 5-min marks
  hard:   { questions: 12, timeLimitSeconds: 90,   minuteStep: 1  }, // any minute
};

function randomTime(minuteStep) {
  const h = Math.floor(Math.random() * 12) + 1; // 1–12
  const steps = Math.floor(60 / minuteStep);
  const m = Math.floor(Math.random() * steps) * minuteStep;
  return { h, m };
}

function formatTime({ h, m }) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timesEqual(a, b) {
  return a.h === b.h && a.m === b.m;
}

// Distractors must be visually distinguishable on a clock face. Two options that
// share an hour must differ by at least this many minutes, so we never produce
// near-duplicate times like 2:30 vs 2:31 on Hard.
const MIN_MINUTE_GAP = 5;

// Snap distractor minutes to a 5-min grid regardless of difficulty, so every
// option lands on a readable clock position.
const OPTION_MINUTE_STEP = 5;

// Total absolute minutes (0–719) for a 12-hour clock, used to compare spacing.
function totalMinutes({ h, m }) {
  return (h % 12) * 60 + m;
}

// True if `candidate` is far enough from every already-chosen option.
function isWellSpaced(candidate, options) {
  return options.every((opt) => {
    if (opt.h === candidate.h) {
      return Math.abs(opt.m - candidate.m) >= MIN_MINUTE_GAP;
    }
    // Different hour — also reject if the overall times are within the gap
    // (e.g. 2:58 vs 3:00) so the answers never read as near-identical.
    return Math.abs(totalMinutes(opt) - totalMinutes(candidate)) >= MIN_MINUTE_GAP;
  });
}

function generateOptions(correct) {
  const options = [correct];

  let guard = 0;
  while (options.length < 4 && guard < 500) {
    guard += 1;
    let candidate;
    const varyHour = Math.random() < 0.5;
    if (varyHour) {
      let h = correct.h + (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
      h = ((h - 1 + 12) % 12) + 1;
      candidate = { h, m: correct.m };
    } else {
      const steps = Math.floor(60 / OPTION_MINUTE_STEP);
      let m = (Math.floor(Math.random() * steps) * OPTION_MINUTE_STEP) % 60;
      candidate = { h: correct.h, m };
    }
    if (isWellSpaced(candidate, options)) options.push(candidate);
  }

  // Fallback: if random spacing failed to fill 4, fan out by fixed +15-min hops.
  let hop = 1;
  while (options.length < 4) {
    const base = totalMinutes(correct);
    const tm = (((base + hop * 15) % 720) + 720) % 720;
    const candidate = { h: (Math.floor(tm / 60) % 12) || 12, m: tm % 60 };
    if (isWellSpaced(candidate, options)) options.push(candidate);
    hop += 1;
    if (hop > 48) break;
  }

  // shuffle
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

// ── SVG Clock face ─────────────────────────────────────────────────
function ClockFace({ h, m, size = 200 }) {
  const cx = size / 2;
  const cy = size / 2;
  const r  = size / 2 - 8;

  // Angles: 0 = 12 o'clock, clockwise
  const minuteAngle = (m / 60) * 360 - 90;
  const hourAngle   = ((h % 12) / 12) * 360 + (m / 60) * 30 - 90;

  function hand(angleDeg, length, width, color) {
    const rad = (angleDeg * Math.PI) / 180;
    const x2  = cx + Math.cos(rad) * length;
    const y2  = cy + Math.sin(rad) * length;
    return <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={color} strokeWidth={width} strokeLinecap="round" />;
  }

  // Minute ticks (60) — thin marks except on the hour, which are drawn bolder below
  const minuteTicks = Array.from({ length: 60 }, (_, i) => {
    if (i % 5 === 0) return null; // hour positions handled by bold markers
    const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
    const innerR = r - 5;
    const outerR = r - 2;
    return (
      <line
        key={`mt-${i}`}
        x1={cx + Math.cos(angle) * innerR}
        y1={cy + Math.sin(angle) * innerR}
        x2={cx + Math.cos(angle) * outerR}
        y2={cy + Math.sin(angle) * outerR}
        stroke="rgba(228,228,231,0.3)"
        strokeWidth={1}
      />
    );
  });

  // Hour markers (bolder)
  const markers = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
    const innerR = r - 12;
    const outerR = r - 2;
    return (
      <line
        key={i}
        x1={cx + Math.cos(angle) * innerR}
        y1={cy + Math.sin(angle) * innerR}
        x2={cx + Math.cos(angle) * outerR}
        y2={cy + Math.sin(angle) * outerR}
        stroke="rgba(228,228,231,0.6)"
        strokeWidth={3}
      />
    );
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {/* Face */}
      <circle cx={cx} cy={cy} r={r} fill="#1a1a25" stroke="rgba(255,255,255,0.15)" strokeWidth={3} />
      {minuteTicks}
      {markers}
      {/* Hour hand */}
      {hand(hourAngle,   r * 0.52, 5, '#60a5fa')}
      {/* Minute hand */}
      {hand(minuteAngle, r * 0.72, 3, '#f87171')}
      {/* Centre dot */}
      <circle cx={cx} cy={cy} r={4} fill="#e4e4e7" />
    </svg>
  );
}

ClockFace.propTypes = { h: PropTypes.number.isRequired, m: PropTypes.number.isRequired, size: PropTypes.number };

// ── Inner game ─────────────────────────────────────────────────────
function RightTimeGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [qIndex, setQIndex]     = useState(0);
  const [score, setScore]       = useState(0);
  const [feedback, setFeedback] = useState(null); // null | 'correct' | 'wrong'
  const [chosen, setChosen]     = useState(null);
  const [question, setQuestion] = useState(() => {
    const t = randomTime(config.minuteStep);
    return { correct: t, options: generateOptions(t) };
  });

  // Time-up
  useEffect(() => {
    if (secondsLeft === 0) {
      onComplete({ finalScore: score, maxScore: config.questions, completed: false });
    }
  }, [secondsLeft, score, config.questions, onComplete]);

  const nextQuestion = useCallback(() => {
    const nextIdx = qIndex + 1;
    if (nextIdx >= config.questions) {
      onComplete({ finalScore: score, maxScore: config.questions, completed: true });
      return;
    }
    setQIndex(nextIdx);
    setFeedback(null);
    setChosen(null);
    const t = randomTime(config.minuteStep);
    setQuestion({ correct: t, options: generateOptions(t) });
  }, [qIndex, score, config.questions, config.minuteStep, onComplete]);

  const handleChoice = useCallback((opt) => {
    if (feedback) return;
    playClick();
    setChosen(opt);
    const correct = timesEqual(opt, question.correct);
    if (correct) { playSuccess(); } else { playFail(); }
    setFeedback(correct ? 'correct' : 'wrong');
    const newScore = correct ? score + 1 : score;
    if (correct) setScore(newScore);
    reportScore(newScore);

    setTimeout(() => nextQuestion(), 900);
  }, [feedback, question.correct, score, reportScore, nextQuestion, playClick, playSuccess, playFail]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderLabel}>{t.games['right-time'].label}</span>
          <span className={styles.infoHeaderSub}>{t.common.question} {qIndex + 1} {t.common.of} {config.questions}</span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>/ {config.questions}</span>
        </div>
      </div>

      <div className={styles.clockWrap}>
        <ClockFace h={question.correct.h} m={question.correct.m} size={200} />
        <p className={styles.prompt}>What time does the clock show?</p>
      </div>

      <div className={styles.options}>
        {question.options.map((opt, i) => {
          const isChosen  = chosen && timesEqual(opt, chosen);
          const isCorrect = timesEqual(opt, question.correct);
          let cls = styles.optBtn;
          if (feedback && isChosen && feedback === 'correct') cls = `${styles.optBtn} ${styles.optCorrect}`;
          else if (feedback && isChosen && feedback === 'wrong') cls = `${styles.optBtn} ${styles.optWrong}`;
          else if (feedback && isCorrect) cls = `${styles.optBtn} ${styles.optCorrect}`;

          return (
            <button
              key={i}
              className={cls}
              style={{ '--idx': i }}
              onClick={() => handleChoice(opt)}
              disabled={!!feedback}
              aria-label={`Answer ${formatTime(opt)}`}
            >
              {formatTime(opt)}
            </button>
          );
        })}
      </div>

      <p className={feedback === 'correct' ? styles.feedbackCorrect : feedback === 'wrong' ? styles.feedbackWrong : styles.feedbackSlot}>
        {feedback === 'correct' ? t.common.correct : feedback ? `${t.games['right-time'].wrongAnswer} ${formatTime(question.correct)}` : '\u00A0'}
      </p>
    </div>
  );
}

RightTimeGame.propTypes = {
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']).isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

// ── Outer wrapper ──────────────────────────────────────────────────
const TIME_LIMITS = { easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds ?? null, medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds ?? null, hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds ?? null };

export function RightTime({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'right-time', callbackUrl, onComplete });

  return (
    <GameShell
      gameId="right-time"
      title={t.games['right-time'].title}
      instructions={t.games['right-time'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playClick, playSuccess, playFail }) => (
        <RightTimeGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

RightTime.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
