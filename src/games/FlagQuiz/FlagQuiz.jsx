import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './FlagQuiz.module.css';
import { useTranslation } from '../../i18n/useTranslation';

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

// ── Flag data tiers ────────────────────────────────────────────────
// Each entry: { code, name }. Tiers are DISJOINT and ordered by how
// familiar/recognizable the country's flag is: easy = household-name
// nations, medium = moderately known, hard = less-recognizable flags.
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
  { code: 'NZ', name: 'New Zealand' },
];

const MEDIUM_FLAGS = [
  { code: 'KR', name: 'South Korea' },
  { code: 'AR', name: 'Argentina' },
  { code: 'RU', name: 'Russia' },
  { code: 'TR', name: 'Turkey' },
  { code: 'EG', name: 'Egypt' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'GR', name: 'Greece' },
  { code: 'PL', name: 'Poland' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'NG', name: 'Nigeria' },
];

const HARD_FLAGS = [
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
  { code: 'PK', name: 'Pakistan' },
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

// Build one question for a given correct answer; distractors come from
// the same tier so the options are plausible and consistently difficult.
function buildQuestion(correct, pool) {
  const distractors = shuffle(pool.filter(f => f.code !== correct.code)).slice(0, 3);
  const options = shuffle([correct, ...distractors]);
  return { correct, options };
}

// ── Inner game ─────────────────────────────────────────────────────
function FlagQuizGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const pool   = POOL_MAP[config.pool];

  // Pre-shuffled queue of distinct correct answers for this attempt, so no
  // flag repeats until the tier is exhausted. Built once per mount.
  const queueRef = useRef(shuffle(pool));
  const cursorRef = useRef(0);
  const nextCorrect = useCallback(() => {
    const q = queueRef.current;
    if (cursorRef.current >= q.length) {
      // Tier exhausted — reshuffle for a fresh, non-adjacent-repeating pass.
      queueRef.current = shuffle(pool);
      cursorRef.current = 0;
    }
    return queueRef.current[cursorRef.current++];
  }, [pool]);

  const [qIndex,   setQIndex]   = useState(0);
  const [score,    setScore]    = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [chosen,   setChosen]   = useState(null);
  const [question, setQuestion] = useState(() => buildQuestion(nextCorrect(), pool));

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
    setQuestion(buildQuestion(nextCorrect(), pool));
  }, [qIndex, score, config.questions, pool, nextCorrect, onComplete]);

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
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderSub}>{t.common.question} {qIndex + 1} {t.common.of} {config.questions}</span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>/ {config.questions}</span>
        </div>
      </div>

      <div className={styles.playArea}>
      {/* Flag display */}
      <div className={styles.flagCard}>
        <span className={styles.flagEmoji} role="img" aria-label="Country flag">
          {flag(question.correct.code)}
        </span>
        <p className={styles.prompt}>Which country does this flag belong to?</p>
      </div>

      {/* Options */}
      <div className={styles.options}>
        {question.options.map((opt, i) => {
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
              style={{ '--idx': i }}
              onClick={() => handleChoice(opt)}
              disabled={!!feedback}
            >
                {opt.name}
            </button>
          );
        })}
      </div>

      <p className={feedback === 'correct' ? styles.feedbackCorrect : feedback === 'wrong' ? styles.feedbackWrong : styles.feedbackSlot}>
        {feedback === 'correct' ? t.common.correct : feedback ? `${t.games['flag-quiz'].wrongAnswer} ${question.correct.name}` : '\u00A0'}
      </p>
      </div>
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
const TIME_LIMITS = { easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds ?? null, medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds ?? null, hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds ?? null };

export function FlagQuiz({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'flag-quiz', callbackUrl, onComplete });

  return (
    <GameShell
      gameId="flag-quiz"
      title={t.games['flag-quiz'].title}
      instructions={t.games['flag-quiz'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playClick, playSuccess, playFail }) => (
        <FlagQuizGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
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
