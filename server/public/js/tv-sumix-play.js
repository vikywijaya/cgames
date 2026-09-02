'use strict';

// ── State ────────────────────────────────────────────────────────────────────
const urlParams = new URLSearchParams(window.location.search);
const roomIdFromUrl = urlParams.get('room');
const isAutoJoin = (new URLSearchParams(window.location.search)).get('autojoin') === '1';
let _autoJoinHandoff = null;
if (isAutoJoin && roomIdFromUrl) {
  try {
    const _raw = sessionStorage.getItem(`caritahub_pending_join_${roomIdFromUrl}`);
    if (_raw) {
      const _d = JSON.parse(_raw);
      if (_d && _d.name && _d.color && Date.now() - (_d.ts || 0) < 30 * 60 * 1000) {
        _autoJoinHandoff = _d;
      }
    }
  } catch (e) { /* ignore */ }
}


let myRoomId = roomIdFromUrl;
let mySeat = (_autoJoinHandoff ? (['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) > 0 ? ['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) - 1 : -1) : -1);
let myColor = _autoJoinHandoff ? _autoJoinHandoff.color : null;
let myName = _autoJoinHandoff ? _autoJoinHandoff.name : '';
let gridSize = 3;
let gameActive = false;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const joinScreen     = document.getElementById('joinScreen');
const waitingScreen  = document.getElementById('waitingScreen');
const playingScreen  = document.getElementById('playingScreen');
const gameoverScreen = document.getElementById('gameoverScreen');
const nameInput      = document.getElementById('nameInput');
const joinBtn        = document.getElementById('joinBtn');
const waitingPlayers = document.getElementById('waitingPlayers');
const playHeader     = document.getElementById('playHeader');
const playProgress   = document.getElementById('playProgress');
const gridTableEl    = document.getElementById('gridTable');

