import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './RightTime.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * RightTime — reading an analogue clock, an everyday skill.
 *
 * Question kinds:
 *   read  — "What time does the clock show?" (every level)
 *   pick  — "Which clock shows 3:15?" with four clocks (medium, hard)
 *   later — "It's 2:30. What time will it be in 1 hour?" (hard)
 *
 * Tuned for seniors:
 * - A bright clock face with the numbers 1–12, a short dark hour hand and a
 *   long red minute hand (the old face was dark, numberless and thin).
 * - Easy starts on o'clock and half past before quarter times.
 * - No overall clock. Combo: correct answers in a row, x2 at 5, x3 at 10.
 * - A wrong answer shows the right time on the clock.
 */
const DIFFICULTY_CONFIG = {
  easy:   { questions: 8,  steps: [30, 15], kinds: ['read'] },
  medium: { questions: 10, steps: [15, 5],  kinds: ['read', 'read', 'pick'] },
  hard:   { questions: 12, steps: [5, 5],   kinds: ['read', 'pick', 'later'] },
};
const LATER_OFFSETS = [15, 30, 45, 60, 90, 120]; // minutes

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const toMin = ({ h, m }) => (h % 12) * 60 + m;
const fromMin = (t) => {
  const v = ((t % 720) + 720) % 720;
  return { h: Math.floor(v / 60) || 12, m: v % 60 };
};
const same = (a, b) => toMin(a) === toMin(b);
export const fmt = ({ h, m }) => `${h}:${String(m).padStart(2, '0')}`;

function randomTime(step) {
  return { h: 1 + Math.floor(Math.random() * 12), m: Math.floor(Math.random() * (60 / step)) * step };
}

// Distinct, readable wrong answers: the classic mix-ups (hands swapped,
// hour off by one, minutes off by a quarter) plus fillers.
function distractors(correct) {
  const out = [];
  const add = (t) => {
    if (!same(t, correct) && !out.some(o => same(o, t)) && Math.abs(toMin(t) - toMin(correct)) >= 5) out.push(t);
  };
  const swapped = { h: Math.round(correct.m / 5) || 12, m: (correct.h % 12) * 5 };
  add(swapped);
  add({ h: correct.h % 12 + 1, m: correct.m });
  add(fromMin(toMin(correct) - 60));
  add(fromMin(toMin(correct) + 15));
  add(fromMin(toMin(correct) - 15));
  add(fromMin(toMin(correct) + 30));
  return out.slice(0, 3);
}

export function makeQuestion(config, index) {
  const step = index < config.questions / 2 ? config.steps[0] : config.steps[1];
  const kind = pick(config.kinds);
  const time = randomTime(step);
  if (kind === 'later') {
    const offset = pick(LATER_OFFSETS);
    const answer = fromMin(toMin(time) + offset);
    return { kind, time, offset, answer, options: shuffle([answer, ...distractors(answer)]) };
  }
  return { kind, time, answer: time, options: shuffle([time, ...distractors(time)]) };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function perfectScore(config) {
  let total = 0;
  for (let i = 1; i <= config.questions; i++) total += comboMultiplier(i);
  return total;
}

// ── Clock face ─────────────────────────────────────────────────────
function ClockFace({ h, m, size = 220, numbers = true }) {
  const c = size / 2;
  const r = size / 2 - 6;
  const minuteAngle = (m / 60) * 360;
  const hourAngle = ((h % 12) / 12) * 360 + (m / 60) * 30;
  const polar = (deg, len) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [c + Math.cos(rad) * len, c + Math.sin(rad) * len];
  };
  const hand = (deg, len, width, color) => {
    const [x, y] = polar(deg, len);
    const [bx, by] = polar(deg + 180, len * 0.12);
    return <line x1={bx} y1={by} x2={x} y2={y} stroke={color} strokeWidth={width} strokeLinecap="round" />;
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className={styles.clockSvg}>
      <circle cx={c} cy={c} r={r} fill="#fffdf7" stroke="#334155" strokeWidth={size > 120 ? 6 : 4} />
      {Array.from({ length: 60 }, (_, i) => {
        const hourMark = i % 5 === 0;
        const [x1, y1] = polar(i * 6, r - (hourMark ? (size > 120 ? 14 : 9) : 6));
        const [x2, y2] = polar(i * 6, r - 3);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={hourMark ? '#334155' : '#cbd5e1'} strokeWidth={hourMark ? 3 : 1.5} strokeLinecap="round" />;
      })}
      {numbers && Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        // Small clocks show only 12, 3, 6 and 9, which stay readable.
        if (size <= 120 && n % 3 !== 0) return null;
        const [x, y] = polar(n * 30, r - (size > 120 ? 32 : 20));
        return (
          <text key={n} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={size > 120 ? size * 0.1 : size * 0.15} fontWeight="800" fill="#1e293b">{n}</text>
        );
      })}
      {hand(hourAngle, r * 0.5, size > 120 ? 9 : 6, '#1e293b')}
      {hand(minuteAngle, r * 0.78, size > 120 ? 5 : 3.5, '#dc2626')}
      <circle cx={c} cy={c} r={size > 120 ? 7 : 4.5} fill="#1e293b" />
      <circle cx={c} cy={c} r={size > 120 ? 3 : 2} fill="#fff" />
    </svg>
  );
}
ClockFace.propTypes = { h: PropTypes.number.isRequired, m: PropTypes.number.isRequired, size: PropTypes.number, numbers: PropTypes.bool };

function RightTimeGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const tr = t.games['right-time'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [qIndex, setQIndex] = useState(0);
  const [q, setQ]           = useState(() => makeQuestion(config, 0));
  const [chosen, setChosen] = useState(null);
  const [score, setScore]   = useState(0);
  const [streak, setStreak] = useState(0);
  const [popup, setPopup]   = useState(null);

  const scoreRef  = useRef(0);
  const streakRef = useRef(0);
  const doneRef   = useRef(false);
  const timersRef = useRef(new Set());
  const reported  = useRef(-1);

  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);
  useEffect(() => {
    if (countingDown || reported.current === qIndex) return;
    reported.current = qIndex;
    reportRound?.(qIndex + 1, config.questions);
  }, [countingDown, qIndex, config.questions, reportRound]);

  const handleChoice = useCallback((opt) => {
    if (countingDown || chosen || doneRef.current) return;
    playClick();
    setChosen(opt);
    const correct = same(opt, q.answer);
    if (correct) {
      streakRef.current += 1;
      const m = comboMultiplier(streakRef.current);
      scoreRef.current += m;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      setPopup({ id: Date.now(), text: `+${m}` });
      playSuccess();
    } else {
      streakRef.current = 0;
      playFail();
    }
    setStreak(streakRef.current);
    const h = setTimeout(() => {
      timersRef.current.delete(h);
      if (doneRef.current) return;
      const next = qIndex + 1;
      if (next >= config.questions) {
        doneRef.current = true;
        onComplete({ finalScore: scoreRef.current, maxScore: Math.max(perfectScore(config), scoreRef.current), completed: true });
        return;
      }
      setQIndex(next);
      setQ(makeQuestion(config, next));
      setChosen(null);
      setPopup(null);
    }, correct ? 900 : 2200);
    timersRef.current.add(h);
  }, [countingDown, chosen, q, qIndex, config, onComplete, reportScore, playClick, playSuccess, playFail]);

  const answered = !!chosen;
  const correct = answered && same(chosen, q.answer);
  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;

  const optClass = (opt) => [
    styles.optBtn,
    answered && same(opt, q.answer) ? styles.optCorrect : '',
    answered && same(opt, chosen) && !correct ? styles.optWrong : '',
    answered && !same(opt, q.answer) && !same(opt, chosen) ? styles.optDim : '',
  ].join(' ');

  const laterText = q.kind === 'later'
    ? tr.laterQ.replace('{time}', fmt(q.time)).replace('{wait}', q.offset % 60 === 0
      ? (q.offset === 60 ? tr.oneHour : tr.hours.replace('{n}', q.offset / 60))
      : q.offset > 60 ? tr.hoursMinutes.replace('{h}', Math.floor(q.offset / 60)).replace('{m}', q.offset % 60) : tr.minutes.replace('{n}', q.offset))
    : '';

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.question} {qIndex + 1}/{config.questions}</span>
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${tr.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tr.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        {q.kind === 'pick' ? (
          <>
            <p className={styles.prompt}>{tr.pickQ.split('{time}')[0]}<strong className={styles.bigTime}>{fmt(q.answer)}</strong>{tr.pickQ.split('{time}')[1]}</p>
            <div key={`p${qIndex}`} className={styles.clockOptions}>
              {q.options.map((opt, i) => (
                <button key={i} type="button" className={optClass(opt)} style={{ '--idx': i }} onClick={() => handleChoice(opt)} disabled={answered} aria-label={fmt(opt)}>
                  <ClockFace h={opt.h} m={opt.m} size={120} />
                  {answered && <span className={styles.clockCaption}>{fmt(opt)}</span>}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className={styles.prompt}>{q.kind === 'later' ? laterText : tr.readQ}</p>
            <div key={`c${qIndex}`} className={`${styles.clockWrap} ${answered ? (correct ? styles.clockGood : styles.clockSoft) : ''}`}>
              <ClockFace h={q.time.h} m={q.time.m} size={210} />
              {popup && <span key={popup.id} className={styles.floatText} aria-hidden="true">{popup.text}</span>}
            </div>
            {q.kind === 'read' && (
              <p className={styles.legend} aria-hidden="true">
                <span className={styles.legendHour} /> {tr.hourHand}
                <span className={styles.legendMinute} /> {tr.minuteHand}
              </p>
            )}
            <div key={`o${qIndex}`} className={styles.options}>
              {q.options.map((opt, i) => (
                <button key={i} type="button" className={optClass(opt)} style={{ '--idx': i }} onClick={() => handleChoice(opt)} disabled={answered} aria-label={fmt(opt)}>
                  {fmt(opt)}
                </button>
              ))}
            </div>
          </>
        )}

        <p className={styles.feedback} aria-live="polite">
          {answered && correct && <span className={styles.fbGood}>{t.common.correct}</span>}
          {answered && !correct && <span className={styles.fbSoft}>{tr.itWas.replace('{time}', fmt(q.answer))}</span>}
          {!answered && ' '}
        </p>
      </div>
    </div>
  );
}

RightTimeGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.oneOf(['easy', 'medium', 'hard']).isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function RightTime({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tr = t.games['right-time'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'right-time', callbackUrl, onComplete });

  return (
    <GameShell
      startCountdown
      gameId="right-time"
      title={tr.title}
      instructions={difficulty === 'easy' ? tr.instructions : `${tr.instructions} ${tr.instructionsHard}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, countingDown }) => (
        <RightTimeGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
        />
      )}
    </GameShell>
  );
}

RightTime.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
