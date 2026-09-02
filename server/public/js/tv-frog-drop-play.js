'use strict';

// ── URL params + autojoin handoff (from /tv-join) ──────────────────────────
const urlParams = new URLSearchParams(location.search);
const roomIdFromUrl = urlParams.get('room');
const isAutoJoin = urlParams.get('autojoin') === '1';

let _autoJoinHandoff = null;
if (isAutoJoin && roomIdFromUrl) {
  try {
    const raw = sessionStorage.getItem(`caritahub_pending_join_${roomIdFromUrl}`);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && d.name && d.color && Date.now() - (d.ts || 0) < 30 * 60 * 1000) _autoJoinHandoff = d;
    }
  } catch (e) { /* ignore */ }
}

const COLOR_LIST = ['tv-host', 'p1','p2','p3','p4','p5','p6','p7','p8'];

let myRoomId = roomIdFromUrl;
let myColor  = _autoJoinHandoff ? _autoJoinHandoff.color : null;
let myName   = _autoJoinHandoff ? _autoJoinHandoff.name : '';
let mySeat   = myColor ? Math.max(-1, COLOR_LIST.indexOf(myColor) - 1) : -1;

let playerState = null; // { grid, score, nextFrog, previewFrog, ... }
let timeLeft = 90;
let roundDuration = 90;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const joinScreen     = document.getElementById('joinScreen');
const waitingScreen  = document.getElementById('waitingScreen');
const playingScreen  = document.getElementById('playingScreen');
const gameoverScreen = document.getElementById('gameoverScreen');
const nameInput      = document.getElementById('nameInput');
const joinBtn        = document.getElementById('joinBtn');
const waitingPlayers = document.getElementById('waitingPlayers');
const displayNameEl  = document.getElementById('displayName');
const timerDisplay   = document.getElementById('timerDisplay');
const scoreValueEl   = document.getElementById('scoreValue');
const goReason       = document.getElementById('goReason');
const goRankings     = document.getElementById('goRankings');
const boardCanvas    = document.getElementById('phone-board-canvas');
const boardCtx       = boardCanvas.getContext('2d');

const renderer = new FrogRenderer(boardCanvas);

// ── Drag state ──────────────────────────────────────────────────────────────
let dragging = false;
let dragX = 0, dragY = 0;
let hoverCol = -1;
let dragZoneH = 0;
let cellSize = 60;
let boardOffsetY = 0;
let animFrameId = null;

// ── Drop animation state ────────────────────────────────────────────────────
// Exists from the moment the player releases until the frog lands. While
// active, the next-frog UI is hidden and input is locked. The socket emit
// for the drop is deferred until the animation lands so the visual order
// (fall → server confirms → merges) reads naturally.
let dropAnim = null;
const DROP_GRAVITY = 0.55;        // px per frame²
const DROP_BOUNCE_DAMP = 0.32;    // velocity left after bounce
const DROP_MAX_BOUNCES = 2;

// ── Socket ──────────────────────────────────────────────────────────────────
const socket = io({
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

if (_autoJoinHandoff) showScreen(waitingScreen);

function showScreen(s) {
  [joinScreen, waitingScreen, playingScreen, gameoverScreen].forEach(x => x.classList.remove('active'));
  s.classList.add('active');
}

nameInput.addEventListener('input', () => { joinBtn.disabled = nameInput.value.trim().length === 0; });
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !joinBtn.disabled) joinBtn.click(); });

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) return;
  myName = name;
  joinBtn.disabled = true;
  // Initialize WebAudio inside the user gesture so iOS allows playback.
  if (window.fdSfx) { fdSfx.init(); fdSfx.tap(); }
  socket.emit('join_game', { roomId: myRoomId, playerName: name, gameType: 'tv-frog-drop' });
});

socket.on('connect', () => {
  if (_autoJoinHandoff && myRoomId && myName) {
    socket.emit('join_game', {
      roomId: myRoomId, playerName: myName, gameType: 'tv-frog-drop', reconnect: true
    });
  }
});

