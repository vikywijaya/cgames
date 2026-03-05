/**
 * useSoundFx — synthesised sound effects via Web Audio API.
 * No audio files required. Safe when AudioContext is unavailable.
 *
 * Exported sounds:
 *   playClick()    – subtle UI tick
 *   playSuccess()  – rising 3-note chime (correct answer / match)
 *   playFail()     – descending buzz (wrong answer / miss)
 *   playComplete() – triumphant 4-note fanfare (game over)
 *   playPop()      – bubbly pop (balloon / tile burst)
 *   playReveal()   – soft ping (card flip / tile highlight)
 *   playTick()     – sharp tick (countdown timer, last 5 s)
 *   playBoing()    – springy boing (whack / mole hit)
 */

let _ctx = null;

function getCtx() {
  if (!_ctx) {
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Browsers suspend AudioContext until a user gesture — resume silently
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

/**
 * @param {Array<{freq, t?, dur, vol?}>} notes
 * @param {'sine'|'square'|'sawtooth'|'triangle'} [wave]
 */
function playTone(notes, wave = 'sine') {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    notes.forEach(({ freq, t = 0, dur, vol = 0.35 }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = wave;
      osc.frequency.setValueAtTime(freq, now + t);
      gain.gain.setValueAtTime(vol, now + t);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + dur);
      osc.start(now + t);
      osc.stop(now + t + dur + 0.02);
    });
  } catch {
    // Silently ignore — AudioContext may be blocked in some environments
  }
}

export function useSoundFx() {
  // Subtle UI tick — button taps, generic interactions
  function playClick() {
    playTone([{ freq: 900, t: 0, dur: 0.04, vol: 0.35 }]);
  }

  // Rising 3-note chime — correct answer / match
  function playSuccess() {
    playTone([
      { freq: 523.25, t: 0,    dur: 0.10, vol: 0.45 }, // C5
      { freq: 659.25, t: 0.09, dur: 0.10, vol: 0.45 }, // E5
      { freq: 783.99, t: 0.18, dur: 0.18, vol: 0.50 }, // G5
    ]);
  }

  // Descending buzz — wrong answer / miss
  function playFail() {
    playTone([
      { freq: 311, t: 0,    dur: 0.10, vol: 0.45 },
      { freq: 196, t: 0.09, dur: 0.22, vol: 0.45 },
    ], 'sawtooth');
  }

  // Triumphant 4-note fanfare — game over
  function playComplete() {
    playTone([
      { freq: 523.25, t: 0,    dur: 0.09, vol: 0.50 }, // C5
      { freq: 659.25, t: 0.08, dur: 0.09, vol: 0.50 }, // E5
      { freq: 783.99, t: 0.16, dur: 0.09, vol: 0.50 }, // G5
      { freq: 1046.5, t: 0.25, dur: 0.35, vol: 0.55 }, // C6
    ]);
  }

  // Bubbly pop — balloon popped / tile burst
  function playPop() {
    playTone([
      { freq: 1200, t: 0,    dur: 0.02, vol: 0.55 },
      { freq:  600, t: 0.01, dur: 0.07, vol: 0.45 },
      { freq:  280, t: 0.05, dur: 0.10, vol: 0.35 },
    ], 'triangle');
  }

  // Soft reveal ping — card flip / tile highlight
  function playReveal() {
    playTone([
      { freq: 660, t: 0,    dur: 0.06, vol: 0.40 },
      { freq: 990, t: 0.05, dur: 0.12, vol: 0.35 },
    ], 'triangle');
  }

  // Sharp tick — countdown timer (last 5 seconds)
  function playTick() {
    playTone([{ freq: 1400, t: 0, dur: 0.025, vol: 0.50 }], 'square');
  }

  // Springy boing — whack / mole hit
  function playBoing() {
    playTone([
      { freq: 300, t: 0,    dur: 0.03, vol: 0.55 },
      { freq: 600, t: 0.02, dur: 0.06, vol: 0.50 },
      { freq: 900, t: 0.06, dur: 0.08, vol: 0.45 },
      { freq: 550, t: 0.12, dur: 0.08, vol: 0.35 },
    ], 'triangle');
  }

  return { playClick, playSuccess, playFail, playComplete, playPop, playReveal, playTick, playBoing };
}
