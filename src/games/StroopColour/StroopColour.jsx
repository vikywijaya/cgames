import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './StroopColour.module.css';
import { useTranslation } from '../../i18n/useTranslation';

/*
 * StroopColour — the classic Stroop effect.
 * A colour WORD is shown in a coloured INK. Normally the player taps the
 * INK colour. On medium/hard some rounds switch the rule to "tap what the
 * WORD says", which trains switching between rules.
 *
 * Tuned for seniors:
 * - Colour words are translated (they used to be English in every language).
 * - Easy warms up: the first rounds mostly match (word = ink).
 * - No overall clock. Medium/hard show a gentle per-round bar: answering
 *   in the first half earns a Quick bonus. Nothing happens when it runs out.
 * - Combo: correct answers in a row raise the multiplier (x2 at 5, x3 at 10).
 * - A wrong answer explains itself: "The ink was BLUE".
 */
const DIFFICULTY_CONFIG = {
  easy:   { rounds: 10, congruent: 0.3, warmup: 3, wordRule: 0,    roundMs: null },
  medium: { rounds: 12, congruent: 0.2, warmup: 0, wordRule: 0.25, roundMs: 6000 },
  hard:   { rounds: 14, congruent: 0.1, warmup: 0, wordRule: 0.35, roundMs: 4500 },
};
const WARMUP_CONGRUENT = 0.7;
const RULE_BANNER_MS = 1100;

// Every colour clearly distinct from the others (no orange: it collided with
// both red and yellow).
const COLOURS = [
  { id: 'red',    hex: '#e11d48' },
  { id: 'blue',   hex: '#2563eb' },
  { id: 'green',  hex: '#16a34a' },
  { id: 'yellow', hex: '#eab308' },
  { id: 'purple', hex: '#9333ea' },
  { id: 'pink',   hex: '#ec4899' },
];

