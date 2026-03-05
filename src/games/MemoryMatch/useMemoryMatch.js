import { useState, useCallback } from 'react';
import { shuffle } from '../../utils/shuffle';

const DIFFICULTY_CONFIG = {
  easy:   { cols: 4, rows: 3, pairs: 6,  timeLimitSeconds: null },
  medium: { cols: 4, rows: 4, pairs: 8,  timeLimitSeconds: 120 },
  hard:   { cols: 5, rows: 4, pairs: 10, timeLimitSeconds: 90 },
};

// Emoji symbols used as card faces
const SYMBOLS = [
  '🌸', '🎵', '⭐', '🌙', '🍎', '🦋', '🌈', '🎈',
  '🐢', '🌻', '🎨', '🏡', '🌿', '🦁', '🎭', '🔔',
];

export function useMemoryMatch(difficulty = 'easy') {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [cards] = useState(() => {
    const symbols = SYMBOLS.slice(0, config.pairs);
    const pairs = symbols.flatMap((symbol, idx) => [
      { id: idx * 2,     symbol, isFlipped: false, isMatched: false },
      { id: idx * 2 + 1, symbol, isFlipped: false, isMatched: false },
    ]);
    return shuffle(pairs);
  });

  const [cardState, setCardState] = useState(() =>
    cards.map((c) => ({ isFlipped: false, isMatched: false }))
  );
  const [flippedIndices, setFlippedIndices] = useState([]);
  const [lockBoard, setLockBoard] = useState(false);
  const [matchCount, setMatchCount] = useState(0);

  const flipCard = useCallback(
    (index) => {
      if (lockBoard) return;
      if (cardState[index].isFlipped || cardState[index].isMatched) return;
      if (flippedIndices.length >= 2) return;

      const newFlipped = [...flippedIndices, index];
      setFlippedIndices(newFlipped);
      setCardState((prev) =>
        prev.map((c, i) => (i === index ? { ...c, isFlipped: true } : c))
      );

      if (newFlipped.length === 2) {
        const [a, b] = newFlipped;
        const symbolA = cards[a].symbol;
        const symbolB = cards[b].symbol;

        setLockBoard(true);

        if (symbolA === symbolB) {
          // Match found
          setTimeout(() => {
            setCardState((prev) =>
              prev.map((c, i) =>
                i === a || i === b ? { ...c, isMatched: true } : c
              )
            );
            setMatchCount((m) => m + 1);
            setFlippedIndices([]);
            setLockBoard(false);
          }, 600);
        } else {
          // No match — briefly flag as mismatched then flip back
          setCardState((prev) =>
            prev.map((c, i) =>
              i === a || i === b ? { ...c, isMismatched: true } : c
            )
          );
          setTimeout(() => {
            setCardState((prev) =>
              prev.map((c, i) =>
                i === a || i === b ? { ...c, isFlipped: false, isMismatched: false } : c
              )
            );
            setFlippedIndices([]);
            setLockBoard(false);
          }, 1000);
        }
      }
    },
    [lockBoard, cardState, flippedIndices, cards]
  );

  return {
    cards,
    cardState,
    flipCard,
    matchCount,
    maxMatches: config.pairs,
    cols: config.cols,
    timeLimitSeconds: config.timeLimitSeconds,
    done: matchCount === config.pairs,
  };
}