// ── Socket ───────────────────────────────────────────────────────────────────
const socket = io({
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

// ── Autojoin: jump straight to waiting screen ──────────────────────────────
if (_autoJoinHandoff) {
  showScreen(waitingScreen);
}

// ── Screen switching ─────────────────────────────────────────────────────────
function showScreen(screen) {
  [joinScreen, waitingScreen, playingScreen, gameoverScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// ── Join flow ────────────────────────────────────────────────────────────────
nameInput.addEventListener('input', () => {
  joinBtn.disabled = nameInput.value.trim().length === 0;
});

joinBtn.addEventListener('click', () => {
  const name = nameInput.value.trim();
  if (!name) return;
  myName = name;
  joinBtn.disabled = true;
  socket.emit('join_game', {
    roomId: myRoomId,
    playerName: name,
    gameType: 'tv-sumix'
  });
});

nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !joinBtn.disabled) joinBtn.click();
});

// ── Socket events ────────────────────────────────────────────────────────────
socket.on('connect', () => {
  const session = loadSession();
  if (session && session.roomId) {
    myRoomId = session.roomId;
    myName = session.name;
    myColor = session.color;
    mySeat = session.seat;
    socket.emit('join_game', {
      roomId: myRoomId,
      playerName: myName,
      gameType: 'tv-sumix',
      reconnect: true
    });
  } else if (_autoJoinHandoff && myRoomId && myName) {
    socket.emit('join_game', {
      roomId: myRoomId,
      playerName: myName,
      gameType: 'tv-sumix',
      reconnect: true
    });
  }
});

socket.on('joined', ({ roomId, color }) => {
  myRoomId = roomId;
  myColor = color;
  if (color !== 'tv-host') {
    const idx = ['p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(color);
    mySeat = idx >= 0 ? idx : -1;
  }
  saveSession();
  showScreen(waitingScreen);
});

socket.on('room_update', ({ players }) => {
  const phonePlayers = players.filter(p => p.color !== 'tv-host');
  waitingPlayers.textContent = phonePlayers.map(p => p.name).join(', ');
});

socket.on('game_started', (state) => {
  gameActive = true;
  gridSize = state.gridSize;
  const modeLabels = { easy: 'Easy 3\u00d73', medium: 'Medium 4\u00d74', hard: 'Hard 5\u00d75' };
  playHeader.textContent = 'Sumix \u2014 ' + (modeLabels[state.mode] || modeLabels.easy);
  showScreen(playingScreen);
  buildGrid(state);
  updateGrid(state);
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-sumix') return;
  if (mySeat < 0 || mySeat >= state.playerCount) return;
  gameActive = !state.isGameOver;
  if (!playingScreen.classList.contains('active') && !gameoverScreen.classList.contains('active')) {
    const modeLabels = { easy: 'Easy 3\u00d73', medium: 'Medium 4\u00d74', hard: 'Hard 5\u00d75' };
    playHeader.textContent = 'Sumix \u2014 ' + (modeLabels[state.mode] || modeLabels.easy);
    showScreen(playingScreen);
    buildGrid(state);
  }
  updateGrid(state);
});

socket.on('game_over', ({ winner, reason }) => {
  gameActive = false;
  const goEmoji = document.getElementById('goEmoji');
  const goTitle = document.getElementById('goTitle');
  const goReason = document.getElementById('goReason');

  if (winner === myName) {
    goEmoji.textContent = '\uD83C\uDFC6';
    goTitle.textContent = 'YOU WIN!';
    goTitle.className = 'gameover-title won';
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
  } else {
    goEmoji.textContent = '\uD83E\uDDE9';
    goTitle.textContent = 'Puzzle Solved!';
    goTitle.className = 'gameover-title lost';
  }
  goReason.textContent = reason || '';
  showScreen(gameoverScreen);
});

socket.on('play_again', () => {
  gameActive = false;
  showScreen(waitingScreen);
});

socket.on('error', ({ message }) => { console.error('Server error:', message); });

// ── Build grid table ─────────────────────────────────────────────────────────
let currentGrid = [];
let currentRowTargets = [];
let currentColTargets = [];

function buildGrid(state) {
  gridSize = state.gridSize;
  currentGrid = state.grid;
  currentRowTargets = state.rowTargets;
  currentColTargets = state.colTargets;
  gridTableEl.innerHTML = '';

  // Column targets row (top)
  const topTr = document.createElement('tr');
  const topCorner = document.createElement('td');
  topCorner.className = 'corner-cell';
  topTr.appendChild(topCorner);
  for (let c = 0; c < gridSize; c++) {
    const td = document.createElement('td');
    td.className = 'target-col-cell';
    td.textContent = state.colTargets[c];
    td.dataset.colTarget = c;
    topTr.appendChild(td);
  }
  const topCorner2 = document.createElement('td');
  topCorner2.className = 'corner-cell';
  topTr.appendChild(topCorner2);
  gridTableEl.appendChild(topTr);

  // Grid rows with row targets on left
  for (let r = 0; r < gridSize; r++) {
    const tr = document.createElement('tr');

    // Row target (left)
    const ltd = document.createElement('td');
    ltd.className = 'target-row-cell';
    ltd.textContent = state.rowTargets[r];
    ltd.dataset.rowTarget = r;
    tr.appendChild(ltd);

    for (let c = 0; c < gridSize; c++) {
      const td = document.createElement('td');
      td.className = 'grid-cell';
      td.textContent = state.grid[r][c];
      td.dataset.row = r;
      td.dataset.col = c;
      td.addEventListener('click', () => toggleCell(r, c));
      tr.appendChild(td);
    }

    // Row target (right) — shows current sum
    const rtd = document.createElement('td');
    rtd.className = 'row-sum-cell';
    rtd.dataset.rowSum = r;
    tr.appendChild(rtd);

    gridTableEl.appendChild(tr);
  }

  // Column sums row (bottom)
  const botTr = document.createElement('tr');
  const botCorner = document.createElement('td');
  botCorner.className = 'corner-cell';
  botTr.appendChild(botCorner);
  for (let c = 0; c < gridSize; c++) {
    const td = document.createElement('td');
    td.className = 'col-sum-cell';
    td.dataset.colSum = c;
    botTr.appendChild(td);
  }
  const botCorner2 = document.createElement('td');
  botCorner2.className = 'corner-cell';
  botTr.appendChild(botCorner2);
  gridTableEl.appendChild(botTr);
}

// ── Update grid with current state ───────────────────────────────────────────
function updateGrid(state) {
  if (mySeat < 0) return;
  const mask = state.playerMasks[mySeat];
  const cRows = state.correctRows[mySeat];
  const cCols = state.correctCols[mySeat];
  const grid = state.grid;

  // Update cells
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const td = gridTableEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`);
      if (!td) continue;
      td.className = 'grid-cell';
      if (mask[r][c]) {
        td.classList.add('active');
      }
      // Highlight row/col correct
      if (cRows[r] && cCols[c]) td.classList.add('both-correct');
      else if (cRows[r]) td.classList.add('row-correct');
      else if (cCols[c]) td.classList.add('col-correct');
    }
  }

  // Compute and show remaining (target - sum) for rows
  for (let r = 0; r < gridSize; r++) {
    let sum = 0;
    for (let c = 0; c < gridSize; c++) {
      if (mask[r][c]) sum += grid[r][c];
    }
    const remaining = currentRowTargets[r] - sum;
    const el = gridTableEl.querySelector(`td[data-row-sum="${r}"]`);
    if (el) {
      el.textContent = remaining;
      el.className = 'row-sum-cell' + (cRows[r] ? ' correct' : (remaining < 0 ? ' over' : ''));
    }
    // Update left target highlight
    const ltarget = gridTableEl.querySelector(`td[data-row-target="${r}"]`);
    if (ltarget) ltarget.className = 'target-row-cell' + (cRows[r] ? ' correct' : '');
  }

  // Compute and show remaining (target - sum) for columns
  for (let c = 0; c < gridSize; c++) {
    let sum = 0;
    for (let r = 0; r < gridSize; r++) {
      if (mask[r][c]) sum += grid[r][c];
    }
    const remaining = currentColTargets[c] - sum;
    const el = gridTableEl.querySelector(`td[data-col-sum="${c}"]`);
    if (el) {
      el.textContent = remaining;
      el.className = 'col-sum-cell' + (cCols[c] ? ' correct' : (remaining < 0 ? ' over' : ''));
    }
    // Update top target highlight
    const ttarget = gridTableEl.querySelector(`td[data-col-target="${c}"]`);
    if (ttarget) ttarget.className = 'target-col-cell' + (cCols[c] ? ' correct' : '');
  }

  // Progress
  const correctCount = cRows.filter(Boolean).length + cCols.filter(Boolean).length;
  playProgress.textContent = `${correctCount} / ${gridSize * 2} sums correct`;
}

// ── Toggle cell ──────────────────────────────────────────────────────────────
function toggleCell(row, col) {
  if (!gameActive) return;
  if (navigator.vibrate) navigator.vibrate(15);
  socket.emit('tv_sumix_toggle', { row, col });
}

// ── Session persistence ──────────────────────────────────────────────────────
function saveSession() {
  try {
    sessionStorage.setItem(`tvSumix_${myRoomId}`, JSON.stringify({
      roomId: myRoomId, name: myName, color: myColor, seat: mySeat,
      ts: Date.now()
    }));
  } catch (e) { /* ignore */ }
}

function loadSession() {
  try {
    const key = `tvSumix_${roomIdFromUrl}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.ts > 30 * 60 * 1000) {
      sessionStorage.removeItem(key);
      return null;
    }
    return data;
  } catch (e) { return null; }
}
