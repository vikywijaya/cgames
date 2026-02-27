/**
 * useSoundFx — synthesised sound effects via Web Audio API.
 * No audio files required. Safe when AudioContext is unavailable.
 *
 * Exported sounds:
 *   playClick()    – subtle UI tick
 *   playSuccess()  – rising 3-note chime (correct answer / match)
 *   playFail()     – descending buzz (wrong answer / miss)
 *   playComplete() – triumphant 4-note fanfare (game over)
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
    notes.forEach(({ freq, t = 0, dur, vol = 0.22 }) => {
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
  function playClick() {
    playTone([{ freq: 900, t: 0, dur: 0.04, vol: 0.10 }]);
  }

  function playSuccess() {
    playTone([
      { freq: 523.25, t: 0,    dur: 0.10, vol: 0.20 }, // C5
      { freq: 659.25, t: 0.09, dur: 0.10, vol: 0.20 }, // E5
      { freq: 783.99, t: 0.18, dur: 0.16, vol: 0.22 }, // G5
    ]);
  }

  function playFail() {
    playTone([
      { freq: 311, t: 0,    dur: 0.09, vol: 0.20 },
      { freq: 196, t: 0.09, dur: 0.20, vol: 0.20 },
    ], 'sawtooth');
  }

  function playComplete() {
    playTone([
      { freq: 523.25, t: 0,    dur: 0.09, vol: 0.25 }, // C5
      { freq: 659.25, t: 0.08, dur: 0.09, vol: 0.25 }, // E5
      { freq: 783.99, t: 0.16, dur: 0.09, vol: 0.25 }, // G5
      { freq: 1046.5, t: 0.25, dur: 0.32, vol: 0.28 }, // C6
    ]);
  }

  return { playClick, playSuccess, playFail, playComplete };
}
