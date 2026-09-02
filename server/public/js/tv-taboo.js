'use strict';

/* ── TV Taboo — TV Display Logic ── */

const params = new URLSearchParams(window.location.search);
const roomId = params.get('room');

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _hostHandoff = params.get('host') === '1';

const socket = io({ query: { role: 'tv-host' } });

const _lobbyPhaseEl = document.getElementById('lobbyPhase');
if (_hostHandoff && _lobbyPhaseEl) _lobbyPhaseEl.classList.remove('active');

// ── Phase switching ──
function showPhase(id) {
  document.querySelectorAll('.tv-phase').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── QR Code ──
let qr = null;
let myRoomId = roomId;

// ── Socket: join on connect ──
socket.on('connect', () => {
  document.getElementById('reconnectOverlay').classList.add('hidden');
  socket.emit('join_game', {
    roomId: myRoomId || null,
    playerName: 'TV Display',
    gameType: 'tv-taboo',
    reconnect: !!myRoomId,
  });
});

let _hostStartFired = false;
socket.on('joined', (data) => {
  myRoomId = data.roomId;

  const _playingEl = document.getElementById('playingPhase');
  if (_hostHandoff && !_hostStartFired && _playingEl && !_playingEl.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_taboo_start'), 400);
    return;
  }

  if (!roomId) {
    history.replaceState(null, '', `?room=${myRoomId}`);
  }
  const playUrl = `${location.origin}/tv-join?game=tv-taboo&room=${myRoomId}`;
  document.getElementById('joinUrl').textContent = playUrl;
  const el = document.getElementById('qrcode');
  el.innerHTML = '';
  qr = new QRCode(el, { text: playUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H });
});

// ── Lobby updates ──
const PLAYER_COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#1abc9c','#e67e22','#e91e63'];
let players = [];

socket.on('room_update', (data) => {
  players = (data.players || []).filter(p => p.color !== 'tv-host');
  renderLobbyPlayers();
});

function renderLobbyPlayers() {
  const list = document.getElementById('lobbyPlayerList');
  if (players.length === 0) {
    list.innerHTML = '<div class="tv-player-empty">Waiting for players...</div>';
  } else {
    list.innerHTML = players.map((p, i) =>
      `<div class="tv-player-chip" style="border-color:${PLAYER_COLORS[i % 8]};color:${PLAYER_COLORS[i % 8]}">${p.name}</div>`
    ).join('');
  }
  document.getElementById('startBtn').disabled = players.length < 1;
}

// ── Start game ──
document.getElementById('startBtn').addEventListener('click', () => {
  socket.emit('tv_taboo_start');
  document.getElementById('startBtn').disabled = true;
});

// ── Game state tracking ──
let currentState = null;

socket.on('game_started', (data) => {
  currentState = data;
  showPhase('playingPhase');
  renderGameState(data);
});

socket.on('game_state', (data) => {
  currentState = data;
  renderGameState(data);
});

// Auto-advance timer state
let _nextRoundTimer = null;
let _nextRoundPhase = null;

function renderGameState(gs) {
  // Round
  document.getElementById('roundBadge').textContent = `Round ${gs.round} / ${gs.totalRounds}`;

  // Taboo words
  const tabooList = document.getElementById('tabooList');
  tabooList.innerHTML = (gs.tabooWords || []).map(w =>
    `<div class="tv-taboo-word">${w}</div>`
  ).join('');

  // Clue
  const clueEl = document.getElementById('clueText');
  if (!gs.clueReady) {
    clueEl.innerHTML = '<span class="tv-clue-loading">AI is thinking...</span>';
  } else {
    clueEl.textContent = gs.clue || '';
  }

  // Reveal keyword
  const revealEl = document.getElementById('revealKeyword');
  const revealWordEl = document.getElementById('revealWord');
  if (gs.phase === 'reveal' && gs.keyword) {
    revealEl.style.display = 'flex';
    revealWordEl.textContent = gs.keyword;
  } else {
    revealEl.style.display = 'none';
  }

  // Scores — show dot + name + value
  const scoreList = document.getElementById('scoreList');
  const playerList = gs.players || [];
  scoreList.innerHTML = playerList.map((p, i) => {
    const isWinner = gs.roundWinner === p.seat;
    const color = PLAYER_COLORS[i % 8];
    return `<div class="tv-score-row${isWinner ? ' winner' : ''}">
      <div class="tv-score-dot" style="background:${color}"></div>
      <div class="tv-score-name" style="color:${color}">${p.name}</div>
      <div class="tv-score-value">${gs.scores[p.seat] || 0}</div>
    </div>`;
  }).join('');

  // Guess log — color-coded by player
  const guessLogEl = document.getElementById('guessLog');
  const recent = (gs.guessLog || []).slice(-8);
  guessLogEl.innerHTML = recent.map(g => {
    const pIdx = playerList.findIndex(p => p.seat === g.seat);
    const color = PLAYER_COLORS[pIdx >= 0 ? pIdx % 8 : 0];
    return `<div class="tv-guess-item ${g.correct ? 'correct' : 'wrong'}">
      <div class="tv-guess-dot" style="background:${color}"></div>
      <div class="tv-guess-who" style="color:${color}">${g.name || 'Player'}</div>
      <div class="tv-guess-text">${g.text}</div>
      <div class="tv-guess-mark">${g.correct ? '✓' : '✗'}</div>
    </div>`;
  }).join('');

  // Footer + auto-advance countdown
  const skipBtn = document.getElementById('skipBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (gs.phase === 'guessing') {
    skipBtn.style.display = '';
    nextBtn.style.display = 'none';
    _clearNextRoundTimer();
  } else if (gs.phase === 'reveal') {
    skipBtn.style.display = 'none';
    nextBtn.style.display = '';
    // Start auto-advance countdown only once per reveal phase
    if (_nextRoundPhase !== gs.round + '_' + gs.phase) {
      _nextRoundPhase = gs.round + '_' + gs.phase;
      _startNextRoundCountdown();
    }
  } else {
    skipBtn.style.display = 'none';
    nextBtn.style.display = 'none';
    _clearNextRoundTimer();
  }
}

function _clearNextRoundTimer() {
  if (_nextRoundTimer) { clearInterval(_nextRoundTimer); _nextRoundTimer = null; }
}

function _startNextRoundCountdown() {
  _clearNextRoundTimer();
  let secs = 5;
  const countEl = document.getElementById('nextCountdown');
  if (countEl) countEl.textContent = secs;
  _nextRoundTimer = setInterval(() => {
    secs--;
    if (countEl) countEl.textContent = secs;
    if (secs <= 0) {
      _clearNextRoundTimer();
      socket.emit('tv_taboo_next_round');
    }
  }, 1000);
}

// ── Guess animation ──
socket.on('tv_taboo_guess_result', (data) => {
  if (data.correct) {
    // Flash effect
    const main = document.querySelector('.tv-playing-main');
    main.style.transition = 'background 0.3s';
    main.style.background = 'rgba(78,204,163,0.15)';
    setTimeout(() => { main.style.background = ''; }, 600);
  }
});

// ── Host controls ──
document.getElementById('skipBtn').addEventListener('click', () => {
  socket.emit('tv_taboo_skip');
});

document.getElementById('nextBtn').addEventListener('click', () => {
  socket.emit('tv_taboo_next_round');
});

// ── Game over ──
socket.on('game_over', (data) => {
  showPhase('gameoverPhase');
  document.getElementById('gameoverWinner').textContent = data.winner
    ? `${data.winner} wins!`
    : 'It\'s a tie!';

  // Show final scores
  const scoresEl = document.getElementById('gameoverScores');
  const playerList = currentState?.players || [];
  const scores = data.scores || currentState?.scores || [];
  scoresEl.innerHTML = playerList.map((p, i) =>
    `<div class="tv-gameover-score-item">
      <div class="tv-gameover-score-name" style="color:${PLAYER_COLORS[i % 8]}">${p.name}</div>
      <div class="tv-gameover-score-val">${scores[p.seat] || 0}</div>
    </div>`
  ).join('');

  // Confetti
  if (data.winner) spawnConfetti();
});

// ── Play again ──
document.getElementById('playAgainBtn').addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-taboo' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
  showPhase('lobbyPhase');
  renderLobbyPlayers();
});

socket.on('play_again', () => {
  _clearNextRoundTimer();
  _nextRoundPhase = null;
});

// ── Reconnect ──
socket.on('disconnect', () => {
  document.getElementById('reconnectOverlay').classList.remove('hidden');
});

// ── Confetti ──
function spawnConfetti() {
  const container = document.getElementById('confettiContainer');
  container.classList.remove('hidden');
  container.innerHTML = '';
  const colors = ['#ffd700', '#4ecca3', '#e74c3c', '#3498db', '#f39c12', '#9b59b6'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 2) + 's';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
    container.appendChild(piece);
  }
  setTimeout(() => container.classList.add('hidden'), 4000);
}
