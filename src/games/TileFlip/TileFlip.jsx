import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './TileFlip.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * TileFlip — tiles flip over to show stars, then flip back. Tap every
 * tile that hid a star. Exercises visual working memory.
 *
 * Tuned for seniors:
 * - Adapts: a perfect round adds a star next time (up to a max); a round
 *   with mistakes repeats the same number of stars.
 * - One wrong tap per round is forgiven; the second ends the round, and
 *   any stars still hidden are shown so the player sees what was missed.
 * - Points: +1 per star found, +2 for a perfect round; 3 perfect rounds
 *   in a row turn on x2 until the next mistake.
 * - No overall clock; the showing time grows with the number of stars.
 */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  gridSize: 3, start: 2, max: 5, baseShowMs: 1400, perStarMs: 350 },
  medium: { rounds: 10, gridSize: 4, start: 3, max: 7, baseShowMs: 1200, perStarMs: 300 },
  hard:   { rounds: 12, gridSize: 4, start: 4, max: 9, baseShowMs: 1000, perStarMs: 250 },
};
const MISTAKES_ALLOWED = 1;
const PERFECT_BONUS = 2;
const STREAK_FOR_X2 = 3;

const multFor = (perfectStreak) => (perfectStreak >= STREAK_FOR_X2 ? 2 : 1);

// Score of a player who gets every round perfect.
export function perfectScore(config) {
  let count = config.start;
  let streak = 0;
  let total = 0;
  for (let r = 0; r < config.rounds; r++) {
    const m = multFor(streak);
    total += (count + PERFECT_BONUS) * m;
    streak += 1;
    count = Math.min(config.max, count + 1);
  }
  return total;
}

function pickStars(total, n) {
  const idx = [];
  while (idx.length < n) {
    const i = Math.floor(Math.random() * total);
    if (!idx.includes(i)) idx.push(i);
  }
  return new Set(idx);
}

function TileFlipGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playReveal, playPop }) {
  const t = useTranslation();
  const tt = t.games['tile-flip'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const total = config.gridSize * config.gridSize;

  // phase: 'idle' | 'showing' | 'recalling' | 'result'
  const [phase, setPhase]     = useState('idle');
  const [round, setRound]     = useState(0);
  const [count, setCount]     = useState(config.start);
  const [stars, setStars]     = useState(() => pickStars(total, config.start));
  const [found, setFound]     = useState(new Set());
  const [wrongs, setWrongs]   = useState(new Set());
  const [score, setScore]     = useState(0);
  const [streak, setStreak]   = useState(0); // perfect rounds in a row
  const [outcome, setOutcome] = useState(null); // 'perfect' | 'good' | 'missed'
  const [banner, setBanner]   = useState(null);
  const [popups, setPopups]   = useState([]);

  const scoreRef  = useRef(0);
  const streakRef = useRef(0);
  const doneRef   = useRef(false);
  const timersRef = useRef(new Set());
  const idRef     = useRef(0);
  const startedRef = useRef(-1);
  // Mirrors of found/wrongs/phase so taps landing in the same frame each
  // see the previous tap's result (state would still be stale).
  const foundRef  = useRef(new Set());
  const wrongsRef = useRef(new Set());
  const phaseRef  = useRef('idle');
  phaseRef.current = phase;

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
  cbRef.current = { finish, reportRound, playReveal };

  const addPopup = useCallback((idx, text, tone) => {
    const id = ++idRef.current;
    setPopups(prev => [...prev, { id, idx, text, tone }]);
    later(() => setPopups(prev => prev.filter(p => p.id !== id)), 900);
  }, [later]);

  const showBanner = useCallback((text, tone, ms = 1300) => {
    const id = ++idRef.current;
    setBanner({ id, text, tone });
    later(() => setBanner(b => (b?.id === id ? null : b)), ms);
  }, [later]);

  // Show the stars for this round (after the countdown), then hide them.
  useEffect(() => {
    if (countingDown || phase !== 'idle' || doneRef.current) return;
    if (startedRef.current === round) return;
    startedRef.current = round;
    cbRef.current.reportRound?.(round + 1, config.rounds);
    later(() => {
      setPhase('showing');
      cbRef.current.playReveal?.();
    }, 350);
    later(() => setPhase('recalling'), 350 + config.baseShowMs + config.perStarMs * count);
  }, [countingDown, phase, round, count, config, later]);

  const endRound = useCallback((perfect, foundCount) => {
    phaseRef.current = 'result';
    setPhase('result');
    const m = multFor(streakRef.current);
    let gained = foundCount * m;
    if (perfect) {
      gained += PERFECT_BONUS * m;
      streakRef.current += 1;
    } else {
      streakRef.current = 0;
    }
    scoreRef.current += gained;
    setScore(scoreRef.current);
    setStreak(streakRef.current);
    reportScore(scoreRef.current);

    if (perfect) {
      playSuccess();
      setOutcome('perfect');
      if (streakRef.current === STREAK_FOR_X2) showBanner(tt.streakOn, 'x2');
      else showBanner(`${tt.perfect} +${PERFECT_BONUS * m}`, 'perfect', 1000);
    } else {
      setOutcome(foundCount > 0 ? 'good' : 'missed');
    }

    const nextCount = perfect ? Math.min(config.max, count + 1) : count;
    later(() => {
      if (doneRef.current) return;
      const next = round + 1;
      if (next >= config.rounds) { cbRef.current.finish(); return; }
      if (nextCount > count) showBanner(tt.moreStars.replace('{n}', nextCount), 'level', 1100);
      setRound(next);
      setCount(nextCount);
      setStars(pickStars(total, nextCount));
      foundRef.current = new Set();
      wrongsRef.current = new Set();
      setFound(new Set());
      setWrongs(new Set());
      setOutcome(null);
      setPhase('idle');
    }, perfect ? 1100 : 2000);
  }, [config, count, round, total, later, reportScore, playSuccess, showBanner, tt.streakOn, tt.perfect, tt.moreStars]);

  const handleTap = useCallback((idx) => {
    const found = foundRef.current;
    const wrongs = wrongsRef.current;
    if (phaseRef.current !== 'recalling' || doneRef.current || found.has(idx) || wrongs.has(idx)) return;
    playClick();
    if (stars.has(idx)) {
      const nf = new Set(found);
      nf.add(idx);
      foundRef.current = nf;
      setFound(nf);
      playPop?.();
      addPopup(idx, `+${multFor(streakRef.current)}`, multFor(streakRef.current) > 1 ? 'x2' : 'good');
      if (nf.size === stars.size) endRound(wrongs.size === 0, nf.size);
      return;
    }
    const nw = new Set(wrongs);
    nw.add(idx);
    wrongsRef.current = nw;
    setWrongs(nw);
    playFail();
    if (nw.size > MISTAKES_ALLOWED) endRound(false, found.size);
    else showBanner(tt.oneMore, 'soft', 1000);
  }, [stars, playClick, playPop, playFail, addPopup, endRound, showBanner, tt.oneMore]);

  const phaseText =
    phase === 'showing'   ? tt.watch :
    phase === 'recalling' ? tt.tapStars.replace('{n}', stars.size - found.size) :
    phase === 'result' && outcome === 'perfect' ? t.common.correct :
    phase === 'result' ? tt.hereTheyWere :
    tt.getReady;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.round} {round + 1}/{config.rounds}</span>
          <span className={`${styles.streak} ${streak >= STREAK_FOR_X2 ? styles.streakOn : ''}`} aria-label={`${tt.perfectStreak} ${streak}`}>
            {Array.from({ length: STREAK_FOR_X2 }).map((_, i) => (
              <span key={i} className={i < Math.min(streak, STREAK_FOR_X2) ? styles.streakStarOn : styles.streakStar} aria-hidden="true">★</span>
            ))}
            {streak >= STREAK_FOR_X2 && <span className={styles.streakMult}>x2</span>}
          </span>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tt.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <div className={styles.levelChip}>
          <span className={styles.levelStar} aria-hidden="true">★</span>
          {tt.starsThisRound.replace('{n}', count)}
        </div>

        <div className={styles.board}>
          {banner && <div key={banner.id} className={`${styles.banner} ${styles[`banner_${banner.tone}`] ?? ''}`}>{banner.text}</div>}
          <div className={styles.grid} style={{ '--cols': config.gridSize }}>
            {Array.from({ length: total }, (_, i) => {
              const isStar = stars.has(i);
              const isFound = found.has(i);
              const isWrong = wrongs.has(i);
              const isMissed = phase === 'result' && isStar && !isFound;
              const faceUp = (phase === 'showing' && isStar) || isFound || isWrong || isMissed;
              return (
                <button
                  key={`${round}-${i}`}
                  type="button"
                  className={[
                    styles.tile,
                    faceUp ? styles.tileUp : '',
                    isFound ? styles.tileFound : '',
                    isWrong ? styles.tileWrong : '',
                    isMissed ? styles.tileMissed : '',
                  ].join(' ')}
                  style={{ '--idx': i }}
                  onPointerDown={() => handleTap(i)}
                  disabled={phase !== 'recalling' || isFound || isWrong}
                  aria-label={`${tt.tile} ${i + 1}`}
                >
                  <span className={styles.tileInner}>
                    <span className={styles.tileBack} aria-hidden="true" />
                    <span className={styles.tileFace} aria-hidden="true">{isWrong ? '✕' : '★'}</span>
                  </span>
                  {popups.filter(p => p.idx === i).map(p => (
                    <span key={p.id} className={`${styles.floatText} ${styles[`tone_${p.tone}`] ?? ''}`} aria-hidden="true">{p.text}</span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${styles.phaseLabel} ${phase === 'recalling' ? styles.phaseGo : ''}`} aria-live="polite">
          {phaseText}
        </div>
        {phase === 'recalling' && (
          <div className={styles.chances} aria-hidden="true">
            {tt.chances}{' '}
            {Array.from({ length: MISTAKES_ALLOWED + 1 }).map((_, i) => (
              <span key={i} className={i < MISTAKES_ALLOWED + 1 - wrongs.size ? styles.chanceOn : styles.chanceOff}>●</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

TileFlipGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playReveal:  PropTypes.func,
  playPop:     PropTypes.func,
};

// A memory game: no overall clock.
const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function TileFlip({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tt = t.games['tile-flip'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'tile-flip', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="tile-flip"
      title={tt.title}
      instructions={tt.instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playReveal, playPop, countingDown }) => (
        <TileFlipGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
          playReveal={playReveal}
          playPop={playPop}
        />
      )}
    </GameShell>
  );
}

TileFlip.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
