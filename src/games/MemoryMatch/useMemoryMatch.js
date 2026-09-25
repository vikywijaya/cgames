import { useState, useCallback, useRef } from 'react';
import { shuffle } from '../../utils/shuffle';

/*
 * Memory Match rules (tuned for seniors):
 * - All cards are shown face up for a few seconds at the start (peekMs).
 * - Each match is worth up to MATCH_POINTS, minus one for every wrong
 *   guess since the previous match (never less than 1). Careful play
 *   scores more; it used to be 100% for any finished game.
 * - One "Peek" per game shows every unmatched card for a moment.
 * - No overall clock.
 */
const DIFFICULTY_CONFIG = {
  easy:   { cols: 4, pairs: 6,  peekMs: 3500, peeks: 1 },
  medium: { cols: 4, pairs: 8,  peekMs: 3000, peeks: 1 },
  hard:   { cols: 4, pairs: 10, peekMs: 2500, peeks: 1 },
};
export const MATCH_POINTS = 3;
const PEEK_MS = 1600;
const MATCH_DELAY = 450;
const MISMATCH_DELAY = 1100;

// A different theme each game so the pictures don't become familiar.
const THEMES = [
  ['🌸', '🌻', '🌷', '🌹', '🌼', '🌺', '🍀', '🌵', '🌴', '🍁'],
  ['🐶', '🐱', '🐰', '🐼', '🦁', '🐸', '🐢', '🦋', '🐟', '🦉'],
  ['🍎', '🍌', '🍇', '🍓', '🍉', '🍍', '🥭', '🍒', '🥥', '🍋'],
  ['🎈', '⭐', '🌙', '🔔', '🎵', '🏡', '☂️', '⚽', '🎁', '🚲'],
];

export function useMemoryMatch(difficulty = 'easy') {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [cards] = useState(() => {
    const symbols = shuffle(THEMES[Math.floor(Math.random() * THEMES.length)]).slice(0, config.pairs);
    return shuffle(symbols.flatMap((symbol, idx) => [
      { id: idx * 2, symbol },
      { id: idx * 2 + 1, symbol },
    ]));
  });

  const [cardState, setCardState] = useState(() => cards.map(() => ({ isFlipped: false, isMatched: false })));
  const [matchCount, setMatchCount] = useState(0);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [peeking, setPeeking] = useState(false);
  const [peeksLeft, setPeeksLeft] = useState(config.peeks);
  const [lastMatch, setLastMatch] = useState(null); // { id, points }

  // Refs so taps in quick succession see each other's effect.
  const flippedRef = useRef([]);
  const lockRef = useRef(false);
  const wrongSinceMatch = useRef(0);
  const scoreRef = useRef(0);

  const flipCard = useCallback((index) => {
    if (lockRef.current || peeking) return false;
    const st = cardState[index];
    if (st.isFlipped || st.isMatched || flippedRef.current.includes(index)) return false;
    if (flippedRef.current.length >= 2) return false;

    const flipped = [...flippedRef.current, index];
    flippedRef.current = flipped;
    setCardState(prev => prev.map((c, i) => (i === index ? { ...c, isFlipped: true } : c)));
    if (flipped.length < 2) return true;

    const [a, b] = flipped;
    lockRef.current = true;
    setMoves(m => m + 1);
    if (cards[a].symbol === cards[b].symbol) {
      const points = Math.max(1, MATCH_POINTS - wrongSinceMatch.current);
      wrongSinceMatch.current = 0;
      scoreRef.current += points;
      setTimeout(() => {
        setCardState(prev => prev.map((c, i) => (i === a || i === b ? { ...c, isMatched: true } : c)));
        setMatchCount(m => m + 1);
        setScore(scoreRef.current);
        setLastMatch({ id: Date.now(), points, cards: [a, b] });
        flippedRef.current = [];
        lockRef.current = false;
      }, MATCH_DELAY);
    } else {
      wrongSinceMatch.current += 1;
      setCardState(prev => prev.map((c, i) => (i === a || i === b ? { ...c, isMismatched: true } : c)));
      setTimeout(() => {
        setCardState(prev => prev.map((c, i) => (i === a || i === b ? { ...c, isFlipped: false, isMismatched: false } : c)));
        flippedRef.current = [];
        lockRef.current = false;
      }, MISMATCH_DELAY);
    }
    return true;
  }, [cardState, cards, peeking]);

  // Show every card (start of game, or the Peek button).
  const peek = useCallback((ms = PEEK_MS, free = false) => {
    if (!free) {
      if (peeksLeft <= 0 || lockRef.current || flippedRef.current.length) return;
      setPeeksLeft(p => p - 1);
    }
    setPeeking(true);
    setTimeout(() => setPeeking(false), ms);
  }, [peeksLeft]);

  return {
    cards,
    cardState,
    flipCard,
    matchCount,
    maxMatches: config.pairs,
    maxScore: config.pairs * MATCH_POINTS,
    score,
    moves,
    cols: config.cols,
    peekMs: config.peekMs,
    peeking,
    peeksLeft,
    peek,
    lastMatch,
    done: matchCount === config.pairs,
  };
}
