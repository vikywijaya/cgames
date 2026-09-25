import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './NumberSort.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * NumberSort — tap the numbers in order.
 * Each correct tap drops the number onto a number line and plays the next
 * note of a rising scale, so a finished round sounds like a little tune.
 *
 * Tuned for seniors:
 * - A wrong tap no longer wipes the round: the tiles already placed stay,
 *   the wrong tile shakes, and the right next number pulses as a hint.
 * - Medium/hard mix in "largest to smallest" rounds, announced first.
 * - Hard uses lookalike numbers (150 / 105 / 115 / 501) in some rounds.
 * - Points: +1 per correct tap (times the combo), +2 for a round with no
 *   mistakes. Combo: correct taps in a row, x2 at 5 and x3 at 10.
 * - No overall clock.
 */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  count: [4, 5], maxVal: [20, 30],   reverse: 0,    lookalike: 0 },
  medium: { rounds: 10, count: [5, 6], maxVal: [50, 100],  reverse: 0.3,  lookalike: 0 },
  hard:   { rounds: 12, count: [6, 7], maxVal: [100, 999], reverse: 0.35, lookalike: 0.4 },
};
const PERFECT_BONUS = 2;
// C major scale, one note per correct tap.
const SCALE = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];

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

// Numbers made of the same digits, e.g. 150 / 105 / 510 / 501.
function lookalikes(count) {
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 2).concat([0]);
  const out = new Set();
  const perms = [];
  for (const a of digits) for (const b of digits) for (const c of digits) {
    if (a !== 0 && new Set([a, b, c]).size >= 2) perms.push(a * 100 + b * 10 + c);
  }
  for (const n of shuffle(perms)) {
    out.add(n);
    if (out.size === count) break;
  }
  return [...out];
}

export function makeRound(config, index) {
  const progress = config.rounds > 1 ? index / (config.rounds - 1) : 0;
  const count = progress < 0.5 ? config.count[0] : config.count[1];
  const max = Math.round(config.maxVal[0] + (config.maxVal[1] - config.maxVal[0]) * progress);
  let nums;
  if (Math.random() < config.lookalike) {
    nums = lookalikes(count);
  } else {
    const s = new Set();
    while (s.size < count) s.add(1 + Math.floor(Math.random() * max));
    nums = [...s];
  }
  const reverse = index > 0 && Math.random() < config.reverse;
  const order = [...nums].sort((a, b) => (reverse ? b - a : a - b));
  return { nums: shuffle(nums), order, reverse };
}

function NumberSortGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playNote, playReveal }) {
  const t = useTranslation();
  const tn = t.games['number-sort'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [roundIdx, setRoundIdx] = useState(0);
  const [round, setRound]   = useState(() => makeRound(config, 0));
  const [placed, setPlaced] = useState([]);    // values placed so far, in order
  const [wrongVal, setWrongVal] = useState(null);
  const [hint, setHint]     = useState(false); // pulse the right next number
  const [phase, setPhase]   = useState('ready'); // ready | playing | done
  const [mistakes, setMistakes] = useState(0);
  const [score, setScore]   = useState(0);
  const [streak, setStreak] = useState(0);
  const [banner, setBanner] = useState(null);
  const [popups, setPopups] = useState([]);

  const scoreRef   = useRef(0);
  const streakRef  = useRef(0);
  const placedRef  = useRef([]);
  const mistakesRef = useRef(0);
  const phaseRef   = useRef('ready');
  phaseRef.current = phase;
  const perfectRef = useRef(0);
  const perfectStreakRef = useRef(0);
  const doneRef    = useRef(false);
  const startedRound = useRef(-1);
  const timersRef  = useRef(new Set());
  const idRef      = useRef(0);

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
    onComplete({ finalScore: scoreRef.current, maxScore: Math.max(perfectRef.current, scoreRef.current, 1), completed: true });
  }, [onComplete]);

  const cbRef = useRef({});
  cbRef.current = { reportRound, playReveal };

  const showBanner = useCallback((text, tone, ms = 1100) => {
    const id = ++idRef.current;
    setBanner({ id, text, tone });
    later(() => setBanner(b => (b?.id === id ? null : b)), ms);
  }, [later]);

  // Start each round; announce reverse rounds before they can be played.
  useEffect(() => {
    if (countingDown || phase !== 'ready' || doneRef.current || startedRound.current === roundIdx) return;
    startedRound.current = roundIdx;
    cbRef.current.reportRound?.(roundIdx + 1, config.rounds);
    for (let i = 0; i < round.nums.length; i++) {
      perfectStreakRef.current += 1;
      perfectRef.current += comboMultiplier(perfectStreakRef.current);
    }
    perfectRef.current += PERFECT_BONUS;
    const begin = () => { if (!doneRef.current) setPhase('playing'); };
    if (round.reverse) {
      cbRef.current.playReveal?.();
      showBanner(tn.reverseBanner, 'reverse', 1100);
      later(begin, 1100);
    } else begin();
  }, [countingDown, phase, roundIdx, round, config.rounds, later, showBanner, tn.reverseBanner]);

  const handleTap = useCallback((val) => {
    const placedNow = placedRef.current;
    if (phaseRef.current !== 'playing' || doneRef.current || placedNow.includes(val)) return;
    const expected = round.order[placedNow.length];
    if (val !== expected) {
      playClick();
      playFail();
      streakRef.current = 0;
      setStreak(0);
      mistakesRef.current += 1;
      setMistakes(mistakesRef.current);
      setWrongVal(val);
      setHint(true);
      later(() => setWrongVal(w => (w === val ? null : w)), 400);
      return;
    }
    const next = [...placedNow, val];
    placedRef.current = next;
    setPlaced(next);
    setHint(false);
    playNote?.(SCALE[Math.min(SCALE.length - 1, next.length - 1)], 0.35);
    streakRef.current += 1;
    const m = comboMultiplier(streakRef.current);
    scoreRef.current += m;
    const id = ++idRef.current;
    setPopups(prev => [...prev, { id, val, text: `+${m}`, tone: m > 1 ? `x${m}` : 'good' }]);
    later(() => setPopups(prev => prev.filter(p => p.id !== id)), 800);
    if (m > comboMultiplier(streakRef.current - 1)) showBanner(`${tn.combo} x${m}!`, `x${m}`);

    if (next.length === round.order.length) {
      const perfect = mistakesRef.current === 0;
      if (perfect) scoreRef.current += PERFECT_BONUS;
      phaseRef.current = 'done';
      setPhase('done');
      later(() => playSuccess(), 300);
      if (perfect) showBanner(`${tn.perfect} +${PERFECT_BONUS}`, 'perfect', 1000);
      later(() => {
        if (doneRef.current) return;
        const n = roundIdx + 1;
        if (n >= config.rounds) { finish(); return; }
        placedRef.current = [];
        mistakesRef.current = 0;
        setRoundIdx(n);
        setRound(makeRound(config, n));
        setPlaced([]);
        setMistakes(0);
        setHint(false);
        setPhase('ready');
      }, 1500);
    }
    setScore(scoreRef.current);
    setStreak(streakRef.current);
    reportScore(scoreRef.current);
  }, [round, roundIdx, config, later, finish, playClick, playFail, playNote, playSuccess, reportScore, showBanner, tn.combo, tn.perfect]);

  const expected = round.order[placed.length];
  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;
  const cols = round.nums.length <= 4 ? 2 : 3;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.round} {roundIdx + 1}/{config.rounds}</span>
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${tn.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tn.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <div key={`rule${roundIdx}`} className={`${styles.rule} ${round.reverse ? styles.ruleDown : styles.ruleUp}`}>
          <span className={styles.ruleIcon} aria-hidden="true">{round.reverse ? '⬇️' : '⬆️'}</span>
          {round.reverse ? tn.largestFirst : tn.smallestFirst}
        </div>

        <div className={styles.board}>
          {banner && <div key={banner.id} className={`${styles.banner} ${styles[`banner_${banner.tone}`] ?? ''}`}>{banner.text}</div>}
          <div key={`g${roundIdx}`} className={styles.grid} style={{ '--cols': cols }}>
            {round.nums.map((num, i) => {
              const order = placed.indexOf(num);
              const isPlaced = order !== -1;
              return (
                <button
                  key={num}
                  type="button"
                  style={{ '--idx': i }}
                  className={[
                    styles.tile,
                    isPlaced ? styles.tilePlaced : '',
                    wrongVal === num ? styles.tileWrong : '',
                    hint && phase === 'playing' && num === expected ? styles.tileHint : '',
                  ].join(' ')}
                  onPointerDown={() => handleTap(num)}
                  disabled={phase !== 'playing' || isPlaced}
                  aria-label={`${tn.number} ${num}`}
                >
                  {isPlaced && <span className={styles.orderBadge}>{order + 1}</span>}
                  <span className={styles.tileNum}>{num}</span>
                  {popups.filter(p => p.val === num).map(p => (
                    <span key={p.id} className={`${styles.floatText} ${styles[`tone_${p.tone}`] ?? ''}`} aria-hidden="true">{p.text}</span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>

        {/* The number line fills up as the numbers are placed */}
        <div className={`${styles.line} ${phase === 'done' ? styles.lineDone : ''}`} aria-label={tn.lineLabel}>
          {round.order.map((n, i) => (
            <span key={`${roundIdx}-${i}`} className={`${styles.lineSlot} ${i < placed.length ? styles.lineSlotFull : ''}`} style={{ '--i': i }}>
              {i < placed.length ? placed[i] : ''}
            </span>
          ))}
        </div>

        <p className={styles.feedback} aria-live="polite">
          {hint && phase === 'playing' && <span className={styles.fbHint}>💡 {tn.hint}</span>}
          {phase === 'done' && <span className={styles.fbGood}>{mistakes === 0 ? tn.perfect : t.common.correct}</span>}
          {!(hint && phase === 'playing') && phase !== 'done' && ' '}
        </p>
      </div>
    </div>
  );
}

NumberSortGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playNote:    PropTypes.func,
  playReveal:  PropTypes.func,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function NumberSort({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tn = t.games['number-sort'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'number-sort', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="number-sort"
      title={tn.title}
      instructions={difficulty === 'easy' ? tn.instructions : `${tn.instructions} ${tn.instructionsHard}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playNote, playReveal, countingDown }) => (
        <NumberSortGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
          playNote={playNote}
          playReveal={playReveal}
        />
      )}
    </GameShell>
  );
}

NumberSort.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
