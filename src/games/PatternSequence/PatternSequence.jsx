import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { useGameCallback } from '../../hooks/useGameCallback';
import { GAME_IDS } from '../../utils/gameIds';
import { usePatternSequence } from './usePatternSequence';
import styles from './PatternSequence.module.css';
import { useTranslation } from '../../i18n/useTranslation';


// Each pad has a unique shape icon for colour-blind accessibility
const PADS = [
  { index: 0, label: 'Red circle',    colorClass: styles.padRed,    shape: '●' },
  { index: 1, label: 'Blue square',   colorClass: styles.padBlue,   shape: '■' },
  { index: 2, label: 'Yellow triangle', colorClass: styles.padYellow, shape: '▲' },
  { index: 3, label: 'Green diamond', colorClass: styles.padGreen,  shape: '◆' },
];

function PadGrid({ highlightedPad, pressedPad, onPress, disabled }) {
  return (
    <div className={styles.padGrid} role="group" aria-label="Pattern pads">
      {PADS.map((pad) => {
        const isLit = highlightedPad === pad.index;
        const isPressed = pressedPad === pad.index;
        return (
          <button
            key={pad.index}
            className={[
              styles.pad,
              pad.colorClass,
              isLit ? styles.padLit : '',
              isPressed ? styles.padPressed : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ '--idx': pad.index }}
            onClick={() => onPress(pad.index)}
            disabled={disabled}
            aria-label={pad.label}
            aria-pressed={isLit}
          >
            {pad.shape}
          </button>
        );
      })}
    </div>
  );
}

PadGrid.propTypes = {
  highlightedPad: PropTypes.number,
  pressedPad: PropTypes.number,
  onPress: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

function PatternSequenceGame({ difficulty, onComplete, reportScore, playSuccess, playFail, playReveal, playBoing }) {
  const t = useTranslation();
  const [pressedPad, setPressedPad] = useState(null);
  const pressTimerRef = useRef(null);

  const {
    phase,
    highlightedPad,
    currentRound,
    maxRound,
    presspad,
    startGame,
    score,
    maxScore,
  } = usePatternSequence(difficulty, { onHighlight: () => playReveal() });

  useEffect(() => { reportScore?.(score); }, [score, reportScore]);

  useEffect(() => {
    if (phase === 'correct') { playSuccess(); }
    if (phase === 'failed')  { playFail(); }
  }, [phase, playSuccess, playFail]);

  // Clear pressed animation timer on unmount
  useEffect(() => () => clearTimeout(pressTimerRef.current), []);

  function handlePress(idx) {
    playBoing();
    setPressedPad(idx);
    clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => setPressedPad(null), 300);
    presspad(idx);
  }

  useEffect(() => {
    if (phase === 'failed') {
      setTimeout(() => {
        onComplete({ finalScore: score, maxScore, completed: false });
      }, 1500);
    }
    if (phase === 'won') {
      onComplete({ finalScore: maxScore, maxScore, completed: true });
    }
  }, [phase, score, maxScore, onComplete]);

  // Auto-start on mount
  useEffect(() => {
    startGame();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const statusText =
    phase === 'showing'
      ? 'Watch the sequence…'
      : phase === 'input'
      ? 'Your turn — repeat the pattern!'
      : phase === 'correct'
      ? '✓ Correct! Get ready for the next round…'
      : phase === 'failed'
      ? 'Not quite — see your score below!'
      : phase === 'won'
      ? '🎉 You completed all rounds!'
      : '';

  const statusClass = [
    styles.statusText,
    phase === 'showing' ? styles.showing : '',
    phase === 'input' ? styles.input : '',
    phase === 'correct' ? styles.correct : '',
    phase === 'failed' ? styles.failed : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.container}>
      <div className={styles.infoHeader}>
        <div className={styles.infoHeaderText}>
          <span className={styles.infoHeaderLabel}>{t.games['pattern-sequence'].label}</span>
          <span className={styles.infoHeaderSub}>{statusText}</span>
        </div>
        <div className={styles.infoBadge}>
          <span className={styles.infoBadgeNum}>{currentRound}</span>
          <span className={styles.infoBadgeSub}>/ {maxRound}</span>
        </div>
      </div>

      <div className={styles.statusCard}>
        <p className={statusClass} aria-live="polite" aria-atomic="true">
          {statusText}
        </p>
      </div>

      <PadGrid
        highlightedPad={highlightedPad}
        pressedPad={pressedPad}
        onPress={handlePress}
        disabled={phase !== 'input'}
      />

      {phase === 'failed' && (
        <div className={styles.failedOverlay} role="alert">
          <strong>Not quite!</strong>
          You reached round {currentRound} — well done for trying!
        </div>
      )}
    </div>
  );
}

PatternSequenceGame.propTypes = {
  difficulty:  PropTypes.string.isRequired,
  onComplete:  PropTypes.func.isRequired,
  reportScore: PropTypes.func,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
  playReveal:  PropTypes.func.isRequired,
  playBoing:   PropTypes.func.isRequired,
};

export function PatternSequence({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const t = useTranslation();
  const { fireComplete } = useGameCallback({
    memberId,
    gameId: GAME_IDS.PATTERN_SEQUENCE,
    callbackUrl,
    onComplete,
  });

  return (
    <GameShell
      gameId={GAME_IDS.PATTERN_SEQUENCE}
      title={t.games['pattern-sequence'].title}
      instructions={t.games['pattern-sequence'].instructions}
      difficulty={difficulty}
      timeLimits={{ easy: null, medium: null, hard: null }}
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore, difficulty: diff, playSuccess, playFail, playReveal, playBoing }) => (
        <PatternSequenceGame difficulty={diff} onComplete={shellComplete} reportScore={reportScore} playSuccess={playSuccess} playFail={playFail} playReveal={playReveal} playBoing={playBoing} />
      )}
    </GameShell>
  );
}

PatternSequence.propTypes = {
  memberId: PropTypes.string.isRequired,
  difficulty: PropTypes.oneOf(['easy', 'medium', 'hard']),
  onComplete: PropTypes.func.isRequired,
  callbackUrl: PropTypes.string,
  onBack: PropTypes.func,
  musicMuted: PropTypes.bool,
  onToggleMusic: PropTypes.func,
};
