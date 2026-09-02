'use strict';

/**
 * RC Racing engine — server-authoritative, tick-based, free-roam 2D physics.
 *
 * Cars drive forward based on throttle input. Players steer LEFT/RIGHT to
 * rotate the car's heading, and control speed with THROTTLE / BRAKE / COAST.
 *
 * Track is a smooth Catmull-Rom spline oval with soft/hard boundaries.
 * Lap detection via progress wrap-around with halfway gate.
 */

// ── Catmull-Rom spline ──────────────────────────────────────────────────
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return {
    x: 0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
    y: 0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3),
  };
}

function generateSmoothTrack(cp, ptsPerSeg) {
  const n = cp.length;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const p0 = cp[(i - 1 + n) % n];
    const p1 = cp[i];
    const p2 = cp[(i + 1) % n];
    const p3 = cp[(i + 2) % n];
    for (let j = 0; j < ptsPerSeg; j++) {
      pts.push(catmullRom(p0, p1, p2, p3, j / ptsPerSeg));
    }
  }
  return pts;
}

// ── Track definition ────────────────────────────────────────────────────
// 14-point circuit: long straight, tight hairpin, chicane, fast sweeper
const TRACK_CONTROL_POINTS = [
  { x: 200, y: 180 },   // 0  start/finish straight begin
  { x: 520, y: 160 },   // 1  mid-straight
  { x: 820, y: 140 },   // 2  end of straight, approach turn 1
  { x: 1000, y: 220 },  // 3  turn 1 (fast right)
  { x: 1040, y: 380 },  // 4  turn 2 apex
  { x: 940, y: 500 },   // 5  exit turn 2, into chicane
  { x: 780, y: 540 },   // 6  chicane left
  { x: 640, y: 480 },   // 7  chicane right
  { x: 500, y: 540 },   // 8  chicane exit
  { x: 340, y: 600 },   // 9  approach hairpin
  { x: 160, y: 560 },   // 10 hairpin apex
  { x: 80,  y: 440 },   // 11 hairpin exit
  { x: 60,  y: 310 },   // 12 back straight
  { x: 110, y: 210 },   // 13 final corner into start/finish
];

const POINTS_PER_SEG = 20;
const TRACK_POINTS = generateSmoothTrack(TRACK_CONTROL_POINTS, POINTS_PER_SEG);
const TRACK_N = TRACK_POINTS.length; // 160

// Precompute track total length
let _trackTotalLen = 0;
for (let i = 0; i < TRACK_N; i++) {
  const a = TRACK_POINTS[i];
  const b = TRACK_POINTS[(i + 1) % TRACK_N];
  _trackTotalLen += Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}
const TRACK_TOTAL_LENGTH = _trackTotalLen;

// ── Game config ─────────────────────────────────────────────────────────
const TOTAL_LAPS       = 3;
const TRACK_HALF_WIDTH = 50;
const MAX_SPEED        = 210;     // pixels per second at full throttle
const IDLE_SPEED       = 0;      // no movement without throttle
const ACCEL_RATE       = 280;    // speed gain per second when throttle
const BRAKE_RATE       = 400;    // speed loss per second when braking
const COAST_DRAG       = 100;    // speed loss per second when coasting
const TURN_SPEED       = 2.8;    // radians per second at full lock
const TURN_RESPONSE    = 10;     // how fast turn rate reaches target
const TURN_DAMPING     = 8;      // how fast turn rate decays when released
const OFF_TRACK_SLOW   = 0.45;   // speed multiplier when off track
const WALL_MAX         = TRACK_HALF_WIDTH * 1.4; // hard wall distance
const TURN_SPEED_COST  = 0.12;   // speed penalty when turning hard

const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
];

