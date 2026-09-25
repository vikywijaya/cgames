import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './OddOneOut.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * OddOneOut — tap the one picture that doesn't belong.
 *
 * Kinds of "odd", mixed through the game (harder kinds on harder levels):
 *   category — a vegetable among fruit (every level)
 *   colour   — 💙 among ❤️ (every level)
 *   facing   — one fish facing the other way (medium, hard)
 *   size     — one a little bigger (hard)
 *
 * Tuned for seniors:
 * - No overall clock. If a player is stuck, a hint fades half of the
 *   wrong pictures after a few seconds (the answer is then worth 1, not 2).
 * - Every answer shows why, e.g. "It's a vegetable!".
 * - Combo: correct answers in a row raise the multiplier (x2 at 5, x3 at 10).
 * - Grids stay large enough to see: 3×3, 4×4, 4×4.
 */
const DIFFICULTY_CONFIG = {
  easy:   { questions: 8,  gridSize: 3, kinds: ['category', 'colour'],                   hintMs: 6000 },
  medium: { questions: 10, gridSize: 4, kinds: ['category', 'colour', 'facing'],         hintMs: 7000 },
  hard:   { questions: 12, gridSize: 4, kinds: ['category', 'colour', 'facing', 'size'], hintMs: 8000 },
};
const POINTS = 2;
const HINT_POINTS = 1;

