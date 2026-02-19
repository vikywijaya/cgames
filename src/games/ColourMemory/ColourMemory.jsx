import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './ColourMemory.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 6,  startLen: 3, maxLen: 5,  showMs: 600, gapMs: 300 },
  medium: { rounds: 8,  startLen: 4, maxLen: 7,  showMs: 500, gapMs: 250 },
  hard:   { rounds: 10, startLen: 5, maxLen: 9,  showMs: 380, gapMs: 200 },
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

// phase: 'showing' | 'recalling' | 'feedback'
function ColourMemoryGame({ difficulty, onComplete, reportScore, secondsLeft }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [round, setRound]         = useState(0);
  const [score, setScore]         = useState(0);
  const [phase, setPhase]         = useState('showing');
  const [seq, setSeq]             = useState(() => randomSeq(config.startLen));
  const [highlighted, setHighlit] = useState(null); // colour id being shown
  const [input, setInput]         = useState([]);
  const [feedback, setFeedback]   = useState(null); // null | 'correct' | 'wrong'
  const doneRef = useRef(false);

  // Time-up
  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: score, maxScore: config.rounds, completed: false });
    }
  }, [secondsLeft, score, config.rounds, onComplete]);

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
      timeouts.push(setTimeout(() => {
        setHighlit(null);
        timeouts.push(setTimeout(() => { i++; flashNext(); }, config.gapMs));
      }, config.showMs));
    }

    const startDelay = setTimeout(() => flashNext(), 400);
    return () => { clearTimeout(startDelay); timeouts.forEach(clearTimeout); };
  }, [phase, seq, config.showMs, config.gapMs]);

  const handleTap = useCallback((colourId) => {
    if (phase !== 'recalling' || doneRef.current) return;
    const newInput = [...input, colourId];
    setInput(newInput);

    const pos = newInput.length - 1;
    if (newInput[pos] !== seq[pos]) {
      // Wrong
      setFeedback('wrong');
      setPhase('feedback');
      setTimeout(() => {
        if (doneRef.current) return;
        const nextRound = round + 1;
        if (nextRound >= config.rounds) {
          doneRef.current = true;
          onComplete({ finalScore: score, maxScore: config.rounds, completed: true });
          return;
        }
        setRound(nextRound);
        const nextLen = Math.min(config.startLen + nextRound, config.maxLen);
        setSeq(randomSeq(nextLen));
        setInput([]);
        setFeedback(null);
        setPhase('showing');
      }, 900);
      return;
    }

    if (newInput.length === seq.length) {
      // Correct!
      const newScore = score + 1;
      setScore(newScore);
      reportScore(newScore);
      setFeedback('correct');
      setPhase('feedback');
      setTimeout(() => {
        if (doneRef.current) return;
        const nextRound = round + 1;
        if (nextRound >= config.rounds) {
          doneRef.current = true;
          onComplete({ finalScore: newScore, maxScore: config.rounds, completed: true });
          return;
        }
        setRound(nextRound);
        const nextLen = Math.min(config.startLen + nextRound, config.maxLen);
        setSeq(randomSeq(nextLen));
        setInput([]);
        setFeedback(null);
        setPhase('showing');
      }, 700);
    }
  }, [phase, input, seq, round, score, config, onComplete, reportScore]);

  const progressDots = seq.map((_, i) => (
    <span
      key={i}
      className={`${styles.dot} ${i < input.length ? (input[i] === seq[i] ? styles.dotOk : styles.dotErr) : styles.dotEmpty}`}
    />
  ));

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Round <strong>{round + 1}</strong> / {config.rounds}</span>
        <span className={styles.phaseLabel}>
          {phase === 'showing' ? 'Watch the sequence…' : phase === 'recalling' ? 'Now repeat it!' : feedback === 'correct' ? '✓ Correct!' : '✗ Wrong!'}
        </span>
      </div>

      <div className={styles.progress}>{progressDots}</div>

      <div className={styles.grid}>
        {COLOURS.map(c => (
          <button
            key={c.id}
            className={`${styles.tile} ${highlighted === c.id ? styles.tileFlash : ''}`}
            style={{ '--tcolor': c.bg }}
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
  difficulty: PropTypes.string.isRequired,
  onComplete: PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
};

export function ColourMemory({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const fireCallback = useGameCallback({ memberId, gameId: 'colour-memory', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="colour-memory"
      title="Colour Memory"
      instructions="Watch the sequence of colours light up, then tap them back in the same order. The sequence gets longer each round!"
      difficulty={difficulty}
      timeLimitSeconds={null}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft }) => (
        <ColourMemoryGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} />
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
