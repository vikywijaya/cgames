'use strict';

// ── URL params ────────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const roomId = params.get('room');
const isAutoJoin = (new URLSearchParams(window.location.search)).get('autojoin') === '1';
let _autoJoinHandoff = null;
if (isAutoJoin && roomId) {
  try {
    const _raw = sessionStorage.getItem(`caritahub_pending_join_${roomId}`);
    if (_raw) {
      const _d = JSON.parse(_raw);
      if (_d && _d.name && _d.color && Date.now() - (_d.ts || 0) < 30 * 60 * 1000) {
        _autoJoinHandoff = _d;
      }
    }
  } catch (e) { /* ignore */ }
}


// ── Pipe colors ───────────────────────────────────────────────────────────────
const PIPE_COLOR_MAP = {
  yellow: '#F5A623',
  salmon: '#E8825A',
  blue:   '#4A9DD9',
  green:  '#5BAD6F',
};
const PIPE_HIGHLIGHT_MAP = {
  yellow: '#FFD06B',
  salmon: '#FFB08A',
  blue:   '#7DC4F0',
  green:  '#8BD4A0',
};
const PIPE_SHADOW_MAP = {
  yellow: '#C07A10',
  salmon: '#B85830',
  blue:   '#2E7AB0',
  green:  '#3A8048',
};
const GREY = '#6B7580';
const GREY_HI = '#8A9AA8';
const GREY_SH = '#4A5560';

const SHAPE_OPENINGS = {
  end:      [0],
  straight: [0, 2],
  corner:   [0, 1],
  tee:      [0, 1, 2],
  cross:    [0, 1, 2, 3],
};

function getOpenings(shape, rotation) {
  return (SHAPE_OPENINGS[shape] || []).map(d => (d + rotation) % 4);
}

// ── State ─────────────────────────────────────────────────────────────────────
let myColor = _autoJoinHandoff ? _autoJoinHandoff.color : null;
let mySeat = (_autoJoinHandoff ? (['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) > 0 ? ['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) - 1 : -1) : -1);
let myName = _autoJoinHandoff ? _autoJoinHandoff.name : '';
let gameState = null;
let isSolved  = false;

const TV_PIPE_PUZZLE_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_PIPE_PUZZLE_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const joinScreen       = document.getElementById('joinScreen');
const waitingScreen    = document.getElementById('waitingScreen');
const playingScreen    = document.getElementById('playingScreen');
const gameoverScreen   = document.getElementById('gameoverScreen');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const nameInput    = document.getElementById('nameInput');
const joinBtn      = document.getElementById('joinBtn');
const joinError    = document.getElementById('joinError');
const waitingName  = document.getElementById('waitingName');
const gameHint     = document.getElementById('gameHint');
const colorDots    = document.getElementById('colorDots');
const pipeGrid     = document.getElementById('pipeGrid');
const solvedOverlay = document.getElementById('solvedOverlay');

const gameoverEmoji    = document.getElementById('gameoverEmoji');
const gameoverTitle    = document.getElementById('gameoverTitle');
const gameoverPersonal = document.getElementById('gameoverPersonal');
const gameoverMsg      = document.getElementById('gameoverMsg');

// ── Socket ────────────────────────────────────────────────────────────────────
const socket = io({
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

// ── Autojoin: jump straight to waiting screen ──────────────────────────────
if (_autoJoinHandoff) {
  if (typeof waitingName !== 'undefined' && waitingName) waitingName.textContent = `You joined as ${myName}`;
  showScreen('waiting');
}

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  if (myName && roomId) {
    socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-pipe-puzzle', reconnect: true });
  }
});
socket.on('disconnect', () => reconnectOverlay.classList.remove('hidden'));
socket.on('connect_error', () => reconnectOverlay.classList.remove('hidden'));

// ── Join ──────────────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = nameInput.value.trim();
  if (!name) { joinError.textContent = 'Please enter your name.'; return; }
  if (!roomId) { joinError.textContent = 'No room ID. Please scan the QR code.'; return; }
  myName = name;
  joinError.textContent = '';
  joinBtn.disabled = true;
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-pipe-puzzle' });
}

socket.on('joined', ({ color }) => {
  myColor = color;
  mySeat = seatForColor(color);
  if (color === 'spectator' || color === 'tv-host') {
    joinError.textContent = 'Game is full. You joined as a spectator.';
    joinBtn.disabled = false;
    return;
  }
  waitingName.textContent = myName;
  showScreen('waiting');
});

socket.on('room_update', () => {});

