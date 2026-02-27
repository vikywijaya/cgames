import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './CapitalQuiz.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { questions: 8,  timeLimitSeconds: null, pool: 'easy'   },
  medium: { questions: 10, timeLimitSeconds: 120,  pool: 'medium' },
  hard:   { questions: 12, timeLimitSeconds: 90,   pool: 'hard'   },
};

// { country, capital, flag (country code for emoji) }
const EASY_DATA = [
  { country: 'France',        capital: 'Paris',         code: 'FR' },
  { country: 'Germany',       capital: 'Berlin',        code: 'DE' },
  { country: 'Japan',         capital: 'Tokyo',         code: 'JP' },
  { country: 'Australia',     capital: 'Canberra',      code: 'AU' },
  { country: 'United States', capital: 'Washington DC', code: 'US' },
  { country: 'United Kingdom',capital: 'London',        code: 'GB' },
  { country: 'Italy',         capital: 'Rome',          code: 'IT' },
  { country: 'Spain',         capital: 'Madrid',        code: 'ES' },
  { country: 'Canada',        capital: 'Ottawa',        code: 'CA' },
  { country: 'Brazil',        capital: 'Brasília',      code: 'BR' },
  { country: 'China',         capital: 'Beijing',       code: 'CN' },
  { country: 'India',         capital: 'New Delhi',     code: 'IN' },
  { country: 'Mexico',        capital: 'Mexico City',   code: 'MX' },
  { country: 'Russia',        capital: 'Moscow',        code: 'RU' },
];

const MEDIUM_DATA = [
  ...EASY_DATA,
  { country: 'South Korea',   capital: 'Seoul',         code: 'KR' },
  { country: 'Argentina',     capital: 'Buenos Aires',  code: 'AR' },
  { country: 'Egypt',         capital: 'Cairo',         code: 'EG' },
  { country: 'Turkey',        capital: 'Ankara',        code: 'TR' },
  { country: 'South Africa',  capital: 'Pretoria',      code: 'ZA' },
  { country: 'Thailand',      capital: 'Bangkok',       code: 'TH' },
  { country: 'Sweden',        capital: 'Stockholm',     code: 'SE' },
  { country: 'Norway',        capital: 'Oslo',          code: 'NO' },
  { country: 'Netherlands',   capital: 'Amsterdam',     code: 'NL' },
  { country: 'Switzerland',   capital: 'Bern',          code: 'CH' },
  { country: 'Portugal',      capital: 'Lisbon',        code: 'PT' },
  { country: 'Greece',        capital: 'Athens',        code: 'GR' },
];

const HARD_DATA = [
  ...MEDIUM_DATA,
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
  { country: 'Poland',        capital: 'Warsaw',        code: 'PL' },
  { country: 'Romania',       capital: 'Bucharest',     code: 'RO' },
  { country: 'Czech Republic',capital: 'Prague',        code: 'CZ' },
  { country: 'Hungary',       capital: 'Budapest',      code: 'HU' },
  { country: 'New Zealand',   capital: 'Wellington',    code: 'NZ' },
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

function buildQuestion(pool) {
  const correct = pool[Math.floor(Math.random() * pool.length)];
  const distractors = shuffle(pool.filter(p => p.code !== correct.code)).slice(0, 3);
  const options = shuffle([correct, ...distractors]);
  return { correct, options };
}

function CapitalQuizGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const pool   = POOL_MAP[config.pool];

  const [qIndex,   setQIndex]   = useState(0);
  const [score,    setScore]    = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [chosen,   setChosen]   = useState(null);
  const [question, setQuestion] = useState(() => buildQuestion(pool));

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
    setQuestion(buildQuestion(pool));
  }, [qIndex, config, pool, onComplete]);

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
      <div className={styles.progress}>
        Question <strong>{qIndex + 1}</strong> of {config.questions}
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
        {question.options.map(opt => {
          const isChosen  = chosen === opt.code;
          const isCorrect = opt.code === question.correct.code;
          let cls = styles.optBtn;
          if (feedback && isChosen  && feedback === 'correct') cls = `${styles.optBtn} ${styles.optCorrect}`;
          else if (feedback && isChosen && feedback === 'wrong')  cls = `${styles.optBtn} ${styles.optWrong}`;
          else if (feedback && isCorrect) cls = `${styles.optBtn} ${styles.optCorrect}`;
          return (
            <button key={opt.code} className={cls} onClick={() => { playClick(); handleChoice(opt); }} disabled={!!feedback}>
              {opt.capital}
            </button>
          );
        })}
      </div>

      {feedback && (
        <p className={feedback === 'correct' ? styles.feedbackOk : styles.feedbackBad}>
          {feedback === 'correct' ? '✓ Correct!' : `✗ It's ${question.correct.capital}`}
        </p>
      )}
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

export function CapitalQuiz({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'capital-quiz', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="capital-quiz"
      title="Capital City Quiz"
      instructions="Choose the correct capital city for each country shown. Exercises general knowledge and geography."
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <CapitalQuizGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
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