socket.on('joined', ({ roomId, color }) => {
  myRoomId = roomId;
  myColor = color;
  mySeat = Math.max(-1, COLOR_LIST.indexOf(color) - 1);
  displayNameEl.textContent = myName;
  showScreen(waitingScreen);
  if (window.fdSfx) fdSfx.join();
});

socket.on('room_update', ({ players }) => {
  const phonePlayers = players.filter(p => p.color !== 'tv-host');
  waitingPlayers.textContent = phonePlayers.map(p => p.name).join(', ');
});

socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-frog-drop') return;
  roundDuration = state.roundDuration || 90;
  timeLeft = (typeof state.timeLeft === 'number' && state.timeLeft > 0) ? state.timeLeft : roundDuration;
  showScreen(playingScreen);
  resizeBoard();
  updateTimerDisplay();
  startRenderLoop();
  startLocalTick();
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-frog-drop') return;
  if (!playingScreen.classList.contains('active')) {
    roundDuration = state.roundDuration || 90;
    timeLeft = typeof state.timeLeft === 'number' ? state.timeLeft : roundDuration;
    showScreen(playingScreen);
    resizeBoard();
    startRenderLoop();
    startLocalTick();
  }
  // Resync to authoritative server time (handles clock drift / disconnects).
  if (typeof state.timeLeft === 'number') {
    timeLeft = state.timeLeft;
    updateTimerDisplay();
  }
});

socket.on('frog_drop_player_state', (ps) => {
  // Spawn animations + sound effects from any new merge events.
  if (playerState && ps.mergeEvents && ps.mergeEvents.length) {
    ps.mergeEvents.forEach(evt => {
      renderer.spawnParticles(evt.col, evt.row, evt.toTier, 25);
      renderer.spawnScorePopup(evt.col, evt.row, evt.score, evt.chain);
      if (window.fdSfx) {
        if (evt.rainbow) {
          // Rainbow merges play their own chime; skip the regular merge sound.
        } else if (evt.chain && evt.chain > 0) {
          fdSfx.chain(evt.chain);
        } else {
          fdSfx.merge(evt.toTier);
        }
      }
    });
  }
  // Rainbow events get a rainbow particle burst + chime + popup
  if (playerState && Array.isArray(ps.rainbowEvents) && ps.rainbowEvents.length) {
    ps.rainbowEvents.forEach(evt => spawnRainbowBurst(evt));
    if (window.fdSfx) fdSfx.rainbow();
  }
  // Row-match events: ≥4 same-tier frogs in one row clear together.
  if (playerState && Array.isArray(ps.rowMatchEvents) && ps.rowMatchEvents.length) {
    ps.rowMatchEvents.forEach(evt => spawnRowMatchBurst(evt));
    if (window.fdSfx) {
      const biggest = ps.rowMatchEvents.reduce((m, e) => Math.max(m, e.count), 0);
      fdSfx.rowMatch(biggest);
    }
  }
  playerState = ps;
  updateUI();
});

// Multi-color particle burst at a board cell — for rainbow events.
function spawnRainbowBurst(evt) {
  const tiers = [1, 2, 3, 4, 5, 6, 7, 8];
  // Spawn ~50 particles using each tier's color, plus the score popup.
  for (let i = 0; i < 60; i++) {
    const tier = tiers[i % tiers.length];
    renderer.spawnParticles(evt.col, evt.row, tier, 1);
  }
  renderer.spawnScorePopup(evt.col, evt.row, evt.score, (evt.chain || 0) + 2);
}

// Same-color row clear burst — particles at every cleared cell plus a
// score popup at the centre cell.
function spawnRowMatchBurst(evt) {
  if (!evt || !Array.isArray(evt.cols)) return;
  evt.cols.forEach(col => {
    renderer.spawnParticles(col, evt.row, evt.tier, 30);
  });
  // Pick the middle cleared column for the score popup.
  const mid = evt.cols[Math.floor(evt.cols.length / 2)];
  renderer.spawnScorePopup(mid, evt.row, evt.score, (evt.chain || 0) + 1);
}

