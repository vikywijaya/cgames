import { useState, useEffect, useRef } from 'react';

/**
 * Reusable countdown timer hook.
 *
 * @param {object} options
 * @param {number|null} options.seconds - Total seconds to count down. null = no timer.
 * @param {boolean} options.active - Only counts when true.
 * @param {number} options.resetKey - Increment to reset the timer immediately (e.g. on Play Again).
 * @param {function} options.onExpire - Called exactly once when countdown reaches 0.
 * @returns {{ secondsLeft: number|null }}
 */
export function useCountdown({ seconds, active, resetKey = 0, onExpire }) {
  const [secondsLeft, setSecondsLeft] = useState(seconds ?? null);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  // Keep onExpire ref up-to-date without re-running the effect
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  // Reset immediately whenever resetKey changes (Play Again) or seconds changes
  useEffect(() => {
    if (seconds == null) return;
    expiredRef.current = false;
    setSecondsLeft(seconds);
  }, [resetKey, seconds]);

  // Start/stop the interval based on active
  useEffect(() => {
    if (!active || seconds == null) return;

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!expiredRef.current) {
            expiredRef.current = true;
            onExpireRef.current?.();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [active, seconds]);

  return { secondsLeft };
}
