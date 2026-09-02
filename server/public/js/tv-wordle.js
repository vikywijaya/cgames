'use strict';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _tvParams    = new URLSearchParams(location.search);
const _hostHandoff = _tvParams.get('host') === '1';
const _initialRoom = _tvParams.get('room');

// ── State ────────────────────────────────────────────────────────────────────
let myRoomId = _initialRoom || null;
let gameState = null;
let phase = 'lobby'; // 'lobby' | 'playing' | 'gameover'

// ── DOM refs ─────────────────────────────────────────────────────────────────
const lobbyPhase       = document.getElementById('lobbyPhase');
const playingPhase     = document.getElementById('playingPhase');
const gameoverPhase    = document.getElementById('gameoverPhase');
const reconnectOverlay = document.getElementById('reconnectOverlay');

// Lobby
const qrContainer      = document.getElementById('qrcode');
const joinUrlEl        = document.getElementById('joinUrl');
const lobbyPlayerList  = document.getElementById('lobbyPlayerList');
const startBtn         = document.getElementById('startBtn');

// Playing
const gridsContainer   = document.getElementById('gridsContainer');

// Game Over
const gameoverWinnerNameEl = document.getElementById('gameoverWinnerName');
const gameoverWinnerEl     = document.getElementById('gameoverWinner');
const playAgainBtn         = document.getElementById('playAgainBtn');

// ── TTS voice selection ─────────────────────────────────────────────────────
let preferredVoice = null;

function loadPreferredVoice() {
  const voices = window.speechSynthesis.getVoices();
  // Prefer a female English voice
  preferredVoice =
    voices.find(v => /female/i.test(v.name) && /en/i.test(v.lang)) ||
    voices.find(v => /samantha|victoria|karen|zira|hazel|susan/i.test(v.name)) ||
    voices.find(v => /en[-_]/.test(v.lang) && !/male/i.test(v.name)) ||
    voices.find(v => /en[-_]/.test(v.lang)) ||
    null;
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = loadPreferredVoice;
  loadPreferredVoice();
}

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
    gameType: 'tv-wordle',
    reconnect: !!myRoomId
  });
});

socket.on('disconnect', () => {
  reconnectOverlay.classList.remove('hidden');
});

socket.on('connect_error', () => {
  reconnectOverlay.classList.remove('hidden');
});

