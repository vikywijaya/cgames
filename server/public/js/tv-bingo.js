'use strict';

// ── URL params (host handoff from /tv-lobby) ────────────────────────────────
const _tvParams   = new URLSearchParams(location.search);
const _hostHandoff = _tvParams.get('host') === '1';
const _initialRoom = _tvParams.get('room');

// ── State ────────────────────────────────────────────────────────────────────
let myRoomId = _initialRoom || null;
let gameState = null;
let phase = 'lobby'; // 'lobby' | 'playing' | 'gameover'
let countdownInterval = null;
let CALL_INTERVAL = 15; // seconds (toggleable: 15 or 10)

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
const calledCountEl      = document.getElementById('calledCount');
const numberLetterEl     = document.getElementById('numberLetter');
const numberValueEl      = document.getElementById('numberValue');
const countdownCircle    = document.getElementById('countdownCircle');
const countdownTextEl    = document.getElementById('countdownText');
const bingoBoardEl       = document.getElementById('bingoBoard');
const playersStripEl     = document.getElementById('playersStrip');

// Call overlay
const callOverlayEl      = document.getElementById('callOverlay');
const callOverlayLetter  = document.getElementById('callOverlayLetter');
const callOverlayNumber  = document.getElementById('callOverlayNumber');

// Game Over
const gameoverWinnerEl = document.getElementById('gameoverWinner');
const playAgainBtn     = document.getElementById('playAgainBtn');

// ── Constants ────────────────────────────────────────────────────────────────
const COLS = ['B', 'I', 'N', 'G', 'O'];
const COL_RANGES = [
  { min: 1, max: 15 }, { min: 16, max: 30 }, { min: 31, max: 45 },
  { min: 46, max: 60 }, { min: 61, max: 75 }
];

// ── Socket ───────────────────────────────────────────────────────────────────
const socket = io({
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  reconnectOverlay.classList.add('hidden');
  socket.emit('join_game', {
    roomId: myRoomId || null,
    playerName: 'TV Display',
    gameType: 'tv-bingo',
    reconnect: !!myRoomId
  });
});

socket.on('disconnect', () => {
  reconnectOverlay.classList.remove('hidden');
});

socket.on('connect_error', () => {
  reconnectOverlay.classList.remove('hidden');
});

// ── Hide lobby instantly when arriving via host-handoff ─────────────────────
if (_hostHandoff) {
  // Lobby element renders with `active` class; remove it before paint.
  if (lobbyPhase) lobbyPhase.classList.remove('active');
}

// ── Joined ───────────────────────────────────────────────────────────────────
let _hostStartFired = false;
socket.on('joined', ({ roomId }) => {
  myRoomId = roomId;

  // If we're here via host handoff and the game hasn't started yet,
  // immediately request game start (mimicking what the old lobby Start
  // button did).
  if (_hostHandoff && !_hostStartFired && phase === 'lobby') {
    _hostStartFired = true;
    // Slight delay so the server has time to register room_update too
    setTimeout(() => socket.emit('tv_bingo_start'), 400);
    return;
  }

  const joinUrl = `${location.origin}/tv-join?game=tv-bingo&room=${roomId}`;
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
  buildBoard();
  applyState(state);
  startCountdown();
});

// ── Game state update ────────────────────────────────────────────────────────
socket.on('game_state', (state) => {
  if (state.gameType !== 'tv-bingo') return;
  gameState = state;
  applyState(state);
});

// ── Number called (for animation + speech) ───────────────────────────────────
socket.on('tv_bingo_number_called', ({ number, column }) => {
  animateNumber(column, number);
  speakNumber(column, number);
  resetCountdown();
});

// ── Game over ────────────────────────────────────────────────────────────────
socket.on('game_over', ({ winner, reason }) => {
  clearCountdown();

  // Show winner name prominently
  const winnerNameEl = document.getElementById('gameoverWinnerName');
  if (winnerNameEl) {
    winnerNameEl.textContent = winner || '';
  }
  gameoverWinnerEl.textContent = reason || `Winner: ${winner}`;

  switchPhase('gameover');
  launchTvConfetti();
  playTvVictorySound();
  speakWinner(winner);
});

// ── Play again ───────────────────────────────────────────────────────────────
socket.on('play_again', () => {
  gameState = null;
  clearCountdown();
  numberValueEl.textContent = '--';
  numberValueEl.classList.remove('pop');
  // Clean up confetti
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
  socket.emit('tv_bingo_start');
});