// Category sets: each group is ONE category and each odd a clearly
// different one, so there is exactly one defensible answer. `why` names
// the odd item's category (an i18n key).
const CATEGORY_SETS = [
  { group: ['🍎','🍊','🍋','🍇','🍓','🍑','🍒','🍉','🥭','🍍','🍌','🍐'], odd: ['🥕','🥦','🧅','🥬','🌽','🥒'], why: 'vegetable' },
  { group: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮'], odd: ['🐟','🦈','🐬','🐙','🦞','🐠'], why: 'seaCreature' },
  { group: ['🚗','🚕','🚙','🚌','🚎','🚓','🚑','🚒','🛻','🚐','🚜','🚚'], odd: ['✈️','🚀','🚁'], why: 'flies' },
  { group: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉'], odd: ['🎻','🥁','🎸','🎺','🎷'], why: 'instrument' },
  { group: ['🌹','🌷','🌸','🌺','🌻','🌼'], odd: ['🌊','🌈','⚡','⛄'], why: 'notFlower' },
  { group: ['🍕','🍔','🌮','🌯','🥪','🥗','🍜','🍣','🌭','🍟'], odd: ['🎂','🍰','🍩','🍪','🧁'], why: 'sweet' },
];
// Colour sets: same shape, one in a different colour.
const COLOUR_SETS = [
  ['❤️', '💙'], ['💚', '💛'], ['🔴', '🔵'], ['🟩', '🟧'], ['🍎', '🍏'], ['📕', '📗'], ['🟦', '🟨'], ['💜', '🧡'],
];
// Pictures with a clear facing direction, for the mirrored kind.
const FACING = ['🐟', '🚗', '🐌', '🐘', '🦆', '🚲', '🐎', '🐢', '🚜', '🦒'];
const SIZE_ITEMS = ['🍎', '⭐', '🌸', '🐱', '⚽', '🎈', '🍩', '🌻'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

// Returns { cells: [{ emoji, mod }], oddIndex, kind, why }.
// mod: null | 'flip' | 'big'
export function buildQuestion(config, prevKind) {
  const total = config.gridSize * config.gridSize;
  // Avoid the same kind twice in a row when there's a choice.
  const kinds = config.kinds.length > 1 ? config.kinds.filter(k => k !== prevKind) : config.kinds;
  const kind = pick(kinds);
  let cells;
  let why = kind;
  if (kind === 'category') {
    const set = pick(CATEGORY_SETS);
    const majors = [];
    while (majors.length < total - 1) majors.push(...shuffle(set.group).slice(0, total - 1 - majors.length));
    cells = [...majors.map(e => ({ emoji: e, mod: null })), { emoji: pick(set.odd), mod: null, odd: true }];
    why = set.why;
  } else if (kind === 'colour') {
    const [a, b] = shuffle(pick(COLOUR_SETS));
    cells = [...Array(total - 1).fill(null).map(() => ({ emoji: a, mod: null })), { emoji: b, mod: null, odd: true }];
  } else if (kind === 'facing') {
    const e = pick(FACING);
    cells = [...Array(total - 1).fill(null).map(() => ({ emoji: e, mod: null })), { emoji: e, mod: 'flip', odd: true }];
  } else {
    const e = pick(SIZE_ITEMS);
    cells = [...Array(total - 1).fill(null).map(() => ({ emoji: e, mod: null })), { emoji: e, mod: 'big', odd: true }];
  }
  const shuffled = shuffle(cells);
  return { cells: shuffled, oddIndex: shuffled.findIndex(c => c.odd), kind, why };
}

export function perfectScore(config) {
  let total = 0;
  for (let i = 1; i <= config.questions; i++) total += POINTS * comboMultiplier(i);
  return total;
}

function OddOneOutGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playReveal }) {
  const t = useTranslation();
  const to = t.games['odd-one-out'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [qIndex, setQIndex]   = useState(0);
  const [question, setQuestion] = useState(() => buildQuestion(config, null));
  const [phase, setPhase]     = useState('ready'); // ready | playing | result
  const [chosen, setChosen]   = useState(null);
  const [hinted, setHinted]   = useState(new Set()); // wrong cells faded by the hint
  const [score, setScore]     = useState(0);
  const [streak, setStreak]   = useState(0);
  const [popup, setPopup]     = useState(null);
  const [banner, setBanner]   = useState(null);

  const scoreRef  = useRef(0);
  const streakRef = useRef(0);
  const doneRef   = useRef(false);
  const startedQ  = useRef(-1);
  const hintTimer = useRef(null);
  const timersRef = useRef(new Set());
  const idRef     = useRef(0);

  const later = useCallback((fn, ms) => {
    const h = setTimeout(() => { timersRef.current.delete(h); fn(); }, ms);
    timersRef.current.add(h);
    return h;
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
  cbRef.current = { reportRound, playReveal };

  const showBanner = useCallback((text, tone, ms = 1100) => {
    const id = ++idRef.current;
    setBanner({ id, text, tone });
    later(() => setBanner(b => (b?.id === id ? null : b)), ms);
  }, [later]);

  // Start each question; schedule the hint.
  useEffect(() => {
    if (countingDown || phase !== 'ready' || doneRef.current || startedQ.current === qIndex) return;
    startedQ.current = qIndex;
    cbRef.current.reportRound?.(qIndex + 1, config.questions);
    setPhase('playing');
    hintTimer.current = later(() => {
      // Fade half of the wrong pictures.
      const wrong = shuffle(question.cells.map((_, i) => i).filter(i => i !== question.oddIndex));
      setHinted(new Set(wrong.slice(0, Math.floor(wrong.length / 2))));
      cbRef.current.playReveal?.();
    }, config.hintMs);
  }, [countingDown, phase, qIndex, question, config, later]);

  const handleTap = useCallback((idx) => {
    if (phase !== 'playing' || doneRef.current || hinted.has(idx)) return;
    clearTimeout(hintTimer.current);
    playClick();
    setChosen(idx);
    setPhase('result');
    const correct = idx === question.oddIndex;
    if (correct) {
      streakRef.current += 1;
      const m = comboMultiplier(streakRef.current);
      const gained = (hinted.size ? HINT_POINTS : POINTS) * m;
      scoreRef.current += gained;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      playSuccess();
      setPopup({ id: ++idRef.current, idx, text: `+${gained}`, tone: m > 1 ? `x${m}` : 'good' });
      if (m > comboMultiplier(streakRef.current - 1)) showBanner(`${to.combo} x${m}!`, `x${m}`);
    } else {
      streakRef.current = 0;
      playFail();
    }
    setStreak(streakRef.current);
    later(() => {
      if (doneRef.current) return;
      const next = qIndex + 1;
      if (next >= config.questions) { finish(); return; }
      setQIndex(next);
      setQuestion(buildQuestion(config, question.kind));
      setChosen(null);
      setHinted(new Set());
      setPopup(null);
      setPhase('ready');
    }, correct ? 1300 : 2100);
  }, [phase, hinted, question, qIndex, config, later, finish, playClick, playSuccess, playFail, reportScore, showBanner, to.combo]);

  const correct = phase === 'result' && chosen === question.oddIndex;
  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.question} {qIndex + 1}/{config.questions}</span>
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${to.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{to.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <p className={styles.prompt}>
          <span aria-hidden="true">🔍</span> {to.prompt}
        </p>

        <div className={styles.board}>
          {banner && <div key={banner.id} className={`${styles.banner} ${styles[`banner_${banner.tone}`] ?? ''}`}>{banner.text}</div>}
          <div
            key={`g${qIndex}`}
            className={styles.grid}
            style={{ '--cols': config.gridSize }}
            role="application"
            aria-label={to.ariaGrid}
          >
            {question.cells.map((cell, i) => {
              const isOdd = i === question.oddIndex;
              return (
                <button
                  key={i}
                  type="button"
                  style={{ '--idx': i }}
                  className={[
                    styles.cell,
                    hinted.has(i) ? styles.cellHinted : '',
                    phase === 'result' && isOdd ? styles.cellAnswer : '',
                    phase === 'result' && chosen === i && !isOdd ? styles.cellWrong : '',
                    phase === 'result' && !isOdd && chosen !== i ? styles.cellDim : '',
                  ].join(' ')}
                  onPointerDown={() => handleTap(i)}
                  disabled={phase !== 'playing' || hinted.has(i)}
                  aria-label={`${to.item} ${i + 1}`}
                >
                  <span className={`${styles.emoji} ${cell.mod === 'flip' ? styles.flip : ''} ${cell.mod === 'big' ? styles.big : ''}`}>{cell.emoji}</span>
                  {popup && popup.idx === i && (
                    <span key={popup.id} className={`${styles.floatText} ${styles[`tone_${popup.tone}`] ?? ''}`} aria-hidden="true">{popup.text}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <p className={styles.feedback} aria-live="polite">
          {phase === 'result' && (
            <span className={correct ? styles.fbGood : styles.fbSoft}>
              {correct ? '✓ ' : ''}{to.why[question.why]}
            </span>
          )}
          {phase === 'playing' && hinted.size > 0 && <span className={styles.fbHint}>💡 {to.hint}</span>}
          {phase !== 'result' && hinted.size === 0 && ' '}
        </p>
      </div>
    </div>
  );
}

OddOneOutGame.propTypes = {
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

export function OddOneOut({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const to = t.games['odd-one-out'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'odd-one-out', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="odd-one-out"
      title={to.title}
      instructions={to.instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playReveal, countingDown }) => (
        <OddOneOutGame
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

OddOneOut.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
