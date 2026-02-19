import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './FaceMemory.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 6, faceCount: 3, studySec: 8  },
  medium: { rounds: 8, faceCount: 5, studySec: 10 },
  hard:   { rounds: 10,faceCount: 7, studySec: 10 },
};

const FACES = [
  { emoji: '👩‍🦰', name: 'Sarah' },  { emoji: '👨‍🦳', name: 'Robert' },
  { emoji: '👩‍🦱', name: 'Maria' },  { emoji: '👴', name: 'George' },
  { emoji: '👩‍🦲', name: 'Linda' },  { emoji: '👨‍🦱', name: 'James' },
  { emoji: '🧓', name: 'Dorothy' }, { emoji: '👨‍🦲', name: 'William' },
  { emoji: '👩', name: 'Patricia'}, { emoji: '🧔', name: 'David' },
  { emoji: '👩‍🦳', name: 'Helen' },  { emoji: '👨', name: 'Michael' },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRound(faceCount) {
  const pool = shuffle(FACES);
  const faces = pool.slice(0, faceCount);
  // Pick one face to quiz on
  const target = faces[Math.floor(Math.random() * faces.length)];
  // 3 other name distractors from pool (different from shown faces preferred)
  const distNames = shuffle(pool.slice(faceCount)).slice(0, 3).map(f => f.name);
  const options = shuffle([target.name, ...distNames]);
  return { faces, target, options };
}

function FaceMemoryGame({ difficulty, onComplete, reportScore, secondsLeft }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [round,  setRound]  = useState(0);
  const [score,  setScore]  = useState(0);
  const [phase,  setPhase]  = useState('study');
  const [timer,  setTimer]  = useState(config.studySec);
  const [data,   setData]   = useState(() => buildRound(config.faceCount));
  const [chosen, setChosen] = useState(null);
  const [feedback,setFeedback] = useState(null);

  useEffect(() => {
    if (phase !== 'study') return;
    if (timer <= 0) { setPhase('recall'); return; }
    const id = setTimeout(() => setTimer(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, timer]);

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: config.rounds, completed: false });
  }, [secondsLeft, score, config.rounds, onComplete]);

  const handleChoice = useCallback((name) => {
    if (feedback) return;
    setChosen(name);
    const correct = name === data.target.name;
    const newScore = correct ? score + 1 : score;
    if (correct) setScore(newScore);
    reportScore(newScore);
    setFeedback(correct ? 'correct' : 'wrong');
    setTimeout(() => {
      const next = round + 1;
      if (next >= config.rounds) {
        onComplete({ finalScore: newScore, maxScore: config.rounds, completed: true });
      } else {
        setRound(next); setPhase('study'); setTimer(config.studySec);
        setData(buildRound(config.faceCount)); setChosen(null); setFeedback(null);
      }
    }, 900);
  }, [feedback, data, score, round, config, reportScore, onComplete]);

  if (phase === 'study') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.meta}>
          <span>Round <strong>{round + 1}</strong> / {config.rounds}</span>
          <span className={styles.countdown}>Remember in <strong>{timer}s</strong></span>
        </div>
        <p className={styles.prompt}>Remember these people and their names!</p>
        <div className={styles.faceGrid}>
          {data.faces.map((f, i) => (
            <div key={i} className={styles.faceCard}>
              <span className={styles.faceEmoji}>{f.emoji}</span>
              <span className={styles.faceName}>{f.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span>Round <strong>{round + 1}</strong> / {config.rounds}</span>
      </div>
      <p className={styles.prompt}>What is this person's name?</p>
      <div className={styles.targetFace}>
        <span className={styles.targetEmoji}>{data.target.emoji}</span>
      </div>
      <div className={styles.options}>
        {data.options.map((name, i) => {
          let cls = styles.optBtn;
          if (feedback && name === data.target.name) cls = `${styles.optBtn} ${styles.optCorrect}`;
          else if (feedback && name === chosen) cls = `${styles.optBtn} ${styles.optWrong}`;
          return <button key={i} className={cls} onClick={() => handleChoice(name)} disabled={!!feedback}>{name}</button>;
        })}
      </div>
      {feedback && (
        <p className={feedback === 'correct' ? styles.feedbackOk : styles.feedbackBad}>
          {feedback === 'correct' ? '✓ Correct!' : `✗ That was ${data.target.name}`}
        </p>
      )}
    </div>
  );
}

FaceMemoryGame.propTypes = { difficulty: PropTypes.string.isRequired, onComplete: PropTypes.func.isRequired, reportScore: PropTypes.func.isRequired, secondsLeft: PropTypes.number };

export function FaceMemory({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'face-memory', callbackUrl, onComplete });
  return (
    <GameShell gameId="face-memory" title="Face Memory"
      instructions={`Study the faces and their names for ${config.studySec} seconds. Then identify who's who!`}
      difficulty={difficulty} timeLimitSeconds={null} onGameComplete={fireCallback}
      onBack={onBack} musicMuted={musicMuted} onToggleMusic={onToggleMusic}>
      {({ onComplete: sc, reportScore, secondsLeft }) => (
        <FaceMemoryGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} />
      )}
    </GameShell>
  );
}
FaceMemory.propTypes = { memberId: PropTypes.string.isRequired, difficulty: PropTypes.oneOf(['easy','medium','hard']), onComplete: PropTypes.func.isRequired, callbackUrl: PropTypes.string, onBack: PropTypes.func, musicMuted: PropTypes.bool, onToggleMusic: PropTypes.func };
