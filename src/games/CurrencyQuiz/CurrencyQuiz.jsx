import { useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './CurrencyQuiz.module.css';
import { useTranslation } from '../../i18n/useTranslation';
import { QuizEngine } from '../../components/QuizEngine/QuizEngine';
import { countryName } from '../../utils/countries';
import { GameContext } from '../../context/GameContext';


const DIFFICULTY_CONFIG = {
  easy:   { questions: 8, pool: 'basic' },
  medium: { questions: 10, pool: 'extended' },
  hard:   { questions: 12, pool: 'all' },
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


function CurrencyQuizGame({ difficulty, ...engineProps }) {
  const t = useTranslation();
  const tg = t.games['currency-quiz'];
  const { langCode } = useContext(GameContext);
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const pool = POOL_MAP[config.pool];
  const cn = (name) => countryName(name, langCode);

  // One question: an unused item, three others from the same tier.
  const makeQuestion = useCallback((index, used) => {
    const fresh = pool.filter(x => !used.has(x.country));
    const item = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
    const seen = new Set([item.currency]);
    const others = [];
    for (const x of shuffleArr(pool)) {
      if (others.length === 3) break;
      if (!seen.has(x.currency)) { seen.add(x.currency); others.push(x); }
    }
    return {
      id: item.country,
      visual: <span className={styles.bigFlag} aria-hidden="true">{item.flag}</span>,
      prompt: tg.prompt.replace('{country}', cn(item.country)),
      options: shuffleArr([item, ...others]).map(x => ({ id: x.currency, label: x.currency })),
      answerId: item.currency,
      reveal: tg.reveal.replace('{country}', cn(item.country)).replace('{currency}', item.currency).replace('{symbol}', item.symbol),
    };
  }, [pool, tg, langCode]); // eslint-disable-line react-hooks/exhaustive-deps

  return <QuizEngine questions={config.questions} makeQuestion={makeQuestion} {...engineProps} />;
}

CurrencyQuizGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playPop:     PropTypes.func,
};

// No overall clock: quizzes are about knowledge, not speed.
const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function CurrencyQuiz({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'currency-quiz', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="currency-quiz"
      title={t.games['currency-quiz'].title}
      instructions={`${t.games['currency-quiz'].instructions} ${t.quiz.howItWorks}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playPop, countingDown }) => (
        <CurrencyQuizGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
          playPop={playPop}
        />
      )}
    </GameShell>
  );
}

CurrencyQuiz.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
