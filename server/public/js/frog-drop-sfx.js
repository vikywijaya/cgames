/* ───────────────────────────────────────────────────────────────────────────
   Frog Drop — Sound effects (WebAudio, no asset files)
   Generates short tones / blips on demand. Used by both TV and player.

   Usage:
     fdSfx.init();          // call from a user-gesture (or on first use)
     fdSfx.drop();
     fdSfx.merge(toTier);   // higher tier = brighter
     fdSfx.chain(depth);
     fdSfx.tick();          // last 10 seconds
     fdSfx.tickUrgent();    // last 3 seconds
     fdSfx.timeUp();
     fdSfx.victory();
     fdSfx.go();
     fdSfx.countdown();
     fdSfx.join();
     fdSfx.setMuted(true|false);
   ─────────────────────────────────────────────────────────────────────── */
(function (root) {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;
  let unlocked = false;

  // Persisted mute preference
  try {
    muted = localStorage.getItem('frog_drop_muted') === '1';
  } catch (e) { /* ignore */ }

  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ctx.destination);

    // Resume on first user gesture (autoplay policy on iOS / Chrome).
    const resume = () => {
      if (ctx && ctx.state === 'suspended') ctx.resume();
      unlocked = true;
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
      window.removeEventListener('touchstart', resume, true);
    };
    window.addEventListener('pointerdown', resume, true);
    window.addEventListener('keydown', resume, true);
    window.addEventListener('touchstart', resume, true);
    return ctx;
  }

  function setMuted(on) {
    muted = !!on;
    try { localStorage.setItem('frog_drop_muted', muted ? '1' : '0'); } catch (e) {}
    if (master) master.gain.value = muted ? 0 : 0.7;
  }
  function isMuted() { return muted; }

  // ── Primitive: schedule an oscillator with envelope ───────────────────────
  function tone(opts) {
    if (muted) return;
    if (!ctx) init();
    if (!ctx) return;
    const t0 = ctx.currentTime + (opts.delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.endFreq) {
      osc.frequency.exponentialRampToValueAtTime(opts.endFreq, t0 + (opts.dur || 0.18));
    }
    const peak = opts.peak != null ? opts.peak : 0.32;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (opts.dur || 0.18));
    osc.connect(gain); gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + (opts.dur || 0.18) + 0.05);
  }

  // ── Primitive: short noise burst (for "thud") ─────────────────────────────
  function noise(opts) {
    if (muted) return;
    if (!ctx) init();
    if (!ctx) return;
    const t0 = ctx.currentTime + (opts.delay || 0);
    const dur = opts.dur || 0.08;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      // Decaying noise with optional low-freq tilt
      const fade = 1 - i / data.length;
      data[i] = (Math.random() * 2 - 1) * fade * fade;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = opts.peak != null ? opts.peak : 0.25;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = opts.cutoff || 800;
    src.connect(filt); filt.connect(gain); gain.connect(master);
    src.start(t0);
  }

  // ── Public effects ────────────────────────────────────────────────────────
  // A frog landing — soft thud + woody pluck
  function drop() {
    noise({ peak: 0.3, dur: 0.07, cutoff: 600 });
    tone({ type: 'triangle', freq: 320, endFreq: 160, dur: 0.16, peak: 0.28, delay: 0.005 });
  }

  // Merge two same-tier frogs — sparkly chime that pitches up with tier
  function merge(toTier) {
    const t = Math.max(2, Math.min(8, toTier || 2));
    // Major triad rising with tier
    const root = 392 * Math.pow(1.06, (t - 2) * 1.4); // ~G4 → up
    tone({ type: 'sine',     freq: root,        dur: 0.22, peak: 0.30 });
    tone({ type: 'triangle', freq: root * 1.26, dur: 0.20, peak: 0.20, delay: 0.04 });
    tone({ type: 'sine',     freq: root * 1.5,  dur: 0.18, peak: 0.18, delay: 0.08 });
  }

  // Chain merge — quick ascending arpeggio, depth raises pitch and brightness
  function chain(depth) {
    const d = Math.max(1, Math.min(6, depth || 1));
    const base = 523.25; // C5
    for (let i = 0; i < 3; i++) {
      tone({
        type: 'square',
        freq: base * Math.pow(1.122, i + d * 1.5),
        dur: 0.14,
        peak: 0.22,
        delay: i * 0.06,
      });
    }
  }

  // Final 10 → 4 seconds: gentle metronome
  function tick() {
    tone({ type: 'sine', freq: 880, dur: 0.06, peak: 0.18 });
  }

  // Final 3 → 1 seconds: urgent higher tick
  function tickUrgent() {
    tone({ type: 'square', freq: 1320, dur: 0.07, peak: 0.22 });
  }

  // Round end siren — descending two-tone
  function timeUp() {
    tone({ type: 'sawtooth', freq: 880, endFreq: 440, dur: 0.5, peak: 0.3 });
    tone({ type: 'sawtooth', freq: 660, endFreq: 220, dur: 0.7, peak: 0.28, delay: 0.25 });
  }

  // Victory fanfare — major arpeggio
  function victory() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      tone({ type: 'triangle', freq, dur: 0.45, peak: 0.32, delay: i * 0.16 });
    });
  }

  // 3-2-1 countdown blip
  function countdown() {
    tone({ type: 'sine', freq: 523.25, dur: 0.18, peak: 0.32 });
  }
  // GO!
  function go() {
    tone({ type: 'triangle', freq: 880, dur: 0.4, peak: 0.4 });
    tone({ type: 'sine',     freq: 1320, dur: 0.3, peak: 0.28, delay: 0.05 });
  }

  // Player joined a room
  function join() {
    tone({ type: 'sine', freq: 523, dur: 0.10, peak: 0.20 });
    tone({ type: 'sine', freq: 784, dur: 0.14, peak: 0.22, delay: 0.06 });
  }

  // Score bump tick (subtle for TV when a player gains points)
  function score() {
    tone({ type: 'triangle', freq: 1100, dur: 0.08, peak: 0.16 });
  }

  // Soft button press
  function tap() {
    tone({ type: 'sine', freq: 660, dur: 0.05, peak: 0.14 });
  }

  // Rainbow! 1+2+3+4 → tier-5 — five-note ascending arpeggio + sparkle
  function rainbow() {
    const notes = [523.25, 659.25, 783.99, 987.77, 1318.51]; // C5 E5 G5 B5 E6
    notes.forEach((freq, i) => {
      tone({ type: 'triangle', freq, dur: 0.18, peak: 0.30, delay: i * 0.06 });
    });
    // Sparkle topper
    tone({ type: 'sine', freq: 2093, dur: 0.4, peak: 0.18, delay: 0.32 });
  }

  // Row Match — N same-tier frogs in a row clear together. Punchy whoosh
  // (descending sweep) followed by a celebratory chord.
  function rowMatch(count) {
    const n = Math.max(4, Math.min(5, count || 4));
    // Sweep
    tone({ type: 'sawtooth', freq: 1400, endFreq: 700, dur: 0.18, peak: 0.22 });
    // Triumphant fifth
    tone({ type: 'triangle', freq: 783.99, dur: 0.30, peak: 0.30, delay: 0.10 });
    tone({ type: 'triangle', freq: 1174.66, dur: 0.30, peak: 0.26, delay: 0.10 });
    // Sparkle for full-row (5)
    if (n >= 5) tone({ type: 'sine', freq: 2349, dur: 0.4, peak: 0.18, delay: 0.30 });
  }

  root.fdSfx = {
    init, setMuted, isMuted,
    drop, merge, chain, tick, tickUrgent,
    timeUp, victory, countdown, go, join, score, tap, rainbow, rowMatch,
  };
})(window);