socket.on('game_over', ({ winner, reason, rankings }) => {
  if (window.fdSfx) {
    fdSfx.timeUp();
    // If this player is the winner, also play the victory fanfare.
    if (winner && winner === myName) setTimeout(() => fdSfx.victory(), 350);
  }
  goReason.textContent = reason || (winner ? `${winner} wins!` : "Time's up!");
  goRankings.innerHTML = '';
  if (Array.isArray(rankings)) {
    rankings.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'row' + (i === 0 ? ' first' : '');
      row.innerHTML = `<span>#${i + 1} ${escHtml(r.name)}</span><span>${r.score}</span>`;
      goRankings.appendChild(row);
    });
  }
  showScreen(gameoverScreen);
});

socket.on('frog_drop_countdown', ({ secsLeft, go }) => {
  showPlayerCountdown(go ? 'GO!' : secsLeft, !!go);
});

socket.on('error', ({ message }) => console.error('Server error:', message));

// ── Pre-round countdown overlay ─────────────────────────────────────────
const pcdEl  = document.getElementById('pcdOverlay');
const pcdNum = document.getElementById('pcdNum');
let _pcdHideTimer = null;

function showPlayerCountdown(text, isGo) {
  if (!pcdEl || !pcdNum) return;
  pcdEl.classList.remove('hidden');
  pcdNum.textContent = text;
  pcdNum.classList.toggle('go', !!isGo);
  pcdNum.classList.remove('tick');
  // eslint-disable-next-line no-unused-expressions
  void pcdNum.offsetWidth;
  pcdNum.classList.add('tick');
  if (window.fdSfx) {
    if (isGo) fdSfx.go(); else fdSfx.countdown();
  }
  if (_pcdHideTimer) clearTimeout(_pcdHideTimer);
  _pcdHideTimer = setTimeout(() => {
    pcdEl.classList.add('hidden');
  }, isGo ? 700 : 1100);
}


// ── Canvas sizing ────────────────────────────────────────────────────────────
// Fit the board into the available .board-area while reserving space for the
// drag zone above the grid. Uses both width AND height so the board stays
// fully visible on short phones (no scrolling needed).
// Canvas occupies the .board-area parent. .board-area handles its own
// padding via CSS, so we measure clientWidth/Height directly and only
// account for the canvas's own 4px border on each side. The cell size is
// only capped on very wide screens to keep the board from looking
// awkwardly oversized on tablets.
function resizeBoard() {
  const area = boardCanvas.parentElement;
  // Canvas has no border in the current layout; only subtract a tiny safety
  // gap so the rounded corners don't get clipped on hi-dpi rounding.
  const SAFETY = 2;
  const availW = Math.max(160, (area.clientWidth  || window.innerWidth)  - SAFETY);
  const availH = Math.max(220, (area.clientHeight || (window.innerHeight - 200)) - SAFETY);

  // Drag zone is 1.6 × cellSize above the ROWS-tall grid.
  //   total height = cellSize × (ROWS + 1.6)
  const csByW = availW / COLS;
  const csByH = availH / (ROWS + 1.6);
  // Hard cap only kicks in on tablets (cell > 96px); on phones we always
  // use the largest size that fits both width and height.
  cellSize = Math.floor(Math.max(28, Math.min(csByW, csByH, 96)));

  dragZoneH = Math.floor(cellSize * 1.6);
  boardOffsetY = dragZoneH;
  boardCanvas.width = COLS * cellSize;
  boardCanvas.height = dragZoneH + ROWS * cellSize;
  renderer.cellSize = cellSize;
  renderer.offsetX = 0;
  renderer.offsetY = boardOffsetY;
  renderer.headerHeight = 0;
}
window.addEventListener('resize',           () => { if (playerState) resizeBoard(); });
window.addEventListener('orientationchange',() => { if (playerState) setTimeout(resizeBoard, 100); });

// ── Drag input ───────────────────────────────────────────────────────────────
function getCanvasPos(e) {
  const rect = boardCanvas.getBoundingClientRect();
  const scaleX = boardCanvas.width / rect.width;
  const scaleY = boardCanvas.height / rect.height;
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
}
function colFromX(x) { return Math.max(0, Math.min(COLS - 1, Math.floor(x / cellSize))); }

