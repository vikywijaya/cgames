import { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import styles from './OddOneOut.module.css';
import { useTranslation } from '../../i18n/useTranslation';

const DIFFICULTY_CONFIG = {
  easy:   { questions: 8,  gridSize: 3, timeLimitSeconds: null },
  medium: { questions: 10, gridSize: 4, timeLimitSeconds: 120  },
  hard:   { questions: 12, gridSize: 5, timeLimitSeconds: 90   },
};

// Pools of grouped emoji sets — each `group` is strictly ONE category and each
// `odd` is strictly a DIFFERENT single category, so every puzzle has exactly one
// defensible answer (the odd item belongs to a clearly different group).
const SETS = [
  // Fruits  vs  vegetables
  { group: ['🍎','🍊','🍋','🍇','🍓','🍑','🍒','🍉','🥭','🍍','🍌','🍐'], odd: ['🥕','🥦','🧅','🥬','🌽','🥒'] },
  // Land mammals  vs  sea creatures
  { group: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮'], odd: ['🐟','🦈','🐬','🐙','🦞','🐠'] },
  // Ground vehicles  vs  aircraft
  { group: ['🚗','🚕','🚙','🚌','🚎','🚓','🚑','🚒','🛻','🚐','🚜','🚚'], odd: ['✈️','🚀','🚁','🛩️'] },
  // Ball sports  vs  musical instruments
  { group: ['⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱'], odd: ['🎻','🥁','🎸','🎺','🎷'] },
  // Flowers  vs  weather symbols
  { group: ['🌹','🌷','🌸','🌺','🌻','🌼','🌾','🌿','🍀','🌵'], odd: ['🌊','🌋','🌪️','⚡','🌈'] },
  // Savoury food  vs  sweet desserts
  { group: ['🍕','🍔','🌮','🌯','🥪','🥙','🧆','🥗','🍜','🍣','🌭','🍟'], odd: ['🎂','🍰','🍩','🍪','🧁','🍫'] },
  // Faces  vs  hand gestures
  { group: ['😀','😄','😁','😊','🙂','😉','😍','😎','🤗','😇','🥰','😋'], odd: ['👍','👏','👋','🙌','✌️','👌'] },
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestion(gridSize) {
  const set = SETS[Math.floor(Math.random() * SETS.length)];
  const total = gridSize * gridSize;
  const majorCount = total - 1;
  // Fill all major cells from the group, repeating (reshuffled) if the grid is
  // larger than the group so the grid is never left with empty cells.
  const majors = [];
  while (majors.length < majorCount) {
    const batch = shuffle(set.group);
    majors.push(...batch.slice(0, majorCount - majors.length));
  }
  const oddItem = set.odd[Math.floor(Math.random() * set.odd.length)];
  const items = shuffle([...majors, oddItem]);
  const oddIndex = items.indexOf(oddItem);
  return { items, oddIndex };
}

function OddOneOutGame({ difficulty, onComplete, reportScore, secondsLeft, playClick, playSuccess, playFail }) {
  const t = useTranslation();
  const config = DIFFICULTY_CONFIG[difficulty] ?? DIFFICULTY_CONFIG.easy;
  const [qIndex,   setQIndex]   = useState(0);
  const [score,    setScore]    = useState(0);
  const [feedback, setFeedback] = useState(null); // null | { correct: bool, chosen: int }
  const [question, setQuestion] = useState(() => buildQuestion(config.gridSize));

  useEffect(() => {
    if (secondsLeft === 0) onComplete({ finalScore: score, maxScore: config.questions, completed: false });
  }, [secondsLeft, score, config.questions, onComplete]);

  const nextQ = useCallback((newScore) => {
    const next = qIndex + 1;
    if (next >= config.questions) {
      onComplete({ finalScore: newScore, maxScore: config.questions, completed: true });
      return;
    }
    setQIndex(next);
    setFeedback(null);
    setQuestion(buildQuestion(config.gridSize));
  }, [qIndex, config, onComplete]);

  const handleTap = useCallback((idx) => {
    if (feedback) return;
    playClick();
    const correct = idx === question.oddIndex;
    if (correct) { playSuccess(); } else { playFail(); }
    const newScore = correct ? score + 1 : score;
    if (correct) setScore(newScore);
    reportScore(newScore);
    setFeedback({ correct, chosen: idx });
    setTimeout(() => nextQ(newScore), 900);
  }, [feedback, question.oddIndex, score, reportScore, nextQ, playClick, playSuccess, playFail]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderLabel}>{t.games['odd-one-out'].label}</span>
          <span className={styles.infoHeaderSub}>{t.common.question} {qIndex + 1} {t.common.of} {config.questions}</span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{score}</span>
          <span className={styles.infoBadgeSub}>/ {config.questions}</span>
        </div>
      </div>

      <p className={styles.prompt}>Tap the one that doesn't belong</p>

      <div
        className={styles.grid}
        style={{ '--cols': config.gridSize }}
        role="application"
        aria-label="Odd one out grid"
      >
        {question.items.map((emoji, i) => {
          let cls = styles.cell;
          if (feedback) {
            if (i === question.oddIndex) cls = `${styles.cell} ${styles.cellCorrect}`;
            else if (i === feedback.chosen && !feedback.correct) cls = `${styles.cell} ${styles.cellWrong}`;
          }
          return (
            <button
              key={i}
              className={cls}
              style={{ '--idx': i }}
              onClick={() => handleTap(i)}
              disabled={!!feedback}
              aria-label={`Item ${i + 1}: ${emoji}`}
            >
              {emoji}
            </button>
          );
        })}
      </div>

      <p className={feedback ? (feedback.correct ? styles.feedbackOk : styles.feedbackBad) : styles.feedbackSlot}>
        {feedback ? (feedback.correct ? t.common.correct : t.games['odd-one-out'].wrongAnswer) : '\u00A0'}
      </p>
    </div>
  );
}

OddOneOutGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func.isRequired,
  secondsLeft: PropTypes.number,
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

const TIME_LIMITS = { easy: DIFFICULTY_CONFIG.easy.timeLimitSeconds ?? null, medium: DIFFICULTY_CONFIG.medium.timeLimitSeconds ?? null, hard: DIFFICULTY_CONFIG.hard.timeLimitSeconds ?? null };

export function OddOneOut({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete: fireCallback } = useGameCallback({ memberId, gameId: 'odd-one-out', callbackUrl, onComplete });
  return (
    <GameShell
      gameId="odd-one-out"
      title={t.games['odd-one-out'].title}
      instructions={t.games['odd-one-out'].instructions}
      difficulty={difficulty}
      timeLimits={TIME_LIMITS}
      onGameComplete={fireCallback}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: sc, reportScore, secondsLeft, difficulty: diff, playClick, playSuccess, playFail }) => (
        <OddOneOutGame difficulty={diff} onComplete={sc} reportScore={reportScore} secondsLeft={secondsLeft} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
      )}
    </GameShell>
  );
}

OddOneOut.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
