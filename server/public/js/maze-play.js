'use strict';

// ── URL params ───────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const roomId = params.get('room');
const isAutoJoin = params.get('autojoin') === '1';

// ── Session persistence key ─────────────────────────────────────────────────
const SESSION_KEY = roomId ? `tvMaze_${roomId}` : null;

// ── Autojoin handoff (from /tv-join) ────────────────────────────────────────
if (isAutoJoin && roomId && SESSION_KEY) {
  try {
    const raw = sessionStorage.getItem(`caritahub_pending_join_${roomId}`);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.name && data.color && Date.now() - (data.ts || 0) < 30 * 60 * 1000) {
        const seatColors = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
        const colorIdx = seatColors.indexOf(data.color);
        const seat = colorIdx > 0 ? colorIdx - 1 : -1;
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
          myName:        data.name,
          myColor:       data.color,
          mySeat:        seat,
          currentScreen: 'waiting',
          ts:            Date.now()
        }));
      }
    }
  } catch (e) { /* ignore */ }
}

// ── State ────────────────────────────────────────────────────────────────────
let myColor = null;
let mySeat  = -1;
let myName  = '';
let myRoomId = roomId;
let playerState = null;    // latest maze_player_state
let currentScreen = 'join'; // join | waiting | playing | gameover

// ── Debounce timestamps ─────────────────────────────────────────────────────
let lastMoveTime = 0;
let lastTurnTime = 0;
const MOVE_DEBOUNCE = 200;
const TURN_DEBOUNCE = 100;

// ── Heading helpers ─────────────────────────────────────────────────────────
const HEADING_NAMES = ['North', 'East', 'South', 'West'];
const HEADING_DELTAS = [
  { dr: -1, dc:  0 }, // 0 = North (up)
  { dr:  0, dc:  1 }, // 1 = East  (right)
  { dr:  1, dc:  0 }, // 2 = South (down)
  { dr:  0, dc: -1 }, // 3 = West  (left)
];

// ── Colors ──────────────────────────────────────────────────────────────────
const TV_MAZE_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

function seatForColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_MAZE_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}

// ── Session persistence helpers ─────────────────────────────────────────────
function saveSession() {
  if (!SESSION_KEY) return;
  try {
    const data = { myName, myColor, mySeat, currentScreen, ts: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch (e) { /* storage full or unavailable */ }
}

function loadSession() {
  if (!SESSION_KEY) return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.ts > 30 * 60 * 1000) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return data;
  } catch (e) { return null; }
}

function clearSession() {
  if (!SESSION_KEY) return;
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
}

// ── Restore session on page load ────────────────────────────────────────────
const savedSession = loadSession();
if (savedSession && savedSession.myName && savedSession.myColor) {
  myName  = savedSession.myName;
  myColor = savedSession.myColor;
  mySeat  = savedSession.mySeat;
}

// ── DOM refs ────────────────────────────────────────────────────────────────
const joinScreen       = document.getElementById('joinScreen');
const waitingScreen    = document.getElementById('waitingScreen');
const playingScreen    = document.getElementById('playingScreen');
const gameoverScreen   = document.getElementById('gameoverScreen');
const reconnectOverlay = document.getElementById('reconnectOverlay');

// Join
const nameInput = document.getElementById('nameInput');
const joinBtn   = document.getElementById('joinBtn');
const joinError = document.getElementById('joinError');

// Waiting
const waitingName       = document.getElementById('waitingName');
const waitingPlayerList = document.getElementById('waitingPlayerList');

// Playing
const minimapCanvas  = document.getElementById('minimapCanvas');
const minimapCtx     = minimapCanvas.getContext('2d');
const fpvCanvas      = document.getElementById('fpvCanvas');
const fpvCtx         = fpvCanvas.getContext('2d');
const headingLabel   = document.getElementById('headingLabel');
const moveFeedback   = document.getElementById('moveFeedback');
const btnForward     = document.getElementById('btnForward');
const btnBack        = document.getElementById('btnBack');
const btnTurnLeft    = document.getElementById('btnTurnLeft');
const btnTurnRight   = document.getElementById('btnTurnRight');

// Game Over
const gameoverEmoji      = document.getElementById('gameoverEmoji');
const gameoverTitleEl    = document.getElementById('gameoverTitle');
const gameoverPersonalEl = document.getElementById('gameoverPersonal');
const gameoverMsgEl      = document.getElementById('gameoverMsg');