boardCanvas.addEventListener('touchstart', onDragStart, { passive: false });
boardCanvas.addEventListener('mousedown',  onDragStart);
boardCanvas.addEventListener('touchmove',  onDragMove,  { passive: false });
boardCanvas.addEventListener('mousemove',  onDragMove);
boardCanvas.addEventListener('touchend',   onDragEnd);
boardCanvas.addEventListener('mouseup',    onDragEnd);
boardCanvas.addEventListener('touchcancel', onDragCancel);
boardCanvas.addEventListener('mouseleave',  onDragCancel);

function inputLocked() {
  return !playerState || playerState.boardFull || timeLeft <= 0 || dropAnim !== null;
}

// Tap-vs-drag detection. A tap = quick + tiny finger movement; releases
// anywhere else are treated as a drag-and-drop. While `pendingDrag` is true
// we don't render the frog under the finger — only once the user actually
// drags past the move threshold do we promote it to a visible drag.
const TAP_MOVE_THRESHOLD = 10;
const TAP_TIME_THRESHOLD = 250;
let downX = 0, downY = 0, downAt = 0;
let pendingDrag = false;

function onDragStart(e) {
  e.preventDefault();
  if (inputLocked()) return;
  const pos = getCanvasPos(e);
  // Don't visibly drag yet — only show the dragged frog once the finger has
  // moved past the tap threshold. This stops a quick tap from showing a
  // momentary "frog under finger" before the drop animation starts.
  dragging = true;
  pendingDrag = true;
  dragX = pos.x; dragY = pos.y; hoverCol = -1;
  downX = pos.x; downY = pos.y; downAt = Date.now();
}
function onDragMove(e) {
  if (!dragging) return;
  e.preventDefault();
  const pos = getCanvasPos(e);
  dragX = pos.x; dragY = pos.y;
  if (pendingDrag) {
    const moved = Math.hypot(dragX - downX, dragY - downY);
    if (moved >= TAP_MOVE_THRESHOLD) {
      pendingDrag = false;
      hoverCol = colFromX(pos.x);
    }
  } else {
    hoverCol = colFromX(pos.x);
  }
}
function onDragEnd() {
  if (!dragging) return;
  dragging = false;
  const wasPending = pendingDrag;
  pendingDrag = false;
  if (!playerState || playerState.boardFull || timeLeft <= 0) return;

  // Tap = release before the move threshold was crossed AND quick.
  const dt = Date.now() - downAt;
  const wasTap = wasPending && dt < TAP_TIME_THRESHOLD;

  // For a tap, the column comes from where the finger first touched.
  // For a drag, use the last hover column.
  const col = wasTap ? colFromX(downX) : hoverCol;
  hoverCol = -1;
  if (col < 0 || col >= COLS) return;
  if (playerState.grid[col][0] !== 0) return;     // column full

  // Find the row this frog will land in (lowest empty cell).
  let landRow = -1;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (playerState.grid[col][r] === 0) { landRow = r; break; }
  }
  if (landRow < 0) return;

  const targetY = boardOffsetY + landRow * cellSize + cellSize / 2;
  const startY = wasTap
    ? dragZoneH * 0.5                   // tap → fall from drag-zone center
    : Math.min(dragY, targetY - 4);     // drag → fall from where finger left

  dropAnim = {
    col,
    row: landRow,
    tier: playerState.nextFrog,
    x: col * cellSize + cellSize / 2,
    y: startY,
    vy: 0,
    targetY,
    bounces: 0,
    landed: false,
    emitted: false,
  };
}
function onDragCancel() { dragging = false; pendingDrag = false; hoverCol = -1; }

