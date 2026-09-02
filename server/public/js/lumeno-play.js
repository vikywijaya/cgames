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


// ── State ─────────────────────────────────────────────────────────────────────
let myColor  = null;
let mySeat = (_autoJoinHandoff ? (['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) > 0 ? ['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) - 1 : -1) : -1);
let myName = _autoJoinHandoff ? _autoJoinHandoff.name : '';
let gameState = null;
let isFinished = false;

// Drag-to-connect path state
let dragPath      = [];    // [{row, col}, ...]
let dragColor     = null;  // color of the current drag chain
let isDragging    = false;
let prevGrid      = null;  // for drop animation detection

const TV_LUMENO_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

function seatForColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_LUMENO_COLORS.indexOf(color);
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
const movesLeftEl  = document.getElementById('movesLeft');
const scoreEl      = document.getElementById('scoreDisplay');
const sessionScoreEl = document.getElementById('sessionScore');
const chainIndicator = document.getElementById('chainIndicator');
const chainLengthEl  = document.getElementById('chainLength');
const chainPointsEl  = document.getElementById('chainPoints');
const orbGrid       = document.getElementById('orbGrid');
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
    socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-lumeno', reconnect: true });
  }
});
socket.on('disconnect', () => reconnectOverlay.classList.remove('hidden'));
socket.on('connect_error', () => reconnectOverlay.classList.remove('hidden'));

// ── Join handlers ─────────────────────────────────────────────────────────────
joinBtn.addEventListener('click', doJoin);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });

function doJoin() {
  const name = nameInput.value.trim();
  if (!name) { joinError.textContent = 'Please enter your name.'; return; }
  if (!roomId) { joinError.textContent = 'No room ID. Please scan the QR code.'; return; }
  myName = name;
  joinError.textContent = '';
  joinBtn.disabled = true;
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-lumeno' });
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

// ── Game started / state update ───────────────────────────────────────────────
socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-lumeno') return;
  gameState = state;
  isFinished = false;
  prevGrid = null;
  solvedOverlay.classList.add('hidden');
  showScreen('playing');
  renderAll();
  if (typeof sfx !== 'undefined') sfx.gameStart();
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-lumeno') return;
  var wasFinished = isFinished;
  gameState = state;
  if (mySeat >= 0) {
    isFinished = state.finished[mySeat] || false;
    if (isFinished && !wasFinished) {
      solvedOverlay.classList.remove('hidden');
      if (typeof sfx !== 'undefined') sfx.movesDone();
    }
  }
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  renderAll();
});

// ── Round over ────────────────────────────────────────────────────────────────
socket.on('round_over', ({ currentRound, totalRounds, players, nextRoundIn }) => {
  // Reset local drag state for next round
  dragPath = [];
  dragColor = null;
  isDragging = false;
  isFinished = false;
  solvedOverlay.classList.add('hidden');
  updateChainIndicator();

  if (gameHint) {
    const myEntry = players && players.find(p => p.name === myName);
    const pts = myEntry ? myEntry.score : 0;
    gameHint.textContent = `Round ${currentRound + 1}/${totalRounds} done! You have ${pts} pts. Next round in ${nextRoundIn}s…`;
  }
});

// ── Game over ─────────────────────────────────────────────────────────────────
socket.on('game_over', ({ winner, players, reason }) => {
  if (typeof sfx !== 'undefined') sfx.victory();
  const isWinner = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const myScore = myData ? myData.score : 0;
  gameoverEmoji.textContent = isWinner ? '🏆' : '😊';
  gameoverTitle.textContent = isWinner ? 'You Win!' : 'Game Over';
  gameoverPersonal.textContent = isWinner ? `You won with ${myScore} pts!` : `${winner} wins!`;
  gameoverMsg.textContent = reason || '';
  showScreen('gameover');
});

socket.on('play_again', () => {
  gameState = null;
  showScreen('waiting');
});

socket.on('error', ({ message }) => {
  joinError.textContent = message;
  joinBtn.disabled = false;
});

// ── Render ────────────────────────────────────────────────────────────────────
function renderAll() {
  if (!gameState || mySeat < 0) return;
  const state = gameState;

  movesLeftEl.textContent  = state.movesLeft[mySeat];
  scoreEl.textContent      = state.scores[mySeat] || 0;
  sessionScoreEl.textContent = state.sessionScores[mySeat] || 0;

  if (!isFinished) {
    updateHint();
  }

  renderOrbGrid();
}

