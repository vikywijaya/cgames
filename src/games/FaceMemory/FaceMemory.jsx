import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './FaceMemory.module.css';

import female1 from '../../assets/faces/female/female1.png';
import female2 from '../../assets/faces/female/female2.png';
import female3 from '../../assets/faces/female/female3.png';
import female4 from '../../assets/faces/female/female4.png';
import female5 from '../../assets/faces/female/female5.png';
import male1 from '../../assets/faces/male/male1.png';
import male2 from '../../assets/faces/male/male2.png';
import male3 from '../../assets/faces/male/male3.png';
import male4 from '../../assets/faces/male/male4.png';
import male5 from '../../assets/faces/male/male5.png';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 6, faceCount: 3, studySec: 8  },
  medium: { rounds: 8, faceCount: 5, studySec: 10 },
  hard:   { rounds: 10,faceCount: 7, studySec: 10 },
};

const FACES = [
  { img: female1, name: 'Sarah' },
  { img: male1,   name: 'Robert' },
  { img: female2, name: 'Maria' },
  { img: male2,   name: 'George' },
  { img: female3, name: 'Linda' },
  { img: male3,   name: 'James' },
  { img: female4, name: 'Dorothy' },
  { img: male4,   name: 'William' },
  { img: female5, name: 'Patricia' },
  { img: male5,   name: 'David' },
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

function FaceMemoryGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
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
    playClick();
    setChosen(name);
    const correct = name === data.target.name;
    if (correct) { playSuccess(); } else { playFail(); }
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
  }, [feedback, data, score, round, config, reportScore, onComplete, playClick, playSuccess, playFail]);

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
              <img src={f.img} alt={f.name} className={styles.faceImg} />
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
        <img src={data.target.img} alt={data.target.name} className={styles.targetImg} />
      </div>
      <div className={styles.options}>
        {data.options.map((name, i) => {
          let cls = styles.optBtn;
          if (feedback && name === data.target.name) cls = `${styles.optBtn} ${styles.optCorrect}`;
          else if (feedback && name === chosen) cls = `${styles.optBtn} ${styles.optWrong}`;
          return <button key={i} className={cls} style={{ '--idx': i }} onClick={() => handleChoice(name)} disabled={!!feedback}>{name}</button>;
        })}
      </div>
      <p className={feedback === 'correct' ? styles.feedbackOk : feedback === 'wrong' ? styles.feedbackBad : styles.feedbackSlot}>
        {feedback === 'correct' ? '✓ Correct!' : feedback ? `✗ That was ${data.target.name}` : '\u00A0'}
      </p>
    </div>
  );
}

FaceMemoryGame.propTypes = { difficulty: PropTypes.string.isRequired, onComplete: PropTypes.func.isRequired, reportScore: PropTypes.func.isRequired, secondsLeft: PropTypes.number, playClick: PropTypes.func.isRequired, playSuccess: PropTypes.func.isRequired, playFail: PropTypes.func.isRequired };

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function FaceMemory({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'face-memory', callbackUrl, onComplete });
  return (
    <GameShell gameId="face-memory" title="Face Memory"
      instructions={`Study the faces and their names for ${config.studySec} seconds. Then identify who's who!`}
      difficulty={difficulty} timeLimits={TIME_LIMITS} onGameComplete={fireCallback}
      onBack={onBack} musicMuted={musicMuted} onToggleMusic={onToggleMusic}>
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playClick, playSuccess, playFail }) => (
        <FaceMemoryGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}
FaceMemory.propTypes = { memberId: PropTypes.string.isRequired, difficulty: PropTypes.oneOf(['easy','medium','hard']), onComplete: PropTypes.func.isRequired, callbackUrl: PropTypes.string, onBack: PropTypes.func, musicMuted: PropTypes.bool, onToggleMusic: PropTypes.func };