// ── Game started / state ──────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-pipe-puzzle') return;
  gameState = state;
  isSolved = false;
  if (solvedOverlay) solvedOverlay.classList.add('hidden');
  showScreen('playing');
  renderGrid(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-pipe-puzzle') return;
  // Reset when a new round starts
  if (gameState && state.currentRound !== gameState.currentRound) {
    isSolved = false;
    if (solvedOverlay) solvedOverlay.classList.add('hidden');
    if (roundCountdownTimer) clearInterval(roundCountdownTimer);
  }
  gameState = state;
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  renderGrid(state);
});

// ── Round over ────────────────────────────────────────────────────────────────
let roundCountdownTimer = null;

socket.on('round_over', ({ currentRound, totalRounds, players, nextRoundIn }) => {
  isSolved = false;
  const myData = players ? players.find(p => p.name === myName) : null;
  const pts = myData ? myData.score : 0;
  const isLastRound = currentRound + 1 >= totalRounds;

  // Show round transition overlay
  if (solvedOverlay) {
    solvedOverlay.classList.remove('hidden');
    const emoji = solvedOverlay.querySelector('.solved-emoji');
    const title = solvedOverlay.querySelector('.solved-title');
    const sub = solvedOverlay.querySelector('.solved-sub');
    if (emoji) emoji.textContent = isLastRound ? '🏁' : '👏';
    if (title) title.textContent = `Round ${currentRound + 1} complete!`;
    if (sub) sub.textContent = `You have ${pts} pts`;

    if (!isLastRound) {
      let countdown = nextRoundIn || 5;
      if (gameHint) gameHint.textContent = `Next round in ${countdown}s...`;
      if (roundCountdownTimer) clearInterval(roundCountdownTimer);
      roundCountdownTimer = setInterval(function() {
        countdown--;
        if (countdown <= 0) {
          clearInterval(roundCountdownTimer);
          if (gameHint) gameHint.textContent = 'Get ready!';
          if (sub) sub.textContent = 'Next round starting...';
        } else {
          if (gameHint) gameHint.textContent = `Next round in ${countdown}s...`;
          if (sub) sub.textContent = `${pts} pts — next round in ${countdown}s`;
        }
      }, 1000);
    } else {
      if (gameHint) gameHint.textContent = 'Final round done!';
    }
  }
});

// ── Game over ─────────────────────────────────────────────────────────────────
socket.on('game_over', ({ winner, players, reason }) => {
  if (solvedOverlay) solvedOverlay.classList.add('hidden');
  const didWin = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const myScore = myData ? myData.score : (gameState && gameState.sessionScores && mySeat >= 0 ? gameState.sessionScores[mySeat] : 0);
  gameoverEmoji.textContent = didWin ? '🏆' : '🎯';
  gameoverTitle.textContent = didWin ? 'You Win!' : 'Game Over!';
  gameoverPersonal.textContent = `Your score: ${myScore} pts`;
  gameoverMsg.textContent = reason || '';
  showScreen('gameover');
});

socket.on('play_again', () => {
  gameState = null;
  isSolved = false;
  if (solvedOverlay) solvedOverlay.classList.add('hidden');
  if (pipeGrid) pipeGrid.innerHTML = '';
  showScreen('waiting');
});

socket.on('error', ({ message }) => {
  joinError.textContent = message;
  joinBtn.disabled = false;
});

// ── Screen switching ──────────────────────────────────────────────────────────
function showScreen(name) {
  [joinScreen, waitingScreen, playingScreen, gameoverScreen].forEach(s => s && s.classList.remove('active'));
  if (name === 'join')     joinScreen.classList.add('active');
  if (name === 'waiting')  waitingScreen.classList.add('active');
  if (name === 'playing')  playingScreen.classList.add('active');
  if (name === 'gameover') gameoverScreen.classList.add('active');
}

