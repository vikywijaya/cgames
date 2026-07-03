import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './CapitalQuiz.module.css';
import { useTranslation } from '../../i18n/useTranslation';

const DIFFICULTY_CONFIG = {
  easy:   { questions: 8,  timeLimitSeconds: null, pool: 'easy'   },
  medium: { questions: 10, timeLimitSeconds: 120,  pool: 'medium' },
  hard:   { questions: 12, timeLimitSeconds: 90,   pool: 'hard'   },
};

// { country, capital, code (country code for flag emoji) }
// Tiers are DISJOINT and ordered by familiarity of the country/capital:
// easy = household-name capitals, medium = moderately known, hard =
// less-familiar capitals.
const EASY_DATA = [
  { country: 'France',        capital: 'Paris',         code: 'FR' },
  { country: 'Germany',       capital: 'Berlin',        code: 'DE' },
  { country: 'Japan',         capital: 'Tokyo',         code: 'JP' },
  { country: 'United States', capital: 'Washington DC', code: 'US' },
  { country: 'United Kingdom',capital: 'London',        code: 'GB' },
  { country: 'Italy',         capital: 'Rome',          code: 'IT' },
  { country: 'Spain',         capital: 'Madrid',        code: 'ES' },
  { country: 'China',         capital: 'Beijing',       code: 'CN' },
  { country: 'India',         capital: 'New Delhi',     code: 'IN' },
  { country: 'Mexico',        capital: 'Mexico City',   code: 'MX' },
  { country: 'Russia',        capital: 'Moscow',        code: 'RU' },
  { country: 'Greece',        capital: 'Athens',        code: 'GR' },
];

const MEDIUM_DATA = [
  { country: 'Australia',     capital: 'Canberra',      code: 'AU' },
  { country: 'Canada',        capital: 'Ottawa',        code: 'CA' },
  { country: 'Brazil',        capital: 'Brasília',      code: 'BR' },
  { country: 'South Korea',   capital: 'Seoul',         code: 'KR' },
  { country: 'Argentina',     capital: 'Buenos Aires',  code: 'AR' },
  { country: 'Egypt',         capital: 'Cairo',         code: 'EG' },
  { country: 'Turkey',        capital: 'Ankara',        code: 'TR' },
  { country: 'Thailand',      capital: 'Bangkok',       code: 'TH' },
  { country: 'Sweden',        capital: 'Stockholm',     code: 'SE' },
  { country: 'Norway',        capital: 'Oslo',          code: 'NO' },
  { country: 'Netherlands',   capital: 'Amsterdam',     code: 'NL' },
  { country: 'Portugal',      capital: 'Lisbon',        code: 'PT' },
  { country: 'Poland',        capital: 'Warsaw',        code: 'PL' },
  { country: 'Indonesia',     capital: 'Jakarta',       code: 'ID' },
];

const HARD_DATA = [
  { country: 'Switzerland',   capital: 'Bern',          code: 'CH' },
  { country: 'South Africa',  capital: 'Pretoria',      code: 'ZA' },
  { country: 'Pakistan',      capital: 'Islamabad',     code: 'PK' },
  { country: 'Bangladesh',    capital: 'Dhaka',         code: 'BD' },
  { country: 'Nigeria',       capital: 'Abuja',         code: 'NG' },
  { country: 'Kenya',         capital: 'Nairobi',       code: 'KE' },
  { country: 'Morocco',       capital: 'Rabat',         code: 'MA' },
  { country: 'Colombia',      capital: 'Bogotá',        code: 'CO' },
  { country: 'Chile',         capital: 'Santiago',      code: 'CL' },
  { country: 'Philippines',   capital: 'Manila',        code: 'PH' },
  { country: 'Vietnam',       capital: 'Hanoi',         code: 'VN' },
  { country: 'Ukraine',       capital: 'Kyiv',          code: 'UA' },
  { country: 'Romania',       capital: 'Bucharest',     code: 'RO' },
  { country: 'Czech Republic',capital: 'Prague',        code: 'CZ' },
  { country: 'Hungary',       capital: 'Budapest',      code: 'HU' },
  { country: 'New Zealand',   capital: 'Wellington',    code: 'NZ' },
  { country: 'Kazakhstan',    capital: 'Astana',        code: 'KZ' },
  { country: 'Sri Lanka',     capital: 'Colombo',       code: 'LK' },
];

