import { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './SpeedTap.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * Mechanic overview (tuned for seniors)
 * - A "Find this" card shows the target; tap it in the grid.
 * - The round timer drains on the card. Tapping in the first half of the
 *   time earns a Quick bonus (+1).
 * - Combo: correct taps in a row raise the multiplier (x2 at 5, x3 at 10).
 *   A wrong tap or a timeout only resets it — and shows where it was.
 * - The game grows as it goes: the grid gets bigger and, on medium/hard,
 *   the decoys start to look like the target (🍎 among 🍅🍒🍓).
 * - Every 5th round is "Find them all!": 2–3 copies hide in the grid.
 */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 10, roundMs: 6000, sizes: [4, 4, 6],   lookalikeFrom: 1.1, findAll: 2, timeLimitSeconds: null },
  medium: { rounds: 12, roundMs: 4500, sizes: [6, 6, 9],   lookalikeFrom: 0.4, findAll: 3, timeLimitSeconds: null },
  hard:   { rounds: 15, roundMs: 3500, sizes: [9, 9, 12],  lookalikeFrom: 0.2, findAll: 3, timeLimitSeconds: null },
};

// Groups of emoji that look alike, used as tricky decoys later on. Kept
// telling-apart-able: near-identical sets (⭐/🌟, 🐤/🐥) were too hard.
const LOOKALIKES = [
  ['🍎', '🍅', '🍒', '🍓'],
  ['🍊', '🍑', '🥭', '🍋'],
  ['🐶', '🐱', '🐻', '🐼', '🐨'],
  ['🚗', '🚕', '🚙', '🚌'],
  ['🌸', '🌼', '🌻', '🌺'],
  ['🍇', '🫐', '🍆'],
  ['⚽', '🏀', '🏐', '🎾'],
  ['🐟', '🐠', '🐡', '🐬'],
  ['🎈', '🎀', '🎁', '🧸'],
];
const ALL = [...new Set(LOOKALIKES.flat())];
const FIND_ALL_EVERY = 5;
const FEEDBACK_MS = 900;

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildRound(config, index) {
  const progress = index / config.rounds;
  const size = config.sizes[Math.min(config.sizes.length - 1, Math.floor(progress * config.sizes.length))];
  const findAll = (index + 1) % FIND_ALL_EVERY === 0;
  const targets = findAll ? config.findAll : 1;
  const group = pick(LOOKALIKES);
  const target = pick(group);
  const tricky = progress >= config.lookalikeFrom;
  // Tricky rounds: most decoys from the target's lookalike group.
  const alike = group.filter(e => e !== target);
  const unlike = ALL.filter(e => !group.includes(e));
  const decoys = Array.from({ length: size - targets }, (_, i) =>
    tricky && (i < alike.length * 2) ? alike[i % alike.length] : pick(unlike));
  const cells = shuffle([...Array(targets).fill(target), ...decoys]).map((emoji, i) => ({ id: i, emoji, hit: false }));
  return { target, cells, targets, findAll, tricky };
}

function SpeedTapGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playReveal }) {
  const t = useTranslation();
  const tt = t.games['speed-tap'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [roundIdx, setRoundIdx] = useState(0);
  const [round, setRound]       = useState(() => buildRound(config, 0));
  const [phase, setPhase]       = useState('ready'); // ready | playing | result
  const [result, setResult]     = useState(null);    // 'correct' | 'wrong' | 'miss'
  const [wrongId, setWrongId]   = useState(null);
  const [score, setScore]       = useState(0);
  const [streak, setStreak]     = useState(0);
  const [effects, setEffects]   = useState([]);
  const [banner, setBanner]     = useState(null);

  const scoreRef   = useRef(0);
  const streakRef  = useRef(0);
  const perfectRef = useRef(0);
  const perfectStreakRef = useRef(0);
  const foundRef   = useRef(0);
  const startedAt  = useRef(0);
  const doneRef    = useRef(false);
  const roundTimer = useRef(null);
  const timersRef  = useRef(new Set());
  const idRef      = useRef(0);
  const roundIdxRef = useRef(0);
  const startedRoundRef = useRef(-1); // guards the round start against double effects

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
  }, []);
  useEffect(() => {
    const timers = timersRef.current;
    return () => { timers.forEach(clearTimeout); timers.clear(); clearTimeout(roundTimer.current); };
  }, []);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimeout(roundTimer.current);
    onComplete({ finalScore: scoreRef.current, maxScore: Math.max(perfectRef.current, scoreRef.current, 1), completed: true });
  }, [onComplete]);

  const cbRef = useRef({});
  cbRef.current = { finish, playFail, playSuccess, playReveal, reportScore, reportRound };

  const addEffect = useCallback((fx, ms = 900) => {
    const id = ++idRef.current;
    setEffects(prev => [...prev, { ...fx, id }]);
    later(() => setEffects(prev => prev.filter(e => e.id !== id)), ms);
  }, [later]);

  const showBanner = useCallback((text, tone, ms = 1100) => {
    const id = ++idRef.current;
    setBanner({ id, text, tone });
    later(() => setBanner(b => (b?.id === id ? null : b)), ms);
  }, [later]);

  const endRound = useCallback((outcome) => {
    clearTimeout(roundTimer.current);
    setResult(outcome);
    setPhase('result');
    later(() => {
      if (doneRef.current) return;
      const next = roundIdxRef.current + 1;
      if (next >= config.rounds) { cbRef.current.finish(); return; }
      roundIdxRef.current = next;
      setRoundIdx(next);
      setRound(buildRound(config, next));
      setResult(null);
      setWrongId(null);
      setPhase('ready');
    }, outcome === 'correct' ? FEEDBACK_MS - 200 : FEEDBACK_MS + 500);
  }, [config, later]);

  // Start each round once the countdown is over.
  useEffect(() => {
    if (countingDown || phase !== 'ready' || doneRef.current) return;
    if (startedRoundRef.current === roundIdx) return;
    startedRoundRef.current = roundIdx;
    // Count this round's targets towards the perfect score.
    for (let i = 0; i < round.targets; i++) {
      perfectStreakRef.current += 1;
      perfectRef.current += 2 * comboMultiplier(perfectStreakRef.current);
    }
    foundRef.current = 0;
    startedAt.current = Date.now();
    setPhase('playing');
    cbRef.current.reportRound?.(roundIdx + 1, config.rounds);
    if (round.findAll) {
      cbRef.current.playReveal?.();
      showBanner(tt.findAll, 'all', 1200);
    }
    roundTimer.current = setTimeout(() => {
      if (doneRef.current) return;
      cbRef.current.playFail();
      streakRef.current = 0;
      setStreak(0);
      endRound('miss');
    }, config.roundMs);
  }, [countingDown, phase, round, roundIdx, config, endRound, showBanner, tt.findAll]);

  const handleTap = useCallback((cell) => {
    if (phase !== 'playing' || doneRef.current || cell.hit) return;
    playClick();
    if (cell.emoji !== round.target) {
      playFail();
      streakRef.current = 0;
      setStreak(0);
      setWrongId(cell.id);
      endRound('wrong');
      return;
    }

    const elapsed = Date.now() - startedAt.current;
    const quick = elapsed <= config.roundMs / 2;
    streakRef.current += 1;
    const m = comboMultiplier(streakRef.current);
    const gained = (1 + (quick ? 1 : 0)) * m;
    scoreRef.current += gained;
    setScore(scoreRef.current);
    setStreak(streakRef.current);
    reportScore(scoreRef.current);
    playSuccess();
    addEffect({ cellId: cell.id, text: `+${gained}`, sub: quick ? tt.quick : null, tone: m > 1 ? `x${m}` : 'good' });
    if (m > comboMultiplier(streakRef.current - 1)) showBanner(`${tt.combo} x${m}!`, `x${m}`);

    setRound(r => ({ ...r, cells: r.cells.map(c => (c.id === cell.id ? { ...c, hit: true } : c)) }));
    foundRef.current += 1;
    if (foundRef.current >= round.targets) endRound('correct');
  }, [phase, round, config.roundMs, playClick, playFail, playSuccess, reportScore, addEffect, showBanner, endRound, tt.quick, tt.combo]);

  const n = round.cells.length;
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;
  const showAnswer = phase === 'result' && result !== 'correct';

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{tt.round} {Math.min(roundIdx + 1, config.rounds)}/{config.rounds}</span>
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${tt.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tt.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        {/* Find-this card with the draining round timer */}
        <div
          key={`card${roundIdx}`}
          className={`${styles.targetCard} ${round.findAll ? styles.targetCardAll : ''} ${phase === 'result' ? styles[`card_${result}`] : ''}`}
        >
          <div className={styles.targetText}>
            <span className={styles.targetHint}>{round.findAll ? tt.findAllHint.replace('{n}', round.targets) : tt.findThis}</span>
            {round.findAll && phase !== 'ready' && (
              <span className={styles.foundDots} aria-hidden="true">
                {Array.from({ length: round.targets }).map((_, i) => (
                  <span key={i} className={i < round.cells.filter(c => c.hit).length ? styles.foundDotOn : styles.foundDot} />
                ))}
              </span>
            )}
          </div>
          <span className={styles.targetEmoji}>{round.target}</span>
          <span className={styles.timerTrack} aria-hidden="true">
            <span
              key={`t${roundIdx}${phase === 'playing'}`}
              className={`${styles.timerFill} ${phase === 'playing' ? styles.timerRun : ''} ${phase === 'result' ? styles.timerStop : ''}`}
              style={{ '--ms': `${config.roundMs}ms` }}
            />
          </span>
        </div>

        <p className={styles.feedback} aria-live="polite">
          {phase === 'result' && result === 'correct' && <span className={styles.fbGood}>{t.common.great}</span>}
          {phase === 'result' && result === 'wrong' && <span className={styles.fbSoft}>{tt.itWasHere}</span>}
          {phase === 'result' && result === 'miss' && <span className={styles.fbSoft}>{tt.itWasHere}</span>}
          {phase !== 'result' && ' '}
        </p>

        <div className={styles.board}>
          {banner && (
            <div key={banner.id} className={`${styles.banner} ${styles[`banner_${banner.tone}`] ?? ''}`}>{banner.text}</div>
          )}
          <div key={`g${roundIdx}`} className={styles.grid} style={{ '--cols': cols }}>
            {round.cells.map((cell, i) => {
              const isTarget = cell.emoji === round.target;
              const fx = effects.filter(e => e.cellId === cell.id);
              return (
                <button
                  key={cell.id}
                  type="button"
                  style={{ '--idx': i }}
                  className={[
                    styles.cell,
                    cell.hit ? styles.cellHit : '',
                    wrongId === cell.id ? styles.cellWrong : '',
                    showAnswer && isTarget && !cell.hit ? styles.cellReveal : '',
                    showAnswer && !isTarget && wrongId !== cell.id ? styles.cellDim : '',
                  ].join(' ')}
                  onPointerDown={() => handleTap(cell)}
                  disabled={phase !== 'playing'}
                  aria-label={cell.emoji}
                >
                  <span className={styles.cellEmoji}>{cell.emoji}</span>
                  {fx.map(e => (
                    <span key={e.id} className={`${styles.floatText} ${styles[`tone_${e.tone}`] ?? ''}`} aria-hidden="true">
                      {e.text}
                      {e.sub && <small className={styles.quickTag}>{e.sub}</small>}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

SpeedTapGame.propTypes = {
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

// Round-based: each round has its own visible timer, so no overall clock.
const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function SpeedTap({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tt = t.games['speed-tap'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'speed-tap', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="speed-tap"
      title={tt.title}
      instructions={difficulty === 'easy' ? tt.instructions : `${tt.instructions} ${tt.instructionsHard}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playReveal, countingDown }) => (
        <SpeedTapGame
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

SpeedTap.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