function tickDropAnim() {
  if (!dropAnim) return;
  if (dropAnim.landed) {
    // Settle phase — small squash recovery, then end.
    dropAnim.settleT = (dropAnim.settleT || 0) + 1;
    if (dropAnim.settleT >= 6) {
      // Emit the drop now so the server-side merge animation arrives next.
      if (!dropAnim.emitted) {
        socket.emit('tv_frog_drop_drop', { col: dropAnim.col });
        dropAnim.emitted = true;
      }
      dropAnim = null;
    }
    return;
  }
  dropAnim.vy += DROP_GRAVITY;
  dropAnim.y  += dropAnim.vy;
  if (dropAnim.y >= dropAnim.targetY) {
    dropAnim.y = dropAnim.targetY;
    if (Math.abs(dropAnim.vy) < 1.8 || dropAnim.bounces >= DROP_MAX_BOUNCES) {
      dropAnim.vy = 0;
      dropAnim.landed = true;
      dropAnim.settleT = 0;
      if (window.fdSfx) fdSfx.drop();
    } else {
      dropAnim.vy = -dropAnim.vy * DROP_BOUNCE_DAMP;
      dropAnim.bounces += 1;
    }
  }
}

function dropAnimSquash() {
  // Returns {sx, sy} scale factors for squash/stretch.
  if (!dropAnim) return { sx: 1, sy: 1 };
  if (dropAnim.landed) {
    const t = (dropAnim.settleT || 0) / 6;          // 0..1
    const k = Math.sin(t * Math.PI) * 0.18;          // squash bump
    return { sx: 1 + k, sy: 1 - k };
  }
  // In-flight stretch proportional to vertical speed.
  const stretch = Math.min(0.18, Math.abs(dropAnim.vy) * 0.012);
  return { sx: 1 - stretch * 0.6, sy: 1 + stretch };
}

// ── Render loop ──────────────────────────────────────────────────────────────
function startRenderLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);
  renderFrame();
}
function renderFrame() {
  tickDropAnim();
  renderBoard();
  animFrameId = requestAnimationFrame(renderFrame);
}

function updateUI() {
  if (!playerState) return;
  scoreValueEl.textContent = playerState.score;
}

function updateTimerDisplay() {
  timerDisplay.textContent = `${Math.max(0, timeLeft)}s`;
  timerDisplay.classList.toggle('urgent', timeLeft <= 10 && timeLeft > 0);
}

// Local 1Hz countdown so the timer ticks smoothly between server updates.
let _localTickHandle = null;
function startLocalTick() {
  if (_localTickHandle) clearInterval(_localTickHandle);
  _localTickHandle = setInterval(() => {
    if (timeLeft > 0 && playingScreen.classList.contains('active')) {
      timeLeft -= 1;
      updateTimerDisplay();
      // Audible countdown in the final stretch.
      if (window.fdSfx) {
        if (timeLeft > 0 && timeLeft <= 3) fdSfx.tickUrgent();
        else if (timeLeft > 0 && timeLeft <= 10) fdSfx.tick();
      }
    }
  }, 1000);
}

