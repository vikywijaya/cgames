import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './QuickMaths.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * QuickMaths — pick the right answer to a sum.
 *
 * Tuned for seniors:
 * - Easy starts with picture sums (🍎🍎🍎 + 🍎🍎) that can be counted.
 * - Medium/hard mix in "missing number" questions (7 + ? = 12).
 * - Numbers grow as the game goes on.
 * - No overall clock. Medium/hard show a gentle per-question bar; answering
 *   in its first half earns a Quick bonus. Nothing happens when it runs out.
 * - Combo: correct answers in a row raise the multiplier (x2 at 5, x3 at 10).
 * - A wrong answer shows the worked sum: "7 + 5 = 12".
 */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 10, ops: ['+'],            range: [[1, 5], [2, 9]],   pictures: 5, missing: 0,    roundMs: null },
  medium: { rounds: 12, ops: ['+', '-'],       range: [[2, 12], [5, 25]], pictures: 0, missing: 0.3,  roundMs: 9000 },
  hard:   { rounds: 14, ops: ['+', '-', '×'],  range: [[2, 12], [6, 40]], pictures: 0, missing: 0.35, roundMs: 7000 },
};
const PICTURES = ['🍎', '🍊', '🍓', '🌸', '⭐', '🐟', '🎈'];
const TIMES_MAX = [6, 10]; // factor range for ×, start → end of game

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// A question: `parts` is what's shown, `answer` the missing value.
export function makeQuestion(config, index) {
  const progress = config.rounds > 1 ? index / (config.rounds - 1) : 0;
  const hi = Math.round(config.range[0][1] + (config.range[1][1] - config.range[0][1]) * progress);
  const lo = Math.round(config.range[0][0] + (config.range[1][0] - config.range[0][0]) * progress);
  const op = pick(config.ops);
  let a; let b;
  if (op === '×') {
    const m = Math.round(TIMES_MAX[0] + (TIMES_MAX[1] - TIMES_MAX[0]) * progress);
    a = rand(2, m); b = rand(2, m);
  } else {
    a = rand(lo, hi); b = rand(lo, hi);
    if (op === '-' && b > a) [a, b] = [b, a];
  }
  const result = op === '+' ? a + b : op === '-' ? a - b : a * b;
  const picture = index < config.pictures && op === '+' && result <= 10 ? pick(PICTURES) : null;
  const missing = !picture && Math.random() < config.missing;
  // Missing-number questions hide b: a op ? = result.
  const answer = missing ? b : result;

  // Plausible wrong answers: off by one or two, and the "wrong operation".
  const cands = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10];
  if (!missing) {
    if (op === '+') cands.unshift(a - b, a * b);
    if (op === '-') cands.unshift(a + b);
    if (op === '×') cands.unshift(a + b, a * (b + 1));
  }
  const wrong = [];
  for (const c of cands) {
    if (c !== answer && c >= 0 && !wrong.includes(c)) wrong.push(c);
    if (wrong.length === 3) break;
  }
  const options = [answer, ...wrong];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { a, b, op, result, answer, missing, picture, options };
}

export function perfectScore(config) {
  let total = 0;
  const bonus = config.roundMs ? 1 : 0;
  for (let i = 1; i <= config.rounds; i++) total += (1 + bonus) * comboMultiplier(i);
  return total;
}

function Pictures({ n, emoji }) {
  return (
    <span className={styles.pics} aria-label={String(n)}>
      {Array.from({ length: n }).map((_, i) => <span key={i} className={styles.pic} aria-hidden="true">{emoji}</span>)}
    </span>
  );
}
Pictures.propTypes = { n: PropTypes.number.isRequired, emoji: PropTypes.string.isRequired };

function QuickMathsGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const tq = t.games['quick-maths'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [round, setRound]   = useState(0);
  const [q, setQ]           = useState(() => makeQuestion(config, 0));
  const [phase, setPhase]   = useState('ready'); // ready | playing | result
  const [picked, setPicked] = useState(null);
  const [score, setScore]   = useState(0);
  const [streak, setStreak] = useState(0);
  const [popup, setPopup]   = useState(null);
  const [banner, setBanner] = useState(null);

  const scoreRef  = useRef(0);
  const streakRef = useRef(0);
  const doneRef   = useRef(false);
  const startedAt = useRef(0);
  const startedRound = useRef(-1);
  const timersRef = useRef(new Set());
  const idRef     = useRef(0);

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); };
  }, []);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete({ finalScore: scoreRef.current, maxScore: Math.max(perfectScore(config), scoreRef.current), completed: true });
  }, [onComplete, config]);

  const cbRef = useRef({});
  cbRef.current = { reportRound };

  useEffect(() => {
    if (countingDown || phase !== 'ready' || doneRef.current || startedRound.current === round) return;
    startedRound.current = round;
    cbRef.current.reportRound?.(round + 1, config.rounds);
    startedAt.current = Date.now();
    setPhase('playing');
  }, [countingDown, phase, round, config.rounds]);

  const showBanner = useCallback((text, tone, ms = 1100) => {
    const id = ++idRef.current;
    setBanner({ id, text, tone });
    later(() => setBanner(b => (b?.id === id ? null : b)), ms);
  }, [later]);

  const handlePick = useCallback((val) => {
    if (phase !== 'playing' || doneRef.current) return;
    playClick();
    setPicked(val);
    setPhase('result');
    const correct = val === q.answer;
    if (correct) {
      const quick = config.roundMs && Date.now() - startedAt.current <= config.roundMs / 2;
      streakRef.current += 1;
      const m = comboMultiplier(streakRef.current);
      const gained = (1 + (quick ? 1 : 0)) * m;
      scoreRef.current += gained;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      playSuccess();
      setPopup({ id: ++idRef.current, text: `+${gained}`, quick, tone: m > 1 ? `x${m}` : 'good' });
      if (m > comboMultiplier(streakRef.current - 1)) showBanner(`${tq.combo} x${m}!`, `x${m}`);
    } else {
      streakRef.current = 0;
      playFail();
    }
    setStreak(streakRef.current);
    later(() => {
      if (doneRef.current) return;
      const next = round + 1;
      if (next >= config.rounds) { finish(); return; }
      setRound(next);
      setQ(makeQuestion(config, next));
      setPicked(null);
      setPopup(null);
      setPhase('ready');
    }, correct ? 800 : 2000);
  }, [phase, q, config, round, later, finish, playClick, playSuccess, playFail, reportScore, showBanner, tq.combo]);

  const answered = phase === 'result';
  const correct = answered && picked === q.answer;
  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;

  // The slot that holds the unknown: the result, or b for missing-number.
  const slot = (
    <span className={`${styles.slot} ${answered ? (correct ? styles.slotGood : styles.slotShown) : ''}`}>
      {answered ? q.answer : '?'}
    </span>
  );

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.round} {round + 1}/{config.rounds}</span>
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${tq.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tq.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        {q.missing && <div className={styles.kindChip}>🔎 {tq.findMissing}</div>}

        <div className={styles.stage}>
          {banner && <div key={banner.id} className={`${styles.banner} ${styles[`banner_${banner.tone}`] ?? ''}`}>{banner.text}</div>}
          <div key={`q${round}`} className={`${styles.card} ${answered ? (correct ? styles.cardGood : styles.cardSoft) : ''}`}>
            {q.picture ? (
              <div className={styles.picSum}>
                <Pictures n={q.a} emoji={q.picture} />
                <span className={styles.op}>+</span>
                <Pictures n={q.b} emoji={q.picture} />
              </div>
            ) : null}
            <div className={styles.sum} aria-live="polite">
              <span className={styles.num}>{q.a}</span>
              <span className={styles.op}>{q.op}</span>
              {q.missing ? slot : <span className={styles.num}>{q.b}</span>}
              <span className={styles.op}>=</span>
              {q.missing ? <span className={styles.num}>{q.result}</span> : slot}
            </div>
            {config.roundMs && (
              <span className={styles.timerTrack} aria-hidden="true">
                <span
                  key={`t${round}${phase === 'playing'}`}
                  className={`${styles.timerFill} ${phase === 'playing' ? styles.timerRun : ''} ${answered ? styles.timerStop : ''}`}
                  style={{ '--ms': `${config.roundMs}ms` }}
                />
              </span>
            )}
            {popup && (
              <span key={popup.id} className={`${styles.floatText} ${styles[`tone_${popup.tone}`] ?? ''}`} aria-hidden="true">
                {popup.text}{popup.quick && <small className={styles.quickTag}>{tq.quick}</small>}
              </span>
            )}
          </div>
        </div>

        <p className={styles.feedback} aria-live="polite">
          {answered && correct && <span className={styles.fbGood}>{t.common.correct}</span>}
          {answered && !correct && <span className={styles.fbSoft}>{`${q.a} ${q.op} ${q.b} = ${q.result}`}</span>}
          {!answered && ' '}
        </p>

        <div className={styles.options}>
          {q.options.map((opt, i) => (
            <button
              key={`${round}-${i}`}
              type="button"
              style={{ '--idx': i }}
              className={[
                styles.opt,
                answered && opt === q.answer ? styles.optAnswer : '',
                answered && opt === picked && opt !== q.answer ? styles.optWrong : '',
                answered && opt !== q.answer && opt !== picked ? styles.optDim : '',
              ].join(' ')}
              onPointerDown={() => handlePick(opt)}
              disabled={phase !== 'playing'}
              aria-label={String(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

QuickMathsGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function QuickMaths({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tq = t.games['quick-maths'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'quick-maths', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="quick-maths"
      title={tq.title}
      instructions={difficulty === 'easy' ? tq.instructions : `${tq.instructions} ${tq.instructionsHard}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, countingDown }) => (
        <QuickMathsGame
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

QuickMaths.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
