import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './MissingNumber.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * MissingNumber — numbers on stepping stones follow a pattern; find the one
 * that's missing.
 *
 * Patterns: counting up (every level), counting down (medium, hard),
 * doubling (hard).
 *
 * Tuned for seniors:
 * - After a few seconds a hint shows the first step (e.g. "+3").
 * - After answering, every step between the stones is shown, so the
 *   pattern is learned, not just marked right or wrong.
 * - +2 per answer (+1 if the hint was showing); combo x2 at 5, x3 at 10.
 * - No overall clock.
 */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  len: 5, steps: [1, 2, 5, 10],      patterns: ['up'],                 hintMs: 7000 },
  medium: { rounds: 10, len: 5, steps: [2, 3, 4, 5, 10],   patterns: ['up', 'up', 'down'],   hintMs: 8000 },
  hard:   { rounds: 12, len: 6, steps: [3, 4, 6, 7, 9, 11], patterns: ['up', 'down', 'double'], hintMs: 9000 },
};
const POINTS = 2;
const HINT_POINTS = 1;

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function makePuzzle(config) {
  const pattern = pick(config.patterns);
  let seq;
  let stepLabel;
  if (pattern === 'double') {
    const start = pick([1, 2, 3, 5]);
    seq = Array.from({ length: config.len }, (_, i) => start * 2 ** i);
    stepLabel = '×2';
  } else {
    const step = pick(config.steps);
    const down = pattern === 'down';
    const start = down ? step * (config.len - 1) + 1 + Math.floor(Math.random() * 20) : 1 + Math.floor(Math.random() * 12);
    seq = Array.from({ length: config.len }, (_, i) => start + (down ? -step : step) * i);
    stepLabel = `${down ? '−' : '+'}${step}`;
  }
  // Blank anything but the first two, so the first step is always visible.
  const blank = 2 + Math.floor(Math.random() * (config.len - 2));
  const answer = seq[blank];
  const diff = Math.abs(seq[1] - seq[0]);
  const cands = [answer + 1, answer - 1, answer + diff, answer - diff, answer + 2, answer - 2, answer + 10, answer - 10, answer + 3];
  const wrong = [];
  for (const c of cands) {
    // Never offer a number that's already on a stone.
    if (c !== answer && c >= 0 && !wrong.includes(c) && !seq.includes(c)) wrong.push(c);
    if (wrong.length === 3) break;
  }
  const options = [answer, ...wrong];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { seq, blank, answer, options, stepLabel };
}

export function perfectScore(config) {
  let total = 0;
  for (let i = 1; i <= config.rounds; i++) total += POINTS * comboMultiplier(i);
  return total;
}

function MissingNumberGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playReveal }) {
  const t = useTranslation();
  const tm = t.games['missing-number'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [round, setRound]   = useState(0);
  const [puzzle, setPuzzle] = useState(() => makePuzzle(config));
  const [picked, setPicked] = useState(null);
  const [hint, setHint]     = useState(false);
  const [score, setScore]   = useState(0);
  const [streak, setStreak] = useState(0);
  const [popup, setPopup]   = useState(null);

  const scoreRef  = useRef(0);
  const streakRef = useRef(0);
  const doneRef   = useRef(false);
  const timersRef = useRef(new Set());
  const hintTimer = useRef(null);
  const started   = useRef(-1);

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
    return h;
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  useEffect(() => {
    if (countingDown || started.current === round) return;
    started.current = round;
    reportRound?.(round + 1, config.rounds);
    hintTimer.current = later(() => { setHint(true); playReveal?.(); }, config.hintMs);
  }, [countingDown, round, config, later, reportRound, playReveal]);

  const handlePick = useCallback((val) => {
    if (countingDown || picked !== null || doneRef.current) return;
    clearTimeout(hintTimer.current);
    playClick();
    setPicked(val);
    const correct = val === puzzle.answer;
    if (correct) {
      streakRef.current += 1;
      const m = comboMultiplier(streakRef.current);
      const gained = (hint ? HINT_POINTS : POINTS) * m;
      scoreRef.current += gained;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      setPopup({ id: Date.now(), text: `+${gained}` });
      playSuccess();
    } else {
      streakRef.current = 0;
      playFail();
    }
    setStreak(streakRef.current);
    later(() => {
      if (doneRef.current) return;
      const next = round + 1;
      if (next >= config.rounds) {
        doneRef.current = true;
        onComplete({ finalScore: scoreRef.current, maxScore: Math.max(perfectScore(config), scoreRef.current), completed: true });
        return;
      }
      setRound(next);
      setPuzzle(makePuzzle(config));
      setPicked(null);
      setHint(false);
      setPopup(null);
    }, correct ? 1300 : 2400);
  }, [countingDown, picked, puzzle, hint, round, config, later, onComplete, reportScore, playClick, playSuccess, playFail]);

  const answered = picked !== null;
  const correct = answered && picked === puzzle.answer;
  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.round} {round + 1}/{config.rounds}</span>
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${tm.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tm.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <p className={styles.prompt}>{tm.prompt}</p>

        <div key={`s${round}`} className={styles.path}>
          {puzzle.seq.map((n, i) => {
            const isBlank = i === puzzle.blank;
            const showStep = i > 0 && (answered || (hint && i === 1));
            return (
              <div key={i} className={styles.stoneWrap} style={{ '--idx': i }}>
                <span className={`${styles.step} ${showStep ? styles.stepOn : ''}`} aria-hidden={!showStep}>
                  {showStep ? puzzle.stepLabel : ''}
                </span>
                <span className={[
                  styles.stone,
                  isBlank ? styles.stoneBlank : '',
                  isBlank && answered ? (correct ? styles.stoneGood : styles.stoneShown) : '',
                ].join(' ')}>
                  {isBlank ? (answered ? puzzle.answer : '?') : n}
                  {isBlank && popup && <span key={popup.id} className={styles.floatText} aria-hidden="true">{popup.text}</span>}
                </span>
              </div>
            );
          })}
        </div>

        <p className={styles.hint} aria-live="polite">
          {hint && !answered ? `💡 ${tm.hint.replace('{step}', puzzle.stepLabel)}` : ' '}
        </p>

        <div key={`o${round}`} className={styles.options}>
          {puzzle.options.map((opt, i) => (
            <button
              key={i}
              type="button"
              style={{ '--idx': i }}
              className={[
                styles.optBtn,
                answered && opt === puzzle.answer ? styles.optCorrect : '',
                answered && opt === picked && opt !== puzzle.answer ? styles.optWrong : '',
                answered && opt !== puzzle.answer && opt !== picked ? styles.optDim : '',
              ].join(' ')}
              onClick={() => handlePick(opt)}
              disabled={answered}
              aria-label={String(opt)}
            >
              {opt}
            </button>
          ))}
        </div>

        <p className={styles.feedback} aria-live="polite">
          {answered && correct && <span className={styles.fbGood}>{tm.right.replace('{step}', puzzle.stepLabel)}</span>}
          {answered && !correct && <span className={styles.fbSoft}>{tm.itWas.replace('{n}', puzzle.answer).replace('{step}', puzzle.stepLabel)}</span>}
          {!answered && ' '}
        </p>
      </div>
    </div>
  );
}

MissingNumberGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playReveal:  PropTypes.func,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function MissingNumber({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tm = t.games['missing-number'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'missing-number', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="missing-number"
      title={tm.title}
      instructions={difficulty === 'easy' ? tm.instructions : `${tm.instructions} ${tm.instructionsHard}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playReveal, countingDown }) => (
        <MissingNumberGame
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

MissingNumber.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
