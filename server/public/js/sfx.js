'use strict';

/**
 * Shared SFX module — Web Audio API synthesized sounds, no external files.
 * All functions are globally available after loading this script.
 * Every function is wrapped in try-catch so audio failures never break gameplay.
 *
 * Usage: include <script src="/js/sfx.js"></script> then call e.g. sfx.correct()
 */
const sfx = (() => {
  let _ctx = null;
  function ctx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Resume if suspended (browser autoplay policy)
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function tone(freq, type, startTime, duration, vol, c) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }

  // Short click/tap — tiny beep
  function tap() {
    try {
      const c = ctx();
      tone(880, 'sine', c.currentTime, 0.06, 0.15, c);
    } catch (e) {}
  }

  // Correct answer — ascending bright arpeggio
  function correct() {
    try {
      const c = ctx();
      const t = c.currentTime;
      [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 'triangle', t + i * 0.08, 0.25, 0.3, c));
    } catch (e) {}
  }

  // Wrong answer — descending buzzer
  function wrong() {
    try {
      const c = ctx();
      const t = c.currentTime;
      tone(300, 'sawtooth', t, 0.08, 0.25, c);
      tone(220, 'sawtooth', t + 0.1, 0.12, 0.25, c);
    } catch (e) {}
  }

  // Round over — two-tone chime
  function roundOver() {
    try {
      const c = ctx();
      const t = c.currentTime;
      tone(783.99, 'triangle', t, 0.3, 0.3, c);
      tone(659.25, 'triangle', t + 0.25, 0.4, 0.3, c);
    } catch (e) {}
  }

  // Game over / victory — full fanfare
  function victory() {
    try {
      const c = ctx();
      const t = c.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach((f, i) =>
        tone(f, 'triangle', t + i * 0.18, 0.5, 0.4, c)
      );
      // Chord bloom
      setTimeout(() => {
        try {
          const c2 = ctx();
          [261.63, 329.63, 392.00, 523.25].forEach(f =>
            tone(f, 'sine', c2.currentTime, 1.2, 0.2, c2)
          );
        } catch (e) {}
      }, 800);
    } catch (e) {}
  }

  // Countdown tick — single short click (normal pace)
  function tick() {
    try {
      const c = ctx();
      tone(440, 'square', c.currentTime, 0.05, 0.12, c);
    } catch (e) {}
  }

  // Countdown tick — urgent (last 3 seconds)
  function tickUrgent() {
    try {
      const c = ctx();
      tone(880, 'square', c.currentTime, 0.07, 0.2, c);
    } catch (e) {}
  }

  // Sequence flash — each colour tile lights up on TV
  function flash() {
    try {
      const c = ctx();
      tone(660, 'sine', c.currentTime, 0.12, 0.18, c);
    } catch (e) {}
  }

  // Sequence complete (player tapped whole sequence right)
  function sequenceDone() {
    try {
      const c = ctx();
      const t = c.currentTime;
      [659.25, 783.99, 1046.50].forEach((f, i) =>
        tone(f, 'sine', t + i * 0.1, 0.3, 0.35, c)
      );
    } catch (e) {}
  }

  // Number tap (number sort game) — rising pitch per correct tap
  function numberTap(position) {
    try {
      const c = ctx();
      const base = 400 + (position || 0) * 80;
      tone(base, 'sine', c.currentTime, 0.1, 0.2, c);
    } catch (e) {}
  }

  // Sort reset (wrong order) — low thud
  function sortReset() {
    try {
      const c = ctx();
      const t = c.currentTime;
      tone(180, 'sawtooth', t, 0.15, 0.3, c);
      tone(140, 'sawtooth', t + 0.12, 0.18, 0.25, c);
    } catch (e) {}
  }

  // Join/Welcome — gentle chime when player joins lobby
  function join() {
    try {
      const c = ctx();
      const t = c.currentTime;
      tone(523.25, 'sine', t, 0.15, 0.2, c);
      tone(659.25, 'sine', t + 0.12, 0.2, 0.2, c);
    } catch (e) {}
  }

  // Game start — energetic burst
  function gameStart() {
    try {
      const c = ctx();
      const t = c.currentTime;
      [392.00, 523.25, 659.25, 783.99].forEach((f, i) =>
        tone(f, 'square', t + i * 0.07, 0.15, 0.25, c)
      );
    } catch (e) {}
  }

  // Orb select — bubbly pop, pitch rises with chain length
  function orbSelect(chainLen) {
    try {
      const c = ctx();
      const base = 350 + (chainLen || 0) * 60;
      tone(base, 'sine', c.currentTime, 0.08, 0.18, c);
      tone(base * 1.5, 'sine', c.currentTime + 0.03, 0.06, 0.1, c);
    } catch (e) {}
  }

  // Orb clear — satisfying cascade pop (higher pitch for longer chains)
  function orbClear(chainLen) {
    try {
      const c = ctx();
      const t = c.currentTime;
      const n = Math.min(chainLen || 3, 8);
      for (var i = 0; i < n; i++) {
        var freq = 400 + i * 80;
        tone(freq, 'sine', t + i * 0.04, 0.12, 0.2, c);
      }
      // Sparkle finish
      tone(1200, 'sine', t + n * 0.04, 0.2, 0.12, c);
      tone(1400, 'sine', t + n * 0.04 + 0.06, 0.15, 0.08, c);
    } catch (e) {}
  }

  // Orb drop — soft thud when balls land
  function orbDrop() {
    try {
      const c = ctx();
      tone(180, 'sine', c.currentTime, 0.1, 0.1, c);
      tone(120, 'sine', c.currentTime + 0.04, 0.08, 0.08, c);
    } catch (e) {}
  }

  // Chain too short — gentle reject
  function chainReject() {
    try {
      const c = ctx();
      tone(280, 'triangle', c.currentTime, 0.1, 0.12, c);
      tone(220, 'triangle', c.currentTime + 0.08, 0.1, 0.1, c);
    } catch (e) {}
  }

  // Moves depleted — soft wind-down
  function movesDone() {
    try {
      const c = ctx();
      const t = c.currentTime;
      tone(523.25, 'sine', t, 0.3, 0.2, c);
      tone(392.00, 'sine', t + 0.2, 0.3, 0.2, c);
      tone(329.63, 'sine', t + 0.4, 0.5, 0.15, c);
    } catch (e) {}
  }

  // Tick-tock suspense — alternating high/low clicks
  function tickTock(count, interval) {
    try {
      const c = ctx();
      const t = c.currentTime;
      for (let i = 0; i < (count || 4); i++) {
        const freq = i % 2 === 0 ? 1200 : 800;
        const time = t + i * ((interval || 350) / 1000);
        tone(freq, 'sine', time, 0.04, 0.2, c);
        // Subtle woodblock layer
        tone(freq * 0.5, 'triangle', time, 0.03, 0.1, c);
      }
    } catch (e) {}
  }

  // Dramatic reveal — whoosh + bright chime
  function reveal() {
    try {
      const c = ctx();
      const t = c.currentTime;
      // Rising whoosh (noise-like via detuned oscillators)
      tone(200, 'sawtooth', t, 0.15, 0.08, c);
      tone(400, 'sawtooth', t + 0.05, 0.12, 0.1, c);
      tone(800, 'sine', t + 0.1, 0.1, 0.12, c);
      // Bright chime
      tone(1046.5, 'sine', t + 0.15, 0.3, 0.2, c);
      tone(1318.5, 'sine', t + 0.2, 0.25, 0.15, c);
    } catch (e) {}
  }

  // Grid shuffle sound — rapid soft clicks
  function gridShuffle() {
    try {
      const c = ctx();
      const t = c.currentTime;
      for (let i = 0; i < 6; i++) {
        tone(600 + Math.random() * 400, 'sine', t + i * 0.06, 0.03, 0.08, c);
      }
    } catch (e) {}
  }

  return { tap, correct, wrong, roundOver, victory, tick, tickUrgent, flash, sequenceDone, numberTap, sortReset, join, gameStart, orbSelect, orbClear, orbDrop, chainReject, movesDone, tickTock, reveal, gridShuffle };
})();
