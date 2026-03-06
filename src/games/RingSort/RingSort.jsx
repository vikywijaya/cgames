import { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './RingSort.module.css';

const RING_COLORS = [
  { bg: '#f87171', name: 'red' },
  { bg: '#facc15', name: 'yellow' },
  { bg: '#4ade80', name: 'green' },
  { bg: '#60a5fa', name: 'blue' },
  { bg: '#c084fc', name: 'purple' },
  { bg: '#f9a8d4', name: 'pink' },
  { bg: '#2dd4bf', name: 'teal' },
  { bg: '#fb923c', name: 'orange' },
  { bg: '#d4a574', name: 'brown' },
];

/* Ring widths: wider at the bottom (index 0), narrower at the top */
const RING_WIDTHS = [62, 54, 46, 38, 32];

const DIFFICULTY_CONFIG = {
  easy:   { numColors: 3, ringsPerColor: 3, extraRods: 1, rounds: 4, timeLimitSeconds: null },
  medium: { numColors: 4, ringsPerColor: 4, extraRods: 2, rounds: 5, timeLimitSeconds: 180  },
  hard:   { numColors: 5, ringsPerColor: 4, extraRods: 2, rounds: 6, timeLimitSeconds: 120  },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generatePuzzle(numColors, ringsPerColor, extraRods) {
  const colors = shuffle(RING_COLORS).slice(0, numColors);

  const allRings = [];
  for (const color of colors) {
    for (let i = 0; i < ringsPerColor; i++) allRings.push(color);
  }

  const shuffled = shuffle(allRings);
  const totalRods = numColors + extraRods;
  const rods = Array.from({ length: totalRods }, () => []);
  let idx = 0;
  for (let r = 0; r < numColors; r++) {
    for (let i = 0; i < ringsPerColor; i++) rods[r].push(shuffled[idx++]);
  }

  const alreadySolved = rods.every(rod =>
    rod.length === 0 || rod.every(ring => ring.name === rod[0].name)
  );
  if (alreadySolved) return generatePuzzle(numColors, ringsPerColor, extraRods);

  return { rods, numColors, ringsPerColor, totalRods };
}

function RingSortGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail, playPop, playBoing }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { numColors, ringsPerColor, extraRods, rounds } = config;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [puzzle, setPuzzle] = useState(() => generatePuzzle(numColors, ringsPerColor, extraRods));
  const [rods, setRods] = useState(() => puzzle.rods.map(r => [...r]));
  const [selectedRod, setSelectedRod] = useState(null);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);
  const [justMovedRod, setJustMovedRod] = useState(null);
  const [shakingRod, setShakingRod] = useState(null);

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: rounds, completed: false });
  }, [secondsLeft, score, rounds, onComplete]);

  const isSolved = useMemo(() =>
    rods.every(rod =>
      rod.length === 0 || (rod.length === ringsPerColor && rod.every(ring => ring.name === rod[0].name))
    ),
  [rods, ringsPerColor]);

  const rodComplete = useMemo(() =>
    rods.map(rod => rod.length === ringsPerColor && rod.every(ring => ring.name === rod[0].name)),
  [rods, ringsPerColor]);

  useEffect(() => {
    if (!isSolved || solved) return;
    setSolved(true);
    playSuccess();
    const newScore = score + 1;
    setScore(newScore);
    reportScore(newScore);

    const timer = setTimeout(() => {
      const nextRound = round + 1;
      if (nextRound >= rounds) {
        onComplete({ finalScore: newScore, maxScore: rounds, completed: true });
        return;
      }
      setRound(nextRound);
      const newPuzzle = generatePuzzle(numColors, ringsPerColor, extraRods);
      setPuzzle(newPuzzle);
      setRods(newPuzzle.rods.map(r => [...r]));
      setSelectedRod(null);
      setMoves(0);
      setSolved(false);
      setJustMovedRod(null);
    }, 900);
    return () => clearTimeout(timer);
  }, [isSolved, solved, score, round, rounds, numColors, ringsPerColor, extraRods, onComplete, reportScore, playSuccess]);

  const triggerShake = useCallback((rodIdx) => {
    setShakingRod(rodIdx);
    setTimeout(() => setShakingRod(null), 320);
  }, []);

  const handleRodClick = useCallback((rodIdx) => {
    if (solved) return;

    if (selectedRod === null) {
      if (rods[rodIdx].length === 0) return;
      playClick();
      setSelectedRod(rodIdx);
      return;
    }

    if (selectedRod === rodIdx) {
      playClick();
      setSelectedRod(null);
      return;
    }

    const targetRod = rods[rodIdx];

    // Target rod is full
    if (targetRod.length >= ringsPerColor) {
      playBoing();
      triggerShake(rodIdx);
      setSelectedRod(null);
      return;
    }

    playPop();
    const newRods = rods.map(r => [...r]);
    const ring = newRods[selectedRod].pop();
    newRods[rodIdx].push(ring);
    setRods(newRods);
    setMoves(m => m + 1);
    setSelectedRod(null);
    setJustMovedRod(rodIdx);
    setTimeout(() => setJustMovedRod(null), 280);
  }, [solved, selectedRod, rods, ringsPerColor, playClick, playPop, playBoing, triggerShake]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Puzzle <strong>{round + 1}</strong> / {rounds}</span>
        <span className={styles.movesLabel}>Moves: <strong>{moves}</strong></span>
      </div>

      <div className={`${styles.rodsArea} ${solved ? styles.areasSolved : ''}`}>
        {rods.map((rod, rodIdx) => {
          const isSelected = selectedRod === rodIdx;
          const isComplete = rodComplete[rodIdx];
          const isShaking = shakingRod === rodIdx;

          let rodClass = styles.rod;
          if (isSelected) rodClass += ` ${styles.rodSelected}`;
          if (isComplete) rodClass += ` ${styles.rodSolved}`;
          if (isShaking) rodClass += ` ${styles.rodShake}`;

          return (
            <button
              key={rodIdx}
              className={rodClass}
              onClick={() => handleRodClick(rodIdx)}
              disabled={solved}
              aria-label={`Rod ${rodIdx + 1}, ${rod.length} ring${rod.length !== 1 ? 's' : ''}${isComplete ? ', sorted' : ''}${isSelected ? ', selected' : ''}`}
            >
              {/* Fixed-height body: peg runs full height, rings stack from bottom */}
              <div className={styles.rodBody}>
                <div className={styles.pegStick} />
                <div className={styles.ringStack}>
                  {rod.map((ring, ringIdx) => {
                    const isTop = ringIdx === rod.length - 1;
                    const width = RING_WIDTHS[Math.min(ringIdx, RING_WIDTHS.length - 1)];
                    const lifted = isSelected && isTop;
                    const justMoved = justMovedRod === rodIdx && isTop;

                    let ringClass = styles.ring;
                    if (lifted) ringClass += ` ${styles.ringLifted}`;
                    if (justMoved) ringClass += ` ${styles.ringJustMoved}`;

                    return (
                      <div
                        key={ringIdx}
                        className={ringClass}
                        style={{ width, background: ring.bg }}
                        aria-label={`${ring.name} ring`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Wooden base platform */}
              <div className={styles.base} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

RingSortGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playPop:     PropTypes.func.isRequired,
  playBoing:   PropTypes.func.isRequired,
};

export function RingSort({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'ring-sort', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="ring-sort"
      title="Rings"
      instructions="Place the rings of the same colour on each rod. Tap a rod to pick up the top ring, then tap another rod to place it. Sort all the rings by colour to complete the puzzle!"
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail, playPop, playBoing }) => (
        <RingSortGame
          difficulty={difficulty}
          onComplete={sc}
          reportScore={reportScore}
          secondsLeft={secondsLeft}
          playClick={playClick}
          playSuccess={playSuccess}
          playFail={playFail}
          playPop={playPop}
          playBoing={playBoing}
        />
      )}
    </GameShell>
  );
}

RingSort.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