export function comboMultiplier(streak) {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  return 1;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function makeStimulus(config, round) {
  const ink = pick(COLOURS);
  const pCongruent = round < config.warmup ? WARMUP_CONGRUENT : config.congruent;
  const word = Math.random() < pCongruent ? ink : pick(COLOURS.filter(c => c.id !== ink.id));
  const rule = word.id !== ink.id && Math.random() < config.wordRule ? 'word' : 'ink';
  const answer = rule === 'ink' ? ink : word;
  // Four choices: the answer, the "trap" (the other of word/ink), and others.
  const trap = rule === 'ink' ? word : ink;
  const opts = [answer];
  if (trap.id !== answer.id) opts.push(trap);
  while (opts.length < 4) {
    const c = pick(COLOURS);
    if (!opts.some(o => o.id === c.id)) opts.push(c);
  }
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return { word: word.id, ink: ink.id, inkHex: ink.hex, rule, answer: answer.id, options: opts };
}

export function perfectScore(config) {
  let total = 0;
  const bonus = config.roundMs ? 1 : 0;
  for (let i = 1; i <= config.rounds; i++) total += (1 + bonus) * comboMultiplier(i);
  return total;
}

function StroopGame({ countingDown = false, difficulty, onComplete, reportScore, reportRound, playClick, playSuccess, playFail, playReveal }) {
  const t = useTranslation();
  const ts = t.games['stroop-colour'];
  const name = (id) => ts.colours[id];
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [round, setRound]       = useState(0);
  const [stim, setStim]         = useState(() => makeStimulus(config, 0));
  const [phase, setPhase]       = useState('ready'); // ready | playing | result
  const [picked, setPicked]     = useState(null);
  const [score, setScore]       = useState(0);
  const [streak, setStreak]     = useState(0);
  const [popup, setPopup]       = useState(null);
  const [banner, setBanner]     = useState(null);

  const scoreRef  = useRef(0);
  const streakRef = useRef(0);
  const doneRef   = useRef(false);
  const startedAt = useRef(0);
  const startedRound = useRef(-1);
  const lastRule  = useRef('ink');
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
  cbRef.current = { reportRound, playReveal };

  const showBanner = useCallback((text, tone, ms = 1100) => {
    const id = ++idRef.current;
    setBanner({ id, text, tone });
    later(() => setBanner(b => (b?.id === id ? null : b)), ms);
  }, [later]);

  useEffect(() => {
    if (countingDown || phase !== 'ready' || doneRef.current || startedRound.current === round) return;
    startedRound.current = round;
    cbRef.current.reportRound?.(round + 1, config.rounds);
    // Announce a change of rule so it's never a surprise, and only start the
    // round once the banner has cleared (it sits over the word card).
    const changed = stim.rule !== lastRule.current;
    lastRule.current = stim.rule;
    const begin = () => {
      if (doneRef.current) return;
      startedAt.current = Date.now();
      setPhase('playing');
    };
    if (changed) {
      cbRef.current.playReveal?.();
      showBanner(stim.rule === 'word' ? ts.ruleWordShort : ts.ruleInkShort, stim.rule, RULE_BANNER_MS);
      later(begin, RULE_BANNER_MS);
    } else {
      begin();
    }
  }, [countingDown, phase, round, stim, config.rounds, later, showBanner, ts.ruleWordShort, ts.ruleInkShort]);

  const handlePick = useCallback((id) => {
    if (phase !== 'playing' || doneRef.current) return;
    playClick();
    setPicked(id);
    setPhase('result');
    const correct = id === stim.answer;
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
      if (m > comboMultiplier(streakRef.current - 1)) showBanner(`${ts.combo} x${m}!`, `x${m}`);
    } else {
      streakRef.current = 0;
      playFail();
      setPopup(null);
    }
    setStreak(streakRef.current);
    later(() => {
      if (doneRef.current) return;
      const next = round + 1;
      if (next >= config.rounds) { finish(); return; }
      setRound(next);
      setStim(makeStimulus(config, next));
      setPicked(null);
      setPopup(null);
      setPhase('ready');
    }, correct ? 700 : 1800);
  }, [phase, stim, config, round, later, finish, playClick, playSuccess, playFail, reportScore, showBanner, ts.combo]);

  const correct = phase === 'result' && picked === stim.answer;
  const mult = comboMultiplier(streak);
  const nextAt = streak >= 10 ? null : streak >= 5 ? 10 : 5;
  const prevAt = streak >= 10 ? 10 : streak >= 5 ? 5 : 0;
  const comboFill = nextAt ? (streak - prevAt) / (nextAt - prevAt) : 1;
  const answerHex = COLOURS.find(c => c.id === stim.answer).hex;

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.hudLeft}>
          <span className={styles.roundLabel}>{t.common.round} {round + 1}/{config.rounds}</span>
          <div className={`${styles.combo} ${mult > 1 ? styles[`combo${mult}`] : ''}`} aria-label={`${ts.combo} ${streak}`}>
            <span className={styles.comboMult}>x{mult}</span>
            <span className={styles.comboTrack} aria-hidden="true">
              <span className={styles.comboFill} style={{ transform: `scaleX(${comboFill})` }} />
            </span>
          </div>
        </div>
        <div className={styles.infoBadge}>
          <span key={score} className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>{ts.pts}</span>
        </div>
      </div>

      <div className={styles.playArea}>
        <div key={`rule${round}`} className={`${styles.rule} ${stim.rule === 'word' ? styles.ruleWord : styles.ruleInk}`}>
          <span className={styles.ruleIcon} aria-hidden="true">{stim.rule === 'word' ? '💬' : '🎨'}</span>
          <span>{stim.rule === 'word' ? ts.ruleWord : ts.ruleInk}</span>
        </div>

        <div className={styles.stage}>
          {banner && <div key={banner.id} className={`${styles.banner} ${styles[`banner_${banner.tone}`] ?? ''}`}>{banner.text}</div>}
          <div key={`card${round}`} className={`${styles.card} ${phase === 'result' ? (correct ? styles.cardGood : styles.cardBad) : ''}`}>
            <span className={`${styles.word} ${phase === 'ready' ? styles.wordHidden : ''}`} style={{ color: stim.inkHex }}>{name(stim.word).toUpperCase()}</span>
            {config.roundMs && (
              <span className={styles.timerTrack} aria-hidden="true">
                <span
                  key={`t${round}${phase === 'playing'}`}
                  className={`${styles.timerFill} ${phase === 'playing' ? styles.timerRun : ''} ${phase === 'result' ? styles.timerStop : ''}`}
                  style={{ '--ms': `${config.roundMs}ms` }}
                />
              </span>
            )}
            {popup && (
              <span key={popup.id} className={`${styles.floatText} ${styles[`tone_${popup.tone}`] ?? ''}`} aria-hidden="true">
                {popup.text}{popup.quick && <small className={styles.quickTag}>{ts.quick}</small>}
              </span>
            )}
          </div>
        </div>

        <p className={styles.feedback} aria-live="polite">
          {phase === 'result' && correct && <span className={styles.fbGood}>{t.common.correct}</span>}
          {phase === 'result' && !correct && (
            <span className={styles.fbSoft}>
              {(stim.rule === 'ink' ? ts.inkWas : ts.wordWas).split('{c}')[0]}
              <strong style={{ color: answerHex }}>{name(stim.answer).toUpperCase()}</strong>
              {(stim.rule === 'ink' ? ts.inkWas : ts.wordWas).split('{c}')[1]}
            </span>
          )}
          {phase !== 'result' && ' '}
        </p>

        <div className={styles.options}>
          {stim.options.map((opt, i) => {
            const isAnswer = opt.id === stim.answer;
            return (
              <button
                key={`${round}-${opt.id}`}
                type="button"
                style={{ '--c': opt.hex, '--idx': i }}
                className={[
                  styles.opt,
                  phase === 'result' && isAnswer ? styles.optAnswer : '',
                  phase === 'result' && picked === opt.id && !isAnswer ? styles.optWrong : '',
                  phase === 'result' && !isAnswer && picked !== opt.id ? styles.optDim : '',
                ].join(' ')}
                onPointerDown={() => handlePick(opt.id)}
                disabled={phase !== 'playing'}
                aria-label={name(opt.id)}
              >
                <span className={styles.swatch} aria-hidden="true" />
                <span className={styles.optName}>{name(opt.id)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

StroopGame.propTypes = {
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

export function StroopColour({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const ts = t.games['stroop-colour'];
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'stroop-colour', callbackUrl, onComplete });
  return (
    <GameShell
      startCountdown
      gameId="stroop-colour"
      title={ts.title}
      instructions={difficulty === 'easy' ? ts.instructions : `${ts.instructions} ${ts.instructionsHard}`}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      flushTop
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, reportRound, difficulty: diff, playClick, playSuccess, playFail, playReveal, countingDown }) => (
        <StroopGame
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

StroopColour.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