function renderBoard() {
  if (!playerState) return;
  const ctx = boardCtx;
  const cs = cellSize;
  const w = boardCanvas.width;

  ctx.clearRect(0, 0, w, boardCanvas.height);

  // Drag zone
  ctx.fillStyle = '#101528';
  ctx.fillRect(0, 0, w, dragZoneH);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, dragZoneH); ctx.lineTo(w, dragZoneH); ctx.stroke();

  // "Then" preview
  const thenSize = cs * 0.55;
  const thenX = 30;
  const thenY = dragZoneH * 0.35;
  ctx.font = `${Math.max(10, cs * 0.18)}px Arial, sans-serif`;
  ctx.fillStyle = '#777'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('Then', thenX, thenY - thenSize * 0.48);
  drawFrogShape(ctx, thenX, thenY, playerState.previewFrog, thenSize);

  // "Next" frog. While the press is still ambiguous (could become a tap),
  // keep the frog parked in the drag zone so a quick tap doesn't briefly
  // snap the frog under the finger.
  const visiblyDragging = dragging && !pendingDrag;
  const nextSize = cs * 0.95;
  let nextX = w / 2, nextY = dragZoneH * 0.5;
  if (visiblyDragging) { nextX = dragX; nextY = dragY; }

  if (!visiblyDragging && !dropAnim && timeLeft > 0 && !playerState.boardFull) {
    ctx.font = `bold ${Math.max(12, cs * 0.22)}px Arial, sans-serif`;
    ctx.fillStyle = '#aaa'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('Drag or tap a column', w / 2, dragZoneH - 6);
  }

  // Grid background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, boardOffsetY, w, ROWS * cs);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * cs, boardOffsetY); ctx.lineTo(c * cs, boardOffsetY + ROWS * cs); ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, boardOffsetY + r * cs); ctx.lineTo(w, boardOffsetY + r * cs); ctx.stroke();
  }

  // Falling frog's column highlight (subtle trail)
  if (dropAnim) {
    ctx.fillStyle = 'rgba(76,175,80,0.10)';
    ctx.fillRect(dropAnim.col * cs, boardOffsetY, cs, ROWS * cs);
  }

  // Hover highlight (only once the press has been promoted to a real drag)
  if (visiblyDragging && hoverCol >= 0) {
    const colFull = playerState.grid[hoverCol][0] !== 0;
    ctx.fillStyle = colFull ? 'rgba(244,67,54,0.15)' : 'rgba(76,175,80,0.18)';
    ctx.fillRect(hoverCol * cs, boardOffsetY, cs, ROWS * cs);
    ctx.fillStyle = colFull ? 'rgba(244,67,54,0.10)' : 'rgba(76,175,80,0.10)';
    ctx.fillRect(hoverCol * cs, 0, cs, dragZoneH);
    if (!colFull) {
      let landRow = -1;
      for (let r = ROWS - 1; r >= 0; r--) { if (playerState.grid[hoverCol][r] === 0) { landRow = r; break; } }
      if (landRow >= 0) {
        ctx.globalAlpha = 0.3;
        drawFrogShape(ctx, hoverCol * cs + cs / 2, boardOffsetY + landRow * cs + cs / 2, playerState.nextFrog, cs);
        ctx.globalAlpha = 1;
      }
    }
  }

  // Placed frogs
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const tier = playerState.grid[c][r];
      if (tier > 0) {
        drawFrogShape(ctx, c * cs + cs / 2, boardOffsetY + r * cs + cs / 2, tier, cs);
      }
    }
  }

  renderer.drawParticles();
  renderer.drawScorePopups();

  // Falling frog (mid-drop animation) — drawn above placed frogs.
  if (dropAnim) {
    drawDroppingFrog(ctx, dropAnim, cs);
  }

  // Dragged frog on top
  if (dragging) {
    drawFrogShape(ctx, nextX, nextY, playerState.nextFrog, nextSize * 1.15);
  } else if (!dropAnim && timeLeft > 0 && !playerState.boardFull) {
    drawFrogShape(ctx, nextX, nextY, playerState.nextFrog, nextSize);
  }

  // Time's up / board full overlay
  if (playerState.boardFull || timeLeft <= 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, boardOffsetY, w, ROWS * cs);
    ctx.font = `bold ${cs * 0.55}px Arial, sans-serif`;
    ctx.fillStyle = timeLeft <= 0 ? '#FFD700' : '#FF5555';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(timeLeft <= 0 ? "TIME'S UP!" : 'BOARD FULL', w / 2, boardOffsetY + ROWS * cs / 2);
  }
}

function drawDroppingFrog(ctx, anim, cs) {
  const x = anim.col * cs + cs / 2;
  const targetY = anim.targetY;
  const dist = Math.max(0, targetY - anim.y);
  const maxDist = ROWS * cs;
  const closeness = 1 - Math.min(1, dist / maxDist); // 0 far → 1 landed

  // Soft shadow on the landing cell — sharper as the frog gets closer.
  const shadowR = cs * (0.18 + 0.22 * closeness);
  ctx.save();
  ctx.globalAlpha = 0.18 + 0.32 * closeness;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, targetY + cs * 0.32, shadowR, shadowR * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Frog with squash/stretch.
  const { sx, sy } = dropAnimSquash();
  ctx.save();
  ctx.translate(x, anim.y);
  ctx.scale(sx, sy);
  drawFrogShape(ctx, 0, 0, anim.tier, cs);
  ctx.restore();

  // Impact ring on the landing frame (when first landing).
  if (anim.landed && anim.settleT === 1) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, targetY + cs * 0.18, cs * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
