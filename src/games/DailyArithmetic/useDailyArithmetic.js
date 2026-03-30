import { useState, useCallback } from 'react';

const DIFFICULTY_CONFIG = {
  easy:   { ops: ['+'],        range: [1, 20],  questions: 8 },
  medium: { ops: ['+', '-'],   range: [1, 50],  questions: 10 },
  hard:   { ops: ['+', '-', '×'], range: [1, 12], questions: 12 },
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateQuestion(ops, range) {
  const op = ops[Math.floor(Math.random() * ops.length)];
  const [min, max] = range;

  if (op === '×') {
    const a = randInt(1, max);
    const b = randInt(1, max);
    return { a, op, b, answer: a * b };
  }
  if (op === '-') {
    const a = randInt(min, max);
    const b = randInt(min, a); // b <= a to avoid negatives
    return { a, op, b, answer: a - b };
  }
  // +
  const a = randInt(min, max);
  const b = randInt(min, max);
  return { a, op, b, answer: a + b };
}

function generateChoices(answer) {
  const choices = new Set([answer]);
  const offsets = [-3, -2, -1, 1, 2, 3, 4, 5, -4, -5];
  const shuffled = offsets.sort(() => Math.random() - 0.5);
  for (const offset of shuffled) {
    if (choices.size === 4) break;
    const candidate = answer + offset;
    if (candidate >= 0) choices.add(candidate);
  }
  // Fallback: fill with sequential values if not enough
  let fill = answer + 10;
  while (choices.size < 4) {
    choices.add(fill++);
  }
  return [...choices].sort(() => Math.random() - 0.5);
}

export function useDailyArithmetic(difficulty = 'easy') {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;

  const [questions] = useState(() =>
    Array.from({ length: config.questions }, () => {
      const q = generateQuestion(config.ops, config.range);
      return { ...q, choices: generateChoices(q.answer) };
    })
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [feedback, setFeedback] = useState(null); // null | 'correct' | 'wrong'
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const currentQuestion = questions[currentIndex];

  const selectChoice = useCallback((choice) => {
    if (done || feedback !== null) return;

    setSelectedChoice(choice);
    const isCorrect = choice === currentQuestion.answer;
    setFeedback(isCorrect ? 'correct' : 'wrong');
    if (isCorrect) setScore((s) => s + 1);

    setTimeout(() => {
      const next = currentIndex + 1;
      if (next >= questions.length) {
        setDone(true);
      } else {
        setCurrentIndex(next);
        setSelectedChoice(null);
        setFeedback(null);
      }
    }, 800);
  }, [done, feedback, currentQuestion, currentIndex, questions.length]);

  return {
    question: currentQuestion,
    currentIndex,
    totalQuestions: questions.length,
    selectedChoice,
    feedback,
    score,
    maxScore: questions.length,
    done,
    selectChoice,
  };
}
