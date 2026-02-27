import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './RightTime.module.css';

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

function generateOptions(correct, minuteStep) {
  const options = [correct];
  const attempts = new Set([`${correct.h}:${correct.m}`]);

  while (options.length < 4) {
    let candidate;
    let key;
    do {
      // vary either hour or minute to keep distractors plausible
      const varyHour = Math.random() < 0.5;
      if (varyHour) {
        let h = correct.h + (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
        h = ((h - 1 + 12) % 12) + 1;
        candidate = { h, m: correct.m };
      } else {
        const steps = Math.floor(60 / minuteStep);
        let m = correct.m + (Math.random() < 0.5 ? 1 : -1) * minuteStep * (Math.floor(Math.random() * 3) + 1);
        m = ((m % 60) + 60) % 60;
        // round to step
        m = Math.round(m / minuteStep) * minuteStep % 60;
        candidate = { h: correct.h, m };
      }
      key = `${candidate.h}:${candidate.m}`;
    } while (attempts.has(key));
    attempts.add(key);
    options.push(candidate);
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

  // Hour markers
  const markers = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
    const innerR = r - 10;
    const outerR = r - 2;
    return (
      <line
        key={i}
        x1={cx + Math.cos(angle) * innerR}
        y1={cy + Math.sin(angle) * innerR}
        x2={cx + Math.cos(angle) * outerR}
        y2={cy + Math.sin(angle) * outerR}
        stroke="rgba(228,228,231,0.5)"
        strokeWidth={2}
      />
    );
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {/* Face */}
      <circle cx={cx} cy={cy} r={r} fill="#1a1a25" stroke="rgba(255,255,255,0.15)" strokeWidth={3} />
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
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [qIndex, setQIndex]     = useState(0);
  const [score, setScore]       = useState(0);
  const [feedback, setFeedback] = useState(null); // null | 'correct' | 'wrong'
  const [chosen, setChosen]     = useState(null);
  const [question, setQuestion] = useState(() => {
    const t = randomTime(config.minuteStep);
    return { correct: t, options: generateOptions(t, config.minuteStep) };
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
    setQuestion({ correct: t, options: generateOptions(t, config.minuteStep) });
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
      <div className={styles.progress}>
        Question <strong>{qIndex + 1}</strong> of {config.questions}
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
              onClick={() => handleChoice(opt)}
              disabled={!!feedback}
              aria-label={`Answer ${formatTime(opt)}`}
            >
              {formatTime(opt)}
            </button>
          );
        })}
      </div>

      {feedback && (
        <p className={feedback === 'correct' ? styles.feedbackCorrect : styles.feedbackWrong}>
          {feedback === 'correct' ? '✓ Correct!' : `✗ It was ${formatTime(question.correct)}`}
        </p>
      )}
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
export function RightTime({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'right-time', callbackUrl, onComplete });

  return (
    <GameShell
      gameId="right-time"
      title="Right Time"
      instructions="Look at the analog clock and choose the correct time from the four options. Exercises time-reading and visual cognition."
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <RightTimeGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
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
