import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './ColourMemory.module.css';
import { useTranslation } from '../../i18n/useTranslation';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 6,  seqLen: 4, showMs: 900, gapMs: 450 },
  medium: { rounds: 8,  seqLen: 5, showMs: 850, gapMs: 400 },
  hard:   { rounds: 10, seqLen: 6, showMs: 750, gapMs: 350 },
};

const COLOURS = [
  { id: 'red',    label: 'Red',    bg: '#ef4444' },
  { id: 'blue',   label: 'Blue',   bg: '#3b82f6' },
  { id: 'green',  label: 'Green',  bg: '#22c55e' },
  { id: 'yellow', label: 'Yellow', bg: '#eab308' },
  { id: 'purple', label: 'Purple', bg: '#a855f7' },
  { id: 'orange', label: 'Orange', bg: '#f97316' },
];

function randomSeq(len) {
  return Array.from({ length: len }, () => COLOURS[Math.floor(Math.random() * COLOURS.length)].id);
}

// phase: 'countdown' | 'showing' | 'recalling' | 'feedback'
function ColourMemoryGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail, playReveal }) {
  const t = useTranslation();
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [round, setRound]         = useState(0);
  const [score, setScore]         = useState(0);
  const [phase, setPhase]         = useState('countdown');
  const [seq, setSeq]             = useState(() => randomSeq(config.seqLen));
  const [highlighted, setHighlit] = useState(null); // colour id being shown
  const [input, setInput]         = useState([]);
  const [feedback, setFeedback]   = useState(null); // null | 'correct' | 'wrong'
  const [countdown, setCountdown] = useState(3); // 3..2..1 before each sequence
  const doneRef = useRef(false);

  // Time-up
  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: score, maxScore: config.rounds, completed: false });
    }
  }, [secondsLeft, score, config.rounds, onComplete]);

  // 3..2..1 countdown before each sequence
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) { setPhase('showing'); return; }
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, countdown]);

  // Play the sequence flash
  useEffect(() => {
    if (phase !== 'showing') return;
    let i = 0;
    let timeouts = [];

    function flashNext() {
      if (i >= seq.length) {
        setHighlit(null);
        timeouts.push(setTimeout(() => setPhase('recalling'), config.gapMs));
        return;
      }
      setHighlit(seq[i]);
      playReveal();
      timeouts.push(setTimeout(() => {
        setHighlit(null);
        timeouts.push(setTimeout(() => { i++; flashNext(); }, config.gapMs));
      }, config.showMs));
    }

    const startDelay = setTimeout(() => flashNext(), 400);
    return () => { clearTimeout(startDelay); timeouts.forEach(clearTimeout); };
  }, [phase, seq, config.showMs, config.gapMs]);

  const advanceRound = useCallback((scoreAfterRound) => {
    const nextRound = round + 1;
    if (nextRound >= config.rounds) {
      doneRef.current = true;
      onComplete({ finalScore: scoreAfterRound, maxScore: config.rounds, completed: true });
      return;
    }
    setRound(nextRound);
    setSeq(randomSeq(config.seqLen));
    setInput([]);
    setFeedback(null);
    setCountdown(3);
    setPhase('countdown');
  }, [round, config.rounds, config.seqLen, onComplete]);

  const handleTap = useCallback((colourId) => {
    if (phase !== 'recalling' || doneRef.current) return;
    playClick();
    const newInput = [...input, colourId];
    setInput(newInput);

    // Wait until the full sequence has been entered before judging.
    if (newInput.length < seq.length) return;

    // Award a point only if the entire sequence is correct.
    const allCorrect = newInput.every((c, i) => c === seq[i]);
    if (allCorrect) {
      playSuccess();
      const newScore = score + 1;
      setScore(newScore);
      reportScore(newScore);
      setFeedback('correct');
      setPhase('feedback');
      setTimeout(() => {
        if (doneRef.current) return;
        advanceRound(newScore);
      }, 700);
    } else {
      playFail();
      setFeedback('wrong');
      setPhase('feedback');
      setTimeout(() => {
        if (doneRef.current) return;
        advanceRound(score);
      }, 900);
    }
  }, [phase, input, seq, score, advanceRound, reportScore, playClick, playSuccess, playFail]);

  const progressDots = seq.map((_, i) => (
    <span
      key={i}
      className={`${styles.dot} ${i < input.length ? (input[i] === seq[i] ? styles.dotOk : styles.dotErr) : styles.dotEmpty}`}
    />
  ));

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderLabel}>{t.games['colour-memory'].label}</span>
          <span className={styles.infoHeaderSub}>
            {phase === 'countdown' ? t.common.getReady : phase === 'showing' ? t.common.watchSequence : phase === 'recalling' ? t.common.nowRepeat : feedback === 'correct' ? t.common.correct : t.common.wrong}
          </span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{round + 1}</span>
          <span className={styles.infoBadgeSub}>/ {config.rounds}</span>
        </div>
      </div>

      <div className={styles.progress}>{progressDots}</div>

      {phase === 'countdown' && (
        <div className={styles.countdownOverlay} aria-live="assertive">
          <span className={styles.countdownNum} key={countdown}>{countdown}</span>
        </div>
      )}

      <div className={styles.grid}>
        {COLOURS.map((c, i) => (
          <button
            key={c.id}
            className={`${styles.tile} ${highlighted === c.id ? styles.tileFlash : ''}`}
            style={{ '--tcolor': c.bg, '--idx': i }}
            onClick={() => handleTap(c.id)}
            disabled={phase !== 'recalling'}
            aria-label={c.label}
          >
            <span className={styles.tileLabel}>{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

ColourMemoryGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playReveal:  PropTypes.func.isRequired,
};

const TIME_LIMITS = { easy: null, medium: null, hard: null };

export function ColourMemory({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'colour-memory', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="colour-memory"
      title={t.games['colour-memory'].title}
      instructions={t.games['colour-memory'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playClick, playSuccess, playFail, playReveal }) => (
        <ColourMemoryGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} playReveal={playReveal} />
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