playAgainBtn.addEventListener('click', () => {
  socket.emit('play_again');
  setTimeout(function(){ location.replace('/tv-lobby?game=tv-bingo' + (myRoomId ? '&room=' + myRoomId : '')); }, 60);
});

// ── Tap countdown to toggle interval (15s ↔ 10s) ───────────────────────────
document.querySelector('.tv-countdown-wrap').addEventListener('click', () => {
  if (phase !== 'playing') return;
  const newInterval = CALL_INTERVAL === 15 ? 10 : 15;
  socket.emit('tv_bingo_set_interval', { interval: newInterval });
});

socket.on('tv_bingo_interval_changed', ({ interval }) => {
  CALL_INTERVAL = interval;
  countdownTextEl.textContent = String(Math.min(parseInt(countdownTextEl.textContent) || interval, interval));
  resetCountdown();
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

// ── Build the board: two halves side by side ─────────────────────────────────
// Left half  = first 8 numbers of each column (B1–8, I16–23, N31–38, G46–53, O61–68)
// Right half = last 7 numbers of each column  (B9–15, I24–30, N39–45, G54–60, O69–75)
function buildBoard() {
  bingoBoardEl.innerHTML = '';

  const HALF = 8; // numbers in the left half per column

  ['left', 'right'].forEach(side => {
    const halfDiv = document.createElement('div');
    halfDiv.className = 'tv-board-half';

    for (let col = 0; col < 5; col++) {
      const colDiv = document.createElement('div');
      colDiv.className = 'tv-board-col';

      // Header with column letter
      const header = document.createElement('div');
      header.className = `tv-board-col-header col-${COLS[col]}`;
      header.textContent = COLS[col];
      colDiv.appendChild(header);

      const { min, max } = COL_RANGES[col];
      const from = side === 'left' ? min : min + HALF;
      const to   = side === 'left' ? min + HALF - 1 : max;

      for (let n = from; n <= to; n++) {
        const numDiv = document.createElement('div');
        numDiv.className = 'tv-board-num';
        numDiv.id = `board-${n}`;
        numDiv.textContent = n;
        colDiv.appendChild(numDiv);
      }
      halfDiv.appendChild(colDiv);
    }

    bingoBoardEl.appendChild(halfDiv);
  });
}

// ── Apply full game state ────────────────────────────────────────────────────
function applyState(state) {
  // Called count
  calledCountEl.textContent = `${state.called.length} / 75`;

  // Update board highlights
  const calledSet = new Set(state.called);
  for (let n = 1; n <= 75; n++) {
    const el = document.getElementById(`board-${n}`);
    if (!el) continue;
    const col = Math.floor((n - 1) / 15);
    el.className = 'tv-board-num';
    if (calledSet.has(n)) {
      el.classList.add('called', `col-${COLS[col]}`);
    }
    if (n === state.lastCalled) {
      el.classList.add('last-called');
    }
  }

  // Last called number
  if (state.lastCalled) {
    const col = COLS[Math.floor((state.lastCalled - 1) / 15)];
    setHeroNumber(col, state.lastCalled);
  }

  // Players strip
  renderPlayersStrip(state.players, state.winners);
}

// ── Players strip ────────────────────────────────────────────────────────────
function renderPlayersStrip(players, winners) {
  playersStripEl.innerHTML = '';
  (players || []).forEach(p => {
    const isWinner = (winners || []).some(w => w.seat === p.seat);
    const chip = document.createElement('div');
    chip.className = 'tv-player-chip' + (isWinner ? ' winner' : '');

    // Count marked cells for this player (excluding FREE space)
    let markedCount = 0;
    if (gameState && gameState.marked && p.seat >= 0 && p.seat < gameState.marked.length) {
      const marked = gameState.marked[p.seat];
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          if (r === 2 && c === 2) continue; // skip FREE
          if (marked[r][c]) markedCount++;
        }
      }
    }

    if (isWinner) {
      chip.innerHTML = `<span class="tv-player-name">${escHtml(p.name)}</span> <span class="tv-player-bingo">BINGO!</span>`;
    } else {
      chip.innerHTML = `<span class="tv-player-name">${escHtml(p.name)}</span> <span class="tv-player-progress">${markedCount}/24</span>`;
    }
    playersStripEl.appendChild(chip);
  });
}

