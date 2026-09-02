'use strict';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _tvParams    = new URLSearchParams(location.search);
const _hostHandoff = _tvParams.get('host') === '1';
const _initialRoom = _tvParams.get('room');

// ── State ────────────────────────────────────────────────────────────────────
let myRoomId = _initialRoom || null;
let gameState = null;
let phase = 'lobby';
let selectedMode = 'easy';

// ── DOM refs ─────────────────────────────────────────────────────────────────
const lobbyPhase       = document.getElementById('lobbyPhase');
const playingPhase     = document.getElementById('playingPhase');
const gameoverPhase    = document.getElementById('gameoverPhase');
const reconnectOverlay = document.getElementById('reconnectOverlay');

const qrContainer      = document.getElementById('qrcode');
const joinUrlEl        = document.getElementById('joinUrl');
const lobbyPlayerList  = document.getElementById('lobbyPlayerList');
const startBtn         = document.getElementById('startBtn');
const modeEasyBtn      = document.getElementById('modeEasy');
const modeMediumBtn    = document.getElementById('modeMedium');
const modeHardBtn      = document.getElementById('modeHard');
const modeLabelEl      = document.getElementById('modeLabel');
const gridsAreaEl      = document.getElementById('gridsArea');

const gameoverWinnerEl     = document.getElementById('gameoverWinner');
const gameoverWinnerNameEl = document.getElementById('gameoverWinnerName');
const playAgainBtn         = document.getElementById('playAgainBtn');

// ── Socket ───────────────────────────────────────────────────────────────────
const socket = io({
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

if (_hostHandoff && lobbyPhase) lobbyPhase.classList.remove('active');

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  socket.emit('join_game', {
    roomId: myRoomId || null,
    playerName: 'TV Display',
    gameType: 'tv-sumix',
    reconnect: !!myRoomId
  });
});

socket.on('disconnect', () => { reconnectOverlay.classList.remove('hidden'); });
socket.on('connect_error', () => { reconnectOverlay.classList.remove('hidden'); });

// ── Joined ───────────────────────────────────────────────────────────────────
let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_sumix_start', { mode: selectedMode }), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-sumix&room=${roomId}`;
  joinUrlEl.textContent = joinUrl;
  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: joinUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H
  });
});

// ── Room update (lobby) ──────────────────────────────────────────────────────
socket.on('room_update', ({ players }) => {
  const phonePlayers = players.filter(p => p.color !== 'tv-host');
  renderLobbyPlayers(phonePlayers);
  startBtn.disabled = phonePlayers.filter(p => p.connected).length < 1;
});

// ── Game started ─────────────────────────────────────────────────────────────
socket.on('game_started', (state) => {
  gameState = state;
  const modeLabels = { easy: 'Easy 3\u00d73', medium: 'Medium 4\u00d74', hard: 'Hard 5\u00d75' };
  modeLabelEl.textContent = modeLabels[state.mode] || modeLabels.easy;
  switchPhase('playing');
  renderGrids(state);
});

// ── Game state update ────────────────────────────────────────────────────────
socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-sumix') return;
  gameState = state;
  renderGrids(state);
});

// ── Game over ────────────────────────────────────────────────────────────────
socket.on('game_over', ({ winner, reason }) => {
  gameoverWinnerNameEl.textContent = winner || '';
  gameoverWinnerEl.textContent = reason || `Winner: ${winner}`;
  switchPhase('gameover');
  launchConfetti();
  playVictorySound();
});

// ── Play again ───────────────────────────────────────────────────────────────
socket.on('play_again', () => {
  gameState = null;
  const confettiEl = document.getElementById('confettiContainer');
  if (confettiEl) { confettiEl.classList.add('hidden'); confettiEl.innerHTML = ''; }
  switchPhase('lobby');
});

socket.on('error', ({ message }) => { console.error('Server error:', message); });

// ── Button handlers ──────────────────────────────────────────────────────────
function selectMode(mode) {
  selectedMode = mode;
  modeEasyBtn.classList.toggle('active', mode === 'easy');
  modeMediumBtn.classList.toggle('active', mode === 'medium');
  modeHardBtn.classList.toggle('active', mode === 'hard');
}

modeEasyBtn.addEventListener('click', () => selectMode('easy'));
modeMediumBtn.addEventListener('click', () => selectMode('medium'));
modeHardBtn.addEventListener('click', () => selectMode('hard'));

startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  socket.emit('tv_sumix_start', { mode: selectedMode });
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-sumix' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

