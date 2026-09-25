import { useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './CapitalQuiz.module.css';
import { useTranslation } from '../../i18n/useTranslation';
import { QuizEngine } from '../../components/QuizEngine/QuizEngine';
import { countryName } from '../../utils/countries';
import { GameContext } from '../../context/GameContext';


const DIFFICULTY_CONFIG = {
  easy:   { questions: 8, pool: 'easy'   },
  medium: { questions: 10, pool: 'medium' },
  hard:   { questions: 12, pool: 'hard'   },
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


function CapitalQuizGame({ difficulty, ...engineProps }) {
  const t = useTranslation();
  const tg = t.games['capital-quiz'];
  const { langCode } = useContext(GameContext);
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const pool = POOL_MAP[config.pool];
  const cn = (name) => countryName(name, langCode);

  // One question: an unused item, three others from the same tier.
  const makeQuestion = useCallback((index, used) => {
    const fresh = pool.filter(x => !used.has(x.code));
    const item = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
    const others = shuffle(pool.filter(x => x.code !== item.code)).slice(0, 3);
    return {
      id: item.code,
      visual: <span className={styles.bigFlag} aria-hidden="true">{flag(item.code)}</span>,
      prompt: tg.prompt.replace('{country}', cn(item.country)),
      options: shuffle([item, ...others]).map(x => ({ id: x.code, label: x.capital })),
      answerId: item.code,
      reveal: tg.reveal.replace('{capital}', item.capital).replace('{country}', cn(item.country)),
    };
  }, [pool, tg, langCode]); // eslint-disable-line react-hooks/exhaustive-deps

  return <QuizEngine questions={config.questions} makeQuestion={makeQuestion} {...engineProps} />;
}

CapitalQuizGame.propTypes = {
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

export function CapitalQuiz({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'capital-quiz', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="capital-quiz"
      title={t.games['capital-quiz'].title}
      instructions={`${t.games['capital-quiz'].instructions} ${t.quiz.howItWorks}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playPop, countingDown }) => (
        <CapitalQuizGame
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

CapitalQuiz.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