function renderOrbGrid() {
  if (!gameState || mySeat < 0) return;
  const { grids, rows, cols } = gameState;
  const grid = grids[mySeat];
  if (!grid) return;

  // Detect which cells changed (for drop animation)
  var dropCells = {};
  if (prevGrid && !isDragging) {
    for (var c = 0; c < cols; c++) {
      // Count how many cells in this column changed from top
      var dropDist = 0;
      for (var r = 0; r < rows; r++) {
        var oldColor = prevGrid[r] && prevGrid[r][c];
        var newColor = grid[r][c];
        if (oldColor !== newColor) dropDist++;
      }
      if (dropDist > 0) {
        // Mark top `dropDist` cells as newly dropped
        for (var r2 = 0; r2 < dropDist && r2 < rows; r2++) {
          dropCells[r2 + ',' + c] = dropDist - r2;
        }
      }
    }
  }

  orbGrid.innerHTML = '';
  orbGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  orbGrid.style.gridTemplateRows    = `repeat(${rows}, 1fr)`;

  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var color = grid[r][c];
      var orb = document.createElement('div');
      orb.className = 'orb orb-' + color;
      orb.dataset.row = r;
      orb.dataset.col = c;

      // Highlight if in current drag path
      var inPath = dragPath.some(function(p) { return p.row === r && p.col === c; });
      if (inPath) orb.classList.add('orb-selected');

      // Drop animation for newly fallen orbs
      var dk = r + ',' + c;
      if (dropCells[dk]) {
        orb.classList.add('orb-drop');
        orb.style.animationDelay = (c * 20) + 'ms';
      }

      orbGrid.appendChild(orb);
    }
  }

  // Play drop sound if orbs fell
  if (Object.keys(dropCells).length > 0 && typeof sfx !== 'undefined') {
    setTimeout(function() { sfx.orbDrop(); }, 150);
  }

  prevGrid = grid.map(function(row) { return row.slice(); });
}

function updateHint() {
  if (isFinished) { gameHint.textContent = 'Waiting for others...'; return; }
  if (isDragging && dragPath.length > 0) {
    gameHint.textContent = dragPath.length + ' orbs — release to clear';
  } else {
    gameHint.textContent = 'Drag 3+ same-color orbs';
  }
}

function updateChainIndicator() {
  if (dragPath.length >= 3) {
    chainIndicator.classList.remove('hidden');
    chainLengthEl.textContent = dragPath.length;
    chainPointsEl.textContent = dragPath.length * dragPath.length;
  } else {
    chainIndicator.classList.add('hidden');
  }
}

// ── Pointer/Touch drag-to-connect ─────────────────────────────────────────────
function getOrbAtPoint(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || !el.classList.contains('orb')) return null;
  return { row: parseInt(el.dataset.row, 10), col: parseInt(el.dataset.col, 10), el };
}

function isAdjacentToLast(row, col) {
  if (dragPath.length === 0) return true;
  const last = dragPath[dragPath.length - 1];
  return Math.abs(row - last.row) <= 1 && Math.abs(col - last.col) <= 1 &&
         !(row === last.row && col === last.col);
}

function isInPath(row, col) {
  return dragPath.some(p => p.row === row && p.col === col);
}

orbGrid.addEventListener('pointerdown', (e) => {
  if (isFinished) return;
  e.preventDefault();
  const hit = getOrbAtPoint(e.clientX, e.clientY);
  if (!hit) return;

  const { grids, rows, cols } = gameState;
  const color = grids[mySeat][hit.row][hit.col];

  isDragging = true;
  dragColor  = color;
  dragPath   = [{ row: hit.row, col: hit.col }];
  renderOrbGrid();
  updateHint();
  updateChainIndicator();
  orbGrid.setPointerCapture(e.pointerId);
});

orbGrid.addEventListener('pointermove', (e) => {
  if (!isDragging || isFinished) return;
  e.preventDefault();
  const hit = getOrbAtPoint(e.clientX, e.clientY);
  if (!hit) return;

  const { grids } = gameState;
  const color = grids[mySeat][hit.row][hit.col];

  // If the cell is already second-to-last (backtracking), remove last
  if (dragPath.length >= 2) {
    const secondToLast = dragPath[dragPath.length - 2];
    if (secondToLast.row === hit.row && secondToLast.col === hit.col) {
      dragPath.pop();
      renderOrbGrid();
      updateHint();
      updateChainIndicator();
      return;
    }
  }

  // Add cell if same color, adjacent to last, not already in path
  if (color === dragColor && isAdjacentToLast(hit.row, hit.col) && !isInPath(hit.row, hit.col)) {
    dragPath.push({ row: hit.row, col: hit.col });
    if (typeof sfx !== 'undefined') sfx.orbSelect(dragPath.length);
    renderOrbGrid();
    updateHint();
    updateChainIndicator();
  }
});

orbGrid.addEventListener('pointerup', (e) => {
  if (!isDragging) return;
  e.preventDefault();
  commitChain();
});

orbGrid.addEventListener('pointercancel', (e) => {
  if (!isDragging) return;
  isDragging = false;
  dragPath = [];
  dragColor = null;
  renderOrbGrid();
  updateChainIndicator();
});

function commitChain() {
  isDragging = false;

  if (dragPath.length >= 3) {
    if (typeof sfx !== 'undefined') sfx.orbClear(dragPath.length);
    socket.emit('tv_lumeno_clear', { cells: dragPath.slice() });
  } else if (dragPath.length > 0) {
    if (typeof sfx !== 'undefined') sfx.chainReject();
  }

  dragPath  = [];
  dragColor = null;
  renderOrbGrid();
  updateHint();
  updateChainIndicator();
}

// ── Screen switching ──────────────────────────────────────────────────────────
function showScreen(name) {
  joinScreen.classList.remove('active');
  waitingScreen.classList.remove('active');
  playingScreen.classList.remove('active');
  gameoverScreen.classList.remove('active');
  if (name === 'join')     joinScreen.classList.add('active');
  if (name === 'waiting')  waitingScreen.classList.add('active');
  if (name === 'playing')  playingScreen.classList.add('active');
  if (name === 'gameover') gameoverScreen.classList.add('active');
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
