import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './CurrencyQuiz.module.css';
import { useTranslation } from '../../i18n/useTranslation';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  pool: 'basic',    timeLimitSeconds: null },
  medium: { rounds: 12, pool: 'extended', timeLimitSeconds: 120  },
  hard:   { rounds: 16, pool: 'all',      timeLimitSeconds: 90   },
};

// { country, currency, symbol, flag }
// Tiers are DISJOINT and ordered by how familiar the currency is:
// basic = household-name currencies, extended = moderately known,
// all = less-familiar currencies. Each tier is large enough to fill its
// difficulty's round count without repeats.
const ALL_CURRENCIES = [
  // Basic (well-known)
  { country: 'United States',   currency: 'Dollar',         symbol: '$',   flag: '🇺🇸', pool: 'basic' },
  { country: 'United Kingdom',  currency: 'Pound Sterling', symbol: '£',   flag: '🇬🇧', pool: 'basic' },
  { country: 'European Union',  currency: 'Euro',           symbol: '€',   flag: '🇪🇺', pool: 'basic' },
  { country: 'Japan',           currency: 'Yen',            symbol: '¥',   flag: '🇯🇵', pool: 'basic' },
  { country: 'China',           currency: 'Yuan (Renminbi)',symbol: '¥',   flag: '🇨🇳', pool: 'basic' },
  { country: 'India',           currency: 'Rupee',          symbol: '₹',   flag: '🇮🇳', pool: 'basic' },
  { country: 'Switzerland',     currency: 'Franc',          symbol: 'Fr',  flag: '🇨🇭', pool: 'basic' },
  { country: 'Russia',          currency: 'Ruble',          symbol: '₽',   flag: '🇷🇺', pool: 'basic' },
  { country: 'Mexico',          currency: 'Peso',           symbol: 'MX$', flag: '🇲🇽', pool: 'basic' },
  { country: 'Brazil',          currency: 'Real',           symbol: 'R$',  flag: '🇧🇷', pool: 'basic' },
  // Extended (moderately known)
  { country: 'South Korea',     currency: 'Won',            symbol: '₩',   flag: '🇰🇷', pool: 'extended' },
  { country: 'South Africa',    currency: 'Rand',           symbol: 'R',   flag: '🇿🇦', pool: 'extended' },
  { country: 'Sweden',          currency: 'Krona',          symbol: 'kr',  flag: '🇸🇪', pool: 'extended' },
  { country: 'Turkey',          currency: 'Lira',           symbol: '₺',   flag: '🇹🇷', pool: 'extended' },
  { country: 'Thailand',        currency: 'Baht',           symbol: '฿',   flag: '🇹🇭', pool: 'extended' },
  { country: 'Saudi Arabia',    currency: 'Riyal',          symbol: '﷼',   flag: '🇸🇦', pool: 'extended' },
  { country: 'Israel',          currency: 'Shekel',         symbol: '₪',   flag: '🇮🇱', pool: 'extended' },
  { country: 'Poland',          currency: 'Złoty',          symbol: 'zł',  flag: '🇵🇱', pool: 'extended' },
  { country: 'Indonesia',       currency: 'Rupiah',         symbol: 'Rp',  flag: '🇮🇩', pool: 'extended' },
  { country: 'Norway',          currency: 'Krone',          symbol: 'kr',  flag: '🇳🇴', pool: 'extended' },
  { country: 'Philippines',     currency: 'Peso',           symbol: '₱',   flag: '🇵🇭', pool: 'extended' },
  { country: 'Vietnam',         currency: 'Dong',           symbol: '₫',   flag: '🇻🇳', pool: 'extended' },
  // All (less-familiar)
  { country: 'Hungary',         currency: 'Forint',         symbol: 'Ft',  flag: '🇭🇺', pool: 'all' },
  { country: 'Czech Republic',  currency: 'Koruna',         symbol: 'Kč',  flag: '🇨🇿', pool: 'all' },
  { country: 'Malaysia',        currency: 'Ringgit',        symbol: 'RM',  flag: '🇲🇾', pool: 'all' },
  { country: 'Nigeria',         currency: 'Naira',          symbol: '₦',   flag: '🇳🇬', pool: 'all' },
  { country: 'Ghana',           currency: 'Cedi',           symbol: '₵',   flag: '🇬🇭', pool: 'all' },
  { country: 'Peru',            currency: 'Sol',            symbol: 'S/',  flag: '🇵🇪', pool: 'all' },
  { country: 'Kazakhstan',      currency: 'Tenge',          symbol: '₸',   flag: '🇰🇿', pool: 'all' },
  { country: 'Ukraine',         currency: 'Hryvnia',        symbol: '₴',   flag: '🇺🇦', pool: 'all' },
  { country: 'Bangladesh',      currency: 'Taka',           symbol: '৳',   flag: '🇧🇩', pool: 'all' },
  { country: 'Croatia',         currency: 'Kuna',           symbol: 'kn',  flag: '🇭🇷', pool: 'all' },
  { country: 'Romania',         currency: 'Leu',            symbol: 'lei', flag: '🇷🇴', pool: 'all' },
  { country: 'Denmark',         currency: 'Krone',          symbol: 'kr',  flag: '🇩🇰', pool: 'all' },
  { country: 'Morocco',         currency: 'Dirham',         symbol: 'DH',  flag: '🇲🇦', pool: 'all' },
  { country: 'Kenya',           currency: 'Shilling',       symbol: 'KSh', flag: '🇰🇪', pool: 'all' },
  { country: 'Iceland',         currency: 'Króna',          symbol: 'kr',  flag: '🇮🇸', pool: 'all' },
  { country: 'Sri Lanka',       currency: 'Rupee',          symbol: 'Rs',  flag: '🇱🇰', pool: 'all' },
];

