import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import styles from './GameCountdown.module.css';

const STEPS = [3, 2, 1, 'Go!'];

/**
 * Full-screen countdown overlay: 3 → 2 → 1 → Go!
 * Calls onDone() after "Go!" fades out.
 */
export function GameCountdown({ onDone }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (index < STEPS.length - 1) {
      // Advance to next step every 800ms
      const t = setTimeout(() => {
        setVisible(false);
        setTimeout(() => { setIndex(i => i + 1); setVisible(true); }, 150);
      }, 800);
      return () => clearTimeout(t);
    } else {
      // On "Go!" — hold briefly then call onDone
      const t = setTimeout(() => {
        setVisible(false);
        setTimeout(onDone, 200);
      }, 600);
      return () => clearTimeout(t);
    }
  }, [index, onDone]);

  const step = STEPS[index];
  const isGo = step === 'Go!';

  return (
    <div className={styles.overlay}>
      <span
        className={`${styles.label} ${isGo ? styles.go : styles.number} ${visible ? styles.visible : styles.hidden}`}
      >
        {step}
      </span>
    </div>
  );
}

GameCountdown.propTypes = {
  onDone: PropTypes.func.isRequired,
};
