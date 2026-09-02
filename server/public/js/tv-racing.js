'use strict';

// ── Catmull-Rom spline (same as server) ─────────────────────────────────
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

// ── Track data (must match server engine) ───────────────────────────────
// 14-point circuit: long straight, tight hairpin, chicane, fast sweeper
const TRACK_CONTROL_POINTS = [
  { x: 200, y: 180 },  { x: 520, y: 160 },  { x: 820, y: 140 },
  { x: 1000, y: 220 }, { x: 1040, y: 380 }, { x: 940, y: 500 },
  { x: 780, y: 540 },  { x: 640, y: 480 },  { x: 500, y: 540 },
  { x: 340, y: 600 },  { x: 160, y: 560 },  { x: 80, y: 440 },
  { x: 60, y: 310 },   { x: 110, y: 210 },
];
const POINTS_PER_SEG = 20;
const TRACK_POINTS = generateSmoothTrack(TRACK_CONTROL_POINTS, POINTS_PER_SEG);
const TRACK_N = TRACK_POINTS.length;
const TRACK_HALF_WIDTH = 50;

const PLAYER_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
];

// ── Pre-rendered RC car sprites (high-res top-down F1 style) ────────────
const CAR_SPRITE_W = 160;
const CAR_SPRITE_H = 80;
const carSprites = [];

function hexToRgb(hex) {
  return { r: parseInt(hex.slice(1,3),16), g: parseInt(hex.slice(3,5),16), b: parseInt(hex.slice(5,7),16) };
}
function lighten(hex, pct) {
  const {r,g,b} = hexToRgb(hex); const f = pct/100;
  return `rgb(${Math.min(255,r+(255-r)*f)|0},${Math.min(255,g+(255-g)*f)|0},${Math.min(255,b+(255-b)*f)|0})`;
}
function darken(hex, pct) {
  const {r,g,b} = hexToRgb(hex); const f = 1 - pct/100;
  return `rgb(${r*f|0},${g*f|0},${b*f|0})`;
}
function drawRR(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x+r,y); g.lineTo(x+w-r,y); g.quadraticCurveTo(x+w,y,x+w,y+r);
  g.lineTo(x+w,y+h-r); g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  g.lineTo(x+r,y+h); g.quadraticCurveTo(x,y+h,x,y+h-r);
  g.lineTo(x,y+r); g.quadraticCurveTo(x,y,x+r,y); g.closePath();
}