// Pre-fill name from session
if (myName && nameInput) {
  nameInput.value = myName;
}


// Autojoin: jump straight to waiting screen — server will send game_state shortly
if (isAutoJoin && myColor && myName) {
  if (waitingName) waitingName.textContent = `You joined as ${myName}`;
  switchScreen('waiting');
}

// ── Socket ──────────────────────────────────────────────────────────────────
const socket = io({
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  if (myColor && myName) {
    socket.emit('join_game', {
      roomId: myRoomId,
      playerName: myName,
      gameType: 'tv-maze',
      reconnect: true
    });
  }
});

socket.on('disconnect', () => {
  reconnectOverlay.classList.remove('hidden');
});

socket.on('connect_error', () => {
  reconnectOverlay.classList.remove('hidden');
});

// ── Visibility change — handle phone background/foreground ──────────────────
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && myColor && myName) {
    if (!socket.connected) {
      reconnectOverlay.classList.remove('hidden');
      socket.connect();
    } else {
      socket.emit('join_game', {
        roomId: myRoomId,
        playerName: myName,
        gameType: 'tv-maze',
        reconnect: true
      });
    }
  }
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted && myColor && myName) {
    if (!socket.connected) {
      socket.connect();
    } else {
      socket.emit('join_game', {
        roomId: myRoomId,
        playerName: myName,
        gameType: 'tv-maze',
        reconnect: true
      });
    }
  }
});

// ── Join flow ───────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = nameInput.value.trim();
  if (!name) {
    joinError.textContent = 'Please enter your name.';
    return;
  }
  if (!roomId) {
    joinError.textContent = 'No game room found. Please scan the QR code again.';
    return;
  }
  myName = name;
  joinError.textContent = '';
  joinBtn.disabled = true;

  socket.emit('join_game', {
    roomId: roomId,
    playerName: name,
    gameType: 'tv-maze'
  });
}

// ── Joined ──────────────────────────────────────────────────────────────────
socket.on('joined', ({ roomId: rid, color, reconnected }) => {
  myColor = color;
  mySeat = seatForColor(color);
  if (rid) myRoomId = rid;

  if (color === 'spectator' || color === 'tv-host') {
    joinError.textContent = 'Game is full. You are a spectator.';
    joinBtn.disabled = false;
    clearSession();
    return;
  }

  saveSession();

  if (!reconnected) {
    waitingName.textContent = 'You joined as ' + escHtml(myName);
    switchScreen('waiting');
  } else {
    waitingName.textContent = 'Reconnecting as ' + escHtml(myName) + '...';
    setTimeout(() => {
      if (currentScreen === 'join') {
        switchScreen('waiting');
        waitingName.textContent = 'You joined as ' + escHtml(myName);
      }
    }, 1000);
  }
});

// ── Room update ─────────────────────────────────────────────────────────────
socket.on('room_update', ({ players }) => {
  const phonePlayers = players.filter(p => p.color !== 'tv-host');
  waitingPlayerList.innerHTML = '';
  phonePlayers.forEach(p => {
    const div = document.createElement('div');
    div.className = 'waiting-player-item';
    div.textContent = escHtml(p.name) + (p.connected ? '' : ' (disconnected)');
    if (!p.connected) div.style.opacity = '0.5';
    waitingPlayerList.appendChild(div);
  });

  if (currentScreen === 'join' && myColor && myColor !== 'spectator') {
    waitingName.textContent = 'You joined as ' + escHtml(myName);
    switchScreen('waiting');
  }
});

// ── Game started ────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-maze') return;
  switchScreen('playing');
  saveSession();
});

// ── Player state update (personal view) ─────────────────────────────────────
socket.on('maze_player_state', (state) => {
  playerState = state;

  if (state.isGameOver) {
    handleGameOver(state);
    return;
  }

  if (currentScreen !== 'playing') {
    switchScreen('playing');
  }

  renderHeading(state.heading);
  renderMinimap(state);
  renderFirstPersonView(state);
  saveSession();
});

// ── Game state (fallback) ───────────────────────────────────────────────────
socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-maze') return;
  if (currentScreen !== 'playing' && currentScreen !== 'gameover') {
    switchScreen('playing');
  }
  saveSession();
});

