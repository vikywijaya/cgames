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

/*
 * FaceMemory — meet a few people, then remember their names.
 *
 * Tuned for seniors:
 * - The player sets the pace: "I'm ready" ends the study time early, and
 *   the study timer is generous.
 * - Each person comes with a hobby (🌷 likes gardening): linking a name to
 *   something memorable is a proven memory aid.
 * - Each round asks about several of the people shown, not just one.
 * - A wrong name gives the hobby as a hint and a second try (1 point
 *   instead of 2); a second miss shows the right name.
 * - Combo: correct first-try answers in a row, x2 at 5 and x3 at 10.
 * - No overall clock.
 */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 5, faceCount: 3, ask: 2, studySec: 12 },
  medium: { rounds: 6, faceCount: 4, ask: 3, studySec: 15 },
  hard:   { rounds: 6, faceCount: 5, ask: 3, studySec: 16 },
};
const FIRST_TRY = 2;
const SECOND_TRY = 1;

const FEMALE_IMGS = [female1, female2, female3, female4, female5];
const MALE_IMGS   = [male1, male2, male3, male4, male5];

// Names familiar across Singapore, Malaysia and Indonesia. Each face gets a
// random gender-matched name every session, so pairings differ each play.
const FEMALE_NAMES = [
  'Siti', 'Aminah', 'Mei Ling', 'Priya', 'Nurul', 'Grace', 'Lakshmi', 'Fatimah',
  'Hui Min', 'Dewi', 'Rani', 'Sarah', 'Aisyah', 'Lily', 'Kavitha', 'Maria',
];
const MALE_NAMES = [
  'Ahmad', 'Rahman', 'Wei Ming', 'Kumar', 'Budi', 'Hassan', 'David', 'Ravi',
  'Hafiz', 'Jun Hao', 'Arjun', 'Daniel', 'Imran', 'Kenny', 'Suresh', 'Joseph',
];
// Hobby ids (see i18n `hobbies`), each with an emoji.
const HOBBIES = [
  ['gardening', '🌷'], ['cooking', '🍳'], ['singing', '🎤'], ['fishing', '🎣'],
  ['reading', '📚'], ['painting', '🎨'], ['walking', '🚶'], ['music', '🎵'],
  ['baking', '🧁'], ['cycling', '🚲'], ['chess', '♟️'], ['dancing', '💃'],
  ['tea', '🍵'], ['photos', '📷'], ['birds', '🐦'], ['sewing', '🧵'],
];

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildFaceDeck() {
  const femaleNames = shuffle(FEMALE_NAMES);
  const maleNames = shuffle(MALE_NAMES);
  const hobbies = shuffle(HOBBIES);
  return [
    ...FEMALE_IMGS.map((img, i) => ({ img, name: femaleNames[i] })),
    ...MALE_IMGS.map((img, i) => ({ img, name: maleNames[i] })),
  ].map((f, i) => ({ ...f, hobby: hobbies[i][0], hobbyIcon: hobbies[i][1] }));
}

// Prefer faces not shown in the previous round, so rounds rotate people.
function buildRound(deck, config, recentNames) {
  const fresh = deck.filter(f => !recentNames.has(f.name));
  const stale = deck.filter(f => recentNames.has(f.name));
  const faces = [...shuffle(fresh), ...shuffle(stale)].slice(0, config.faceCount);
  const questions = shuffle(faces).slice(0, config.ask).map(target => {
    // Distractors: other names from this round first (the real test), then
    // names of people not shown.
    const inRound = shuffle(faces.filter(f => f.name !== target.name).map(f => f.name));
    const outside = shuffle(deck.filter(f => !faces.includes(f)).map(f => f.name));
    const options = shuffle([target.name, ...[...inRound, ...outside].slice(0, 3)]);
    return { target, options };
  });
  return { faces, questions };
}

export function perfectScore(config) {
  let total = 0;
  const n = config.rounds * config.ask;
  for (let i = 1; i <= n; i++) total += FIRST_TRY * comboMultiplier(i);
  return total;
}

function FaceMemoryGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playReveal }) {
  const t = useTranslation();
  const tf = t.games['face-memory'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const deckRef = useRef(null);
  if (deckRef.current === null) deckRef.current = buildFaceDeck();
  const deck = deckRef.current;

  const [round, setRound]   = useState(0);
  const [data, setData]     = useState(() => buildRound(deck, config, new Set()));
  const [phase, setPhase]   = useState('study'); // study | recall | result | between
  const [timer, setTimer]   = useState(config.studySec);
  const [qIdx, setQIdx]     = useState(0);
  const [tries, setTries]   = useState(0);     // wrong tries on this question
  const [wrongNames, setWrongNames] = useState([]);
  const [outcome, setOutcome] = useState(null); // 'first' | 'second' | 'missed'
  const [score, setScore]   = useState(0);
  const [streak, setStreak] = useState(0);
  const [popup, setPopup]   = useState(null);

  const scoreRef  = useRef(0);
  const streakRef = useRef(0);
  const doneRef   = useRef(false);
  const timersRef = useRef(new Set());
  const reportedRound = useRef(-1);

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  useEffect(() => {
    if (reportedRound.current === round) return;
    reportedRound.current = round;
    reportRound?.(round + 1, config.rounds);
  }, [round, config.rounds, reportRound]);

  // Study countdown (held during the shell's 3-2-1).
  useEffect(() => {
    if (countingDown || phase !== 'study') return undefined;
    if (timer <= 0) { setPhase('recall'); playReveal?.(); return undefined; }
    const id = setTimeout(() => setTimer(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [countingDown, phase, timer, playReveal]);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete({ finalScore: scoreRef.current, maxScore: Math.max(perfectScore(config), scoreRef.current), completed: true });
  }, [onComplete, config]);

  const nextQuestion = useCallback(() => {
    if (doneRef.current) return;
    const nq = qIdx + 1;
    setTries(0);
    setWrongNames([]);
    setOutcome(null);
    setPopup(null);
    if (nq < data.questions.length) {
      setQIdx(nq);
      setPhase('recall');
      return;
    }
    const nr = round + 1;
    if (nr >= config.rounds) { finish(); return; }
    setRound(nr);
    setData(buildRound(deck, config, new Set(data.faces.map(f => f.name))));
    setQIdx(0);
    setTimer(config.studySec);
    setPhase('study');
  }, [qIdx, data, round, config, deck, finish]);

  const question = data.questions[qIdx];

  const handleChoice = useCallback((name) => {
    if (phase !== 'recall' || doneRef.current || wrongNames.includes(name)) return;
    playClick();
    if (name === question.target.name) {
      const first = tries === 0;
      if (first) streakRef.current += 1; else streakRef.current = 0;
      const m = first ? comboMultiplier(streakRef.current) : 1;
      const gained = (first ? FIRST_TRY : SECOND_TRY) * m;
      scoreRef.current += gained;
      setScore(scoreRef.current);
      setStreak(streakRef.current);
      reportScore(scoreRef.current);
      playSuccess();
      setPopup({ id: Date.now(), text: `+${gained}` });
      setOutcome(first ? 'first' : 'second');
      setPhase('result');
      later(nextQuestion, 1600);
      return;
    }
    playFail();
    streakRef.current = 0;
    setStreak(0);
    setWrongNames(w => [...w, name]);
    if (tries === 0) {
      setTries(1); // second try, with the hobby as a hint
    } else {
      setOutcome('missed');
      setPhase('result');
      later(nextQuestion, 2400);
    }
  }, [phase, question, tries, wrongNames, later, nextQuestion, playClick, playSuccess, playFail, reportScore]);

  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;

  const header = (
    <div className={styles.infoHeader}>
      <div className={styles.hudLeft}>
        <span className={styles.roundLabel}>{t.common.round} {round + 1}/{config.rounds}</span>
        <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${tf.combo} ${streak}`}>
          <span className={styles.comboMult}>x{mult}</span>
          <span className={styles.comboTrack} aria-hidden="true">
            <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
          </span>
        </div>
      </div>
      <div className={styles.infoBadge}>
        <span key={score} className={styles.infoBadgeNum}>{score}</span>
        <span className={styles.infoBadgeSub}>{tf.pts}</span>
      </div>
    </div>
  );

  if (phase === 'study') {
    return (
      <div className={styles.wrapper}>
        {header}
        <div className={styles.playArea}>
          <p className={styles.prompt}>👋 {tf.meet}</p>
          <div className={`${styles.faceGrid} ${data.faces.length === 4 ? styles.faceGrid4 : data.faces.length > 4 ? styles.faceGridMany : ''}`}>
            {data.faces.map((f, i) => (
              <div key={f.name} className={styles.faceCard} style={{ '--idx': i }}>
                <img src={f.img} alt="" className={styles.faceImg} />
                <span className={styles.faceName}>{f.name}</span>
                <span className={styles.faceHobby}>
                  <span aria-hidden="true">{f.hobbyIcon}</span> {tf.hobbies[f.hobby]}
                </span>
              </div>
            ))}
          </div>
          <div className={styles.studyBar} aria-hidden="true">
            <span className={styles.studyFill} style={{ transform: `scaleX(${timer / config.studySec})` }} />
          </div>
          <button type="button" className={styles.readyBtn} onClick={() => { playClick(); setTimer(0); }} disabled={countingDown}>
            {tf.ready} <span className={styles.readySecs}>{timer}s</span>
          </button>
        </div>
      </div>
    );
  }

  const target = question.target;
  const showHint = tries > 0 || outcome === 'missed';
  return (
    <div className={styles.wrapper}>
      {header}
      <div className={styles.playArea}>
        <p className={styles.prompt}>{tf.whoIsThis}</p>
        <div className={styles.qDots} aria-hidden="true">
          {data.questions.map((_, i) => <span key={i} className={i < qIdx ? styles.qDotDone : i === qIdx ? styles.qDotNow : styles.qDot} />)}
        </div>
        <div key={`${round}-${qIdx}`} className={`${styles.targetFace} ${outcome === 'first' || outcome === 'second' ? styles.targetGood : ''}`}>
          <img src={target.img} alt={tf.personAlt} className={styles.targetImg} />
          {popup && <span key={popup.id} className={styles.floatText} aria-hidden="true">{popup.text}</span>}
        </div>
        <p className={styles.hint} aria-live="polite">
          {showHint
            ? <><span aria-hidden="true">{target.hobbyIcon}</span> {tf.hintLikes.replace('{hobby}', tf.hobbies[target.hobby])}</>
            : ' '}
        </p>
        <div className={styles.options}>
          {question.options.map((name) => {
            const isAnswer = name === target.name;
            const wrong = wrongNames.includes(name);
            return (
              <button
                key={name}
                type="button"
                className={[
                  styles.optBtn,
                  phase === 'result' && isAnswer ? styles.optCorrect : '',
                  wrong ? styles.optWrong : '',
                ].join(' ')}
                onClick={() => handleChoice(name)}
                disabled={phase !== 'recall' || wrong}
              >
                {name}
              </button>
            );
          })}
        </div>
        <p className={styles.feedback} aria-live="polite">
          {outcome === 'first' && <span className={styles.fbGood}>{tf.rightFirst.replace('{name}', target.name)}</span>}
          {outcome === 'second' && <span className={styles.fbGood}>{tf.rightSecond.replace('{name}', target.name)}</span>}
          {outcome === 'missed' && <span className={styles.fbSoft}>{tf.thisWas.replace('{name}', target.name)}</span>}
          {!outcome && tries > 0 && <span className={styles.fbSoft}>{tf.tryAgain}</span>}
          {!outcome && tries === 0 && ' '}
        </p>
      </div>
    </div>
  );
}

FaceMemoryGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick: PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail: PropTypes.func.isRequired,
  playReveal: PropTypes.func,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function FaceMemory({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'face-memory', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="face-memory"
      title={t.games['face-memory'].title}
      instructions={t.games['face-memory'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playReveal, countingDown }) => (
        <FaceMemoryGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
          playReveal={playReveal}
        />
      )}
    </GameShell>
  );
}

FaceMemory.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
