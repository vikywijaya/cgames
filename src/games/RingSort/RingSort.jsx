import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  easy:   { numColors: 2, ringsPerColor: 3, rodCapacity: 4, extraRods: 1, rounds: 3, timeLimitSeconds: null },
  medium: { numColors: 3, ringsPerColor: 3, rodCapacity: 4, extraRods: 1, rounds: 4, timeLimitSeconds: null },
  hard:   { numColors: 4, ringsPerColor: 4, rodCapacity: 4, extraRods: 1, rounds: 5, timeLimitSeconds: null },
};

const TIME_LIMITS = { easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds ?? null, medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds ?? null, hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds ?? null };

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

  // Each ring gets a fixed size: 0 = largest (bottom), ringsPerColor-1 = smallest (top)
  const allRings = [];
  for (const color of colors) {
    for (let size = 0; size < ringsPerColor; size++) allRings.push({ ...color, size });
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
  const { numColors, ringsPerColor, rodCapacity, extraRods, rounds } = config;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [puzzle, setPuzzle] = useState(() => generatePuzzle(numColors, ringsPerColor, extraRods));
  const [rods, setRods] = useState(() => puzzle.rods.map(r => [...r]));
  const [selectedRod, setSelectedRod] = useState(null);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);
  const [justMovedRod, setJustMovedRod] = useState(null);
  const [shakingRod, setShakingRod] = useState(null);
  const advanceRef = useRef(null);

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: rounds, completed: false });
  }, [secondsLeft, score, rounds, onComplete]);

  // Check if rings are same color and in correct size order (size 0=largest at bottom, increasing upward)
  const isCorrectOrder = useCallback((rod) => {
    if (rod.length === 0) return false;
    if (!rod.every(ring => ring.name === rod[0].name)) return false;
    for (let i = 1; i < rod.length; i++) {
      if (rod[i].size <= rod[i - 1].size) return false;
    }
    return true;
  }, []);

  // A rod is fully complete when it has all rings of one color in correct size order
  const isRodFullyComplete = useCallback((rod) => {
    return rod.length === ringsPerColor && isCorrectOrder(rod);
  }, [ringsPerColor, isCorrectOrder]);

  const isSolved = useMemo(() => {
    const fullyComplete = rods.filter(isRodFullyComplete);
    return fullyComplete.length === numColors;
  }, [rods, numColors, isRodFullyComplete]);

  // Visual indicator: show green for fully complete, subtle highlight for on-track
  const rodComplete = useMemo(() =>
    rods.map(isRodFullyComplete),
  [rods, isRodFullyComplete]);

  const rodOnTrack = useMemo(() =>
    rods.map(rod => !isRodFullyComplete(rod) && isCorrectOrder(rod)),
  [rods, isRodFullyComplete, isCorrectOrder]);

  useEffect(() => {
    if (!isSolved || solved) return;
    setSolved(true);
    playSuccess();

    setScore(prev => {
      const newScore = prev + 1;
      reportScore(newScore);

      clearTimeout(advanceRef.current);
      advanceRef.current = setTimeout(() => {
        setRound(r => {
          const nextRound = r + 1;
          if (nextRound >= rounds) {
            onComplete({ finalScore: newScore, maxScore: rounds, completed: true });
            return r;
          }
          const newPuzzle = generatePuzzle(numColors, ringsPerColor, extraRods);
          setPuzzle(newPuzzle);
          setRods(newPuzzle.rods.map(rod => [...rod]));
          setSelectedRod(null);
          setMoves(0);
          setSolved(false);
          setJustMovedRod(null);
          return nextRound;
        });
      }, 900);

      return newScore;
    });
  }, [isSolved, solved, rounds, numColors, ringsPerColor, extraRods, onComplete, reportScore, playSuccess]);

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
    if (targetRod.length >= rodCapacity) {
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
  }, [solved, selectedRod, rods, rodCapacity, playClick, playPop, playBoing, triggerShake]);

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
          const isOnTrack = rodOnTrack[rodIdx];
          const isShaking = shakingRod === rodIdx;

          let rodClass = styles.rod;
          if (isSelected) rodClass += ` ${styles.rodSelected}`;
          if (isComplete) rodClass += ` ${styles.rodSolved}`;
          if (isOnTrack) rodClass += ` ${styles.rodOnTrack}`;
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
                    const width = RING_WIDTHS[Math.min(ring.size, RING_WIDTHS.length - 1)];
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
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'ring-sort', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="ring-sort"
      title="Rings"
      instructions="Place the rings of the same colour on each rod. Tap a rod to pick up the top ring, then tap another rod to place it. Sort all the rings by colour to complete the puzzle!"
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ difficulty: diff, onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail, playPop, playBoing }) => (
        <RingSortGame
          difficulty={diff}
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
