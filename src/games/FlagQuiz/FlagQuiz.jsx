import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './FlagQuiz.module.css';

// ── Difficulty config ──────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
  easy:   { questions: 8,  timeLimitSeconds: null, pool: 'easy'   },
  medium: { questions: 10, timeLimitSeconds: 120,  pool: 'medium' },
  hard:   { questions: 12, timeLimitSeconds: 90,   pool: 'hard'   },
};

// Unicode flag helper: country code → flag emoji
function flag(code) {
  return code.toUpperCase().split('').map(c =>
    String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))
  ).join('');
}

// ── Flag data pools ────────────────────────────────────────────────
// Each entry: { code, name }
const EASY_FLAGS = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'JP', name: 'Japan' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NZ', name: 'New Zealand' },
];

const MEDIUM_FLAGS = [
  ...EASY_FLAGS,
  { code: 'KR', name: 'South Korea' },
  { code: 'AR', name: 'Argentina' },
  { code: 'RU', name: 'Russia' },
  { code: 'TR', name: 'Turkey' },
  { code: 'EG', name: 'Egypt' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GR', name: 'Greece' },
  { code: 'PL', name: 'Poland' },
  { code: 'NL', name: 'Netherlands' },
];

const HARD_FLAGS = [
  ...MEDIUM_FLAGS,
  { code: 'PH', name: 'Philippines' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'NP', name: 'Nepal' },
  { code: 'KE', name: 'Kenya' },
  { code: 'GH', name: 'Ghana' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'MA', name: 'Morocco' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'PE', name: 'Peru' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'IR', name: 'Iran' },
  { code: 'IQ', name: 'Iraq' },
  { code: 'AF', name: 'Afghanistan' },
  { code: 'HU', name: 'Hungary' },
  { code: 'RO', name: 'Romania' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
];

const POOL_MAP = { easy: EASY_FLAGS, medium: MEDIUM_FLAGS, hard: HARD_FLAGS };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestion(pool, usedIndices) {
  // pick a correct answer not yet used
  const available = pool.filter((_, i) => !usedIndices.has(i));
  const pickFrom  = available.length >= 4 ? available : pool;
  const correct   = pickFrom[Math.floor(Math.random() * pickFrom.length)];

  // 3 distractors
  const distractors = shuffle(pool.filter(f => f.code !== correct.code)).slice(0, 3);
  const options = shuffle([correct, ...distractors]);
  return { correct, options };
}

// ── Inner game ─────────────────────────────────────────────────────
function FlagQuizGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const pool   = POOL_MAP[config.pool];

  const usedRef = { current: new Set() };
  const [qIndex,   setQIndex]   = useState(0);
  const [score,    setScore]    = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [chosen,   setChosen]   = useState(null);
  const [question, setQuestion] = useState(() => buildQuestion(pool, usedRef.current));

  // Time-up
  useEffect(() => {
    if (secondsLeft === 0) {
      onComplete({ finalScore: score, maxScore: config.questions, completed: false });
    }
  }, [secondsLeft, score, config.questions, onComplete]);

  const nextQuestion = useCallback(() => {
    const next = qIndex + 1;
    if (next >= config.questions) {
      onComplete({ finalScore: score, maxScore: config.questions, completed: true });
      return;
    }
    setQIndex(next);
    setFeedback(null);
    setChosen(null);
    setQuestion(buildQuestion(pool, new Set()));
  }, [qIndex, score, config.questions, pool, onComplete]);

  const handleChoice = useCallback((opt) => {
    if (feedback) return;
    playClick();
    setChosen(opt.code);
    const correct = opt.code === question.correct.code;
    if (correct) { playSuccess(); } else { playFail(); }
    setFeedback(correct ? 'correct' : 'wrong');
    const ns = correct ? score + 1 : score;
    if (correct) setScore(ns);
    reportScore(ns);
    setTimeout(() => nextQuestion(), 1000);
  }, [feedback, question.correct.code, score, reportScore, nextQuestion, playClick, playSuccess, playFail]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.progress}>
        Question <strong>{qIndex + 1}</strong> of {config.questions}
      </div>

      {/* Flag display */}
      <div className={styles.flagCard}>
        <span className={styles.flagEmoji} role="img" aria-label="Country flag">
          {flag(question.correct.code)}
        </span>
        <p className={styles.prompt}>Which country does this flag belong to?</p>
      </div>

      {/* Options */}
      <div className={styles.options}>
        {question.options.map((opt) => {
          const isChosen  = chosen === opt.code;
          const isCorrect = opt.code === question.correct.code;
          let cls = styles.optBtn;
          if (feedback && isChosen  && feedback === 'correct') cls = `${styles.optBtn} ${styles.optCorrect}`;
          else if (feedback && isChosen && feedback === 'wrong') cls = `${styles.optBtn} ${styles.optWrong}`;
          else if (feedback && isCorrect) cls = `${styles.optBtn} ${styles.optCorrect}`;

          return (
            <button
              key={opt.code}
              className={cls}
              onClick={() => handleChoice(opt)}
              disabled={!!feedback}
            >
                {opt.name}
            </button>
          );
        })}
      </div>

      {feedback && (
        <p className={feedback === 'correct' ? styles.feedbackCorrect : styles.feedbackWrong}>
          {feedback === 'correct' ? '✓ Correct!' : `✗ That was ${question.correct.name}`}
        </p>
      )}
    </div>
  );
}

FlagQuizGame.propTypes = {
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']).isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

// ── Outer wrapper ──────────────────────────────────────────────────
export function FlagQuiz({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'flag-quiz', callbackUrl, onComplete });

  return (
    <GameShell
      gameId="flag-quiz"
      title="Flag Quiz"
      instructions="Look at the flag and choose the correct country. Exercises general knowledge and visual recognition."
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <FlagQuizGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

FlagQuiz.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