// ── Joined ───────────────────────────────────────────────────────────────────
let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  if (_hostHandoff && !_hostStartFired && !playingPhase.classList.contains('active')) {
    _hostStartFired = true;
    setTimeout(() => socket.emit('tv_wordle_start'), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-wordle&room=${roomId}`;
  joinUrlEl.textContent = joinUrl;

  qrContainer.innerHTML = '';
  new QRCode(qrContainer, {
    text: joinUrl,
    width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H
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
  switchPhase('playing');
  renderAllGrids(state);
});

// ── Game state (reconnect / mid-game sync) ──────────────────────────────────
socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-wordle') return;
  gameState = state;

  if (phase !== 'playing') {
    switchPhase('playing');
  }
  renderAllGrids(state);
  renderKeyboard(state);
});

// ── Player guessed ──────────────────────────────────────────────────────────
socket.on('wordle_player_guessed', (data) => {
  // data: { seat, attempt, result (array of {status}), solved, playerName }
  if (!gameState) return;

  // Update local state for this player
  if (!gameState.grids) gameState.grids = {};
  if (!gameState.grids[data.seat]) gameState.grids[data.seat] = [];
  gameState.grids[data.seat][data.attempt] = data.result;

  if (data.solved) {
    if (!gameState.solvedSeats) gameState.solvedSeats = {};
    gameState.solvedSeats[data.seat] = true;
  }

  // Ensure grid section exists (in case of late join)
  const section = document.querySelector(`.tv-player-grid-section[data-seat="${data.seat}"]`);
  if (!section) {
    renderAllGrids(gameState);
  }

  animateRow(data.seat, data.attempt, data.result);

  // Mark name as solved
  if (data.solved) {
    const nameEl = document.querySelector(`.tv-player-grid-section[data-seat="${data.seat}"] .tv-player-grid-name`);
    if (nameEl) nameEl.classList.add('solved');
  }
});

// ── Game over ────────────────────────────────────────────────────────────────
socket.on('game_over', ({ winner, reason }) => {
  gameoverWinnerNameEl.textContent = winner || '';
  gameoverWinnerEl.textContent = reason || `Winner: ${winner}`;

  switchPhase('gameover');
  launchTvConfetti();
  playTvVictorySound();
  speakWinner(winner);
});

// ── Play again ──────────────────────────────────────────────────────────────
socket.on('play_again', () => {
  gameState = null;
  gridsContainer.innerHTML = '';
  const confettiEl = document.getElementById('confettiContainer');
  if (confettiEl) { confettiEl.classList.add('hidden'); confettiEl.innerHTML = ''; }
  switchPhase('lobby');
});

socket.on('error', ({ message }) => {
  console.error('Server error:', message);
});

// ── Button handlers ──────────────────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  startBtn.disabled = true;
  socket.emit('tv_wordle_start');
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-wordle' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
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

// ── Determine cell size class based on player count ─────────────────────────
function getCellSizeClass(playerCount) {
  if (playerCount <= 2) return 'cell-size-large';
  if (playerCount <= 4) return 'cell-size-medium';
  return 'cell-size-small';
}

// ── Render all player grids ─────────────────────────────────────────────────
function renderAllGrids(state) {
  gridsContainer.innerHTML = '';
  if (!state || !state.players) return;

  const phonePlayers = state.players.filter(p => p.color !== 'tv-host');

  const metaEl = document.getElementById('playingMeta');
  if (metaEl) {
    const solvedCount = (state.solved || []).filter(Boolean).length;
    metaEl.textContent = `${phonePlayers.length} player${phonePlayers.length !== 1 ? 's' : ''} · ${solvedCount} solved`;
  }
  const sizeClass = getCellSizeClass(phonePlayers.length);
  gridsContainer.className = 'tv-grids-container ' + sizeClass;

  const grids = state.grids || {};
  const solvedSeats = state.solvedSeats || {};

  phonePlayers.forEach(p => {
    const section = document.createElement('div');
    section.className = 'tv-player-grid-section';
    section.dataset.seat = p.seat;

    // Player name
    const nameEl = document.createElement('div');
    nameEl.className = 'tv-player-grid-name';
    if (solvedSeats[p.seat]) nameEl.classList.add('solved');
    nameEl.textContent = escHtml(p.name);
    section.appendChild(nameEl);

    // 6x5 grid
    const grid = document.createElement('div');
    grid.className = 'tv-wordle-grid';
    grid.dataset.seat = p.seat;

    const playerGuesses = grids[p.seat] || [];

    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 5; col++) {
        const cell = document.createElement('div');
        cell.className = 'tv-wordle-cell';
        cell.dataset.row = row;
        cell.dataset.col = col;

        // Apply color if this row has been guessed
        if (playerGuesses[row] && playerGuesses[row][col]) {
          const status = playerGuesses[row][col].status;
          if (status === 'correct') cell.classList.add('correct');
          else if (status === 'present') cell.classList.add('present');
          else if (status === 'absent') cell.classList.add('absent');
        }

        grid.appendChild(cell);
      }
    }

    section.appendChild(grid);
    gridsContainer.appendChild(section);
  });
}

// ── Animate a single row with flip reveal ───────────────────────────────────
function animateRow(seat, attempt, result) {
  const grid = document.querySelector(`.tv-wordle-grid[data-seat="${seat}"]`);
  if (!grid) return;

  for (let col = 0; col < 5; col++) {
    const cell = grid.querySelector(`[data-row="${attempt}"][data-col="${col}"]`);
    if (!cell) continue;

    const status = result[col] ? result[col].status : 'absent';
    const delay = col * 300; // 300ms between each cell

    setTimeout(() => {
      cell.classList.add('flip');

      // At the halfway point of the flip, change the color
      setTimeout(() => {
        cell.classList.remove('correct', 'present', 'absent');
        cell.classList.add(status);
      }, 250); // halfway through 500ms animation
    }, delay);
  }
}

// ── TV Confetti ─────────────────────────────────────────────────────────────
function launchTvConfetti() {
  const container = document.getElementById('confettiContainer');
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = '';

  const colors = ['#538d4e', '#b59f3b', '#ffd700', '#ff6b6b', '#4ecca3', '#1155cc', '#7d3c98', '#ff9f43'];
  const shapes = ['circle', 'square'];

  for (let i = 0; i < 150; i++) {
    const piece = document.createElement('div');
    piece.className = 'tv-confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = color;
    piece.style.animationDelay = `${Math.random() * 3}s`;
    piece.style.animationDuration = `${3 + Math.random() * 3}s`;
    if (shape === 'circle') piece.style.borderRadius = '50%';
    const size = 10 + Math.random() * 15;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    container.appendChild(piece);
  }

  setTimeout(() => {
    container.classList.add('hidden');
    container.innerHTML = '';
  }, 8000);
}

// ── TV Victory Sound (Web Audio API) ────────────────────────────────────────
function playTvVictorySound() {
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

    setTimeout(() => {
      const chord = [261.63, 329.63, 392.00, 523.25, 659.25];
      chord.forEach(freq => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.5);
      });
    }, 800);
  } catch (e) {
    // Audio not available
  }
}

// ── Speak winner name ───────────────────────────────────────────────────────
function speakWinner(winnerName) {
  if (!('speechSynthesis' in window) || !winnerName) return;
  setTimeout(() => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      `Congratulations ${winnerName}! You solved the Wordle first!`
    );
    utterance.rate = 0.85;
    utterance.pitch = 1.1;
    utterance.volume = 1.0;
    if (preferredVoice) utterance.voice = preferredVoice;
    window.speechSynthesis.speak(utterance);
  }, 1500);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── TV Keyboard showing used letter states ──────────────────────────────────
const KB_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

function renderKeyboard(state) {
  const kbEl = document.getElementById('tvKeyboard');
  if (!kbEl) return;
  kbEl.innerHTML = '';

  // Collect best status per letter across all players
  const letterStatus = {};
  const grids = state.grids || {};
  const priority = { correct: 3, present: 2, absent: 1 };

  Object.values(grids).forEach(playerGuesses => {
    (playerGuesses || []).forEach(row => {
      (row || []).forEach(cell => {
        if (!cell || !cell.letter || !cell.status) return;
        const l = cell.letter.toUpperCase();
        const p = priority[cell.status] || 0;
        if (!letterStatus[l] || p > priority[letterStatus[l]]) {
          letterStatus[l] = cell.status;
        }
      });
    });
  });

  KB_ROWS.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'tv-kb-row';
    row.split('').forEach(letter => {
      const key = document.createElement('div');
      key.className = 'tv-kb-key';
      if (letterStatus[letter]) key.classList.add(letterStatus[letter]);
      key.textContent = letter;
      rowEl.appendChild(key);
    });
    kbEl.appendChild(rowEl);
  });
}
