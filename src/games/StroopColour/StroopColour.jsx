import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './StroopColour.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 10, match: true,  timeLimitSeconds: null },   // word matches ink colour
  medium: { rounds: 14, match: false, timeLimitSeconds: 90  },    // mixed congruent + incongruent
  hard:   { rounds: 18, match: false, timeLimitSeconds: 60  },    // mostly incongruent, faster pressure
};

const COLOURS = [
  { name: 'Red',    hex: '#f87171' },
  { name: 'Blue',   hex: '#60a5fa' },
  { name: 'Green',  hex: '#4ade80' },
  { name: 'Yellow', hex: '#fbbf24' },
  { name: 'Purple', hex: '#c084fc' },
  { name: 'Orange', hex: '#fb923c' },
];

/**
 * StroopColour — classic Stroop effect.
 * A colour *word* is shown in a coloured *ink*.
 * Player taps the button matching the INK colour (not the word meaning).
 * Incongruent trials (word ≠ ink) exercise inhibitory control.
 */
function StroopGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [round,    setRound]    = useState(0);
  const [score,    setScore]    = useState(0);
  const [stimulus, setStimulus] = useState(null);  // { word, inkHex, inkName, options }
  const [feedback, setFeedback] = useState(null);  // null | 'correct' | 'wrong'
  const scoreRef = useRef(0);
  const doneRef  = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete({ finalScore: scoreRef.current, maxScore: config.rounds, completed: true });
  }, [onComplete, config.rounds]);

  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: scoreRef.current, maxScore: config.rounds, completed: false });
    }
  }, [secondsLeft, onComplete, config.rounds]);

  const makeStimulus = useCallback(() => {
    const ink = COLOURS[Math.floor(Math.random() * COLOURS.length)];
    // In easy mode always congruent; otherwise ~40% congruent
    const forceCongruent = config.match || Math.random() < 0.4;
    const wordColour = forceCongruent
      ? ink
      : COLOURS.filter(c => c.name !== ink.name)[Math.floor(Math.random() * (COLOURS.length - 1))];

    // Build 4 options: ink colour + 3 random others
    const others = COLOURS.filter(c => c.name !== ink.name);
    const opts = [ink];
    while (opts.length < 4) {
      const pick = others[Math.floor(Math.random() * others.length)];
      if (!opts.find(o => o.name === pick.name)) opts.push(pick);
    }
    // Shuffle options
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return { word: wordColour.name, inkHex: ink.hex, inkName: ink.name, options: opts };
  }, [config.match]);

  const nextRound = useCallback((currentRound) => {
    if (doneRef.current) return;
    if (currentRound >= config.rounds) { finish(); return; }
    setRound(currentRound);
    setStimulus(makeStimulus());
    setFeedback(null);
  }, [config.rounds, finish, makeStimulus]);

  // Start
  useEffect(() => { nextRound(0); }, []); // eslint-disable-line

  const handlePick = useCallback((colourName) => {
    if (feedback || !stimulus || doneRef.current) return;
    playClick();
    const correct = colourName === stimulus.inkName;
    if (correct) {
      playSuccess();
      scoreRef.current += 1;
      setScore(scoreRef.current);
      reportScore(scoreRef.current);
    } else {
      playFail();
    }
    setFeedback(correct ? 'correct' : 'wrong');
    setTimeout(() => nextRound(round + 1), 500);
  }, [feedback, stimulus, round, reportScore, nextRound, playClick, playSuccess, playFail]);

  if (!stimulus) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Round <strong>{round + 1}</strong> / {config.rounds}</span>
        <span className={styles.scoreLabel}>Score: <strong>{score}</strong></span>
      </div>

      <p className={styles.prompt}>Tap the <strong>INK colour</strong> of the word below:</p>

      <div className={styles.stimulusBox}>
        <span className={styles.stimWord} style={{ color: stimulus.inkHex }}>
          {stimulus.word}
        </span>
      </div>

      <div className={styles.options}>
        {stimulus.options.map(opt => {
          let cls = styles.optBtn;
          if (feedback === 'correct' && opt.name === stimulus.inkName) cls = `${styles.optBtn} ${styles.optCorrect}`;
          if (feedback === 'wrong'   && opt.name === stimulus.inkName) cls = `${styles.optBtn} ${styles.optCorrect}`;
          if (feedback === 'wrong'   && opt.name !== stimulus.inkName) cls = `${styles.optBtn} ${styles.optWrong}`;
          return (
            <button
              key={opt.name}
              className={cls}
              style={{ '--swatch': opt.hex }}
              onClick={() => handlePick(opt.name)}
              disabled={!!feedback}
              aria-label={opt.name}
            >
              <span className={styles.swatch} style={{ background: opt.hex }} aria-hidden="true" />
              {opt.name}
            </button>
          );
        })}
      </div>

      {feedback === 'correct' && <p className={styles.feedbackOk}>✓ Correct!</p>}
      {feedback === 'wrong'   && <p className={styles.feedbackBad}>✗ Wrong ink colour</p>}
    </div>
  );
}

StroopGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function StroopColour({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'stroop-colour', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="stroop-colour"
      title="Stroop Colour"
      instructions="A colour word is shown in a coloured ink. Tap the button that matches the INK colour — not what the word says!"
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <StroopGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
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