// ── Move result (error feedback) ────────────────────────────────────────────
socket.on('maze_move_result', ({ success, reason }) => {
  if (!success) {
    moveFeedback.textContent = reason || 'Blocked by wall!';
    moveFeedback.style.opacity = '1';
    if ('vibrate' in navigator) navigator.vibrate([50, 30, 50]);
    setTimeout(() => { moveFeedback.style.opacity = '0'; }, 800);
  }
});

// ── Game over ───────────────────────────────────────────────────────────────
socket.on('game_over', ({ winner, reason }) => {
  const iWon = winner && winner === myName;

  if (iWon) {
    gameoverEmoji.textContent = '\uD83C\uDFC6';
    gameoverTitleEl.textContent = 'YOU WIN!';
    gameoverPersonalEl.textContent = 'You escaped the maze!';
  } else {
    gameoverEmoji.textContent = '\uD83D\uDC4F';
    gameoverTitleEl.textContent = 'Game Over';
    gameoverPersonalEl.textContent = '';
  }

  gameoverMsgEl.textContent = reason || (winner ? winner + ' won!' : 'Game over!');

  setTimeout(() => {
    switchScreen('gameover');
    if (iWon) {
      if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 300]);
      launchConfetti();
      playVictorySound();
    }
    saveSession();
  }, 1500);
});

function handleGameOver(state) {
  const winnerSeat = state.winnerSeat;
  const iWon = winnerSeat === mySeat;

  if (iWon) {
    gameoverEmoji.textContent = '\uD83C\uDFC6';
    gameoverTitleEl.textContent = 'YOU WIN!';
    gameoverPersonalEl.textContent = 'You escaped the maze!';
  } else {
    gameoverEmoji.textContent = '\uD83D\uDC4F';
    gameoverTitleEl.textContent = 'Game Over';
    gameoverPersonalEl.textContent = 'Someone found the exit first!';
  }

  gameoverMsgEl.textContent = iWon ? 'Congratulations!' : 'Better luck next time!';

  setTimeout(() => {
    switchScreen('gameover');
    if (iWon) {
      if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 300]);
      launchConfetti();
      playVictorySound();
    }
    saveSession();
  }, 1500);
}

// ── Play again ──────────────────────────────────────────────────────────────
socket.on('play_again', () => {
  playerState = null;
  moveFeedback.textContent = '';
  switchScreen('waiting');
  waitingName.textContent = 'You joined as ' + escHtml(myName);
  saveSession();
});

// ── Error ───────────────────────────────────────────────────────────────────
socket.on('error', ({ message }) => {
  if (currentScreen === 'join') {
    joinError.textContent = message;
    joinBtn.disabled = false;
  } else {
    alert(message);
  }
});

// ── Screen switching ────────────────────────────────────────────────────────
function switchScreen(name) {
  currentScreen = name;
  joinScreen.classList.toggle('active', name === 'join');
  waitingScreen.classList.toggle('active', name === 'waiting');
  playingScreen.classList.toggle('active', name === 'playing');
  gameoverScreen.classList.toggle('active', name === 'gameover');
}

// ── Controls: button clicks ─────────────────────────────────────────────────
btnForward.addEventListener('click',   () => emitAction('forward'));
btnBack.addEventListener('click',      () => emitAction('back'));
btnTurnLeft.addEventListener('click',  () => emitAction('turn_left'));
btnTurnRight.addEventListener('click', () => emitAction('turn_right'));

function emitAction(action) {
  const now = Date.now();
  const isTurn = action === 'turn_left' || action === 'turn_right';
  const debounce = isTurn ? TURN_DEBOUNCE : MOVE_DEBOUNCE;
  const lastTime = isTurn ? lastTurnTime : lastMoveTime;

  if (now - lastTime < debounce) return;

  if (isTurn) {
    lastTurnTime = now;
  } else {
    lastMoveTime = now;
  }

  socket.emit('maze_action', { action: action });
}

// ── Controls: keyboard ──────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (currentScreen !== 'playing') return;

  switch (e.key) {
    case 'w': case 'W': case 'ArrowUp':
      e.preventDefault();
      emitAction('forward');
      break;
    case 's': case 'S': case 'ArrowDown':
      e.preventDefault();
      emitAction('back');
      break;
    case 'a': case 'A': case 'ArrowLeft':
      e.preventDefault();
      emitAction('turn_left');
      break;
    case 'd': case 'D': case 'ArrowRight':
      e.preventDefault();
      emitAction('turn_right');
      break;
  }
});