// ── Track helpers ────────────────────────────────────────────────────────
function trackAngleAt(idx) {
  const a = TRACK_POINTS[idx];
  const b = TRACK_POINTS[(idx + 1) % TRACK_N];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function nearestTrackIdx(px, py, hint) {
  const searchRange = 25;
  let bestDist = Infinity, bestIdx = 0;

  if (hint >= 0 && hint < TRACK_N) {
    for (let d = -searchRange; d <= searchRange; d++) {
      const idx = ((hint + d) % TRACK_N + TRACK_N) % TRACK_N;
      const dx = TRACK_POINTS[idx].x - px;
      const dy = TRACK_POINTS[idx].y - py;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
    }
  } else {
    for (let i = 0; i < TRACK_N; i++) {
      const dx = TRACK_POINTS[i].x - px;
      const dy = TRACK_POINTS[i].y - py;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
  }
  return bestIdx;
}

function distToTrackPt(px, py, idx) {
  const tp = TRACK_POINTS[idx];
  return Math.sqrt((px - tp.x) ** 2 + (py - tp.y) ** 2);
}

function progressFromIdx(idx) {
  return idx / TRACK_N;
}

// ── Game factory ────────────────────────────────────────────────────────
function createGame(playerCount = 2) {
  if (playerCount < 1 || playerCount > 8) {
    throw new Error('RC Racing requires 1–8 players');
  }

  // Starting grid: 2-column grid behind start/finish line
  const cars = [];
  for (let i = 0; i < playerCount; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const behindIdx = ((TRACK_N - row * 3) % TRACK_N + TRACK_N) % TRACK_N;
    const bp = TRACK_POINTS[behindIdx];
    const ba = trackAngleAt(behindIdx);
    const lateral = (col === 0 ? -1 : 1) * 15;
    const nx = -Math.sin(ba);
    const ny = Math.cos(ba);

    cars.push({
      x: bp.x + nx * lateral,
      y: bp.y + ny * lateral,
      heading: ba,
      speed: 0,              // current speed (px/s)
      turnRate: 0,
      steerInput: 'none',
      braking: false,
      nearIdx: behindIdx,
      lap: 0,
      prevProgress: behindIdx / TRACK_N,
      passedHalf: false,
      finished: false,
      finishOrder: -1,
    });
  }

  let _isGameOver = false;
  let _winnerSeat = null;
  let finishCount = 0;
  let raceStarted = false;

  function steer(seat, direction) {
    if (seat < 0 || seat >= playerCount) return;
    if (cars[seat].finished) return;
    if (direction !== 'left' && direction !== 'right' && direction !== 'none') return;
    cars[seat].steerInput = direction;
  }

  function setBrake(seat, braking) {
    if (seat < 0 || seat >= playerCount) return;
    if (cars[seat].finished) return;
    cars[seat].braking = !!braking;
  }

  function tick(dt) {
    if (_isGameOver) return;
    raceStarted = true;

    for (let i = 0; i < playerCount; i++) {
      const car = cars[i];
      if (car.finished) continue;

      // ── Turn physics ───────────────────────────────────────────
      const targetRate = car.steerInput === 'left' ? -TURN_SPEED
                       : car.steerInput === 'right' ? TURN_SPEED
                       : 0;

      const diff = targetRate - car.turnRate;
      car.turnRate += diff * Math.min(1, TURN_RESPONSE * dt);

      if (car.steerInput === 'none') {
        car.turnRate *= Math.max(0, 1 - TURN_DAMPING * dt);
        if (Math.abs(car.turnRate) < 0.02) car.turnRate = 0;
      }

      car.heading += car.turnRate * dt;
      while (car.heading > Math.PI) car.heading -= 2 * Math.PI;
      while (car.heading < -Math.PI) car.heading += 2 * Math.PI;

      // ── Speed physics (auto-throttle + brake) ─────────────────
      if (car.braking) {
        car.speed -= BRAKE_RATE * dt;
      } else {
        // Auto-accelerate toward max speed
        car.speed += ACCEL_RATE * dt;
      }

      // Clamp speed
      const dist = distToTrackPt(car.x, car.y, car.nearIdx);
      const offTrack = dist > TRACK_HALF_WIDTH;
      const maxSpd = MAX_SPEED * (offTrack ? OFF_TRACK_SLOW : 1);
      const turnPenalty = 1 - Math.abs(car.turnRate / TURN_SPEED) * TURN_SPEED_COST;
      const effectiveMax = maxSpd * turnPenalty;

      if (car.speed > effectiveMax) car.speed = effectiveMax;
      if (car.speed < 0) car.speed = 0;

      // ── Forward movement ───────────────────────────────────────
      car.x += Math.cos(car.heading) * car.speed * dt;
      car.y += Math.sin(car.heading) * car.speed * dt;

      // ── Track boundary (hard wall) ─────────────────────────────
      car.nearIdx = nearestTrackIdx(car.x, car.y, car.nearIdx);
      const tp = TRACK_POINTS[car.nearIdx];
      const dxT = car.x - tp.x;
      const dyT = car.y - tp.y;
      const wallDist = Math.sqrt(dxT * dxT + dyT * dyT);

      if (wallDist > WALL_MAX) {
        const scale = WALL_MAX / wallDist;
        car.x = tp.x + dxT * scale;
        car.y = tp.y + dyT * scale;
        car.speed *= 0.5; // hitting wall slows you down
      }

      // ── Lap detection ──────────────────────────────────────────
      const progress = progressFromIdx(car.nearIdx);

      if (progress > 0.35 && progress < 0.65) {
        car.passedHalf = true;
      }

      if (car.passedHalf && car.prevProgress > 0.82 && progress < 0.18) {
        car.lap++;
        car.passedHalf = false;

        if (car.lap >= TOTAL_LAPS) {
          car.finished = true;
          car.finishOrder = finishCount++;
          if (_winnerSeat === null) _winnerSeat = i;
          if (finishCount >= playerCount) _isGameOver = true;
        }
      }

      car.prevProgress = progress;
    }
  }

  function getPositions() {
    const positions = cars.map((car, seat) => ({
      seat,
      lap: car.lap,
      progress: progressFromIdx(car.nearIdx),
      finished: car.finished,
      finishOrder: car.finishOrder,
    }));
    positions.sort((a, b) => {
      if (a.finished && !b.finished) return -1;
      if (!a.finished && b.finished) return 1;
      if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
      if (a.lap !== b.lap) return b.lap - a.lap;
      return b.progress - a.progress;
    });
    return positions;
  }

  function state() {
    const positions = getPositions();
    return {
      gameType: 'tv-racing',
      playerCount,
      totalLaps: TOTAL_LAPS,
      trackHalfWidth: TRACK_HALF_WIDTH,
      cars: cars.map((car, i) => ({
        seat: i,
        x: car.x,
        y: car.y,
        angle: car.heading,
        speed: car.speed,
        lap: car.lap,
        finished: car.finished,
        finishOrder: car.finishOrder,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      })),
      positions: positions.map((p, rank) => ({ ...p, rank: rank + 1 })),
      isGameOver: _isGameOver,
      winnerSeat: _winnerSeat,
      raceStarted,
    };
  }

  function isGameOver() { return _isGameOver; }
  function winner() { return _winnerSeat; }

  return { steer, setBrake, tick, state, isGameOver, winner, getPositions };
}

module.exports = {
  createGame,
  catmullRom,
  generateSmoothTrack,
  TRACK_CONTROL_POINTS,
  TRACK_POINTS,
  TRACK_HALF_WIDTH,
  PLAYER_COLORS,
  TOTAL_LAPS,
  POINTS_PER_SEG,
};
