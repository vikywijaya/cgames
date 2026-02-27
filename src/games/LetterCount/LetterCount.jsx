import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './LetterCount.module.css';

const DIFFICULTY_CONFIG = {
  easy:   { rounds: 8,  wordLen: [4, 6],  targetLetterCount: 1, timeLimitSeconds: null },
  medium: { rounds: 10, wordLen: [6, 9],  targetLetterCount: 1, timeLimitSeconds: 120  },
  hard:   { rounds: 12, wordLen: [8, 12], targetLetterCount: 2, timeLimitSeconds: 90   },
};

const WORDS = [
  'BUTTERFLY','ELEPHANT','STRAWBERRY','PINEAPPLE','ADVENTURE','CHOCOLATE',
  'FIREPLACE','UMBRELLA','REMEMBER','YESTERDAY','COMPUTER','LANGUAGE',
  'MOUNTAIN','CALENDAR','BEAUTIFUL','DISTANCE','TREASURE','HOSPITAL',
  'SURPRISE','TOGETHER','FESTIVAL','ENORMOUS','PARADISE','FANTASTIC',
  'BLOSSOM','CRYSTAL','DOLPHIN','JOURNEY','KITCHEN','LIBRARY',
  'MORNING','NATURAL','PATTERN','QUARTER','SCATTER','THUNDER',
  'VICTORY','WHISPER','EXTREME','BALANCE','CAPTAIN','DIAMOND',
  'HARVEST','IMAGINE','JANUARY','KENNEDY','LOBSTER','MUSICAL',
  'NETWORK','OCTOBER','PENGUIN','REPLACE','STRANGE','TRUMPET',
  'UNKNOWN','VILLAGE','WARRIOR','EXCLUDE','YELLOW','ZEBRA',
  'APPLE','BEACH','CLOUD','DANCE','EAGLE','FLAME',
  'GRAPE','HONEY','INDEX','JUICE','KNIFE','LEMON',
];

function countLetter(word, letter) {
  return word.split('').filter(c => c === letter).length;
}

function buildPuzzle(wordLenRange) {
  const [minLen, maxLen] = wordLenRange;
  const eligible = WORDS.filter(w => w.length >= minLen && w.length <= maxLen);
  const word = eligible[Math.floor(Math.random() * eligible.length)];
  const letters = [...new Set(word.split(''))];
  const targetLetter = letters[Math.floor(Math.random() * letters.length)];
  const answer = countLetter(word, targetLetter);

  // Build 4 options: answer + 3 wrong (answer ± 1, answer ± 2)
  const wrongs = new Set();
  for (const off of [1, -1, 2, -2, 3]) {
    const w = answer + off;
    if (w > 0 && w !== answer) wrongs.add(w);
    if (wrongs.size === 3) break;
  }
  const options = [answer, ...[...wrongs].slice(0, 3)];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { word, targetLetter, answer, options };
}

/**
 * LetterCount — a word is shown, player counts occurrences of a highlighted letter.
 * Exercises visual scanning and attention to detail.
 */
function LetterCountGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [round,    setRound]    = useState(0);
  const [score,    setScore]    = useState(0);
  const [puzzle,   setPuzzle]   = useState(() => buildPuzzle(config.wordLen));
  const [feedback, setFeedback] = useState(null);
  const [picked,   setPicked]   = useState(null);
  const scoreRef = useRef(0);
  const doneRef  = useRef(false);

  useEffect(() => {
    if (secondsLeft === 0 && !doneRef.current) {
      doneRef.current = true;
      onComplete({ finalScore: scoreRef.current, maxScore: config.rounds, completed: false });
    }
  }, [secondsLeft, onComplete, config.rounds]);

  const nextRound = useCallback((newRound, newScore) => {
    if (doneRef.current) return;
    if (newRound >= config.rounds) {
      doneRef.current = true;
      onComplete({ finalScore: newScore, maxScore: config.rounds, completed: true });
      return;
    }
    setRound(newRound);
    setPuzzle(buildPuzzle(config.wordLen));
    setFeedback(null);
    setPicked(null);
  }, [config, onComplete]);

  const handlePick = useCallback((val) => {
    if (feedback || doneRef.current) return;
    playClick();
    setPicked(val);
    const correct = val === puzzle.answer;
    if (correct) { playSuccess(); } else { playFail(); }
    setFeedback(correct ? 'correct' : 'wrong');
    let newScore = scoreRef.current;
    if (correct) {
      newScore += 1;
      scoreRef.current = newScore;
      setScore(newScore);
      reportScore(newScore);
    }
    setTimeout(() => nextRound(round + 1, newScore), 700);
  }, [feedback, puzzle, round, reportScore, nextRound, playClick, playSuccess, playFail]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.meta}>
        <span className={styles.roundLabel}>Round <strong>{round + 1}</strong> / {config.rounds}</span>
        <span className={styles.scoreLabel}>Score: <strong>{score}</strong></span>
      </div>

      <p className={styles.prompt}>
        How many times does <strong className={styles.targetLetter}>{puzzle.targetLetter}</strong> appear?
      </p>

      <div className={styles.wordBox}>
        {puzzle.word.split('').map((ch, i) => (
          <span key={i} className={ch === puzzle.targetLetter ? styles.charHighlight : styles.char}>
            {ch}
          </span>
        ))}
      </div>

      <div className={styles.options}>
        {puzzle.options.map((opt, i) => {
          let cls = styles.optBtn;
          if (feedback && opt === puzzle.answer)       cls = `${styles.optBtn} ${styles.optCorrect}`;
          else if (feedback === 'wrong' && opt === picked) cls = `${styles.optBtn} ${styles.optWrong}`;
          return (
            <button key={i} className={cls} onClick={() => handlePick(opt)} disabled={!!feedback} aria-label={String(opt)}>
              {opt}
            </button>
          );
        })}
      </div>

      {feedback === 'correct' && <p className={styles.feedbackOk}>✓ Correct! ({puzzle.answer}×)</p>}
      {feedback === 'wrong'   && <p className={styles.feedbackBad}>✗ It appears {puzzle.answer} time{puzzle.answer > 1 ? 's' : ''}.</p>}
    </div>
  );
}

LetterCountGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function LetterCount({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const fireCallback = useGameCallback({ memberId, gameId: 'letter-count', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="letter-count"
      title="Letter Count"
      instructions="Count how many times the highlighted letter appears in the word. Tap the correct number."
      difficulty={difficulty}
      timeLimitSeconds={config.timeLimitSeconds}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, playClick, playSuccess, playFail }) => (
        <LetterCountGame difficulty={difficulty} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

LetterCount.propTypes = {
  memberId:      PropTypes.string.isRequired,
  difficulty:    PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete:    PropTypes.func.isRequired,
  callbackUrl:   PropTypes.string,
  onBack:        PropTypes.func,
  musicMuted:    PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
