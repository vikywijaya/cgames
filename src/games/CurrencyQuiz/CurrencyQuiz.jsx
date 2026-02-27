import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './CurrencyQuiz.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  pool: 'basic',    timeLimitSeconds: null },
  medium: { rounds: 12, pool: 'extended', timeLimitSeconds: 120  },
  hard:   { rounds: 16, pool: 'all',      timeLimitSeconds: 90   },
};

// { country, currency, symbol, flag }
const ALL_CURRENCIES = [
  // Basic (well-known)
  { country: 'United States',   currency: 'Dollar',        symbol: '$',   flag: '🇺🇸', pool: 'basic' },
  { country: 'United Kingdom',  currency: 'Pound Sterling', symbol: '£',  flag: '🇬🇧', pool: 'basic' },
  { country: 'European Union',  currency: 'Euro',           symbol: '€',  flag: '🇪🇺', pool: 'basic' },
  { country: 'Japan',           currency: 'Yen',            symbol: '¥',  flag: '🇯🇵', pool: 'basic' },
  { country: 'Australia',       currency: 'Dollar',         symbol: 'A$', flag: '🇦🇺', pool: 'basic' },
  { country: 'Canada',          currency: 'Dollar',         symbol: 'C$', flag: '🇨🇦', pool: 'basic' },
  { country: 'China',           currency: 'Yuan (Renminbi)',symbol: '¥',  flag: '🇨🇳', pool: 'basic' },
  { country: 'Switzerland',     currency: 'Franc',          symbol: 'Fr', flag: '🇨🇭', pool: 'basic' },
  // Extended
  { country: 'India',           currency: 'Rupee',          symbol: '₹',  flag: '🇮🇳', pool: 'extended' },
  { country: 'Brazil',          currency: 'Real',           symbol: 'R$', flag: '🇧🇷', pool: 'extended' },
  { country: 'South Korea',     currency: 'Won',            symbol: '₩',  flag: '🇰🇷', pool: 'extended' },
  { country: 'Russia',          currency: 'Ruble',          symbol: '₽',  flag: '🇷🇺', pool: 'extended' },
  { country: 'Mexico',          currency: 'Peso',           symbol: 'MX$',flag: '🇲🇽', pool: 'extended' },
  { country: 'South Africa',    currency: 'Rand',           symbol: 'R',  flag: '🇿🇦', pool: 'extended' },
  { country: 'Sweden',          currency: 'Krona',          symbol: 'kr', flag: '🇸🇪', pool: 'extended' },
  { country: 'Turkey',          currency: 'Lira',           symbol: '₺',  flag: '🇹🇷', pool: 'extended' },
  // All (less common)
  { country: 'Saudi Arabia',    currency: 'Riyal',          symbol: '﷼',  flag: '🇸🇦', pool: 'all' },
  { country: 'Norway',          currency: 'Krone',          symbol: 'kr', flag: '🇳🇴', pool: 'all' },
  { country: 'New Zealand',     currency: 'Dollar',         symbol: 'NZ$',flag: '🇳🇿', pool: 'all' },
  { country: 'Thailand',        currency: 'Baht',           symbol: '฿',  flag: '🇹🇭', pool: 'all' },
  { country: 'Israel',          currency: 'Shekel',         symbol: '₪',  flag: '🇮🇱', pool: 'all' },
  { country: 'Poland',          currency: 'Złoty',          symbol: 'zł', flag: '🇵🇱', pool: 'all' },
  { country: 'Hungary',         currency: 'Forint',         symbol: 'Ft', flag: '🇭🇺', pool: 'all' },
  { country: 'Czech Republic',  currency: 'Koruna',         symbol: 'Kč', flag: '🇨🇿', pool: 'all' },
];

const POOL_MAP = {
  basic:    ALL_CURRENCIES.filter(c => c.pool === 'basic'),
  extended: ALL_CURRENCIES.filter(c => c.pool === 'basic' || c.pool === 'extended'),
  all:      ALL_CURRENCIES,
};

function buildQuestion(poolName) {
  const pool = POOL_MAP[poolName];
  const item = pool[Math.floor(Math.random() * pool.length)];
  const others = pool.filter(c => c.currency !== item.currency);
  const opts = [item.currency];
  while (opts.length < 4 && others.length >= opts.length) {
    const pick = others[Math.floor(Math.random() * others.length)];
    if (!opts.includes(pick.currency)) opts.push(pick.currency);
  }
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { ...item, options: opts };
}

function CurrencyQuizGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [round,    setRound]    = useState(0);
  const [score,    setScore]    = useState(0);
  const [q,        setQ]        = useState(() => buildQuestion(config.pool));
  const [feedback, setFeedback] = useState(null);
  const [picked,   setPicked]   = useState(null);
  const scoreRef = useRef(0);
  const doneRef  = useRef(false);

  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: scoreRef.current, maxScore: config.rounds, completed: false });
    }
  }, [secondsLeft, onComplete, config.rounds]);

  const nextRound = useCallback((newRound, newScore) => {
    if (doneRef.current) return;
    if (newRound >= config.rounds) {
      doneRef.current = true;
      onComplete({ finalScore: newScore, maxScore: config.rounds, completed: true });
      return;
    }
    setRound(newRound);
    setQ(buildQuestion(config.pool));
    setFeedback(null);
    setPicked(null);
  }, [config, onComplete]);

  const handlePick = useCallback((val) => {
    if (feedback || doneRef.current) return;
    playClick();
    setPicked(val);
    const correct = val === q.currency;
    if (correct) { playSuccess(); } else { playFail(); }
    setFeedback(correct ? 'correct' : 'wrong');
    let newScore = scoreRef.current;
    if (correct) {
      newScore += 1;
      scoreRef.current = newScore;
      setScore(newScore);
      reportScore(newScore);
    }
    setTimeout(() => nextRound(round + 1, newScore), 800);
  }, [feedback, q, round, reportScore, nextRound, playClick, playSuccess, playFail]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Round <strong>{round + 1}</strong> / {config.rounds}</span>
        <span className={styles.scoreLabel}>Score: <strong>{score}</strong></span>
      </div>

      <div className={styles.questionCard}>
        <span className={styles.flagEmoji} aria-hidden="true">{q.flag}</span>
        <p className={styles.questionText}>
          What is the currency of <strong>{q.country}</strong>?
        </p>
      </div>

      <div className={styles.options}>
        {q.options.map((opt, i) => {
          let cls = styles.optBtn;
          if (feedback && opt === q.currency)          cls = `${styles.optBtn} ${styles.optCorrect}`;
          else if (feedback === 'wrong' && opt === picked) cls = `${styles.optBtn} ${styles.optWrong}`;
          return (
            <button key={i} className={cls} onClick={() => handlePick(opt)} disabled={!!feedback} aria-label={opt}>
              {opt}
            </button>
          );
        })}
      </div>

      {feedback === 'correct' && <p className={styles.feedbackOk}>✓ Correct!</p>}
      {feedback === 'wrong'   && <p className={styles.feedbackBad}>✗ It&apos;s the {q.currency}</p>}
    </div>
  );
}

CurrencyQuizGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function CurrencyQuiz({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'currency-quiz', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="currency-quiz"
      title="Currency Quiz"
      instructions="Name the currency used in each country. Tap the correct answer."
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <CurrencyQuizGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

CurrencyQuiz.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