const POOL_MAP = { easy: EASY_DATA, medium: MEDIUM_DATA, hard: HARD_DATA };

function flag(code) {
  return code.toUpperCase().split('').map(c =>
    String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))
  ).join('');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Distractors come from the same tier so the options are plausible.
function buildQuestion(correct, pool) {
  const distractors = shuffle(pool.filter(p => p.code !== correct.code)).slice(0, 3);
  const options = shuffle([correct, ...distractors]);
  return { correct, options };
}

function CapitalQuizGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const pool   = POOL_MAP[config.pool];

  // Pre-shuffled queue of distinct countries for this attempt, so no
  // country repeats until the tier is exhausted.
  const queueRef = useRef(shuffle(pool));
  const cursorRef = useRef(0);
  const nextCorrect = useCallback(() => {
    if (cursorRef.current >= queueRef.current.length) {
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

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: config.questions, completed: false });
  }, [secondsLeft, score, config.questions, onComplete]);

  const nextQ = useCallback((newScore) => {
    const next = qIndex + 1;
    if (next >= config.questions) {
      onComplete({ finalScore: newScore, maxScore: config.questions, completed: true });
      return;
    }
    setQIndex(next);
    setFeedback(null);
    setChosen(null);
    setQuestion(buildQuestion(nextCorrect(), pool));
  }, [qIndex, config, pool, nextCorrect, onComplete]);

  const handleChoice = useCallback((opt) => {
    if (feedback) return;
    setChosen(opt.code);
    const correct = opt.code === question.correct.code;
    const newScore = correct ? score + 1 : score;
    if (correct) { playSuccess(); setScore(newScore); }
    else { playFail(); }
    reportScore(newScore);
    setFeedback(correct ? 'correct' : 'wrong');
    setTimeout(() => nextQ(newScore), 1000);
  }, [feedback, question.correct.code, score, reportScore, nextQ, playSuccess, playFail]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderLabel}>{t.games['capital-quiz'].label}</span>
          <span className={styles.infoHeaderSub}>{t.common.question} {qIndex + 1} {t.common.of} {config.questions}</span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>/ {config.questions}</span>
        </div>
      </div>

      <div className={styles.questionCard}>
        <span className={styles.flagEmoji} role="img" aria-label={`Flag of ${question.correct.country}`}>
          {flag(question.correct.code)}
        </span>
        <p className={styles.questionText}>
          What is the capital of <strong>{question.correct.country}</strong>?
        </p>
      </div>

      <div className={styles.options}>
        {question.options.map((opt, i) => {
          const isChosen  = chosen === opt.code;
          const isCorrect = opt.code === question.correct.code;
          let cls = styles.optBtn;
          if (feedback && isChosen  && feedback === 'correct') cls = `${styles.optBtn} ${styles.optCorrect}`;
          else if (feedback && isChosen && feedback === 'wrong')  cls = `${styles.optBtn} ${styles.optWrong}`;
          else if (feedback && isCorrect) cls = `${styles.optBtn} ${styles.optCorrect}`;
          return (
            <button key={opt.code} className={cls} style={{ '--idx': i }} onClick={() => { playClick(); handleChoice(opt); }} disabled={!!feedback}>
              {opt.capital}
            </button>
          );
        })}
      </div>

      <p className={feedback === 'correct' ? styles.feedbackOk : feedback === 'wrong' ? styles.feedbackBad : styles.feedbackSlot}>
        {feedback === 'correct' ? t.common.correct : feedback ? `${t.games['capital-quiz'].wrongAnswer} ${question.correct.capital}` : '\u00A0'}
      </p>
    </div>
  );
}

CapitalQuizGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

const TIME_LIMITS = { easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds ?? null, medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds ?? null, hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds ?? null };

export function CapitalQuiz({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'capital-quiz', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="capital-quiz"
      title={t.games['capital-quiz'].title}
      instructions={t.games['capital-quiz'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playClick, playSuccess, playFail }) => (
        <CapitalQuizGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

CapitalQuiz.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
