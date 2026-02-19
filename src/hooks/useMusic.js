import { useEffect, useRef, useState } from 'react';

/**
 * Manages a looping background audio track.
 * Starts muted (browsers block autoplay with sound).
 * Call `toggle()` to unmute/mute.
 */
export function useMusic(src) {
  const audioRef = useRef(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const audio = new Audio(src);
    audio.loop = true;
    audio.volume = 0.35;
    audio.muted = true; // start muted to satisfy autoplay policy
    audioRef.current = audio;

    // Attempt autoplay (will succeed silently since muted=true)
    audio.play().catch(() => {});

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [src]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    const nowMuted = !audio.muted;
    audio.muted = nowMuted;
    // If paused for any reason, resume
    if (!nowMuted && audio.paused) audio.play().catch(() => {});
    setMuted(nowMuted);
  }

  return { muted, toggle };
}