function createCarSprite(bodyColor) {
  const W = CAR_SPRITE_W, H = CAR_SPRITE_H;
  const cx = W / 2, cy = H / 2;
  const oc = document.createElement('canvas');
  oc.width = W; oc.height = H;
  const g = oc.getContext('2d');

  const dark = darken(bodyColor, 35);
  const lite = lighten(bodyColor, 20);
  const vdark = darken(bodyColor, 55);

  // Rear wing
  g.fillStyle = '#1a1a1a';
  drawRR(g, 6, cy - 30, 8, 60, 2); g.fill();
  g.fillStyle = '#333';
  drawRR(g, 7, cy - 28, 6, 56, 1); g.fill();
  g.fillStyle = bodyColor;
  drawRR(g, 4, cy - 32, 12, 6, 2); g.fill();
  drawRR(g, 4, cy + 26, 12, 6, 2); g.fill();

  // Wheels
  const wheels = [
    { x: 24, y: 2, w: 22, h: 14 },
    { x: 24, y: H - 16, w: 22, h: 14 },
    { x: W - 42, y: 6, w: 20, h: 12 },
    { x: W - 42, y: H - 18, w: 20, h: 12 },
  ];
  wheels.forEach(wh => {
    g.fillStyle = '#111';
    drawRR(g, wh.x, wh.y, wh.w, wh.h, 3); g.fill();
    g.strokeStyle = '#2a2a2a'; g.lineWidth = 1;
    for (let t = 3; t < wh.w - 3; t += 4) {
      g.beginPath(); g.moveTo(wh.x + t, wh.y + 2); g.lineTo(wh.x + t, wh.y + wh.h - 2); g.stroke();
    }
    g.fillStyle = '#444';
    drawRR(g, wh.x + 4, wh.y + 3, wh.w - 8, wh.h - 6, 2); g.fill();
    g.fillStyle = '#555';
    drawRR(g, wh.x + 6, wh.y + 4, wh.w - 12, wh.h - 8, 1); g.fill();
  });

  // Body
  g.beginPath();
  g.moveTo(18, cy - 22); g.lineTo(60, cy - 26); g.lineTo(100, cy - 20);
  g.lineTo(W - 18, cy - 10); g.quadraticCurveTo(W - 6, cy, W - 6, cy);
  g.quadraticCurveTo(W - 6, cy, W - 18, cy + 10);
  g.lineTo(100, cy + 20); g.lineTo(60, cy + 26); g.lineTo(18, cy + 22);
  g.closePath();
  g.fillStyle = bodyColor; g.fill();
  g.strokeStyle = vdark; g.lineWidth = 1.5; g.stroke();

  // Body gradient
  const bodyGrad = g.createLinearGradient(0, cy - 26, 0, cy + 26);
  bodyGrad.addColorStop(0, 'rgba(255,255,255,0.3)');
  bodyGrad.addColorStop(0.3, 'rgba(255,255,255,0.08)');
  bodyGrad.addColorStop(0.7, 'rgba(0,0,0,0.05)');
  bodyGrad.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = bodyGrad;
  g.beginPath();
  g.moveTo(18, cy - 22); g.lineTo(60, cy - 26); g.lineTo(100, cy - 20);
  g.lineTo(W - 18, cy - 10); g.quadraticCurveTo(W - 6, cy, W - 6, cy);
  g.quadraticCurveTo(W - 6, cy, W - 18, cy + 10);
  g.lineTo(100, cy + 20); g.lineTo(60, cy + 26); g.lineTo(18, cy + 22);
  g.closePath(); g.fill();

  // Side pods
  g.fillStyle = dark;
  drawRR(g, 50, cy - 24, 36, 10, 4); g.fill();
  drawRR(g, 50, cy + 14, 36, 10, 4); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let v = 0; v < 3; v++) {
    g.fillRect(56 + v * 10, cy - 22, 2, 6);
    g.fillRect(56 + v * 10, cy + 16, 2, 6);
  }

  // Engine cover
  const coverGrad = g.createLinearGradient(0, cy - 8, 0, cy + 8);
  coverGrad.addColorStop(0, lite); coverGrad.addColorStop(0.5, bodyColor); coverGrad.addColorStop(1, dark);
  g.fillStyle = coverGrad;
  drawRR(g, 22, cy - 8, 60, 16, 6); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 0.8;
  drawRR(g, 22, cy - 8, 60, 16, 6); g.stroke();

  // Air intake
  g.fillStyle = '#111';
  drawRR(g, 82, cy - 5, 8, 10, 3); g.fill();

  // Cockpit
  const cockpitGrad = g.createRadialGradient(100, cy, 2, 100, cy, 14);
  cockpitGrad.addColorStop(0, 'rgba(120,200,255,0.7)');
  cockpitGrad.addColorStop(0.6, 'rgba(40,100,180,0.5)');
  cockpitGrad.addColorStop(1, 'rgba(20,50,100,0.3)');
  g.fillStyle = cockpitGrad;
  g.beginPath(); g.ellipse(102, cy, 14, 9, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(102, cy, 14, 9, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath(); g.ellipse(99, cy - 3, 6, 3, -0.3, 0, Math.PI * 2); g.fill();

  // Nose
  g.fillStyle = lite;
  g.beginPath(); g.moveTo(W - 20, cy - 8); g.lineTo(W - 8, cy); g.lineTo(W - 20, cy + 8); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.2)'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(W - 20, cy - 8); g.lineTo(W - 8, cy); g.lineTo(W - 20, cy + 8); g.closePath(); g.stroke();

  // Front wing
  g.fillStyle = bodyColor;
  drawRR(g, W - 28, cy - 18, 16, 4, 2); g.fill();
  drawRR(g, W - 28, cy + 14, 16, 4, 2); g.fill();
  g.strokeStyle = vdark; g.lineWidth = 0.8;
  drawRR(g, W - 28, cy - 18, 16, 4, 2); g.stroke();
  drawRR(g, W - 28, cy + 14, 16, 4, 2); g.stroke();

  // Stripe
  g.save(); g.globalAlpha = 0.3; g.fillStyle = '#fff';
  g.fillRect(20, cy - 1.5, W - 40, 3); g.restore();

  // Headlights
  g.save(); g.shadowColor = '#ffeb3b'; g.shadowBlur = 8; g.fillStyle = '#fffde7';
  g.beginPath(); g.ellipse(W - 20, cy - 12, 3, 2.5, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(W - 20, cy + 12, 3, 2.5, 0, 0, Math.PI * 2); g.fill(); g.restore();

  // Taillights
  g.save(); g.shadowColor = '#ff1744'; g.shadowBlur = 6; g.fillStyle = '#ff1744';
  drawRR(g, 14, cy - 20, 5, 6, 2); g.fill();
  drawRR(g, 14, cy + 14, 5, 6, 2); g.fill(); g.restore();

  // Exhaust
  g.fillStyle = '#555';
  g.beginPath(); g.arc(16, cy - 8, 3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(16, cy + 8, 3, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#333';
  g.beginPath(); g.arc(16, cy - 8, 1.8, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(16, cy + 8, 1.8, 0, Math.PI * 2); g.fill();

  // Number circle
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(42, cy, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = bodyColor;
  g.beginPath(); g.arc(42, cy, 5.5, 0, Math.PI * 2); g.fill();

  return oc;
}

PLAYER_COLORS.forEach(c => carSprites.push(createCarSprite(c)));

// ── Precompute track normals ────────────────────────────────────────────
const trackNormals = [];
for (let i = 0; i < TRACK_POINTS.length; i++) {
  const n = TRACK_POINTS.length;
  const prev = TRACK_POINTS[(i - 1 + n) % n];
  const next = TRACK_POINTS[(i + 1) % n];
  const dx = next.x - prev.x, dy = next.y - prev.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  trackNormals.push({ nx: -dy / len, ny: dx / len });
}

// ── Generate starting grid positions (client-side, matches server) ──────
function trackAngleAt(idx) {
  const a = TRACK_POINTS[idx];
  const b = TRACK_POINTS[(idx + 1) % TRACK_N];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function generateStartingGrid(playerCount) {
  const grid = [];
  for (let i = 0; i < playerCount; i++) {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const behindIdx = ((TRACK_N - row * 3) % TRACK_N + TRACK_N) % TRACK_N;
    const bp = TRACK_POINTS[behindIdx];
    const ba = trackAngleAt(behindIdx);
    const lateral = (col === 0 ? -1 : 1) * 15;
    const nx = -Math.sin(ba);
    const ny = Math.cos(ba);
    grid.push({
      x: bp.x + nx * lateral,
      y: bp.y + ny * lateral,
      angle: ba,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
    });
  }
  return grid;
}

// ── DOM refs ────────────────────────────────────────────────────────────
const lobbyPhase       = document.getElementById('lobbyPhase');
const racingPhase      = document.getElementById('racingPhase');
const gameOverPhase    = document.getElementById('gameOverPhase');
const countdownOverlay = document.getElementById('countdownOverlay');
const countdownNum     = document.getElementById('countdownNumber');
const qrContainer      = document.getElementById('qrcode');
const joinUrlEl        = document.getElementById('joinUrl');
const playerListEl     = document.getElementById('lobbyPlayerList');
const startBtn         = document.getElementById('startBtn');
const canvas           = document.getElementById('raceCanvas');
const ctx              = canvas.getContext('2d');
const leaderboardEl    = document.getElementById('leaderboard');
const lapInfoEl        = document.getElementById('lapInfo');
const winnerTitleEl    = document.getElementById('winnerTitle');
const winnerNameEl     = document.getElementById('winnerName');
const resultsTableEl   = document.getElementById('resultsTable');
const playAgainBtn     = document.getElementById('playAgainBtn');

// ── State ───────────────────────────────────────────────────────────────
let gameState = null;
let prevState = null;
let lerpT = 0;
const TICK_INTERVAL = 50;
let animFrame = null;
let gridState = null; // starting grid cars for countdown
let countdownActive = false;
let lobbyPlayerCount = 0;

// ── Socket ──────────────────────────────────────────────────────────────
const socket = io();
const params = new URLSearchParams(window.location.search);
const roomIdParam = params.get('room');

// ── URL params (host handoff from /tv-lobby) ────────────────────────────
const _hostHandoff = params.get('host') === '1';

if (_hostHandoff && lobbyPhase) lobbyPhase.classList.remove('active');

socket.on('connect', () => {
  socket.emit('join_game', { roomId: roomIdParam || null, playerName: 'TV Display', gameType: 'tv-racing', reconnect: !!roomIdParam });
});

let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  if (_hostHandoff && !_hostStartFired && !racingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_racing_start'), 400);
    return;
  }

  const playUrl = `${location.origin}/tv-join?game=tv-racing&room=${roomId}`;
  joinUrlEl.textContent = playUrl;
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, { text: playUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H });
});

socket.on('room_update', ({ players }) => {
  const phonePlayers = players.filter(p => p.color !== 'tv-host');
  lobbyPlayerCount = phonePlayers.length;
  renderPlayerList(phonePlayers);
  startBtn.disabled = phonePlayers.length < 1;
});

socket.on('game_started', (state) => {
  // Show the racing phase immediately with cars on grid + countdown overlay
  applyState(state);
  showPhase('racing');
  resizeCanvas();
  startRenderLoop();
  showCountdown(() => {
    // Countdown done — hide overlay, game is already ticking from server
    countdownActive = false;
    countdownOverlay.classList.add('hidden');
  });
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-racing') return;
  applyState(state);
});

socket.on('game_over', ({ winner, reason }) => {
  cancelAnimationFrame(animFrame);
  showGameOver(winner, reason);
});

socket.on('play_again', () => {
  gameState = null; prevState = null; gridState = null;
  countdownActive = false;
  cancelAnimationFrame(animFrame);
  showPhase('lobby');
});

startBtn.addEventListener('click', () => {
  socket.emit('tv_racing_start');
  startBtn.disabled = true;
  setTimeout(() => { startBtn.disabled = false; }, 3000);
});

playAgainBtn.addEventListener('click', () => { socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-racing' + (roomId ? '&room=' + roomId : '')); }, 60); });

// ── Phases ──────────────────────────────────────────────────────────────
function showPhase(name) {
  [lobbyPhase, racingPhase, gameOverPhase].forEach(el => el.classList.remove('active'));
  ({ lobby: lobbyPhase, racing: racingPhase, gameover: gameOverPhase })[name]?.classList.add('active');
}

function showCountdown(callback) {
  countdownActive = true;
  countdownOverlay.classList.remove('hidden');
  let count = 3;
  countdownNum.textContent = count;
  countdownNum.className = 'countdown-number';
  countdownNum.style.animation = 'none'; void countdownNum.offsetWidth; countdownNum.style.animation = '';
  const iv = setInterval(() => {
    count--;
    if (count > 0) {
      countdownNum.textContent = count;
      countdownNum.className = 'countdown-number';
      countdownNum.style.animation = 'none'; void countdownNum.offsetWidth; countdownNum.style.animation = '';
    } else if (count === 0) {
      countdownNum.textContent = 'GO!';
      countdownNum.className = 'countdown-number go';
      countdownNum.style.animation = 'none'; void countdownNum.offsetWidth; countdownNum.style.animation = '';
    } else {
      clearInterval(iv);
      callback();
    }
  }, 800);
}

function renderPlayerList(players) {
  if (players.length === 0) {
    playerListEl.innerHTML = '<div class="tv-player-empty">Waiting for racers...</div>';
    return;
  }
  playerListEl.innerHTML = '';
  players.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'tv-player-item';
    const dot = document.createElement('span');
    dot.className = 'tv-player-dot';
    dot.style.background = PLAYER_COLORS[i % PLAYER_COLORS.length];
    const name = document.createElement('span');
    name.textContent = p.name;
    item.appendChild(dot);
    item.appendChild(name);
    playerListEl.appendChild(item);
  });
}

// ── Canvas resize ───────────────────────────────────────────────────────
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas);

function applyState(state) {
  prevState = gameState; gameState = state; lerpT = 0;
  renderLeaderboard(state); renderLapInfo(state);
}

// ── Render loop ─────────────────────────────────────────────────────────
let lastFrameTime = 0;
function startRenderLoop() {
  lastFrameTime = performance.now();
  function frame(now) {
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    lerpT = Math.min(1, lerpT + dt / (TICK_INTERVAL / 1000));
    renderFrame();
    animFrame = requestAnimationFrame(frame);
  }
  animFrame = requestAnimationFrame(frame);
}

function renderFrame() {
  if (!gameState) return;
  const w = canvas.width, h = canvas.height;

  const scaleX = w / 1100, scaleY = h / 700;
  const scale = Math.min(scaleX, scaleY) * 0.88;
  const offX = (w - 1100 * scale) / 2, offY = (h - 700 * scale) / 2;

  // Rich grass background with subtle gradient
  const grassGrad = ctx.createLinearGradient(0, 0, 0, h);
  grassGrad.addColorStop(0, '#1a5c1a');
  grassGrad.addColorStop(0.5, '#165016');
  grassGrad.addColorStop(1, '#124512');
  ctx.fillStyle = grassGrad;
  ctx.fillRect(0, 0, w, h);

  // Grass texture (subtle noise stripes)
  ctx.save();
  ctx.globalAlpha = 0.06;
  for (let y = 0; y < h; y += 6) {
    ctx.fillStyle = y % 12 === 0 ? '#0a3a0a' : '#2a6a2a';
    ctx.fillRect(0, y, w, 3);
  }
  ctx.restore();

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  drawTrack();
  drawCars();

  ctx.restore();
}

// ── Draw professional track ─────────────────────────────────────────────
function drawTrack() {
  const pts = TRACK_POINTS;
  const n = pts.length;
  const HW = TRACK_HALF_WIDTH;

  // ── 1. Run-off area (wider sand/gravel strip) ──
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.lineWidth = HW * 2 + 28;
  ctx.strokeStyle = '#8a7a5a';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke();

  // Sand texture on run-off
  ctx.save();
  ctx.lineWidth = HW * 2 + 24;
  ctx.strokeStyle = '#7a6a4a';
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── 2. Track surface (dark asphalt) ──
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.lineWidth = HW * 2;
  ctx.strokeStyle = '#383838';
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke();

  // Subtle asphalt texture
  ctx.save();
  ctx.lineWidth = HW * 2 - 4;
  ctx.strokeStyle = '#3c3c3c';
  ctx.setLineDash([1, 3]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ── 3. Kerbs (red-white alternating on both edges) ──
  drawKerbs(1);
  drawKerbs(-1);

  // ── 4. White edge lines ──
  drawTrackEdge(1);
  drawTrackEdge(-1);

  // ── 5. Center line (dashed white) ──
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.setLineDash([14, 14]);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── 6. Start/finish line (checkered flag pattern) ──
  drawStartFinish();

  // ── 7. Corner markers (small dots at apex points) ──
  drawCornerMarkers();
}

function drawKerbs(side) {
  const pts = TRACK_POINTS;
  const n = pts.length;
  const kerbWidth = 6;
  const kerbOffset = TRACK_HALF_WIDTH - 1;

  for (let i = 0; i < n; i++) {
    const nm = trackNormals[i];
    const ex = pts[i].x + nm.nx * kerbOffset * side;
    const ey = pts[i].y + nm.ny * kerbOffset * side;

    // Alternate red/white every few points
    const segColor = Math.floor(i / 3) % 2 === 0 ? '#cc2222' : '#ffffff';
    ctx.fillStyle = segColor;
    ctx.beginPath();
    ctx.arc(ex, ey, kerbWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawTrackEdge(side) {
  const pts = TRACK_POINTS;
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const nm = trackNormals[i];
    const ex = pts[i].x + nm.nx * TRACK_HALF_WIDTH * side;
    const ey = pts[i].y + nm.ny * TRACK_HALF_WIDTH * side;
    if (i === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey);
  }
  ctx.closePath();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
}

function drawStartFinish() {
  const pts = TRACK_POINTS;
  const sp = pts[0];
  const sn = trackNormals[0];
  const hw = TRACK_HALF_WIDTH;
  // Draw a wider checkered pattern
  const rows = 2;
  const cols = 10;
  const ta = Math.atan2(sn.ny, sn.nx); // track-perpendicular angle
  const along = Math.atan2(
    pts[1].y - pts[0].y,
    pts[1].x - pts[0].x
  ); // track-along angle

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isWhite = (r + c) % 2 === 0;
      const crossT = (c / cols) * 2 - 1; // -1 to 1
      const alongT = (r - 0.5) * 5; // offset along track
      const cx = sp.x + sn.nx * hw * crossT + Math.cos(along) * alongT;
      const cy = sp.y + sn.ny * hw * crossT + Math.sin(along) * alongT;
      ctx.fillStyle = isWhite ? '#fff' : '#111';
      ctx.fillRect(cx - 4, cy - 4, 8, 8);
    }
  }
}

function drawCornerMarkers() {
  // Place small white dots at key corner apexes for visual reference
  const apexIndices = [3, 4, 6, 7, 10, 13]; // control point indices
  const ptsPerSeg = POINTS_PER_SEG;
  apexIndices.forEach(cpIdx => {
    const idx = (cpIdx * ptsPerSeg) % TRACK_POINTS.length;
    const pt = TRACK_POINTS[idx];
    if (!pt) return;
    // Small marker outside the track
    const nm = trackNormals[idx];
    const markerDist = TRACK_HALF_WIDTH + 18;
    [-1, 1].forEach(side => {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(
        pt.x + nm.nx * markerDist * side,
        pt.y + nm.ny * markerDist * side,
        3, 0, Math.PI * 2
      );
      ctx.fill();
    });
  });
}

// ── Draw cars ───────────────────────────────────────────────────────────
const CAR_DRAW_W = 44, CAR_DRAW_H = 24;

function drawCars() {
  if (!gameState || !gameState.cars) return;
  const cars = gameState.cars;
  const prevCars = prevState?.cars;

  cars.forEach((car, i) => {
    let x = car.x, y = car.y, angle = car.angle;

    if (prevCars && prevCars[i] && lerpT < 1) {
      const pc = prevCars[i];
      x = pc.x + (car.x - pc.x) * lerpT;
      y = pc.y + (car.y - pc.y) * lerpT;
      let da = car.angle - pc.angle;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      angle = pc.angle + da * lerpT;
    }

    const sprite = carSprites[i % carSprites.length];

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 2, CAR_DRAW_W / 2 + 1, CAR_DRAW_H / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.drawImage(sprite, -CAR_DRAW_W / 2, -CAR_DRAW_H / 2, CAR_DRAW_W, CAR_DRAW_H);
    ctx.restore();

    // Name label
    const playerInfo = gameState.players?.[i];
    if (playerInfo) {
      ctx.save();
      ctx.font = 'bold 14px Lexend, sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.fillStyle = '#fff';
      ctx.strokeText(playerInfo.name, x, y - 18);
      ctx.fillText(playerInfo.name, x, y - 18);
      ctx.restore();
    }
  });
}

// ── Leaderboard ─────────────────────────────────────────────────────────
function renderLeaderboard(state) {
  if (!state || !state.positions) return;
  leaderboardEl.innerHTML = '';
  state.positions.forEach(p => {
    const entry = document.createElement('div'); entry.className = 'lb-entry';
    const pos = document.createElement('span'); pos.className = 'lb-pos';
    pos.textContent = p.finished ? `P${p.rank}` : `#${p.rank}`;
    const dot = document.createElement('span'); dot.className = 'lb-dot';
    dot.style.background = PLAYER_COLORS[p.seat % PLAYER_COLORS.length];
    const name = document.createElement('span'); name.className = 'lb-name';
    name.textContent = state.players?.[p.seat]?.name || `P${p.seat + 1}`;
    const lap = document.createElement('span'); lap.className = 'lb-lap';
    lap.textContent = p.finished ? 'Finished' : `Lap ${p.lap + 1}`;
    entry.appendChild(pos); entry.appendChild(dot); entry.appendChild(name); entry.appendChild(lap);
    leaderboardEl.appendChild(entry);
  });
}

function renderLapInfo(state) {
  if (!state) return;
  lapInfoEl.textContent = `${state.totalLaps} Laps`;
}

// ── Game over ───────────────────────────────────────────────────────────
function showGameOver(winnerName) {
  showPhase('gameover');
  winnerTitleEl.textContent = 'Race Complete!';
  winnerNameEl.textContent = winnerName ? `${winnerName} Wins!` : '';
  resultsTableEl.innerHTML = '';
  if (gameState?.positions) {
    const medals = ['', '🥇', '🥈', '🥉'];
    gameState.positions.forEach(p => {
      const row = document.createElement('div'); row.className = 'race-result-row';
      const pos = document.createElement('span'); pos.className = 'race-result-pos';
      pos.textContent = p.rank <= 3 ? medals[p.rank] : `${p.rank}th`;
      const dot = document.createElement('span'); dot.className = 'race-result-dot';
      dot.style.background = PLAYER_COLORS[p.seat % PLAYER_COLORS.length];
      const name = document.createElement('span'); name.className = 'race-result-name';
      name.textContent = gameState.players?.[p.seat]?.name || `P${p.seat + 1}`;
      row.appendChild(pos); row.appendChild(dot); row.appendChild(name);
      resultsTableEl.appendChild(row);
    });
  }
  launchConfetti();
}

function launchConfetti() {
  const colors = ['#3D72E8','#2DAF7B','#E07820','#7B5EA7','#1A9FAF','#E84B3D'];
  for (let i = 0; i < 80; i++) {
    const c = document.createElement('div');
    c.className = 'confetti-piece';
    c.style.cssText = `left:${Math.random()*100}vw;width:${6+Math.random()*8}px;height:${6+Math.random()*8}px;background:${colors[Math.random()*6|0]};border-radius:${Math.random()>.5?'50%':'2px'};animation-delay:${Math.random()*1.5}s;`;
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 5000);
  }
}
