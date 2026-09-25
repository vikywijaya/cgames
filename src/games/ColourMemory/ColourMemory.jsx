import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './ColourMemory.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * Colour Memory — a Simon-style game.
 * The same sequence grows by one colour every time it's repeated
 * correctly. Each pad has its own musical note and a shape, so it can be
 * followed by sound and by shape as well as by colour.
 *
 * Tuned for seniors:
 * - A mistake first gets a friendly "Let's watch again" replay of the same
 *   sequence. A second mistake shortens the sequence by one and carries on.
 * - Points: +1 per correct tap, +2 for each sequence completed.
 * - A banner celebrates every new longest sequence.
 * - No clock; the game is a fixed number of turns.
 */
const DIFFICULTY_CONFIG = {
  easy:   { turns: 8,  pads: 4, start: 2, showMs: 800, gapMs: 350 },
  medium: { turns: 10, pads: 6, start: 3, showMs: 700, gapMs: 300 },
  hard:   { turns: 12, pads: 6, start: 3, showMs: 580, gapMs: 250 },
};
const SEQUENCE_BONUS = 2;
const TAP_FLASH_MS = 260;

const PADS = [
  { id: 'red',    bg: '#ef4444', dark: '#b91c1c', shape: '●', note: 261.63 }, // C4
  { id: 'blue',   bg: '#3b82f6', dark: '#1d4ed8', shape: '▲', note: 329.63 }, // E4
  { id: 'green',  bg: '#22c55e', dark: '#15803d', shape: '■', note: 392.00 }, // G4
  { id: 'yellow', bg: '#facc15', dark: '#a16207', shape: '★', note: 523.25 }, // C5
  { id: 'purple', bg: '#a855f7', dark: '#7e22ce', shape: '◆', note: 440.00 }, // A4
  { id: 'orange', bg: '#f97316', dark: '#c2410c', shape: '♥', note: 587.33 }, // D5
];

// Score of a player who repeats every sequence correctly first time.
export function perfectScore(config) {
  let total = 0;
  for (let i = 0; i < config.turns; i++) total += config.start + i + SEQUENCE_BONUS;
  return total;
}

function ColourMemoryGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playNote }) {
  const t = useTranslation();
  const tc = t.games['colour-memory'];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const pads = PADS.slice(0, config.pads);
  const randomPad = useCallback(() => pads[Math.floor(Math.random() * pads.length)].id, [pads]);

  // phase: 'idle' | 'showing' | 'recalling' | 'result'
  const [phase, setPhase]   = useState('idle');
  const [turn, setTurn]     = useState(0);
  const [seq, setSeq]       = useState(() => Array.from({ length: config.start }, () => PADS[Math.floor(Math.random() * config.pads)].id));
  const [lit, setLit]       = useState(null);
  const [input, setInput]   = useState([]);
  const [score, setScore]   = useState(0);
  const [best, setBest]     = useState(0);
  const [retry, setRetry]   = useState(false); // on the "watch again" replay
  const [result, setResult] = useState(null);  // 'correct' | 'again' | 'shorter'
  const [wrongPad, setWrongPad] = useState(null);
  const [banner, setBanner] = useState(null);

  const scoreRef  = useRef(0);
  const bestRef   = useRef(0);
  const doneRef   = useRef(false);
  const timersRef = useRef(new Set());
  const idRef     = useRef(0);
  const playKeyRef = useRef(null); // guards the sequence playback against double effects

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
  cbRef.current = { playNote, reportRound, finish };

  const showBanner = useCallback((text, tone, ms = 1300) => {
    const id = ++idRef.current;
    setBanner({ id, text, tone });
    later(() => setBanner(b => (b?.id === id ? null : b)), ms);
  }, [later]);

  const noteFor = (id) => PADS.find(p => p.id === id)?.note ?? 440;

  // Play the sequence, one pad at a time.
  useEffect(() => {
    if (countingDown || phase !== 'idle' || doneRef.current) return;
    const key = `${turn}:${retry}:${seq.join(',')}`;
    if (playKeyRef.current === key) return;
    playKeyRef.current = key;
    cbRef.current.reportRound?.(turn + 1, config.turns);
    let at = 600;
    later(() => setPhase('showing'), at - 100);
    seq.forEach((id) => {
      later(() => { setLit(id); cbRef.current.playNote?.(noteFor(id), config.showMs / 1000); }, at);
      later(() => setLit(null), at + config.showMs);
      at += config.showMs + config.gapMs;
    });
    later(() => { setInput([]); setPhase('recalling'); }, at);
  }, [countingDown, phase, turn, retry, seq, config, later]);

  const nextTurn = useCallback((nextSeq) => {
    const next = turn + 1;
    if (next >= config.turns) { cbRef.current.finish(); return; }
    setTurn(next);
    setSeq(nextSeq);
    setRetry(false);
    setResult(null);
    setWrongPad(null);
    setInput([]);
    setPhase('idle');
  }, [turn, config.turns]);

  const handleTap = useCallback((id) => {
    if (phase !== 'recalling' || doneRef.current) return;
    playNote?.(noteFor(id), 0.3);
    setLit(id);
    later(() => setLit(l => (l === id ? null : l)), TAP_FLASH_MS);

    const pos = input.length;
    if (id !== seq[pos]) {
      playClick();
      playFail();
      setWrongPad(id);
      setPhase('result');
      if (!retry) {
        // First slip: replay the same sequence.
        setResult('again');
        later(() => {
          if (doneRef.current) return;
          setWrongPad(null);
          setResult(null);
          setRetry(true);
          setPhase('idle');
        }, 1600);
      } else {
        // Second slip: carry on with the sequence one shorter.
        setResult('shorter');
        const shorter = seq.length > config.start ? seq.slice(0, -1) : seq;
        later(() => { if (!doneRef.current) nextTurn(shorter); }, 1800);
      }
      return;
    }

    const nextInput = [...input, id];
    setInput(nextInput);
    scoreRef.current += 1;

    if (nextInput.length === seq.length) {
      scoreRef.current += SEQUENCE_BONUS;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
      setPhase('result');
      setResult('correct');
      later(() => playSuccess(), 250);
      if (seq.length > bestRef.current) {
        const first = bestRef.current === 0;
        bestRef.current = seq.length;
        setBest(seq.length);
        if (!first) showBanner(tc.newRecord.replace('{n}', seq.length), 'record');
      }
      const grown = [...seq, randomPad()];
      later(() => { if (!doneRef.current) nextTurn(grown); }, 1200);
    } else {
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
    }
  }, [phase, input, seq, retry, config.start, later, nextTurn, playClick, playFail, playNote, playSuccess, reportScore, randomPad, showBanner, tc.newRecord]);

  const status =
    phase === 'showing'   ? tc.watch :
    phase === 'recalling' ? tc.yourTurn :
    result === 'correct'  ? t.common.correct :
    result === 'again'    ? tc.watchAgain :
    result === 'shorter'  ? tc.shorter :
    retry                 ? tc.watchAgain : tc.getReady;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.turnLabel}>{tc.turn} {turn + 1}/{config.turns}</span>
          <span className={styles.bestChip} aria-label={`${tc.best} ${best}`}>🏆 {best}</span>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{tc.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <div className={`${styles.status} ${phase === 'recalling' ? styles.statusGo : ''} ${result === 'correct' ? styles.statusGood : ''}`} aria-live="polite">
          <span className={styles.statusIcon} aria-hidden="true">
            {phase === 'showing' ? '👀' : phase === 'recalling' ? '👆' : result === 'correct' ? '🎉' : result ? '🔁' : '🎵'}
          </span>
          {status}
        </div>

        <div className={styles.seqRow} aria-label={tc.lengthLabel.replace('{n}', seq.length)}>
          {seq.map((id, i) => {
            const done = i < input.length;
            const pad = PADS.find(p => p.id === id);
            return (
              <span
                key={i}
                className={`${styles.seqDot} ${done ? styles.seqDotDone : ''}`}
                style={done ? { '--c': pad.bg } : undefined}
                aria-hidden="true"
              >
                {done ? pad.shape : ''}
              </span>
            );
          })}
        </div>

        <div className={styles.board}>
          {banner && <div key={banner.id} className={`${styles.banner} ${styles[`banner_${banner.tone}`] ?? ''}`}>{banner.text}</div>}
          <div className={`${styles.grid} ${config.pads === 4 ? styles.grid4 : styles.grid6}`}>
            {pads.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={`${styles.pad} ${lit === p.id ? styles.padLit : ''} ${wrongPad === p.id ? styles.padWrong : ''}`}
                style={{ '--c': p.bg, '--d': p.dark, '--idx': i }}
                onPointerDown={() => handleTap(p.id)}
                disabled={phase !== 'recalling'}
                aria-label={tc.colours[p.id]}
              >
                <span className={styles.padShape} aria-hidden="true">{p.shape}</span>
                <span className={styles.padLabel}>{tc.colours[p.id]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

ColourMemoryGame.propTypes = {
  countingDown: PropTypes.bool,
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  reportRound: PropTypes.func,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playNote:    PropTypes.func,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function ColourMemory({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const tc = t.games['colour-memory'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'colour-memory', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="colour-memory"
      title={tc.title}
      instructions={tc.instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playNote, countingDown }) => (
        <ColourMemoryGame
          countingDown={countingDown}
          difficulty={diff}
          onComplete={sc}
          reportScore={reportScore}
          reportRound={reportRound}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
          playNote={playNote}
        />
      )}
    </GameShell>
  );
}

ColourMemory.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
