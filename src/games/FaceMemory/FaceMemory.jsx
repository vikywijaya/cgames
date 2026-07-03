import { useState, useEffect, useCallback, useRef } from 'react';
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
import { useTranslation } from '../../i18n/useTranslation';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 6, faceCount: 3, studySec: 8  },
  medium: { rounds: 8, faceCount: 5, studySec: 10 },
  hard:   { rounds: 10,faceCount: 7, studySec: 10 },
};

// Only 10 face images exist (5 male, 5 female). To create much more variation
// across rounds and sessions, each face is assigned a name drawn from a large
// gender-matched name pool at session start, so face↔name pairings differ every play.
const FEMALE_IMGS = [female1, female2, female3, female4, female5];
const MALE_IMGS   = [male1, male2, male3, male4, male5];

const FEMALE_NAMES = [
  'Sarah', 'Maria', 'Linda', 'Dorothy', 'Patricia',
  'Margaret', 'Helen', 'Barbara', 'Nancy', 'Susan',
  'Carol', 'Ruth', 'Joan', 'Betty', 'Janet',
  'Alice', 'Grace', 'Rose', 'Doris', 'Evelyn',
];
const MALE_NAMES = [
  'Robert', 'George', 'James', 'William', 'David',
  'Charles', 'Thomas', 'Frank', 'Harold', 'Walter',
  'Henry', 'Albert', 'Arthur', 'Edward', 'Donald',
  'Ronald', 'Kenneth', 'Raymond', 'Eugene', 'Philip',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Assign a unique random name to every face for this session.
function buildFaceDeck() {
  const femaleNames = shuffle(FEMALE_NAMES).slice(0, FEMALE_IMGS.length);
  const maleNames   = shuffle(MALE_NAMES).slice(0, MALE_IMGS.length);
  const faces = [
    ...FEMALE_IMGS.map((img, i) => ({ img, name: femaleNames[i] })),
    ...MALE_IMGS.map((img, i) => ({ img, name: maleNames[i] })),
  ];
  return faces;
}

// Build a round that prefers faces not recently shown, so each round rotates in
// fresh faces rather than repeating 8 of 10 every time.
function buildRound(deck, faceCount, recentNames) {
  // Prefer faces not used in the most recent round; fall back to the rest.
  const fresh = deck.filter(f => !recentNames.has(f.name));
  const stale = deck.filter(f => recentNames.has(f.name));
  const ordered = [...shuffle(fresh), ...shuffle(stale)];
  const faces = ordered.slice(0, faceCount);
  // Pick one face to quiz on
  const target = faces[Math.floor(Math.random() * faces.length)];
  // 3 name distractors, preferring names of faces NOT shown this round
  const others = deck.filter(f => f.name !== target.name && !faces.some(s => s.name === f.name));
  let distNames = shuffle(others).slice(0, 3).map(f => f.name);
  if (distNames.length < 3) {
    const extra = shuffle(faces.filter(f => f.name !== target.name).map(f => f.name));
    distNames = [...distNames, ...extra].slice(0, 3);
  }
  const options = shuffle([target.name, ...distNames]);
  return { faces, target, options };
}

function FaceMemoryGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const deckRef = useRef(null);
  if (deckRef.current === null) deckRef.current = buildFaceDeck();
  const deck = deckRef.current;

  const [round,  setRound]  = useState(0);
  const [score,  setScore]  = useState(0);
  const [phase,  setPhase]  = useState('study');
  const [timer,  setTimer]  = useState(config.studySec);
  const [data,   setData]   = useState(() => buildRound(deck, config.faceCount, new Set()));
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
        const recentNames = new Set(data.faces.map(f => f.name));
        setRound(next); setPhase('study'); setTimer(config.studySec);
        setData(buildRound(deck, config.faceCount, recentNames)); setChosen(null); setFeedback(null);
      }
    }, 900);
  }, [feedback, data, score, round, config, deck, reportScore, onComplete, playClick, playSuccess, playFail]);

  if (phase === 'study') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.infoHeader}>
          <div className={styles.infoHeaderText}>
            <span className={styles.infoHeaderLabel}>{t.games['face-memory'].label}</span>
            <span className={styles.infoHeaderSub}>{t.common.round} {round + 1} {t.common.of} {config.rounds}</span>
          </div>
          <div className={styles.infoBadge}>
            <span className={styles.infoBadgeNum}>{timer}</span>
            <span className={styles.infoBadgeSub}>s</span>
          </div>
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
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderLabel}>FACE MEMORY</span>
          <span className={styles.infoHeaderSub}>{t.common.round} {round + 1} {t.common.of} {config.rounds}</span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>/ {config.rounds}</span>
        </div>
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
        {feedback === 'correct' ? t.common.correct : feedback ? `${t.games['face-memory'].wrongAnswer} ${data.target.name}` : '\u00A0'}
      </p>
    </div>
  );
}

FaceMemoryGame.propTypes = { difficulty: PropTypes.string.isRequired, onComplete: PropTypes.func.isRequired, reportScore: PropTypes.func.isRequired, secondsLeft: PropTypes.number, playClick: PropTypes.func.isRequired, playSuccess: PropTypes.func.isRequired, playFail: PropTypes.func.isRequired };

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function FaceMemory({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'face-memory', callbackUrl, onComplete });
  return (
    <GameShell gameId="face-memory" title={t.games['face-memory'].title}
      instructions={t.games['face-memory'].instructions}
      difficulty={difficulty} timeLimits={TIME_LIMITS} onGameComplete={fireCallback}
      onBack={onBack} musicMuted={musicMuted} onToggleMusic={onToggleMusic}>
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playClick, playSuccess, playFail }) => (
        <FaceMemoryGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}
FaceMemory.propTypes = { memberId: PropTypes.string.isRequired, difficulty: PropTypes.oneOf(['easy','medium','hard']), onComplete: PropTypes.func.isRequired, callbackUrl: PropTypes.string, onBack: PropTypes.func, musicMuted: PropTypes.bool, onToggleMusic: PropTypes.func };
