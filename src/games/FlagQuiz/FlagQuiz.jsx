import { useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './FlagQuiz.module.css';
import { useTranslation } from '../../i18n/useTranslation';
import { QuizEngine } from '../../components/QuizEngine/QuizEngine';
import { countryName } from '../../utils/countries';
import { GameContext } from '../../context/GameContext';


// ── Difficulty config ──────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
  easy:   { questions: 8, pool: 'easy'   },
  medium: { questions: 10, pool: 'medium' },
  hard:   { questions: 12, pool: 'hard'   },
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



function FlagQuizGame({ difficulty, ...engineProps }) {
  const t = useTranslation();
  const tg = t.games['flag-quiz'];
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
      visual: <span className={styles.bigFlag} role="img" aria-label={tg.flagAlt}>{flag(item.code)}</span>,
      prompt: tg.prompt,
      options: shuffle([item, ...others]).map(x => ({ id: x.code, label: cn(x.name) })),
      answerId: item.code,
      reveal: tg.reveal.replace('{country}', cn(item.name)),
    };
  }, [pool, tg, langCode]); // eslint-disable-line react-hooks/exhaustive-deps

  return <QuizEngine questions={config.questions} makeQuestion={makeQuestion} {...engineProps} />;
}

FlagQuizGame.propTypes = {
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

export function FlagQuiz({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'flag-quiz', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="flag-quiz"
      title={t.games['flag-quiz'].title}
      instructions={`${t.games['flag-quiz'].instructions} ${t.quiz.howItWorks}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playPop, countingDown }) => (
        <FlagQuizGame
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

FlagQuiz.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
