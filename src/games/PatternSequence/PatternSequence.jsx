import { useEffect } from 'react';
import PropTypes from 'prop-types';
import { GameShell } from '../../components/GameShell/GameShell';
import { Button } from '../../components/Button/Button';
import { useGameCallback } from '../../hooks/useGameCallback';
import { GAME_IDS } from '../../utils/gameIds';
import { usePatternSequence } from './usePatternSequence';
import styles from './PatternSequence.module.css';

const INSTRUCTIONS =
  'Watch the coloured pads light up in a sequence, then repeat the pattern by clicking the pads in the same order. ' +
  'Each round adds one more step. Take your time — there is no time pressure during your turn!';

// Each pad has a unique shape icon for colour-blind accessibility
const PADS = [
  { index: 0, label: 'Red circle',    colorClass: styles.padRed,    shape: '●' },
  { index: 1, label: 'Blue square',   colorClass: styles.padBlue,   shape: '■' },
  { index: 2, label: 'Yellow triangle', colorClass: styles.padYellow, shape: '▲' },
  { index: 3, label: 'Green diamond', colorClass: styles.padGreen,  shape: '◆' },
];

function PadGrid({ highlightedPad, onPress, disabled }) {
  return (
    <div className={styles.padGrid} role="group" aria-label="Pattern pads">
      {PADS.map((pad) => {
        const isLit = highlightedPad === pad.index;
        return (
          <button
            key={pad.index}
            className={[
              styles.pad,
              pad.colorClass,
              isLit ? styles.padLit : '',
            ]
              .filter(Boolean)
              .join(' ')}
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
  onPress: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};

function PatternSequenceGame({ difficulty, onComplete, reportScore, playClick, playSuccess, playFail }) {
  const {
    phase,
    highlightedPad,
    currentRound,
    maxRound,
    presspad,
    startGame,
    score,
    maxScore,
  } = usePatternSequence(difficulty);

  useEffect(() => { reportScore?.(score); }, [score, reportScore]);

  useEffect(() => {
    if (phase === 'correct') { playSuccess(); }
    if (phase === 'failed')  { playFail(); }
  }, [phase, playSuccess, playFail]);

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

  return (
    <div className={styles.container}>
      <p className={styles.roundInfo}>
        Round <strong>{currentRound}</strong> of {maxRound}
      </p>

      <p className={styles.statusText} aria-live="polite" aria-atomic="true">
        {statusText}
      </p>

      <PadGrid
        highlightedPad={highlightedPad}
        onPress={(idx) => { playClick(); presspad(idx); }}
        disabled={phase !== 'input'}
      />

      {phase === 'failed' && (
        <div className={styles.failedOverlay} role="alert">
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
  playClick:   PropTypes.func.isRequired,
  playSuccess: PropTypes.func.isRequired,
  playFail:    PropTypes.func.isRequired,
};

export function PatternSequence({ memberId, difficulty = 'easy', onComplete, callbackUrl, onBack, musicMuted, onToggleMusic }) {
  const { fireComplete } = useGameCallback({
    memberId,
    gameId: GAME_IDS.PATTERN_SEQUENCE,
    callbackUrl,
    onComplete,
  });

  return (
    <GameShell
      gameId={GAME_IDS.PATTERN_SEQUENCE}
      title="Pattern Sequence"
      instructions={INSTRUCTIONS}
      difficulty={difficulty}
      timeLimitSeconds={null}
      onGameComplete={fireComplete}
      onBack={onBack}
      musicMuted={musicMuted}
      onToggleMusic={onToggleMusic}
    >
      {({ onComplete: shellComplete, reportScore, playClick, playSuccess, playFail }) => (
        <PatternSequenceGame difficulty={difficulty} onComplete={shellComplete} reportScore={reportScore} playClick={playClick} playSuccess={playSuccess} playFail={playFail} />
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
