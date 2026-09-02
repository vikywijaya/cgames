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
let myColor = _autoJoinHandoff ? _autoJoinHandoff.color : null;
let mySeat = (_autoJoinHandoff ? (['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) > 0 ? ['tv-host','p1','p2','p3','p4','p5','p6','p7','p8'].indexOf(_autoJoinHandoff.color) - 1 : -1) : -1);
let myName = _autoJoinHandoff ? _autoJoinHandoff.name : '';
let gameState = null;
let selectedTray  = null; // tray value index currently selected
let selectedSlot  = null; // slot key currently selected
let localPlaced   = {};   // slotKey → value (optimistic local state)
let localUsed     = new Set(); // tray indices used locally
let isSolved      = false;

const TV_MATH_CROSS_COLORS = ['tv-host', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
function seatForColor(color) {
  if (color === 'tv-host') return -1;
  const idx = TV_MATH_CROSS_COLORS.indexOf(color);
  return idx > 0 ? idx - 1 : -1;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const joinScreen      = document.getElementById('joinScreen');
const waitingScreen   = document.getElementById('waitingScreen');
const playingScreen   = document.getElementById('playingScreen');
const gameoverScreen  = document.getElementById('gameoverScreen');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const nameInput  = document.getElementById('nameInput');
const joinBtn    = document.getElementById('joinBtn');
const joinError  = document.getElementById('joinError');
const waitingName = document.getElementById('waitingName');
const gameHint   = document.getElementById('gameHint');
const roundBadge = document.getElementById('roundBadge');
const raceBar    = document.getElementById('raceBar');
const puzzleGrid = document.getElementById('puzzleGrid');
const tray       = document.getElementById('tray');
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
    socket.emit('join_game', { roomId, playerName: myName, gameType: 'tv-math-cross', reconnect: true });
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
  socket.emit('join_game', { roomId, playerName: name, gameType: 'tv-math-cross' });
}

socket.on('joined', ({ color }) => {
  myColor = color;
  mySeat = seatForColor(color);

  if (color === 'spectator' || color === 'tv-host') {
    joinError.textContent = 'Game is full. You joined as a spectator.';
    joinBtn.disabled = false;
    return;
  }

  waitingName.textContent = `Playing as ${myName}`;
  showScreen('waiting');
});

socket.on('room_update', () => {}); // handled via game_state

// ── Game started / state update ───────────────────────────────────────────────
socket.on('game_started', (state) => {
  if (state.gameType !== 'tv-math-cross') return;
  gameState = state;
  // Sync local state from server
  syncFromState(state);
  showScreen('playing');
  renderAll();
});

socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-math-cross') return;
  gameState = state;
  syncFromState(state);
  if (!playingScreen.classList.contains('active')) showScreen('playing');
  renderAll();
});

function syncFromState(state) {
  if (mySeat < 0) return;
  const serverPlaced = state.placed[mySeat] || {};
  // Merge: keep server as truth
  localPlaced = { ...serverPlaced };
  localUsed = new Set();
  const trayValues = state.puzzle.trayValues;
  // Re-compute which tray indices are used
  for (const val of Object.values(localPlaced)) {
    const idx = trayValues.indexOf(val);
    if (idx >= 0) localUsed.add(idx);
  }
  isSolved = state.solved[mySeat] || false;
}

// ── Round over ────────────────────────────────────────────────────────────────
socket.on('round_over', ({ currentRound, totalRounds, players, nextRoundIn }) => {
  // Reset local state for next round
  localPlaced = {};
  localUsed = new Set();
  selectedSlot = null;
  selectedTray = null;
  isSolved = false;
  if (solvedOverlay) solvedOverlay.classList.add('hidden');

  // Show round-over in game hint
  if (gameHint) {
    const myScore = players.find(p => p.name === myName);
    const pts = myScore ? myScore.score : 0;
    gameHint.textContent = `Round ${currentRound + 1}/${totalRounds} done! You have ${pts} pts. Next round in ${nextRoundIn}s…`;
  }
});

// ── Game over ─────────────────────────────────────────────────────────────────
socket.on('game_over', ({ winner, players, reason }) => {
  const isWinner = winner === myName;
  const myData = players ? players.find(p => p.name === myName) : null;
  const myScore = myData ? myData.score : 0;
  gameoverEmoji.textContent = isWinner ? '🏆' : '😊';
  gameoverTitle.textContent = isWinner ? 'You Win!' : 'Game Over';
  gameoverPersonal.textContent = isWinner ? `🎉 You won with ${myScore} pts!` : `${winner} wins!`;
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
  renderRaceBar();
  renderGrid();
  renderTray();
  updateHint();
  if (isSolved) solvedOverlay.classList.remove('hidden');
}

function renderRaceBar() {
  const { players, solved, placed, puzzle } = gameState;
  raceBar.innerHTML = '';
  players.forEach(player => {
    const i = player.seat;
    const slotsPlaced = placed[i] ? Object.keys(placed[i]).length : 0;
    const div = document.createElement('div');
    div.className = 'race-item'
      + (i === mySeat ? ' me' : '')
      + (solved[i] ? ' solved' : '');
    const label = solved[i] ? '✓' : `${slotsPlaced}/${puzzle.slotPositions.length}`;
    div.innerHTML = `
      <div class="race-item-slots">${label}</div>
      <div class="race-item-name">${escHtml(player.name)}</div>
    `;
    raceBar.appendChild(div);
  });
}

function renderGrid() {
  const { puzzle } = gameState;
  puzzleGrid.innerHTML = '';
  puzzleGrid.style.gridTemplateColumns = `repeat(${puzzle.cols}, 52px)`;

  for (let r = 0; r < puzzle.rows; r++) {
    for (let c = 0; c < puzzle.cols; c++) {
      const key = `${r},${c}`;
      const cell = puzzle.cells[key];
      const el = document.createElement(cell && cell.type === 'slot' ? 'button' : 'div');
      el.className = 'cell';

      if (!cell) {
        el.classList.add('cell-blank');
      } else if (cell.type === 'op') {
        el.classList.add('cell-op');
        el.textContent = cell.value;
      } else if (cell.type === 'number') {
        el.classList.add('cell-given');
        el.textContent = cell.value;
      } else if (cell.type === 'slot') {
        const placedVal = localPlaced[key];
        if (isSolved) {
          el.classList.add('cell-correct');
          el.textContent = cell.answer;
        } else if (placedVal !== undefined) {
          const correct = placedVal === cell.answer;
          el.classList.add(correct ? 'cell-correct' : 'cell-filled');
          el.textContent = placedVal;
          if (!correct && selectedSlot === key) el.classList.add('selected');
        } else {
          el.classList.add('cell-slot');
          if (selectedSlot === key) el.classList.add('selected');
          el.textContent = '';
        }
        if (!isSolved) {
          el.addEventListener('click', () => handleSlotClick(key));
        }
      }

      puzzleGrid.appendChild(el);
    }
  }
}

function renderTray() {
  const { puzzle } = gameState;
  tray.innerHTML = '';
  if (isSolved) return;

  puzzle.trayValues.forEach((val, idx) => {
    const btn = document.createElement('button');
    btn.className = 'tray-num';
    btn.textContent = val;
    if (localUsed.has(idx)) btn.classList.add('used');
    if (selectedTray === idx) btn.classList.add('selected');
    btn.addEventListener('click', () => handleTrayClick(idx));
    tray.appendChild(btn);
  });
}

function updateHint() {
  if (roundBadge && gameState.currentRound !== undefined) {
    roundBadge.textContent = `Round ${gameState.currentRound + 1}/${gameState.totalRounds}`;
  }
  if (isSolved) { gameHint.textContent = '✓ Solved! Waiting for others…'; return; }
  if (selectedTray !== null) {
    gameHint.textContent = 'Now tap an empty slot ↑';
  } else if (selectedSlot !== null) {
    gameHint.textContent = 'Now tap a number below ↓';
  } else {
    const slotsLeft = gameState.puzzle.slotPositions.length - Object.keys(localPlaced).length;
    gameHint.textContent = slotsLeft + ' slot' + (slotsLeft !== 1 ? 's' : '') + ' remaining';
  }
}

// ── Interaction ───────────────────────────────────────────────────────────────
function handleSlotClick(key) {
  if (isSolved) return;
  const placedVal = localPlaced[key];

  if (placedVal !== undefined) {
    // Remove existing placement
    const trayIdx = gameState.puzzle.trayValues.indexOf(placedVal);
    if (trayIdx >= 0) localUsed.delete(trayIdx);
    delete localPlaced[key];
    socket.emit('tv_math_cross_remove', { slotKey: key });
    selectedSlot = null;
    selectedTray = null;
    renderAll();
    return;
  }

  if (selectedTray !== null) {
    // Place the selected tray number
    const val = gameState.puzzle.trayValues[selectedTray];
    placeInSlot(key, selectedTray, val);
    return;
  }

  // Select/deselect this slot
  selectedSlot = selectedSlot === key ? null : key;
  renderAll();
}

function handleTrayClick(idx) {
  if (isSolved || localUsed.has(idx)) return;
  const val = gameState.puzzle.trayValues[idx];

  if (selectedSlot !== null) {
    placeInSlot(selectedSlot, idx, val);
    return;
  }

  selectedTray = selectedTray === idx ? null : idx;
  renderAll();
}

function placeInSlot(key, trayIdx, val) {
  // Optimistic update
  localPlaced[key] = val;
  localUsed.add(trayIdx);
  selectedSlot = null;
  selectedTray = null;

  // Send to server
  socket.emit('tv_math_cross_place', { slotKey: key, value: val });
  renderAll();
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
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