// ── Render heading ──────────────────────────────────────────────────────────
function renderHeading(heading) {
  const name = HEADING_NAMES[heading] || 'Unknown';
  headingLabel.textContent = 'Facing: ' + name;
}

// ── Render mini-map (3x3 grid centered on player) ───────────────────────────
function renderMinimap(state) {
  const W = minimapCanvas.width;
  const H = minimapCanvas.height;
  const cellSize = Math.floor(Math.min(W, H) / 3);
  const offsetX = Math.floor((W - cellSize * 3) / 2);
  const offsetY = Math.floor((H - cellSize * 3) / 2);

  minimapCtx.clearRect(0, 0, W, H);

  // walls data: { row, col, heading, walls: { north, east, south, west } }
  // canSee: array of { row, col, walls } for nearby cells
  const canSee = state.canSee || [];
  const pRow = state.row;
  const pCol = state.col;
  const heading = state.heading;

  // Build a lookup for visible cells
  const cellMap = {};
  canSee.forEach(c => {
    cellMap[c.row + ',' + c.col] = c;
  });

  // Also include the player's own cell from state.walls
  if (state.walls) {
    cellMap[pRow + ',' + pCol] = { row: pRow, col: pCol, walls: state.walls };
  }

  // Draw 3x3 grid centered on player
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const r = pRow + dy;
      const c = pCol + dx;
      const gx = offsetX + (dx + 1) * cellSize;
      const gy = offsetY + (dy + 1) * cellSize;

      const cell = cellMap[r + ',' + c];

      if (cell) {
        // Floor
        minimapCtx.fillStyle = (dx === 0 && dy === 0) ? '#2a4a3a' : '#1a2a2a';
        minimapCtx.fillRect(gx, gy, cellSize, cellSize);

        // Walls
        minimapCtx.strokeStyle = '#4ecca3';
        minimapCtx.lineWidth = 3;

        const w = cell.walls;
        if (w.north) {
          minimapCtx.beginPath();
          minimapCtx.moveTo(gx, gy);
          minimapCtx.lineTo(gx + cellSize, gy);
          minimapCtx.stroke();
        }
        if (w.south) {
          minimapCtx.beginPath();
          minimapCtx.moveTo(gx, gy + cellSize);
          minimapCtx.lineTo(gx + cellSize, gy + cellSize);
          minimapCtx.stroke();
        }
        if (w.west) {
          minimapCtx.beginPath();
          minimapCtx.moveTo(gx, gy);
          minimapCtx.lineTo(gx, gy + cellSize);
          minimapCtx.stroke();
        }
        if (w.east) {
          minimapCtx.beginPath();
          minimapCtx.moveTo(gx + cellSize, gy);
          minimapCtx.lineTo(gx + cellSize, gy + cellSize);
          minimapCtx.stroke();
        }
      } else {
        // Unknown / out of bounds
        minimapCtx.fillStyle = '#0a0a0a';
        minimapCtx.fillRect(gx, gy, cellSize, cellSize);
      }
    }
  }

  // Draw player marker (triangle pointing in heading direction)
  const cx = offsetX + 1.5 * cellSize;
  const cy = offsetY + 1.5 * cellSize;
  const markerSize = cellSize * 0.3;

  minimapCtx.save();
  minimapCtx.translate(cx, cy);
  minimapCtx.rotate(heading * Math.PI / 2); // 0=N(up), 1=E, 2=S, 3=W

  minimapCtx.fillStyle = '#ffd700';
  minimapCtx.beginPath();
  minimapCtx.moveTo(0, -markerSize);
  minimapCtx.lineTo(markerSize * 0.6, markerSize * 0.5);
  minimapCtx.lineTo(-markerSize * 0.6, markerSize * 0.5);
  minimapCtx.closePath();
  minimapCtx.fill();
  minimapCtx.restore();
}

