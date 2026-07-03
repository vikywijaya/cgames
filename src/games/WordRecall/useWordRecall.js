import { useState, useCallback } from 'react';
import { sampleWords } from '../../utils/wordLists';

const DIFFICULTY_CONFIG = {
  easy:   { count: 5,  studySeconds: 30, recallSeconds: 60 },
  medium: { count: 8,  studySeconds: 25, recallSeconds: 60 },
  hard:   { count: 12, studySeconds: 20, recallSeconds: 60 },
};

export function useWordRecall(difficulty = 'easy') {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [wordList] = useState(() => sampleWords(difficulty, config.count));
  const [phase, setPhase] = useState('study'); // 'study' | 'recall' | 'review'
  const [recalled, setRecalled] = useState(new Set());
  const [inputValue, setInputValue] = useState('');
  const [lastResult, setLastResult] = useState(null); // 'found' | 'already' | 'notFound' | null

  const studySeconds = config.studySeconds;
  const recallSeconds = config.recallSeconds;

  const enterRecall = useCallback(() => {
    setPhase('recall');
  }, []);

  const enterReview = useCallback(() => {
    setPhase('review');
  }, []);

  const submitWord = useCallback(() => {
    const word = inputValue.trim().toLowerCase();
    if (!word) return;

    if (recalled.has(word)) {
      setLastResult('already');
    } else if (wordList.includes(word)) {
      setRecalled((prev) => new Set([...prev, word]));
      setLastResult('found');
    } else {
      setLastResult('notFound');
    }

    setInputValue('');

    // Clear result feedback after 1.5s
    setTimeout(() => setLastResult(null), 1500);
  }, [inputValue, recalled, wordList]);

  return {
    wordList,
    phase,
    recalled,
    inputValue,
    setInputValue,
    lastResult,
    studySeconds,
    recallSeconds,
    enterRecall,
    enterReview,
    submitWord,
    score: recalled.size,
    maxScore: wordList.length,
  };
}