// ── Render grid ───────────────────────────────────────────────────────────────
function renderGrid(state) {
  if (mySeat < 0 || !state.grids) return;
  const { grids, solved, colorPairs, rows, cols, numColors, currentRound, totalRounds } = state;
  const grid = grids[mySeat];
  if (!grid) return;

  const mySolvedNow = solved && solved[mySeat];

  // Compute connected colors
  const connectedColors = computeConnectedColors(grid, rows, cols, colorPairs);
  const connCount = connectedColors.size;

  // Update hint
  const roundInfo = `Round ${currentRound + 1}/${totalRounds} · `;
  gameHint.textContent = mySolvedNow
    ? '✓ All pipes connected!'
    : `${roundInfo}${connCount}/${numColors} pipes — tap to rotate`;

  // Solved overlay
  if (mySolvedNow && !isSolved) {
    isSolved = true;
    if (solvedOverlay) solvedOverlay.classList.remove('hidden');
  }

  // Color dots
  renderColorDots(colorPairs, connectedColors);

  // Tile size
  const screenW = window.innerWidth - 32;
  const tileSize = Math.max(52, Math.min(80, Math.floor(screenW / cols) - 2));

  // Rebuild grid when round changes or grid size changes
  const existingTiles = pipeGrid.querySelectorAll('.pipe-tile');
  const lastRound = pipeGrid.dataset.round;
  const needsRebuild = existingTiles.length !== rows * cols || lastRound !== String(currentRound);
  pipeGrid.style.gridTemplateColumns = `repeat(${cols}, ${tileSize}px)`;
  pipeGrid.dataset.round = currentRound;

  if (needsRebuild) {
    pipeGrid.innerHTML = '';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = document.createElement('div');
        tile.className = 'pipe-tile';
        tile.dataset.r = r;
        tile.dataset.c = c;
        tile.style.width = tileSize + 'px';
        tile.style.height = tileSize + 'px';
        const cell = grid[r][c];
        if (cell && !cell.isEndpoint) {
          tile.addEventListener('click', onTileTap);
        } else if (cell && cell.isEndpoint) {
          tile.classList.add('pipe-tile-endpoint');
        }
        pipeGrid.appendChild(tile);
      }
    }
  }

  // Update tile SVGs
  let idx = 0;
  const tiles = pipeGrid.querySelectorAll('.pipe-tile');
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = tiles[idx++];
      if (!tile) continue;
      tile.style.width = tileSize + 'px';
      tile.style.height = tileSize + 'px';
      const cell = grid[r][c];
      if (cell) {
        const isConn = cell.colorId && connectedColors.has(cell.colorId);
        tile.innerHTML = renderPipeSVG(cell.shape, cell.currentRotation, cell.colorId, cell.isEndpoint, isConn || mySolvedNow, tileSize);
        tile.classList.toggle('pipe-tile-solved', !!mySolvedNow);
      } else {
        tile.innerHTML = '';
        tile.classList.add('pipe-tile-empty');
      }
    }
  }
}

// ── Tap to rotate ─────────────────────────────────────────────────────────────
function onTileTap(e) {
  if (isSolved) return;
  const tile = e.currentTarget;
  const r = parseInt(tile.dataset.r, 10);
  const c = parseInt(tile.dataset.c, 10);

  // Optimistic rotation
  if (gameState && gameState.grids && gameState.grids[mySeat]) {
    const cell = gameState.grids[mySeat][r] && gameState.grids[mySeat][r][c];
    if (cell && !cell.isEndpoint) {
      cell.currentRotation = (cell.currentRotation + 1) % 4;
      const { rows, cols, colorPairs } = gameState;
      const tileSize = parseInt(tile.style.width, 10) || 52;
      const connectedColors = computeConnectedColors(gameState.grids[mySeat], rows, cols, colorPairs);
      const isConn = cell.colorId && connectedColors.has(cell.colorId);
      tile.innerHTML = renderPipeSVG(cell.shape, cell.currentRotation, cell.colorId, cell.isEndpoint, isConn, tileSize);
      // Update dots
      renderColorDots(colorPairs, connectedColors);
    }
  }

  socket.emit('tv_pipe_rotate', { row: r, col: c });
}

// ── Color progress dots ───────────────────────────────────────────────────────
function renderColorDots(colorPairs, connectedColors) {
  if (!colorPairs || !colorDots) return;
  colorDots.innerHTML = '';
  colorPairs.forEach(cp => {
    const isConn = connectedColors.has(cp.colorId);
    const color = PIPE_COLOR_MAP[cp.colorId] || GREY;
    const item = document.createElement('div');
    item.className = 'color-dot-item' + (isConn ? ' connected' : '');
    item.innerHTML = `
      <div class="color-dot-circle" style="background:${color};opacity:${isConn ? 1 : 0.35}"></div>
      <span style="color:${isConn ? color : '#778'};font-size:13px;">${isConn ? '✓' : '○'}</span>
    `;
    colorDots.appendChild(item);
  });
}

