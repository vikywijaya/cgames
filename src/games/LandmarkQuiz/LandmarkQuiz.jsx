import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './LandmarkQuiz.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  pool: 'basic',    timeLimitSeconds: null },
  medium: { rounds: 12, pool: 'extended', timeLimitSeconds: 120  },
  hard:   { rounds: 16, pool: 'all',      timeLimitSeconds: 90   },
};

const ALL_LANDMARKS = [
  // basic
  { name: 'Eiffel Tower',         country: 'France',        emoji: '🗼', pool: 'basic' },
  { name: 'Statue of Liberty',    country: 'United States', emoji: '🗽', pool: 'basic' },
  { name: 'Big Ben',              country: 'United Kingdom',emoji: '🕐', pool: 'basic' },
  { name: 'Colosseum',            country: 'Italy',         emoji: '🏟️', pool: 'basic' },
  { name: 'Great Wall of China',  country: 'China',         emoji: '🧱', pool: 'basic' },
  { name: 'Sydney Opera House',   country: 'Australia',     emoji: '🎭', pool: 'basic' },
  { name: 'Taj Mahal',            country: 'India',         emoji: '🕌', pool: 'basic' },
  { name: 'Pyramids of Giza',     country: 'Egypt',         emoji: '🔺', pool: 'basic' },
  // extended
  { name: 'Machu Picchu',         country: 'Peru',          emoji: '🏔️', pool: 'extended' },
  { name: 'Sagrada Família',       country: 'Spain',         emoji: '⛪', pool: 'extended' },
  { name: 'Acropolis',            country: 'Greece',        emoji: '🏛️', pool: 'extended' },
  { name: 'Christ the Redeemer',  country: 'Brazil',        emoji: '✝️',  pool: 'extended' },
  { name: 'Burj Khalifa',         country: 'UAE',           emoji: '🏢', pool: 'extended' },
  { name: 'Mount Fuji',           country: 'Japan',         emoji: '🗻', pool: 'extended' },
  { name: 'Angkor Wat',           country: 'Cambodia',      emoji: '🛕', pool: 'extended' },
  { name: 'Chichen Itza',         country: 'Mexico',        emoji: '🏯', pool: 'extended' },
  // all (rarer)
  { name: 'Petra',                country: 'Jordan',        emoji: '🪨', pool: 'all' },
  { name: 'Hagia Sophia',         country: 'Turkey',        emoji: '🕍', pool: 'all' },
  { name: 'Stonehenge',           country: 'United Kingdom',emoji: '🌀', pool: 'all' },
  { name: 'Alhambra',             country: 'Spain',         emoji: '🏰', pool: 'all' },
  { name: 'Niagara Falls',        country: 'Canada',        emoji: '🌊', pool: 'all' },
  { name: 'Forbidden City',       country: 'China',         emoji: '🏯', pool: 'all' },
  { name: 'Victoria Falls',       country: 'Zambia',        emoji: '💦', pool: 'all' },
  { name: 'Uluru (Ayers Rock)',   country: 'Australia',     emoji: '🟥', pool: 'all' },
];

const POOL_MAP = {
  basic:    ALL_LANDMARKS.filter(l => l.pool === 'basic'),
  extended: ALL_LANDMARKS.filter(l => l.pool === 'basic' || l.pool === 'extended'),
  all:      ALL_LANDMARKS,
};

function buildQuestion(poolName) {
  const pool = POOL_MAP[poolName];
  const item = pool[Math.floor(Math.random() * pool.length)];
  // Options: correct country + 3 wrong countries from pool
  const otherCountries = [...new Set(pool.filter(l => l.country !== item.country).map(l => l.country))];
  const opts = [item.country];
  while (opts.length < 4 && otherCountries.length >= opts.length) {
    const pick = otherCountries[Math.floor(Math.random() * otherCountries.length)];
    if (!opts.includes(pick)) opts.push(pick);
  }
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { ...item, options: opts };
}

function LandmarkQuizGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
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
    const correct = val === q.country;
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
        <span className={styles.landmarkEmoji} aria-hidden="true">{q.emoji}</span>
        <p className={styles.landmarkName}>{q.name}</p>
        <p className={styles.questionText}>Which country is this landmark in?</p>
      </div>

      <div className={styles.options}>
        {q.options.map((opt, i) => {
          let cls = styles.optBtn;
          if (feedback && opt === q.country)           cls = `${styles.optBtn} ${styles.optCorrect}`;
          else if (feedback === 'wrong' && opt === picked) cls = `${styles.optBtn} ${styles.optWrong}`;
          return (
            <button key={i} className={cls} onClick={() => handlePick(opt)} disabled={!!feedback} aria-label={opt}>
              {opt}
            </button>
          );
        })}
      </div>

      {feedback === 'correct' && <p className={styles.feedbackOk}>✓ Correct!</p>}
      {feedback === 'wrong'   && <p className={styles.feedbackBad}>✗ It&apos;s in {q.country}</p>}
    </div>
  );
}

LandmarkQuizGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function LandmarkQuiz({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'landmark-quiz', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="landmark-quiz"
      title="Landmark Quiz"
      instructions="A famous landmark is shown. Tap the country where it is located."
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <LandmarkQuizGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

LandmarkQuiz.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