// ── Number animation ─────────────────────────────────────────────────────────
const COL_CLASSES = ['col-B', 'col-I', 'col-N', 'col-G', 'col-O'];

let overlayTimer = null;

function showCallOverlay(col, num) {
  // Reset state
  if (overlayTimer) { clearTimeout(overlayTimer); overlayTimer = null; }
  callOverlayEl.classList.remove('hidden', 'fade-out');
  callOverlayLetter.className = `tv-call-overlay-letter col-${col}`;
  callOverlayLetter.textContent = col;
  callOverlayNumber.textContent = num;
  // Force reflow so animation replays
  void callOverlayEl.offsetWidth;

  // Stay visible for 2s then fade out over 0.6s
  overlayTimer = setTimeout(() => {
    callOverlayEl.classList.add('fade-out');
    overlayTimer = setTimeout(() => {
      callOverlayEl.classList.add('hidden');
      callOverlayEl.classList.remove('fade-out');
    }, 600);
  }, 2000);
}

function setHeroNumber(col, num) {
  COL_CLASSES.forEach(c => {
    numberLetterEl.classList.remove(c);
    numberValueEl.classList.remove(c);
  });
  numberLetterEl.textContent = col;
  numberLetterEl.classList.add(`col-${col}`);
  numberValueEl.textContent = num;
  numberValueEl.classList.remove('pop');
  void numberValueEl.offsetWidth;
  numberValueEl.classList.add('pop');
}

function animateNumber(col, num) {
  showCallOverlay(col, num);
  setHeroNumber(col, num);
}

// ── Text-to-speech ───────────────────────────────────────────────────────────
let preferredVoice = null;

function loadVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  const preferred = [
    'Google UK English Female', 'Google US English', 'Samantha',
    'Karen', 'Daniel', 'Moira', 'Tessa',
  ];
  for (const name of preferred) {
    const v = voices.find(v => v.name === name);
    if (v) { preferredVoice = v; return; }
  }
  preferredVoice = voices.find(v => v.lang && v.lang.startsWith('en')) || null;
}

if ('speechSynthesis' in window) {
  loadVoice();
  window.speechSynthesis.onvoiceschanged = loadVoice;
}

function speakNumber(col, num) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(`${col}, ${num}`);
  if (preferredVoice) utterance.voice = preferredVoice;
  utterance.rate = 0.95;
  utterance.pitch = 1.05;
  utterance.volume = 1.0;
  window.speechSynthesis.speak(utterance);
}

// ── Countdown timer ──────────────────────────────────────────────────────────
const CIRCUMFERENCE = 2 * Math.PI * 45; // r=45 from SVG

function startCountdown() {
  resetCountdown();
}

function resetCountdown() {
  clearCountdown();
  let remaining = CALL_INTERVAL;
  countdownTextEl.textContent = remaining;
  countdownCircle.style.strokeDashoffset = '0';

  countdownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) remaining = 0;
    countdownTextEl.textContent = remaining;
    const progress = 1 - (remaining / CALL_INTERVAL);
    countdownCircle.style.strokeDashoffset = `${progress * CIRCUMFERENCE}`;
  }, 1000);
}

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

// ── TV Confetti ─────────────────────────────────────────────────────────────
function launchTvConfetti() {
  const container = document.getElementById('confettiContainer');
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = '';

  const colors = ['#ffd700', '#ff6b6b', '#4ecca3', '#1155cc', '#7d3c98', '#ff9f43', '#ee5a24', '#00d2d3'];
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

  // Clean up after animation
  setTimeout(() => {
    container.classList.add('hidden');
    container.innerHTML = '';
  }, 8000);
}

// ── TV Victory Sound (Web Audio API) ────────────────────────────────────────
function playTvVictorySound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Fanfare arpeggio: C5, E5, G5, C6 then full chord
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

    // Triumphant chord after arpeggio
    setTimeout(() => {
      const chord = [261.63, 329.63, 392.00, 523.25, 659.25]; // C4-E4-G4-C5-E5
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
    // Audio not available — silently fail
  }
}

// ── Speak winner name ───────────────────────────────────────────────────────
function speakWinner(winnerName) {
  if (!('speechSynthesis' in window) || !winnerName) return;
  setTimeout(() => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`Bingo! Congratulations ${winnerName}!`);
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 0.9;
    utterance.pitch = 1.15;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  }, 1500);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