const POOL_MAP = {
  basic:    ALL_CURRENCIES.filter(c => c.pool === 'basic'),
  extended: ALL_CURRENCIES.filter(c => c.pool === 'extended'),
  all:      ALL_CURRENCIES.filter(c => c.pool === 'all'),
};

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Distractors come from the same tier so the options are plausible.
function buildQuestion(item, pool) {
  const others = pool.filter(c => c.currency !== item.currency);
  const opts = [item.currency];
  const shuffledOthers = shuffleArr(others);
  for (const pick of shuffledOthers) {
    if (opts.length >= 4) break;
    if (!opts.includes(pick.currency)) opts.push(pick.currency);
  }
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { ...item, options: opts };
}

function CurrencyQuizGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const pool   = POOL_MAP[config.pool];

  // Pre-shuffled queue of distinct currencies for this attempt, so no
  // country repeats until the tier is exhausted.
  const queueRef = useRef(shuffleArr(pool));
  const cursorRef = useRef(0);
  const nextItem = useCallback(() => {
    if (cursorRef.current >= queueRef.current.length) {
      queueRef.current = shuffleArr(pool);
      cursorRef.current = 0;
    }
    return queueRef.current[cursorRef.current++];
  }, [pool]);

  const [round,    setRound]    = useState(0);
  const [score,    setScore]    = useState(0);
  const [q,        setQ]        = useState(() => buildQuestion(nextItem(), pool));
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
    setQ(buildQuestion(nextItem(), pool));
    setFeedback(null);
    setPicked(null);
  }, [config, pool, nextItem, onComplete]);

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
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderLabel}>{t.games['currency-quiz'].label}</span>
          <span className={styles.infoHeaderSub}>{t.common.round} {round + 1} {t.common.of} {config.rounds}</span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>/ {config.rounds}</span>
        </div>
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
            <button key={i} className={cls} style={{ '--idx': i }} onClick={() => handlePick(opt)} disabled={!!feedback} aria-label={opt}>
              {opt}
            </button>
          );
        })}
      </div>

      <p className={feedback === 'correct' ? styles.feedbackOk : feedback === 'wrong' ? styles.feedbackBad : styles.feedbackSlot}>
        {feedback === 'correct' ? t.common.correct : feedback === 'wrong' ? `${t.games['currency-quiz'].wrongAnswer} ${q.currency}` : '\u00A0'}
      </p>
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

const TIME_LIMITS = { easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds ?? null, medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds ?? null, hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds ?? null };

export function CurrencyQuiz({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'currency-quiz', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="currency-quiz"
      title={t.games['currency-quiz'].title}
      instructions={t.games['currency-quiz'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playClick, playSuccess, playFail }) => (
        <CurrencyQuizGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
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