// ── SVG pipe rendering — 3D metallic style ──────────────────────────────────
function renderPipeSVG(shape, rotation, colorId, isEndpoint, connected, size) {
  const VB = 60;
  const HALF = 30;
  const PIPE_W = 14;
  const PIPE_W_INNER = 10;
  const BULB_R = 12;
  const BULB_GLOW = 18;

  const opens = getOpenings(shape, rotation);
  const hasN = opens.includes(0);
  const hasE = opens.includes(1);
  const hasS = opens.includes(2);
  const hasW = opens.includes(3);

  const color = connected ? (PIPE_COLOR_MAP[colorId] || GREY) : GREY;
  const hi = connected ? (PIPE_HIGHLIGHT_MAP[colorId] || GREY_HI) : GREY_HI;
  const sh = connected ? (PIPE_SHADOW_MAP[colorId] || GREY_SH) : GREY_SH;

  const uid = 'p' + Math.random().toString(36).slice(2, 8);

  const isCorner = opens.length === 2 && !((hasN && hasS) || (hasE && hasW));

  let pathD = '';
  if (isCorner) {
    if (hasN && hasE)      pathD = `M${HALF},0 A${HALF},${HALF} 0 0,0 ${VB},${HALF}`;
    else if (hasE && hasS) pathD = `M${VB},${HALF} A${HALF},${HALF} 0 0,0 ${HALF},${VB}`;
    else if (hasS && hasW) pathD = `M${HALF},${VB} A${HALF},${HALF} 0 0,0 0,${HALF}`;
    else if (hasW && hasN) pathD = `M0,${HALF} A${HALF},${HALF} 0 0,0 ${HALF},0`;
  } else {
    const segs = [];
    if (hasN) segs.push(`M${HALF},0 L${HALF},${HALF}`);
    if (hasE) segs.push(`M${VB},${HALF} L${HALF},${HALF}`);
    if (hasS) segs.push(`M${HALF},${VB} L${HALF},${HALF}`);
    if (hasW) segs.push(`M0,${HALF} L${HALF},${HALF}`);
    pathD = segs.join(' ');
  }

  let defs = `<defs>`;
  defs += `<linearGradient id="${uid}g" x1="0" y1="0" x2="0" y2="1">`;
  defs += `<stop offset="0%" stop-color="${hi}"/>`;
  defs += `<stop offset="45%" stop-color="${color}"/>`;
  defs += `<stop offset="100%" stop-color="${sh}"/>`;
  defs += `</linearGradient>`;
  if (connected) {
    defs += `<filter id="${uid}f"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  }
  defs += `</defs>`;

  let svg = defs;
  svg += `<path d="${pathD}" stroke="${sh}" stroke-width="${PIPE_W + 2}" stroke-linecap="round" fill="none" opacity="0.5"/>`;
  svg += `<path d="${pathD}" stroke="url(#${uid}g)" stroke-width="${PIPE_W}" stroke-linecap="round" fill="none"/>`;
  svg += `<path d="${pathD}" stroke="${hi}" stroke-width="${PIPE_W_INNER - 4}" stroke-linecap="round" fill="none" opacity="0.2"/>`;

  if (isEndpoint && colorId) {
    const epColor = connected ? (PIPE_COLOR_MAP[colorId] || GREY) : GREY;
    const epHi = connected ? (PIPE_HIGHLIGHT_MAP[colorId] || GREY_HI) : GREY_HI;
    svg += `<circle cx="${HALF}" cy="${HALF}" r="${BULB_GLOW}" fill="${epColor}" opacity="0.25"${connected ? ` filter="url(#${uid}f)"` : ''}/>`;
    svg += `<defs><radialGradient id="${uid}b" cx="40%" cy="35%" r="55%">`;
    svg += `<stop offset="0%" stop-color="${epHi}"/>`;
    svg += `<stop offset="70%" stop-color="${epColor}"/>`;
    svg += `<stop offset="100%" stop-color="${sh}"/>`;
    svg += `</radialGradient></defs>`;
    svg += `<circle cx="${HALF}" cy="${HALF}" r="${BULB_R}" fill="url(#${uid}b)" stroke="${sh}" stroke-width="1.5"/>`;
    svg += `<ellipse cx="${HALF - 3}" cy="${HALF - 4}" rx="4" ry="3" fill="white" opacity="0.5"/>`;
  }

  return `<svg viewBox="0 0 ${VB} ${VB}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}

// ── Connectivity check (mirrors engine isConnected) ───────────────────────────
const _DR = [-1, 0, 1, 0];
const _DC = [0, 1, 0, -1];

function computeConnectedColors(grid, rows, cols, colorPairs) {
  const connected = new Set();
  if (!grid || !colorPairs) return connected;

  for (const cp of colorPairs) {
    const [[r1, c1], [r2, c2]] = cp.endpoints;
    if (isConnectedBFS(grid, r1, c1, r2, c2, rows, cols)) connected.add(cp.colorId);
  }
  return connected;
}

function isConnectedBFS(grid, r1, c1, r2, c2, rows, cols) {
  const visited = new Set([`${r1},${c1}`]);
  const queue = [[r1, c1]];
  while (queue.length) {
    const [r, c] = queue.shift();
    if (r === r2 && c === c2) return true;
    const cell = grid[r] && grid[r][c];
    if (!cell) continue;
    for (const d of getOpenings(cell.shape, cell.currentRotation)) {
      const nr = r + _DR[d];
      const nc = c + _DC[d];
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      const nb = grid[nr] && grid[nr][nc];
      if (!nb) continue;
      if (!getOpenings(nb.shape, nb.currentRotation).includes((d + 2) % 4)) continue;
      const k = `${nr},${nc}`;
      if (!visited.has(k)) { visited.add(k); queue.push([nr, nc]); }
    }
  }
  return false;
}