// ── Render first-person 3D perspective view ─────────────────────────────────
function renderFirstPersonView(state) {
  const W = fpvCanvas.width;
  const H = fpvCanvas.height;

  fpvCtx.clearRect(0, 0, W, H);

  // Sky
  const skyGrad = fpvCtx.createLinearGradient(0, 0, 0, H * 0.5);
  skyGrad.addColorStop(0, '#0a0e17');
  skyGrad.addColorStop(1, '#1a2a4a');
  fpvCtx.fillStyle = skyGrad;
  fpvCtx.fillRect(0, 0, W, H * 0.5);

  // Ground
  const groundGrad = fpvCtx.createLinearGradient(0, H * 0.5, 0, H);
  groundGrad.addColorStop(0, '#1a1a1a');
  groundGrad.addColorStop(1, '#0a0a0a');
  fpvCtx.fillStyle = groundGrad;
  fpvCtx.fillRect(0, H * 0.5, W, H * 0.5);

  const walls = state.walls;
  if (!walls) return;

  const heading = state.heading;
  const canSee = state.canSee || [];

  // Determine walls relative to player heading:
  // forward, left, right, behind
  const dirNames = ['north', 'east', 'south', 'west'];
  const forwardDir = dirNames[heading];
  const rightDir   = dirNames[(heading + 1) % 4];
  const backDir    = dirNames[(heading + 2) % 4];
  const leftDir    = dirNames[(heading + 3) % 4];

  const wallForward = walls[forwardDir];
  const wallLeft    = walls[leftDir];
  const wallRight   = walls[rightDir];
  const wallBack    = walls[backDir];

  // Get the cell ahead (if visible)
  const fd = HEADING_DELTAS[heading];
  const aheadRow = state.row + fd.dr;
  const aheadCol = state.col + fd.dc;
  const aheadCell = canSee.find(c => c.row === aheadRow && c.col === aheadCol);

  // Get 2 cells ahead
  const ahead2Row = state.row + fd.dr * 2;
  const ahead2Col = state.col + fd.dc * 2;
  const ahead2Cell = canSee.find(c => c.row === ahead2Row && c.col === ahead2Col);

  // Depth layers for perspective rendering
  // Each layer: { left, right, top, bottom } percentages
  const layers = [
    { scale: 1.0,  depth: 0 },   // Current cell
    { scale: 0.55, depth: 1 },   // One cell ahead
    { scale: 0.30, depth: 2 },   // Two cells ahead
  ];

  // Draw from back to front
  // --- Depth 2 (two cells ahead) ---
  if (!wallForward && aheadCell && ahead2Cell) {
    drawCorridorLayer(ahead2Cell, heading, layers[2], W, H, true);
  }

  // --- Depth 1 (one cell ahead) ---
  if (!wallForward && aheadCell) {
    drawCorridorLayer(aheadCell, heading, layers[1], W, H, false);
  }

  // --- Depth 0 (current cell) ---
  drawCurrentCellWalls(wallLeft, wallRight, wallForward, W, H);

  // Draw exit indicator if visible
  if (state.exitVisible) {
    drawExitMarker(W, H);
  }
}

function drawCorridorLayer(cell, heading, layer, W, H, isFar) {
  if (!cell || !cell.walls) return;

  const dirNames = ['north', 'east', 'south', 'west'];
  const leftDir  = dirNames[(heading + 3) % 4];
  const rightDir = dirNames[(heading + 1) % 4];
  const forwardDir = dirNames[heading];

  const s = layer.scale;
  const cx = W / 2;
  const cy = H / 2;

  const wallColor = isFar ? '#1a3a3a' : '#2a5a5a';
  const edgeColor = isFar ? '#0d2a2a' : '#1a4a4a';

  // Corridor opening dimensions at this depth
  const halfW = (W / 2) * s;
  const halfH = (H / 2) * s;
  const left  = cx - halfW;
  const right = cx + halfW;
  const top   = cy - halfH;
  const bottom = cy + halfH;

  // Forward wall at this depth
  if (cell.walls[forwardDir]) {
    fpvCtx.fillStyle = wallColor;
    fpvCtx.fillRect(left, top, halfW * 2, halfH * 2);

    // Brick pattern hint
    fpvCtx.strokeStyle = edgeColor;
    fpvCtx.lineWidth = 1;
    const brickH = halfH * 2 / 4;
    for (let i = 1; i < 4; i++) {
      fpvCtx.beginPath();
      fpvCtx.moveTo(left, top + i * brickH);
      fpvCtx.lineTo(right, top + i * brickH);
      fpvCtx.stroke();
    }
  }

  // Left wall at this depth
  if (cell.walls[leftDir]) {
    fpvCtx.fillStyle = edgeColor;
    // Left side panel
    const outerS = isFar ? 0.55 : 1.0;
    const outerHalfW = (W / 2) * outerS;
    const outerHalfH = (H / 2) * outerS;
    const outerLeft = cx - outerHalfW;
    const outerTop = cy - outerHalfH;
    const outerBottom = cy + outerHalfH;

    fpvCtx.beginPath();
    fpvCtx.moveTo(outerLeft, outerTop);
    fpvCtx.lineTo(left, top);
    fpvCtx.lineTo(left, bottom);
    fpvCtx.lineTo(outerLeft, outerBottom);
    fpvCtx.closePath();
    fpvCtx.fill();
  }

  // Right wall at this depth
  if (cell.walls[rightDir]) {
    fpvCtx.fillStyle = edgeColor;
    const outerS = isFar ? 0.55 : 1.0;
    const outerHalfW = (W / 2) * outerS;
    const outerHalfH = (H / 2) * outerS;
    const outerRight = cx + outerHalfW;
    const outerTop = cy - outerHalfH;
    const outerBottom = cy + outerHalfH;

    fpvCtx.beginPath();
    fpvCtx.moveTo(outerRight, outerTop);
    fpvCtx.lineTo(right, top);
    fpvCtx.lineTo(right, bottom);
    fpvCtx.lineTo(outerRight, outerBottom);
    fpvCtx.closePath();
    fpvCtx.fill();
  }
}

