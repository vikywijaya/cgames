import { useCallback, useContext } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './LandmarkQuiz.module.css';
import { useTranslation } from '../../i18n/useTranslation';
import { QuizEngine } from '../../components/QuizEngine/QuizEngine';
import { countryName, codeFor, flagFor } from '../../utils/countries';
import { GameContext } from '../../context/GameContext';


const DIFFICULTY_CONFIG = {
  easy:   { questions: 8, pool: 'basic' },
  medium: { questions: 10, pool: 'extended' },
  hard:   { questions: 12, pool: 'all' },
};

// Tiers are DISJOINT and ordered by how recognizable the landmark is:
// basic = world-famous icons, extended = moderately known, all =
// less-familiar landmarks. Each tier is large enough to fill its
// difficulty's round count without repeats.
const ALL_LANDMARKS = [
  // basic (world-famous)
  { name: 'Eiffel Tower',         country: 'France',        emoji: '🗼', pool: 'basic' },
  { name: 'Statue of Liberty',    country: 'United States', emoji: '🗽', pool: 'basic' },
  { name: 'Big Ben',              country: 'United Kingdom',emoji: '🕐', pool: 'basic' },
  { name: 'Colosseum',            country: 'Italy',         emoji: '🏟️', pool: 'basic' },
  { name: 'Great Wall of China',  country: 'China',         emoji: '🧱', pool: 'basic' },
  { name: 'Sydney Opera House',   country: 'Australia',     emoji: '🎭', pool: 'basic' },
  { name: 'Taj Mahal',            country: 'India',         emoji: '🕌', pool: 'basic' },
  { name: 'Pyramids of Giza',     country: 'Egypt',         emoji: '🔺', pool: 'basic' },
  { name: 'Mount Fuji',           country: 'Japan',         emoji: '🗻', pool: 'basic' },
  { name: 'Christ the Redeemer',  country: 'Brazil',        emoji: '✝️',  pool: 'basic' },
  // extended (moderately known)
  { name: 'Machu Picchu',         country: 'Peru',          emoji: '🏔️', pool: 'extended' },
  { name: 'Sagrada Família',       country: 'Spain',         emoji: '⛪', pool: 'extended' },
  { name: 'Acropolis',            country: 'Greece',        emoji: '🏛️', pool: 'extended' },
  { name: 'Burj Khalifa',         country: 'UAE',           emoji: '🏢', pool: 'extended' },
  { name: 'Angkor Wat',           country: 'Cambodia',      emoji: '🛕', pool: 'extended' },
  { name: 'Chichen Itza',         country: 'Mexico',        emoji: '🏯', pool: 'extended' },
  { name: 'Niagara Falls',        country: 'Canada',        emoji: '🌊', pool: 'extended' },
  { name: 'Stonehenge',           country: 'United Kingdom',emoji: '🌀', pool: 'extended' },
  { name: 'Petra',                country: 'Jordan',        emoji: '🪨', pool: 'extended' },
  { name: 'Leaning Tower of Pisa',country: 'Italy',         emoji: '🏛️', pool: 'extended' },
  { name: 'Mount Rushmore',       country: 'United States', emoji: '🗿', pool: 'extended' },
  { name: 'Brandenburg Gate',     country: 'Germany',       emoji: '🏛️', pool: 'extended' },
  // all (less-familiar)
  { name: 'Hagia Sophia',         country: 'Turkey',        emoji: '🕍', pool: 'all' },
  { name: 'Alhambra',             country: 'Spain',         emoji: '🏰', pool: 'all' },
  { name: 'Forbidden City',       country: 'China',         emoji: '🏯', pool: 'all' },
  { name: 'Victoria Falls',       country: 'Zambia',        emoji: '💦', pool: 'all' },
  { name: 'Uluru (Ayers Rock)',   country: 'Australia',     emoji: '🟥', pool: 'all' },
  { name: 'Borobudur',            country: 'Indonesia',     emoji: '🛕', pool: 'all' },
  { name: 'Neuschwanstein Castle',country: 'Germany',       emoji: '🏰', pool: 'all' },
  { name: 'Table Mountain',       country: 'South Africa',  emoji: '⛰️', pool: 'all' },
  { name: 'Moai Statues',         country: 'Chile',         emoji: '🗿', pool: 'all' },
  { name: 'Mont-Saint-Michel',    country: 'France',        emoji: '🏰', pool: 'all' },
  { name: 'Pamukkale',            country: 'Turkey',        emoji: '🏞️', pool: 'all' },
  { name: 'Bagan Temples',        country: 'Myanmar',       emoji: '🛕', pool: 'all' },
  { name: 'Kremlin',              country: 'Russia',        emoji: '🏛️', pool: 'all' },
  { name: 'Marina Bay Sands',     country: 'Singapore',     emoji: '🏨', pool: 'all' },
  { name: 'Sheikh Zayed Mosque',  country: 'UAE',           emoji: '🕌', pool: 'all' },
  { name: 'Banff Lakes',          country: 'Canada',        emoji: '🏞️', pool: 'all' },
];

const POOL_MAP = {
  basic:    ALL_LANDMARKS.filter(l => l.pool === 'basic'),
  extended: ALL_LANDMARKS.filter(l => l.pool === 'extended'),
  all:      ALL_LANDMARKS.filter(l => l.pool === 'all'),
};

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


function LandmarkQuizGame({ difficulty, ...engineProps }) {
  const t = useTranslation();
  const tg = t.games['landmark-quiz'];
  const { langCode } = useContext(GameContext);
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const pool = POOL_MAP[config.pool];
  const cn = (name) => countryName(name, langCode);

  // One question: an unused item, three others from the same tier.
  const makeQuestion = useCallback((index, used) => {
    const fresh = pool.filter(x => !used.has(x.name));
    const item = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
    const countries = shuffleArr([...new Set(pool.map(x => x.country))].filter(c => c !== item.country)).slice(0, 3);
    return {
      id: item.name,
      visual: (
        <span className={styles.landmark}>
          <span className={styles.landmarkEmoji} aria-hidden="true">{item.emoji}</span>
          <span className={styles.landmarkName}>{item.name}</span>
        </span>
      ),
      prompt: tg.prompt.replace('{landmark}', item.name),
      options: shuffleArr([item.country, ...countries]).map(c => ({ id: c, label: cn(c) })),
      answerId: item.country,
      reveal: tg.reveal.replace('{landmark}', item.name).replace('{country}', `${cn(item.country)} ${flagFor(codeFor(item.country))}`),
    };
  }, [pool, tg, langCode]); // eslint-disable-line react-hooks/exhaustive-deps

  return <QuizEngine questions={config.questions} makeQuestion={makeQuestion} {...engineProps} />;
}

LandmarkQuizGame.propTypes = {
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

export function LandmarkQuiz({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'landmark-quiz', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="landmark-quiz"
      title={t.games['landmark-quiz'].title}
      instructions={`${t.games['landmark-quiz'].instructions} ${t.quiz.howItWorks}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playPop, countingDown }) => (
        <LandmarkQuizGame
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

LandmarkQuiz.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
