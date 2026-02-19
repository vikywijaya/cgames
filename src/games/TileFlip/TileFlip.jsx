import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './TileFlip.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  gridSize: 3, litCount: 3, showMs: 1800, timeLimitSeconds: null },
  medium: { rounds: 10, gridSize: 4, litCount: 5, showMs: 1400, timeLimitSeconds: 120  },
  hard:   { rounds: 12, gridSize: 4, litCount: 7, showMs: 1000, timeLimitSeconds: 90   },
};

/**
 * TileFlip — a grid of tiles flashes a pattern briefly.
 * Player must tap the tiles that were lit in any order.
 * Exercises visual working memory and spatial recall.
 */
function TileFlipGame({ difficulty, onComplete, reportScore, secondsLeft }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const total = config.gridSize * config.gridSize;

  // phase: 'showing' | 'recalling' | 'feedback'
  const [phase,   setPhase]   = useState('showing');
  const [lit,     setLit]     = useState(new Set());    // correct tiles
  const [tapped,  setTapped]  = useState(new Set());    // player taps
  const [wrong,   setWrong]   = useState(null);         // wrong tap idx for flash
  const [round,   setRound]   = useState(0);
  const [score,   setScore]   = useState(0);
  const scoreRef = useRef(0);
  const doneRef  = useRef(false);

  const finish = useCallback((completed) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete({ finalScore: scoreRef.current, maxScore: config.rounds, completed });
  }, [onComplete, config.rounds]);

  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) finish(false);
  }, [secondsLeft, finish]);

  const startRound = useCallback((r) => {
    if (doneRef.current) return;
    if (r >= config.rounds) { finish(true); return; }
    // Pick random lit tiles
    const indices = [];
    while (indices.length < config.litCount) {
      const i = Math.floor(Math.random() * total);
      if (!indices.includes(i)) indices.push(i);
    }
    setLit(new Set(indices));
    setTapped(new Set());
    setWrong(null);
    setRound(r);
    setPhase('showing');
  }, [config, total, finish]);

  // Auto-hide after showMs
  useEffect(() => {
    if (phase !== 'showing') return;
    const id = setTimeout(() => setPhase('recalling'), config.showMs);
    return () => clearTimeout(id);
  }, [phase, config.showMs]);

  // Start first round
  useEffect(() => { startRound(0); }, []); // eslint-disable-line

  const handleTap = useCallback((idx) => {
    if (phase !== 'recalling' || tapped.has(idx) || doneRef.current) return;

    if (!lit.has(idx)) {
      // Wrong tap
      setWrong(idx);
      setPhase('feedback');
      setTimeout(() => {
        setWrong(null);
        startRound(round + 1);
      }, 900);
      return;
    }

    const newTapped = new Set(tapped);
    newTapped.add(idx);
    setTapped(newTapped);

    if (newTapped.size === lit.size) {
      // All correct!
      const ns = scoreRef.current + 1;
      scoreRef.current = ns;
      setScore(ns);
      reportScore(ns);
      setPhase('feedback');
      setTimeout(() => startRound(round + 1), 700);
    }
  }, [phase, tapped, lit, round, reportScore, startRound]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Round <strong>{round + 1}</strong> / {config.rounds}</span>
        <span className={styles.phaseLabel}>
          {phase === 'showing'   ? '👁 Memorise…' : ''}
          {phase === 'recalling' ? '👆 Tap the lit tiles' : ''}
          {phase === 'feedback'  && tapped.size === lit.size ? '✓ Correct!' : ''}
          {phase === 'feedback'  && tapped.size  <  lit.size ? '✗ Wrong tile' : ''}
        </span>
        <span className={styles.scoreLabel}>Score: <strong>{score}</strong></span>
      </div>

      <div className={styles.grid} style={{ '--cols': config.gridSize }}>
        {Array.from({ length: total }, (_, i) => {
          const isLit     = lit.has(i);
          const isTapped  = tapped.has(i);
          const isWrong   = wrong === i;
          const showGlow  = phase === 'showing' && isLit;

          let cls = styles.tile;
          if (showGlow)                                     cls = `${styles.tile} ${styles.tileLit}`;
          if (phase === 'recalling' && isTapped)            cls = `${styles.tile} ${styles.tileTapped}`;
          if (phase === 'feedback'  && isLit && !isWrong)   cls = `${styles.tile} ${styles.tileTapped}`;
          if (isWrong)                                      cls = `${styles.tile} ${styles.tileWrong}`;

          return (
            <button
              key={i}
              className={cls}
              onClick={() => handleTap(i)}
              disabled={phase !== 'recalling' || isTapped}
              aria-label={`Tile ${i + 1}`}
            />
          );
        })}
      </div>
    </div>
  );
}

TileFlipGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
};

export function TileFlip({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'tile-flip', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="tile-flip"
      title="Tile Flip"
      instructions="A pattern of tiles lights up briefly — memorise it, then tap every lit tile. Don't tap the wrong ones!"
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft }) => (
        <TileFlipGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} />
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