function drawCurrentCellWalls(wallLeft, wallRight, wallForward, W, H) {
  const cx = W / 2;
  const cy = H / 2;

  // Vanishing point scale for the "end" of current cell
  const innerScale = 0.55;
  const innerHalfW = (W / 2) * innerScale;
  const innerHalfH = (H / 2) * innerScale;
  const innerLeft  = cx - innerHalfW;
  const innerRight = cx + innerHalfW;
  const innerTop   = cy - innerHalfH;
  const innerBottom = cy + innerHalfH;

  // Left wall
  if (wallLeft) {
    fpvCtx.fillStyle = '#2a5a5a';
    fpvCtx.beginPath();
    fpvCtx.moveTo(0, 0);
    fpvCtx.lineTo(innerLeft, innerTop);
    fpvCtx.lineTo(innerLeft, innerBottom);
    fpvCtx.lineTo(0, H);
    fpvCtx.closePath();
    fpvCtx.fill();

    // Wall edge line
    fpvCtx.strokeStyle = '#4ecca3';
    fpvCtx.lineWidth = 2;
    fpvCtx.beginPath();
    fpvCtx.moveTo(innerLeft, innerTop);
    fpvCtx.lineTo(innerLeft, innerBottom);
    fpvCtx.stroke();
  } else {
    // Open passage left — draw doorway
    fpvCtx.strokeStyle = '#4ecca3';
    fpvCtx.lineWidth = 2;
    fpvCtx.setLineDash([4, 4]);
    fpvCtx.beginPath();
    fpvCtx.moveTo(0, 0);
    fpvCtx.lineTo(innerLeft, innerTop);
    fpvCtx.moveTo(0, H);
    fpvCtx.lineTo(innerLeft, innerBottom);
    fpvCtx.stroke();
    fpvCtx.setLineDash([]);
  }

  // Right wall
  if (wallRight) {
    fpvCtx.fillStyle = '#2a5a5a';
    fpvCtx.beginPath();
    fpvCtx.moveTo(W, 0);
    fpvCtx.lineTo(innerRight, innerTop);
    fpvCtx.lineTo(innerRight, innerBottom);
    fpvCtx.lineTo(W, H);
    fpvCtx.closePath();
    fpvCtx.fill();

    fpvCtx.strokeStyle = '#4ecca3';
    fpvCtx.lineWidth = 2;
    fpvCtx.beginPath();
    fpvCtx.moveTo(innerRight, innerTop);
    fpvCtx.lineTo(innerRight, innerBottom);
    fpvCtx.stroke();
  } else {
    fpvCtx.strokeStyle = '#4ecca3';
    fpvCtx.lineWidth = 2;
    fpvCtx.setLineDash([4, 4]);
    fpvCtx.beginPath();
    fpvCtx.moveTo(W, 0);
    fpvCtx.lineTo(innerRight, innerTop);
    fpvCtx.moveTo(W, H);
    fpvCtx.lineTo(innerRight, innerBottom);
    fpvCtx.stroke();
    fpvCtx.setLineDash([]);
  }

  // Forward wall (if blocked)
  if (wallForward) {
    // Solid wall ahead
    fpvCtx.fillStyle = '#3a6a6a';
    fpvCtx.fillRect(innerLeft, innerTop, innerHalfW * 2, innerHalfH * 2);

    // Brick pattern
    fpvCtx.strokeStyle = '#2a5050';
    fpvCtx.lineWidth = 1;
    const brickRows = 5;
    const brickH = (innerHalfH * 2) / brickRows;
    for (let i = 1; i < brickRows; i++) {
      fpvCtx.beginPath();
      fpvCtx.moveTo(innerLeft, innerTop + i * brickH);
      fpvCtx.lineTo(innerRight, innerTop + i * brickH);
      fpvCtx.stroke();
    }
    const brickCols = 4;
    const brickW = (innerHalfW * 2) / brickCols;
    for (let row = 0; row < brickRows; row++) {
      const offsetBrick = (row % 2 === 0) ? 0 : brickW / 2;
      for (let col = 1; col < brickCols; col++) {
        const x = innerLeft + col * brickW + offsetBrick;
        if (x > innerLeft && x < innerRight) {
          fpvCtx.beginPath();
          fpvCtx.moveTo(x, innerTop + row * brickH);
          fpvCtx.lineTo(x, innerTop + (row + 1) * brickH);
          fpvCtx.stroke();
        }
      }
    }

    // Border
    fpvCtx.strokeStyle = '#4ecca3';
    fpvCtx.lineWidth = 2;
    fpvCtx.strokeRect(innerLeft, innerTop, innerHalfW * 2, innerHalfH * 2);
  } else {
    // Open corridor ahead — draw floor/ceiling lines converging
    fpvCtx.strokeStyle = '#333';
    fpvCtx.lineWidth = 1;
    fpvCtx.beginPath();
    fpvCtx.moveTo(innerLeft, innerTop);
    fpvCtx.lineTo(innerRight, innerTop);
    fpvCtx.moveTo(innerLeft, innerBottom);
    fpvCtx.lineTo(innerRight, innerBottom);
    fpvCtx.stroke();
  }
}