// ── Phase switching ──────────────────────────────────────────────────────────
function switchPhase(newPhase) {
  phase = newPhase;
  lobbyPhase.classList.toggle('active', newPhase === 'lobby');
  playingPhase.classList.toggle('active', newPhase === 'playing');
  gameoverPhase.classList.toggle('active', newPhase === 'gameover');
}

// ── Lobby player list ────────────────────────────────────────────────────────
function renderLobbyPlayers(players) {
  if (players.length === 0) {
    lobbyPlayerList.innerHTML = '<div class="tv-player-empty">Waiting for players...</div>';
    return;
  }
  lobbyPlayerList.innerHTML = '';
  players.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'tv-player-item';
    div.textContent = `${i + 1}. ${escHtml(p.name)}`;
    if (!p.connected) div.style.opacity = '0.5';
    lobbyPlayerList.appendChild(div);
  });
}

// ── Render all player status panels on TV ────────────────────────────────────
function renderGrids(state) {
  const players = state.players || [];
  const n = state.gridSize;

  gridsAreaEl.className = 'tv-grids-area players-' + Math.min(players.length, 8);
  gridsAreaEl.innerHTML = '';

  players.forEach((p) => {
    const seat = p.seat;
    if (seat < 0 || seat >= state.playerCount) return;

    const cRows = state.correctRows[seat];
    const cCols = state.correctCols[seat];
    const correctCount = cRows.filter(Boolean).length + cCols.filter(Boolean).length;
    const totalSums = n * 2;
    const isWinner = state.winnerSeat === seat;

    const wrap = document.createElement('div');
    wrap.className = 'tv-mini-panel' + (isWinner ? ' winner' : '');

    // Player name
    const nameEl = document.createElement('div');
    nameEl.className = 'tv-mini-name';
    nameEl.textContent = escHtml(p.name);
    wrap.appendChild(nameEl);

    // Progress bar
    const progWrap = document.createElement('div');
    progWrap.className = 'tv-prog-wrap';
    const progBar = document.createElement('div');
    progBar.className = 'tv-prog-bar';
    progBar.style.width = `${(correctCount / totalSums) * 100}%`;
    if (isWinner) progBar.classList.add('complete');
    progWrap.appendChild(progBar);
    wrap.appendChild(progWrap);

    const progLabel = document.createElement('div');
    progLabel.className = 'tv-prog-label';
    progLabel.textContent = isWinner ? 'SOLVED!' : `${correctCount} / ${totalSums}`;
    wrap.appendChild(progLabel);

    // Row indicators
    const rowLabel = document.createElement('div');
    rowLabel.className = 'tv-indicator-label';
    rowLabel.textContent = 'Rows';
    wrap.appendChild(rowLabel);

    const rowIndicators = document.createElement('div');
    rowIndicators.className = 'tv-indicators';
    for (let r = 0; r < n; r++) {
      const dot = document.createElement('div');
      dot.className = 'tv-indicator' + (cRows[r] ? ' correct' : '');
      dot.textContent = cRows[r] ? '\u2713' : String(r + 1);
      rowIndicators.appendChild(dot);
    }
    wrap.appendChild(rowIndicators);

    // Column indicators
    const colLabel = document.createElement('div');
    colLabel.className = 'tv-indicator-label';
    colLabel.textContent = 'Cols';
    wrap.appendChild(colLabel);

    const colIndicators = document.createElement('div');
    colIndicators.className = 'tv-indicators';
    for (let c = 0; c < n; c++) {
      const dot = document.createElement('div');
      dot.className = 'tv-indicator' + (cCols[c] ? ' correct' : '');
      dot.textContent = cCols[c] ? '\u2713' : String(c + 1);
      colIndicators.appendChild(dot);
    }
    wrap.appendChild(colIndicators);

    gridsAreaEl.appendChild(wrap);
  });
}

// ── Confetti ─────────────────────────────────────────────────────────────────
function launchConfetti() {
  const container = document.getElementById('confettiContainer');
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = '';
  const colors = ['#ffd700', '#ff6b6b', '#4ecca3', '#1155cc', '#7d3c98', '#ff9f43', '#ee5a24', '#00d2d3'];
  for (let i = 0; i < 150; i++) {
    const piece = document.createElement('div');
    piece.className = 'tv-confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 3}s`;
    piece.style.animationDuration = `${3 + Math.random() * 3}s`;
    if (Math.random() > 0.5) piece.style.borderRadius = '50%';
    const size = 10 + Math.random() * 15;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    container.appendChild(piece);
  }
  setTimeout(() => { container.classList.add('hidden'); container.innerHTML = ''; }, 8000);
}

// ── Victory Sound ────────────────────────────────────────────────────────────
function playVictorySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.18 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.6);
    });
  } catch (e) { /* Audio not available */ }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
