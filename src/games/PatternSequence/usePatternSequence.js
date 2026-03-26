import { useState, useCallback, useRef } from 'react';

const DIFFICULTY_CONFIG = {
  easy:   { startLen: 2, maxLen: 6,  flashMs: 800 },
  medium: { startLen: 3, maxLen: 8,  flashMs: 600 },
  hard:   { startLen: 4, maxLen: 10, flashMs: 450 },
};

// 4 pads: red=0, blue=1, yellow=2, green=3
const PAD_COUNT = 4;

function randomPad() {
  return Math.floor(Math.random() * PAD_COUNT);
}

export function usePatternSequence(difficulty = 'easy', { onHighlight } = {}) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [sequence, setSequence] = useState(() =>
    Array.from({ length: config.startLen }, () => randomPad())
  );
  const [playerInput, setPlayerInput] = useState([]);
  const [highlightedPad, setHighlightedPad] = useState(null);
  const [phase, setPhase] = useState('idle'); // 'idle'|'showing'|'input'|'correct'|'failed'|'won'
  const [currentRound, setCurrentRound] = useState(config.startLen);
  const abortRef = useRef(false);
  const onHighlightRef = useRef(onHighlight);
  onHighlightRef.current = onHighlight;

  const showSequence = useCallback(
    async (seq) => {
      abortRef.current = false;
      setPhase('showing');
      setPlayerInput([]);

      // Small pause before starting the sequence
      await delay(500);

      for (const pad of seq) {
        if (abortRef.current) return;
        setHighlightedPad(pad);
        onHighlightRef.current?.(pad);
        await delay(config.flashMs);
        if (abortRef.current) return;
        setHighlightedPad(null);
        await delay(200);
      }

      if (!abortRef.current) setPhase('input');
    },
    [config.flashMs]
  );

  const startGame = useCallback(() => {
    const initial = Array.from({ length: config.startLen }, () => randomPad());
    setSequence(initial);
    setPlayerInput([]);
    setCurrentRound(config.startLen);
    showSequence(initial);
  }, [config.startLen, showSequence]);

  const presspad = useCallback(
    (padIndex) => {
      if (phase !== 'input') return;

      const newInput = [...playerInput, padIndex];
      setPlayerInput(newInput);

      // Check correctness so far
      const expectedSoFar = sequence.slice(0, newInput.length);
      const correct = newInput.every((v, i) => v === expectedSoFar[i]);

      if (!correct) {
        setPhase('failed');
        return;
      }

      if (newInput.length === sequence.length) {
        // Completed the round
        const nextRound = currentRound + 1;
        if (nextRound > config.maxLen) {
          setPhase('won');
          return;
        }
        setPhase('correct');
        setCurrentRound(nextRound);

        // Extend sequence for next round
        const nextSequence = [...sequence, randomPad()];
        setSequence(nextSequence);

        setTimeout(() => {
          showSequence(nextSequence);
        }, 800);
      }
    },
    [phase, playerInput, sequence, currentRound, config.maxLen, showSequence]
  );

  const resetGame = useCallback(() => {
    abortRef.current = true;
    setHighlightedPad(null);
    setPlayerInput([]);
    setPhase('idle');
  }, []);

  return {
    phase,
    sequence,
    playerInput,
    highlightedPad,
    currentRound,
    maxRound: config.maxLen,
    presspad,
    startGame,
    resetGame,
    score: Math.max(0, currentRound - config.startLen),
    maxScore: config.maxLen - config.startLen,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