function drawExitMarker(W, H) {
  const cx = W / 2;
  const cy = H / 2;

  // Glowing exit indicator
  fpvCtx.save();
  fpvCtx.shadowColor = '#ffd700';
  fpvCtx.shadowBlur = 20;
  fpvCtx.fillStyle = '#ffd700';
  fpvCtx.font = 'bold 18px sans-serif';
  fpvCtx.textAlign = 'center';
  fpvCtx.textBaseline = 'middle';
  fpvCtx.fillText('EXIT', cx, cy - 20);

  // Arrow pointing forward
  fpvCtx.beginPath();
  fpvCtx.moveTo(cx, cy);
  fpvCtx.lineTo(cx - 12, cy + 16);
  fpvCtx.lineTo(cx + 12, cy + 16);
  fpvCtx.closePath();
  fpvCtx.fill();
  fpvCtx.restore();
}

// ── Confetti ────────────────────────────────────────────────────────────────
function launchConfetti() {
  const container = document.getElementById('confettiContainer');
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = '';

  const colors = ['#ffd700', '#ff6b6b', '#4ecca3', '#1155cc', '#7d3c98', '#ff9f43', '#ee5a24'];
  const shapes = ['circle', 'square'];

  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    piece.style.left = (Math.random() * 100) + '%';
    piece.style.background = color;
    piece.style.animationDelay = (Math.random() * 2) + 's';
    piece.style.animationDuration = (2 + Math.random() * 2) + 's';
    if (shape === 'circle') piece.style.borderRadius = '50%';
    piece.style.width = (6 + Math.random() * 8) + 'px';
    piece.style.height = piece.style.width;
    container.appendChild(piece);
  }

  setTimeout(() => {
    container.classList.add('hidden');
    container.innerHTML = '';
  }, 5000);
}

// ── Victory sound (Web Audio API) ───────────────────────────────────────────
function playVictorySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.5);
    });
    setTimeout(() => {
      const chord = [523.25, 659.25, 783.99, 1046.50];
      chord.forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1);
      });
    }, 700);
  } catch (e) {
    // Audio not available
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
